import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FacilityAccessController } from "./facility-access.controller";
import { FacilityAccessRepository } from "./facility-access.repository";
import { FacilityAccessService } from "./facility-access.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenModule } from "./token.module";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [InfrastructureModule, TokenModule],
  controllers: [AuthController, FacilityAccessController],
  providers: [
    AuthService,
    FacilityAccessService,
    JwtAuthGuard,
    JwtStrategy,
    FacilityAccessRepository,
    PasswordHasherService,
    UsersRepository
  ]
})
export class IdentityModule {}
