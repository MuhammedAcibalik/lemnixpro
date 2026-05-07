import { describe, expect, it, vi } from "vitest";

import type { OptimizationRequestSummaryV2 } from "@lemnixpro/shared-contracts";

import { OptimizationLifecycleService } from "../src/modules/optimization-orchestrator/optimization-lifecycle.service";

function buildSummary(
  overrides: Partial<OptimizationRequestSummaryV2> = {}
): OptimizationRequestSummaryV2 {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    cutListSnapshotId: "22222222-2222-4222-8222-222222222222",
    planYear: 2026,
    weekNumber: 15,
    status: "queued",
    matchedRows: 248,
    unmatchedRows: 0,
    queuedAt: "2026-04-30T15:05:54.909Z",
    createdAt: "2026-04-30T15:05:54.863Z",
    updatedAt: "2026-04-30T15:05:54.963Z",
    ...overrides
  };
}

describe("OptimizationLifecycleService", () => {
  it("persists failed result-service truth for a queued request", async () => {
    const repository = {
      markCompletedFromResult: vi.fn(),
      markFailedFromResult: vi.fn().mockResolvedValue({
        ...buildSummary({ status: "failed" }),
        failedAt: "2026-04-30T15:06:55.019Z",
        failureReason:
          "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
        failureReasonCode: "solver_timeout"
      })
    };
    const resultServiceClient = {
      getResultByJobId: vi.fn().mockResolvedValue({
        jobId: "11111111-1111-4111-8111-111111111111",
        status: "failed",
        payload: null,
        failure: {
          reason:
            "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
          reasonCode: "infeasible"
        }
      })
    };
    const service = new OptimizationLifecycleService(
      repository as never,
      resultServiceClient as never
    );

    const reconciled = await service.reconcileSummary(buildSummary());

    expect(reconciled.status).toBe("failed");
    expect(repository.markFailedFromResult).toHaveBeenCalledWith({
      failedAt: expect.any(String),
      failureReason:
        "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
      failureReasonCode: "solver_timeout",
      id: "11111111-1111-4111-8111-111111111111"
    });
    expect(repository.markCompletedFromResult).not.toHaveBeenCalled();
  });

  it("does not query result-service for terminal request summaries", async () => {
    const repository = {
      markCompletedFromResult: vi.fn(),
      markFailedFromResult: vi.fn()
    };
    const resultServiceClient = {
      getResultByJobId: vi.fn()
    };
    const service = new OptimizationLifecycleService(
      repository as never,
      resultServiceClient as never
    );

    const summary = buildSummary({ status: "completed" });
    const reconciled = await service.reconcileSummary(summary);

    expect(reconciled).toBe(summary);
    expect(resultServiceClient.getResultByJobId).not.toHaveBeenCalled();
  });

  it("normalizes old terminal UNKNOWN failures that were stored as infeasible", async () => {
    const repository = {
      markCompletedFromResult: vi.fn(),
      markFailedFromResult: vi.fn().mockResolvedValue({
        ...buildSummary({ status: "failed" }),
        failedAt: "2026-04-30T15:06:55.019Z",
        failureReason:
          "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
        failureReasonCode: "solver_timeout"
      })
    };
    const resultServiceClient = {
      getResultByJobId: vi.fn()
    };
    const service = new OptimizationLifecycleService(
      repository as never,
      resultServiceClient as never
    );

    const reconciled = await service.reconcileSummary(
      buildSummary({
        status: "failed",
        failedAt: "2026-04-30T15:06:55.019Z",
        failureReason:
          "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
        failureReasonCode: "infeasible"
      })
    );

    expect(reconciled.failureReasonCode).toBe("solver_timeout");
    expect(repository.markFailedFromResult).toHaveBeenCalledWith({
      failedAt: "2026-04-30T15:06:55.019Z",
      failureReason:
        "Solver returned non-feasible status UNKNOWN for profile 1000915P010 (color anodized).",
      failureReasonCode: "solver_timeout",
      id: "11111111-1111-4111-8111-111111111111"
    });
    expect(resultServiceClient.getResultByJobId).not.toHaveBeenCalled();
  });

  it("treats synthetic running rows as queued when no engine result exists", async () => {
    const repository = {
      markCompletedFromResult: vi.fn(),
      markFailedFromResult: vi.fn()
    };
    const resultServiceClient = {
      getResultByJobId: vi.fn().mockResolvedValue({
        jobId: "11111111-1111-4111-8111-111111111111",
        resultId: null,
        status: "missing",
        completedAt: null,
        failedAt: null,
        payload: null,
        failure: null
      })
    };
    const service = new OptimizationLifecycleService(
      repository as never,
      resultServiceClient as never
    );

    const reconciled = await service.reconcileSummary(
      buildSummary({
        status: "running",
        queuedAt: "2026-05-05T08:49:35.417Z",
        startedAt: "2026-05-05T08:49:35.417Z"
      })
    );

    expect(reconciled.status).toBe("queued");
    expect(reconciled.startedAt).toBeNull();
    expect(repository.markCompletedFromResult).not.toHaveBeenCalled();
    expect(repository.markFailedFromResult).not.toHaveBeenCalled();
  });

  it("does not revive a cancelled request when a stale started event arrives", async () => {
    const cancelled = buildSummary({
      status: "cancelled",
      failureReasonCode: "superseded_by_newer_request",
      failureReason: "Superseded by a newer canonical optimization request."
    });
    const repository = {
      markStartedFromEvent: vi.fn().mockResolvedValue(cancelled),
      markCompletedFromResult: vi.fn(),
      markFailedFromResult: vi.fn()
    };
    const resultServiceClient = {
      getResultByJobId: vi.fn()
    };
    const service = new OptimizationLifecycleService(
      repository as never,
      resultServiceClient as never
    );

    const applied = await service.applyStartedMessage({
      metadata: {
        messageId: "55555555-5555-4555-8555-555555555555",
        correlationId: "66666666-6666-4666-8666-666666666666",
        attempt: 1,
        occurredAt: "2026-05-05T09:00:00.000Z"
      },
      jobId: cancelled.id,
      cutListSnapshotId: cancelled.cutListSnapshotId,
      startedAt: "2026-05-05T09:00:00.000Z"
    });

    expect(applied.status).toBe("cancelled");
    expect(repository.markStartedFromEvent).toHaveBeenCalledWith({
      id: cancelled.id,
      startedAt: "2026-05-05T09:00:00.000Z"
    });
    expect(repository.markCompletedFromResult).not.toHaveBeenCalled();
    expect(repository.markFailedFromResult).not.toHaveBeenCalled();
  });
});
