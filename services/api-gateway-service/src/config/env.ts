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
  SERVICE_NAME = "api-gateway-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsBoolean()
  ENABLE_SWAGGER = true;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

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

  @IsInt()
  @Min(1)
  @Max(300000)
  UPSTREAM_REQUEST_TIMEOUT_MS = 8000;

  @IsInt()
  @Min(1)
  @Max(300000)
  UPLOAD_REQUEST_TIMEOUT_MS = 60000;

  @IsUrl({
    require_tld: false
  })
  IDENTITY_SERVICE_BASE_URL = "http://localhost:3002";

  @IsUrl({
    require_tld: false
  })
  MASTER_DATA_SERVICE_BASE_URL = "http://localhost:3003";

  @IsUrl({
    require_tld: false
  })
  PRODUCTION_PLAN_SERVICE_BASE_URL = "http://localhost:3004";

  @IsUrl({
    require_tld: false
  })
  CUT_LIST_SERVICE_BASE_URL = "http://localhost:3005";

  @IsUrl({
    require_tld: false
  })
  OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL = "http://localhost:3006";

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
      3001
    ),
    UPSTREAM_REQUEST_TIMEOUT_MS: asNumber(
      typeof config.UPSTREAM_REQUEST_TIMEOUT_MS === "string"
        ? config.UPSTREAM_REQUEST_TIMEOUT_MS
        : undefined,
      8000
    ),
    UPLOAD_REQUEST_TIMEOUT_MS: asNumber(
      typeof config.UPLOAD_REQUEST_TIMEOUT_MS === "string"
        ? config.UPLOAD_REQUEST_TIMEOUT_MS
        : undefined,
      60000
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
  for (const [name, value] of [
    ["IDENTITY_SERVICE_BASE_URL", validatedConfig.IDENTITY_SERVICE_BASE_URL],
    [
      "MASTER_DATA_SERVICE_BASE_URL",
      validatedConfig.MASTER_DATA_SERVICE_BASE_URL
    ],
    [
      "PRODUCTION_PLAN_SERVICE_BASE_URL",
      validatedConfig.PRODUCTION_PLAN_SERVICE_BASE_URL
    ],
    ["CUT_LIST_SERVICE_BASE_URL", validatedConfig.CUT_LIST_SERVICE_BASE_URL],
    [
      "OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL",
      validatedConfig.OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL
    ],
    ["RESULT_SERVICE_BASE_URL", validatedConfig.RESULT_SERVICE_BASE_URL]
  ] as const) {
    assertProductionSafeUrl({
      environment: validatedConfig.NODE_ENV,
      name,
      value,
      forbiddenSubstrings: ["localhost", "127.0.0.1"]
    });
  }

  return validatedConfig;
}
