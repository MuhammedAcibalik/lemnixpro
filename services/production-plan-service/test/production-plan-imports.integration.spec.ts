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
  planYear: number | null;
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
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
};

type ProductionPlanActiveBatchRowResponse = {
  id: string;
  rowIndex: number;
  weekRaw: string | null;
  weekNumber: number | null;
  customerName: string | null;
  orderingPartyCode: string | null;
  customerOrderNumber: string | null;
  customerOrderItemNumber: string | null;
  workOrderNumber: string | null;
  materialCode: string | null;
  materialName: string | null;
  materialColor: string | null;
  materialSize: string | null;
  mainProfileCode: string | null;
  quantity: number | null;
  orderUnit: string | null;
  plannedFinishDate: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  priority: string | null;
  priorityLevel: number | null;
  isValid: boolean;
  validationErrors: string[];
};

type ProductionPlanActiveBatchRowsResponse = {
  batch: ProductionPlanImportBatchResponse;
  rows: ProductionPlanActiveBatchRowResponse[];
};

type ProductionPlanImportBatchRow = {
  id: string;
  file_name: string;
  sheet_name: string;
  plan_year?: number | null;
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
  material_color: string | null;
  material_size: string | null;
  main_profile_code: string | null;
  quantity: number | string | null;
  order_unit: string | null;
  planned_finish_date: string | Date | null;
  department_code: string | null;
  department_name: string | null;
  priority: string | null;
  priority_level: number | null;
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
    batchId: string,
    reason:
      | "no_valid_rows"
      | "missing_week"
      | "conflicting_weeks"
  ) => Error;
};

