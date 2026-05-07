import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type MasterDataDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): MasterDataDatabase {
  return drizzle(pool, {
    schema
  });
}