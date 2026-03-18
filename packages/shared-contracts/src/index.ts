import type {
  EntityId,
  HealthState,
  ServiceName,
  UserRole,
  UtcTimestamp
} from "@lemnixpro/shared-types";

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
  details?: Record<string, string[]>;
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
  requestId: EntityId;
  weekNumber: number;
  sourceBatchId: EntityId;
  payload: OptimizationRequestPayload;
  queuedAt: UtcTimestamp;
};

export type OptimizationRequestedMessage = OptimizationQueueEnvelope;

export type OptimizationCompletedMessage = {
  jobId: EntityId;
  completedAt: UtcTimestamp;
  resultId: EntityId;
};

export type OptimizationFailedMessage = {
  jobId: EntityId;
  failedAt: UtcTimestamp;
  reason: string;
};

export const messagingExchanges = {
  optimization: "optimization.exchange"
} as const;

export const routingKeys = {
  optimizationRequested: "optimization.requested",
  optimizationCompleted: "optimization.completed",
  optimizationFailed: "optimization.failed"
} as const;
