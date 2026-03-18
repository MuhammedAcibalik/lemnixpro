import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { newDb } from "pg-mem";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OptimizationRequestPayload } from "@lemnixpro/shared-contracts";
import type {
  CreateOptimizationRequestRecord,
  OptimizationRequestsRepository
} from "../src/modules/optimization-orchestrator/optimization-requests.repository";

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

type OptimizationRequestSummaryResponse = {
  id: string;
  weekNumber: number;
  sourceBatchId: string;
  status: "created" | "ready" | "failed_preparation";
  matchedRows: number;
  unmatchedRows: number;
  createdAt: string;
  updatedAt: string;
};

type OptimizationRequestPayloadResponse = {
  weekNumber: number;
  sourceBatchId: string;
  mainProfiles: Array<{
    id: string;
    code: string;
    name: string;
    linkedProductCode: string;
    linkedProductName: string;
    stockLengthMm: number;
  }>;
  demandRows: Array<{
    productionRowId: string;
    rowIndex: number;
    mainProfileId: string;
    mainProfileCode: string;
    materialCode: string;
    quantity: number;
    orderUnit: string;
  }>;
};

type CreateOptimizationRequestResponse = {
  request: OptimizationRequestSummaryResponse;
  payloadPreview: OptimizationRequestPayloadResponse;
  unmatchedSummary: {
    totalUnmatchedRows: number;
    rowsMissingMasterDataLinkage: number;
    unmatchedReasons: Array<{
      rowId: string;
      rowIndex: number;
      materialCode: string | null;
      workOrderNumber: string | null;
      reasons: string[];
      details: string[];
    }>;
  };
};

type FailedOptimizationRequestResponse = CreateOptimizationRequestResponse & {
  message: string;
};

type OptimizationRequestDetailResponse = {
  request: OptimizationRequestSummaryResponse;
  payloadPreview: OptimizationRequestPayloadResponse;
};

type PersistedOptimizationRequestRow = {
  id: string;
  week_number: number;
  source_batch_id: string;
  status: "created" | "ready" | "failed_preparation";
  payload_json: Record<string, unknown> | string;
  matched_rows: number;
  unmatched_rows: number;
  created_at: Date | string;
  updated_at: Date | string;
};

const batchIds = {
  week12: "11111111-1111-4111-8111-111111111112",
  week14: "11111111-1111-4111-8111-111111111114",
  week15: "11111111-1111-4111-8111-111111111115"
} as const;

const mainProfileIds = {
  mp1: "31111111-1111-4111-8111-111111111101",
  mp2: "31111111-1111-4111-8111-111111111102",
  mp3: "31111111-1111-4111-8111-111111111103",
  mp4: "31111111-1111-4111-8111-111111111104",
  mp5: "31111111-1111-4111-8111-111111111105"
} as const;

type OptimizationRequestsRepositoryShape = Pick<
  OptimizationRequestsRepository,
  "create" | "findAll" | "findById"
>;

