import { existsSync, readFileSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

function readDatabaseUrl(): string {
  const envFile = new URL(".env", import.meta.url);

  if (existsSync(envFile)) {
    const match = readFileSync(envFile, "utf8").match(/^DATABASE_URL=(.*)$/m);

    if (match?.[1]) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return process.env.DATABASE_URL ?? "";
}

export default defineConfig({
  schema: "./src/infrastructure/db/schema/**/*.ts",
  out: "./database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: readDatabaseUrl()
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations_production_plan"
  },
  strict: true,
  verbose: true
});
