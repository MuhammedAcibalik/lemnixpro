export type EntityId = string;

export type UtcTimestamp = string;

export type HealthState = "live" | "ready";

export const userRoles = [
  "SUPER_ADMIN",
  "ADMIN",
  "CENTRAL_PLANNER",
  "PLANNER",
  "VIEWER"
] as const;

export type UserRole = (typeof userRoles)[number];

export type ServiceName =
  | "api-gateway-service"
  | "facility-service"
  | "identity-service"
  | "master-data-service"
  | "production-plan-service"
  | "cut-list-service"
  | "optimization-orchestrator-service"
  | "result-service"
  | "optimization-engine"
  | "web";
