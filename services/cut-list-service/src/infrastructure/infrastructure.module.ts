import { Module } from "@nestjs/common";

import { DatabaseModule } from "./db/database.module";
import { HttpInfrastructureModule } from "./http/http-infrastructure.module";
import { RabbitMqModule } from "./messaging/rabbitmq.module";

@Module({
  imports: [DatabaseModule, HttpInfrastructureModule, RabbitMqModule],
  exports: [DatabaseModule, HttpInfrastructureModule, RabbitMqModule]
})
export class InfrastructureModule {}
