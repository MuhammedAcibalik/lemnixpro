import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type { JwtClaims } from "@lemnixpro/shared-contracts";

@Injectable()
export class TokenService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(JwtService)
    private readonly jwtService: JwtService
  ) {}

  async issueAccessToken(claims: Pick<JwtClaims, "sub" | "email" | "role">): Promise<string> {
    return this.jwtService.signAsync(claims);
  }

  getAccessTokenExpiresIn(): string {
    return this.configService.getOrThrow<string>("JWT_EXPIRES_IN");
  }
}
