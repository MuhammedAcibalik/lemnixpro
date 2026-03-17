import { plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateIf,
  validateSync
} from "class-validator";

import { asBoolean, asNumber } from "@lemnixpro/shared-utils";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "identity-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3002;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  JWT_SECRET = "replace-with-a-long-random-secret";

  @IsString()
  JWT_ISSUER = "lemnixpro";

  @IsString()
  JWT_AUDIENCE = "lemnixpro-internal";

  @IsString()
  JWT_EXPIRES_IN = "8h";

  @IsBoolean()
  ALLOW_BOOTSTRAP_ADMIN = false;

  @ValidateIf(
    (environment: EnvironmentVariables) =>
      environment.ALLOW_BOOTSTRAP_ADMIN === true
  )
  @IsString()
  BOOTSTRAP_ADMIN_SECRET?: string;

  @ValidateIf(
    (environment: EnvironmentVariables) =>
      environment.ALLOW_BOOTSTRAP_ADMIN === true
  )
  @IsString()
  BOOTSTRAP_ADMIN_EMAIL?: string;

  @ValidateIf(
    (environment: EnvironmentVariables) =>
      environment.ALLOW_BOOTSTRAP_ADMIN === true
  )
  @IsString()
  BOOTSTRAP_ADMIN_PASSWORD?: string;

  @ValidateIf(
    (environment: EnvironmentVariables) =>
      environment.ALLOW_BOOTSTRAP_ADMIN === true
  )
  @IsString()
  BOOTSTRAP_ADMIN_FULL_NAME?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(
      typeof config.PORT === "string" ? config.PORT : undefined,
      3002
    ),
    ALLOW_BOOTSTRAP_ADMIN: asBoolean(
      typeof config.ALLOW_BOOTSTRAP_ADMIN === "string"
        ? config.ALLOW_BOOTSTRAP_ADMIN
        : undefined,
      false
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
