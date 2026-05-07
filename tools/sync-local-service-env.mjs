#!/usr/bin/env node
/**
 * Repo kökündeki .env içinden Postgres/Rabbit değerlerini okuyup yerel servis .env dosyalarını günceller.
 *
 * Güncellenenler: master-data, production-plan, cut-list, api-gateway, optimization-orchestrator,
 * result-service (tam yazım); engines/optimization-engine/.env (Rabbit + iç servis secret + result URL);
 * identity-service (merge): DATABASE_URL + INTERNAL_SERVICE_AUTH_SECRET.
 * Orchestrator/result/engine .env senkronize değilse kuyruk ilerlemez veya 401 oluşur.
 *
 * Çalıştır: pnpm sync:service-env (veya kök klasöründe node tools/sync-local-service-env.mjs)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = path.join(rootDir, ".env");

function parseEnvFile(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function readExistingSecret(serviceEnvPath, priorContent) {
  if (priorContent.includes("INTERNAL_SERVICE_AUTH_SECRET=")) {
    const m = priorContent.match(
      /^INTERNAL_SERVICE_AUTH_SECRET=(.*)$/m
    );

    const raw = m?.[1]?.trim() ?? "";
    return raw.replace(/^["']|["']$/g, "") || "lemnixpro-local-internal";
  }

  try {
    if (fs.existsSync(serviceEnvPath)) {
      return (
        parseEnvFile(fs.readFileSync(serviceEnvPath, "utf8"))
          .INTERNAL_SERVICE_AUTH_SECRET?.trim() || "lemnixpro-local-internal"
      );
    }
  } catch {
    // ignore
  }

  return "lemnixpro-local-internal";
}

function buildDatabaseUrl(infra) {
  const user = encodeURIComponent(infra.POSTGRES_USER ?? "postgres");
  const pass = encodeURIComponent(infra.POSTGRES_PASSWORD ?? "postgres");
  const db = infra.POSTGRES_DB ?? "lemnixpro";
  const port = infra.POSTGRES_PORT ?? "5432";
  const host = infra.POSTGRES_HOST ?? "127.0.0.1";

  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

function buildRabbitMqUrl(infra) {
  const user = encodeURIComponent(infra.RABBITMQ_DEFAULT_USER ?? "guest");
  const pass = encodeURIComponent(infra.RABBITMQ_DEFAULT_PASS ?? "guest");
  const port = infra.RABBITMQ_PORT ?? "5672";
  const host = infra.RABBITMQ_HOST ?? "127.0.0.1";

  return `amqp://${user}:${pass}@${host}:${port}`;
}

/**
 * Tek bir KEY=value satırını güncelle veya dosya sonuna ekle (yorum satırları korunur).
 * @param {string} content
 * @param {string} key
 * @param {string} value
 */
function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escapedKey}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const base = content.replace(/\s*$/, "");
  return base.length === 0 ? `${line}\n` : `${base}\n${line}\n`;
}

/**
 * identity-service: JWT / bootstrap satırlarını silmeden DB ve iç servis token’ını kök ile hizalar.
 * @param {string} databaseUrl
 * @param {string} sharedSecret
 */
function syncIdentityServiceEnv(databaseUrl, sharedSecret) {
  const rel = path.join("services", "identity-service", ".env");
  const full = path.join(rootDir, rel);
  const examplePath = path.join(
    rootDir,
    "services",
    "identity-service",
    ".env.example"
  );

  let content = "";
  if (fs.existsSync(full)) {
    content = fs.readFileSync(full, "utf8");
  } else if (fs.existsSync(examplePath)) {
    content = fs.readFileSync(examplePath, "utf8");
  }

  content = upsertEnvLine(content, "DATABASE_URL", databaseUrl);
  content = upsertEnvLine(content, "INTERNAL_SERVICE_AUTH_SECRET", sharedSecret);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  console.info("güncellendi:", path.relative(rootDir, full));
}

