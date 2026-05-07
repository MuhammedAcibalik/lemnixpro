import { createHash } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";

import {
  classifyMaterialColor,
  COLOR_SAFETY_MARGIN_POLICIES,
  DEFAULT_OPTIMIZATION_CONFIG,
  type CutListProductItem,
  type CutListSnapshotDetail,
  type OptimizationConfig,
  type OptimizationDemandItem,
  type OptimizationRequestClaimResponse,
  type OptimizationProfileGroup,
  type OptimizationProfileGroupOverride,
  type OptimizationRequestPayloadV2,
  type OptimizationRequestDiagnosticsResponse,
  type OptimizationRequestSummaryV2,
  type OptimizationStockBar
} from "@lemnixpro/shared-contracts";
import { createMessageMetadata, isoNow } from "@lemnixpro/shared-utils";

import { CutListClient } from "../../infrastructure/http/cut-list.client";
import { MasterDataClient } from "../../infrastructure/http/master-data.client";
import type {
  OptimizationRequestListRecord,
  OptimizationRequestRecord
} from "../../infrastructure/db/schema";
import type { OptimizationQueueEnvelopeV2 } from "../../infrastructure/messaging/rabbitmq.service";

import type {
  CreateOptimizationRequestFromSnapshotDto,
  CreateOptimizationRequestFromSnapshotResponseDto,
  OptimizationDryRunV2ResponseDto
} from "./dto";
import {
  OPTIMIZATION_REQUEST_QUEUE_PUBLISHER,
  type OptimizationRequestQueuePublisher
} from "./optimization-request-queue.publisher";
import { OptimizationLifecycleService } from "./optimization-lifecycle.service";
import { OptimizationRequestsRepository } from "./optimization-requests.repository";

type ResolvedSnapshot = {
  snapshot: CutListSnapshotDetail;
  selectedItems: CutListProductItem[];
  payload: OptimizationRequestPayloadV2;
};

@Injectable()
export class OptimizationRequestsV2Service {
  constructor(
    @Inject(CutListClient)
    private readonly cutListClient: CutListClient,
    @Inject(MasterDataClient)
    private readonly masterDataClient: MasterDataClient,
    @Inject(OptimizationRequestsRepository)
    private readonly optimizationRequestsRepository: OptimizationRequestsRepository,
    @Inject(OPTIMIZATION_REQUEST_QUEUE_PUBLISHER)
    private readonly optimizationRequestQueuePublisher: OptimizationRequestQueuePublisher,
    @Inject(OptimizationLifecycleService)
    private readonly optimizationLifecycleService: OptimizationLifecycleService
  ) {}

  /**
   * GET :id/status: DB ve result-service arasında lifecycle tutarlılığı
   * (tamamlanan sonuç varken DB henüz güncellenmediyse UI'ı düzeltir).
   */
  async findLifecycleStatus(id: string): Promise<OptimizationRequestSummaryV2> {
    const summary = await this.findById(id);

    return this.optimizationLifecycleService.reconcileSummary(summary);
      // result-service kapalı veya hata → DB durumunu koru
  }

  async findDiagnostics(
    id: string
  ): Promise<OptimizationRequestDiagnosticsResponse> {
    const request = await this.findLifecycleStatus(id);
    const result = await this.optimizationLifecycleService.getResultSnapshot(id);
    const activeBlocker =
      await this.optimizationRequestsRepository.findOldestRunning();
    const rawRecord = await this.optimizationRequestsRepository.findById(id);

    return {
      generatedAt: isoNow(),
      request,
      result,
      queue: {
        state: this.resolveQueueDiagnosticState(request.status),
        queuedAt: request.queuedAt,
        startedAt: request.startedAt ?? null,
        completedAt: request.completedAt ?? null,
        failedAt: request.failedAt ?? null,
        activeBlockerRequestId:
          activeBlocker && activeBlocker.id !== request.id
            ? activeBlocker.id
            : null,
        activeBlockerStartedAt:
          activeBlocker && activeBlocker.id !== request.id
            ? activeBlocker.startedAt ?? null
            : null,
        estimatedBlocker:
          activeBlocker && activeBlocker.id !== request.id
            ? `Aktif worker "${activeBlocker.id}" talebini isliyor. Bu is bittiginde kuyruktaki sonraki mesaj claim edilecek.`
            : null
      },
      progress: this.toProgressSnapshot(rawRecord?.progressJson ?? null) ?? null
    };
  }

