import { Inject, Injectable } from "@nestjs/common";

import type {
  CreateMainProfileRequest,
  MainProfile,
  MainProfileCuttingRealignmentResult,
  MainProfileImportBatch,
  UpdateMainProfileRequest
} from "@lemnixpro/shared-contracts";

import { UpstreamService } from "./upstream.service";
import { UpstreamHttpClient } from "./upstream-http.client";

@Injectable()
export class MainProfilesClient {
  constructor(
    @Inject(UpstreamHttpClient)
    private readonly upstreamHttpClient: UpstreamHttpClient,
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async createImport(file?: UploadedMainProfileFile): Promise<MainProfileImportBatch> {
    const formData = new FormData();

    if (file) {
      formData.set(
        "file",
        new Blob([file.buffer], {
          type:
            file.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }),
        file.originalname
      );
    }

    return this.request<MainProfileImportBatch>("/main-profiles/imports", {
      method: "POST",
      body: formData
    });
  }

  async create(request: CreateMainProfileRequest): Promise<MainProfile> {
    return this.request<MainProfile>("/main-profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async findAll(): Promise<MainProfile[]> {
    return this.request<MainProfile[]>("/main-profiles", {
      method: "GET"
    });
  }

  async realignMisplacedCuttingSpecs(): Promise<MainProfileCuttingRealignmentResult> {
    return this.request<MainProfileCuttingRealignmentResult>(
      "/main-profiles/maintenance/realign-cutting-specs",
      {
        method: "POST"
      }
    );
  }

  async findById(id: string): Promise<MainProfile> {
    return this.request<MainProfile>(`/main-profiles/${id}`, {
      method: "GET"
    });
  }

  async update(id: string, request: UpdateMainProfileRequest): Promise<MainProfile> {
    return this.request<MainProfile>(`/main-profiles/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async activate(id: string): Promise<MainProfile> {
    return this.request<MainProfile>(`/main-profiles/${id}/activate`, {
      method: "PATCH"
    });
  }

  async deactivate(id: string): Promise<MainProfile> {
    return this.request<MainProfile>(`/main-profiles/${id}/deactivate`, {
      method: "PATCH"
    });
  }

  private request<T>(path: string, init: RequestInit): Promise<T> {
    return this.upstreamHttpClient.request<T>(
      this.upstreamService.getMasterDataServiceBaseUrl(),
      path,
      init
    );
  }
}

export type UploadedMainProfileFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};
