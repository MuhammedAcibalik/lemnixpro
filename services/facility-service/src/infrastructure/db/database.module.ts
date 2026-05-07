import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

import { createDatabaseClient } from "./client";
import { DATABASE_CLIENT, DATABASE_POOL } from "./database.tokens";

class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new Pool({
          connectionString: configService.getOrThrow<string>("DATABASE_URL")
        })
    },
    {
      provide: DATABASE_CLIENT,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => createDatabaseClient(pool)
    },
    {
      provide: DatabaseLifecycle,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => new DatabaseLifecycle(pool)
    }
  ],
  exports: [DATABASE_CLIENT, DATABASE_POOL]
})
export class DatabaseModule {}
