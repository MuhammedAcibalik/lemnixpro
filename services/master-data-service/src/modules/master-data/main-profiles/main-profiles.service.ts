import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";

import {
  cuttingCodeBelongsToProfile,
  type MainProfileImportInvalidReasonCount,
  type MainProfileImportInvalidRow,
  type MainProfileCuttingRealignmentResult,
  type MainProfileCuttingSpec
} from "@lemnixpro/shared-contracts";

import type {
  MainProfile,
  MainProfileImportBatch
} from "../../../infrastructure/db/schema";

import { MainProfileResponseDto } from "./dto/main-profile-response.dto";
import { MainProfileImportBatchResponseDto } from "./dto/main-profile-import-batch-response.dto";
import type { CreateMainProfileRequestDto } from "./dto/create-main-profile-request.dto";
import type { UpdateMainProfileRequestDto } from "./dto/update-main-profile-request.dto";
import {
  MAX_PROFILE_IMPORT_FILE_SIZE_BYTES,
  MainProfileImportParser,
  type NormalizedMainProfileImportRow
} from "./main-profile-import.parser";
import {
  MainProfilesRepository,
  type CreateMainProfileRecord,
  type UpdateMainProfileRecord
} from "./main-profiles.repository";

import { ProductionPlanCutListReconcileTriggerService } from "../../../infrastructure/integration/production-plan-cut-list-reconcile-trigger.service";

const MAIN_PROFILE_LINKED_PRODUCT_PROFILE_UNIQUE =
  "master_data_main_profiles_linked_product_profile_code_unique";
const MAIN_PROFILE_CODE_MAX_LENGTH = 100;
const MAIN_PROFILE_NAME_MAX_LENGTH = 200;
const LINKED_PRODUCT_CODE_MAX_LENGTH = 100;
const LINKED_PRODUCT_NAME_MAX_LENGTH = 200;
const MAIN_PROFILE_NOTES_MAX_LENGTH = 4000;
const CUTTING_CODE_MAX_LENGTH = 100;
const CUTTING_NAME_MAX_LENGTH = 200;
const UNIT_NAME_MAX_LENGTH = 50;

type DatabaseErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

export type UploadedMainProfileImportFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
  mimetype?: string;
};

@Injectable()
export class MainProfilesService {
  constructor(
    @Inject(MainProfilesRepository)
    private readonly mainProfilesRepository: MainProfilesRepository,
    @Inject(MainProfileImportParser)
    private readonly mainProfileImportParser: MainProfileImportParser,
    @Inject(ProductionPlanCutListReconcileTriggerService)
    private readonly productionPlanCutListReconcileTriggerService: ProductionPlanCutListReconcileTriggerService
  ) {}

  async createImport(
    file: UploadedMainProfileImportFile | undefined
  ): Promise<MainProfileImportBatchResponseDto> {
    const normalizedFile = this.validateAndNormalizeUpload(file);
    const parsedImport = this.mainProfileImportParser.parseWorkbook(
      normalizedFile.originalname,
      normalizedFile.buffer
    );
    const validRows = parsedImport.rows.filter((row) => row.isValid);
    const profileRecords = this.toImportedProfileRecords(validRows);

    if (profileRecords.length === 0) {
      throw new BadRequestException(
        "Profil dosyasında içeri aktarılabilecek geçerli profil satırı bulunamadı."
      );
    }

    try {
      const importedProfiles =
        await this.mainProfilesRepository.upsertImportedProfiles(profileRecords);
      const importedCuttingSpecCount = importedProfiles.reduce(
        (total, profile) => total + profile.cuttingSpecs.length,
        0
      );
      const batch = await this.mainProfilesRepository.createImportBatch({
        fileName: normalizedFile.originalname,
        sheetName: parsedImport.sheetName,
        totalRowCount: parsedImport.totalRowCount,
        validRowCount: parsedImport.validRowCount,
        invalidRowCount: parsedImport.invalidRowCount,
        importedProfileCount: importedProfiles.length,
        importedCuttingSpecCount
      });

      this.productionPlanCutListReconcileTriggerService.requestReconcileSoon();

      return this.toImportBatchResponse(batch, parsedImport.rows);
    } catch (error) {
      this.rethrowImportDatabaseError(error);
    }
  }

