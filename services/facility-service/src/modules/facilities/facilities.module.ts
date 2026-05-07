import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { FacilitiesController } from "./facilities.controller";
import { FacilitiesRepository } from "./facilities.repository";
import { FacilitiesService } from "./facilities.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [FacilitiesController],
  providers: [FacilitiesService, FacilitiesRepository]
})
export class FacilitiesModule {}
