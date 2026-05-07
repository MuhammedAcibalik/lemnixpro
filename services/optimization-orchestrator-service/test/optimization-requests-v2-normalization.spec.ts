import { UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type {
  CreateOptimizationRequestFromSnapshotRequest,
  MainProfile,
  OptimizationDemandItem,
  OptimizationQueueEnvelope,
  OptimizationRequestPayloadV2,
  OptimizationProfileGroup
} from "@lemnixpro/shared-contracts";
import { DEFAULT_OPTIMIZATION_CONFIG } from "@lemnixpro/shared-contracts";

import type { OptimizationRequestRecord } from "../src/infrastructure/db/schema";
import { OptimizationRequestsV2Service } from "../src/modules/optimization-orchestrator/optimization-requests-v2.service";

function makeService(): OptimizationRequestsV2Service {
  return new OptimizationRequestsV2Service(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never
  );
}

describe("OptimizationRequestsV2Service normalization", () => {
  it("repairs legacy decimal cutting lengths before optimization payload handoff", () => {
    const service = makeService() as unknown as {
      normalizeCuttingLengthForOptimization: (
        cuttingLengthMm: number,
        cuttingName: string
      ) => number;
    };

    expect(
      service.normalizeCuttingLengthForOptimization(
        7785,
        "A.P. KUTU 19X25 S.CERC.778.5 R9005 D.KSM"
      )
    ).toBe(779);
  });

  it("rejects demand that still cannot fit any usable stock bar", () => {
    const service = makeService() as unknown as {
      assertDemandItemsFitStock: (
        groups: OptimizationProfileGroup[],
        demandItems: OptimizationDemandItem[]
      ) => void;
    };
    const groups: OptimizationProfileGroup[] = [
      {
        mainProfileId: "mp-1",
        mainProfileCode: "PROF-1",
        mainProfileName: "Profile 1",
        materialColorClass: "painted",
        stockBars: [{ lengthMm: 6100, role: "primary" }],
        demandItemCount: 1,
        totalPieceLengthMm: 7000
      }
    ];
    const demandItems: OptimizationDemandItem[] = [
      {
        productionRowId: "row-1",
        rowIndex: 1,
        workOrderNumber: "WO-1",
        mainProfileId: "mp-1",
        mainProfileCode: "PROF-1",
        mainProfileName: "Profile 1",
        materialCode: "PRD-1",
        materialName: "Product 1",
        materialColor: "RAL9005",
        materialColorClass: "painted",
        cuttingCode: "PROF-1-CUT-1",
        cuttingName: "Long cut",
        pieceLengthMm: 7000,
        quantity: 1
      }
    ];

    expect(() =>
      service.assertDemandItemsFitStock(groups, demandItems)
    ).toThrow(UnprocessableEntityException);
  });
});

describe("OptimizationRequestsV2Service lifecycle handoff", () => {
  it("keeps a V2 request queued after Rabbit publish until the engine emits started", async () => {
    const publishedEnvelopes: Array<OptimizationQueueEnvelope | Record<string, unknown>> = [];
    const repository = {
      findActiveByIdempotencyKey: vi.fn(async () => null),
      createV2: vi.fn(async () => buildRequestRecord({ status: "created" })),
      updateStatus: vi.fn(async () => buildRequestRecord({ status: "ready" })),
      markQueuedFromReady: vi.fn(async ({ queuedAt }: { queuedAt: string }) =>
        buildRequestRecord({ status: "queued", queuedAt })
      ),
      markRunningDispatchedFromReady: vi.fn(
        async ({
          queuedAt,
          startedAt
        }: {
          queuedAt: string;
          startedAt: string;
        }) => buildRequestRecord({ status: "running", queuedAt, startedAt })
      ),
      promoteQueuedV2ToRunningIfApplicable: vi.fn(),
      findById: vi.fn()
    };
    const service = new OptimizationRequestsV2Service(
      {
        getSnapshotById: vi.fn(async () => buildSnapshotDetail())
      } as never,
      {
        getMainProfiles: vi.fn(async () => buildMainProfiles())
      } as never,
      repository as never,
      {
        publish: vi.fn(async (envelope) => {
          publishedEnvelopes.push(envelope);
        })
      } as never,
      null as never
    );

    const response = await service.createRequest(buildCreateRequest());

    expect(response.request.status).toBe("queued");
    expect(response.request.queuedAt).toEqual(expect.any(String));
    expect(response.request.startedAt).toBeNull();
    expect(repository.markQueuedFromReady).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      queuedAt: expect.any(String)
    });
    expect(repository.markRunningDispatchedFromReady).not.toHaveBeenCalled();
    expect(publishedEnvelopes).toHaveLength(1);
  });

  it("returns an existing active V2 request for the same snapshot payload without publishing a duplicate", async () => {
    const existingRequest = buildRequestRecord({
      id: "44444444-4444-4444-8444-444444444444",
      status: "queued",
      queuedAt: "2026-05-05T08:01:00.000Z"
    });
    const publish = vi.fn();
    const repository = {
      findActiveByIdempotencyKey: vi.fn(async () => existingRequest),
      createV2: vi.fn(),
      updateStatus: vi.fn(),
      markQueuedFromReady: vi.fn(),
      markRunningDispatchedFromReady: vi.fn(),
      promoteQueuedV2ToRunningIfApplicable: vi.fn(async () => undefined),
      findById: vi.fn(async () => existingRequest)
    };
    const service = new OptimizationRequestsV2Service(
      {
        getSnapshotById: vi.fn(async () => buildSnapshotDetail())
      } as never,
      {
        getMainProfiles: vi.fn(async () => buildMainProfiles())
      } as never,
      repository as never,
      { publish } as never,
      null as never
    );

    const response = await service.createRequest(buildCreateRequest());

    expect(response.request.id).toBe(existingRequest.id);
    expect(response.request.status).toBe("queued");
    expect(response.request.startedAt).toBeNull();
    expect(repository.promoteQueuedV2ToRunningIfApplicable).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.findActiveByIdempotencyKey).toHaveBeenCalledWith(
      expect.any(String)
    );
    expect(repository.createV2).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not promote queued status reads to running without a started event", async () => {
    const queuedRequest = buildRequestRecord({
      status: "queued",
      queuedAt: "2026-05-05T08:01:00.000Z"
    });
    const repository = {
      findById: vi.fn(async () => queuedRequest),
      promoteQueuedV2ToRunningIfApplicable: vi.fn()
    };
    const lifecycle = {
      reconcileSummary: vi.fn(async (summary) => summary)
    };
    const service = new OptimizationRequestsV2Service(
      {
        getSnapshotById: vi.fn()
      } as never,
      {
        getMainProfiles: vi.fn()
      } as never,
      repository as never,
      { publish: vi.fn() } as never,
      lifecycle as never
    );

    const response = await service.findLifecycleStatus(queuedRequest.id);

    expect(response.status).toBe("queued");
    expect(response.startedAt).toBeNull();
    expect(repository.promoteQueuedV2ToRunningIfApplicable).not.toHaveBeenCalled();
    expect(lifecycle.reconcileSummary).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued", startedAt: null })
    );
  });

  it("claims a queued request exactly once before the engine starts solving", async () => {
    const claimed = buildRequestRecord({
      status: "running",
      queuedAt: "2026-05-05T08:01:00.000Z",
      startedAt: "2026-05-05T08:01:03.000Z"
    });
    const repository = {
      claimQueuedRequest: vi.fn(async () => claimed),
      findById: vi.fn(async () => buildRequestRecord({
        status: "queued",
        queuedAt: "2026-05-05T08:01:00.000Z"
      })),
      findActiveRecordsByCutListSnapshotId: vi.fn(async () => [
        buildRequestRecord({
          status: "queued",
          queuedAt: "2026-05-05T08:01:00.000Z"
        })
      ]),
      markCancelled: vi.fn()
    };
    const service = new OptimizationRequestsV2Service(
      {
        getSnapshotById: vi.fn()
      } as never,
      {
        getMainProfiles: vi.fn()
      } as never,
      repository as never,
      { publish: vi.fn() } as never,
      null as never
    );

    const response = await service.claimRequest(claimed.id);

    expect(response.status).toBe("claimed");
    expect(response.requestId).toBe(claimed.id);
    expect(response.canonicalStatus).toBe("running");
    expect(response.startedAt).toEqual(expect.any(String));
    expect(repository.claimQueuedRequest).toHaveBeenCalledWith({
      id: claimed.id,
      startedAt: expect.any(String)
    });
    expect(repository.findById).toHaveBeenCalledWith(claimed.id);
  });

  it("skips cancelled or stale queue messages without reviving them", async () => {
    const cancelled = buildRequestRecord({
      status: "cancelled",
      failureReasonCode: "superseded_by_newer_request",
      failureReason: "Superseded by a newer canonical optimization request."
    });
    const repository = {
      claimQueuedRequest: vi.fn(async () => null),
      findById: vi.fn(async () => cancelled),
      findActiveRecordsByCutListSnapshotId: vi.fn(async () => []),
      markCancelled: vi.fn()
    };
    const service = new OptimizationRequestsV2Service(
      {
        getSnapshotById: vi.fn()
      } as never,
      {
        getMainProfiles: vi.fn()
      } as never,
      repository as never,
      { publish: vi.fn() } as never,
      null as never
    );

    const response = await service.claimRequest(cancelled.id);

    expect(response).toEqual({
      status: "skipped",
      requestId: cancelled.id,
      canonicalStatus: "cancelled",
      reason: "superseded_by_newer_request",
      startedAt: null
    });
    expect(repository.claimQueuedRequest).toHaveBeenCalledOnce();
  });
});

