import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
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
  SERVICE_NAME = "optimization-orchestrator-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3006;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  RABBITMQ_URL = "amqp://guest:guest@localhost:5672";

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

  @IsInt()
  @Min(1)
  @Max(300000)
  UPSTREAM_REQUEST_TIMEOUT_MS = 8000;

  @IsString()
  RABBITMQ_RETRY_EXCHANGE = "optimization.retry.exchange";

  @IsString()
  RABBITMQ_DEAD_LETTER_EXCHANGE = "optimization.dlx";

  @IsString()
  OPTIMIZATION_REQUEST_RETRY_QUEUE = "optimization.requests.retry";

  @IsString()
  OPTIMIZATION_REQUEST_DEAD_LETTER_QUEUE = "optimization.requests.dlq";

  @IsInt()
  @Min(1000)
  @Max(300000)
  RABBITMQ_RETRY_DELAY_MS = 30000;

  @IsString()
  @IsNotEmpty()
  OPTIMIZATION_REQUEST_QUEUE = "optimization.requests";

  @IsString()
  OPTIMIZATION_ORCHESTRATOR_STARTED_QUEUE = "optimization.orchestrator.started";

  @IsString()
  OPTIMIZATION_ORCHESTRATOR_COMPLETED_QUEUE =
    "optimization.orchestrator.completed";

  @IsString()
  OPTIMIZATION_ORCHESTRATOR_FAILED_QUEUE = "optimization.orchestrator.failed";

  @IsBoolean()
  OPTIMIZATION_LIFECYCLE_CONSUMER_ENABLED = true;

  @IsInt()
  @Min(1)
  @Max(86400)
  OPTIMIZATION_STALE_QUEUE_TIMEOUT_SEC = 900;

  @IsUrl({
    require_tld: false
  })
  PRODUCTION_PLAN_SERVICE_BASE_URL = "http://localhost:3004";

  @IsUrl({
    require_tld: false
  })
  MASTER_DATA_SERVICE_BASE_URL = "http://localhost:3003";

  @IsUrl({
    require_tld: false
  })
  CUT_LIST_SERVICE_BASE_URL = "http://localhost:3005";

  @IsUrl({
    require_tld: false
  })
  RESULT_SERVICE_BASE_URL = "http://localhost:3007";
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
    PORT: asNumber(
      typeof config.PORT === "string" ? config.PORT : undefined,
      3006
    ),
    UPSTREAM_REQUEST_TIMEOUT_MS: asNumber(
      typeof config.UPSTREAM_REQUEST_TIMEOUT_MS === "string"
        ? config.UPSTREAM_REQUEST_TIMEOUT_MS
        : undefined,
      8000
    ),
    RABBITMQ_RETRY_DELAY_MS: asNumber(
      typeof config.RABBITMQ_RETRY_DELAY_MS === "string"
        ? config.RABBITMQ_RETRY_DELAY_MS
        : undefined,
      30000
    ),
    OPTIMIZATION_LIFECYCLE_CONSUMER_ENABLED: asBoolean(
      typeof config.OPTIMIZATION_LIFECYCLE_CONSUMER_ENABLED === "string"
        ? config.OPTIMIZATION_LIFECYCLE_CONSUMER_ENABLED
        : undefined,
      environment !== "test"
    ),
    OPTIMIZATION_STALE_QUEUE_TIMEOUT_SEC: asNumber(
      typeof config.OPTIMIZATION_STALE_QUEUE_TIMEOUT_SEC === "string"
        ? config.OPTIMIZATION_STALE_QUEUE_TIMEOUT_SEC
        : undefined,
      900
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
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "CUT_LIST_SERVICE_BASE_URL",
    value: validatedConfig.CUT_LIST_SERVICE_BASE_URL,
    forbiddenSubstrings: ["localhost", "127.0.0.1"]
  });
  assertProductionSafeUrl({
    environment: validatedConfig.NODE_ENV,
    name: "RESULT_SERVICE_BASE_URL",
    value: validatedConfig.RESULT_SERVICE_BASE_URL,
    forbiddenSubstrings: ["localhost", "127.0.0.1"]
  });

  return validatedConfig;
}
