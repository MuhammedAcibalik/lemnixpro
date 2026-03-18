import crypto from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { newDb } from "pg-mem";
import request from "supertest";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreateProductionPlanImportBatchRecord,
  ProductionPlanImportsRepository,
  UpdateProductionPlanRowRecord
} from "../src/modules/production-plan/production-plan-imports.repository";

type QueryablePool = {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
};

type BatchStatus = "imported" | "active" | "superseded";

type ProductionPlanImportBatchResponse = {
  id: string;
  fileName: string;
  sheetName: string;
  weekNumber: number | null;
  status: BatchStatus;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProductionPlanImportRowResponse = {
  id: string;
  batchId: string;
  rowIndex: number;
  sourceRowJson: Record<string, unknown>;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  priority: string | null;
  isValid: boolean;
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
};

type ProductionPlanImportBatchRow = {
  id: string;
  file_name: string;
  sheet_name: string;
  week_number: number | null;
  status: BatchStatus;
  total_row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  activated_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ProductionPlanRowRecord = {
  id: string;
  batch_id: string;
  row_index: number;
  source_row_json: Record<string, unknown> | string;
  week_raw: string | null;
  week_number: number | null;
  customer_name: string | null;
  ordering_party_code: string | null;
  customer_order_number: string | null;
  customer_order_item_number: string | null;
  work_order_number: string | null;
  material_code: string | null;
  material_name: string | null;
  quantity: number | string | null;
  order_unit: string | null;
  planned_finish_date: string | Date | null;
  department_code: string | null;
  priority: string | null;
  is_valid: boolean;
  validation_errors: string[] | string;
  created_at: string | Date;
  updated_at: string | Date;
};

type RepositoryErrorClasses = {
  ActiveProductionPlanBatchMustRemainEligibleError: new (
    batchId: string
  ) => Error;
  ProductionPlanImportBatchNotActivatableError: new (
    batchId: string
  ) => Error;
};

type ProductionPlanImportsRepositoryShape = Pick<
  ProductionPlanImportsRepository,
  | "activateBatchById"
  | "createImportBatch"
  | "findActiveBatchByWeekNumber"
  | "findImportBatches"
  | "findImportBatchesByWeekNumber"
  | "findImportBatchById"
  | "findRowsByBatchId"
  | "findRowById"
  | "updateRowAndRefreshBatchSummary"
>;

describe("production-plan-service imports", () => {
  let app: INestApplication;
  let memoryPool: QueryablePool;
  let ProductionPlanImportParser: typeof import("../src/modules/production-plan/production-plan-import.parser").ProductionPlanImportParser;
  let ProductionPlanImportsController: typeof import("../src/modules/production-plan/production-plan-imports.controller").ProductionPlanImportsController;
  let ProductionPlanImportsRepository: typeof import("../src/modules/production-plan/production-plan-imports.repository").ProductionPlanImportsRepository;
  let ProductionPlanImportsService: typeof import("../src/modules/production-plan/production-plan-imports.service").ProductionPlanImportsService;
  let ActiveProductionPlanBatchMustRemainEligibleError: typeof import("../src/modules/production-plan/production-plan-imports.repository").ActiveProductionPlanBatchMustRemainEligibleError;
  let ProductionPlanImportBatchNotActivatableError: typeof import("../src/modules/production-plan/production-plan-imports.repository").ProductionPlanImportBatchNotActivatableError;

  beforeEach(async () => {
    process.env.SERVICE_NAME = "production-plan-service";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "3004";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/lemnixpro";

    vi.resetModules();
    ({ ProductionPlanImportParser } = await import(
      "../src/modules/production-plan/production-plan-import.parser"
    ));
    ({ ProductionPlanImportsController } = await import(
      "../src/modules/production-plan/production-plan-imports.controller"
    ));
    ({
      ActiveProductionPlanBatchMustRemainEligibleError,
      ProductionPlanImportBatchNotActivatableError,
      ProductionPlanImportsRepository
    } = await import(
      "../src/modules/production-plan/production-plan-imports.repository"
    ));
    ({ ProductionPlanImportsService } = await import(
      "../src/modules/production-plan/production-plan-imports.service"
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

    const productionPlanImportsRepository = createRepositoryDouble(memoryPool, {
      ActiveProductionPlanBatchMustRemainEligibleError,
      ProductionPlanImportBatchNotActivatableError
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductionPlanImportsController],
      providers: [
        ProductionPlanImportParser,
        ProductionPlanImportsService,
        {
          provide: ProductionPlanImportsRepository,
          useValue: productionPlanImportsRepository
        }
      ]
    })
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

  it("imports a valid workbook, assigns an authoritative batch week, and keeps imported lifecycle after row corrections", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [
        buildRequiredHeaders(),
        buildProductionPlanRow({
          quantity: "12,5",
          plannedFinishDate: new Date(Date.UTC(2026, 2, 17))
        }),
        buildProductionPlanRow({
          customerName: "Beta Aluminyum",
          customerOrderNumber: "000124",
          workOrderNumber: "WO-002",
          quantity: "12.5",
          plannedFinishDate: excelSerialDate(2026, 3, 18)
        }),
        buildProductionPlanRow({
          customerName: "Gamma Aluminyum",
          customerOrderNumber: "000125",
          workOrderNumber: "WO-003",
          quantity: "1.250,75",
          plannedFinishDate: "2026-03-19T08:30:00"
        }),
        buildProductionPlanRow({
          customerName: "Delta Aluminyum",
          customerOrderNumber: "000126",
          workOrderNumber: "WO-004",
          quantity: "1250.75",
          plannedFinishDate: "20.03.2026"
        }),
        buildProductionPlanRow({
          customerName: "Error Aluminyum",
          customerOrderNumber: "000127",
          workOrderNumber: "WO-005",
          quantity: "abc",
          plannedFinishDate: "31/02/2026"
        })
      ]
    });

    const createResponse = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "weekly-production-plan.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    expect(createResponse.status).toBe(201);
    const createdBatch = createResponse.body as ProductionPlanImportBatchResponse;

    expect(createdBatch.fileName).toBe("weekly-production-plan.xlsx");
    expect(createdBatch.sheetName).toBe("Weekly Plan");
    expect(createdBatch.weekNumber).toBe(12);
    expect(createdBatch.totalRowCount).toBe(5);
    expect(createdBatch.validRowCount).toBe(4);
    expect(createdBatch.invalidRowCount).toBe(1);
    expect(createdBatch.status).toBe("imported");
    expect(createdBatch.activatedAt).toBeNull();

    const listResponse = await request(httpServer)
      .get("/production-plan-imports")
      .expect(200);
    const listedBatches = listResponse.body as ProductionPlanImportBatchResponse[];

    expect(listedBatches).toHaveLength(1);
    expect(listedBatches[0]).toMatchObject({
      id: createdBatch.id,
      fileName: "weekly-production-plan.xlsx",
      weekNumber: 12,
      totalRowCount: 5,
      validRowCount: 4,
      invalidRowCount: 1,
      status: "imported",
      activatedAt: null
    });

    const detailResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}`)
      .expect(200);
    const batchDetail = detailResponse.body as ProductionPlanImportBatchResponse;

    expect(batchDetail).toMatchObject({
      id: createdBatch.id,
      fileName: "weekly-production-plan.xlsx",
      sheetName: "Weekly Plan",
      weekNumber: 12,
      totalRowCount: 5,
      validRowCount: 4,
      invalidRowCount: 1,
      status: "imported",
      activatedAt: null
    });

    const rowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}/rows`)
      .expect(200);
    const rows = rowsResponse.body as ProductionPlanImportRowResponse[];

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.rowIndex)).toEqual([2, 3, 4, 5, 6]);
    expect(rows[0]).toMatchObject({
      quantity: 12.5,
      plannedFinishDate: "2026-03-17",
      isValid: true,
      validationErrors: []
    });
    expect(rows[1]).toMatchObject({
      quantity: 12.5,
      plannedFinishDate: "2026-03-18",
      isValid: true
    });
    expect(rows[2]).toMatchObject({
      quantity: 1250.75,
      plannedFinishDate: "2026-03-19",
      isValid: true
    });
    expect(rows[3]).toMatchObject({
      quantity: 1250.75,
      plannedFinishDate: "2026-03-20",
      isValid: true
    });
    expect(rows[4]).toMatchObject({
      quantity: null,
      plannedFinishDate: null,
      isValid: false,
      validationErrors: [
        "quantity must be a positive number.",
        "plannedFinishDate must be a valid date."
      ]
    });

    const invalidRow = rows[4];

    expect(invalidRow).toBeDefined();

    const patchResponse = await request(httpServer)
      .patch(`/production-plan-rows/${invalidRow!.id}`)
      .send({
        quantity: "10.5",
        plannedFinishDate: "21/03/2026"
      })
      .expect(200);
    const patchedRow = patchResponse.body as ProductionPlanImportRowResponse;

    expect(patchedRow).toMatchObject({
      id: invalidRow!.id,
      quantity: 10.5,
      plannedFinishDate: "2026-03-21",
      isValid: true,
      validationErrors: []
    });
    expect(patchedRow.sourceRowJson).toEqual(invalidRow!.sourceRowJson);

    const updatedDetailResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}`)
      .expect(200);
    const updatedBatchDetail =
      updatedDetailResponse.body as ProductionPlanImportBatchResponse;

    expect(updatedBatchDetail).toMatchObject({
      id: createdBatch.id,
      weekNumber: 12,
      totalRowCount: 5,
      validRowCount: 5,
      invalidRowCount: 0,
      status: "imported",
      activatedAt: null
    });
  });

  it("rejects workbooks that do not contain the required Turkish headers", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [
        buildRequiredHeaders().filter((header) => header !== "Öncelik"),
        buildProductionPlanRow()
      ]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "missing-headers.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
    expect(response.status).toBe(400);

    expect(response.body.message).toContain(
      "required production plan headers"
    );
  });

  it("uses the first worksheet whose first non-empty row contains the required headers", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      Notes: [["This workbook contains planning data below."]],
      "Plan Data": [buildRequiredHeaders(), buildProductionPlanRow()]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "multi-sheet.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(201);
    const createdBatch = response.body as ProductionPlanImportBatchResponse;

    expect(createdBatch.sheetName).toBe("Plan Data");
    expect(createdBatch.weekNumber).toBe(12);
    expect(createdBatch.totalRowCount).toBe(1);
    expect(createdBatch.validRowCount).toBe(1);
    expect(createdBatch.invalidRowCount).toBe(0);
    expect(createdBatch.status).toBe("imported");
    expect(createdBatch.activatedAt).toBeNull();
  });

  it("rejects uploads that exceed the maximum non-blank data row limit", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const rows = [buildRequiredHeaders()];

    for (let index = 0; index < 10_001; index += 1) {
      rows.push(
        buildProductionPlanRow({
          customerOrderNumber: `${1000 + index}`,
          workOrderNumber: `WO-${index + 1}`
        })
      );
    }

    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": rows
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "too-many-rows.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(400);

    expect(response.body.message).toContain("maximum of 10000 data rows");
  });

  it("rejects imports with conflicting resolved week numbers", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [
        buildRequiredHeaders(),
        buildProductionPlanRow({ week: "12" }),
        buildProductionPlanRow({
          week: "13",
          customerOrderNumber: "000124",
          workOrderNumber: "WO-002"
        })
      ]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "conflicting-weeks.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(400);

    expect(response.body.message).toContain("conflicting week numbers");

    const listResponse = await request(httpServer)
      .get("/production-plan-imports")
      .expect(200);

    expect(listResponse.body).toEqual([]);
  });

  it("rejects imports without any resolved week number", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [
        buildRequiredHeaders(),
        buildProductionPlanRow({
          week: "abc",
          quantity: "25"
        })
      ]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "missing-week.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(400);

    expect(response.body.message).toContain(
      "must resolve exactly one authoritative week number"
    );
  });

  it("activates eligible batches, keeps activation idempotent, and allows reactivating superseded batches", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const batchOne = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-12-batch-one.xlsx"
    );
    const batchTwo = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerOrderNumber: "000124",
            workOrderNumber: "WO-002"
          })
        ]
      },
      "week-12-batch-two.xlsx"
    );

    await request(httpServer)
      .get("/production-plan-weeks/12/active-batch")
      .expect(404);

    const firstActivationResponse = await request(httpServer)
      .post(`/production-plan-imports/${batchOne.id}/activate`)
      .expect(200);
    const firstActivation =
      firstActivationResponse.body as ProductionPlanImportBatchResponse;

    expect(firstActivation).toMatchObject({
      id: batchOne.id,
      weekNumber: 12,
      fileName: "week-12-batch-one.xlsx",
      sheetName: "Weekly Plan",
      status: "active",
      totalRowCount: 1,
      validRowCount: 1,
      invalidRowCount: 0
    });
    expect(firstActivation.activatedAt).toBeTruthy();

    const idempotentActivationResponse = await request(httpServer)
      .post(`/production-plan-imports/${batchOne.id}/activate`)
      .expect(200);
    const idempotentActivation =
      idempotentActivationResponse.body as ProductionPlanImportBatchResponse;

    expect(idempotentActivation).toEqual(firstActivation);

    const activeBatchAfterFirstActivationResponse = await request(httpServer)
      .get("/production-plan-weeks/12/active-batch")
      .expect(200);
    const activeBatchAfterFirstActivation =
      activeBatchAfterFirstActivationResponse.body as ProductionPlanImportBatchResponse;

    expect(activeBatchAfterFirstActivation).toMatchObject({
      id: batchOne.id,
      weekNumber: 12,
      fileName: "week-12-batch-one.xlsx",
      sheetName: "Weekly Plan",
      status: "active",
      totalRowCount: 1,
      validRowCount: 1,
      invalidRowCount: 0,
      activatedAt: firstActivation.activatedAt,
      createdAt: batchOne.createdAt
    });

    const secondActivationResponse = await request(httpServer)
      .post(`/production-plan-imports/${batchTwo.id}/activate`)
      .expect(200);
    const secondActivation =
      secondActivationResponse.body as ProductionPlanImportBatchResponse;

    expect(secondActivation).toMatchObject({
      id: batchTwo.id,
      weekNumber: 12,
      status: "active"
    });
    expect(secondActivation.activatedAt).not.toBe(firstActivation.activatedAt);

    const batchesAfterSwapResponse = await request(httpServer)
      .get("/production-plan-weeks/12/batches")
      .expect(200);
    const batchesAfterSwap =
      batchesAfterSwapResponse.body as ProductionPlanImportBatchResponse[];

    expect(batchesAfterSwap.map((batch) => batch.id)).toEqual([
      batchTwo.id,
      batchOne.id
    ]);
    expect(batchesAfterSwap.map((batch) => batch.status)).toEqual([
      "active",
      "superseded"
    ]);

    const reactivationResponse = await request(httpServer)
      .post(`/production-plan-imports/${batchOne.id}/activate`)
      .expect(200);
    const reactivatedBatch =
      reactivationResponse.body as ProductionPlanImportBatchResponse;

    expect(reactivatedBatch).toMatchObject({
      id: batchOne.id,
      status: "active"
    });
    expect(reactivatedBatch.activatedAt).not.toBe(firstActivation.activatedAt);

    const activeBatchAfterReactivationResponse = await request(httpServer)
      .get("/production-plan-weeks/12/active-batch")
      .expect(200);
    const activeBatchAfterReactivation =
      activeBatchAfterReactivationResponse.body as ProductionPlanImportBatchResponse;

    expect(activeBatchAfterReactivation).toMatchObject({
      id: batchOne.id,
      weekNumber: 12,
      fileName: "week-12-batch-one.xlsx",
      status: "active"
    });
  });

  it("orders week batches by lifecycle importance and recency within the same status", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const supersededBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-12-superseded.xlsx"
    );
    const activeBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerOrderNumber: "000124",
            workOrderNumber: "WO-002"
          })
        ]
      },
      "week-12-active.xlsx"
    );

    await request(httpServer)
      .post(`/production-plan-imports/${supersededBatch.id}/activate`)
      .expect(200);
    await request(httpServer)
      .post(`/production-plan-imports/${activeBatch.id}/activate`)
      .expect(200);

    const olderImportedBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerOrderNumber: "000125",
            workOrderNumber: "WO-003"
          })
        ]
      },
      "week-12-imported-older.xlsx"
    );
    const newerImportedBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerOrderNumber: "000126",
            workOrderNumber: "WO-004"
          })
        ]
      },
      "week-12-imported-newer.xlsx"
    );

    const response = await request(httpServer)
      .get("/production-plan-weeks/12/batches")
      .expect(200);
    const batches = response.body as ProductionPlanImportBatchResponse[];

    expect(batches.map((batch) => batch.id)).toEqual([
      activeBatch.id,
      newerImportedBatch.id,
      olderImportedBatch.id,
      supersededBatch.id
    ]);
    expect(batches.map((batch) => batch.status)).toEqual([
      "active",
      "imported",
      "imported",
      "superseded"
    ]);
  });

  it("rejects activation when a batch is not eligible", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const ineligibleBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            quantity: "abc"
          })
        ]
      },
      "week-12-ineligible.xlsx"
    );

    expect(ineligibleBatch).toMatchObject({
      weekNumber: 12,
      status: "imported",
      validRowCount: 0,
      invalidRowCount: 1
    });

    const response = await request(httpServer)
      .post(`/production-plan-imports/${ineligibleBatch.id}/activate`)
      .expect(409);

    expect(response.body.message).toContain("not eligible for activation");

    const legacyLikeBatchId = crypto.randomUUID();
    const legacyLikeTimestamp = new Date().toISOString();
    await memoryPool.query(
      `insert into production_plan.production_plan_import_batches
        (id, file_name, sheet_name, week_number, status, total_row_count, valid_row_count, invalid_row_count, activated_at, created_at, updated_at)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        legacyLikeBatchId,
        "legacy-unresolved-week.xlsx",
        "Legacy Plan",
        null,
        "imported",
        2,
        2,
        0,
        null,
        legacyLikeTimestamp,
        legacyLikeTimestamp
      ]
    );

    const legacyLikeResponse = await request(httpServer)
      .post(`/production-plan-imports/${legacyLikeBatchId}/activate`)
      .expect(409);

    expect(legacyLikeResponse.body.message).toContain(
      "not eligible for activation"
    );

    await request(httpServer)
      .get("/production-plan-weeks/12/active-batch")
      .expect(404);
  });

  it("rejects invalid week route parameters on week-based endpoints", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const zeroWeekResponse = await request(httpServer)
      .get("/production-plan-weeks/0/batches")
      .expect(400);
    expect(zeroWeekResponse.body.message).toContain(
      "weekNumber must be a positive integer"
    );

    const negativeWeekResponse = await request(httpServer)
      .get("/production-plan-weeks/-1/batches")
      .expect(400);
    expect(negativeWeekResponse.body.message).toContain(
      "weekNumber must be a positive integer"
    );

    const decimalWeekResponse = await request(httpServer)
      .get("/production-plan-weeks/12.5/active-batch")
      .expect(400);
    expect(decimalWeekResponse.body.message).toContain(
      "weekNumber must be a positive integer"
    );

    const nonNumericWeekResponse = await request(httpServer)
      .get("/production-plan-weeks/not-a-number/active-batch")
      .expect(400);
    expect(nonNumericWeekResponse.body.message).toContain(
      "weekNumber must be a positive integer"
    );
  });

  it("rejects weekRaw patch attempts once batch week becomes authoritative", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const createdBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-12-locked-week.xlsx"
    );

    const rowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}/rows`)
      .expect(200);
    const rows = rowsResponse.body as ProductionPlanImportRowResponse[];

    const response = await request(httpServer)
      .patch(`/production-plan-rows/${rows[0]!.id}`)
      .send({
        weekRaw: "15"
      })
      .expect(400);

    expect(`${response.body.message}`).toContain("weekRaw");
  });

  it("rejects patching an active batch into zero valid rows", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const createdBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-12-protected-active.xlsx"
    );

    await request(httpServer)
      .post(`/production-plan-imports/${createdBatch.id}/activate`)
      .expect(200);

    const rowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}/rows`)
      .expect(200);
    const rows = rowsResponse.body as ProductionPlanImportRowResponse[];
    const validRow = rows[0];

    const patchResponse = await request(httpServer)
      .patch(`/production-plan-rows/${validRow!.id}`)
      .send({
        quantity: "abc"
      })
      .expect(409);

    expect(patchResponse.body.message).toContain(
      "must retain at least one valid row while active"
    );

    const activeBatchResponse = await request(httpServer)
      .get("/production-plan-weeks/12/active-batch")
      .expect(200);
    const activeBatch =
      activeBatchResponse.body as ProductionPlanImportBatchResponse;

    expect(activeBatch).toMatchObject({
      id: createdBatch.id,
      status: "active",
      validRowCount: 1,
      invalidRowCount: 0
    });

    const rowsAfterFailedPatchResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}/rows`)
      .expect(200);
    const rowsAfterFailedPatch =
      rowsAfterFailedPatchResponse.body as ProductionPlanImportRowResponse[];

    expect(rowsAfterFailedPatch[0]).toMatchObject({
      id: validRow!.id,
      quantity: 25,
      isValid: true,
      validationErrors: []
    });
  });
});

async function createImport(
  httpServer: Parameters<typeof request>[0],
  sheets: Record<string, unknown[][]>,
  fileName: string
): Promise<ProductionPlanImportBatchResponse> {
  const response = await request(httpServer)
    .post("/production-plan-imports")
    .attach("file", createWorkbookBuffer(sheets), {
      filename: fileName,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

  expect(response.status).toBe(201);

  return response.body as ProductionPlanImportBatchResponse;
}

async function uploadWorkbook(
  httpServer: Parameters<typeof request>[0],
  sheets: Record<string, unknown[][]>,
  fileName: string
) {
  return request(httpServer)
    .post("/production-plan-imports")
    .attach("file", createWorkbookBuffer(sheets), {
      filename: fileName,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
}

async function createDatabaseSchema(memoryPool: QueryablePool): Promise<void> {
  await memoryPool.query('create schema if not exists "production_plan";');
  await memoryPool.query(`
    create table production_plan.production_plan_import_batches (
      id uuid primary key,
      file_name varchar(255) not null,
      sheet_name varchar(255) not null,
      week_number integer,
      status varchar(40) not null,
      total_row_count integer not null,
      valid_row_count integer not null,
      invalid_row_count integer not null,
      activated_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
  `);
  await memoryPool.query(`
    create table production_plan.production_plan_rows (
      id uuid primary key,
      batch_id uuid not null references production_plan.production_plan_import_batches (id) on delete cascade,
      row_index integer not null,
      source_row_json jsonb not null,
      week_raw varchar(100),
      week_number integer,
      customer_name varchar(255),
      ordering_party_code varchar(100),
      customer_order_number varchar(100),
      customer_order_item_number varchar(100),
      work_order_number varchar(100),
      material_code varchar(100),
      material_name varchar(255),
      quantity numeric(18, 3),
      order_unit varchar(50),
      planned_finish_date date,
      department_code varchar(100),
      priority varchar(100),
      is_valid boolean not null,
      validation_errors jsonb not null default '[]'::jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
  `);
  await memoryPool.query(`
    create index production_plan_import_batches_week_number_idx
      on production_plan.production_plan_import_batches (week_number);
  `);
  await memoryPool.query(`
    create index production_plan_rows_batch_id_idx
      on production_plan.production_plan_rows (batch_id);
  `);
  await memoryPool.query(`
    create unique index production_plan_rows_batch_id_row_index_unique
      on production_plan.production_plan_rows (batch_id, row_index);
  `);
}

function createRepositoryDouble(
  memoryPool: QueryablePool,
  errors: RepositoryErrorClasses
): ProductionPlanImportsRepositoryShape {
  const baseTime = Date.parse("2026-03-18T00:00:00.000Z");
  let timestampTick = 0;

  const nextTimestamp = (): string =>
    new Date(baseTime + timestampTick++).toISOString();

  return {
    async createImportBatch(
      input: CreateProductionPlanImportBatchRecord
    ): Promise<ProductionPlanImportBatchResponse> {
      const batchId = crypto.randomUUID();
      const createdAt = nextTimestamp();
      const result = await memoryPool.query(
        `insert into production_plan.production_plan_import_batches
          (id, file_name, sheet_name, week_number, status, total_row_count, valid_row_count, invalid_row_count, activated_at, created_at, updated_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at`,
        [
          batchId,
          input.fileName,
          input.sheetName,
          input.weekNumber,
          input.status,
          input.totalRowCount,
          input.validRowCount,
          input.invalidRowCount,
          null,
          createdAt,
          createdAt
        ]
      );
      const createdBatch = mapBatchRow(
        result.rows[0] as ProductionPlanImportBatchRow | undefined
      );

      if (!createdBatch) {
        throw new Error("Failed to create production plan batch.");
      }

      for (const row of input.rows) {
        const rowTimestamp = nextTimestamp();
        await memoryPool.query(
          `insert into production_plan.production_plan_rows
            (id, batch_id, row_index, source_row_json, week_raw, week_number, customer_name,
             ordering_party_code, customer_order_number, customer_order_item_number, work_order_number,
             material_code, material_name, quantity, order_unit, planned_finish_date,
             department_code, priority, is_valid, validation_errors, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22)`,
          [
            crypto.randomUUID(),
            createdBatch.id,
            row.rowIndex,
            JSON.stringify(row.sourceRowJson),
            row.weekRaw,
            row.weekNumber,
            row.customerName,
            row.orderingPartyCode,
            row.customerOrderNumber,
            row.customerOrderItemNumber,
            row.workOrderNumber,
            row.materialCode,
            row.materialName,
            row.quantity,
            row.orderUnit,
            row.plannedFinishDate,
            row.departmentCode,
            row.priority,
            row.isValid,
            JSON.stringify(row.validationErrors),
            rowTimestamp,
            rowTimestamp
          ]
        );
      }

      return createdBatch;
    },
    async findImportBatches(): Promise<ProductionPlanImportBatchResponse[]> {
      const result = await memoryPool.query(
        `select
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at
        from production_plan.production_plan_import_batches
        order by created_at desc`
      );

      return result.rows
        .map((row) => mapBatchRow(row as ProductionPlanImportBatchRow))
        .filter(
          (
            batch
          ): batch is ProductionPlanImportBatchResponse => batch !== null
        );
    },
    async findImportBatchById(
      id: string
    ): Promise<ProductionPlanImportBatchResponse | null> {
      const result = await memoryPool.query(
        `select
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at
        from production_plan.production_plan_import_batches
        where id = $1
        limit 1`,
        [id]
      );

      return mapBatchRow(result.rows[0] as ProductionPlanImportBatchRow | undefined);
    },
    async findImportBatchesByWeekNumber(
      weekNumber: number
    ): Promise<ProductionPlanImportBatchResponse[]> {
      const result = await memoryPool.query(
        `select
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at
        from production_plan.production_plan_import_batches
        where week_number = $1
        order by
          case
            when status = 'active' then 0
            when status = 'imported' then 1
            when status = 'superseded' then 2
            else 3
          end asc,
          created_at desc`,
        [weekNumber]
      );

      return result.rows
        .map((row) => mapBatchRow(row as ProductionPlanImportBatchRow))
        .filter(
          (
            batch
          ): batch is ProductionPlanImportBatchResponse => batch !== null
        );
    },
    async findActiveBatchByWeekNumber(
      weekNumber: number
    ): Promise<ProductionPlanImportBatchResponse | null> {
      const result = await memoryPool.query(
        `select
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at
        from production_plan.production_plan_import_batches
        where week_number = $1
          and status = 'active'
        limit 1`,
        [weekNumber]
      );

      return mapBatchRow(result.rows[0] as ProductionPlanImportBatchRow | undefined);
    },
    async activateBatchById(
      id: string
    ): Promise<ProductionPlanImportBatchResponse | null> {
      const targetBatch = await this.findImportBatchById(id);

      if (!targetBatch) {
        return null;
      }

      if (targetBatch.status === "active") {
        return targetBatch as ProductionPlanImportBatchResponse;
      }

      if (targetBatch.weekNumber === null || targetBatch.validRowCount <= 0) {
        throw new errors.ProductionPlanImportBatchNotActivatableError(id);
      }

      const supersededTimestamp = nextTimestamp();
      await memoryPool.query(
        `update production_plan.production_plan_import_batches
          set status = 'superseded',
              updated_at = $2
        where week_number = $1
          and status = 'active'`,
        [targetBatch.weekNumber, supersededTimestamp]
      );

      const activationTimestamp = nextTimestamp();
      const result = await memoryPool.query(
        `update production_plan.production_plan_import_batches
          set status = 'active',
              activated_at = $2,
              updated_at = $3
        where id = $1
        returning
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at`,
        [id, activationTimestamp, activationTimestamp]
      );

      return mapBatchRow(result.rows[0] as ProductionPlanImportBatchRow | undefined);
    },
    async findRowsByBatchId(
      batchId: string
    ): Promise<ProductionPlanImportRowResponse[]> {
      const result = await memoryPool.query(
        `select
          id,
          batch_id,
          row_index,
          source_row_json,
          week_raw,
          week_number,
          customer_name,
          ordering_party_code,
          customer_order_number,
          customer_order_item_number,
          work_order_number,
          material_code,
          material_name,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          priority,
          is_valid,
          validation_errors,
          created_at,
          updated_at
        from production_plan.production_plan_rows
        where batch_id = $1
        order by row_index asc`,
        [batchId]
      );

      return result.rows
        .map((row) => mapRowRecord(row as ProductionPlanRowRecord))
        .filter((row): row is ProductionPlanImportRowResponse => row !== null);
    },
    async findRowById(id: string): Promise<ProductionPlanImportRowResponse | null> {
      const result = await memoryPool.query(
        `select
          id,
          batch_id,
          row_index,
          source_row_json,
          week_raw,
          week_number,
          customer_name,
          ordering_party_code,
          customer_order_number,
          customer_order_item_number,
          work_order_number,
          material_code,
          material_name,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          priority,
          is_valid,
          validation_errors,
          created_at,
          updated_at
        from production_plan.production_plan_rows
        where id = $1
        limit 1`,
        [id]
      );

      return mapRowRecord(result.rows[0] as ProductionPlanRowRecord | undefined);
    },
    async updateRowAndRefreshBatchSummary(
      id: string,
      input: UpdateProductionPlanRowRecord
    ) {
      const existingRow = await this.findRowById(id);

      if (!existingRow) {
        return null;
      }

      const existingBatch = await this.findImportBatchById(existingRow.batchId);

      if (!existingBatch) {
        throw new Error("Failed to load production plan batch.");
      }

      const batchRows = await this.findRowsByBatchId(existingRow.batchId);
      const projectedRows = batchRows.map((row) =>
        row.id === id
          ? {
              ...row,
              weekRaw: input.weekRaw,
              weekNumber: input.weekNumber,
              customerName: input.customerName,
              orderingPartyCode: input.orderingPartyCode,
              customerOrderNumber: input.customerOrderNumber,
              customerOrderItemNumber: input.customerOrderItemNumber,
              workOrderNumber: input.workOrderNumber,
              materialCode: input.materialCode,
              materialName: input.materialName,
              quantity: input.quantity,
              orderUnit: input.orderUnit,
              plannedFinishDate: input.plannedFinishDate,
              departmentCode: input.departmentCode,
              priority: input.priority,
              isValid: input.isValid,
              validationErrors: [...input.validationErrors]
            }
          : row
      );

      const validRowCount = projectedRows.filter((row) => row.isValid).length;
      const totalRowCount = projectedRows.length;
      const invalidRowCount = totalRowCount - validRowCount;

      if (existingBatch.status === "active" && validRowCount === 0) {
        throw new errors.ActiveProductionPlanBatchMustRemainEligibleError(
          existingBatch.id
        );
      }

      const rowUpdatedAt = nextTimestamp();
      const updateResult = await memoryPool.query(
        `update production_plan.production_plan_rows
          set week_raw = $2,
              week_number = $3,
              customer_name = $4,
              ordering_party_code = $5,
              customer_order_number = $6,
              customer_order_item_number = $7,
              work_order_number = $8,
              material_code = $9,
              material_name = $10,
              quantity = $11,
              order_unit = $12,
              planned_finish_date = $13,
              department_code = $14,
              priority = $15,
              is_valid = $16,
              validation_errors = $17,
              updated_at = $18
        where id = $1
        returning
          id,
          batch_id,
          row_index,
          source_row_json,
          week_raw,
          week_number,
          customer_name,
          ordering_party_code,
          customer_order_number,
          customer_order_item_number,
          work_order_number,
          material_code,
          material_name,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          priority,
          is_valid,
          validation_errors,
          created_at,
          updated_at`,
        [
          id,
          input.weekRaw,
          input.weekNumber,
          input.customerName,
          input.orderingPartyCode,
          input.customerOrderNumber,
          input.customerOrderItemNumber,
          input.workOrderNumber,
          input.materialCode,
          input.materialName,
          input.quantity,
          input.orderUnit,
          input.plannedFinishDate,
          input.departmentCode,
          input.priority,
          input.isValid,
          JSON.stringify(input.validationErrors),
          rowUpdatedAt
        ]
      );
      const updatedRow = mapRowRecord(
        updateResult.rows[0] as ProductionPlanRowRecord | undefined
      );

      if (!updatedRow) {
        return null;
      }
      const batchUpdatedAt = nextTimestamp();
      const batchUpdateResult = await memoryPool.query(
        `update production_plan.production_plan_import_batches
          set total_row_count = $2,
              valid_row_count = $3,
              invalid_row_count = $4,
              updated_at = $5
        where id = $1
        returning
          id,
          file_name,
          sheet_name,
          week_number,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          activated_at,
          created_at,
          updated_at`,
        [
          existingBatch.id,
          totalRowCount,
          validRowCount,
          invalidRowCount,
          batchUpdatedAt
        ]
      );
      const updatedBatch = mapBatchRow(
        batchUpdateResult.rows[0] as ProductionPlanImportBatchRow | undefined
      );

      if (!updatedBatch) {
        throw new Error("Failed to update production plan batch summary.");
      }

      return {
        batch: updatedBatch,
        row: updatedRow
      };
    }
  };
}

function mapBatchRow(
  row: ProductionPlanImportBatchRow | undefined
): ProductionPlanImportBatchResponse | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fileName: row.file_name,
    sheetName: row.sheet_name,
    weekNumber: row.week_number,
    status: row.status,
    totalRowCount: row.total_row_count,
    validRowCount: row.valid_row_count,
    invalidRowCount: row.invalid_row_count,
    activatedAt:
      row.activated_at === null ? null : normalizeTimestamp(row.activated_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function mapRowRecord(
  row: ProductionPlanRowRecord | undefined
): ProductionPlanImportRowResponse | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    batchId: row.batch_id,
    rowIndex: row.row_index,
    sourceRowJson:
      typeof row.source_row_json === "string"
        ? JSON.parse(row.source_row_json)
        : row.source_row_json,
    weekRaw: row.week_raw,
    weekNumber: row.week_number,
    customerName: row.customer_name,
    orderingPartyCode: row.ordering_party_code,
    customerOrderNumber: row.customer_order_number,
    customerOrderItemNumber: row.customer_order_item_number,
    workOrderNumber: row.work_order_number,
    materialCode: row.material_code,
    materialName: row.material_name,
    quantity:
      row.quantity === null ? null : typeof row.quantity === "number" ? row.quantity : Number(row.quantity),
    orderUnit: row.order_unit,
    plannedFinishDate:
      row.planned_finish_date === null
        ? null
        : normalizeDateOnly(row.planned_finish_date),
    departmentCode: row.department_code,
    priority: row.priority,
    isValid: row.is_valid,
    validationErrors:
      typeof row.validation_errors === "string"
        ? JSON.parse(row.validation_errors)
        : row.validation_errors,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  };
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function buildRequiredHeaders(): unknown[] {
  return [
    "Hafta",
    "Ad",
    "Sprş.veren",
    "Mştr.no.",
    "Mştr.klm.",
    "Sipariş",
    "Malzeme no.",
    "Malzeme kısa metni",
    "Miktar",
    "Sprş.ÖB",
    "Plnl.bitiş",
    "Bölüm",
    "Öncelik"
  ];
}

function buildProductionPlanRow(
  overrides: Partial<{
    week: unknown;
    customerName: unknown;
    orderingPartyCode: unknown;
    customerOrderNumber: unknown;
    customerOrderItemNumber: unknown;
    workOrderNumber: unknown;
    materialCode: unknown;
    materialName: unknown;
    quantity: unknown;
    orderUnit: unknown;
    plannedFinishDate: unknown;
    departmentCode: unknown;
    priority: unknown;
  }> = {}
): unknown[] {
  return [
    overrides.week ?? "12",
    overrides.customerName ?? "Acme Aluminyum",
    overrides.orderingPartyCode ?? "OP-001",
    overrides.customerOrderNumber ?? "000123",
    overrides.customerOrderItemNumber ?? "00010",
    overrides.workOrderNumber ?? "WO-001",
    overrides.materialCode ?? "MAT-001",
    overrides.materialName ?? "Ana Profil",
    overrides.quantity ?? "25",
    overrides.orderUnit ?? "ADET",
    overrides.plannedFinishDate ?? "17.03.2026",
    overrides.departmentCode ?? "CUT01",
    overrides.priority ?? "YUKSEK"
  ];
}

function createWorkbookBuffer(
  sheets: Record<string, unknown[][]>
): Buffer {
  const workbook = XLSX.utils.book_new();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows, {
      cellDates: true
    });

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  const workbookBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer"
  });

  return Buffer.isBuffer(workbookBuffer)
    ? workbookBuffer
    : Buffer.from(workbookBuffer);
}

function excelSerialDate(year: number, month: number, day: number): number {
  const excelEpoch = Date.UTC(1899, 11, 30);
  const dateValue = Date.UTC(year, month - 1, day);

  return (dateValue - excelEpoch) / 86_400_000;
}
