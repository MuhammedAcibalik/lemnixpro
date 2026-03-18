import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";

import { UpstreamService } from "./upstream.service";

export type MainProfileResponse = {
  id: string;
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class MasterDataClient {
  constructor(
    @Inject(UpstreamService)
    private readonly upstreamService: UpstreamService
  ) {}

  async getMainProfiles(): Promise<MainProfileResponse[]> {
    return this.request<MainProfileResponse[]>("/main-profiles", {
      method: "GET"
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = this.upstreamService.getMasterDataServiceBaseUrl();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers
      });
    } catch {
      throw new ServiceUnavailableException("Master data service is unavailable.");
    }

    const payload = await this.parsePayload(response);

    if (!response.ok) {
      throw new HttpException(this.normalizeErrorPayload(payload), response.status);
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
      message: "Master data service request failed."
    };
  }
}
