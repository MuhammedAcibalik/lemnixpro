import { Module } from "@nestjs/common";

import { DatabaseModule } from "./db/database.module";

@Module({
  imports: [DatabaseModule],
  exports: [DatabaseModule]
})
export class InfrastructureModule {}
