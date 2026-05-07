import {
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { requestHeaders } from "@lemnixpro/shared-contracts";
import { createRequestId, getRequestContext } from "@lemnixpro/shared-utils";

@Injectable()
export class UpstreamService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getProductionPlanServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>(
      "PRODUCTION_PLAN_SERVICE_BASE_URL"
    );
  }

  getMasterDataServiceBaseUrl(): string {
    return this.configService.getOrThrow<string>("MASTER_DATA_SERVICE_BASE_URL");
  }

  async request<T>(
    baseUrl: string,
    path: string,
    init: RequestInit
  ): Promise<T> {
    const context = getRequestContext();
    const requestId = context?.requestId ?? createRequestId();
    const correlationId = context?.correlationId ?? requestId;
    const headers = new Headers(init.headers);
    const abortController = new AbortController();
    const timeoutMs = this.configService.get<number>(
      "UPSTREAM_REQUEST_TIMEOUT_MS",
      8000
    );
    const internalServiceAuthSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_AUTH_SECRET"
    );

    headers.set("accept", "application/json");
    headers.set(requestHeaders.requestId, requestId);
    headers.set(requestHeaders.correlationId, correlationId);

    if (internalServiceAuthSecret) {
      headers.set(requestHeaders.internalServiceToken, internalServiceAuthSecret);
    }

    let response: Response;

    try {
      response = await this.fetchWithTimeout(
        `${baseUrl}${path}`,
        { ...init, headers },
        timeoutMs,
        abortController
      );
    } catch {
      if (abortController.signal.aborted) {
        throw new GatewayTimeoutException({
          code: "upstream_timeout",
          requestId,
          service: this.configService.get<string>("SERVICE_NAME"),
          message: "The upstream service did not respond before timeout."
        });
      }

      throw new ServiceUnavailableException({
        code: "upstream_unavailable",
        requestId,
        service: this.configService.get<string>("SERVICE_NAME"),
        message: "The upstream service is unavailable."
      });
    }

    const payload = await this.parsePayload(response);

    if (!response.ok) {
      throw new HttpException(
        this.normalizeErrorPayload(payload, requestId),
        response.status
      );
    }

    return payload as T;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    abortController: AbortController
  ): Promise<Response> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

      return await fetch(url, {
        ...init,
        signal: abortController.signal
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async parsePayload(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();

    return text ? { message: text } : { message: response.statusText };
  }

  private normalizeErrorPayload(payload: unknown, requestId: string): object {
    if (payload && typeof payload === "object") {
      return {
        requestId,
        service: this.configService.get<string>("SERVICE_NAME"),
        ...(payload as Record<string, unknown>)
      };
    }

    return {
      code: "upstream_request_failed",
      requestId,
      service: this.configService.get<string>("SERVICE_NAME"),
      message: "The upstream service request failed."
    };
  }
}
