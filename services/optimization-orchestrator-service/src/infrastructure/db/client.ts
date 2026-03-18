import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type OptimizationOrchestratorDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(
  pool: Pool
): OptimizationOrchestratorDatabase {
  return drizzle(pool, {
    schema
  });
}
