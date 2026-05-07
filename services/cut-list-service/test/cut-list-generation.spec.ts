import { describe, expect, it, vi } from "vitest";

import { CutListsService } from "../src/modules/cut-list/cut-lists.service";

const baseBatch = {
  id: "batch-1",
  fileName: "plan.xlsx",
  sheetName: "Sheet1",
  planYear: 2026,
  weekNumber: 16,
  status: "active",
  totalRowCount: 1,
  validRowCount: 1,
  invalidRowCount: 0,
  activatedAt: "2026-04-15T08:00:00.000Z",
  createdAt: "2026-04-15T07:00:00.000Z",
  updatedAt: "2026-04-15T08:00:00.000Z"
} as const;

const baseRow = {
  id: "row-1",
  rowIndex: 2,
  weekRaw: "16",
  weekNumber: 16,
  customerName: "ACME",
  orderingPartyCode: "1000",
  customerOrderNumber: "45000001",
  customerOrderItemNumber: "10",
  workOrderNumber: "10000001",
  materialCode: "LP-100",
  materialName: "LP Premium RAL9005 A4 (210 x 297)",
  materialColor: "RAL9005" as string | null,
  materialSize: "A4" as string | null,
  mainProfileCode: null as string | null,
  quantity: 4,
  orderUnit: "ADT",
  plannedFinishDate: "2026-04-15",
  departmentCode: "7",
  departmentName: "KESIMHANE-UYUP",
  priority: "1",
  priorityLevel: 1,
  isValid: true,
  validationErrors: []
};

const baseProfile = {
  id: "profile-1",
  code: "PR-001",
  name: "Main Profile",
  stockLengthMm: 6000,
  linkedProductCode: "LP-100",
  linkedProductName: "LP Premium",
  cuttingSpecs: [
    {
      id: "spec-1",
      cuttingCode: "CUT-1",
      cuttingName: "Front",
      cuttingLengthMm: 1200,
      unitQuantity: 2.5,
      unitName: "adet"
    }
  ],
  isActive: true,
  notes: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z"
};

function createService({
  row = baseRow,
  profiles = [baseProfile],
  existingSnapshot = null
}: {
  row?: typeof baseRow;
  profiles?: ReadonlyArray<typeof baseProfile>;
  existingSnapshot?: unknown;
} = {}) {
  const repository = {
    findBySourceBatchId: vi.fn(async () => existingSnapshot),
    create: vi.fn(async (input) => ({
      id: "snapshot-1",
      planYear: input.summary.planYear,
      weekNumber: input.weekNumber,
      sourceBatchId: input.sourceBatchId,
      status: input.summary.status,
      payloadJson: input.payloadJson,
      totalProductionRows: input.summary.totalProductionRows,
      matchedProductionRows: input.summary.matchedProductionRows,
      unmatchedProductionRows: input.summary.unmatchedProductionRows,
      totalCuttingLines: input.summary.totalCuttingLines,
      createdAt: "2026-04-15T08:01:00.000Z"
    }))
  };

  const service = new CutListsService(
    {
      getActiveBatchRowsByWeekNumber: vi.fn(async () => ({
        batch: baseBatch,
        rows: [row]
      }))
    } as never,
    {
      getMainProfiles: vi.fn(async () => [...profiles])
    } as never,
    repository as never
  );

  return { service, repository };
}

