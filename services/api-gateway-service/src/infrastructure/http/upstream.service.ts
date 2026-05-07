import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class UpstreamService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getIdentityServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("IDENTITY_SERVICE_BASE_URL");
  }

  getMasterDataServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("MASTER_DATA_SERVICE_BASE_URL");
  }

  getProductionPlanServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>(
      "PRODUCTION_PLAN_SERVICE_BASE_URL"
    );
  }

  getCutListServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("CUT_LIST_SERVICE_BASE_URL");
  }

  getOptimizationOrchestratorServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>(
      "OPTIMIZATION_ORCHESTRATOR_SERVICE_BASE_URL"
    );
  }

  getResultServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("RESULT_SERVICE_BASE_URL");
  }
}
