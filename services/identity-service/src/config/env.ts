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

import {
  asBoolean,
  asNumber,
  assertProductionSafeSecret,
  assertProductionSafeUrl
} from "@lemnixpro/shared-utils";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "identity-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3002;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  JWT_SECRET = "replace-with-a-long-random-secret";

  @IsString()
  INTERNAL_SERVICE_AUTH_SECRET = "";

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

  assertProductionSafeSecret({
    environment: validatedConfig.NODE_ENV,
    name: "JWT_SECRET",
    value: validatedConfig.JWT_SECRET,
    forbiddenValues: ["replace-with-a-long-random-secret"]
  });
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

  return validatedConfig;
}