function buildCreateRequest(): CreateOptimizationRequestFromSnapshotRequest {
  return {
    cutListSnapshotId: "22222222-2222-4222-8222-222222222222",
    selectedWorkOrderNumbers: "ALL",
    overrides: [],
    config: DEFAULT_OPTIMIZATION_CONFIG
  };
}

function buildRequestRecord(
  overrides: Partial<OptimizationRequestRecord> = {}
): OptimizationRequestRecord {
  const payload = buildPayload();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    weekNumber: 16,
    sourceBatchId: "33333333-3333-4333-8333-333333333333",
    cutListSnapshotId: payload.cutListSnapshotId,
    planYear: payload.planYear,
    status: "created",
    payloadJson: payload,
    configJson: payload.config,
    idempotencyKey: "test-idempotency-key",
    matchedRows: payload.demandItems.length,
    unmatchedRows: 0,
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    resultId: null,
    failureReason: null,
    failureReasonCode: null,
    solverMode: null,
    progressJson: null,
    lastHeartbeatAt: null,
    createdAt: "2026-05-05T08:00:00.000Z",
    updatedAt: "2026-05-05T08:00:00.000Z",
    ...overrides
  };
}

function buildPayload(): OptimizationRequestPayloadV2 {
  return {
    cutListSnapshotId: "22222222-2222-4222-8222-222222222222",
    planYear: 2026,
    weekNumber: 16,
    selectedWorkOrderNumbers: "ALL",
    overrides: [],
    config: DEFAULT_OPTIMIZATION_CONFIG,
    profileGroups: [
      {
        mainProfileId: "mp-queued",
        mainProfileCode: "1005317P020",
        mainProfileName: "Queued profile",
        materialColorClass: "painted",
        stockBars: [{ lengthMm: 6100, role: "primary" }],
        demandItemCount: 1,
        totalPieceLengthMm: 1000
      }
    ],
    demandItems: [
      {
        productionRowId: "row-queued",
        rowIndex: 1,
        workOrderNumber: "WO-QUEUED",
        mainProfileId: "mp-queued",
        mainProfileCode: "1005317P020",
        mainProfileName: "Queued profile",
        materialCode: "MAT-001",
        materialName: "Material",
        materialColor: "RAL9005",
        materialColorClass: "painted",
        cuttingCode: "CUT-001",
        cuttingName: "Cut 1000",
        pieceLengthMm: 1000,
        quantity: 1
      }
    ]
  };
}

