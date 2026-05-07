import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import {
  InternalResultsController,
  ResultsController
} from "./results.controller";
import { ResultEventsConsumer } from "./result-events.consumer";
import { ResultsRepository } from "./results.repository";
import { ResultsService } from "./results.service";

@Module({
  imports: [InfrastructureModule],
  controllers: [ResultsController, InternalResultsController],
  providers: [ResultsService, ResultsRepository, ResultEventsConsumer],
  exports: [ResultsService]
})
export class ResultModule {}
