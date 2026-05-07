import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { MainProfilesController } from "./main-profiles.controller";

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [MainProfilesController]
})
export class MainProfilesModule {}
