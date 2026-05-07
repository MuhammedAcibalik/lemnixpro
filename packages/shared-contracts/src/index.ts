import type {
  EntityId,
  HealthState,
  ServiceName,
  UserRole,
  UtcTimestamp
} from "@lemnixpro/shared-types";

export { cuttingCodeBelongsToProfile } from "./main-profile-cutting-code";

export type HealthResponse = {
  service: ServiceName;
  status: HealthState;
  timestamp: UtcTimestamp;
  checks: string[];
};

export type ServiceInfoResponse = {
  service: ServiceName;
  version: string;
  environment: string;
};

export type ApiErrorResponse = {
  code: string;
  message: string;
  /** Downstream-derived detail when gateway uses a generic `message`. */
  upstreamDetail?: string;
  requestId?: string;
  service?: string;
  details?: Record<string, string[]>;
};

export const requestHeaders = {
  requestId: "x-request-id",
  correlationId: "x-correlation-id",
  internalServiceToken: "x-lemnixpro-internal-token",
  facilityId: "x-lemnixpro-facility-id",
  facilityScope: "x-lemnixpro-facility-scope"
} as const;

export type RequestContextMetadata = {
  requestId: string;
  correlationId: string;
};

export type MessageMetadata = {
  messageId: EntityId;
  correlationId: EntityId;
  causationId?: EntityId;
  attempt: number;
  occurredAt: UtcTimestamp;
};

export type AuthenticatedUser = {
  id: EntityId;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
};

export type JwtClaims = {
  sub: EntityId;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthenticatedUser;
};

export type CurrentUserResponse = {
  user: AuthenticatedUser;
};

export const facilityStatuses = ["active", "inactive"] as const;

export type FacilityStatus = (typeof facilityStatuses)[number];

