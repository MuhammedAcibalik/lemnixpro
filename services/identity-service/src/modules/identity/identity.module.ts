import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../../infrastructure/infrastructure.module";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordHasherService } from "./password-hasher.service";
import { TokenModule } from "./token.module";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [InfrastructureModule, TokenModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    PasswordHasherService,
    UsersRepository
  ]
})
export class IdentityModule {}
