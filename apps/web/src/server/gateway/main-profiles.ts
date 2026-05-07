import "server-only";

import type {
  CreateMainProfileRequest,
  MainProfile,
  MainProfileCuttingRealignmentResult,
  MainProfileImportBatch,
  UpdateMainProfileRequest
} from "@lemnixpro/shared-contracts";

import { requestGatewayWithSession } from "./http";

export function listMainProfiles(): Promise<MainProfile[]> {
  return requestGatewayWithSession<MainProfile[]>("/main-profiles");
}

export function realignMainProfileCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
  return requestGatewayWithSession<MainProfileCuttingRealignmentResult>(
    "/main-profiles/maintenance/realign-cutting-specs",
    {
      method: "POST"
    }
  );
}

export function uploadMainProfiles(file: File): Promise<MainProfileImportBatch> {
  const formData = new FormData();
  formData.set("file", file);

  return requestGatewayWithSession<MainProfileImportBatch>(
    "/main-profiles/imports",
    {
      method: "POST",
      body: formData
    }
  );
}

export function getMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}`);
}

export function createMainProfile(
  request: CreateMainProfileRequest
): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>("/main-profiles", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
}

export function updateMainProfile(
  id: string,
  request: UpdateMainProfileRequest
): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
}

export function activateMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}/activate`, {
    method: "PATCH"
  });
}

export function deactivateMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(
    `/main-profiles/${id}/deactivate`,
    {
      method: "PATCH"
    }
  );
}
