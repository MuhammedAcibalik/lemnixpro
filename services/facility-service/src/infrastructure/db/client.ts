import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type FacilityDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(pool: Pool): FacilityDatabase {
  return drizzle(pool, {
    schema
  });
}
