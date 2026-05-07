import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { requestHeaders } from "@lemnixpro/shared-contracts";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CapturedRequest = {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown> | null;
};

describe("api-gateway-service facility context", () => {
  let app: INestApplication;
  let identityStubServer: ReturnType<typeof createServer>;
  let masterDataStubServer: ReturnType<typeof createServer>;
  let AppModule: typeof import("../src/app.module").AppModule;
  let identityRequests: CapturedRequest[];
  let masterDataRequests: CapturedRequest[];

  beforeEach(async () => {
    identityRequests = [];
    masterDataRequests = [];

    identityStubServer = createServer((requestMessage, responseMessage) => {
      void handleIdentityRequest(requestMessage, responseMessage);
    });

    masterDataStubServer = createServer((requestMessage, responseMessage) => {
      void handleMasterDataRequest(requestMessage, responseMessage);
    });

    async function handleIdentityRequest(
      requestMessage: IncomingMessage,
      responseMessage: ServerResponse
    ): Promise<void> {
      const requestUrl = requestMessage.url ?? "";

      if (
        requestMessage.method === "POST" &&
        requestUrl === "/auth/me/facility-access/resolve"
      ) {
        const body = (await readJsonBody(requestMessage)) ?? {};
        identityRequests.push({
          method: requestMessage.method,
          url: requestUrl,
          headers: requestMessage.headers,
          body
        });

        const allowed =
          body.scope === "all" ||
          (body.scope === "single" &&
            body.facilityId === "facility-izmir" &&
            (body.moduleKey === "master-data" ||
              body.moduleKey === "production-plan"));

        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            userId: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
            allowed,
            reason: allowed
              ? body.scope === "all"
                ? "super_admin"
                : "facility_module_granted"
              : "facility_not_granted",
            context:
              body.scope === "all"
                ? {
                    scope: "all",
                    facilityId: null
                  }
                : {
                    scope: "single",
                    facilityId: body.facilityId
                  }
          })
        );
        return;
      }

      if (requestMessage.method === "GET" && requestUrl === "/auth/me") {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            user: {
              id: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
              email: "planner@example.com",
              fullName: "Plant Planner",
              role: "PLANNER",
              isActive: true
            }
          })
        );
        return;
      }

      responseMessage.writeHead(404, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify({ message: "Not found" }));
    }

    async function handleMasterDataRequest(
      requestMessage: IncomingMessage,
      responseMessage: ServerResponse
    ): Promise<void> {
      const requestUrl = requestMessage.url ?? "";
      const body = await readJsonBody(requestMessage);
      masterDataRequests.push({
        method: requestMessage.method ?? "GET",
        url: requestUrl,
        headers: requestMessage.headers,
        body
      });

      if (requestMessage.method === "GET" && requestUrl === "/main-profiles") {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify([
            {
              facilityId: requestMessage.headers[requestHeaders.facilityId],
              facilityScope: requestMessage.headers[requestHeaders.facilityScope]
            }
          ])
        );
        return;
      }

      if (requestMessage.method === "POST" && requestUrl === "/main-profiles") {
        responseMessage.writeHead(201, {
          "content-type": "application/json"
        });
        responseMessage.end(JSON.stringify({ id: "created" }));
        return;
      }

      if (
        requestMessage.method === "GET" &&
        requestUrl === "/production-plan-imports"
      ) {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify([
            {
              facilityId: requestMessage.headers[requestHeaders.facilityId],
              facilityScope: requestMessage.headers[requestHeaders.facilityScope],
              route: "production-plan-imports"
            }
          ])
        );
        return;
      }

      if (
        requestMessage.method === "POST" &&
        /^\/production-plan-imports\/[^/]+\/activate$/.test(requestUrl)
      ) {
        const [, , batchId] = requestUrl.split("/");
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            id: batchId,
            facilityId: requestMessage.headers[requestHeaders.facilityId],
            facilityScope: requestMessage.headers[requestHeaders.facilityScope]
          })
        );
        return;
      }

      responseMessage.writeHead(404, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify({ message: "Not found" }));
    }

    const identityBaseUrl = await listen(identityStubServer);
    const masterDataBaseUrl = await listen(masterDataStubServer);

    process.env.SERVICE_NAME = "api-gateway-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3001";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_ISSUER = "lemnixpro";
    process.env.JWT_AUDIENCE = "lemnixpro-internal";
    process.env.JWT_EXPIRES_IN = "8h";
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "test-internal-secret";
    process.env.IDENTITY_SERVICE_BASE_URL = identityBaseUrl;
    process.env.MASTER_DATA_SERVICE_BASE_URL = masterDataBaseUrl;
    process.env.PRODUCTION_PLAN_SERVICE_BASE_URL = masterDataBaseUrl;
    process.env.CUT_LIST_SERVICE_BASE_URL = masterDataBaseUrl;
    process.env.OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL = masterDataBaseUrl;
    process.env.RESULT_SERVICE_BASE_URL = masterDataBaseUrl;

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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

    await closeServer(identityStubServer);
    await closeServer(masterDataStubServer);
  });

  it("authorizes and forwards a single active facility context", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");

    const response = await request(httpServer)
      .get("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityId, "facility-izmir")
      .set(requestHeaders.facilityScope, "single")
      .expect(200);

    expect(identityRequests).toHaveLength(1);
    expect(identityRequests[0]?.headers.authorization).toBe(
      `Bearer ${accessToken}`
    );
    expect(identityRequests[0]?.body).toMatchObject({
      scope: "single",
      facilityId: "facility-izmir",
      moduleKey: "master-data"
    });
    expect(response.body).toEqual([
      {
        facilityId: "facility-izmir",
        facilityScope: "single"
      }
    ]);
  });

  it("defaults scope to single when a facility id header is present", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");

    const response = await request(httpServer)
      .get("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityId, "facility-izmir")
      .expect(200);

    expect(response.body).toEqual([
      {
        facilityId: "facility-izmir",
        facilityScope: "single"
      }
    ]);
  });

  it("keeps existing downstream flows unchanged when facility headers are absent", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");

    const response = await request(httpServer)
      .get("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(identityRequests).toHaveLength(0);
    expect(masterDataRequests).toHaveLength(1);
    expect(masterDataRequests[0]?.headers[requestHeaders.facilityId]).toBeUndefined();
    expect(masterDataRequests[0]?.headers[requestHeaders.facilityScope]).toBeUndefined();
    expect(response.body).toEqual([{}]);
  });

  it("rejects invalid facility scope before calling downstream services", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");

    await request(httpServer)
      .get("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityScope, "regional")
      .expect(400);

    expect(identityRequests).toHaveLength(0);
    expect(masterDataRequests).toHaveLength(0);
  });

  it("does not allow all-facility scope for write-like gateway requests", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("SUPER_ADMIN");

    await request(httpServer)
      .post("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityScope, "all")
      .send({
        code: "MP-01",
        name: "Main Profile",
        stockLengthMm: 6000,
        linkedProductCode: "P-01",
        linkedProductName: "Product"
      })
      .expect(403);

    expect(identityRequests).toHaveLength(0);
    expect(masterDataRequests).toHaveLength(0);
  });

  it("allows privileged all-facility read scope and forwards it without a facility id", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("SUPER_ADMIN");

    const response = await request(httpServer)
      .get("/main-profiles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityScope, "all")
      .expect(200);

    expect(identityRequests).toHaveLength(1);
    expect(identityRequests[0]?.body).toMatchObject({
      scope: "all",
      moduleKey: "master-data"
    });
    expect(response.body).toEqual([
      {
        facilityScope: "all"
      }
    ]);
  });

  it("authorizes and forwards production-plan facility context", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");

    const response = await request(httpServer)
      .get("/production-plan-imports")
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityId, "facility-izmir")
      .expect(200);

    expect(identityRequests).toHaveLength(1);
    expect(identityRequests[0]?.body).toMatchObject({
      scope: "single",
      facilityId: "facility-izmir",
      moduleKey: "production-plan"
    });
    expect(response.body).toEqual([
      {
        facilityId: "facility-izmir",
        facilityScope: "single",
        route: "production-plan-imports"
      }
    ]);
  });

  it("forwards single facility context on production-plan write routes", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const accessToken = await issueToken("PLANNER");
    const batchId = "11111111-1111-4111-8111-111111111111";

    const response = await request(httpServer)
      .post(`/production-plan-imports/${batchId}/activate`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set(requestHeaders.facilityId, "facility-izmir")
      .expect(200);

    expect(response.body).toEqual({
      id: batchId,
      facilityId: "facility-izmir",
      facilityScope: "single"
    });
  });

  async function issueToken(role: string): Promise<string> {
    const jwtService = new JwtService({
      secret: "test-jwt-secret",
      signOptions: {
        issuer: "lemnixpro",
        audience: "lemnixpro-internal",
        expiresIn: "8h"
      }
    });

    return jwtService.signAsync({
      sub: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
      email: "planner@example.com",
      role
    });
  }
});

async function readJsonBody(
  requestMessage: IncomingMessage
): Promise<Record<string, unknown> | null> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of requestMessage) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Uint8Array)
    );
  }

  if (chunks.length === 0) {
    return null;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (rawBody.trim() === "") {
    return null;
  }

  return JSON.parse(rawBody) as Record<string, unknown>;
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve stub server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(
  server: ReturnType<typeof createServer>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
