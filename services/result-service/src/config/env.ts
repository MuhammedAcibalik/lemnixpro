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
  SERVICE_NAME = "result-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3007;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  RABBITMQ_URL = "amqp://guest:guest@localhost:5672";

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

  @IsString()
  RABBITMQ_DEAD_LETTER_EXCHANGE = "optimization.dlx";

  @IsString()
  OPTIMIZATION_RESULTS_COMPLETED_DEAD_LETTER_QUEUE =
    "optimization.results.completed.dlq";

  @IsString()
  OPTIMIZATION_RESULTS_FAILED_DEAD_LETTER_QUEUE =
    "optimization.results.failed.dlq";

  /** Max JSON/urlencoded body size (e.g. "50mb") for internal optimization result payloads. */
  @IsString()
  HTTP_JSON_BODY_LIMIT = "50mb";
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
    PORT: asNumber(config.PORT, 3007)
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
