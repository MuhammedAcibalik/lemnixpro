import "server-only";

import type {
  CreateMainProfileRequest,
  MainProfile,
  MainProfileCuttingRealignmentResult,
  MainProfileImportBatch,
  UpdateMainProfileRequest
} from "@lemnixpro/shared-contracts";

import {
  readActiveFacilityHeaders,
  requireSingleActiveFacilityHeaders
} from "../facility-context";

import { requestGatewayWithSession } from "./http";

export async function listMainProfiles(): Promise<MainProfile[]> {
  return requestGatewayWithSession<MainProfile[]>("/main-profiles", {
    headers: await readActiveFacilityHeaders()
  });
}

export async function realignMainProfileCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
  return requestGatewayWithSession<MainProfileCuttingRealignmentResult>(
    "/main-profiles/maintenance/realign-cutting-specs",
    {
      method: "POST",
      headers: await requireSingleActiveFacilityHeaders()
    }
  );
}

export async function uploadMainProfiles(file: File): Promise<MainProfileImportBatch> {
  const formData = new FormData();
  formData.set("file", file);

  return requestGatewayWithSession<MainProfileImportBatch>(
    "/main-profiles/imports",
    {
      method: "POST",
      headers: await requireSingleActiveFacilityHeaders(),
      body: formData
    }
  );
}

export async function getMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}`, {
    headers: await readActiveFacilityHeaders()
  });
}

export async function createMainProfile(
  request: CreateMainProfileRequest
): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>("/main-profiles", {
    method: "POST",
    headers: {
      ...(await requireSingleActiveFacilityHeaders()),
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
}

export async function updateMainProfile(
  id: string,
  request: UpdateMainProfileRequest
): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}`, {
    method: "PATCH",
    headers: {
      ...(await requireSingleActiveFacilityHeaders()),
      "content-type": "application/json"
    },
    body: JSON.stringify(request)
  });
}

export async function activateMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(`/main-profiles/${id}/activate`, {
    method: "PATCH",
    headers: await requireSingleActiveFacilityHeaders()
  });
}

export async function deactivateMainProfile(id: string): Promise<MainProfile> {
  return requestGatewayWithSession<MainProfile>(
    `/main-profiles/${id}/deactivate`,
    {
      method: "PATCH",
      headers: await requireSingleActiveFacilityHeaders()
    }
  );
}
