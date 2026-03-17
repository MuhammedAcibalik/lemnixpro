import { createServer } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse } from "@lemnixpro/shared-contracts";

type ProtectedPingResponse = {
  message: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "PLANNER" | "VIEWER";
    isActive: boolean;
  };
};

describe("api-gateway-service auth flow", () => {
  let app: INestApplication;
  let identityStubServer: ReturnType<typeof createServer>;
  let AppModule: typeof import("../src/app.module").AppModule;

  beforeEach(async () => {
    const identityUser = {
      id: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
      email: "admin@example.com",
      fullName: "Platform Administrator",
      role: "ADMIN",
      isActive: true
    };

    identityStubServer = createServer((requestMessage, responseMessage) => {
      const requestUrl = requestMessage.url ?? "";

      if (requestMessage.method === "POST" && requestUrl === "/auth/login") {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            accessToken: "proxied-token",
            tokenType: "Bearer",
            expiresIn: "8h",
            user: identityUser
          })
        );
        return;
      }

      if (requestMessage.method === "GET" && requestUrl === "/auth/me") {
        const authorization = requestMessage.headers.authorization;

        if (!authorization || !authorization.startsWith("Bearer ")) {
          responseMessage.writeHead(401, {
            "content-type": "application/json"
          });
          responseMessage.end(JSON.stringify({ message: "Unauthorized" }));
          return;
        }

        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(JSON.stringify({ user: identityUser }));
        return;
      }

      responseMessage.writeHead(404, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify({ message: "Not found" }));
    });

    await new Promise<void>((resolve) => {
      identityStubServer.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });

    const address = identityStubServer.address();

    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve identity stub server address.");
    }

    process.env.SERVICE_NAME = "api-gateway-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3001";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_ISSUER = "lemnixpro";
    process.env.JWT_AUDIENCE = "lemnixpro-internal";
    process.env.JWT_EXPIRES_IN = "8h";
    process.env.IDENTITY_SERVICE_BASE_URL = `http://127.0.0.1:${address.port}`;

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
    await new Promise<void>((resolve, reject) => {
      identityStubServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("proxies login and protects ping with local JWT validation plus identity confirmation", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const loginResponse = await request(httpServer)
      .post("/auth/login")
      .send({
        email: "admin@example.com",
        password: "StrongPassword123!"
      })
      .expect(200);
    const loginBody = loginResponse.body as LoginResponse;

    expect(loginBody).toEqual({
      accessToken: "proxied-token",
      tokenType: "Bearer",
      expiresIn: "8h",
      user: {
        id: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "ADMIN",
        isActive: true
      }
    });

    const jwtService = new JwtService({
      secret: "test-jwt-secret",
      signOptions: {
        issuer: "lemnixpro",
        audience: "lemnixpro-internal",
        expiresIn: "8h"
      }
    });

    const accessToken = await jwtService.signAsync({
      sub: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
      email: "admin@example.com",
      role: "ADMIN"
    });

    const protectedResponse = await request(httpServer)
      .get("/protected/ping")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    const protectedBody = protectedResponse.body as ProtectedPingResponse;

    expect(protectedBody).toEqual({
      message: "Protected gateway route is authenticated.",
      user: {
        id: "8c1e695b-c401-4b8d-ae6d-973821ca9b22",
        email: "admin@example.com",
        fullName: "Platform Administrator",
        role: "ADMIN",
        isActive: true
      }
    });
  });
});
