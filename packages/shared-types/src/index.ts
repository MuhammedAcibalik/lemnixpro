export type EntityId = string;

export type UtcTimestamp = string;

export type HealthState = "live" | "ready";

export const userRoles = ["ADMIN", "PLANNER", "VIEWER"] as const;

export type UserRole = (typeof userRoles)[number];

export type ServiceName =
  | "api-gateway-service"
  | "identity-service"
  | "master-data-service"
  | "production-plan-service"
  | "cut-list-service"
  | "optimization-orchestrator-service"
  | "result-service"
  | "optimization-engine"
  | "web";