  private stringifyDbErrorDeep(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;
    let depth = 0;

    while (current instanceof Error && depth < 8) {
      parts.push(current.message);

      current = (
        current as Error & {
          cause?: unknown;
        }
      ).cause;

      depth += 1;
    }

    if (parts.length === 0) {
      return String(error);
    }

    return parts.join("\n").toLocaleLowerCase("en-US");
  }

  /** Veritabanı şeması eskiyse Postgres anlamlı bir hata verir; 500 yerine migration yönergesi dönmek için kullanılır. */
  private rethrowImportDatabaseError(error: unknown): never {
    const lowered = this.stringifyDbErrorDeep(error);

    if (
      lowered.includes(
        "no unique or exclusion constraint matching the on conflict"
      )
    ) {
      throw new UnprocessableEntityException(
        [
          `Veritabanında (ana ürün kodu × profil kodu) bileşik benzersiz indeksine uygun kısıt bulunamadı.`,
          `Bu ortamda master-data-service migration'ları uygulanmış olmalıdır (ör. ${MAIN_PROFILE_LINKED_PRODUCT_PROFILE_UNIQUE}).`
        ].join(" ")
      );
    }

    if (
      lowered.includes("cutting_specs") &&
      lowered.includes("does not exist")
    ) {
      throw new UnprocessableEntityException(
        "Profil tablosunda cutting_specs sütunu eksik. master-data-service migration'larını çalıştırın."
      );
    }

    if (
      lowered.includes("main_profile_import_batches") &&
      lowered.includes("does not exist")
    ) {
      throw new UnprocessableEntityException(
        "main_profile_import_batches tablosu bulunamadı. master-data-service migration'larını çalıştırın."
      );
    }

    throw error;
  }

  /**
   * Yanlış profile yazılmış kesim satırlarını, kesim koduna göre doğru profile taşır.
   * Yedek alındıktan sonra üretim ortamında bir kez çalıştırılmalıdır.
   */
  async realignMisplacedCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
    const profiles = await this.mainProfilesRepository.findAll();

    type Mutable = MainProfile & { cuttingSpecs: MainProfileCuttingSpec[] };
    const working: Mutable[] = profiles.map((p) => ({
      ...p,
      cuttingSpecs: [...p.cuttingSpecs]
    }));

    const modifiedProfileIds = new Set<string>();
    let cuttingSpecsMoved = 0;
    let duplicatesSkipped = 0;
    const unresolved: MainProfileCuttingRealignmentResult["unresolved"] = [];

    const findOwner = (
      spec: MainProfileCuttingSpec,
      linkedProductCode: string
    ): Mutable | null =>
      working.find(
        (p) =>
          p.linkedProductCode.trim().toUpperCase() ===
            linkedProductCode.trim().toUpperCase() &&
          cuttingCodeBelongsToProfile(p.code, spec.cuttingCode)
      ) ?? null;

    const pending: Array<{ from: Mutable; spec: MainProfileCuttingSpec }> = [];

    for (const profile of working) {
      const kept: MainProfileCuttingSpec[] = [];
      for (const spec of profile.cuttingSpecs) {
        if (cuttingCodeBelongsToProfile(profile.code, spec.cuttingCode)) {
          kept.push(spec);
        } else {
          pending.push({ from: profile, spec });
        }
      }
      if (kept.length !== profile.cuttingSpecs.length) {
        profile.cuttingSpecs = kept;
        modifiedProfileIds.add(profile.id);
      }
    }

    for (const { from, spec } of pending) {
      const owner = findOwner(spec, from.linkedProductCode);
      if (!owner) {
        unresolved.push({
          profileCode: from.code,
          cuttingCode: spec.cuttingCode,
          reason: "NO_OWNER_PROFILE"
        });
        from.cuttingSpecs.push(spec);
        modifiedProfileIds.add(from.id);
        continue;
      }

      if (owner.cuttingSpecs.some((s) => s.cuttingCode === spec.cuttingCode)) {
        duplicatesSkipped += 1;
        continue;
      }

      owner.cuttingSpecs.push(spec);
      cuttingSpecsMoved += 1;
      modifiedProfileIds.add(owner.id);
      modifiedProfileIds.add(from.id);
    }

