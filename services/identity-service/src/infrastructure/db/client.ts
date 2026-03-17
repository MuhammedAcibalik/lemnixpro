import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type IdentityDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): IdentityDatabase {
  return drizzle(pool, {
    schema
  });
}
