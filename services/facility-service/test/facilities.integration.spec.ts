import crypto from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreateFacilityRequest,
  Facility,
  FacilityStatus,
  UpdateFacilityRequest
} from "@lemnixpro/shared-contracts";

type FacilityRecord = Facility;

type FacilitiesRepositoryShape = {
  create(input: {
    code: string;
    name: string;
    status: FacilityStatus;
  }): Promise<FacilityRecord>;
  findAll(): Promise<FacilityRecord[]>;
  findById(id: string): Promise<FacilityRecord | null>;
  findByCode(code: string): Promise<FacilityRecord | null>;
  update(
    id: string,
    input: Partial<{
      code: string;
      name: string;
      status: FacilityStatus;
    }>
  ): Promise<FacilityRecord | null>;
};

describe("facility-service facilities API", () => {
  let app: INestApplication;
  let AppModule: typeof import("../src/app.module").AppModule;
  let FacilitiesRepository: typeof import("../src/modules/facilities/facilities.repository").FacilitiesRepository;

  beforeEach(async () => {
    process.env.SERVICE_NAME = "facility-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3009";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lemnixpro";
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "";

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));
    ({ FacilitiesRepository } = await import(
      "../src/modules/facilities/facilities.repository"
    ));

    const facilities = new Map<string, FacilityRecord>();

    const facilitiesRepository: FacilitiesRepositoryShape = {
      async create(input) {
        const existing = await this.findByCode(input.code);

        if (existing) {
          const error = new Error("duplicate facility code") as Error & {
            code?: string;
            constraint?: string;
          };
          error.code = "23505";
          error.constraint = "facility_facilities_code_unique";
          throw error;
        }

        const timestamp = new Date().toISOString();
        const facility: FacilityRecord = {
          id: crypto.randomUUID(),
          code: input.code,
          name: input.name,
          status: input.status,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        facilities.set(facility.id, facility);

        return facility;
      },
      findAll() {
        return Promise.resolve(
          [...facilities.values()].sort((left, right) =>
            left.code.localeCompare(right.code)
          )
        );
      },
      findById(id) {
        return Promise.resolve(facilities.get(id) ?? null);
      },
      findByCode(code) {
        const normalizedCode = code.trim().toUpperCase();

        return Promise.resolve(
          [...facilities.values()].find(
            (facility) => facility.code === normalizedCode
          ) ?? null
        );
      },
      update(id, input) {
        const existing = facilities.get(id);

        if (!existing) {
          return Promise.resolve(null);
        }

        const next: FacilityRecord = {
          ...existing,
          ...input,
          updatedAt: new Date().toISOString()
        };

        facilities.set(id, next);

        return Promise.resolve(next);
      }
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(FacilitiesRepository)
      .useValue(facilitiesRepository)
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

  it("creates, lists, fetches, updates, and toggles facilities", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const createPayload: CreateFacilityRequest = {
      code: " izm-01 ",
      name: " Izmir Production Plant "
    };

    const createResponse = await request(httpServer)
      .post("/facilities")
      .send(createPayload)
      .expect(201);
    const createdFacility = createResponse.body as Facility;

    expect(createdFacility).toEqual({
      id: createdFacility.id,
      code: "IZM-01",
      name: "Izmir Production Plant",
      status: "active",
      createdAt: createdFacility.createdAt,
      updatedAt: createdFacility.updatedAt
    });

    const listResponse = await request(httpServer).get("/facilities").expect(200);
    expect(listResponse.body).toEqual([createdFacility]);

    const detailResponse = await request(httpServer)
      .get(`/facilities/${createdFacility.id}`)
      .expect(200);
    expect(detailResponse.body).toEqual(createdFacility);

    const updatePayload: UpdateFacilityRequest = {
      name: " Izmir Assembly Plant ",
      status: "inactive"
    };
    const updateResponse = await request(httpServer)
      .patch(`/facilities/${createdFacility.id}`)
      .send(updatePayload)
      .expect(200);
    const inactiveFacility = updateResponse.body as Facility;

    expect(inactiveFacility).toEqual({
      ...createdFacility,
      name: "Izmir Assembly Plant",
      status: "inactive",
      updatedAt: inactiveFacility.updatedAt
    });

    const inactiveListResponse = await request(httpServer)
      .get("/facilities")
      .expect(200);
    expect(inactiveListResponse.body).toEqual([inactiveFacility]);

    const activateResponse = await request(httpServer)
      .patch(`/facilities/${createdFacility.id}/activate`)
      .expect(200);
    expect((activateResponse.body as Facility).status).toBe("active");

    const deactivateResponse = await request(httpServer)
      .patch(`/facilities/${createdFacility.id}/deactivate`)
      .expect(200);
    expect((deactivateResponse.body as Facility).status).toBe("inactive");
  });

  it("rejects duplicate facility codes and empty update payloads", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const firstCreateResponse = await request(httpServer)
      .post("/facilities")
      .send({
        code: "ank-01",
        name: "Ankara Plant"
      })
      .expect(201);
    const createdFacility = firstCreateResponse.body as Facility;

    await request(httpServer)
      .post("/facilities")
      .send({
        code: " ANK-01 ",
        name: "Duplicate Ankara Plant"
      })
      .expect(409);

    await request(httpServer)
      .patch(`/facilities/${createdFacility.id}`)
      .send({})
      .expect(400);
  });
});
