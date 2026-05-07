import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
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
  SERVICE_NAME = "cut-list-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3005;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

  @IsString()
  RABBITMQ_URL = "amqp://guest:guest@localhost:5672";

  @IsInt()
  @Min(1)
  @Max(300000)
  UPSTREAM_REQUEST_TIMEOUT_MS = 8000;

  @IsUrl({
    require_tld: false
  })
  PRODUCTION_PLAN_SERVICE_BASE_URL = "http://localhost:3004";

  @IsUrl({
    require_tld: false
  })
  MASTER_DATA_SERVICE_BASE_URL = "http://localhost:3003";

  @IsString()
  CUT_LIST_RETRY_EXCHANGE = "cut-list.retry.exchange";

  @IsString()
  CUT_LIST_DEAD_LETTER_EXCHANGE = "cut-list.dlx";

  @IsString()
  CUT_LIST_BATCH_ACTIVATED_QUEUE = "cut-list.production-plan.batch-activated";

  @IsString()
  CUT_LIST_BATCH_ACTIVATED_RETRY_QUEUE =
    "cut-list.production-plan.batch-activated.retry";

  @IsString()
  CUT_LIST_BATCH_ACTIVATED_DEAD_LETTER_QUEUE =
    "cut-list.production-plan.batch-activated.dlq";

  @IsInt()
  @Min(1000)
  @Max(300000)
  RABBITMQ_RETRY_DELAY_MS = 30000;

  @IsInt()
  @Min(1)
  @Max(100)
  RABBITMQ_MAX_ATTEMPTS = 5;
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
    PORT: asNumber(config.PORT, 3005),
    UPSTREAM_REQUEST_TIMEOUT_MS: asNumber(
      config.UPSTREAM_REQUEST_TIMEOUT_MS,
      8000
    ),
    RABBITMQ_RETRY_DELAY_MS: asNumber(
      config.RABBITMQ_RETRY_DELAY_MS,
      30000
    ),
    RABBITMQ_MAX_ATTEMPTS: asNumber(
      config.RABBITMQ_MAX_ATTEMPTS,
      5
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
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "PRODUCTION_PLAN_SERVICE_BASE_URL",
    value: validatedConfig.PRODUCTION_PLAN_SERVICE_BASE_URL,
    forbiddenSubstrings: ["localhost", "127.0.0.1"]
  });
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "MASTER_DATA_SERVICE_BASE_URL",
    value: validatedConfig.MASTER_DATA_SERVICE_BASE_URL,
    forbiddenSubstrings: ["localhost", "127.0.0.1"]
  });

  return validatedConfig;
}
