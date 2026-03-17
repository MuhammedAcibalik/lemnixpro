const path = require("node:path");

const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const { Pool } = require("pg");

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run identity-service migrations.");
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
