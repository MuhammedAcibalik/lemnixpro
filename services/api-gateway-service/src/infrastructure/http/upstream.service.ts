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
}
