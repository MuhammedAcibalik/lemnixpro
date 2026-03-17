import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type ProductionPlanDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): ProductionPlanDatabase {
  return drizzle(pool, {
    schema
  });
}
