import { Inject, Injectable } from "@nestjs/common";

import type {
  CutListSnapshotSummary,
  MainProfile,
  OptimizationRequestSummary,
  OptimizationResultRecord,
  ProductionPlanImportBatch,
  WorkspaceOverviewResponse,
  WorkspaceOverviewServiceName,
  WorkspaceOverviewServiceStatus,
  WorkspaceOverviewSummary
} from "@lemnixpro/shared-contracts";

import { CutListsClient } from "../../infrastructure/http/cut-lists.client";
import { MainProfilesClient } from "../../infrastructure/http/main-profiles.client";
import { OptimizationRequestsClient } from "../../infrastructure/http/optimization-requests.client";
import { ProductionPlanImportsClient } from "../../infrastructure/http/production-plan-imports.client";
import { ResultsClient } from "../../infrastructure/http/results.client";

@Injectable()
export class WorkspaceOverviewService {
  constructor(
    @Inject(MainProfilesClient)
    private readonly mainProfilesClient: MainProfilesClient,
    @Inject(ProductionPlanImportsClient)
    private readonly productionPlanImportsClient: ProductionPlanImportsClient,
    @Inject(CutListsClient)
    private readonly cutListsClient: CutListsClient,
    @Inject(OptimizationRequestsClient)
    private readonly optimizationRequestsClient: OptimizationRequestsClient,
    @Inject(ResultsClient)
    private readonly resultsClient: ResultsClient
  ) {}

  async getOverview(): Promise<WorkspaceOverviewResponse> {
    const [profilesResult, batchesResult, cutListsResult, requestsResult, resultsResult] =
      await Promise.allSettled([
        this.mainProfilesClient.findAll(),
        this.productionPlanImportsClient.findAllImports(),
        this.cutListsClient.findAll(),
        this.optimizationRequestsClient.findAll(),
        this.resultsClient.findAll()
      ]);

    const profiles = readSettledValue(profilesResult, []);
    const batches = readSettledValue(batchesResult, []);
    const cutLists = readSettledValue(cutListsResult, []);
    const requests = readSettledValue(requestsResult, []);
    const results = readSettledValue(resultsResult, []);
    const activeBatches = batches.filter((batch) => batch.status === "active");
    const latestCutList = cutLists[0] ?? null;

    return {
      degraded: [
        profilesResult,
        batchesResult,
        cutListsResult,
        requestsResult,
        resultsResult
      ].some((result) => result.status === "rejected"),
      generatedAt: new Date().toISOString(),
      services: [
        serviceStatus("main-profiles", profilesResult),
        serviceStatus("production-plans", batchesResult),
        serviceStatus("cut-lists", cutListsResult),
        serviceStatus("optimization-requests", requestsResult),
        serviceStatus("results", resultsResult)
      ],
      summary: buildSummary({
        activeBatches,
        batches,
        cutLists,
        latestCutList,
        profiles,
        requests,
        results
      })
    };
  }
}

function buildSummary(input: {
  activeBatches: ProductionPlanImportBatch[];
  batches: ProductionPlanImportBatch[];
  cutLists: CutListSnapshotSummary[];
  latestCutList: CutListSnapshotSummary | null;
  profiles: MainProfile[];
  requests: OptimizationRequestSummary[];
  results: OptimizationResultRecord[];
}): WorkspaceOverviewSummary {
  return {
    activeBatchCount: input.activeBatches.length,
    activeWeek: input.activeBatches[0]?.weekNumber ?? null,
    completedResultCount: input.results.filter((result) => result.status === "completed").length,
    cutListCount: input.cutLists.length,
    cuttingSpecCount: input.profiles.reduce(
      (total, profile) => total + profile.cuttingSpecs.length,
      0
    ),
    latestCutListUnmatchedRows: input.latestCutList?.unmatchedProductionRows ?? null,
    optimizationRequestCount: input.requests.length,
    productionBatchCount: input.batches.length,
    profileCount: input.profiles.length,
    queuedOptimizationRequestCount: input.requests.filter(
      (request) => request.status === "queued"
    ).length,
    readyOptimizationRequestCount: input.requests.filter(
      (request) => request.status === "ready"
    ).length,
    resultCount: input.results.length,
    totalCuttingLines: input.cutLists.reduce(
      (total, snapshot) => total + snapshot.totalCuttingLines,
      0
    ),
    totalUnmatchedRows: input.cutLists.reduce(
      (total, snapshot) => total + snapshot.unmatchedProductionRows,
      0
    ),
    unmatchedOptimizationRows: input.requests.reduce(
      (total, request) => total + request.unmatchedRows,
      0
    ),
    validProductionRows: input.batches.reduce(
      (total, batch) => total + batch.validRowCount,
      0
    )
  };
}

function serviceStatus<T>(
  service: WorkspaceOverviewServiceName,
  result: PromiseSettledResult<T[]>
): WorkspaceOverviewServiceStatus {
  if (result.status === "fulfilled") {
    return {
      count: result.value.length,
      ok: true,
      service
    };
  }

  return {
    count: null,
    message:
      result.reason instanceof Error
        ? result.reason.message
        : "Servis yanıtı alınamadı.",
    ok: false,
    service
  };
}

function readSettledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}
