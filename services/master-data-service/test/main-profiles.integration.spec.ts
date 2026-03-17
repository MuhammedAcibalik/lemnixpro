import crypto from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { newDb } from "pg-mem";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult<Row> = {
  rows: Row[];
};

type QueryablePool = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>;
  end(): Promise<void>;
};

type MainProfileResponse = {
  id: string;
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type MainProfileRow = {
  id: string;
  code: string;
  name: string;
  stock_length_mm: number;
  linked_product_code: string;
  linked_product_name: string;
  is_active: boolean;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type MainProfilesRepositoryShape = {
  create(input: {
    code: string;
    name: string;
    stockLengthMm: number;
    linkedProductCode: string;
    linkedProductName: string;
    isActive: boolean;
    notes: string | null;
  }): Promise<MainProfileResponse>;
  findAll(): Promise<MainProfileResponse[]>;
  findById(id: string): Promise<MainProfileResponse | null>;
  findByCode(code: string): Promise<MainProfileResponse | null>;
  update(
    id: string,
    input: Partial<{
      code: string;
      name: string;
      stockLengthMm: number;
      linkedProductCode: string;
      linkedProductName: string;
      isActive: boolean;
      notes: string | null;
    }>
  ): Promise<MainProfileResponse | null>;
};

describe("master-data-service main profiles", () => {
  let app: INestApplication;
  let memoryPool: QueryablePool;
  let AppModule: typeof import("../src/app.module").AppModule;
  let MainProfilesRepository: typeof import("../src/modules/master-data/main-profiles/main-profiles.repository").MainProfilesRepository;

  beforeEach(async () => {
    process.env.SERVICE_NAME = "master-data-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3003";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lemnixpro";

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));
    ({ MainProfilesRepository } = await import(
      "../src/modules/master-data/main-profiles/main-profiles.repository"
    ));

    const memoryDatabase = newDb();
    memoryDatabase.public.registerFunction({
      name: "version",
      implementation: () => "pg-mem"
    });

    const adapter = memoryDatabase.adapters.createPg() as {
      Pool: new () => QueryablePool;
    };
    memoryPool = new adapter.Pool();

    await memoryPool.query('create schema if not exists "master_data";');
    await memoryPool.query(`
      create table master_data.main_profiles (
        id uuid primary key,
        code varchar(100) not null,
        name varchar(200) not null,
        stock_length_mm integer not null,
        linked_product_code varchar(100) not null,
        linked_product_name varchar(200) not null,
        is_active boolean not null default true,
        notes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint master_data_main_profiles_stock_length_positive
          check (stock_length_mm > 0)
      );
    `);
    await memoryPool.query(`
      create unique index master_data_main_profiles_code_unique
        on master_data.main_profiles (code);
    `);

    const mainProfilesRepository: MainProfilesRepositoryShape = {
      async create(input) {
        const result = await memoryPool.query<MainProfileRow>(
          `insert into master_data.main_profiles
             (id, code, name, stock_length_mm, linked_product_code, linked_product_name, is_active, notes)
           values
             ($1, $2, $3, $4, $5, $6, $7, $8)
           returning
             id,
             code,
             name,
             stock_length_mm,
             linked_product_code,
             linked_product_name,
             is_active,
             notes,
             created_at,
             updated_at`,
          [
            crypto.randomUUID(),
            input.code,
            input.name,
            input.stockLengthMm,
            input.linkedProductCode,
            input.linkedProductName,
            input.isActive,
            input.notes
          ]
        );

        const createdProfile = mapMainProfileRow(result.rows[0]);

        if (!createdProfile) {
          throw new Error("Failed to create test main profile.");
        }

        return createdProfile;
      },
      async findAll() {
        const result = await memoryPool.query<MainProfileRow>(
          `select
             id,
             code,
             name,
             stock_length_mm,
             linked_product_code,
             linked_product_name,
             is_active,
             notes,
             created_at,
             updated_at
           from master_data.main_profiles
           order by code asc`
        );

        return result.rows
          .map((row) => mapMainProfileRow(row))
          .filter(
            (profile): profile is MainProfileResponse => profile !== null
          );
      },
      async findById(id: string) {
        const result = await memoryPool.query<MainProfileRow>(
          `select
             id,
             code,
             name,
             stock_length_mm,
             linked_product_code,
             linked_product_name,
             is_active,
             notes,
             created_at,
             updated_at
           from master_data.main_profiles
           where id = $1
           limit 1`,
          [id]
        );

        return mapMainProfileRow(result.rows[0]);
      },
      async findByCode(code: string) {
        const result = await memoryPool.query<MainProfileRow>(
          `select
             id,
             code,
             name,
             stock_length_mm,
             linked_product_code,
             linked_product_name,
             is_active,
             notes,
             created_at,
             updated_at
           from master_data.main_profiles
           where code = $1
           limit 1`,
          [code]
        );

        return mapMainProfileRow(result.rows[0]);
      },
      async update(id, input) {
        const existingProfile = await this.findById(id);

        if (!existingProfile) {
          return null;
        }

        const result = await memoryPool.query<MainProfileRow>(
          `update master_data.main_profiles
              set code = $2,
                  name = $3,
                  stock_length_mm = $4,
                  linked_product_code = $5,
                  linked_product_name = $6,
                  is_active = $7,
                  notes = $8,
                  updated_at = now()
            where id = $1
            returning
              id,
              code,
              name,
              stock_length_mm,
              linked_product_code,
              linked_product_name,
              is_active,
              notes,
              created_at,
              updated_at`,
          [
            id,
            input.code ?? existingProfile.code,
            input.name ?? existingProfile.name,
            input.stockLengthMm ?? existingProfile.stockLengthMm,
            input.linkedProductCode ?? existingProfile.linkedProductCode,
            input.linkedProductName ?? existingProfile.linkedProductName,
            input.isActive ?? existingProfile.isActive,
            input.notes !== undefined ? input.notes : existingProfile.notes
          ]
        );

        return mapMainProfileRow(result.rows[0]);
      }
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(MainProfilesRepository)
      .useValue(mainProfilesRepository)
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

  it("creates, reads, updates, and toggles a main profile through the HTTP API", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const createResponse = await request(httpServer)
      .post("/main-profiles")
      .send({
        code: " mp-001 ",
        name: " Main Aluminum Profile ",
        stockLengthMm: "6500",
        linkedProductCode: " prd-100 ",
        linkedProductName: " Window Frame Profile ",
        notes: " Standard stock length "
      })
      .expect(201);
    const createdProfile = createResponse.body as MainProfileResponse;

    expect(createdProfile).toEqual({
      id: createdProfile.id,
      code: "MP-001",
      name: "Main Aluminum Profile",
      stockLengthMm: 6500,
      linkedProductCode: "PRD-100",
      linkedProductName: "Window Frame Profile",
      isActive: true,
      notes: "Standard stock length",
      createdAt: createdProfile.createdAt,
      updatedAt: createdProfile.updatedAt
    });

    const listResponse = await request(httpServer).get("/main-profiles").expect(200);
    const listedProfiles = listResponse.body as MainProfileResponse[];

    expect(listedProfiles).toEqual([createdProfile]);

    const getByIdResponse = await request(httpServer)
      .get(`/main-profiles/${createdProfile.id}`)
      .expect(200);
    const fetchedProfile = getByIdResponse.body as MainProfileResponse;

    expect(fetchedProfile).toEqual(createdProfile);

    const updateResponse = await request(httpServer)
      .patch(`/main-profiles/${createdProfile.id}`)
      .send({
        name: " Main Aluminum Profile Rev A ",
        notes: "   "
      })
      .expect(200);
    const updatedProfile = updateResponse.body as MainProfileResponse;

    expect(updatedProfile).toEqual({
      ...createdProfile,
      name: "Main Aluminum Profile Rev A",
      notes: null,
      updatedAt: updatedProfile.updatedAt
    });
    expect(typeof updatedProfile.updatedAt).toBe("string");

    const deactivateResponse = await request(httpServer)
      .patch(`/main-profiles/${createdProfile.id}/deactivate`)
      .expect(200);
    const inactiveProfile = deactivateResponse.body as MainProfileResponse;

    expect(inactiveProfile.isActive).toBe(false);

    const activateResponse = await request(httpServer)
      .patch(`/main-profiles/${createdProfile.id}/activate`)
      .expect(200);
    const activeProfile = activateResponse.body as MainProfileResponse;

    expect(activeProfile.isActive).toBe(true);

    await request(httpServer)
      .post("/main-profiles")
      .send({
        code: "mp-001",
        name: "Duplicate Profile",
        stockLengthMm: 6000,
        linkedProductCode: "PRD-200",
        linkedProductName: "Duplicate Product"
      })
      .expect(409);
  });

  it("rejects invalid stock length and empty update payloads", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post("/main-profiles")
      .send({
        code: "mp-002",
        name: "Invalid Length Profile",
        stockLengthMm: 0,
        linkedProductCode: "PRD-300",
        linkedProductName: "Invalid Product"
      })
      .expect(400);

    const createResponse = await request(httpServer)
      .post("/main-profiles")
      .send({
        code: "mp-003",
        name: "Patch Validation Profile",
        stockLengthMm: 5000,
        linkedProductCode: "PRD-301",
        linkedProductName: "Patch Validation Product"
      })
      .expect(201);
    const createdProfile = createResponse.body as MainProfileResponse;

    await request(httpServer)
      .patch(`/main-profiles/${createdProfile.id}`)
      .send({})
      .expect(400);
  });
});

function mapMainProfileRow(
  row: MainProfileRow | undefined
): MainProfileResponse | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    stockLengthMm: row.stock_length_mm,
    linkedProductCode: row.linked_product_code,
    linkedProductName: row.linked_product_name,
    isActive: row.is_active,
    notes: row.notes,
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
