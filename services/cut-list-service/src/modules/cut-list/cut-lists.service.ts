import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  CutListCuttingLine,
  CutListProductItem,
  CutListSnapshotDetail,
  CutListSnapshotSummary,
  CutListUnmatchedReasonCode,
  CutListUnmatchedRow,
  MainProfileCuttingSpec,
  ProductionPlanActiveBatchRow,
  ProductionPlanBatchActivatedEvent,
  ProductionPlanBatchCutListReconcileEvent
} from "@lemnixpro/shared-contracts";

import type { CutListSnapshotRecord } from "../../infrastructure/db/schema";
import type { MainProfileResponse } from "../../infrastructure/http/master-data.client";
import { MasterDataClient } from "../../infrastructure/http/master-data.client";
import { ProductionPlanClient } from "../../infrastructure/http/production-plan.client";

import { CutListsRepository } from "./cut-lists.repository";

const DEFAULT_MATERIAL_SIZE = "GENEL";

type CutListBuildResult = {
  planYear: number;
  weekNumber: number;
  sourceBatchId: string;
  items: CutListProductItem[];
  unmatchedRows: CutListUnmatchedRow[];
  totalProductionRows: number;
};

@Injectable()
export class CutListsService {
  constructor(
    @Inject(ProductionPlanClient)
    private readonly productionPlanClient: ProductionPlanClient,
    @Inject(MasterDataClient)
    private readonly masterDataClient: MasterDataClient,
    @Inject(CutListsRepository)
    private readonly cutListsRepository: CutListsRepository
  ) {}

  async createSnapshot(weekNumber: number): Promise<CutListSnapshotDetail> {
    const buildResult = await this.buildCutList(weekNumber);

    return this.persistBuildResult(buildResult);
  }

  async createSnapshotForActivatedBatch(
    event: ProductionPlanBatchActivatedEvent
  ): Promise<CutListSnapshotDetail> {
    const existingSnapshot = await this.cutListsRepository.findBySourceBatchId(
      event.sourceBatchId
    );

    if (existingSnapshot) {
      return this.toDetail(existingSnapshot);
    }

    return this.createSnapshotFromBuildResult(
      await this.buildCutListFromBatchId(
        event.sourceBatchId,
        event.planYear,
        event.weekNumber
      )
    );
  }

  async refreshSnapshotForCutListReconcile(
    event: ProductionPlanBatchCutListReconcileEvent
  ): Promise<CutListSnapshotDetail> {
    const buildResult = await this.buildCutListFromBatchId(
      event.sourceBatchId,
      event.planYear,
      event.weekNumber
    );

    return this.persistBuildResult(buildResult);
  }

  async findAll(): Promise<CutListSnapshotSummary[]> {
    const snapshots = await this.cutListsRepository.findAll();

    return snapshots.map((snapshot) => this.toSummary(snapshot));
  }

  async findById(id: string): Promise<CutListSnapshotDetail> {
    const snapshot = await this.cutListsRepository.findById(id);

    if (!snapshot) {
      throw new NotFoundException(`Kesim listesi snapshot "${id}" bulunamadı.`);
    }

    return this.toDetail(snapshot);
  }

  async findLatestByWeekNumber(weekNumber: number): Promise<CutListSnapshotDetail> {
    const snapshot = await this.cutListsRepository.findLatestByWeekNumber(
      weekNumber
    );

    if (!snapshot) {
      throw new NotFoundException(
        `${weekNumber}. hafta için kesim listesi snapshot bulunamadı.`
      );
    }

    return this.toDetail(snapshot);
  }

  async findLatestByPlanYearAndWeekNumber(
    planYear: number,
    weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    const snapshot =
      await this.cutListsRepository.findLatestByPlanYearAndWeekNumber(
        planYear,
        weekNumber
      );

    if (!snapshot) {
      throw new NotFoundException(
        `${planYear} yılı ${weekNumber}. hafta için kesim listesi snapshot bulunamadı.`
      );
    }

    return this.toDetail(snapshot);
  }

