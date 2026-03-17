import { timingSafeEqual } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  AuthenticatedUser,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse
} from "@lemnixpro/shared-contracts";

import type { IdentityUser } from "@/infrastructure/db/schema";

import { PasswordHasherService } from "./password-hasher.service";
import { TokenService } from "./token.service";
import { UsersRepository } from "./users.repository";

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(PasswordHasherService)
    private readonly passwordHasherService: PasswordHasherService,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
    @Inject(UsersRepository)
    private readonly usersRepository: UsersRepository
  ) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    const normalizedEmail = this.normalizeEmail(request.email);
    const user = await this.usersRepository.findByEmail(normalizedEmail);

    if (!user) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (!user.isActive) {
      throw new ForbiddenException("User account is inactive.");
    }

    const passwordMatches = await this.passwordHasherService.verify(
      user.passwordHash,
      request.password
    );

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const accessToken = await this.tokenService.issueAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
      user: this.toAuthenticatedUser(user)
    };
  }

  async getCurrentUser(userId: string): Promise<CurrentUserResponse> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedException("User not found for token subject.");
    }

    if (!user.isActive) {
      throw new ForbiddenException("User account is inactive.");
    }

    return {
      user: this.toAuthenticatedUser(user)
    };
  }

  async bootstrapAdmin(providedSecret?: string): Promise<CurrentUserResponse> {
    this.assertBootstrapAllowed(providedSecret);

    const adminExists = await this.usersRepository.hasAdmin();

    if (adminExists) {
      throw new ConflictException("An admin user already exists.");
    }

    const password = this.configService.get<string>("BOOTSTRAP_ADMIN_PASSWORD");
    const email = this.configService.get<string>("BOOTSTRAP_ADMIN_EMAIL");
    const fullName = this.configService.get<string>("BOOTSTRAP_ADMIN_FULL_NAME");

    if (!password || !email || !fullName) {
      throw new InternalServerErrorException(
        "Bootstrap admin configuration is incomplete."
      );
    }

    const passwordHash = await this.passwordHasherService.hash(password);

    const user = await this.usersRepository.create({
      email: this.normalizeEmail(email),
      passwordHash,
      fullName,
      role: "ADMIN",
      isActive: true
    });

    return {
      user: this.toAuthenticatedUser(user)
    };
  }

  private assertBootstrapAllowed(providedSecret?: string): void {
    const allowBootstrapAdminValue = this.configService.get<
      boolean | string | undefined
    >("ALLOW_BOOTSTRAP_ADMIN");
    const allowBootstrapAdmin =
      allowBootstrapAdminValue === true || allowBootstrapAdminValue === "true";
    const nodeEnv = this.configService.get<string>("NODE_ENV", "development");
    const expectedSecret = this.configService.get<string>("BOOTSTRAP_ADMIN_SECRET");

    if (!allowBootstrapAdmin || nodeEnv === "production") {
      throw new ForbiddenException("Bootstrap admin is disabled.");
    }

    if (!providedSecret || !expectedSecret) {
      throw new ForbiddenException("Bootstrap admin is disabled.");
    }

    if (!this.secretsMatch(expectedSecret, providedSecret)) {
      throw new ForbiddenException("Bootstrap admin is disabled.");
    }
  }

  private secretsMatch(expectedSecret: string, providedSecret: string): boolean {
    const expectedSecretBuffer = Buffer.from(expectedSecret);
    const providedSecretBuffer = Buffer.from(providedSecret);

    if (expectedSecretBuffer.length !== providedSecretBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedSecretBuffer, providedSecretBuffer);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toAuthenticatedUser(user: IdentityUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive
    };
  }
}
