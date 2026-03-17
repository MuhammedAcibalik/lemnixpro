import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as schema from "./schema";

async function runMigration(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run identity-service migrations.");
  }

  const pool = new Pool({
    connectionString
  });

  try {
    const database = drizzle(pool, { schema });

    await migrate(database, {
      migrationsFolder: path.resolve(__dirname, "../../../database/migrations")
    });

    console.log("identity-service migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

void runMigration().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
