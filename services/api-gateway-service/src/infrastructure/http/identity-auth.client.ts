import { HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse
} from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";

@Injectable()
export class IdentityAuthClient {
  constructor(
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

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = this.upstreamService.getIdentityServiceBaseUrl();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers
      });
    } catch {
      throw new ServiceUnavailableException("Identity service is unavailable.");
    }

    const payload = await this.parsePayload(response);

    if (!response.ok) {
      throw new HttpException(
        this.normalizeErrorPayload(payload),
        response.status
      );
    }

    return payload as T;
  }

  private async parsePayload(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    return text ? { message: text } : { message: response.statusText };
  }

  private normalizeErrorPayload(payload: unknown): object {
    if (payload && typeof payload === "object") {
      return payload;
    }

    return {
      message: "Identity service request failed."
    };
  }
}
