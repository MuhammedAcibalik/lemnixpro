import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TestGrantRecord = {
  id: string;
  userId: string;
  facilityId: string;
  facilityRole: string;
  moduleKeys: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type FacilityAccessResponseBody = {
  defaultFacilityId?: string | null;
  allowed?: boolean;
  reason?: string;
};

describe("identity-service facility access", () => {
  let app: INestApplication;
  let AppModule: typeof import("../src/app.module").AppModule;
  let UsersRepository: typeof import("../src/modules/identity/users.repository").UsersRepository;
  let FacilityAccessRepository: typeof import("../src/modules/identity/facility-access.repository").FacilityAccessRepository;
  const users = new Map<string, TestUser>();
  const grantsByUserId = new Map<string, TestGrantRecord[]>();

  beforeEach(async () => {
    process.env.SERVICE_NAME = "identity-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3002";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lemnixpro";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_ISSUER = "lemnixpro";
    process.env.JWT_AUDIENCE = "lemnixpro-internal";
    process.env.JWT_EXPIRES_IN = "8h";
    process.env.ALLOW_BOOTSTRAP_ADMIN = "false";
    users.clear();
    grantsByUserId.clear();

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));
    ({ UsersRepository } = await import("../src/modules/identity/users.repository"));
    ({ FacilityAccessRepository } = await import("../src/modules/identity/facility-access.repository"));

    const usersRepository = {
      findByEmail(email: string) {
        return Promise.resolve(
          Array.from(users.values()).find((user) => user.email === email) ?? null
        );
      },
      findById(id: string) {
        return Promise.resolve(users.get(id) ?? null);
      },
      hasAdmin() {
        return Promise.resolve(
          Array.from(users.values()).some(
            (user) => user.role === "ADMIN" || user.role === "SUPER_ADMIN"
          )
        );
      },
      create() {
        return Promise.reject(
          new Error("Not used in facility access tests.")
        );
      }
    };
    const facilityAccessRepository = {
      findByUserId(userId: string) {
        return Promise.resolve(grantsByUserId.get(userId) ?? []);
      },
      replaceForUser(
        userId: string,
        grants: Array<{
          facilityId: string;
          facilityRole: string;
          moduleKeys: string[];
          isDefault: boolean;
        }>
      ) {
        const now = "2026-05-07T00:00:00.000Z";
        const records = grants.map((grant, index) => ({
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          userId,
          facilityId: grant.facilityId,
          facilityRole: grant.facilityRole,
          moduleKeys: grant.moduleKeys,
          isDefault: grant.isDefault,
          createdAt: now,
          updatedAt: now
        }));

        records.sort((left, right) => {
          if (left.isDefault !== right.isDefault) {
            return left.isDefault ? -1 : 1;
          }

          return left.facilityId.localeCompare(right.facilityId);
        });
        grantsByUserId.set(userId, records);

        return Promise.resolve(records);
      }
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(UsersRepository)
      .useValue(usersRepository)
      .overrideProvider(FacilityAccessRepository)
      .useValue(facilityAccessRepository)
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

  it("creates, replaces, and lists explicit facility grants for a user", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const user = addUser("PLANNER");

    const putResponse = await request(httpServer)
      .put(`/users/${user.id}/facility-grants`)
      .send({
        grants: [
          {
            facilityId: "facility-izmir",
            facilityRole: "FACILITY_PLANNER",
            moduleKeys: ["workspace", "optimization"],
            isDefault: true
          },
          {
            facilityId: "facility-ankara",
            facilityRole: "FACILITY_VIEWER",
            moduleKeys: ["workspace", "results"],
            isDefault: false
          }
        ]
      })
      .expect(200);

    expect(putResponse.body).toMatchObject({
      userId: user.id,
      effectiveRole: "PLANNER",
      canUseAllFacilities: false,
      defaultFacilityId: "facility-izmir",
      grants: [
        {
          facilityId: "facility-izmir",
          facilityRole: "FACILITY_PLANNER",
          moduleKeys: ["workspace", "optimization"],
          isDefault: true
        },
        {
          facilityId: "facility-ankara",
          facilityRole: "FACILITY_VIEWER",
          moduleKeys: ["workspace", "results"],
          isDefault: false
        }
      ]
    });

    const getResponse = await request(httpServer)
      .get(`/users/${user.id}/facility-access`)
      .expect(200);

    expect(getResponse.body).toEqual(putResponse.body);
  });

  it("rejects duplicate grant rows and multiple default facilities", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const user = addUser("PLANNER");

    await request(httpServer)
      .put(`/users/${user.id}/facility-grants`)
      .send({
        grants: [
          {
            facilityId: "facility-izmir",
            facilityRole: "FACILITY_PLANNER",
            moduleKeys: ["workspace"],
            isDefault: true
          },
          {
            facilityId: "facility-izmir",
            facilityRole: "FACILITY_VIEWER",
            moduleKeys: ["results"],
            isDefault: false
          }
        ]
      })
      .expect(400);

    await request(httpServer)
      .put(`/users/${user.id}/facility-grants`)
      .send({
        grants: [
          {
            facilityId: "facility-izmir",
            facilityRole: "FACILITY_PLANNER",
            moduleKeys: ["workspace"],
            isDefault: true
          },
          {
            facilityId: "facility-ankara",
            facilityRole: "FACILITY_VIEWER",
            moduleKeys: ["results"],
            isDefault: true
          }
        ]
      })
      .expect(400);
  });

  it("resolves normal user facility and module access explicitly", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const user = addUser("PLANNER");
    const token = await issueToken(user);

    await request(httpServer)
      .put(`/users/${user.id}/facility-grants`)
      .send({
        grants: [
          {
            facilityId: "facility-izmir",
            facilityRole: "FACILITY_PLANNER",
            moduleKeys: ["workspace", "optimization"],
            isDefault: true
          }
        ]
      })
      .expect(200);

    await request(httpServer)
      .get("/auth/me/facility-access")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.defaultFacilityId).toBe("facility-izmir");
      });

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "single",
        facilityId: "facility-izmir",
        moduleKey: "optimization"
      })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.allowed).toBe(true);
        expect(responseBody.reason).toBe("facility_module_granted");
      });

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "single",
        facilityId: "facility-ankara",
        moduleKey: "optimization"
      })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.allowed).toBe(false);
        expect(responseBody.reason).toBe("facility_not_granted");
      });

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "single",
        facilityId: "facility-izmir",
        moduleKey: "results"
      })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.allowed).toBe(false);
        expect(responseBody.reason).toBe("module_not_granted");
      });
  });

  it("allows SUPER_ADMIN all-scope access without materialized grants", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const user = addUser("SUPER_ADMIN");
    const token = await issueToken(user);

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "all",
        moduleKey: "two-d-nesting"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          userId: user.id,
          allowed: true,
          reason: "super_admin",
          context: {
            scope: "all",
            facilityId: null
          }
        });
      });
  });

  it("requires explicit CENTRAL_PLANNER grants before allowing all-scope module access", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const user = addUser("CENTRAL_PLANNER");
    const token = await issueToken(user);

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "all",
        moduleKey: "analytics"
      })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.allowed).toBe(false);
        expect(responseBody.reason).toBe("all_scope_not_granted");
      });

    await request(httpServer)
      .put(`/users/${user.id}/facility-grants`)
      .send({
        grants: [
          {
            facilityId: "facility-izmir",
            facilityRole: "CENTRAL_PLANNER",
            moduleKeys: ["analytics", "results"],
            isDefault: false
          }
        ]
      })
      .expect(200);

    await request(httpServer)
      .post("/auth/me/facility-access/resolve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        scope: "all",
        moduleKey: "analytics"
      })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as FacilityAccessResponseBody;

        expect(responseBody.allowed).toBe(true);
        expect(responseBody.reason).toBe("central_planner_module_granted");
      });
  });

  function addUser(role: string): TestUser {
    const now = "2026-05-07T00:00:00.000Z";
    const user: TestUser = {
      id: `00000000-0000-4000-8000-${String(users.size + 1).padStart(12, "0")}`,
      email: `${role.toLowerCase()}@example.com`,
      fullName: `${role} User`,
      passwordHash: "unused",
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    users.set(user.id, user);

    return user;
  }

  async function issueToken(user: TestUser): Promise<string> {
    const jwtService = new JwtService({
      secret: "test-jwt-secret",
      signOptions: {
        issuer: "lemnixpro",
        audience: "lemnixpro-internal",
        expiresIn: "8h"
      }
    });

    return jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role
    });
  }
});