describe("optimization-orchestrator-service optimization requests", () => {
  let app: INestApplication;
  let memoryPool: QueryablePool;
  let productionPlanStubServer: ReturnType<typeof createServer>;
  let masterDataStubServer: ReturnType<typeof createServer>;
  let AppModule: typeof import("../src/app.module").AppModule;
  let OptimizationRequestsRepositoryClass: typeof import("../src/modules/optimization-orchestrator/optimization-requests.repository").OptimizationRequestsRepository;

  beforeEach(async () => {
    productionPlanStubServer = createServer((requestMessage, responseMessage) => {
      const requestUrl = requestMessage.url ?? "";

      if (requestMessage.method !== "GET") {
        responseMessage.writeHead(404, {
          "content-type": "application/json"
        });
        responseMessage.end(JSON.stringify({ message: "Not found" }));
        return;
      }

      const payload = buildProductionPlanResponse(requestUrl);

      if (!payload) {
        responseMessage.writeHead(404, {
          "content-type": "application/json"
        });
        responseMessage.end(JSON.stringify({ message: "Not found" }));
        return;
      }

      responseMessage.writeHead(payload.statusCode, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify(payload.body));
    });

    masterDataStubServer = createServer((requestMessage, responseMessage) => {
      if (
        requestMessage.method === "GET" &&
        (requestMessage.url ?? "") === "/main-profiles"
      ) {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(JSON.stringify(buildMainProfiles()));
        return;
      }

      responseMessage.writeHead(404, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify({ message: "Not found" }));
    });

    await Promise.all([
      new Promise<void>((resolve) => {
        productionPlanStubServer.listen(0, "127.0.0.1", () => resolve());
      }),
      new Promise<void>((resolve) => {
        masterDataStubServer.listen(0, "127.0.0.1", () => resolve());
      })
    ]);

    const productionPlanAddress = productionPlanStubServer.address();
    const masterDataAddress = masterDataStubServer.address();

    if (!productionPlanAddress || typeof productionPlanAddress === "string") {
      throw new Error("Failed to resolve production plan stub server address.");
    }

    if (!masterDataAddress || typeof masterDataAddress === "string") {
      throw new Error("Failed to resolve master data stub server address.");
    }

    process.env.SERVICE_NAME = "optimization-orchestrator-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3006";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lemnixpro";
    process.env.RABBITMQ_URL = "amqp://guest:guest@localhost:5672";
    process.env.PRODUCTION_PLAN_SERVICE_BASE_URL = `http://127.0.0.1:${productionPlanAddress.port}`;
    process.env.MASTER_DATA_SERVICE_BASE_URL = `http://127.0.0.1:${masterDataAddress.port}`;

    vi.resetModules();
    ({ AppModule } = await import("../src/app.module"));
    ({ OptimizationRequestsRepository: OptimizationRequestsRepositoryClass } =
      await import(
        "../src/modules/optimization-orchestrator/optimization-requests.repository"
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

    await createDatabaseSchema(memoryPool);
    const optimizationRequestsRepository = createRepositoryDouble(memoryPool);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(OptimizationRequestsRepositoryClass)
      .useValue(optimizationRequestsRepository)
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

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        productionPlanStubServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
      new Promise<void>((resolve, reject) => {
        masterDataStubServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
    ]);
  });

  it("creates and persists a ready optimization request", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post("/optimization-requests")
      .send({
        weekNumber: 14
      })
      .expect(201);
    const body = response.body as CreateOptimizationRequestResponse;

    expect(body.request).toMatchObject({
      weekNumber: 14,
      sourceBatchId: batchIds.week14,
      status: "ready",
      matchedRows: 2,
      unmatchedRows: 0
    });
    expect(body.payloadPreview).toMatchObject({
      weekNumber: 14,
      sourceBatchId: batchIds.week14,
      mainProfiles: [
        {
          id: mainProfileIds.mp1,
          code: "MP-001",
          name: "Window Frame Profile",
          linkedProductCode: "PRD-100",
          linkedProductName: "Window Frame",
          stockLengthMm: 6500
        },
        {
          id: mainProfileIds.mp5,
          code: "MP-005",
          name: "Door Frame Profile",
          linkedProductCode: "PRD-300",
          linkedProductName: "Door Frame",
          stockLengthMm: 7000
        }
      ],
      demandRows: [
        {
          productionRowId: "21111111-1111-4111-8111-111111111141",
          rowIndex: 2,
          mainProfileId: mainProfileIds.mp1,
          mainProfileCode: "MP-001",
          materialCode: "PRD-100",
          quantity: 18,
          orderUnit: "ADET"
        },
        {
          productionRowId: "21111111-1111-4111-8111-111111111142",
          rowIndex: 3,
          mainProfileId: mainProfileIds.mp5,
          mainProfileCode: "MP-005",
          materialCode: "PRD-300",
          quantity: 8,
          orderUnit: "ADET"
        }
      ]
    });
    expect(body.payloadPreview.demandRows).toHaveLength(2);

    const persistedRequests = await listPersistedOptimizationRequests(memoryPool);

    expect(persistedRequests).toHaveLength(1);
    expect(persistedRequests[0]).toMatchObject({
      week_number: 14,
      source_batch_id: batchIds.week14,
      status: "ready",
      matched_rows: 2,
      unmatched_rows: 0
    });
    expect(normalizePayloadJson(persistedRequests[0]?.payload_json)).toEqual(
      body.payloadPreview
    );
  });

  it("creates a ready request when unmatched rows exist but usable rows remain", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post("/optimization-requests")
      .send({
        weekNumber: 12
      })
      .expect(201);
    const body = response.body as CreateOptimizationRequestResponse;

    expect(body.request).toMatchObject({
      weekNumber: 12,
      sourceBatchId: batchIds.week12,
      status: "ready",
      matchedRows: 1,
      unmatchedRows: 3
    });
    expect(body.unmatchedSummary).toEqual({
      totalUnmatchedRows: 3,
      rowsMissingMasterDataLinkage: 3,
      unmatchedReasons: [
        {
          rowId: "21111111-1111-4111-8111-111111111122",
          rowIndex: 3,
          materialCode: "PRD-404",
          workOrderNumber: "WO-002",
          reasons: ["missing_active_main_profile"],
          details: [
            'No active main profile was found for materialCode "PRD-404".'
          ]
        },
        {
          rowId: "21111111-1111-4111-8111-111111111123",
          rowIndex: 4,
          materialCode: null,
          workOrderNumber: "WO-003",
          reasons: ["production_row_invalid", "missing_material_code"],
          details: [
            "materialCode is required.",
            "materialCode is required to match the production row to main profile master data."
          ]
        },
        {
          rowId: "21111111-1111-4111-8111-111111111124",
          rowIndex: 5,
          materialCode: "PRD-200",
          workOrderNumber: "WO-004",
          reasons: ["ambiguous_active_main_profile"],
          details: [
            'Multiple active main profiles share linkedProductCode "PRD-200": MP-002, MP-003.'
          ]
        }
      ]
    });
  });

  it("persists failed_preparation and rejects when no usable rows exist", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post("/optimization-requests")
      .send({
        weekNumber: 15
      })
      .expect(422);
    const body = response.body as FailedOptimizationRequestResponse;

    expect(body.message).toContain("no optimization-ready rows were available");
    expect(body.request).toMatchObject({
      weekNumber: 15,
      sourceBatchId: batchIds.week15,
      status: "failed_preparation",
      matchedRows: 0,
      unmatchedRows: 2
    });
    expect(body.payloadPreview).toEqual({
      weekNumber: 15,
      sourceBatchId: batchIds.week15,
      mainProfiles: [],
      demandRows: []
    });

    const persistedRequests = await listPersistedOptimizationRequests(memoryPool);

    expect(persistedRequests).toHaveLength(1);
    expect(persistedRequests[0]).toMatchObject({
      week_number: 15,
      source_batch_id: batchIds.week15,
      status: "failed_preparation",
      matched_rows: 0,
      unmatched_rows: 2
    });
  });

  it("lists requests newest first and returns request detail", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const firstResponse = await request(httpServer)
      .post("/optimization-requests")
      .send({
        weekNumber: 14
      })
      .expect(201);
    const firstBody = firstResponse.body as CreateOptimizationRequestResponse;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondResponse = await request(httpServer)
      .post("/optimization-requests")
      .send({
        weekNumber: 12
      })
      .expect(201);
    const secondBody = secondResponse.body as CreateOptimizationRequestResponse;

    const listResponse = await request(httpServer)
      .get("/optimization-requests")
      .expect(200);
    const listBody = listResponse.body as OptimizationRequestSummaryResponse[];

    expect(listBody).toEqual([secondBody.request, firstBody.request]);

    const detailResponse = await request(httpServer)
      .get(`/optimization-requests/${firstBody.request.id}`)
      .expect(200);
    const detailBody = detailResponse.body as OptimizationRequestDetailResponse;

    expect(detailBody).toEqual({
      request: firstBody.request,
      payloadPreview: firstBody.payloadPreview
    });
  });
});

