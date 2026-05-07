import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  validateSync
} from "class-validator";

import {
  asBoolean,
  asNumber,
  assertProductionSafeSecret,
  assertProductionSafeUrl
} from "@lemnixpro/shared-utils";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "master-data-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3003;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

  /**
   * Base URL of production-plan-service (no trailing path). When set, profile mutations
   * enqueue cut-list reconcile for all active production batches.
   */
  @IsString()
  PRODUCTION_PLAN_SERVICE_BASE_URL = "";
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const environment =
    typeof config.NODE_ENV === "string" ? config.NODE_ENV : "development";
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    ENABLE_SWAGGER: asBoolean(
      typeof config.ENABLE_SWAGGER === "string"
        ? config.ENABLE_SWAGGER
        : undefined,
      environment !== "production"
    ),
    PORT: asNumber(config.PORT, 3003)
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  assertProductionSafeSecret({
    environment: validatedConfig.NODE_ENV,
    name: "INTERNAL_SERVICE_AUTH_SECRET",
    value: validatedConfig.INTERNAL_SERVICE_AUTH_SECRET
  });
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "DATABASE_URL",
    value: validatedConfig.DATABASE_URL,
    forbiddenSubstrings: ["postgres:postgres@", "localhost", "127.0.0.1"]
  });

  if (validatedConfig.PRODUCTION_PLAN_SERVICE_BASE_URL.trim() !== "") {
    assertProductionSafeUrl({
      environment: validatedConfig.NODE_ENV,
      name: "PRODUCTION_PLAN_SERVICE_BASE_URL",
      value: validatedConfig.PRODUCTION_PLAN_SERVICE_BASE_URL,
      forbiddenSubstrings: ["localhost", "127.0.0.1"]
    });
  }

  return validatedConfig;
}
