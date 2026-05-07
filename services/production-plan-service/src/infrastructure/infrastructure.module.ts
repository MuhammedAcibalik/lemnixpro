import { Module } from "@nestjs/common";

import { DatabaseModule } from "./db/database.module";
import { RabbitMqModule } from "./messaging/rabbitmq.module";

@Module({
  imports: [DatabaseModule, RabbitMqModule],
  exports: [DatabaseModule, RabbitMqModule]
})
export class InfrastructureModule {}
