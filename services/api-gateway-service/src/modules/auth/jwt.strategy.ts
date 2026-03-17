import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import type { JwtClaims } from "@lemnixpro/shared-contracts";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService)
    configService: ConfigService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
      issuer: configService.getOrThrow<string>("JWT_ISSUER"),
      audience: configService.getOrThrow<string>("JWT_AUDIENCE")
    });
  }

  validate(payload: JwtClaims): JwtClaims {
    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException("JWT payload is incomplete.");
    }

    return payload;
  }
}