function buildProductionPlanResponse(requestUrl: string) {
  switch (requestUrl) {
    case "/production-plan-weeks/12/active-batch/rows":
      return {
        statusCode: 200,
        body: {
          batch: buildBatch(batchIds.week12, 12, 4, 3, 1, "week-12-plan.xlsx"),
          rows: [
            buildRow(12, "21111111-1111-4111-8111-111111111121", 2, {
              materialCode: "prd-100",
              materialName: "Window Frame",
              quantity: 25,
              workOrderNumber: "WO-001",
              priority: "HIGH"
            }),
            buildRow(12, "21111111-1111-4111-8111-111111111122", 3, {
              materialCode: "PRD-404",
              materialName: "Missing Profile",
              quantity: 10,
              workOrderNumber: "WO-002",
              customerName: "Beta Aluminyum",
              priority: "NORMAL"
            }),
            buildRow(12, "21111111-1111-4111-8111-111111111123", 4, {
              materialCode: null,
              materialName: "No Material",
              quantity: 15,
              workOrderNumber: "WO-003",
              customerName: "Gamma Aluminyum",
              departmentCode: "CUT02",
              priority: "LOW",
              isValid: false,
              validationErrors: ["materialCode is required."]
            }),
            buildRow(12, "21111111-1111-4111-8111-111111111124", 5, {
              materialCode: "PRD-200",
              materialName: "Ambiguous Profile",
              quantity: 12,
              workOrderNumber: "WO-004",
              customerName: "Delta Aluminyum",
              departmentCode: "CUT03",
              priority: "HIGH"
            })
          ]
        }
      };
    case "/production-plan-weeks/14/active-batch/rows":
      return {
        statusCode: 200,
        body: {
          batch: buildBatch(batchIds.week14, 14, 2, 2, 0, "week-14-plan.xlsx"),
          rows: [
            buildRow(14, "21111111-1111-4111-8111-111111111141", 2, {
              customerName: "Atlas Aluminyum",
              orderingPartyCode: "OP-101",
              customerOrderNumber: "000201",
              workOrderNumber: "WO-101",
              materialCode: "PRD-100",
              materialName: "Window Frame",
              quantity: 18,
              priority: "HIGH"
            }),
            buildRow(14, "21111111-1111-4111-8111-111111111142", 3, {
              customerName: "Nova Aluminyum",
              orderingPartyCode: "OP-102",
              customerOrderNumber: "000202",
              customerOrderItemNumber: "00020",
              workOrderNumber: "WO-102",
              materialCode: "PRD-300",
              materialName: "Door Frame",
              quantity: 8,
              departmentCode: "CUT02",
              priority: "NORMAL"
            })
          ]
        }
      };
    case "/production-plan-weeks/15/active-batch/rows":
      return {
        statusCode: 200,
        body: {
          batch: buildBatch(batchIds.week15, 15, 2, 2, 0, "week-15-plan.xlsx"),
          rows: [
            buildRow(15, "21111111-1111-4111-8111-111111111151", 2, {
              customerName: "Void Aluminyum",
              orderingPartyCode: "OP-201",
              customerOrderNumber: "000301",
              workOrderNumber: "WO-201",
              materialCode: null,
              materialName: "Missing Material",
              quantity: 5,
              priority: "LOW"
            }),
            buildRow(15, "21111111-1111-4111-8111-111111111152", 3, {
              customerName: "Lost Aluminyum",
              orderingPartyCode: "OP-202",
              customerOrderNumber: "000302",
              customerOrderItemNumber: "00020",
              workOrderNumber: "WO-202",
              materialCode: "PRD-999",
              materialName: "Unknown Profile",
              quantity: 7,
              priority: "NORMAL"
            })
          ]
        }
      };
    default:
      return null;
  }
}