  private async createSnapshotFromBuildResult(
    buildResult: CutListBuildResult
  ): Promise<CutListSnapshotDetail> {
    const summary: Omit<CutListSnapshotSummary, "id" | "createdAt"> = {
      planYear: buildResult.planYear,
      weekNumber: buildResult.weekNumber,
      sourceBatchId: buildResult.sourceBatchId,
      status: "created",
      totalProductionRows: buildResult.totalProductionRows,
      matchedProductionRows: buildResult.items.length,
      unmatchedProductionRows: buildResult.unmatchedRows.length,
      totalCuttingLines: buildResult.items.reduce(
        (total, item) => total + item.cuttingLines.length,
        0
      )
    };
    const createdSnapshot = await this.cutListsRepository.create({
      planYear: buildResult.planYear,
      weekNumber: buildResult.weekNumber,
      sourceBatchId: buildResult.sourceBatchId,
      summary,
      payloadJson: {
        snapshot: {
          ...summary,
          id: "pending",
          createdAt: new Date(0).toISOString()
        },
        items: buildResult.items,
        unmatchedRows: buildResult.unmatchedRows
      }
    });

    return this.toDetail(createdSnapshot);
  }

  /**
   * Inserts or updates the snapshot keyed by {@link CutListBuildResult.sourceBatchId}.
   * Weekly manual/API builds and reconcile events share this path so counts stay fresh.
   */
  private async persistBuildResult(
    buildResult: CutListBuildResult
  ): Promise<CutListSnapshotDetail> {
    const existingSnapshot = await this.cutListsRepository.findBySourceBatchId(
      buildResult.sourceBatchId
    );

    if (!existingSnapshot) {
      return this.createSnapshotFromBuildResult(buildResult);
    }

    const totalCuttingLines = buildResult.items.reduce(
      (total, item) => total + item.cuttingLines.length,
      0
    );

    const summaryBlock: Omit<CutListSnapshotSummary, "id" | "createdAt"> = {
      planYear: buildResult.planYear,
      weekNumber: buildResult.weekNumber,
      sourceBatchId: buildResult.sourceBatchId,
      status: "created",
      totalProductionRows: buildResult.totalProductionRows,
      matchedProductionRows: buildResult.items.length,
      unmatchedProductionRows: buildResult.unmatchedRows.length,
      totalCuttingLines
    };

    const payloadJson: CutListSnapshotDetail = {
      snapshot: {
        ...summaryBlock,
        id: existingSnapshot.id,
        createdAt: existingSnapshot.createdAt
      },
      items: buildResult.items,
      unmatchedRows: buildResult.unmatchedRows
    };

    const updatedRecord = await this.cutListsRepository.updateBySourceBatchId(
      buildResult.sourceBatchId,
      {
        planYear: buildResult.planYear,
        weekNumber: buildResult.weekNumber,
        payloadJson,
        totalProductionRows: summaryBlock.totalProductionRows,
        matchedProductionRows: summaryBlock.matchedProductionRows,
        unmatchedProductionRows: summaryBlock.unmatchedProductionRows,
        totalCuttingLines: summaryBlock.totalCuttingLines
      }
    );

    if (!updatedRecord) {
      return this.createSnapshotFromBuildResult(buildResult);
    }

    return this.toDetail(updatedRecord);
  }

  private async buildCutList(weekNumber: number): Promise<CutListBuildResult> {
    const [activeBatchRows, mainProfiles] = await Promise.all([
      this.productionPlanClient.getActiveBatchRowsByWeekNumber(weekNumber),
      this.masterDataClient.getMainProfiles()
    ]);

    return this.buildCutListFromRows(
      activeBatchRows.batch.id,
      activeBatchRows.batch.planYear,
      weekNumber,
      activeBatchRows.rows,
      mainProfiles
    );
  }

