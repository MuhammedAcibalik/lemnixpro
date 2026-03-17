import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type { MainProfile } from "../../../infrastructure/db/schema";

import { MainProfileResponseDto } from "./dto/main-profile-response.dto";
import type { CreateMainProfileRequestDto } from "./dto/create-main-profile-request.dto";
import type { UpdateMainProfileRequestDto } from "./dto/update-main-profile-request.dto";
import {
  MainProfilesRepository,
  type CreateMainProfileRecord,
  type UpdateMainProfileRecord
} from "./main-profiles.repository";

const MAIN_PROFILE_CODE_UNIQUE_CONSTRAINT =
  "master_data_main_profiles_code_unique";
const MAIN_PROFILE_CODE_MAX_LENGTH = 100;
const MAIN_PROFILE_NAME_MAX_LENGTH = 200;
const LINKED_PRODUCT_CODE_MAX_LENGTH = 100;
const LINKED_PRODUCT_NAME_MAX_LENGTH = 200;
const MAIN_PROFILE_NOTES_MAX_LENGTH = 4000;

type DatabaseErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

@Injectable()
export class MainProfilesService {
  constructor(
    @Inject(MainProfilesRepository)
    private readonly mainProfilesRepository: MainProfilesRepository
  ) {}

  async create(
    request: CreateMainProfileRequestDto
  ): Promise<MainProfileResponseDto> {
    const createInput = this.toCreateRecord(request);

    await this.ensureCodeAvailable(createInput.code);

    try {
      const createdProfile = await this.mainProfilesRepository.create(createInput);

      return this.toResponse(createdProfile);
    } catch (error) {
      this.rethrowDuplicateCodeViolation(error, createInput.code);
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
    const updateInput = this.toUpdateRecord(request);

    if (Object.keys(updateInput).length === 0) {
      throw new BadRequestException(
        "At least one main profile field must be provided for update."
      );
    }

    if (updateInput.code && updateInput.code !== existingProfile.code) {
      await this.ensureCodeAvailable(updateInput.code);
    }

    try {
      const updatedProfile = await this.mainProfilesRepository.update(
        id,
        updateInput
      );

      if (!updatedProfile) {
        throw new NotFoundException(`Main profile "${id}" was not found.`);
      }

      return this.toResponse(updatedProfile);
    } catch (error) {
      this.rethrowDuplicateCodeViolation(
        error,
        updateInput.code ?? existingProfile.code
      );
      throw error;
    }
  }

  async activate(id: string): Promise<MainProfileResponseDto> {
    return this.setActiveState(id, true);
  }

  async deactivate(id: string): Promise<MainProfileResponseDto> {
    return this.setActiveState(id, false);
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

    return this.toResponse(updatedProfile);
  }

  private async getProfileOrThrow(id: string): Promise<MainProfile> {
    const profile = await this.mainProfilesRepository.findById(id);

    if (!profile) {
      throw new NotFoundException(`Main profile "${id}" was not found.`);
    }

    return profile;
  }

  private async ensureCodeAvailable(code: string): Promise<void> {
    const existingProfile = await this.mainProfilesRepository.findByCode(code);

    if (existingProfile) {
      throw new ConflictException(`Main profile code "${code}" already exists.`);
    }
  }

  private toCreateRecord(
    request: CreateMainProfileRequestDto
  ): CreateMainProfileRecord {
    return {
      code: this.normalizeRequiredText(request.code, "code", {
        maxLength: MAIN_PROFILE_CODE_MAX_LENGTH,
        uppercase: true
      }),
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
    request: UpdateMainProfileRequestDto
  ): UpdateMainProfileRecord {
    const updateInput: UpdateMainProfileRecord = {};

    if (request.code !== undefined) {
      updateInput.code = this.normalizeRequiredText(request.code, "code", {
        maxLength: MAIN_PROFILE_CODE_MAX_LENGTH,
        uppercase: true
      });
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
      isActive: profile.isActive,
      notes: profile.notes ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
  }

  private rethrowDuplicateCodeViolation(error: unknown, code: string): void {
    if (!this.isUniqueConstraintViolation(error)) {
      return;
    }

    throw new ConflictException(`Main profile code "${code}" already exists.`);
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    const databaseError = error as DatabaseErrorLike | undefined;

    return (
      databaseError?.code === "23505" &&
      databaseError.constraint === MAIN_PROFILE_CODE_UNIQUE_CONSTRAINT
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