export type Facility = {
  id: EntityId;
  code: string;
  name: string;
  status: FacilityStatus;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type FacilitySummary = Pick<
  Facility,
  "id" | "code" | "name" | "status"
>;

export type CreateFacilityRequest = {
  code: string;
  name: string;
  status?: FacilityStatus;
};

export type UpdateFacilityRequest = Partial<CreateFacilityRequest>;

export const facilityModuleKeys = [
  "workspace",
  "master-data",
  "production-plan",
  "cut-list",
  "optimization",
  "results",
  "analytics",
  "two-d-nesting"
] as const;

export type FacilityModuleKey = (typeof facilityModuleKeys)[number];

export const facilityScopes = ["single", "all"] as const;

export type FacilityScope = (typeof facilityScopes)[number];

export const facilityAccessRoles = [
  "SUPER_ADMIN",
  "CENTRAL_PLANNER",
  "FACILITY_ADMIN",
  "FACILITY_PLANNER",
  "FACILITY_OPERATOR",
  "FACILITY_VIEWER"
] as const;

export type FacilityAccessRole = (typeof facilityAccessRoles)[number];

export type UserFacilityGrant = {
  userId: EntityId;
  facilityId: EntityId;
  facilityRole: FacilityAccessRole;
  moduleKeys: FacilityModuleKey[];
  isDefault: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type UserFacilityGrantInput = {
  facilityId: EntityId;
  facilityRole: FacilityAccessRole;
  moduleKeys: FacilityModuleKey[];
  isDefault?: boolean;
};

export type SetUserFacilityGrantsRequest = {
  grants: UserFacilityGrantInput[];
};

export type UserFacilityAccess = {
  userId: EntityId;
  grants: UserFacilityGrant[];
};

export type UserFacilityAccessResponse = UserFacilityAccess & {
  effectiveRole: UserRole;
  canUseAllFacilities: boolean;
  defaultFacilityId: EntityId | null;
};

export type ActiveFacilityContext =
  | {
      scope: "single";
      facilityId: EntityId;
    }
  | {
      scope: "all";
      facilityId: null;
    };

export const facilityAccessDecisionReasons = [
  "super_admin",
  "facility_module_granted",
  "central_planner_module_granted",
  "facility_not_granted",
  "module_not_granted",
  "all_scope_not_granted",
  "invalid_facility_context",
  "user_not_found"
] as const;

export type FacilityAccessDecisionReason =
  (typeof facilityAccessDecisionReasons)[number];

export type FacilityAccessCheckRequest = {
  scope: FacilityScope;
  facilityId?: EntityId | null;
  moduleKey?: FacilityModuleKey;
};

export type FacilityAccessCheckResponse = {
  userId: EntityId;
  allowed: boolean;
  reason: FacilityAccessDecisionReason;
  context: ActiveFacilityContext | null;
};

export type CreateMainProfileRequest = {
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  isActive?: boolean;
  notes?: string | null;
  cuttingSpecs?: MainProfileCuttingSpecInput[];
};

export type UpdateMainProfileRequest = Partial<CreateMainProfileRequest>;

export type MainProfileCuttingSpecInput = {
  cuttingCode: string;
  cuttingName: string;
  cuttingLengthMm: number;
  unitQuantity: number;
  unitName: string;
};

export type MainProfileCuttingSpec = MainProfileCuttingSpecInput & {
  id: string;
};

export type MainProfileCuttingRealignmentResult = {
  profilesUpdated: number;
  cuttingSpecsMoved: number;
  duplicatesSkipped: number;
  unresolved: Array<{
    profileCode: string;
    cuttingCode: string;
    reason: "NO_OWNER_PROFILE";
  }>;
};

/** Bir ana üründe (linkedProductCode) kullanılan tek profil seçeneği; doğal anahtar (linkedProductCode, code). */
export type MainProfile = {
  id: EntityId;
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  cuttingSpecs: MainProfileCuttingSpec[];
  isActive: boolean;
  notes: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type MainProfileProductGroup = {
  productCode: string;
  productName: string;
  profiles: MainProfile[];
};

export type MainProfileImportInvalidRow = {
  rowIndex: number;
  productCode: string | null;
  profileCode: string | null;
  cuttingCode: string | null;
  validationErrors: string[];
};

export type MainProfileImportInvalidReasonCount = {
  reason: string;
  count: number;
};

export type MainProfileImportBatch = {
  id: EntityId;
  fileName: string;
  sheetName: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  importedProfileCount: number;
  importedCuttingSpecCount: number;
  createdAt: UtcTimestamp;
  invalidRows?: MainProfileImportInvalidRow[];
  invalidReasonCounts?: MainProfileImportInvalidReasonCount[];
};

export type ProductionPlanImportBatchStatus =
  | "imported"
  | "active"
  | "superseded";

export type ProductionPlanImportBatch = {
  id: EntityId;
  fileName: string;
  sheetName: string;
  planYear: number | null;
  weekNumber: number | null;
  status: ProductionPlanImportBatchStatus;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  activatedAt: UtcTimestamp | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type ProductionPlanImportBatchDetail = ProductionPlanImportBatch;

export type ProductionPlanImportRow = {
  id: EntityId;
  batchId: EntityId;
  rowIndex: number;
  sourceRowJson: Record<string, unknown>;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type ProductionPlanImportRowsPage = {
  rows: ProductionPlanImportRow[];
  totalCount: number;
  limit: number;
  offset: number;
};

export type ProductionPlanActiveBatchRow = {
  id: EntityId;
  rowIndex: number;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
};

export type ProductionPlanActiveBatchRowsResponse = {
  batch: ProductionPlanImportBatch;
  rows: ProductionPlanActiveBatchRow[];
};

export type UpdateProductionPlanRowRequest = {
  customerName?: string | null;
  orderingPartyCode?: string | null;
  customerOrderNumber?: string | null;
  customerOrderItemNumber?: string | null;
  workOrderNumber?: string | null;
  materialCode?: string | null;
  materialName?: string | null;
  mainProfileCode?: string | null;
  quantity?: string | null;
  orderUnit?: string | null;
  plannedFinishDate?: string | null;
  departmentCode?: string | null;
  priority?: string | null;
};

export type CutListSnapshotSummary = {
  id: EntityId;
  planYear: number;
  weekNumber: number;
  sourceBatchId: EntityId;
  status: "created";
  totalProductionRows: number;
  matchedProductionRows: number;
  unmatchedProductionRows: number;
  totalCuttingLines: number;
  createdAt: UtcTimestamp;
};

export type CutListCuttingLine = {
  profileCode: string;
  profileName: string;
  stockLengthMm: number;
  cuttingCode: string;
  cuttingName: string;
  cuttingLengthMm: number;
  unitName: string;
  unitQuantity: number;
  orderQuantity: number;
  cuttingQuantity: number;
};

export type CutListProductItem = {
  productionRowId: EntityId;
  rowIndex: number;
  workOrderNumber: string | null;
  materialCode: string;
  materialName: string | null;
  materialColor: string;
  materialSize: string;
  orderQuantity: number;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priorityLevel: number | null;
  cuttingLines: CutListCuttingLine[];
};

export type CutListUnmatchedReasonCode =
  | "missing_color"
  | "missing_size"
  | "missing_product_code"
  | "missing_product_name_match"
  | "missing_cutting_specs"
  | "production_row_invalid";

export type CutListUnmatchedRow = {
  productionRowId: EntityId;
  rowIndex: number;
  materialCode: string | null;
  materialName: string | null;
  workOrderNumber: string | null;
  reasonCodes: CutListUnmatchedReasonCode[];
  reasons: string[];
};

export type CutListSnapshotDetail = {
  snapshot: CutListSnapshotSummary;
  items: CutListProductItem[];
  unmatchedRows: CutListUnmatchedRow[];
};

export type CreateOptimizationRequestRequest = {
  weekNumber: number;
};

export const optimizationRequestStatuses = [
  "created",
  "ready",
  "queued",
  "failed_preparation"
] as const;

export type OptimizationRequestStatus =
  (typeof optimizationRequestStatuses)[number];

export type OptimizationMainProfileInput = {
  id: EntityId;
  code: string;
  name: string;
  linkedProductCode: string;
  linkedProductName: string;
  stockLengthMm: number;
};

export type OptimizationDemandRow = {
  productionRowId: EntityId;
  rowIndex: number;
  mainProfileId: EntityId;
  mainProfileCode: string;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string;
  materialName: string | null;
  quantity: number;
  orderUnit: string;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  priority: string | null;
};

export type OptimizationRequestPayload = {
  weekNumber: number;
  sourceBatchId: EntityId;
  mainProfiles: OptimizationMainProfileInput[];
  demandRows: OptimizationDemandRow[];
};

export type OptimizationRequestSummary = {
  id: EntityId;
  weekNumber: number;
  sourceBatchId: EntityId;
  status: OptimizationRequestStatus;
  matchedRows: number;
  unmatchedRows: number;
  queuedAt: UtcTimestamp | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type OptimizationQueueEnvelope = {
  metadata: MessageMetadata;
  requestId: EntityId;
  weekNumber: number;
  sourceBatchId: EntityId;
  payload: OptimizationRequestPayload;
  queuedAt: UtcTimestamp;
};

export type OptimizationPreparationUnmatchedReasonCode =
  | "production_row_invalid"
  | "missing_material_code"
  | "missing_active_main_profile"
  | "ambiguous_active_main_profile"
  | "main_profile_code_unmatched";

export type OptimizationDryRunActiveBatchSummary = ProductionPlanImportBatch & {
  weekNumber: number;
  status: "active";
};

export type OptimizationPreparationUnmatchedRow = {
  rowId: EntityId;
  rowIndex: number;
  materialCode: string | null;
  workOrderNumber: string | null;
  reasons: OptimizationPreparationUnmatchedReasonCode[];
  details: string[];
};

export type OptimizationUnmatchedSummary = {
  totalUnmatchedRows: number;
  rowsMissingMasterDataLinkage: number;
  unmatchedReasons: OptimizationPreparationUnmatchedRow[];
};

export type OptimizationDryRunResponse = {
  weekNumber: number;
  activeBatch: OptimizationDryRunActiveBatchSummary;
  totalProductionRows: number;
  masterDataCountUsed: number;
  matchedRows: number;
  unmatchedRows: number;
  rowsMissingMasterDataLinkage: number;
  unmatchedReasons: OptimizationPreparationUnmatchedRow[];
  optimizationRequestPreview: OptimizationRequestPayload;
};

export type CreateOptimizationRequestResponse = {
  request: OptimizationRequestSummary;
  payloadPreview: OptimizationRequestPayload;
  unmatchedSummary: OptimizationUnmatchedSummary;
};

export type OptimizationRequestPreparationFailedResponse =
  CreateOptimizationRequestResponse & {
    message: string;
  };

export type OptimizationRequestDetailResponse = {
  request: OptimizationRequestSummary;
  payloadPreview: OptimizationRequestPayload;
};

export type OptimizationRequestRequeueResponse = {
  request: OptimizationRequestSummary;
  message: string;
};

export type OptimizationRequestRequeueRejectedResponse =
  OptimizationRequestRequeueResponse;

export type OptimizationRequestedMessage = OptimizationQueueEnvelope;

export type ProductionPlanBatchActivatedEvent = {
  metadata: MessageMetadata;
  sourceBatchId: EntityId;
  planYear: number;
  weekNumber: number;
  activatedAt: UtcTimestamp;
};

/**
 * Published when production plan rows for an already-active batch change so cut-list-service
 * can recompute the snapshot (e.g. newly matchable rows after manual fixes).
 */
export type ProductionPlanBatchCutListReconcileEvent = {
  metadata: MessageMetadata;
  sourceBatchId: EntityId;
  planYear: number;
  weekNumber: number;
  occurredAt: UtcTimestamp;
};

export type OptimizationCompletedMessage = {
  metadata: MessageMetadata;
  jobId: EntityId;
  completedAt: UtcTimestamp;
  resultId: EntityId;
};

export type OptimizationFailedMessage = {
  metadata: MessageMetadata;
  jobId: EntityId;
  failedAt: UtcTimestamp;
  reason: string;
};

export type OptimizationResultStatus = "completed" | "failed";

export type OptimizationResultRecord = {
  id: EntityId;
  jobId: EntityId;
  resultId: EntityId | null;
  status: OptimizationResultStatus;
  completedAt: UtcTimestamp | null;
  failedAt: UtcTimestamp | null;
  reason: string | null;
  eventJson: Record<string, unknown>;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type WorkspaceOverviewServiceName =
  | "main-profiles"
  | "production-plans"
  | "cut-lists"
  | "optimization-requests"
  | "results";

export type WorkspaceOverviewServiceStatus = {
  service: WorkspaceOverviewServiceName;
  ok: boolean;
  count: number | null;
  message?: string;
};

export type WorkspaceOverviewSummary = {
  activeWeek: number | null;
  activeBatchCount: number;
  productionBatchCount: number;
  validProductionRows: number;
  profileCount: number;
  cuttingSpecCount: number;
  cutListCount: number;
  latestCutListUnmatchedRows: number | null;
  totalCuttingLines: number;
  totalUnmatchedRows: number;
  optimizationRequestCount: number;
  readyOptimizationRequestCount: number;
  queuedOptimizationRequestCount: number;
  unmatchedOptimizationRows: number;
  resultCount: number;
  completedResultCount: number;
};

export type WorkspaceOverviewResponse = {
  generatedAt: UtcTimestamp;
  degraded: boolean;
  services: WorkspaceOverviewServiceStatus[];
  summary: WorkspaceOverviewSummary;
};

export const messagingExchanges = {
  optimization: "optimization.exchange",
  productionPlan: "production-plan.exchange"
} as const;

export const routingKeys = {
  optimizationRequested: "optimization.requested",
  optimizationStarted: "optimization.started",
  optimizationProgress: "optimization.progress",
  optimizationCompleted: "optimization.completed",
  optimizationFailed: "optimization.failed",
  productionPlanBatchActivated: "production-plan.batch.activated",
  productionPlanBatchCutListReconcile: "production-plan.batch.cut-list-reconcile"
} as const;

/**
 * Enterprise optimization (V2) — cut-list snapshot driven, OR-Tools CP-SAT only.
 *
 * Material color drives the safety trim that must be removed from each stock bar
 * before any cut. Painted/coated profiles (RAL, R9005, pres renkler) require only a
 * front-end finishing trim. Anodized profiles (ELS / ELOKSAL) require trims at both
 * ends of the bar to remove anodization marks before any usable piece.
 *
 * IMPORTANT: this table is duplicated in
 * `engines/optimization-engine/app/domain/color_policy.py` and the two MUST stay in
 * sync. shared-contracts is the canonical source of truth; the Python mirror is a
 * narrow runtime copy because TS source cannot be imported from Python.
 */
export type MaterialColorClass = "painted" | "anodized";

export type ColorSafetyMarginPolicy = {
  colorClass: MaterialColorClass;
  frontTrimMm: number;
  endTrimMm: number;
};

export const COLOR_SAFETY_MARGIN_POLICIES: Record<
  MaterialColorClass,
  ColorSafetyMarginPolicy
> = {
  painted: { colorClass: "painted", frontTrimMm: 10, endTrimMm: 0 },
  anodized: { colorClass: "anodized", frontTrimMm: 50, endTrimMm: 50 }
};

const ANODIZED_COLOR_TOKENS = ["ELS", "ELOKSAL", "ELOX", "ELOXAL", "ANODIZE"];

/**
 * Maps a raw material color string (which may be null, blank, or any free-form value
 * coming from the production plan import) to one of the canonical color classes.
 *
 * Unknown / missing colors fall back to "painted" because the painted policy is the
 * least aggressive trim — picking "anodized" by default would bias the optimizer
 * toward shorter usable bars and over-allocate stock for non-anodized work.
 */
export function classifyMaterialColor(
  rawColor: string | null | undefined
): MaterialColorClass {
  if (!rawColor) {
    return "painted";
  }

  const normalized = rawColor.trim().toUpperCase();

  if (normalized === "") {
    return "painted";
  }

  for (const token of ANODIZED_COLOR_TOKENS) {
    if (normalized.includes(token)) {
      return "anodized";
    }
  }

  return "painted";
}

export function safetyMarginForColor(
  rawColor: string | null | undefined
): ColorSafetyMarginPolicy {
  return COLOR_SAFETY_MARGIN_POLICIES[classifyMaterialColor(rawColor)];
}

export type OptimizationStockBarRole = "primary" | "secondary";

export type OptimizationStockBar = {
  lengthMm: number;
  role: OptimizationStockBarRole;
};

export type OptimizationProfileGroupOverride = {
  mainProfileId: EntityId;
  stockBars: OptimizationStockBar[];
  displayCode?: string;
  displayName?: string;
};

export type OptimizationDemandItem = {
  productionRowId: EntityId;
  rowIndex: number;
  workOrderNumber: string | null;
  mainProfileId: EntityId;
  mainProfileCode: string;
  mainProfileName: string;
  materialCode: string;
  materialName: string | null;
  materialColor: string;
  materialColorClass: MaterialColorClass;
  cuttingCode: string;
  cuttingName: string;
  pieceLengthMm: number;
  quantity: number;
};

export type OptimizationProfileGroup = {
  mainProfileId: EntityId;
  mainProfileCode: string;
  mainProfileName: string;
  materialColorClass: MaterialColorClass;
  /**
   * Candidate nominal stock lengths the solver may choose per bar (supply catalog for this scenario).
   * This is distinct from {@link OptimizationConfig.maxStockLengthVarietyPerProfile}, which caps how many
   * different nominal lengths may appear simultaneously in an optimal plan for one profile group.
   */
  stockBars: OptimizationStockBar[];
  /** Total demand items count after work-order filtering (UI summary). */
  demandItemCount: number;
  /** Sum of pieceLengthMm * quantity across the group (for productive metres). */
  totalPieceLengthMm: number;
};

export type OptimizationConfig = {
  kerfMm: number;
  /** Stock bar scrap >= this value is reusable; below it is hurda (waste). */
  minReusableScrapMm: number;
  /** Allow primary and secondary stock bars to be combined within the same plan. */
  allowMixingStockBars: boolean;
  solverTimeLimitSec: number;
  randomSeed: number;
  /**
   * Optional production cap for how many cut pieces may be assigned to one stock bar.
   * `null`: pure cutting-stock optimisation without an explicit piece-count cap.
   */
  maxPiecesPerStockBar: number | null;
  /**
   * If set (>0), any per-profile efficiency below this percentage causes the engine
   * to mark the request `failed_with_quality_floor` instead of returning silently.
   */
  minProfileEfficiencyPct: number | null;
  /** Second-phase CP-SAT consolidation for fewer distinct cutting templates. */
  patternConsolidationEnabled: boolean;
  /** Cap on distinct patterns per profile group; null = no hard cap before relax loop. */
  maxDistinctPatternsPerProfile: number | null;
  /** Hurda (mm) slack allowed versus phase-1 optimum when consolidating patterns. */
  patternQualityToleranceMm: number;
  /**
   * Hard cap on how many distinct nominal stock lengths (`stockBars.lengthMm` + role buckets) appear
   * in the solved plan per profile-color group — not the row count of `stockBars` (supply catalog size).
   * `null`: no explicit cap beyond feasibility; solver still resolves lex order (fewer nominally-used kinds
   * before total scrap tie-break).
   */
  maxStockLengthVarietyPerProfile: number | null;
  /**
   * Reserved for mild tie-breaking; discrimination uses hurda and bar-count objectives.
   */
  preferReusableScrap: boolean;
  /** If false, post-repack (FFD) cannot increase distinct pattern count vs incoming. */
  allowPostRepackPatternIncrease: boolean;
};

export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  kerfMm: 4,
  minReusableScrapMm: 200,
  allowMixingStockBars: true,
  solverTimeLimitSec: 60,
  randomSeed: 1,
  maxPiecesPerStockBar: null,
  minProfileEfficiencyPct: null,
  patternConsolidationEnabled: true,
  maxDistinctPatternsPerProfile: 5,
  patternQualityToleranceMm: 0,
  maxStockLengthVarietyPerProfile: 1,
  preferReusableScrap: true,
  allowPostRepackPatternIncrease: false
};

export type OptimizationRequestPayloadV2 = {
  cutListSnapshotId: EntityId;
  planYear: number;
  weekNumber: number;
  selectedWorkOrderNumbers: string[] | "ALL";
  overrides: OptimizationProfileGroupOverride[];
  config: OptimizationConfig;
  profileGroups: OptimizationProfileGroup[];
  demandItems: OptimizationDemandItem[];
};

export const optimizationRequestStatusesV2 = [
  "created",
  "ready",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "failed_preparation",
  "failed_with_quality_floor"
] as const;

export type OptimizationRequestStatusV2 =
  (typeof optimizationRequestStatusesV2)[number];

export type OptimizationRequestSummaryV2 = {
  id: EntityId;
  cutListSnapshotId: EntityId | null;
  planYear: number | null;
  weekNumber: number;
  status: OptimizationRequestStatusV2;
  idempotencyKey?: string | null;
  matchedRows: number;
  unmatchedRows: number;
  queuedAt: UtcTimestamp | null;
  startedAt?: UtcTimestamp | null;
  completedAt?: UtcTimestamp | null;
  failedAt?: UtcTimestamp | null;
  resultId?: EntityId | null;
  failureReason?: string | null;
  failureReasonCode?: string | null;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type OptimizationRequestClaimResponse = {
  status: "claimed" | "skipped";
  requestId: EntityId;
  canonicalStatus: OptimizationRequestStatusV2 | "missing";
  reason?:
    | "not_found"
    | "not_queued"
    | "terminal"
    | "superseded_by_newer_request"
    | "stale_queue_timeout"
    | "worker_claim_rejected"
    | null;
  startedAt?: UtcTimestamp | null;
};

export type CreateOptimizationRequestFromSnapshotRequest = {
  cutListSnapshotId: EntityId;
  selectedWorkOrderNumbers: string[] | "ALL";
  overrides: OptimizationProfileGroupOverride[];
  config: OptimizationConfig;
};

export type OptimizationDryRunResponseV2 = {
  cutListSnapshotId: EntityId;
  planYear: number;
  weekNumber: number;
  totalDemandItems: number;
  totalProfileGroups: number;
  totalCuttingPieces: number;
  totalProductivePieceLengthMm: number;
  profileGroups: OptimizationProfileGroup[];
  preview: OptimizationRequestPayloadV2;
};

export type CreateOptimizationRequestFromSnapshotResponse = {
  request: OptimizationRequestSummaryV2;
  preview: OptimizationRequestPayloadV2;
};

export type OptimizationPatternPiece = {
  cuttingCode: string;
  cuttingName: string;
  lengthMm: number;
  count: number;
  workOrderNumbers: string[];
};

export type OptimizationPattern = {
  patternId: string;
  mainProfileId: EntityId;
  mainProfileCode: string;
  stockBarLengthMm: number;
  stockBarRole: OptimizationStockBarRole;
  usageCount: number;
  pieces: OptimizationPatternPiece[];
  kerfTotalMm: number;
  safetyTrimMm: number;
  productiveLengthMm: number;
  scrapMm: number;
  /** scrapMm portion that is >= minReusableScrapMm and reusable downstream. */
  reusableScrapMm: number;
  /** scrapMm portion that is below minReusableScrapMm and counted as hurda. */
  hurdaMm: number;
  efficiencyPct: number;
};

export type OptimizationProfileBreakdown = {
  mainProfileId: EntityId;
  mainProfileCode: string;
  mainProfileName: string;
  materialColorClass: MaterialColorClass;
  totalBars: number;
  totalProductiveLengthMm: number;
  totalKerfMm: number;
  totalSafetyTrimMm: number;
  totalScrapMm: number;
  totalReusableScrapMm: number;
  totalHurdaMm: number;
  efficiencyPct: number;
  patternIds: string[];
  /** Benzersiz kesim şablonu sayısı (patternIds ile aynı; sunucu göndermezse uzunluktan türetin). */
  distinctPatternCount?: number;
};

export type OptimizationLeftoverPiece = {
  mainProfileId: EntityId;
  mainProfileCode: string;
  lengthMm: number;
  count: number;
};

export type OptimizationStockRequirement = {
  mainProfileId: EntityId;
  mainProfileCode: string;
  stockBarLengthMm: number;
  stockBarRole: OptimizationStockBarRole;
  requiredCount: number;
};

export type OptimizationWorkOrderItem = {
  workOrderNumber: string | null;
  mainProfileCode: string;
  cuttingCode: string;
  cuttingName: string;
  pieceLengthMm: number;
  fulfilledCount: number;
  patternIds: string[];
};

export type OptimizationResultMetrics = {
  efficiencyPct: number;
  workOrderCount: number;
  totalStockBars: number;
  totalCutPieces: number;
  totalKerfMm: number;
  totalSafetyTrimMm: number;
  totalScrapMm: number;
  totalReusableScrapMm: number;
  totalHurdaMm: number;
  reusableLeftoverPieceCount: number;
  reusableLeftoverLengthMm: number;
  productiveLengthMm: number;
  wasteLengthMm: number;
  totalStockLengthMm: number;
  solverGapPct: number | null;
  /** (productive + kerf + safetyTrim) / totalStockLength — true material usage. */
  materialUtilizationPct?: number | null;
  /** hurda / totalStockLength — actual unrecoverable waste. */
  actualWastePct?: number | null;
  /** Tüm job’daki benzersik pattern satırı (kurulum / şablon çeşitliliği üst sınırı). */
  distinctPatternTypesTotal?: number | null;
  /** (productiveLengthMm + totalReusableScrapMm) / totalStockLengthMm — reusable tail as value. */
  recoverableMaterialPct?: number | null;
};

export type OptimizationSolverStats = {
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "MODEL_INVALID" | "UNKNOWN";
  wallTimeSec: number;
  bestObjective: number | null;
  bestBound: number | null;
  numConflicts: number | null;
  numBranches: number | null;
};

export type OptimizationProfileGroupSolveTelemetry = {
  mainProfileCode: string;
  materialColorClass: MaterialColorClass;
  /** CP-SAT’ın seçilen yolu (kolon-gen veya bar-slot). */
  primaryModelPath: "column_gen" | "bar_slot";
  primaryLegStatus: OptimizationSolverStats["status"];
  /** Birinci bacak çıktısı (kolon/bar-slot başarısı veya abort sonrası sezgisel). */
  primaryLegBars: number;
  primaryLegScrapMm: number;
  primaryLegSolverMode: "cp_sat" | "heuristic_fallback";
  heuristicLexCompared: boolean;
  /** İkinci bacak — yalnızca dual-path karşılaştırmasında. */
  secondaryLegBars: number | null;
  secondaryLegScrapMm: number | null;
  heuristicSelectedLex: boolean | null;
  winningSolverMode: "cp_sat" | "heuristic_fallback";
  baselineBars?: number | null;
  baselineHurdaMm?: number | null;
  baselineScrapMm?: number | null;
  baselineDistinctPatterns?: number | null;
  consolidatedBars?: number | null;
  consolidatedHurdaMm?: number | null;
  consolidatedScrapMm?: number | null;
  consolidatedDistinctPatterns?: number | null;
  patternCapRequested?: number | null;
  patternCapRelaxedTo?: number | null;
  stockLengthVarietyCount?: number | null;
  consolidationSelected?: boolean | null;
};

export type OptimizationResultPayload = {
  requestId: EntityId;
  cutListSnapshotId: EntityId;
  planYear: number;
  weekNumber: number;
  generatedAt: UtcTimestamp;
  solverMode?: "cp_sat" | "heuristic_fallback";
  metrics: OptimizationResultMetrics;
  profileBreakdowns: OptimizationProfileBreakdown[];
  patterns: OptimizationPattern[];
  workOrderItems: OptimizationWorkOrderItem[];
  leftovers: OptimizationLeftoverPiece[];
  stockRequirements: OptimizationStockRequirement[];
  solverStats: OptimizationSolverStats;
  /** Profil grubu bazında RCA: CP-SAT yolu ve sezgisel lex karşılaştırması. */
  profileGroupSolveTelemetry?: OptimizationProfileGroupSolveTelemetry[];
};

export type OptimizationCompletedMessageV2 = {
  metadata: MessageMetadata;
  jobId: EntityId;
  resultId: EntityId;
  cutListSnapshotId: EntityId;
  completedAt: UtcTimestamp;
  /**
   * Inline payload when result fits the queue size budget (<=200 KB). When omitted,
   * the engine writes the payload to result-service via the internal HTTP endpoint
   * before publishing the completion message.
   */
  payload?: OptimizationResultPayload;
};

export type OptimizationFailedMessageV2 = {
  metadata: MessageMetadata;
  jobId: EntityId;
  cutListSnapshotId: EntityId | null;
  failedAt: UtcTimestamp;
  reason: string;
  reasonCode:
    | "preparation_failed"
    | "infeasible"
    | "solver_timeout"
    | "quality_floor_violation"
    | "internal_error"
    | "superseded_by_newer_request"
    | "stale_queue_timeout"
    | "worker_claim_rejected";
};

export type OptimizationStartedMessageV2 = {
  metadata: MessageMetadata;
  jobId: EntityId;
  cutListSnapshotId: EntityId | null;
  startedAt: UtcTimestamp;
};

export type OptimizationProgressMessageV2 = {
  metadata: MessageMetadata;
  jobId: EntityId;
  cutListSnapshotId: EntityId | null;
  currentProfileCode?: string | null;
  completedGroups: number;
  totalGroups: number;
  elapsedMs: number;
  remainingBudgetMs: number;
  heartbeatAt: UtcTimestamp;
};

export type OptimizationResultDetailResponse = {
  jobId: EntityId;
  resultId: EntityId | null;
  status: OptimizationResultStatus | "missing";
  completedAt: UtcTimestamp | null;
  failedAt: UtcTimestamp | null;
  payload: OptimizationResultPayload | null;
  failure: { reason: string; reasonCode: string | null } | null;
};

export type OptimizationRequestDiagnosticsResponse = {
  generatedAt: UtcTimestamp;
  request: OptimizationRequestSummaryV2;
  result: OptimizationResultDetailResponse;
  queue: {
    state: "not_dispatched" | "queued" | "running" | "terminal";
    queuedAt: UtcTimestamp | null;
    startedAt: UtcTimestamp | null;
    completedAt: UtcTimestamp | null;
    failedAt: UtcTimestamp | null;
    depth?: number | null;
    activeBlockerRequestId?: EntityId | null;
    activeBlockerStartedAt?: UtcTimestamp | null;
    estimatedBlocker?: string | null;
  };
  progress?: {
    currentProfileCode?: string | null;
    completedGroups: number;
    totalGroups: number;
    elapsedMs: number;
    remainingBudgetMs: number;
    heartbeatAt: UtcTimestamp;
  } | null;
};
