import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { OptimizationOrchestratorModule } from "./modules/optimization-orchestrator/optimization-orchestrator.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv
    }),
    CommonModule,
    HealthModule,
    InfrastructureModule,
    OptimizationOrchestratorModule
  ]
})
export class AppModule {}
