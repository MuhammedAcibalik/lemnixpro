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

export type OptimizationRequestedMessage = {
  jobId: EntityId;
  weekCode: string;
  requestedAt: UtcTimestamp;
  requestedBy: EntityId;
};

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
