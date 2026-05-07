import "server-only";

import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse
} from "@lemnixpro/shared-contracts";

import { requestGateway } from "./http";

export function login(request: LoginRequest): Promise<LoginResponse> {
  return requestGateway<LoginResponse>("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
}

export function getCurrentUser(token: string): Promise<CurrentUserResponse> {
  return requestGateway<CurrentUserResponse>("/auth/me", {
    method: "GET",
    token
  });
}
