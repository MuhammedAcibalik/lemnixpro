import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv
    }),
    CommonModule,
    HealthModule,
    IdentityModule
  ]
})
export class AppModule {}