  private async buildCutListFromBatchId(
    sourceBatchId: string,
    planYear: number,
    weekNumber: number
  ): Promise<CutListBuildResult> {
    const [rows, mainProfiles] = await Promise.all([
      this.productionPlanClient.getRowsByBatchId(sourceBatchId),
      this.masterDataClient.getMainProfiles()
    ]);

    return this.buildCutListFromRows(
      sourceBatchId,
      planYear,
      weekNumber,
      rows,
      mainProfiles
    );
  }

  private buildCutListFromRows(
    sourceBatchId: string,
    planYear: number | null,
    weekNumber: number,
    rows: ProductionPlanActiveBatchRow[],
    mainProfiles: MainProfileResponse[]
  ): CutListBuildResult {
    if (planYear === null) {
      throw new Error(
        `Production plan batch "${sourceBatchId}" cannot generate a cut list without planYear.`
      );
    }

    const activeProfilesByProductCode = this.groupActiveProfilesByProductCode(
      mainProfiles
    );
    const items: CutListProductItem[] = [];
    const unmatchedRows: CutListUnmatchedRow[] = [];

    for (const row of rows) {
      const normalizedMaterialCode = this.normalizeCode(row.materialCode);
      const matchingProfiles = normalizedMaterialCode
        ? activeProfilesByProductCode.get(normalizedMaterialCode) ?? []
        : [];

      const derivedMaterialSize = this.resolveMaterialSize(row);
      const rowForMatching: ProductionPlanActiveBatchRow =
        row.materialSize !== derivedMaterialSize
          ? { ...row, materialSize: derivedMaterialSize }
          : row;

      if (
        !rowForMatching.isValid ||
        !normalizedMaterialCode ||
        rowForMatching.quantity === null
      ) {
        unmatchedRows.push(
          this.toUnmatchedRow(row, ["production_row_invalid"], [
            "Üretim planı satırı geçersiz."
          ])
        );
        continue;
      }

      if (!rowForMatching.materialColor) {
        unmatchedRows.push(
          this.toUnmatchedRow(row, ["missing_color"], [
            "Malzeme kısa metninden güvenli renk kodu çıkarılamadı."
          ])
        );
        continue;
      }

      if (matchingProfiles.length === 0) {
        unmatchedRows.push(
          this.toUnmatchedRow(row, ["missing_product_code"], [
            `Malzeme kodu "${row.materialCode}" için aktif profil bulunamadı.`
          ])
        );
        continue;
      }

      let candidateProfiles = matchingProfiles;
      const rowProfileCode = this.normalizeCode(row.mainProfileCode);

      if (rowProfileCode !== null) {
        const narrowedByProfileCode = matchingProfiles.filter(
          (profile) => this.normalizeCode(profile.code) === rowProfileCode
        );

        if (narrowedByProfileCode.length > 0) {
          candidateProfiles = narrowedByProfileCode;
        }
      }

      let nameMatchedProfiles = candidateProfiles.filter((profile) =>
        this.isLinkedProductNameMatch(
          rowForMatching.materialName,
          profile.linkedProductName
        )
      );

      /**
       * SAP "malzeme kısa metni" is often much longer than `linkedProductName`.
       * When exactly one profile remains for this material code (or after profil kodu
       * daraltması), accept it without strict name equality—multi-profile codes still
       * require a name match or explicit `mainProfileCode` on the row.
       */
      if (nameMatchedProfiles.length === 0 && candidateProfiles.length === 1) {
        nameMatchedProfiles = candidateProfiles;
      }

      if (nameMatchedProfiles.length === 0) {
        unmatchedRows.push(
          this.toUnmatchedRow(row, ["missing_product_name_match"], [
            `Malzeme adı "${row.materialName ?? ""}" ürün adıyla güvenli eşleşmedi (bu malzeme kodu için ${candidateProfiles.length} profil var; profil kodu veya ürün adı eşlemesi gerekir).`
          ])
        );
        continue;
      }

      const cuttingLines = nameMatchedProfiles.flatMap((profile) =>
        profile.cuttingSpecs.map((spec) =>
          this.toCuttingLine(profile, spec, rowForMatching.quantity ?? 0)
        )
      );

      if (cuttingLines.length === 0) {
        unmatchedRows.push(
          this.toUnmatchedRow(row, ["missing_cutting_specs"], [
            `Malzeme kodu "${row.materialCode}" için kesim tanımı bulunamadı.`
          ])
        );
        continue;
      }

      items.push(this.toProductItem(rowForMatching, cuttingLines));
    }

    return {
      planYear,
      weekNumber,
      sourceBatchId,
      items,
      unmatchedRows,
      totalProductionRows: rows.length
    };
  }