function buildBatch(
  id: string,
  weekNumber: number,
  totalRowCount: number,
  validRowCount: number,
  invalidRowCount: number,
  fileName: string
) {
  return {
    id,
    fileName,
    sheetName: "Weekly Plan",
    weekNumber,
    status: "active",
    totalRowCount,
    validRowCount,
    invalidRowCount,
    activatedAt: "2026-03-18T08:00:00.000Z",
    createdAt: "2026-03-18T07:00:00.000Z",
    updatedAt: "2026-03-18T08:00:00.000Z"
  };
}

function buildRow(
  weekNumber: number,
  id: string,
  rowIndex: number,
  overrides: Partial<{
    customerName: string;
    orderingPartyCode: string;
    customerOrderNumber: string;
    customerOrderItemNumber: string;
    workOrderNumber: string;
    materialCode: string | null;
    materialName: string | null;
    quantity: number;
    departmentCode: string;
    priority: string;
    isValid: boolean;
    validationErrors: string[];
  }>
) {
  const materialCode =
    "materialCode" in overrides ? overrides.materialCode : "PRD-100";
  const materialName =
    "materialName" in overrides ? overrides.materialName : "Window Frame";

  return {
    id,
    rowIndex,
    weekRaw: String(weekNumber),
    weekNumber,
    customerName: overrides.customerName ?? "Acme Aluminyum",
    orderingPartyCode: overrides.orderingPartyCode ?? "OP-001",
    customerOrderNumber: overrides.customerOrderNumber ?? "000123",
    customerOrderItemNumber: overrides.customerOrderItemNumber ?? "00010",
    workOrderNumber: overrides.workOrderNumber ?? "WO-001",
    materialCode,
    materialName,
    quantity: overrides.quantity ?? 25,
    orderUnit: "ADET",
    plannedFinishDate: "2026-03-20",
    departmentCode: overrides.departmentCode ?? "CUT01",
    priority: overrides.priority ?? "HIGH",
    isValid: overrides.isValid ?? true,
    validationErrors: overrides.validationErrors ?? []
  };
}