    let profilesUpdated = 0;

    for (const id of modifiedProfileIds) {
      const next = working.find((p) => p.id === id);
      if (!next) {
        continue;
      }

      await this.mainProfilesRepository.update(id, {
        cuttingSpecs: next.cuttingSpecs
      });
      profilesUpdated += 1;
    }

    if (profilesUpdated > 0) {
      this.productionPlanCutListReconcileTriggerService.requestReconcileSoon();
    }

    return {
      profilesUpdated,
      cuttingSpecsMoved,
      duplicatesSkipped,
      unresolved
    };
  }

  async create(
    request: CreateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    const createInput = this.toCreateRecord(request);

    await this.ensureLinkedProductProfilePairAvailable(
      createInput.linkedProductCode,
      createInput.code
    );

    try {
      const createdProfile = await this.mainProfilesRepository.create(createInput);

      this.productionPlanCutListReconcileTriggerService.requestReconcileSoon();

      return this.toResponse(createdProfile);
    } catch (error) {
      this.rethrowDuplicateProfilePairViolation(error);
      throw error;
    }
  }

  async findAll(): Promise<MainProfileResponseDto[]> {
    const profiles = await this.mainProfilesRepository.findAll();

    return profiles.map((profile) => this.toResponse(profile));
  }

  async findById(id: string): Promise<MainProfileResponseDto> {
    const profile = await this.getProfileOrThrow(id);

    return this.toResponse(profile);
  }

  async update(
    id: string,
    request: UpdateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    const existingProfile = await this.getProfileOrThrow(id);
    const updateInput = this.toUpdateRecord(request, existingProfile);

    if (Object.keys(updateInput).length === 0) {
      throw new BadRequestException(
        "At least one main profile field must be provided for update."
      );
    }

    if (updateInput.code !== undefined || updateInput.linkedProductCode !== undefined) {
      const nextCode = updateInput.code ?? existingProfile.code;
      const nextLinked = updateInput.linkedProductCode ?? existingProfile.linkedProductCode;
      const conflictingProfile =
        await this.mainProfilesRepository.findByLinkedProductAndCode(
          nextLinked,
          nextCode
        );

      if (conflictingProfile && conflictingProfile.id !== id) {
        throw new ConflictException(
          `Bu ana ürün ve profil kodu için zaten bir kayıt var: "${nextLinked}" + "${nextCode}".`
        );
      }
    }

    try {
      const updatedProfile = await this.mainProfilesRepository.update(
        id,
        updateInput
      );

      if (!updatedProfile) {
        throw new NotFoundException(`Main profile "${id}" was not found.`);
      }

      this.productionPlanCutListReconcileTriggerService.requestReconcileSoon();

      return this.toResponse(updatedProfile);
    } catch (error) {
      this.rethrowDuplicateProfilePairViolation(error);
      throw error;
    }
  }

  async activate(id: string): Promise<MainProfileResponseDto> {
    return this.setActiveState(id, true);
  }

  async deactivate(id: string): Promise<MainProfileResponseDto> {
    return this.setActiveState(id, false);
  }

  private validateAndNormalizeUpload(
    file: UploadedMainProfileImportFile | undefined
  ): UploadedMainProfileImportFile {
    if (!file) {
      throw new BadRequestException("Profil Yönetimi için .xlsx dosyası yükleyin.");
    }

    const normalizedFileName = path.basename(file.originalname).trim();

    if (normalizedFileName === "") {
      throw new BadRequestException("Yüklenen dosya adı geçersiz.");
    }

    if (path.extname(normalizedFileName).toLowerCase() !== ".xlsx") {
      throw new BadRequestException(
        "Profil Yönetimi importu yalnızca .xlsx dosyalarını destekler."
      );
    }

    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.size === 0) {
      throw new BadRequestException("Yüklenen profil dosyası boş.");
    }

    if (file.size > MAX_PROFILE_IMPORT_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Profil dosyası ${MAX_PROFILE_IMPORT_FILE_SIZE_BYTES} byte sınırını aşıyor.`
      );
    }

    return {
      ...file,
      originalname: normalizedFileName
    };
  }

  private toImportedProfileRecords(
    rows: NormalizedMainProfileImportRow[]
  ): CreateMainProfileRecord[] {
    const profilesByCompositeKey = new Map<string, CreateMainProfileRecord>();
    const profileMetadataByCompositeKey = this.buildImportProfileMetadata(rows);

    for (const row of rows) {
      if (
        !row.productCode ||
        !row.productName ||
        !row.profileCode ||
        !row.profileName ||
        !row.cuttingCode ||
        !row.cuttingName ||
        row.cuttingLengthMm === null ||
        !row.unitName ||
        row.unitQuantity === null ||
        row.stockLengthMm === null
      ) {
        continue;
      }

      const linkedProductCode = row.productCode.trim().toUpperCase();
      const declaredProfileCode = row.profileCode.trim().toUpperCase();
      const cuttingCode = row.cuttingCode.trim().toUpperCase();
      const profileCode = this.resolveImportCuttingOwnerProfileCode({
        cuttingCode,
        declaredProfileCode,
        linkedProductCode,
        profileMetadataByCompositeKey
      });
      const profileMetadata =
        profileMetadataByCompositeKey.get(
          this.toImportCompositeKey(linkedProductCode, profileCode)
        ) ?? {
          code: profileCode,
          name: row.profileName.trim(),
          stockLengthMm: row.stockLengthMm,
          linkedProductCode,
          linkedProductName: row.productName.trim(),
          isActive: true,
          notes: row.mainProfileMarker
            ? `Ana profil: ${row.mainProfileMarker.trim()}`
            : null
        };
      const compositeKey = `${linkedProductCode}\u001F${profileCode}`;

      const existingProfile = profilesByCompositeKey.get(compositeKey);
      const cuttingSpec: MainProfileCuttingSpec = {
        id: randomUUID(),
        cuttingCode,
        cuttingName: row.cuttingName.trim(),
        cuttingLengthMm: row.cuttingLengthMm,
        unitName: row.unitName.trim(),
        unitQuantity: row.unitQuantity
      };

      if (!existingProfile) {
        profilesByCompositeKey.set(compositeKey, {
          code: profileMetadata.code,
          name: profileMetadata.name,
          stockLengthMm: profileMetadata.stockLengthMm,
          linkedProductCode: profileMetadata.linkedProductCode,
          linkedProductName: profileMetadata.linkedProductName,
          cuttingSpecs: [cuttingSpec],
          isActive: profileMetadata.isActive,
          notes: profileMetadata.notes
        });
        continue;
      }

      const hasCuttingSpec = existingProfile.cuttingSpecs.some(
        (spec) => spec.cuttingCode === cuttingSpec.cuttingCode
      );

      if (!hasCuttingSpec) {
        existingProfile.cuttingSpecs.push(cuttingSpec);
      }
    }

    return [...profilesByCompositeKey.values()];
  }

  private buildImportProfileMetadata(
    rows: NormalizedMainProfileImportRow[]
  ): Map<string, CreateMainProfileRecord> {
    const metadata = new Map<string, CreateMainProfileRecord>();

    for (const row of rows) {
      if (
        !row.productCode ||
        !row.productName ||
        !row.profileCode ||
        !row.profileName ||
        row.stockLengthMm === null
      ) {
        continue;
      }

      const linkedProductCode = row.productCode.trim().toUpperCase();
      const profileCode = row.profileCode.trim().toUpperCase();
      const compositeKey = this.toImportCompositeKey(
        linkedProductCode,
        profileCode
      );

      if (metadata.has(compositeKey)) {
        continue;
      }

      metadata.set(compositeKey, {
        code: profileCode,
        name: row.profileName.trim(),
        stockLengthMm: row.stockLengthMm,
        linkedProductCode,
        linkedProductName: row.productName.trim(),
        cuttingSpecs: [],
        isActive: true,
        notes: row.mainProfileMarker
          ? `Ana profil: ${row.mainProfileMarker.trim()}`
          : null
      });
    }

    return metadata;
  }

  private resolveImportCuttingOwnerProfileCode(input: {
    cuttingCode: string;
    declaredProfileCode: string;
    linkedProductCode: string;
    profileMetadataByCompositeKey: Map<string, CreateMainProfileRecord>;
  }): string {
    if (
      cuttingCodeBelongsToProfile(
        input.declaredProfileCode,
        input.cuttingCode
      )
    ) {
      return input.declaredProfileCode;
    }

    const ownerProfileCode = this.extractProfileCodeFromCuttingCode(
      input.cuttingCode
    );

    if (
      ownerProfileCode &&
      input.profileMetadataByCompositeKey.has(
        this.toImportCompositeKey(input.linkedProductCode, ownerProfileCode)
      )
    ) {
      return ownerProfileCode;
    }

    return ownerProfileCode ?? input.declaredProfileCode;
  }

  private extractProfileCodeFromCuttingCode(cuttingCode: string): string | null {
    const normalized = cuttingCode.trim().toUpperCase();
    const [profileCode] = normalized.split("-");

    return profileCode && profileCode !== normalized ? profileCode : null;
  }

  private toImportCompositeKey(
    linkedProductCode: string,
    profileCode: string
  ): string {
    return `${linkedProductCode}\u001F${profileCode}`;
  }

  private async setActiveState(
    id: string,
    isActive: boolean
  ): Promise<MainProfileResponseDto> {
    const existingProfile = await this.getProfileOrThrow(id);

    if (existingProfile.isActive === isActive) {
      return this.toResponse(existingProfile);
    }

    const updatedProfile = await this.mainProfilesRepository.update(id, {
      isActive
    });

    if (!updatedProfile) {
      throw new NotFoundException(`Main profile "${id}" was not found.`);
    }

    this.productionPlanCutListReconcileTriggerService.requestReconcileSoon();

    return this.toResponse(updatedProfile);
  }

  private async getProfileOrThrow(id: string): Promise<MainProfile> {
    const profile = await this.mainProfilesRepository.findById(id);

    if (!profile) {
      throw new NotFoundException(`Main profile "${id}" was not found.`);
    }

    return profile;
  }

  private async ensureLinkedProductProfilePairAvailable(
    linkedProductCode: string,
    profileCode: string
  ): Promise<void> {
    const existingProfile =
      await this.mainProfilesRepository.findByLinkedProductAndCode(
        linkedProductCode,
        profileCode
      );

    if (existingProfile) {
      throw new ConflictException(
        `Bu ana ürün ve profil kodu için zaten bir kayıt var: "${linkedProductCode}" + "${profileCode}".`
      );
    }
  }

  private toCreateRecord(
    request: CreateMainProfileRequestDto
  ): CreateMainProfileRecord {
    const code = this.normalizeRequiredText(request.code, "code", {
      maxLength: MAIN_PROFILE_CODE_MAX_LENGTH,
      uppercase: true
    });

    return {
      code,
      name: this.normalizeRequiredText(request.name, "name", {
        maxLength: MAIN_PROFILE_NAME_MAX_LENGTH
      }),
      stockLengthMm: this.normalizePositiveInteger(
        request.stockLengthMm,
        "stockLengthMm"
      ),
      linkedProductCode: this.normalizeRequiredText(
        request.linkedProductCode,
        "linkedProductCode",
        {
          maxLength: LINKED_PRODUCT_CODE_MAX_LENGTH,
          uppercase: true
        }
      ),
      linkedProductName: this.normalizeRequiredText(
        request.linkedProductName,
        "linkedProductName",
        {
          maxLength: LINKED_PRODUCT_NAME_MAX_LENGTH
        }
      ),
      cuttingSpecs: this.normalizeCuttingSpecs(request.cuttingSpecs ?? [], code),
      isActive: this.normalizeOptionalBoolean(request.isActive, "isActive") ?? true,
      notes:
        this.normalizeOptionalText(
          request.notes,
          "notes",
          MAIN_PROFILE_NOTES_MAX_LENGTH
        ) ?? null
    };
  }

  private toUpdateRecord(
    request: UpdateMainProfileRequestDto,
    existingProfile: MainProfile
  ): UpdateMainProfileRecord {
    const effectiveProfileCode =
      request.code !== undefined
        ? this.normalizeRequiredText(request.code, "code", {
            maxLength: MAIN_PROFILE_CODE_MAX_LENGTH,
            uppercase: true
          })
        : existingProfile.code;

    const updateInput: UpdateMainProfileRecord = {};

    if (request.code !== undefined) {
      updateInput.code = effectiveProfileCode;
    }

    if (request.name !== undefined) {
      updateInput.name = this.normalizeRequiredText(request.name, "name", {
        maxLength: MAIN_PROFILE_NAME_MAX_LENGTH
      });
    }

    if (request.stockLengthMm !== undefined) {
      updateInput.stockLengthMm = this.normalizePositiveInteger(
        request.stockLengthMm,
        "stockLengthMm"
      );
    }

    if (request.linkedProductCode !== undefined) {
      updateInput.linkedProductCode = this.normalizeRequiredText(
        request.linkedProductCode,
        "linkedProductCode",
        {
          maxLength: LINKED_PRODUCT_CODE_MAX_LENGTH,
          uppercase: true
        }
      );
    }

    if (request.linkedProductName !== undefined) {
      updateInput.linkedProductName = this.normalizeRequiredText(
        request.linkedProductName,
        "linkedProductName",
        {
          maxLength: LINKED_PRODUCT_NAME_MAX_LENGTH
        }
      );
    }

    if (request.cuttingSpecs !== undefined) {
      updateInput.cuttingSpecs = this.normalizeCuttingSpecs(
        request.cuttingSpecs,
        effectiveProfileCode
      );
    }

    if (request.isActive !== undefined) {
      const isActive = this.normalizeOptionalBoolean(
        request.isActive,
        "isActive"
      );

      if (isActive !== undefined) {
        updateInput.isActive = isActive;
      }
    }

    if (request.notes !== undefined) {
      updateInput.notes = this.normalizeOptionalText(
        request.notes,
        "notes",
        MAIN_PROFILE_NOTES_MAX_LENGTH
      );
    }

    return updateInput;
  }

  private toResponse(profile: MainProfile): MainProfileResponseDto {
    return {
      id: profile.id,
      code: profile.code,
      name: profile.name,
      stockLengthMm: profile.stockLengthMm,
      linkedProductCode: profile.linkedProductCode,
      linkedProductName: profile.linkedProductName,
      cuttingSpecs: profile.cuttingSpecs,
      isActive: profile.isActive,
      notes: profile.notes ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }

  private toImportBatchResponse(
    batch: MainProfileImportBatch,
    rows?: NormalizedMainProfileImportRow[]
  ): MainProfileImportBatchResponseDto {
    const invalidRows = rows ? this.toInvalidImportRows(rows) : undefined;
    const invalidReasonCounts = rows
      ? this.toInvalidReasonCounts(rows)
      : undefined;

    return {
      id: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      totalRowCount: batch.totalRowCount,
      validRowCount: batch.validRowCount,
      invalidRowCount: batch.invalidRowCount,
      importedProfileCount: batch.importedProfileCount,
      importedCuttingSpecCount: batch.importedCuttingSpecCount,
      createdAt: batch.createdAt,
      ...(invalidRows && invalidRows.length > 0 ? { invalidRows } : {}),
      ...(invalidReasonCounts && invalidReasonCounts.length > 0
        ? { invalidReasonCounts }
        : {})
    };
  }

  private toInvalidImportRows(
    rows: NormalizedMainProfileImportRow[]
  ): MainProfileImportInvalidRow[] {
    return rows
      .filter((row) => !row.isValid)
      .slice(0, 25)
      .map((row) => ({
        rowIndex: row.rowIndex,
        productCode: row.productCode,
        profileCode: row.profileCode,
        cuttingCode: row.cuttingCode,
        validationErrors: row.validationErrors
      }));
  }

  private toInvalidReasonCounts(
    rows: NormalizedMainProfileImportRow[]
  ): MainProfileImportInvalidReasonCount[] {
    const counts = new Map<string, number>();

    for (const row of rows) {
      if (row.isValid) {
        continue;
      }

      for (const error of row.validationErrors) {
        counts.set(error, (counts.get(error) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count);
  }

  private normalizeCuttingSpecs(
    value: unknown,
    profileCode: string
  ): MainProfileCuttingSpec[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException("cuttingSpecs must be an array.");
    }

    const seenCuttingCodes = new Set<string>();
    const profile = profileCode.trim().toUpperCase();

    return value.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new BadRequestException(
          `cuttingSpecs[${index}] must be an object.`
        );
      }

      const candidate = entry as Record<string, unknown>;
      const cuttingCode = this.normalizeRequiredText(
        candidate.cuttingCode,
        `cuttingSpecs[${index}].cuttingCode`,
        {
          maxLength: CUTTING_CODE_MAX_LENGTH,
          uppercase: true
        }
      );

      if (!cuttingCodeBelongsToProfile(profile, cuttingCode)) {
        throw new BadRequestException(
          `cuttingSpecs[${index}].cuttingCode must belong to profile "${profile}" (same code as the profile or PROFILECODE-…).`
        );
      }

      if (seenCuttingCodes.has(cuttingCode)) {
        throw new BadRequestException(
          `cuttingSpecs[${index}].cuttingCode must be unique within one profile.`
        );
      }

      seenCuttingCodes.add(cuttingCode);

      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim() !== ""
            ? candidate.id.trim()
            : randomUUID(),
        cuttingCode,
        cuttingName: this.normalizeRequiredText(
          candidate.cuttingName,
          `cuttingSpecs[${index}].cuttingName`,
          {
            maxLength: CUTTING_NAME_MAX_LENGTH
          }
        ),
        cuttingLengthMm: this.normalizePositiveInteger(
          candidate.cuttingLengthMm,
          `cuttingSpecs[${index}].cuttingLengthMm`
        ),
        unitQuantity: this.normalizePositiveNumber(
          candidate.unitQuantity,
          `cuttingSpecs[${index}].unitQuantity`
        ),
        unitName: this.normalizeRequiredText(
          candidate.unitName,
          `cuttingSpecs[${index}].unitName`,
          {
            maxLength: UNIT_NAME_MAX_LENGTH
          }
        )
      };
    });
  }

  private rethrowDuplicateProfilePairViolation(error: unknown): void {
    if (!this.isUniqueConstraintViolation(error)) {
      return;
    }

    throw new ConflictException(
      "Bu ana ürün için aynı profil koduyla zaten bir ana profil kaydı var."
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    const databaseError = error as DatabaseErrorLike | undefined;

    return (
      databaseError?.code === "23505" &&
      databaseError?.constraint === MAIN_PROFILE_LINKED_PRODUCT_PROFILE_UNIQUE
    );
  }

  private normalizeRequiredText(
    value: unknown,
    fieldName: string,
    options: {
      maxLength: number;
      uppercase?: boolean;
    }
  ): string {
    if (typeof value !== "string") {
      throw new BadRequestException(`${fieldName} must be a string.`);
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    if (normalizedValue.length > options.maxLength) {
      throw new BadRequestException(
        `${fieldName} must be at most ${options.maxLength} characters.`
      );
    }

    return options.uppercase ? normalizedValue.toUpperCase() : normalizedValue;
  }

  private normalizeOptionalText(
    value: unknown,
    fieldName: string,
    maxLength: number
  ): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== "string") {
      throw new BadRequestException(`${fieldName} must be a string.`);
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      return null;
    }

    if (normalizedValue.length > maxLength) {
      throw new BadRequestException(
        `${fieldName} must be at most ${maxLength} characters.`
      );
    }

    return normalizedValue;
  }

  private normalizePositiveInteger(value: unknown, fieldName: string): number {
    const parsedValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException(
        `${fieldName} must be a positive integer.`
      );
    }

    return parsedValue;
  }

  private normalizePositiveNumber(value: unknown, fieldName: string): number {
    const parsedValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      throw new BadRequestException(
        `${fieldName} must be a positive number.`
      );
    }

    return Number(parsedValue.toFixed(3));
  }

  private normalizeOptionalBoolean(
    value: unknown,
    fieldName: string
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();

      if (normalizedValue === "true") {
        return true;
      }

      if (normalizedValue === "false") {
        return false;
      }
    }

    throw new BadRequestException(`${fieldName} must be a boolean.`);
  }
}
