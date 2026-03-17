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

type ProductionPlanImportBatchResponse = {
  id: string;
  fileName: string;
  sheetName: string;
  status: "completed" | "completed_with_invalid_rows";
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
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
  status: "completed" | "completed_with_invalid_rows";
  total_row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type ProductionPlanRowRecord = {
  id: string;
  batch_id: string;
  row_index: number;
  source_row_json: Record<string, unknown>;
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
  validation_errors: string[];
  created_at: string | Date;
  updated_at: string | Date;
};

type ProductionPlanImportsRepositoryShape = Pick<
  ProductionPlanImportsRepository,
  | "createImportBatch"
  | "findImportBatches"
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
    ({ ProductionPlanImportsRepository } = await import(
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

    const productionPlanImportsRepository = createRepositoryDouble(memoryPool);

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

  it("imports a valid workbook, persists mixed-validity rows, and recomputes batch summary after patch", async () => {
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
    expect(createdBatch.totalRowCount).toBe(5);
    expect(createdBatch.validRowCount).toBe(4);
    expect(createdBatch.invalidRowCount).toBe(1);
    expect(createdBatch.status).toBe("completed_with_invalid_rows");

    const listResponse = await request(httpServer)
      .get("/production-plan-imports")
      .expect(200);
    const listedBatches = listResponse.body as ProductionPlanImportBatchResponse[];

    expect(listedBatches).toHaveLength(1);
    expect(listedBatches[0]).toMatchObject({
      id: createdBatch.id,
      fileName: "weekly-production-plan.xlsx",
      totalRowCount: 5,
      validRowCount: 4,
      invalidRowCount: 1
    });

    const detailResponse = await request(httpServer)
      .get(`/production-plan-imports/${createdBatch.id}`)
      .expect(200);
    const batchDetail = detailResponse.body as ProductionPlanImportBatchResponse;

    expect(batchDetail).toMatchObject({
      id: createdBatch.id,
      fileName: "weekly-production-plan.xlsx",
      sheetName: "Weekly Plan",
      totalRowCount: 5,
      validRowCount: 4,
      invalidRowCount: 1,
      status: "completed_with_invalid_rows"
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
      totalRowCount: 5,
      validRowCount: 5,
      invalidRowCount: 0,
      status: "completed"
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
    expect(createdBatch.totalRowCount).toBe(1);
    expect(createdBatch.validRowCount).toBe(1);
    expect(createdBatch.invalidRowCount).toBe(0);
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
});

async function createDatabaseSchema(memoryPool: QueryablePool): Promise<void> {
  await memoryPool.query('create schema if not exists "production_plan";');
  await memoryPool.query(`
    create table production_plan.import_batches (
      id uuid primary key,
      file_name varchar(255) not null,
      sheet_name varchar(255) not null,
      status varchar(40) not null,
      total_row_count integer not null,
      valid_row_count integer not null,
      invalid_row_count integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await memoryPool.query(`
    create table production_plan.rows (
      id uuid primary key,
      batch_id uuid not null references production_plan.import_batches (id) on delete cascade,
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await memoryPool.query(`
    create index production_plan_rows_batch_id_idx
      on production_plan.rows (batch_id);
  `);
  await memoryPool.query(`
    create unique index production_plan_rows_batch_id_row_index_unique
      on production_plan.rows (batch_id, row_index);
  `);
}

function createRepositoryDouble(
  memoryPool: QueryablePool
): ProductionPlanImportsRepositoryShape {
  return {
    async createImportBatch(
      input: CreateProductionPlanImportBatchRecord
    ): Promise<ProductionPlanImportBatchResponse> {
      const result = await memoryPool.query(
        `insert into production_plan.import_batches
          (id, file_name, sheet_name, status, total_row_count, valid_row_count, invalid_row_count)
        values
          ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          file_name,
          sheet_name,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          created_at,
          updated_at`,
        [
          crypto.randomUUID(),
          input.fileName,
          input.sheetName,
          input.status,
          input.totalRowCount,
          input.validRowCount,
          input.invalidRowCount
        ]
      );
      const createdBatch = mapBatchRow(
        result.rows[0] as ProductionPlanImportBatchRow | undefined
      );

      if (!createdBatch) {
        throw new Error("Failed to create production plan batch.");
      }

      for (const row of input.rows) {
        await memoryPool.query(
          `insert into production_plan.rows
            (id, batch_id, row_index, source_row_json, week_raw, week_number, customer_name,
             ordering_party_code, customer_order_number, customer_order_item_number, work_order_number,
             material_code, material_name, quantity, order_unit, planned_finish_date,
             department_code, priority, is_valid, validation_errors)
          values
            ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18, $19, $20)`,
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
            JSON.stringify(row.validationErrors)
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
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          created_at,
          updated_at
        from production_plan.import_batches
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
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          created_at,
          updated_at
        from production_plan.import_batches
        where id = $1
        limit 1`,
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
          quantity,
          order_unit,
          planned_finish_date,
          department_code,
          priority,
          is_valid,
          validation_errors,
          created_at,
          updated_at
        from production_plan.rows
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
        from production_plan.rows
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

      const updateResult = await memoryPool.query(
        `update production_plan.rows
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
              updated_at = now()
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
          JSON.stringify(input.validationErrors)
        ]
      );
      const updatedRow = mapRowRecord(
        updateResult.rows[0] as ProductionPlanRowRecord | undefined
      );

      if (!updatedRow) {
        return null;
      }

      const summaryResult = await memoryPool.query(
        `select
          count(*)::int as total_row_count,
          sum(case when is_valid then 1 else 0 end)::int as valid_row_count,
          sum(case when is_valid then 0 else 1 end)::int as invalid_row_count
        from production_plan.rows
        where batch_id = $1`,
        [updatedRow.batchId]
      );
      const summary = summaryResult.rows[0] as {
        total_row_count: number;
        valid_row_count: number;
        invalid_row_count: number;
      };
      const status =
        summary.invalid_row_count > 0
          ? "completed_with_invalid_rows"
          : "completed";

      const batchUpdateResult = await memoryPool.query(
        `update production_plan.import_batches
          set total_row_count = $2,
              valid_row_count = $3,
              invalid_row_count = $4,
              status = $5,
              updated_at = now()
        where id = $1
        returning
          id,
          file_name,
          sheet_name,
          status,
          total_row_count,
          valid_row_count,
          invalid_row_count,
          created_at,
          updated_at`,
        [
          updatedRow.batchId,
          summary.total_row_count,
          summary.valid_row_count,
          summary.invalid_row_count,
          status
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
    status: row.status,
    totalRowCount: row.total_row_count,
    validRowCount: row.valid_row_count,
    invalidRowCount: row.invalid_row_count,
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
