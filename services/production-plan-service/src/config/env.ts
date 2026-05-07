import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
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
  SERVICE_NAME = "production-plan-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3004;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

  @IsString()
  RABBITMQ_URL = "amqp://guest:guest@localhost:5672";

  @IsBoolean()
  PRODUCTION_PLAN_OUTBOX_ENABLED = true;

  @IsInt()
  @Min(1000)
  @Max(300000)
  PRODUCTION_PLAN_OUTBOX_INTERVAL_MS = 3000;

  @IsInt()
  @Min(1)
  @Max(100)
  PRODUCTION_PLAN_OUTBOX_MAX_ATTEMPTS = 5;

  @IsInt()
  @Min(1000)
  @Max(300000)
  PRODUCTION_PLAN_OUTBOX_RETRY_DELAY_MS = 30000;
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
    PORT: asNumber(config.PORT, 3004),
    PRODUCTION_PLAN_OUTBOX_ENABLED: asBoolean(
      typeof config.PRODUCTION_PLAN_OUTBOX_ENABLED === "string"
        ? config.PRODUCTION_PLAN_OUTBOX_ENABLED
        : undefined,
      true
    ),
    PRODUCTION_PLAN_OUTBOX_INTERVAL_MS: asNumber(
      config.PRODUCTION_PLAN_OUTBOX_INTERVAL_MS,
      3000
    ),
    PRODUCTION_PLAN_OUTBOX_MAX_ATTEMPTS: asNumber(
      config.PRODUCTION_PLAN_OUTBOX_MAX_ATTEMPTS,
      5
    ),
    PRODUCTION_PLAN_OUTBOX_RETRY_DELAY_MS: asNumber(
      config.PRODUCTION_PLAN_OUTBOX_RETRY_DELAY_MS,
      30000
    )
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
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "RABBITMQ_URL",
    value: validatedConfig.RABBITMQ_URL,
    forbiddenSubstrings: ["guest:guest@", "localhost", "127.0.0.1"]
  });

  return validatedConfig;
}
