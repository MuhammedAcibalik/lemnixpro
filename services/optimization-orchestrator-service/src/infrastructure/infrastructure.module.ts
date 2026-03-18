import { Module } from "@nestjs/common";

import { DatabaseModule } from "./db/database.module";
import { HttpInfrastructureModule } from "./http/http-infrastructure.module";
import { RabbitMqModule } from "./messaging/rabbitmq.module";

@Module({
  imports: [DatabaseModule, RabbitMqModule, HttpInfrastructureModule],
  exports: [DatabaseModule, RabbitMqModule, HttpInfrastructureModule]
})
export class InfrastructureModule {}