function buildMainProfiles() {
  return [
    {
      id: mainProfileIds.mp1,
      code: "MP-001",
      name: "Window Frame Profile",
      stockLengthMm: 6500,
      linkedProductCode: "PRD-100",
      linkedProductName: "Window Frame",
      isActive: true,
      notes: null,
      createdAt: "2026-03-18T06:00:00.000Z",
      updatedAt: "2026-03-18T06:00:00.000Z"
    },
    {
      id: mainProfileIds.mp2,
      code: "MP-002",
      name: "Ambiguous Profile A",
      stockLengthMm: 7000,
      linkedProductCode: "PRD-200",
      linkedProductName: "Ambiguous Profile",
      isActive: true,
      notes: null,
      createdAt: "2026-03-18T06:10:00.000Z",
      updatedAt: "2026-03-18T06:10:00.000Z"
    },
    {
      id: mainProfileIds.mp3,
      code: "MP-003",
      name: "Ambiguous Profile B",
      stockLengthMm: 7200,
      linkedProductCode: "PRD-200",
      linkedProductName: "Ambiguous Profile",
      isActive: true,
      notes: null,
      createdAt: "2026-03-18T06:20:00.000Z",
      updatedAt: "2026-03-18T06:20:00.000Z"
    },
    {
      id: mainProfileIds.mp4,
      code: "MP-004",
      name: "Inactive Missing Match",
      stockLengthMm: 6800,
      linkedProductCode: "PRD-404",
      linkedProductName: "Missing Profile",
      isActive: false,
      notes: null,
      createdAt: "2026-03-18T06:30:00.000Z",
      updatedAt: "2026-03-18T06:30:00.000Z"
    },
    {
      id: mainProfileIds.mp5,
      code: "MP-005",
      name: "Door Frame Profile",
      stockLengthMm: 7000,
      linkedProductCode: "PRD-300",
      linkedProductName: "Door Frame",
      isActive: true,
      notes: null,
      createdAt: "2026-03-18T06:40:00.000Z",
      updatedAt: "2026-03-18T06:40:00.000Z"
    }
  ];
}