type ProductionPlanImportsRepositoryShape = Pick<
  ProductionPlanImportsRepository,
  | "activateBatchById"
  | "countRowsByBatchId"
  | "createImportBatch"
  | "deleteBatchById"
  | "findActiveBatchRowsByWeekNumber"
  | "findActiveBatchByWeekNumber"
  | "findImportBatches"
  | "findImportBatchesByWeekNumber"
  | "findImportBatchById"
  | "findRowsByBatchId"
  | "findRowsByBatchIdPage"
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
        "Miktar pozitif sayı olmalıdır.",
        "Plnl.bitiş geçerli bir tarih olmalıdır."
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

    expect(response.body.message).toContain("zorunlu kolonlar");
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

  it("accepts SAP-style header spellings and quantity cells that include a unit suffix", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Kesimhane Plan": [
        buildScreenshotStyleHeaders(),
        [
          "1",
          "HL DISPLAY SRL",
          "3003429",
          "110102534",
          "130",
          "2358160",
          "UYUP01265X5001",
          "30X70 NOVEL STAND 1850 MM",
          "304 ADT",
          "ADT",
          "2.01.2026",
          "1",
          "2"
        ]
      ]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "Kesimhane_Uretim_Plani_1_Hafta.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(201);
    const createdBatch = response.body as ProductionPlanImportBatchResponse;

    expect(createdBatch.weekNumber).toBe(1);
    expect(createdBatch.totalRowCount).toBe(1);
    expect(createdBatch.validRowCount).toBe(1);

    const rowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}/rows`)
      .expect(200);
    const rows = rowsResponse.body as ProductionPlanImportRowResponse[];

    expect(rows[0]).toMatchObject({
      customerName: "HL DISPLAY SRL",
      orderingPartyCode: "3003429",
      customerOrderNumber: "110102534",
      customerOrderItemNumber: "130",
      workOrderNumber: "2358160",
      materialCode: "UYUP01265X5001",
      materialName: "30X70 NOVEL STAND 1850 MM",
      quantity: 304,
      orderUnit: "ADT",
      plannedFinishDate: "2026-01-02",
      departmentCode: "1",
      departmentName: "MONTAJ",
      priorityLevel: 2,
      isValid: true
    });
  });

  it("uses ISO week-year for week 1 plans that span calendar years", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [
        buildRequiredHeaders(),
        buildProductionPlanRow({
          week: "1",
          customerOrderNumber: "2026-W01-A",
          workOrderNumber: "WO-2026-W01-A",
          plannedFinishDate: "31.12.2025"
        }),
        buildProductionPlanRow({
          week: "1",
          customerOrderNumber: "2026-W01-B",
          workOrderNumber: "WO-2026-W01-B",
          plannedFinishDate: "01.01.2026"
        })
      ]
    });

    const response = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "Kesimhane_Uretim_Plani_1_Hafta.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(201);
    const createdBatch = response.body as ProductionPlanImportBatchResponse;

    expect(createdBatch.weekNumber).toBe(1);
    expect(createdBatch.planYear).toBe(2026);
    expect(createdBatch.validRowCount).toBe(2);
  });

  it("returns paged rows with total count for one batch", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const dataRows = Array.from({ length: 5 }, (_, index) =>
      buildProductionPlanRow({
        customerOrderNumber: `${200000 + index}`,
        workOrderNumber: `WO-PAGE-${index}`
      })
    );
    const workbookBuffer = createWorkbookBuffer({
      "Weekly Plan": [buildRequiredHeaders(), ...dataRows]
    });

    const createResponse = await request(httpServer)
      .post("/production-plan-imports")
      .attach("file", workbookBuffer, {
        filename: "paged-rows.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      })
      .expect(201);
    const batch = createResponse.body as ProductionPlanImportBatchResponse;

    const page1 = await request(httpServer)
      .get(`/production-plan-imports/${batch.id}/rows/paged?limit=2&offset=0`)
      .expect(200);

    expect(page1.body.totalCount).toBe(5);
    expect(page1.body.rows).toHaveLength(2);
    expect(page1.body.limit).toBe(2);
    expect(page1.body.offset).toBe(0);

    const lastPage = await request(httpServer)
      .get(`/production-plan-imports/${batch.id}/rows/paged?limit=2&offset=4`)
      .expect(200);
    expect(lastPage.body.rows).toHaveLength(1);
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

    expect(response.body.message).toContain("en fazla 10000 veri satırı");
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

  it("returns 404 when no active batch exists for active-batch rows lookup", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-12-imported-only.xlsx"
    );

    const response = await request(httpServer)
      .get("/production-plan-weeks/12/active-batch/rows")
      .expect(404);

    expect(response.body.message).toContain(
      'No active production plan import batch exists for week "12"'
    );
  });

  it("returns the active batch summary with only its rows ordered by rowIndex", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const supersededBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerName: "Superseded Customer",
            customerOrderNumber: "000124",
            workOrderNumber: "WO-002"
          })
        ]
      },
      "week-12-superseded-rows.xlsx"
    );
    const activeBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerName: "Active Customer A",
            customerOrderNumber: "000125",
            workOrderNumber: "WO-003"
          }),
          buildProductionPlanRow({
            customerName: "Active Customer B",
            customerOrderNumber: "000126",
            workOrderNumber: "WO-004"
          })
        ]
      },
      "week-12-active-rows.xlsx"
    );
    const importedBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [
          buildRequiredHeaders(),
          buildProductionPlanRow({
            customerName: "Imported Customer",
            customerOrderNumber: "000127",
            workOrderNumber: "WO-005"
          })
        ]
      },
      "week-12-imported-rows.xlsx"
    );

    await request(httpServer)
      .post(`/production-plan-imports/${supersededBatch.id}/activate`)
      .expect(200);
    await request(httpServer)
      .post(`/production-plan-imports/${activeBatch.id}/activate`)
      .expect(200);

    const activeBatchRowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${activeBatch.id}/rows`)
      .expect(200);
    const activeBatchRows =
      activeBatchRowsResponse.body as ProductionPlanImportRowResponse[];

    const supersededBatchRowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${supersededBatch.id}/rows`)
      .expect(200);
    const supersededBatchRows =
      supersededBatchRowsResponse.body as ProductionPlanImportRowResponse[];

    const importedBatchRowsResponse = await request(httpServer)
      .get(`/production-plan-imports/${importedBatch.id}/rows`)
      .expect(200);
    const importedBatchRows =
      importedBatchRowsResponse.body as ProductionPlanImportRowResponse[];

    const response = await request(httpServer)
      .get("/production-plan-weeks/12/active-batch/rows")
      .expect(200);
    const payload = response.body as ProductionPlanActiveBatchRowsResponse;

    expect(payload.batch).toMatchObject({
      id: activeBatch.id,
      weekNumber: 12,
      fileName: "week-12-active-rows.xlsx",
      sheetName: "Weekly Plan",
      status: "active",
      totalRowCount: 2,
      validRowCount: 2,
      invalidRowCount: 0
    });
    expect(payload.batch.activatedAt).toBeTruthy();

    expect(payload.rows.map((row) => row.rowIndex)).toEqual([2, 3]);
    expect(payload.rows.map((row) => row.id)).toEqual(
      activeBatchRows.map((row) => row.id)
    );
    expect(payload.rows).toMatchObject([
      {
        id: activeBatchRows[0]!.id,
        rowIndex: 2,
        customerName: "Active Customer A",
        customerOrderNumber: "000125",
        workOrderNumber: "WO-003",
        isValid: true,
        validationErrors: []
      },
      {
        id: activeBatchRows[1]!.id,
        rowIndex: 3,
        customerName: "Active Customer B",
        customerOrderNumber: "000126",
        workOrderNumber: "WO-004",
        isValid: true,
        validationErrors: []
      }
    ]);
    expect(payload.rows.map((row) => row.id)).not.toContain(
      supersededBatchRows[0]!.id
    );
    expect(payload.rows.map((row) => row.id)).not.toContain(
      importedBatchRows[0]!.id
    );
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

  it("infers batch week from valid rows when batch week_number was unset", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const created = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "week-infer-on-activate.xlsx"
    );

    expect(created.weekNumber).toBe(12);

    await memoryPool.query(
      `update production_plan.production_plan_import_batches
       set week_number = null
       where id = $1`,
      [created.id]
    );

    const response = await request(httpServer)
      .post(`/production-plan-imports/${created.id}/activate`)
      .expect(200);

    const activated = response.body as ProductionPlanImportBatchResponse;
    expect(activated.status).toBe("active");
    expect(activated.weekNumber).toBe(12);
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
      .get("/production-plan-weeks/12.5/active-batch/rows")
      .expect(400);
    expect(decimalWeekResponse.body.message).toContain(
      "weekNumber must be a positive integer"
    );

    const nonNumericWeekResponse = await request(httpServer)
      .get("/production-plan-weeks/not-a-number/active-batch/rows")
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

  it("deletes an import batch and returns 404 on subsequent read", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const createdBatch = await createImport(
      httpServer,
      {
        "Weekly Plan": [buildRequiredHeaders(), buildProductionPlanRow()]
      },
      "delete-me.xlsx"
    );

    await request(httpServer)
      .delete(`/production-plan-imports/${createdBatch.id}`)
      .expect(204);

    await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}`)
      .expect(404);

    const listResponse = await request(httpServer)
      .get("/production-plan-imports")
      .expect(200);
    const listed = listResponse.body as ProductionPlanImportBatchResponse[];

    expect(listed.find((b) => b.id === createdBatch.id)).toBeUndefined();
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
      plan_year integer,
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
      material_name text,
      material_color varchar(40),
      material_size varchar(20),
      quantity numeric(18, 3),
      order_unit varchar(50),
      planned_finish_date date,
      department_code varchar(100),
      department_name varchar(100),
      priority varchar(100),
      priority_level integer,
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
          (id, file_name, sheet_name, plan_year, week_number, status, total_row_count, valid_row_count, invalid_row_count, activated_at, created_at, updated_at)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning
          id,
          file_name,
          sheet_name,
          plan_year,
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
          input.planYear,
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
             material_code, material_name, material_color, material_size, quantity, order_unit,
             planned_finish_date, department_code, department_name, priority, priority_level,
             is_valid, validation_errors, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17,
             $18, $19, $20, $21, $22,
             $23, $24, $25, $26)`,
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
            row.materialColor,
            row.materialSize,
            row.quantity,
            row.orderUnit,
            row.plannedFinishDate,
            row.departmentCode,
            row.departmentName,
            row.priority,
            row.priorityLevel,
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
    async findActiveBatchRowsByWeekNumber(
      weekNumber: number
    ): Promise<{
      batch: ProductionPlanImportBatchResponse;
      rows: ProductionPlanImportRowResponse[];
    } | null> {
      const batch = (await this.findActiveBatchByWeekNumber(
        weekNumber
      )) as ProductionPlanImportBatchResponse | null;

      if (!batch) {
        return null;
      }

      const rows = (await this.findRowsByBatchId(
        batch.id
      )) as ProductionPlanImportRowResponse[];

      return {
        batch,
        rows
      };
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

      const summaryResult = await memoryPool.query(
        `select
          count(*)::int as total,
          coalesce(sum(case when is_valid then 1 else 0 end), 0)::int as valid,
          coalesce(sum(case when is_valid then 0 else 1 end), 0)::int as invalid
        from production_plan.production_plan_rows
        where batch_id = $1`,
        [id]
      );
      const summaryRow = summaryResult.rows[0] as
        | { total: number; valid: number; invalid: number }
        | undefined;
      const totalRowCount = summaryRow?.total ?? 0;
      const validRowCount = summaryRow?.valid ?? 0;
      const invalidRowCount = summaryRow?.invalid ?? 0;
      const syncTimestamp = nextTimestamp();
      await memoryPool.query(
        `update production_plan.production_plan_import_batches
        set total_row_count = $2,
            valid_row_count = $3,
            invalid_row_count = $4,
            updated_at = $5
        where id = $1`,
        [id, totalRowCount, validRowCount, invalidRowCount, syncTimestamp]
      );

      let batch = (await this.findImportBatchById(
        id
      )) as ProductionPlanImportBatchResponse;

      if (batch.weekNumber === null && batch.validRowCount > 0) {
        const weeksResult = await memoryPool.query(
          `select distinct week_number
          from production_plan.production_plan_rows
          where batch_id = $1
            and is_valid = true
            and week_number is not null`,
          [id]
        );
        const distinctWeeks = weeksResult.rows
          .map((row) => (row as { week_number: number }).week_number)
          .filter((w) => w != null);

        if (distinctWeeks.length === 0) {
          throw new errors.ProductionPlanImportBatchNotActivatableError(
            id,
            "missing_week"
          );
        }

        if (distinctWeeks.length > 1) {
          throw new errors.ProductionPlanImportBatchNotActivatableError(
            id,
            "conflicting_weeks"
          );
        }

        const [resolvedWeek] = distinctWeeks;
        const inferTimestamp = nextTimestamp();
        await memoryPool.query(
          `update production_plan.production_plan_import_batches
          set week_number = $2,
              updated_at = $3
          where id = $1`,
          [id, resolvedWeek, inferTimestamp]
        );
        batch = (await this.findImportBatchById(
          id
        )) as ProductionPlanImportBatchResponse;
      }

      if (batch.validRowCount <= 0) {
        throw new errors.ProductionPlanImportBatchNotActivatableError(
          id,
          "no_valid_rows"
        );
      }

      if (batch.weekNumber === null) {
        throw new errors.ProductionPlanImportBatchNotActivatableError(
          id,
          "missing_week"
        );
      }

      const supersededTimestamp = nextTimestamp();
      await memoryPool.query(
        `update production_plan.production_plan_import_batches
          set status = 'superseded',
              updated_at = $2
        where week_number = $1
          and status = 'active'`,
        [batch.weekNumber, supersededTimestamp]
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
    async deleteBatchById(id: string): Promise<ProductionPlanImportBatchResponse | null> {
      const result = await memoryPool.query(
        `delete from production_plan.production_plan_import_batches
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
        [id]
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
          material_color,
          material_size,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          department_name,
          priority,
          priority_level,
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
    async countRowsByBatchId(batchId: string): Promise<number> {
      const result = await memoryPool.query(
        `select count(*)::int as c
        from production_plan.production_plan_rows
        where batch_id = $1`,
        [batchId]
      );

      return Number((result.rows[0] as { c: number } | undefined)?.c ?? 0);
    },
    async findRowsByBatchIdPage(
      batchId: string,
      limit: number,
      offset: number
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
          material_color,
          material_size,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          department_name,
          priority,
          priority_level,
          is_valid,
          validation_errors,
          created_at,
          updated_at
        from production_plan.production_plan_rows
        where batch_id = $1
        order by row_index asc
        limit $2 offset $3`,
        [batchId, limit, offset]
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
          material_color,
          material_size,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          department_name,
          priority,
          priority_level,
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
              materialColor: input.materialColor,
              materialSize: input.materialSize,
              quantity: input.quantity,
              orderUnit: input.orderUnit,
              plannedFinishDate: input.plannedFinishDate,
              departmentCode: input.departmentCode,
              departmentName: input.departmentName,
              priority: input.priority,
              priorityLevel: input.priorityLevel,
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
              material_color = $11,
              material_size = $12,
              quantity = $13,
              order_unit = $14,
              planned_finish_date = $15,
              department_code = $16,
              department_name = $17,
              priority = $18,
              priority_level = $19,
              is_valid = $20,
              validation_errors = $21,
              updated_at = $22
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
          material_color,
          material_size,
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          department_name,
          priority,
          priority_level,
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
          input.materialColor,
          input.materialSize,
          input.quantity,
          input.orderUnit,
          input.plannedFinishDate,
          input.departmentCode,
          input.departmentName,
          input.priority,
          input.priorityLevel,
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
    planYear: row.plan_year ?? null,
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
    materialColor: row.material_color,
    materialSize: row.material_size,
    mainProfileCode: row.main_profile_code,
    quantity:
      row.quantity === null ? null : typeof row.quantity === "number" ? row.quantity : Number(row.quantity),
    orderUnit: row.order_unit,
    plannedFinishDate:
      row.planned_finish_date === null
        ? null
        : normalizeDateOnly(row.planned_finish_date),
    departmentCode: row.department_code,
    departmentName: row.department_name,
    priority: row.priority,
    priorityLevel: row.priority_level,
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

/** Column labels as in typical SAP / Kesimhane weekly exports (variant spellings). */
function buildScreenshotStyleHeaders(): unknown[] {
  return [
    "Hafta",
    "Ad",
    "Sipş.veren",
    "Mşt.no.",
    "Mşt.klm.",
    "Sipariş",
    "Malzeme no.",
    "Malzeme kısa metni",
    "Miktar",
    "Sipş.OB",
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
    overrides.materialName ?? "Ana Profil RAL9005 A0",
    overrides.quantity ?? "25",
    overrides.orderUnit ?? "ADET",
    overrides.plannedFinishDate ?? "17.03.2026",
    overrides.departmentCode ?? "7",
    overrides.priority ?? "1"
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
