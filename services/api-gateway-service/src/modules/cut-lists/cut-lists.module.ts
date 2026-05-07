import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { CutListsController } from "./cut-lists.controller";

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [CutListsController]
})
export class CutListsModule {}
