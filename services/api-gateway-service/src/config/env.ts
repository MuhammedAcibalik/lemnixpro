import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync
} from "class-validator";

import { asNumber } from "@lemnixpro/shared-utils";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "api-gateway-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  JWT_SECRET = "replace-with-a-long-random-secret";

  @IsString()
  JWT_ISSUER = "lemnixpro";

  @IsString()
  JWT_AUDIENCE = "lemnixpro-internal";

  @IsString()
  JWT_EXPIRES_IN = "8h";

  @IsUrl()
  IDENTITY_SERVICE_BASE_URL = "http://localhost:3002";
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(
      typeof config.PORT === "string" ? config.PORT : undefined,
      3001
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
