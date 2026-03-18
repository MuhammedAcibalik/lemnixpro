import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class UpstreamService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getProductionPlanServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>(
      "PRODUCTION_PLAN_SERVICE_BASE_URL"
    );
  }

  getMasterDataServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("MASTER_DATA_SERVICE_BASE_URL");
  }
}
