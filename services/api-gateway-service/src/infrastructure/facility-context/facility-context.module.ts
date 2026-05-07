import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { HttpInfrastructureModule } from "../http/http-infrastructure.module";

import { FacilityContextInterceptor } from "./facility-context.interceptor";
import { FacilityContextService } from "./facility-context.service";

@Module({
  imports: [HttpInfrastructureModule],
  providers: [
    FacilityContextService,
    {
      provide: APP_INTERCEPTOR,
      useClass: FacilityContextInterceptor
    }
  ]
})
export class FacilityContextModule {}
