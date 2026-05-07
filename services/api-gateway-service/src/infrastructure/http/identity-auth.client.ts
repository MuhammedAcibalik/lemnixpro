import { HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import type {
  CurrentUserResponse,
  FacilityAccessCheckRequest,
  FacilityAccessCheckResponse,
  LoginRequest,
  LoginResponse
} from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

@Injectable()
export class IdentityAuthClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async getCurrentUser(authorizationHeader: string): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>("/auth/me", {
      method: "GET",
      headers: {
        authorization: authorizationHeader
      }
    });
  }

  async resolveFacilityAccess(
    authorizationHeader: string,
    request: FacilityAccessCheckRequest
  ): Promise<FacilityAccessCheckResponse> {
    return this.request<FacilityAccessCheckResponse>(
      "/auth/me/facility-access/resolve",
      {
        method: "POST",
        headers: {
          authorization: authorizationHeader,
          "content-type": "application/json"
        },
        body: JSON.stringify(request)
      }
    );
  }

  /** İlk yerel admin; identity BOOTSTRAP_* + ALLOW_BOOTSTRAP_ADMIN gerekli. Üst kimlik gerektirmez. */
  async bootstrapAdmin(providedSecret?: string): Promise<CurrentUserResponse> {
    return this.request<CurrentUserResponse>("/auth/bootstrap-admin", {
      method: "POST",
      headers: providedSecret ? { "x-bootstrap-secret": providedSecret } : {}
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      return await this.upstreamHttpClient.request<T>(
        this.upstreamService.getIdentityServiceBaseUrl(),
        path,
        init
      );
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof HttpException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException("Identity service is unavailable.");
    }
  }
}
