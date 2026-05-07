import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type CutListDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): CutListDatabase {
  return drizzle(pool, {
    schema
  });
}
