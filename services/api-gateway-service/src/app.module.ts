import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import path from "node:path";

import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { FacilityContextModule } from "./infrastructure/facility-context/facility-context.module";
import { GatewayModule } from "./modules/auth/gateway.module";
import { CutListsModule } from "./modules/cut-lists/cut-lists.module";
import { MainProfilesModule } from "./modules/main-profiles/main-profiles.module";
import { OptimizationRequestsModule } from "./modules/optimization-requests/optimization-requests.module";
import { ProductionPlanModule } from "./modules/production-plan/production-plan.module";
import { ResultsModule } from "./modules/results/results.module";
import { WorkspaceModule } from "./modules/workspace/workspace.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        path.resolve(__dirname, "..", ".env"),
        path.resolve(__dirname, "..", "..", "..", ".env")
      ],
      validate: validateEnv
    }),
    // Default config for @Throttle() / ThrottlerGuard on specific routes (e.g. login).
    // Do not register ThrottlerGuard globally: authenticated API traffic (uploads, paged rows)
    // legitimately exceeds a low per-IP limit and caused ThrottlerException for clients.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10
      }
    ]),
    CommonModule,
    HealthModule,
    FacilityContextModule,
    GatewayModule,
    CutListsModule,
    MainProfilesModule,
    OptimizationRequestsModule,
    ProductionPlanModule,
    ResultsModule,
    WorkspaceModule
  ]
})
export class AppModule {}
