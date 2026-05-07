import { Inject, Injectable } from "@nestjs/common";

import type {
  OptimizationCompletedMessage,
  OptimizationCompletedMessageV2,
  OptimizationFailedMessage,
  OptimizationFailedMessageV2,
  OptimizationRequestStatusV2,
  OptimizationRequestSummaryV2,
  OptimizationResultDetailResponse,
  OptimizationStartedMessageV2
} from "@lemnixpro/shared-contracts";
import { isoNow } from "@lemnixpro/shared-utils";

import { ResultServiceClient } from "../../infrastructure/http/result-service.client";
import type {
  OptimizationRequestListRecord
} from "../../infrastructure/db/schema";

import { OptimizationRequestsRepository } from "./optimization-requests.repository";

const RESULT_RECONCILE_STATUSES = new Set<OptimizationRequestStatusV2>([
  "queued",
  "running"
]);

@Injectable()
export class OptimizationLifecycleService {
  constructor(
    @Inject(OptimizationRequestsRepository)
    private readonly optimizationRequestsRepository: Pick<
      OptimizationRequestsRepository,
      | "markStartedFromEvent"
      | "markCompletedFromResult"
      | "markFailedFromResult"
    >,
    @Inject(ResultServiceClient)
    private readonly resultServiceClient: Pick<
      ResultServiceClient,
      "getResultByJobId"
    >
  ) {}

  async reconcileSummary(
    summary: OptimizationRequestSummaryV2
  ): Promise<OptimizationRequestSummaryV2> {
    if (this.shouldNormalizeStoredUnknownFailure(summary)) {
      const record =
        await this.optimizationRequestsRepository.markFailedFromResult({
          id: summary.id,
          failedAt: summary.failedAt ?? isoNow(),
          failureReason:
            summary.failureReason ?? "Optimization engine reported failure.",
          failureReasonCode: "solver_timeout"
        });
      return this.toSummary(record);
    }

    if (!RESULT_RECONCILE_STATUSES.has(summary.status)) {
      return summary;
    }

    let result: OptimizationResultDetailResponse;
    try {
      result = await this.resultServiceClient.getResultByJobId(summary.id);
    } catch {
      return summary;
    }

    if (
      result.status === "missing" &&
      this.isSyntheticRunningStateWithoutStartedEvent(summary)
    ) {
      return {
        ...summary,
        status: "queued",
        startedAt: null
      };
    }

    if (result.status === "completed") {
      const record =
        await this.optimizationRequestsRepository.markCompletedFromResult({
          id: summary.id,
          resultId: result.resultId ?? null,
          completedAt:
            result.completedAt ?? result.payload?.generatedAt ?? isoNow(),
          solverMode: result.payload?.solverMode ?? null
        });
      return this.toSummary(record);
    }

    if (result.status === "failed") {
      const record =
        await this.optimizationRequestsRepository.markFailedFromResult({
          id: summary.id,
          failedAt: result.failedAt ?? isoNow(),
          failureReason:
            result.failure?.reason ?? "Optimization engine reported failure.",
          failureReasonCode: this.normalizeFailureReasonCode(result.failure)
        });
      return this.toSummary(record);
    }

    return summary;
  }

  async getResultSnapshot(
    jobId: string
  ): Promise<OptimizationResultDetailResponse> {
    try {
      return await this.resultServiceClient.getResultByJobId(jobId);
    } catch {
      return {
        jobId,
        resultId: null,
        status: "missing",
        completedAt: null,
        failedAt: null,
        payload: null,
        failure: null
      };
    }
  }

  private normalizeFailureReasonCode(
    failure: OptimizationResultDetailResponse["failure"]
  ): string | null {
    if (!failure) {
      return null;
    }

    if (
      failure.reasonCode === "infeasible" &&
      /status\s+UNKNOWN/i.test(failure.reason)
    ) {
      return "solver_timeout";
    }

    return failure.reasonCode ?? null;
  }

  private shouldNormalizeStoredUnknownFailure(
    summary: OptimizationRequestSummaryV2
  ): boolean {
    return (
      summary.status === "failed" &&
      summary.failureReasonCode === "infeasible" &&
      typeof summary.failureReason === "string" &&
      /status\s+UNKNOWN/i.test(summary.failureReason)
    );
  }

  private isSyntheticRunningStateWithoutStartedEvent(
    summary: OptimizationRequestSummaryV2
  ): boolean {
    return (
      summary.status === "running" &&
      typeof summary.queuedAt === "string" &&
      typeof summary.startedAt === "string" &&
      summary.startedAt === summary.queuedAt
    );
  }

  async reconcileSummaries(
    summaries: OptimizationRequestSummaryV2[]
  ): Promise<OptimizationRequestSummaryV2[]> {
    return Promise.all(
      summaries.map((summary) => this.reconcileSummary(summary))
    );
  }

  async applyStartedMessage(
    message: OptimizationStartedMessageV2
  ): Promise<OptimizationRequestSummaryV2> {
    const record = await this.optimizationRequestsRepository.markStartedFromEvent({
      id: message.jobId,
      startedAt: message.startedAt
    });
    return this.toSummary(record);
  }

  async applyCompletedMessage(
    message: OptimizationCompletedMessage | OptimizationCompletedMessageV2
  ): Promise<OptimizationRequestSummaryV2> {
    const record =
      await this.optimizationRequestsRepository.markCompletedFromResult({
        id: message.jobId,
        resultId: message.resultId,
        completedAt: message.completedAt,
        solverMode:
          "payload" in message ? message.payload?.solverMode ?? null : null
      });
    return this.toSummary(record);
  }

  async applyFailedMessage(
    message: OptimizationFailedMessage | OptimizationFailedMessageV2
  ): Promise<OptimizationRequestSummaryV2> {
    const record = await this.optimizationRequestsRepository.markFailedFromResult({
      id: message.jobId,
      failedAt: message.failedAt,
      failureReason: message.reason,
      failureReasonCode:
        "reasonCode" in message ? message.reasonCode ?? null : null
    });
    return this.toSummary(record);
  }

  toSummary(record: OptimizationRequestListRecord): OptimizationRequestSummaryV2 {
    return {
      id: record.id,
      cutListSnapshotId: record.cutListSnapshotId,
      planYear: record.planYear,
      weekNumber: record.weekNumber,
      status: record.status,
      idempotencyKey: record.idempotencyKey ?? null,
      matchedRows: record.matchedRows,
      unmatchedRows: record.unmatchedRows,
      queuedAt: record.queuedAt,
      startedAt: record.startedAt ?? null,
      completedAt: record.completedAt ?? null,
      failedAt: record.failedAt ?? null,
      resultId: record.resultId ?? null,
      failureReason: record.failureReason ?? null,
      failureReasonCode: record.failureReasonCode ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}
