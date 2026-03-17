import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { MainProfilesController } from "./main-profiles/main-profiles.controller";
import { MainProfilesRepository } from "./main-profiles/main-profiles.repository";
import { MainProfilesService } from "./main-profiles/main-profiles.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [MainProfilesController],
  providers: [MainProfilesService, MainProfilesRepository]
})
export class MasterDataModule {}
