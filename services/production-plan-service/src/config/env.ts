import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync
} from "class-validator";

class EnvironmentVariables {
  @IsString()
  SERVICE_NAME = "production-plan-service";

  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsString()
  LOG_LEVEL = "info";

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3004;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;
}

function asNumber(value: unknown, fallback: number): number {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(config.PORT, 3004)
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
