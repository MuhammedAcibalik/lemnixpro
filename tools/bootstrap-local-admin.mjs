#!/usr/bin/env node
/**
 * Yerel ilk admin: Identity + Gateway ayarlı iken tek sefer.
 * Repo kökünden: API_GATEWAY_BASE_URL ve identity .env BOOTSTRAP_* ile uyumlu.
 */

const gatewayBase =
  process.env.API_GATEWAY_BASE_URL?.replace(/\/$/, "") ??
  process.env.API_GATEWAY_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:3001";

const bootstrapSecret =
  process.env.BOOTSTRAP_SECRET ?? "lemnix-local-bootstrap-7c3a9e2b";

async function main() {
  const url = `${gatewayBase}/auth/bootstrap-admin`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "x-bootstrap-secret": bootstrapSecret
    }
  });

  /** @type {unknown} */
  let body;

  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status}`, JSON.stringify(body, null, 2));
    if (res.status === 403) {
      console.error("");
      console.error(
        "Kontrol: identity-service ALLOW_BOOTSTRAP_ADMIN=true ve BOOTSTRAP_ADMIN_SECRET aynı değilde mi?"
      );
    }

    if (res.status === 409) {
      console.error("");
      console.error(
        "Admin zaten var. Giriş: identity BOOTSTRAP_ADMIN_EMAIL ile giriş yolu veya oluşturduğun şifreyi kullan."
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("Bootstrap başarılı.");
  console.log("");
  console.log(
    "Giriş için identity BOOTSTRAP_ADMIN_EMAIL ve BOOTSTRAP_ADMIN_PASSWORD kullanın (aynı sıra .env)."
  );

  console.log(JSON.stringify(body, null, 2));
}

void main();
