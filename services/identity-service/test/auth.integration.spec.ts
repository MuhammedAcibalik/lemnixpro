import crypto from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { newDb } from "pg-mem";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurrentUserResponse,
  LoginResponse
} from "@lemnixpro/shared-contracts";

type IdentityUserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: "ADMIN" | "PLANNER" | "VIEWER";
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type QueryResult<Row> = {
  rows: Row[];
};

type QueryablePool = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>;
};

type IdentityRepositoryShape = {
  findByEmail(email: string): Promise<ReturnType<typeof mapUserRow>>;
  findById(id: string): Promise<ReturnType<typeof mapUserRow>>;
  hasAdmin(): Promise<boolean>;
  create(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: "ADMIN" | "PLANNER" | "VIEWER";
    isActive: boolean;
  }): Promise<NonNullable<ReturnType<typeof mapUserRow>>>;
};

describe("identity-service auth flow", () => {
  let app: INestApplication;
  let AppModule: typeof import("../src/app.module").AppModule;
  let UsersRepository: typeof import("../src/modules/identity/users.repository").UsersRepository;

  beforeEach(async () => {
    process.env.SERVICE_NAME = "identity-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3002";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lemnixpro";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_ISSUER = "lemnixpro";
    process.env.JWT_AUDIENCE = "lemnixpro-internal";
    process.env.JWT_EXPIRES_IN = "8h";
    process.env.ALLOW_BOOTSTRAP_ADMIN = "true";
    process.env.BOOTSTRAP_ADMIN_SECRET = "bootstrap-secret";
    process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "StrongPassword123!";
    process.env.BOOTSTRAP_ADMIN_FULL_NAME = "Platform Administrator";

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));
    ({ UsersRepository } = await import("../src/modules/identity/users.repository"));

    const memoryDatabase = newDb();
    memoryDatabase.public.registerFunction({
      name: "version",
      implementation: () => "pg-mem"
    });

    const adapter = memoryDatabase.adapters.createPg() as {
      Pool: new () => QueryablePool;
    };
    const pool = new adapter.Pool();

    await pool.query('create schema if not exists "identity";');
    await pool.query(
      "create type identity.user_role as enum ('ADMIN', 'PLANNER', 'VIEWER');"
    );
    await pool.query(`
      create table identity.users (
        id uuid primary key,
        email varchar(320) not null,
        password_hash text not null,
        full_name varchar(200) not null,
        role identity.user_role not null default 'VIEWER',
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await pool.query(
      "create unique index identity_users_email_unique on identity.users (email);"
    );

    const usersRepository: IdentityRepositoryShape = {
      async findByEmail(email: string) {
        const result = await pool.query<IdentityUserRow>(
          `select id, email, password_hash, full_name, role, is_active, created_at, updated_at
             from identity.users
            where email = $1
            limit 1`,
          [email]
        );

        return mapUserRow(result.rows[0]);
      },
      async findById(id: string) {
        const result = await pool.query<IdentityUserRow>(
          `select id, email, password_hash, full_name, role, is_active, created_at, updated_at
             from identity.users
            where id = $1
            limit 1`,
          [id]
        );

        return mapUserRow(result.rows[0]);
      },
      async hasAdmin() {
        const result = await pool.query<Record<string, unknown>>(
          `select 1
             from identity.users
            where role = 'ADMIN'
            limit 1`
        );

        return result.rows.length > 0;
      },
      async create(input: {
        email: string;
        passwordHash: string;
        fullName: string;
        role: "ADMIN" | "PLANNER" | "VIEWER";
        isActive: boolean;
      }) {
        const userId = crypto.randomUUID();
        const result = await pool.query<IdentityUserRow>(
          `insert into identity.users (id, email, password_hash, full_name, role, is_active)
           values ($1, $2, $3, $4, $5, $6)
           returning id, email, password_hash, full_name, role, is_active, created_at, updated_at`,
          [
            userId,
            input.email,
            input.passwordHash,
            input.fullName,
            input.role,
            input.isActive
          ]
        );

        const createdUser = mapUserRow(result.rows[0]);

        if (!createdUser) {
          throw new Error("Failed to create test user.");
        }

        return createdUser;
      }
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(UsersRepository)
      .useValue(usersRepository)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
      })
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("bootstraps an admin, logs in, and resolves the current user", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const bootstrapResponse = await request(httpServer)
      .post("/auth/bootstrap-admin")
      .set("X-Bootstrap-Secret", "bootstrap-secret")
      .expect(201);
    const bootstrapBody = bootstrapResponse.body as CurrentUserResponse;

    expect(typeof bootstrapBody.user.id).toBe("string");
    expect(bootstrapBody).toEqual({
      user: {
        id: bootstrapBody.user.id,
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "ADMIN",
        isActive: true
      }
    });

    const loginResponse = await request(httpServer)
      .post("/auth/login")
      .send({
        email: "ADMIN@EXAMPLE.COM",
        password: "StrongPassword123!"
      })
      .expect(200);
    const loginBody = loginResponse.body as LoginResponse;

    expect(typeof loginBody.accessToken).toBe("string");
    expect(typeof loginBody.user.id).toBe("string");
    expect(loginBody).toEqual({
      accessToken: loginBody.accessToken,
      tokenType: "Bearer",
      expiresIn: "8h",
      user: {
        id: loginBody.user.id,
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "ADMIN",
        isActive: true
      }
    });

    const meResponse = await request(httpServer)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const meBody = meResponse.body as CurrentUserResponse;

    expect(meBody).toEqual({
      user: {
        id: loginBody.user.id,
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "ADMIN",
        isActive: true
      }
    });
  });
});

function mapUserRow(
  row: IdentityUserRow | undefined
) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
  };
}
