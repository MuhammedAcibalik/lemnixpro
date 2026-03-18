import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync
} from "class-validator";

import { asNumber } from "@lemnixpro/shared-utils";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "optimization-orchestrator-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

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
  @IsNotEmpty()
  OPTIMIZATION_REQUEST_QUEUE = "optimization.requests";

  @IsUrl({
    require_tld: false
  })
  PRODUCTION_PLAN_SERVICE_BASE_URL = "http://localhost:3004";

  @IsUrl({
    require_tld: false
  })
  MASTER_DATA_SERVICE_BASE_URL = "http://localhost:3003";
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(
      typeof config.PORT === "string" ? config.PORT : undefined,
      3006
    )
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