  async claimRequest(id: string): Promise<OptimizationRequestClaimResponse> {
    const candidate = await this.optimizationRequestsRepository.findById(id);
    if (!candidate) {
      return {
        status: "skipped",
        requestId: id,
        canonicalStatus: "missing",
        reason: "not_found",
        startedAt: null
      };
    }

    if (this.isStaleRealRunningClaim(candidate)) {
      await this.optimizationRequestsRepository.markCancelled({
        id: candidate.id,
        failureReason:
          "İşlem sırasında sunucu bağlantısı koptuğu için optimizasyon iptal edildi.",
        failureReasonCode: "stale_queue_timeout"
      });
      return {
        status: "skipped",
        requestId: candidate.id,
        canonicalStatus: "cancelled",
        reason: "stale_queue_timeout",
        startedAt: candidate.startedAt ?? null
      };
    }

    const canonical = await this.findCanonicalActiveDuplicate(candidate);
    if (canonical && canonical.id !== candidate.id) {
      await this.optimizationRequestsRepository.markCancelled({
        id: candidate.id,
        failureReason:
          `Superseded by newer canonical optimization request "${canonical.id}".`,
        failureReasonCode: "superseded_by_newer_request"
      });
      return {
        status: "skipped",
        requestId: candidate.id,
        canonicalStatus: "cancelled",
        reason: "superseded_by_newer_request",
        startedAt: candidate.startedAt ?? null
      };
    }

    const startedAt = isoNow();
    const claimed =
      await this.optimizationRequestsRepository.claimQueuedRequest({
        id,
        startedAt
      });

    if (claimed) {
      return {
        status: "claimed",
        requestId: claimed.id,
        canonicalStatus: claimed.status,
        startedAt: claimed.startedAt ?? startedAt
      };
    }

    const existing = await this.optimizationRequestsRepository.findById(id);
    if (!existing) {
      return {
        status: "skipped",
        requestId: id,
        canonicalStatus: "missing",
        reason: "not_found",
        startedAt: null
      };
    }

    return {
      status: "skipped",
      requestId: id,
      canonicalStatus: existing.status,
      reason: this.resolveClaimSkipReason(existing) ?? null,
      startedAt: existing.startedAt ?? null
    };
  }