  private groupActiveProfilesByProductCode(
    profiles: MainProfileResponse[]
  ): Map<string, MainProfileResponse[]> {
    const profilesByProductCode = new Map<string, MainProfileResponse[]>();

    for (const profile of profiles) {
      if (!profile.isActive) {
        continue;
      }

      const productCode = this.normalizeCode(profile.linkedProductCode);

      if (!productCode) {
        continue;
      }

      const existingProfiles = profilesByProductCode.get(productCode) ?? [];
      existingProfiles.push(profile);
      profilesByProductCode.set(productCode, existingProfiles);
    }

    return profilesByProductCode;
  }

  private toCuttingLine(
    profile: MainProfileResponse,
    spec: MainProfileCuttingSpec,
    orderQuantity: number
  ): CutListCuttingLine {
    return {
      profileCode: profile.code,
      profileName: profile.name,
      stockLengthMm: profile.stockLengthMm,
      cuttingCode: spec.cuttingCode,
      cuttingName: spec.cuttingName,
      cuttingLengthMm: spec.cuttingLengthMm,
      unitName: spec.unitName,
      unitQuantity: spec.unitQuantity,
      orderQuantity,
      cuttingQuantity: Number((spec.unitQuantity * orderQuantity).toFixed(3))
    };
  }

  private toProductItem(
    row: ProductionPlanActiveBatchRow,
    cuttingLines: CutListCuttingLine[]
  ): CutListProductItem {
    if (
      !row.materialCode ||
      row.quantity === null ||
      !row.materialColor ||
      !row.materialSize
    ) {
      throw new Error(`Kesim listesi satırı "${row.id}" geçersiz.`);
    }

    return {
      productionRowId: row.id,
      rowIndex: row.rowIndex,
      workOrderNumber: row.workOrderNumber,
      materialCode: row.materialCode,
      materialName: row.materialName,
      materialColor: row.materialColor,
      materialSize: row.materialSize,
      orderQuantity: row.quantity,
      orderUnit: row.orderUnit,
      plannedFinishDate: row.plannedFinishDate,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      priorityLevel: row.priorityLevel,
      cuttingLines
    };
  }

  private toUnmatchedRow(
    row: ProductionPlanActiveBatchRow,
    reasonCodes: CutListUnmatchedReasonCode[],
    reasons: string[]
  ): CutListUnmatchedRow {
    return {
      productionRowId: row.id,
      rowIndex: row.rowIndex,
      materialCode: row.materialCode,
      materialName: row.materialName,
      workOrderNumber: row.workOrderNumber,
      reasonCodes,
      reasons: row.validationErrors.length > 0 ? row.validationErrors : reasons
    };
  }

  private toDetail(snapshot: CutListSnapshotRecord): CutListSnapshotDetail {
    return {
      snapshot: this.toSummary(snapshot),
      items: snapshot.payloadJson.items,
      unmatchedRows: snapshot.payloadJson.unmatchedRows
    };
  }

  private toSummary(snapshot: CutListSnapshotRecord): CutListSnapshotSummary {
    return {
      id: snapshot.id,
      planYear: snapshot.planYear,
      weekNumber: snapshot.weekNumber,
      sourceBatchId: snapshot.sourceBatchId,
      status: "created",
      totalProductionRows: snapshot.totalProductionRows,
      matchedProductionRows: snapshot.matchedProductionRows,
      unmatchedProductionRows: snapshot.unmatchedProductionRows,
      totalCuttingLines: snapshot.totalCuttingLines,
      createdAt: snapshot.createdAt
    };
  }