describe("CutListsService autonomous matching", () => {
  it("creates cutting lines from product code and guarded product name match", async () => {
    const { service } = createService();

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.snapshot.planYear).toBe(2026);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.cuttingLines[0]?.cuttingQuantity).toBe(10);
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("matches on material code alone when SAP short text differs from linkedProductName but only one profile exists", async () => {
    const { service } = createService({
      profiles: [{ ...baseProfile, linkedProductName: "SHORT LABEL" }]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("does not match when two profiles share the code and short text fits neither linkedProductName", async () => {
    const { service } = createService({
      profiles: [
        {
          ...baseProfile,
          id: "profile-a",
          code: "PR-A",
          linkedProductName: "Different A"
        },
        {
          ...baseProfile,
          id: "profile-b",
          code: "PR-B",
          linkedProductName: "Different B"
        }
      ]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.unmatchedRows[0]?.reasonCodes).toContain(
      "missing_product_name_match"
    );
  });

  it("narrows via mainProfileCode when several profiles share the material code", async () => {
    const row = { ...baseRow, mainProfileCode: "PR-B" };
    const { service } = createService({
      row,
      profiles: [
        {
          ...baseProfile,
          id: "profile-a",
          code: "PR-A",
          linkedProductName: "LP Premium",
          cuttingSpecs: baseProfile.cuttingSpecs
        },
        {
          ...baseProfile,
          id: "profile-b",
          code: "PR-B",
          linkedProductName: "Other Thing",
          cuttingSpecs: baseProfile.cuttingSpecs
        }
      ]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.cuttingLines[0]?.profileCode).toBe("PR-B");
  });

  it("keeps rows unmatched when color cannot be safely extracted", async () => {
    const { service } = createService({
      row: {
        ...baseRow,
        materialName: "LP Premium A4",
        materialColor: null
      },
      profiles: [baseProfile]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(0);
    expect(snapshot.unmatchedRows[0]?.reasonCodes).toContain("missing_color");
  });

  it("does not create a duplicate snapshot for the same activated source batch", async () => {
    const existingSnapshot = {
      id: "snapshot-existing",
      planYear: 2026,
      weekNumber: 16,
      sourceBatchId: "batch-1",
      status: "created",
      payloadJson: {
        snapshot: {
          id: "snapshot-existing",
          planYear: 2026,
          weekNumber: 16,
          sourceBatchId: "batch-1",
          status: "created",
          totalProductionRows: 1,
          matchedProductionRows: 1,
          unmatchedProductionRows: 0,
          totalCuttingLines: 1,
          createdAt: "2026-04-15T08:01:00.000Z"
        },
        items: [],
        unmatchedRows: []
      },
      totalProductionRows: 1,
      matchedProductionRows: 1,
      unmatchedProductionRows: 0,
      totalCuttingLines: 1,
      createdAt: "2026-04-15T08:01:00.000Z"
    };
    const { service, repository } = createService({ existingSnapshot });

    const snapshot = await service.createSnapshotForActivatedBatch({
      metadata: {
        messageId: "message-1",
        correlationId: "message-1",
        causationId: "batch-1",
        attempt: 1,
        occurredAt: "2026-04-15T08:00:00.000Z"
      },
      sourceBatchId: "batch-1",
      planYear: 2026,
      weekNumber: 16,
      activatedAt: "2026-04-15T08:00:00.000Z"
    });

    expect(snapshot.snapshot.id).toBe("snapshot-existing");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("createSnapshot for a week refreshes an existing snapshot for the active batch", async () => {
    const existingSnapshotRecord = {
      id: "snapshot-existing",
      planYear: 2026,
      weekNumber: 16,
      sourceBatchId: "batch-1",
      status: "created",
      payloadJson: {
        snapshot: {
          id: "snapshot-existing",
          planYear: 2026,
          weekNumber: 16,
          sourceBatchId: "batch-1",
          status: "created",
          totalProductionRows: 1,
          matchedProductionRows: 0,
          unmatchedProductionRows: 1,
          totalCuttingLines: 0,
          createdAt: "2026-04-15T08:01:00.000Z"
        },
        items: [],
        unmatchedRows: [{ reasonCodes: ["missing_color"] }]
      },
      totalProductionRows: 1,
      matchedProductionRows: 0,
      unmatchedProductionRows: 1,
      totalCuttingLines: 0,
      createdAt: "2026-04-15T08:01:00.000Z"
    };

    const repository = {
      findBySourceBatchId: vi.fn(async () => existingSnapshotRecord),
      create: vi.fn(),
      updateBySourceBatchId: vi.fn(async (_batchId, input) => ({
        ...existingSnapshotRecord,
        ...input,
        id: existingSnapshotRecord.id,
        createdAt: existingSnapshotRecord.createdAt,
        sourceBatchId: existingSnapshotRecord.sourceBatchId,
        status: "created"
      }))
    };

    const service = new CutListsService(
      {
        getActiveBatchRowsByWeekNumber: vi.fn(async () => ({
          batch: baseBatch,
          rows: [baseRow]
        }))
      } as never,
      {
        getMainProfiles: vi.fn(async () => [baseProfile])
      } as never,
      repository as never
    );

    const snapshot = await service.createSnapshot(16);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateBySourceBatchId).toHaveBeenCalledTimes(1);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("derives A4 from SAP-style material code when production row has no materialSize", async () => {
    const materialCode = "UMBSG205A4X2000";
    const rowWithCodeOnlySize = {
      ...baseRow,
      materialCode,
      materialSize: null as string | null
    };
    const profile = { ...baseProfile, linkedProductCode: materialCode };

    const { service } = createService({
      row: rowWithCodeOnlySize,
      profiles: [profile]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("derives arbitrary inch size from material short text when imported size is missing", async () => {
    const materialCode = "USWPS00B26X5004";
    const rowWithInchSizeOnlyInName = {
      ...baseRow,
      materialCode,
      materialName: 'WINDPRO SLIM 22"X60" RAL9005 CERCEVE',
      materialSize: null as string | null
    };
    const profile = {
      ...baseProfile,
      linkedProductCode: materialCode,
      linkedProductName: 'WINDPRO SLIM 22"X60" RAL9005 CERCEVE'
    };

    const { service } = createService({
      row: rowWithInchSizeOnlyInName,
      profiles: [profile]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.materialSize).toBe('22"X60"');
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("matches profiled products with generic size when the short text has no size token", async () => {
    const materialCode = "UFSL001000X2000";
    const rowWithoutSizeToken = {
      ...baseRow,
      materialCode,
      materialName: "LEAFLET STAND",
      materialSize: null as string | null
    };
    const profile = {
      ...baseProfile,
      linkedProductCode: materialCode,
      linkedProductName: "LEAFLET STAND"
    };

    const { service } = createService({
      row: rowWithoutSizeToken,
      profiles: [profile]
    });

    const snapshot = await service.createSnapshot(16);

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.materialSize).toBe("GENEL");
    expect(snapshot.unmatchedRows).toHaveLength(0);
  });

  it("reconcile rebuilds snapshot in place when the batch snapshot already exists", async () => {
    const existingSnapshotRecord = {
      id: "snapshot-existing",
      planYear: 2026,
      weekNumber: 16,
      sourceBatchId: "batch-1",
      status: "created",
      payloadJson: {
        snapshot: {
          id: "snapshot-existing",
          planYear: 2026,
          weekNumber: 16,
          sourceBatchId: "batch-1",
          status: "created",
          totalProductionRows: 1,
          matchedProductionRows: 0,
          unmatchedProductionRows: 1,
          totalCuttingLines: 0,
          createdAt: "2026-04-15T08:01:00.000Z"
        },
        items: [],
        unmatchedRows: [
          {
            productionRowId: baseRow.id,
            rowIndex: baseRow.rowIndex,
            materialCode: baseRow.materialCode,
            materialName: baseRow.materialName,
            workOrderNumber: baseRow.workOrderNumber,
            reasonCodes: ["missing_color"],
            reasons: ["stale"]
          }
        ]
      },
      totalProductionRows: 1,
      matchedProductionRows: 0,
      unmatchedProductionRows: 1,
      totalCuttingLines: 0,
      createdAt: "2026-04-15T08:01:00.000Z"
    };

    const repository = {
      findBySourceBatchId: vi.fn(async () => existingSnapshotRecord),
      create: vi.fn(),
      updateBySourceBatchId: vi.fn(async (_batchId, input) => ({
        ...existingSnapshotRecord,
        ...input,
        id: existingSnapshotRecord.id,
        createdAt: existingSnapshotRecord.createdAt,
        sourceBatchId: existingSnapshotRecord.sourceBatchId,
        status: "created"
      }))
    };

    const service = new CutListsService(
      {
        getActiveBatchRowsByWeekNumber: vi.fn(),
        getRowsByBatchId: vi.fn(async () => [baseRow])
      } as never,
      {
        getMainProfiles: vi.fn(async () => [baseProfile])
      } as never,
      repository as never
    );

    const refreshed = await service.refreshSnapshotForCutListReconcile({
      metadata: {
        messageId: "msg-1",
        correlationId: "msg-1",
        causationId: "batch-1",
        attempt: 1,
        occurredAt: "2026-04-15T09:00:00.000Z"
      },
      sourceBatchId: "batch-1",
      planYear: 2026,
      weekNumber: 16,
      occurredAt: "2026-04-15T09:00:00.000Z"
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateBySourceBatchId).toHaveBeenCalledTimes(1);
    expect(refreshed.items).toHaveLength(1);
    expect(refreshed.unmatchedRows).toHaveLength(0);
    expect(refreshed.snapshot.id).toBe("snapshot-existing");
  });
});
