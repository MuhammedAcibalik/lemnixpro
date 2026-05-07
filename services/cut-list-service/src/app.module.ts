import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import path from "node:path";

import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { CutListModule } from "./modules/cut-list/cut-list.module";

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
    CommonModule,
    HealthModule,
    InfrastructureModule,
    CutListModule
  ]
})
export class AppModule {}
