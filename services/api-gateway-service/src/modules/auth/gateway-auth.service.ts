import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type {
  AuthenticatedUser,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse
} from "@lemnixpro/shared-contracts";

import { IdentityAuthClient } from "../../infrastructure/http/identity-auth.client";

type ProtectedPingResponse = {
  message: string;
  user: AuthenticatedUser;
};

@Injectable()
export class GatewayAuthService {
  constructor(
    @Inject(IdentityAuthClient)
    private readonly identityAuthClient: IdentityAuthClient
  ) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    return this.identityAuthClient.login(request);
  }

  async getCurrentUser(authorizationHeader?: string): Promise<CurrentUserResponse> {
    return this.identityAuthClient.getCurrentUser(
      this.requireAuthorizationHeader(authorizationHeader)
    );
  }

  async protectedPing(
    authorizationHeader?: string
  ): Promise<ProtectedPingResponse> {
    const currentUserResponse = await this.identityAuthClient.getCurrentUser(
      this.requireAuthorizationHeader(authorizationHeader)
    );

    return {
      message: "Protected gateway route is authenticated.",
      user: currentUserResponse.user
    };
  }

  private requireAuthorizationHeader(authorizationHeader?: string): string {
    if (!authorizationHeader) {
      throw new UnauthorizedException("Authorization header is required.");
    }

    return authorizationHeader;
  }
}
