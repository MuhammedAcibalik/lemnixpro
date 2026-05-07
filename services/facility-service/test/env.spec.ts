import { describe, expect, it } from "vitest";

import { validateEnv } from "../src/config/env";

describe("facility-service environment validation", () => {
  it("uses safe development defaults", () => {
    const env = validateEnv({});

    expect(env.SERVICE_NAME).toBe("facility-service");
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3009);
    expect(env.ENABLE_SWAGGER).toBe(true);
  });

  it("rejects unsafe production database and internal auth defaults", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/lemnixpro",
        INTERNAL_SERVICE_AUTH_SECRET: ""
      })
    ).toThrow(/INTERNAL_SERVICE_AUTH_SECRET|DATABASE_URL/);
  });
});
