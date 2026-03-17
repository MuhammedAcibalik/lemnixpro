import { Module } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module";

import { AuthController } from "./auth.controller";
import { AuthModule } from "./auth.module";
import { GatewayAuthService } from "./gateway-auth.service";
import { ProtectedController } from "./protected.controller";

@Module({
  imports: [AuthModule, HttpInfrastructureModule],
  controllers: [AuthController, ProtectedController],
  providers: [GatewayAuthService]
})
export class GatewayModule {}
