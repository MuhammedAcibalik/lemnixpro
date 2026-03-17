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
  DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";

  @IsString()
  RABBITMQ_URL = "amqp://guest:guest@localhost:5672";
}

function asNumber(value: unknown, fallback: number): number {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, {
    ...config,
    PORT: asNumber(config.PORT, 3006)
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