function buildSnapshotDetail() {
  return {
    snapshot: {
      id: "22222222-2222-4222-8222-222222222222",
      planYear: 2026,
      weekNumber: 16,
      sourceBatchId: "33333333-3333-4333-8333-333333333333",
      status: "created",
      totalProductionRows: 1,
      matchedProductionRows: 1,
      unmatchedProductionRows: 0,
      totalCuttingLines: 1,
      createdAt: "2026-05-05T08:00:00.000Z"
    },
    items: [
      {
        productionRowId: "row-queued",
        rowIndex: 1,
        workOrderNumber: "WO-QUEUED",
        materialCode: "MAT-001",
        materialName: "Material",
        materialColor: "RAL9005",
        materialSize: "A4",
        orderQuantity: 1,
        orderUnit: "ADET",
        plannedFinishDate: "2026-04-17",
        departmentCode: "CUT",
        departmentName: "Kesim",
        priorityLevel: 1,
        cuttingLines: [
          {
            profileCode: "1005317P020",
            profileName: "Queued profile",
            stockLengthMm: 6100,
            cuttingCode: "CUT-001",
            cuttingName: "Cut 1000",
            cuttingLengthMm: 1000,
            unitName: "ADET",
            unitQuantity: 1,
            orderQuantity: 1,
            cuttingQuantity: 1
          }
        ]
      }
    ],
    unmatchedRows: []
  };
}

function buildMainProfiles(): MainProfile[] {
  return [
    {
      id: "mp-queued",
      code: "1005317P020",
      name: "Queued profile",
      stockLengthMm: 6100,
      linkedProductCode: "MAT-001",
      linkedProductName: "Material",
      cuttingSpecs: [],
      isActive: true,
      notes: null,
      createdAt: "2026-05-05T08:00:00.000Z",
      updatedAt: "2026-05-05T08:00:00.000Z"
    }
  ];
}
