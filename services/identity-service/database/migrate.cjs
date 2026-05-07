const path = require("node:path");
const fs = require("node:fs");

const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const { Pool } = require("pg");

function readDatabaseUrl() {
  const envPath = path.resolve(__dirname, "..", ".env");

  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, "utf8").match(/^DATABASE_URL=(.*)$/m);

    if (match?.[1]) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return process.env.DATABASE_URL ?? "";
}

async function runMigration() {
  const connectionString = readDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required to run identity-service migrations (.env veya ortam)."
    );
  }

  const pool = new Pool({
    connectionString
  });

  try {
    const database = drizzle(pool);

    await migrate(database, {
      migrationsFolder: path.resolve(__dirname, "./migrations")
    });

    console.log("identity-service migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
