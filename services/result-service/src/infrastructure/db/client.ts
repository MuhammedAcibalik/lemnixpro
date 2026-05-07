import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type ResultDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): ResultDatabase {
  return drizzle(pool, {
    schema
  });
}
