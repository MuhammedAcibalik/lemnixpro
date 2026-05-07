import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { ResultsController } from "./results.controller";

@Module({
  imports: [HttpInfrastructureModule],
  controllers: [ResultsController]
})
export class ResultsModule {}
