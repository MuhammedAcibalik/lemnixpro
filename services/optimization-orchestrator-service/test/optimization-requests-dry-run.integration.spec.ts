import { createServer } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type OptimizationDryRunResponse = {
  weekNumber: number;
  activeBatch: {
    id: string;
    fileName: string;
    sheetName: string;
    weekNumber: number;
    status: "active";
    totalRowCount: number;
    validRowCount: number;
    invalidRowCount: number;
    activatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  totalProductionRows: number;
  masterDataCountUsed: number;
  matchedRows: number;
  unmatchedRows: number;
  rowsMissingMasterDataLinkage: number;
  unmatchedReasons: Array<{
    rowId: string;
    rowIndex: number;
    materialCode: string | null;
    workOrderNumber: string | null;
    reasons: string[];
    details: string[];
  }>;
  optimizationRequestPreview: {
    weekNumber: number;
    activeBatchId: string;
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
};

describe("optimization-orchestrator-service dry-run endpoint", () => {
  let app: INestApplication;
  let productionPlanStubServer: ReturnType<typeof createServer>;
  let masterDataStubServer: ReturnType<typeof createServer>;
  let AppModule: typeof import("../src/app.module").AppModule;

  beforeEach(async () => {
    productionPlanStubServer = createServer((requestMessage, responseMessage) => {
      const requestUrl = requestMessage.url ?? "";

      if (
        requestMessage.method === "GET" &&
        requestUrl === "/production-plan-weeks/12/active-batch/rows"
      ) {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            batch: {
              id: "batch-week-12",
              fileName: "week-12-plan.xlsx",
              sheetName: "Weekly Plan",
              weekNumber: 12,
              status: "active",
              totalRowCount: 4,
              validRowCount: 3,
              invalidRowCount: 1,
              activatedAt: "2026-03-18T08:00:00.000Z",
              createdAt: "2026-03-18T07:00:00.000Z",
              updatedAt: "2026-03-18T08:00:00.000Z"
            },
            rows: [
              {
                id: "row-1",
                rowIndex: 2,
                weekRaw: "12",
                weekNumber: 12,
                customerName: "Acme Aluminyum",
                orderingPartyCode: "OP-001",
                customerOrderNumber: "000123",
                customerOrderItemNumber: "00010",
                workOrderNumber: "WO-001",
                materialCode: "prd-100",
                materialName: "Window Frame",
                quantity: 25,
                orderUnit: "ADET",
                plannedFinishDate: "2026-03-20",
                departmentCode: "CUT01",
                priority: "HIGH",
                isValid: true,
                validationErrors: []
              },
              {
                id: "row-2",
                rowIndex: 3,
                weekRaw: "12",
                weekNumber: 12,
                customerName: "Beta Aluminyum",
                orderingPartyCode: "OP-002",
                customerOrderNumber: "000124",
                customerOrderItemNumber: "00020",
                workOrderNumber: "WO-002",
                materialCode: "PRD-404",
                materialName: "Missing Profile",
                quantity: 10,
                orderUnit: "ADET",
                plannedFinishDate: "2026-03-21",
                departmentCode: "CUT01",
                priority: "NORMAL",
                isValid: true,
                validationErrors: []
              },
              {
                id: "row-3",
                rowIndex: 4,
                weekRaw: "12",
                weekNumber: 12,
                customerName: "Gamma Aluminyum",
                orderingPartyCode: "OP-003",
                customerOrderNumber: "000125",
                customerOrderItemNumber: "00030",
                workOrderNumber: "WO-003",
                materialCode: null,
                materialName: "No Material",
                quantity: 15,
                orderUnit: "ADET",
                plannedFinishDate: "2026-03-22",
                departmentCode: "CUT02",
                priority: "LOW",
                isValid: false,
                validationErrors: ["materialCode is required."]
              },
              {
                id: "row-4",
                rowIndex: 5,
                weekRaw: "12",
                weekNumber: 12,
                customerName: "Delta Aluminyum",
                orderingPartyCode: "OP-004",
                customerOrderNumber: "000126",
                customerOrderItemNumber: "00040",
                workOrderNumber: "WO-004",
                materialCode: "PRD-200",
                materialName: "Ambiguous Profile",
                quantity: 12,
                orderUnit: "ADET",
                plannedFinishDate: "2026-03-23",
                departmentCode: "CUT03",
                priority: "HIGH",
                isValid: true,
                validationErrors: []
              }
            ]
          })
        );
        return;
      }

      if (
        requestMessage.method === "GET" &&
        requestUrl === "/production-plan-weeks/13/active-batch/rows"
      ) {
        responseMessage.writeHead(404, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify({
            message:
              'No active production plan import batch exists for week "13".'
          })
        );
        return;
      }

      responseMessage.writeHead(404, {
        "content-type": "application/json"
      });
      responseMessage.end(JSON.stringify({ message: "Not found" }));
    });

    masterDataStubServer = createServer((requestMessage, responseMessage) => {
      const requestUrl = requestMessage.url ?? "";

      if (requestMessage.method === "GET" && requestUrl === "/main-profiles") {
        responseMessage.writeHead(200, {
          "content-type": "application/json"
        });
        responseMessage.end(
          JSON.stringify([
            {
              id: "mp-1",
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
              id: "mp-2",
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
              id: "mp-3",
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
              id: "mp-4",
              code: "MP-004",
              name: "Inactive Missing Match",
              stockLengthMm: 6800,
              linkedProductCode: "PRD-404",
              linkedProductName: "Missing Profile",
              isActive: false,
              notes: null,
              createdAt: "2026-03-18T06:30:00.000Z",
              updatedAt: "2026-03-18T06:30:00.000Z"
            }
          ])
        );
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

  it("builds a dry-run preparation summary with matched rows, unmatched rows, and a clean preview payload", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post("/optimization-requests/dry-run")
      .send({
        weekNumber: 12
      })
      .expect(200);
    const body = response.body as OptimizationDryRunResponse;

    expect(body.weekNumber).toBe(12);
    expect(body.activeBatch).toMatchObject({
      id: "batch-week-12",
      fileName: "week-12-plan.xlsx",
      sheetName: "Weekly Plan",
      weekNumber: 12,
      status: "active",
      totalRowCount: 4,
      validRowCount: 3,
      invalidRowCount: 1
    });
    expect(body.totalProductionRows).toBe(4);
    expect(body.masterDataCountUsed).toBe(1);
    expect(body.matchedRows).toBe(1);
    expect(body.unmatchedRows).toBe(3);
    expect(body.rowsMissingMasterDataLinkage).toBe(3);

    expect(body.unmatchedReasons).toEqual([
      {
        rowId: "row-2",
        rowIndex: 3,
        materialCode: "PRD-404",
        workOrderNumber: "WO-002",
        reasons: ["missing_active_main_profile"],
        details: ['No active main profile was found for materialCode "PRD-404".']
      },
      {
        rowId: "row-3",
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
        rowId: "row-4",
        rowIndex: 5,
        materialCode: "PRD-200",
        workOrderNumber: "WO-004",
        reasons: ["ambiguous_active_main_profile"],
        details: [
          'Multiple active main profiles share linkedProductCode "PRD-200": MP-002, MP-003.'
        ]
      }
    ]);

    expect(body.optimizationRequestPreview).toEqual({
      weekNumber: 12,
      activeBatchId: "batch-week-12",
      mainProfiles: [
        {
          id: "mp-1",
          code: "MP-001",
          name: "Window Frame Profile",
          linkedProductCode: "PRD-100",
          linkedProductName: "Window Frame",
          stockLengthMm: 6500
        }
      ],
      demandRows: [
        {
          productionRowId: "row-1",
          rowIndex: 2,
          mainProfileId: "mp-1",
          mainProfileCode: "MP-001",
          customerName: "Acme Aluminyum",
          orderingPartyCode: "OP-001",
          customerOrderNumber: "000123",
          customerOrderItemNumber: "00010",
          workOrderNumber: "WO-001",
          materialCode: "prd-100",
          materialName: "Window Frame",
          quantity: 25,
          orderUnit: "ADET",
          plannedFinishDate: "2026-03-20",
          departmentCode: "CUT01",
          priority: "HIGH"
        }
      ]
    });
  });

  it("propagates the active-batch not-found condition for a requested week", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post("/optimization-requests/dry-run")
      .send({
        weekNumber: 13
      })
      .expect(404);

    expect(response.body).toMatchObject({
      message: 'No active production plan import batch exists for week "13".'
    });
  });
});