function ensureRootEnvExists() {
  if (!fs.existsSync(rootEnvPath)) {
    console.error(
      "Kök .env bulunamadı. Önce repoda `.env.example` ile bir dosya oluşturun.\n",
      rootEnvPath
    );
    process.exit(1);
  }
}

function main() {
  ensureRootEnvExists();

  const rootEnvRaw = fs.readFileSync(rootEnvPath, "utf8");
  const infra = parseEnvFile(rootEnvRaw);
  const databaseUrl = buildDatabaseUrl(infra);
  const rabbitUrl = buildRabbitMqUrl(infra);
  const rootSecret = infra.INTERNAL_SERVICE_AUTH_SECRET?.trim();

  const services = [
    {
      rel: path.join("services", "master-data-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=master-data-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3003",
          `DATABASE_URL=${databaseUrl}`,
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "PRODUCTION_PLAN_SERVICE_BASE_URL=http://127.0.0.1:3004",
          ""
        ].join("\n")
    },
    {
      rel: path.join("services", "production-plan-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=production-plan-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3004",
          `DATABASE_URL=${databaseUrl}`,
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          `RABBITMQ_URL=${rabbitUrl}`,
          "PRODUCTION_PLAN_OUTBOX_ENABLED=true",
          "PRODUCTION_PLAN_OUTBOX_INTERVAL_MS=3000",
          "PRODUCTION_PLAN_OUTBOX_MAX_ATTEMPTS=5",
          "PRODUCTION_PLAN_OUTBOX_RETRY_DELAY_MS=30000",
          ""
        ].join("\n")
    },
    {
      rel: path.join("services", "cut-list-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=cut-list-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3005",
          `DATABASE_URL=${databaseUrl}`,
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "UPSTREAM_REQUEST_TIMEOUT_MS=8000",
          "PRODUCTION_PLAN_SERVICE_BASE_URL=http://127.0.0.1:3004",
          "MASTER_DATA_SERVICE_BASE_URL=http://127.0.0.1:3003",
          `RABBITMQ_URL=${rabbitUrl}`,
          ""
        ].join("\n")
    },
    {
      rel: path.join("services", "api-gateway-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=api-gateway-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3001",
          "JWT_SECRET=replace-with-a-long-random-secret",
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "JWT_ISSUER=lemnixpro",
          "JWT_AUDIENCE=lemnixpro-internal",
          "JWT_EXPIRES_IN=8h",
          "UPSTREAM_REQUEST_TIMEOUT_MS=8000",
          "UPLOAD_REQUEST_TIMEOUT_MS=60000",
          "IDENTITY_SERVICE_BASE_URL=http://127.0.0.1:3002",
          "MASTER_DATA_SERVICE_BASE_URL=http://127.0.0.1:3003",
          "PRODUCTION_PLAN_SERVICE_BASE_URL=http://127.0.0.1:3004",
          "CUT_LIST_SERVICE_BASE_URL=http://127.0.0.1:3005",
          "OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL=http://127.0.0.1:3006",
          "RESULT_SERVICE_BASE_URL=http://127.0.0.1:3007",
          ""
        ].join("\n")
    },
    {
      rel: path.join("services", "optimization-orchestrator-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=optimization-orchestrator-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3006",
          `DATABASE_URL=${databaseUrl}`,
          `RABBITMQ_URL=${rabbitUrl}`,
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "UPSTREAM_REQUEST_TIMEOUT_MS=8000",
          "OPTIMIZATION_REQUEST_QUEUE=optimization.requests",
          "OPTIMIZATION_REQUEST_RETRY_QUEUE=optimization.requests.retry",
          "OPTIMIZATION_REQUEST_DEAD_LETTER_QUEUE=optimization.requests.dlq",
          "RABBITMQ_RETRY_EXCHANGE=optimization.retry.exchange",
          "RABBITMQ_DEAD_LETTER_EXCHANGE=optimization.dlx",
          "RABBITMQ_RETRY_DELAY_MS=30000",
          "PRODUCTION_PLAN_SERVICE_BASE_URL=http://127.0.0.1:3004",
          "MASTER_DATA_SERVICE_BASE_URL=http://127.0.0.1:3003",
          "CUT_LIST_SERVICE_BASE_URL=http://127.0.0.1:3005",
          "RESULT_SERVICE_BASE_URL=http://127.0.0.1:3007",
          ""
        ].join("\n")
    },
    {
      rel: path.join("services", "result-service", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır.",
          "SERVICE_NAME=result-service",
          "NODE_ENV=development",
          "LOG_LEVEL=info",
          "ENABLE_SWAGGER=true",
          "PORT=3007",
          `DATABASE_URL=${databaseUrl}`,
          `RABBITMQ_URL=${rabbitUrl}`,
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "RABBITMQ_DEAD_LETTER_EXCHANGE=optimization.dlx",
          "OPTIMIZATION_RESULTS_COMPLETED_DEAD_LETTER_QUEUE=optimization.results.completed.dlq",
          "OPTIMIZATION_RESULTS_FAILED_DEAD_LETTER_QUEUE=optimization.results.failed.dlq",
          ""
        ].join("\n")
    },
    {
      rel: path.join("engines", "optimization-engine", ".env"),
      lines: ([secret]) =>
        [
          "# Bu dosya pnpm sync:service-env ile kök .env ile hizalanır (Rabbit + result + iç servis).",
          "APP_NAME=optimization-engine",
          "APP_ENV=development",
          "HOST=0.0.0.0",
          "PORT=8000",
          "LOG_LEVEL=info",
          `RABBITMQ_URL=${rabbitUrl}`,
          "OPTIMIZATION_REQUEST_QUEUE=optimization.requests",
          "OPTIMIZATION_EXCHANGE=optimization.exchange",
          "OPTIMIZATION_REQUESTED_ROUTING_KEY=optimization.requested",
          "OPTIMIZATION_COMPLETED_ROUTING_KEY=optimization.completed",
          "OPTIMIZATION_FAILED_ROUTING_KEY=optimization.failed",
          "RABBITMQ_DEAD_LETTER_EXCHANGE=optimization.dlx",
          "RABBITMQ_RETRY_EXCHANGE=optimization.retry.exchange",
          "OPTIMIZATION_REQUEST_RETRY_QUEUE=optimization.requests.retry",
          "OPTIMIZATION_REQUEST_DEAD_LETTER_QUEUE=optimization.requests.dlq",
          "OPTIMIZATION_REQUEST_POISON_ROUTING_KEY=optimization.requested.poison",
          "RABBITMQ_RETRY_DELAY_MS=30000",
          `INTERNAL_SERVICE_AUTH_SECRET=${secret}`,
          "RESULT_SERVICE_BASE_URL=http://127.0.0.1:3007",
          ""
        ].join("\n")
    }
  ];

  const sharedSecret = /** @type {string} */ (
    (() => {
      if (rootSecret) {
        return rootSecret;
      }

      const mdPath = path.join(rootDir, "services", "master-data-service", ".env");
      const prev =
        fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
      return readExistingSecret(mdPath, prev);
    })()
  );

  for (const { rel, lines } of services) {
    const full = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });

    fs.writeFileSync(full, lines([sharedSecret]), "utf8");
    console.info("güncellendi:", path.relative(rootDir, full));
  }

  syncIdentityServiceEnv(databaseUrl, sharedSecret);

  console.info(
    "\nKök .env → Postgres / Rabbit / servis token ayarları servis .env dosyalarına yazıldı."
  );
  console.info(
    "Tüm mikroservislerde INTERNAL_SERVICE_AUTH_SECRET artık bu komutla hizalı; geliştirme sunucusunu yeniden başlatın. Optimizasyon 401 ise özellikle optimization-orchestrator + result-service .env güncellenmiş olmalı."
  );
  console.info(
    "Python optimization-engine: ikinci bir terminalde `pnpm dev:optimization-engine` (veya uvicorn); kuyruk (RabbitMQ) tüketicisi bu süreçtir — sadece `pnpm dev` yetmez."
  );
}

main();