  private isLinkedProductNameMatch(
    materialName: string | null,
    linkedProductName: string | null
  ): boolean {
    const normalizedMaterialName = this.normalizeComparableProductName(materialName);
    const normalizedLinkedProductName =
      this.normalizeComparableProductName(linkedProductName);

    return (
      normalizedMaterialName !== null &&
      normalizedLinkedProductName !== null &&
      normalizedMaterialName === normalizedLinkedProductName
    );
  }

  private normalizeComparableProductName(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(?:RAL|R)\s*\d{4}\b/g, " ")
      .replace(/\b(?:A[0-4]|B[0-2]|F[0-2])\b/g, " ")
      .replace(
        /(^|[^A-Z0-9])(?:\d{1,3}\s*"\s*X\s*\d{1,3}\s*"|\d{2,5}\s*X\s*\d{2,5}\s*(?:MM)?|\d{3,5}\s*MM)(?=$|[^A-Z0-9])/g,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

    return normalizedValue === "" ? null : normalizedValue;
  }

  private resolveMaterialSize(row: ProductionPlanActiveBatchRow): string {
    return (
      this.normalizeMaterialSize(row.materialSize) ??
      this.extractMaterialSize(row.materialName) ??
      this.deriveMaterialSeriesTokenFromSapStyleCode(row.materialCode) ??
      DEFAULT_MATERIAL_SIZE
    );
  }

  private normalizeMaterialSize(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toUpperCase().replace(/\s+/g, "");

    return normalized === "" ? null : normalized;
  }

  private extractMaterialSize(materialName: string | null): string | null {
    if (!materialName) {
      return null;
    }

    const text = materialName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\([^)]*\)/g, " ");

    const seriesSizeMatch = text.match(/\b(A[0-4]|B[0-2]|F[0-2])\b/);

    if (seriesSizeMatch?.[1]) {
      return seriesSizeMatch[1];
    }

    const gluedSeriesMatch = text.match(/\d(A[0-4]|B[0-2]|F[0-2])(?![0-9])/);

    if (gluedSeriesMatch?.[1]) {
      return gluedSeriesMatch[1];
    }

    const inchSizeMatch = text.match(
      /(^|[^A-Z0-9])(\d{1,3})\s*"\s*X\s*(\d{1,3})\s*"(?=$|[^A-Z0-9])/
    );

    if (inchSizeMatch?.[2] && inchSizeMatch[3]) {
      return `${inchSizeMatch[2]}"X${inchSizeMatch[3]}"`;
    }

    const metricSizeMatch = text.match(
      /(^|[^A-Z0-9])(\d{2,5})\s*X\s*(\d{2,5})\s*(MM)?(?=$|[^A-Z0-9])/
    );

    if (metricSizeMatch?.[2] && metricSizeMatch[3]) {
      return `${metricSizeMatch[2]}X${metricSizeMatch[3]}${metricSizeMatch[4] ?? ""}`;
    }

    const lengthMatch = text.match(/(^|[^A-Z0-9])(\d{3,5})\s*MM(?=$|[^A-Z0-9])/);

    return lengthMatch?.[2] ? `${lengthMatch[2]}MM` : null;
  }

  /**
   * Mirrors production-plan import heuristics: SAP material numbers often embed the
   * paper/foil series after a digit, e.g. `...205A4X2000`.
   */
  private deriveMaterialSeriesTokenFromSapStyleCode(
    materialCode: string | null
  ): string | null {
    const normalized = this.normalizeCode(materialCode);

    if (!normalized) {
      return null;
    }

    const glued = normalized.match(/\d(A[0-4]|B[0-2]|F[0-2])(?![0-9])/);

    return glued?.[1] ?? null;
  }

  private normalizeCode(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalizedValue = value
      .replace(/^\uFEFF/, "")
      .replace(/\u00A0/g, " ")
      .trim()
      .toUpperCase();

    return normalizedValue === "" ? null : normalizedValue;
  }
}
