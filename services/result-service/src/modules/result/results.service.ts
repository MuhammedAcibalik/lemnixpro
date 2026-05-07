import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  OptimizationCompletedMessage,
  OptimizationFailedMessage,
  OptimizationResultDetailResponse,
  OptimizationResultMetrics,
  OptimizationResultPayload,
  OptimizationResultRecord as OptimizationResultContract
} from "@lemnixpro/shared-contracts";

import type { OptimizationResultRecord } from "../../infrastructure/db/schema";

import { ResultsRepository } from "./results.repository";

@Injectable()
export class ResultsService {
  constructor(
    @Inject(ResultsRepository)
    private readonly resultsRepository: ResultsRepository
  ) {}

  async recordCompleted(
    message: OptimizationCompletedMessage & {
      payload?: OptimizationResultPayload;
    }
  ): Promise<OptimizationResultContract> {
    const record = await this.resultsRepository.recordCompleted(message);
    return this.toResponse(record);
  }

  async recordFailed(
    message: OptimizationFailedMessage
  ): Promise<OptimizationResultContract> {
    const record = await this.resultsRepository.recordFailed(message);
    return this.toResponse(record);
  }

  async upsertPayload(input: {
    jobId: string;
    resultId: string;
    completedAt: string;
    payload: OptimizationResultPayload;
  }): Promise<{ id: string; resultId: string }> {
    if (!input.payload?.metrics) {
      throw new BadRequestException(
        "payload with metrics is required (use jobId, resultId, completedAt, payload)."
      );
    }
    const record = await this.resultsRepository.upsertPayload({
      jobId: input.jobId,
      resultId: input.resultId,
      completedAt: input.completedAt,
      payload: input.payload,
      metrics: input.payload.metrics
    });
    return { id: record.id, resultId: record.resultId ?? input.resultId };
  }

  async findAll(): Promise<OptimizationResultContract[]> {
    const records = await this.resultsRepository.findAll();
    return records.map((record) => this.toResponse(record));
  }

  async findById(id: string): Promise<OptimizationResultContract> {
    const record = await this.resultsRepository.findById(id);
    if (!record) {
      throw new NotFoundException(`Optimization result "${id}" was not found.`);
    }
    return this.toResponse(record);
  }

  async findDetailByJobId(
    jobId: string
  ): Promise<OptimizationResultDetailResponse> {
    const record = await this.resultsRepository.findByJobId(jobId);

    if (!record) {
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

    if (record.status === "failed") {
      const event = record.eventJson as OptimizationFailedMessage & {
        reasonCode?: string;
      };
      return {
        jobId,
        resultId: record.resultId,
        status: "failed",
        completedAt: record.completedAt,
        failedAt: record.failedAt,
        payload: null,
        failure: {
          reason: record.reason ?? event?.reason ?? "Unknown failure",
          reasonCode: (event?.reasonCode as string) ?? null
        }
      };
    }

    return {
      jobId,
      resultId: record.resultId,
      status: "completed",
      completedAt: record.completedAt,
      failedAt: record.failedAt,
      payload:
        (record.payloadJson as unknown as OptimizationResultPayload | null) ??
        null,
      failure: null
    };
  }

  private toResponse(
    record: OptimizationResultRecord
  ): OptimizationResultContract {
    return {
      id: record.id,
      jobId: record.jobId,
      resultId: record.resultId,
      status: record.status === "completed" ? "completed" : "failed",
      completedAt: record.completedAt,
      failedAt: record.failedAt,
      reason: record.reason,
      eventJson: record.eventJson,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

export type { OptimizationResultMetrics };
