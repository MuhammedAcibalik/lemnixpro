import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  validateSync
} from "class-validator";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "master-data-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3003;

  @IsString()
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";
}

function asNumber(value: unknown, fallback: number): number {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(config.PORT, 3003)
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