  async createDryRun(
    input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<OptimizationDryRunV2ResponseDto> {
    const resolved = await this.resolveSnapshot(input);

    return {
      cutListSnapshotId: resolved.payload.cutListSnapshotId,
      planYear: resolved.payload.planYear,
      weekNumber: resolved.payload.weekNumber,
      totalDemandItems: resolved.payload.demandItems.length,
      totalProfileGroups: resolved.payload.profileGroups.length,
      totalCuttingPieces: resolved.payload.demandItems.reduce(
        (total, item) => total + item.quantity,
        0
      ),
      totalProductivePieceLengthMm: resolved.payload.demandItems.reduce(
        (total, item) => total + item.pieceLengthMm * item.quantity,
        0
      ),
      profileGroups: resolved.payload.profileGroups,
      preview: resolved.payload
    };
  }

  async createRequest(
    input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<CreateOptimizationRequestFromSnapshotResponseDto> {
    const resolved = await this.resolveSnapshot(input);

    if (resolved.payload.demandItems.length === 0) {
      throw new UnprocessableEntityException({
        code: "no_demand_items",
        message:
          "Seçilen iş emirleri için optimizasyona uygun kesim satırı bulunmuyor."
      });
    }

    try {
      const idempotencyKey = this.buildIdempotencyKey(resolved.payload);
      const existing =
        await this.optimizationRequestsRepository.findActiveByIdempotencyKey(
          idempotencyKey
        );

      if (existing) {
        return {
          request: this.toSummary(existing),
          preview: resolved.payload
        };
      }

      const created = await this.optimizationRequestsRepository.createV2({
        cutListSnapshotId: resolved.payload.cutListSnapshotId,
        planYear: resolved.payload.planYear,
        weekNumber: resolved.payload.weekNumber,
        sourceBatchId: resolved.snapshot.snapshot.sourceBatchId,
        payloadJson: resolved.payload,
        configJson: resolved.payload.config,
        idempotencyKey,
        matchedRows: resolved.payload.demandItems.length,
        unmatchedRows: 0
      });

      const ready = await this.optimizationRequestsRepository.updateStatus({
        id: created.id,
        status: "ready"
      });

      const dispatched = await this.handoffReadyRequest(ready);

      return {
        request: this.toSummary(dispatched),
        preview: resolved.payload
      };
    } catch (error) {
      this.rethrowAsFriendlyOptimizationStartFailure(error);
    }
  }

  /** Maps driver / queue failures to actionable HTTP responses (instead of opaque 500). */
  private rethrowAsFriendlyOptimizationStartFailure(error: unknown): never {
    if (
      error instanceof HttpException ||
      error instanceof NotFoundException ||
      error instanceof UnprocessableEntityException
    ) {
      throw error;
    }

    const pg = OptimizationRequestsV2Service.findPgDriverHints(error);

    if (pg?.code === "42703") {
      throw new HttpException(
        [
          'Veritabaninda beklenen kolon yok (optimizasyon V2 şeması uygulanmamis olabilir).',
          "",
          "Proje kökünden calistirin: pnpm db:migrate:optimization-orchestrator",
          "Ardından optimization-orchestrator-service sürecini yeniden baslatin."
        ].join(" "),
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (pg?.code === "42704") {
      throw new HttpException(
        [
          "PostgreSQL enum veya nesne uyusmuyor (optimizasyon durum enumeration genislemesi eksik olabilir).",
          "",
          "Proje kökünden calistirin: pnpm db:migrate:optimization-orchestrator",
          "Ardından optimization-orchestrator-service sürecini yeniden baslatin."
        ].join(" "),
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (pg?.code === "42P01") {
      throw new HttpException(
        [
          '"optimization.optimization_requests" tablosu veya şema eksik görünüyor.',
          "Proje kökünden migration calistirin: pnpm db:migrate:optimization-orchestrator"
        ].join(" "),
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (
      pg?.code === "22P02" &&
      /optimization_request_status|invalid input value for enum/i.test(
        pg.message ?? ""
      )
    ) {
      throw new HttpException(
        [
          "Optimizasyon istegi durumu ('queued' vb.) için veritabanindaki ENUM güncellenmemiş olabilir.",
          "Proje kökünden calistirin: pnpm db:migrate:optimization-orchestrator",
          "(0001 ile 'queued'; 0003 ile V2 kolonları ve tamamlayıcı durumlar eklenir.)"
        ].join(" "),
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const errno = OptimizationRequestsV2Service.collectErrnoChain(error).join("|");
    if (
      /\bECONNREFUSED\b/.test(errno) ||
      /\bENOTFOUND\b/.test(errno) ||
      /\bECONNRESET\b/.test(errno)
    ) {
      throw new HttpException(
        [
          "RabbitMQ veya bağlı ağ arabirimi erişilemiyor (mesaj kuyruğuna yazılamıyor).",
          "Yerel ortam için: `pnpm infra:up` ile Postgres+Rabbit konteynerlerini ayaga kaldirip optimization-orchestrator-service .env icindeki RABBITMQ_URL degerini dogrulayin."
        ].join(" "),
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    throw error;
  }

  private static findPgDriverHints(
    error: unknown
  ): { code?: string; message?: string } | undefined {
    const knownSqlState = new Set([
      "42703",
      "42704",
      "42P01",
      "42P02",
      "22P02",
      "23503",
      "23505",
      "42601"
    ]);

    let current: unknown = error;
    for (let depth = 0; depth < 12 && current; depth++) {
      if (
        typeof current === "object" &&
        current !== null &&
        "code" in current &&
        typeof (current as { code?: unknown }).code === "string"
      ) {
        const rec = current as Record<string, unknown>;
        const code = rec.code as string;
        const message =
          typeof rec.message === "string" ? rec.message : "";

        if (knownSqlState.has(code)) {
          return { code, message };
        }
      }
      current = OptimizationRequestsV2Service.getCause(current);
    }

    let walk: unknown = error;
    for (let depth = 0; depth < 12 && walk; depth++) {
      const msg =
        typeof walk === "object" &&
        walk !== null &&
        "message" in walk &&
        typeof (walk as { message?: unknown }).message === "string"
          ? (walk as { message: string }).message
          : "";
      const matched = msg.match(/SQLSTATE\[([0-9A-Z]{5})\]/i);
      if (matched?.[1]) {
        return {
          code: matched[1].toUpperCase(),
          message: msg
        };
      }
      walk = OptimizationRequestsV2Service.getCause(walk);
    }

    return undefined;
  }

  private static collectErrnoChain(error: unknown): string[] {
    const out: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 12 && current; depth++) {
      if (
        typeof current === "object" &&
        current !== null &&
        "code" in current &&
        typeof (current as { code?: unknown }).code === "string"
      ) {
        const code = (current as { code: string }).code;
        if (code.trim() !== "") {
          out.push(code);
        }
      }
      current = OptimizationRequestsV2Service.getCause(current);
    }
    return out;
  }

  private static getCause(value: unknown): unknown {
    if (typeof value === "object" && value !== null && "cause" in value) {
      return value.cause;
    }
    return undefined;
  }

  async findByCutListSnapshotId(
    cutListSnapshotId: string
  ): Promise<OptimizationRequestSummaryV2[]> {
    const records =
      await this.optimizationRequestsRepository.findByCutListSnapshotId(
        cutListSnapshotId
      );
    return this.optimizationLifecycleService.reconcileSummaries(
      records.map((record) => this.toSummary(record))
    );
  }

  async findById(id: string): Promise<OptimizationRequestSummaryV2> {
    const record = await this.optimizationRequestsRepository.findById(id);
    if (!record) {
      throw new NotFoundException(`Optimization request "${id}" was not found.`);
    }
    return this.toSummary(record);
  }

  private async resolveSnapshot(
    input: CreateOptimizationRequestFromSnapshotDto
  ): Promise<ResolvedSnapshot> {
    const snapshot = await this.cutListClient.getSnapshotById(
      input.cutListSnapshotId
    );

    const selectionFilter = this.buildSelectionFilter(
      input.selectedWorkOrderNumbers
    );
    const selectedItems = snapshot.items.filter((item) =>
      selectionFilter(item.workOrderNumber)
    );

    if (selectedItems.length === 0) {
      throw new UnprocessableEntityException({
        code: "no_work_orders_selected",
        message:
          "Hiç iş emri seçilmedi veya seçilen iş emirlerine ait kesim satırı bulunamadı."
      });
    }

    const overridesById = this.indexOverrides(input.overrides);
    const config = this.normalizeConfig(input.config);

    const profiles = await this.masterDataClient.getMainProfiles();
    const groupAccumulator = new Map<string, OptimizationProfileGroup>();
    const demandItems: OptimizationDemandItem[] = [];

    for (const item of selectedItems) {
      const colorClass = classifyMaterialColor(item.materialColor);

      for (const cuttingLine of item.cuttingLines) {
        const profile = this.findProfileByCode(profiles, cuttingLine.profileCode);
        const profileId = profile?.id ?? cuttingLine.profileCode;
        const groupKey = `${profileId}::${colorClass}`;
        const override = overridesById.get(profileId);
        const cuttingLengthMm = this.normalizeCuttingLengthForOptimization(
          cuttingLine.cuttingLengthMm,
          cuttingLine.cuttingName
        );
        const stockBars = this.resolveStockBars(
          override,
          profile?.stockLengthMm ?? cuttingLine.stockLengthMm,
          cuttingLine.stockLengthMm
        );

        const quantity = cuttingLine.cuttingQuantity;
        if (quantity <= 0 || cuttingLengthMm <= 0) {
          continue;
        }

        const existingGroup = groupAccumulator.get(groupKey);
        if (existingGroup) {
          existingGroup.demandItemCount += 1;
          existingGroup.totalPieceLengthMm += cuttingLengthMm * quantity;
        } else {
          groupAccumulator.set(groupKey, {
            mainProfileId: profileId,
            mainProfileCode: override?.displayCode ?? cuttingLine.profileCode,
            mainProfileName: override?.displayName ?? cuttingLine.profileName,
            materialColorClass: colorClass,
            stockBars,
            demandItemCount: 1,
            totalPieceLengthMm: cuttingLengthMm * quantity
          });
        }

        demandItems.push({
          productionRowId: item.productionRowId,
          rowIndex: item.rowIndex,
          workOrderNumber: item.workOrderNumber,
          mainProfileId: profileId,
          mainProfileCode: override?.displayCode ?? cuttingLine.profileCode,
          mainProfileName: override?.displayName ?? cuttingLine.profileName,
          materialCode: item.materialCode,
          materialName: item.materialName,
          materialColor: item.materialColor,
          materialColorClass: colorClass,
          cuttingCode: cuttingLine.cuttingCode,
          cuttingName: cuttingLine.cuttingName,
          pieceLengthMm: cuttingLengthMm,
          quantity
        });
      }
    }

    const profileGroups = Array.from(groupAccumulator.values()).sort((a, b) =>
      a.mainProfileCode.localeCompare(b.mainProfileCode)
    );
    this.assertGroupsRespectSafetyTrim(profileGroups);
    this.assertDemandItemsFitStock(profileGroups, demandItems);

    const payload: OptimizationRequestPayloadV2 = {
      cutListSnapshotId: snapshot.snapshot.id,
      planYear: snapshot.snapshot.planYear,
      weekNumber: snapshot.snapshot.weekNumber,
      selectedWorkOrderNumbers: input.selectedWorkOrderNumbers,
      overrides: input.overrides,
      config,
      profileGroups,
      demandItems
    };

    return {
      snapshot,
      selectedItems,
      payload
    };
  }

  private buildSelectionFilter(
    selection: CreateOptimizationRequestFromSnapshotDto["selectedWorkOrderNumbers"]
  ): (workOrder: string | null) => boolean {
    if (selection === "ALL") {
      return () => true;
    }
    const allowed = new Set(selection);
    return (workOrder) => (workOrder ? allowed.has(workOrder) : false);
  }

  private indexOverrides(
    overrides: OptimizationProfileGroupOverride[]
  ): Map<string, OptimizationProfileGroupOverride> {
    return new Map(
      overrides.map((override) => [override.mainProfileId, override])
    );
  }

  private normalizeConfig(
    candidate: OptimizationConfig | undefined
  ): OptimizationConfig {
    const merged: OptimizationConfig = {
      ...DEFAULT_OPTIMIZATION_CONFIG,
      ...(candidate ?? {})
    };

    if (merged.kerfMm < 0) merged.kerfMm = DEFAULT_OPTIMIZATION_CONFIG.kerfMm;
    if (merged.minReusableScrapMm < 0) {
      merged.minReusableScrapMm = DEFAULT_OPTIMIZATION_CONFIG.minReusableScrapMm;
    }
    if (merged.solverTimeLimitSec <= 0) {
      merged.solverTimeLimitSec = DEFAULT_OPTIMIZATION_CONFIG.solverTimeLimitSec;
    }
    if (
      merged.maxPiecesPerStockBar !== null &&
      merged.maxPiecesPerStockBar < 1
    ) {
      merged.maxPiecesPerStockBar =
        DEFAULT_OPTIMIZATION_CONFIG.maxPiecesPerStockBar;
    }
    if (
      merged.minProfileEfficiencyPct !== null &&
      (merged.minProfileEfficiencyPct < 0 ||
        merged.minProfileEfficiencyPct > 100)
    ) {
      merged.minProfileEfficiencyPct = null;
    }
    return merged;
  }

  private findProfileByCode(
    profiles: ReturnType<MasterDataClient["getMainProfiles"]> extends Promise<
      infer R
    >
      ? R
      : never,
    code: string
  ) {
    return profiles.find(
      (profile) => profile.code.toUpperCase() === code.toUpperCase()
    );
  }

  private resolveStockBars(
    override: OptimizationProfileGroupOverride | undefined,
    masterStockLengthMm: number,
    snapshotStockLengthMm: number
  ): OptimizationStockBar[] {
    if (override && override.stockBars.length > 0) {
      return override.stockBars;
    }
    const length = masterStockLengthMm || snapshotStockLengthMm;
    return [{ lengthMm: length, role: "primary" }];
  }

  private assertGroupsRespectSafetyTrim(
    groups: OptimizationProfileGroup[]
  ): void {
    for (const group of groups) {
      const policy = COLOR_SAFETY_MARGIN_POLICIES[group.materialColorClass];
      const usableLengths = group.stockBars.map(
        (bar) => bar.lengthMm - policy.frontTrimMm - policy.endTrimMm
      );
      const maxUsable = Math.max(...usableLengths, 0);
      if (maxUsable <= 0) {
        throw new UnprocessableEntityException({
          code: "stock_bars_too_short_for_safety_trim",
          message: `Profil "${group.mainProfileCode}" için seçilen stok boylarına ${policy.frontTrimMm + policy.endTrimMm} mm güvenlik payı uygulandığında kullanılabilir uzunluk kalmıyor.`
        });
      }
    }
  }

  private assertDemandItemsFitStock(
    groups: OptimizationProfileGroup[],
    demandItems: OptimizationDemandItem[]
  ): void {
    const groupsByKey = new Map(
      groups.map((group) => [
        `${group.mainProfileId}::${group.materialColorClass}`,
        group
      ])
    );

    for (const item of demandItems) {
      const group = groupsByKey.get(
        `${item.mainProfileId}::${item.materialColorClass}`
      );
      if (!group) {
        continue;
      }

      const policy = COLOR_SAFETY_MARGIN_POLICIES[group.materialColorClass];
      const maxUsable = Math.max(
        ...group.stockBars.map(
          (bar) => bar.lengthMm - policy.frontTrimMm - policy.endTrimMm
        ),
        0
      );

      if (item.pieceLengthMm > maxUsable) {
        throw new UnprocessableEntityException({
          code: "piece_exceeds_usable_stock_bar",
          message: `Profil "${item.mainProfileCode}" için "${item.cuttingName}" kesimi ${item.pieceLengthMm} mm; güvenlik payı sonrası kullanılabilir en uzun stok ${maxUsable} mm. Stok boyunu veya secondary bar override'unu kontrol edin.`,
          profileCode: item.mainProfileCode,
          cuttingCode: item.cuttingCode,
          cuttingName: item.cuttingName,
          pieceLengthMm: item.pieceLengthMm,
          maxUsableLengthMm: maxUsable
        });
      }
    }
  }

  private normalizeCuttingLengthForOptimization(
    cuttingLengthMm: number,
    cuttingName: string
  ): number {
    const decimalLength = this.extractDecimalLengthFromCuttingName(cuttingName);

    if (decimalLength === null) {
      return cuttingLengthMm;
    }

    const legacyScaledLength = Math.round(decimalLength * 10);
    if (Math.abs(cuttingLengthMm - legacyScaledLength) <= 0.001) {
      return Math.round(decimalLength);
    }

    return cuttingLengthMm;
  }

  private extractDecimalLengthFromCuttingName(cuttingName: string): number | null {
    const matches = [
      ...cuttingName
        .toUpperCase()
        .matchAll(/(^|[^A-Z0-9])(\d{2,5})[.,](\d{1,3})(?=$|[^A-Z0-9])/g)
    ];
    const values = matches
      .map((match) =>
        match[2] && match[3] ? Number(`${match[2]}.${match[3]}`) : Number.NaN
      )
      .filter((value) => Number.isFinite(value) && value > 0);

    return values.length > 0 ? Math.max(...values) : null;
  }

  private async handoffReadyRequest(
    record: OptimizationRequestRecord
  ): Promise<OptimizationRequestRecord> {
    const queuedAt = new Date().toISOString();
    const envelope = this.toEnvelope(record, queuedAt);
    await this.optimizationRequestQueuePublisher.publish(envelope);
    // Broker handoff only means the request is queued. The engine owns the
    // transition to `running` by publishing `optimization.started`.
    return this.optimizationRequestsRepository.markQueuedFromReady({
      id: record.id,
      queuedAt
    });
  }

  private buildIdempotencyKey(payload: OptimizationRequestPayloadV2): string {
    const canonical = {
      cutListSnapshotId: payload.cutListSnapshotId,
      planYear: payload.planYear,
      weekNumber: payload.weekNumber,
      selectedWorkOrderNumbers: Array.isArray(payload.selectedWorkOrderNumbers)
        ? [...payload.selectedWorkOrderNumbers].sort()
        : payload.selectedWorkOrderNumbers,
      overrides: [...payload.overrides]
        .map((override) => ({
          ...override,
          stockBars: [...override.stockBars].sort(
            (left, right) =>
              left.lengthMm - right.lengthMm ||
              left.role.localeCompare(right.role)
          )
        }))
        .sort((left, right) => left.mainProfileId.localeCompare(right.mainProfileId)),
      config: payload.config,
      demandSignature: payload.demandItems
        .map((item) => ({
          productionRowId: item.productionRowId,
          workOrderNumber: item.workOrderNumber,
          mainProfileId: item.mainProfileId,
          materialColorClass: item.materialColorClass,
          cuttingCode: item.cuttingCode,
          pieceLengthMm: item.pieceLengthMm,
          quantity: item.quantity
        }))
        .sort((left, right) =>
          `${left.productionRowId}:${left.cuttingCode}`.localeCompare(
            `${right.productionRowId}:${right.cuttingCode}`
          )
        )
    };

    return createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex");
  }

  private resolveQueueDiagnosticState(
    status: OptimizationRequestSummaryV2["status"]
  ): OptimizationRequestDiagnosticsResponse["queue"]["state"] {
    switch (status) {
      case "created":
      case "ready":
        return "not_dispatched";
      case "queued":
        return "queued";
      case "running":
        return "running";
      default:
        return "terminal";
    }
  }

  private async findCanonicalActiveDuplicate(
    candidate: OptimizationRequestRecord
  ): Promise<OptimizationRequestRecord | null> {
    if (!candidate.cutListSnapshotId) {
      return candidate;
    }

    const activeRecords =
      await this.optimizationRequestsRepository.findActiveRecordsByCutListSnapshotId(
        candidate.cutListSnapshotId
      );

    const newestRecord = activeRecords[0];

    return newestRecord ?? candidate;
  }

  private isStaleRealRunningClaim(record: OptimizationRequestRecord): boolean {
    if (record.status !== "running") {
      return false;
    }

    if (record.queuedAt && record.startedAt === record.queuedAt) {
      return false;
    }

    return true;
  }



  private resolveClaimSkipReason(
    record: OptimizationRequestRecord
  ):
    | "not_found"
    | "not_queued"
    | "terminal"
    | "superseded_by_newer_request"
    | "stale_queue_timeout"
    | "worker_claim_rejected"
    | null {
    if (record.status === "cancelled") {
      if (
        record.failureReasonCode === "superseded_by_newer_request" ||
        record.failureReasonCode === "stale_queue_timeout" ||
        record.failureReasonCode === "worker_claim_rejected"
      ) {
        return record.failureReasonCode;
      }
      return "terminal";
    }

    if (
      record.status === "completed" ||
      record.status === "failed" ||
      record.status === "failed_preparation" ||
      record.status === "failed_with_quality_floor"
    ) {
      return "terminal";
    }

    return "not_queued";
  }

  private toProgressSnapshot(
    value: OptimizationRequestRecord["progressJson"]
  ): NonNullable<OptimizationRequestDiagnosticsResponse["progress"]> | null {
    if (!value) {
      return null;
    }

    return {
      currentProfileCode: value.currentProfileCode ?? null,
      completedGroups: value.completedGroups,
      totalGroups: value.totalGroups,
      elapsedMs: value.elapsedMs,
      remainingBudgetMs: value.remainingBudgetMs,
      heartbeatAt: value.heartbeatAt
    };
  }

  private toEnvelope(
    record: OptimizationRequestRecord,
    queuedAt: string
  ): OptimizationQueueEnvelopeV2 {
    if (!record.cutListSnapshotId || record.planYear === null) {
      throw new Error(
        `Optimization request "${record.id}" is missing V2 fields required for queue handoff.`
      );
    }
    return {
      metadata: createMessageMetadata({
        causationId: record.id,
        occurredAt: queuedAt
      }),
      requestId: record.id,
      cutListSnapshotId: record.cutListSnapshotId,
      planYear: record.planYear,
      weekNumber: record.weekNumber,
      payload: record.payloadJson as OptimizationRequestPayloadV2,
      queuedAt
    };
  }

  private toSummary(
    record: OptimizationRequestListRecord
  ): OptimizationRequestSummaryV2 {
    return {
      id: record.id,
      cutListSnapshotId: record.cutListSnapshotId,
      planYear: record.planYear,
      weekNumber: record.weekNumber,
      status: record.status,
      idempotencyKey: record.idempotencyKey ?? null,
      matchedRows: record.matchedRows,
      unmatchedRows: record.unmatchedRows,
      queuedAt: record.queuedAt,
      startedAt: record.startedAt ?? null,
      completedAt: record.completedAt ?? null,
      failedAt: record.failedAt ?? null,
      resultId: record.resultId ?? null,
      failureReason: record.failureReason ?? null,
      failureReasonCode: record.failureReasonCode ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}