function createRepositoryDouble(
  memoryPool: QueryablePool
): OptimizationRequestsRepositoryShape {
  const baseTime = Date.parse("2026-03-18T00:00:00.000Z");
  let timestampTick = 0;

  const nextTimestamp = (): string =>
    new Date(baseTime + timestampTick++).toISOString();

  return {
    async create(input: CreateOptimizationRequestRecord) {
      const createdAt = nextTimestamp();
      const result = await memoryPool.query<PersistedOptimizationRequestRow>(
        `insert into optimization.optimization_requests
          (id, week_number, source_batch_id, status, payload_json, matched_rows, unmatched_rows, created_at, updated_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning
          id,
          week_number,
          source_batch_id,
          status,
          payload_json,
          matched_rows,
          unmatched_rows,
          created_at,
          updated_at`,
        [
          randomUUID(),
          input.weekNumber,
          input.sourceBatchId,
          input.status,
          JSON.stringify(input.payloadJson),
          input.matchedRows,
          input.unmatchedRows,
          createdAt,
          createdAt
        ]
      );

      const createdRequest = mapPersistedOptimizationRequestRow(result.rows[0]);

      if (!createdRequest) {
        throw new Error("Failed to create optimization request.");
      }

      return createdRequest;
    },
    async findAll() {
      const result = await memoryPool.query<PersistedOptimizationRequestRow>(
        `select
          id,
          week_number,
          source_batch_id,
          status,
          payload_json,
          matched_rows,
          unmatched_rows,
          created_at,
          updated_at
        from optimization.optimization_requests
        order by created_at desc, id desc`
      );

      return result.rows
        .map((row) => mapPersistedOptimizationRequestRow(row))
        .filter((row): row is NonNullable<typeof row> => row !== null);
    },
    async findById(id: string) {
      const result = await memoryPool.query<PersistedOptimizationRequestRow>(
        `select
          id,
          week_number,
          source_batch_id,
          status,
          payload_json,
          matched_rows,
          unmatched_rows,
          created_at,
          updated_at
        from optimization.optimization_requests
        where id = $1
        limit 1`,
        [id]
      );

      return mapPersistedOptimizationRequestRow(result.rows[0]);
    }
  };
}

async function createDatabaseSchema(memoryPool: QueryablePool): Promise<void> {
  await memoryPool.query(`create schema if not exists optimization;`);
  await memoryPool.query(`
    create type optimization.optimization_request_status as enum
      ('created', 'ready', 'failed_preparation');
  `);
  await memoryPool.query(`
    create table optimization.optimization_requests (
      id uuid primary key,
      week_number integer not null,
      source_batch_id varchar(100) not null,
      status optimization.optimization_request_status not null,
      payload_json jsonb not null,
      matched_rows integer not null,
      unmatched_rows integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

async function listPersistedOptimizationRequests(
  memoryPool: QueryablePool
): Promise<PersistedOptimizationRequestRow[]> {
  const result = await memoryPool.query<PersistedOptimizationRequestRow>(
    `select
      id,
      week_number,
      source_batch_id,
      status,
      payload_json,
      matched_rows,
      unmatched_rows,
      created_at,
      updated_at
    from optimization.optimization_requests
    order by created_at asc`
  );

  return result.rows;
}

function normalizePayloadJson(
  value: Record<string, unknown> | string | undefined
): OptimizationRequestPayload | null {
  if (!value) {
    return null;
  }

  return (
    typeof value === "string" ? JSON.parse(value) : value
  ) as OptimizationRequestPayload;
}

function mapPersistedOptimizationRequestRow(
  row: PersistedOptimizationRequestRow | undefined
) {
  if (!row) {
    return null;
  }

  const payloadJson = normalizePayloadJson(row.payload_json);

  if (!payloadJson) {
    throw new Error(`Failed to parse persisted optimization request "${row.id}".`);
  }

  return {
    id: row.id,
    weekNumber: row.week_number,
    sourceBatchId: row.source_batch_id,
    status: row.status,
    payloadJson,
    matchedRows: row.matched_rows,
    unmatchedRows: row.unmatched_rows,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
