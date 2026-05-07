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

import { getGatewayFacilityContext } from "../facility-context/gateway-facility-context.storage";

function extractNestStyleMessage(candidate: Record<string, unknown>): string | undefined {
  const message = candidate.message;

  if (Array.isArray(message)) {
    const strings = message.filter(
      (entry): entry is string => typeof entry === "string"
    );

    return strings.length > 0 ? strings.join("; ") : undefined;
  }

  if (typeof message === "string") {
    return message;
  }

  const nested = candidate.response;

  if (nested && typeof nested === "object") {
    const record = nested as Record<string, unknown>;

    return extractNestStyleMessage(record);
  }

  return undefined;
}

export type UpstreamRequestInit = RequestInit & {
  timeoutMs?: number;
  /** Included in 503 payload when the TCP connection to the upstream fails (e.g. service stopped). */
  upstreamHint?: string;
};

@Injectable()
export class UpstreamHttpClient {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  async request<T>(baseUrl: string, path: string, init: UpstreamRequestInit = {}): Promise<T> {
    const { timeoutMs, upstreamHint, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);
    const context = getRequestContext();
    const requestId = context?.requestId ?? createRequestId();
    const correlationId = context?.correlationId ?? requestId;
    const method = (requestInit.method ?? "GET").toUpperCase();
    const internalServiceAuthSecret = this.configService.get<string>(
      "INTERNAL_SERVICE_AUTH_SECRET"
    );
    const requestTimeoutMs =
      timeoutMs ??
      (this.isFormDataBody(requestInit.body)
        ? this.configService.get<number>("UPLOAD_REQUEST_TIMEOUT_MS", 60_000)
        : this.configService.get<number>("UPSTREAM_REQUEST_TIMEOUT_MS", 8_000));
    const abortController = new AbortController();

    headers.set("accept", "application/json");
    headers.set(requestHeaders.requestId, requestId);
    headers.set(requestHeaders.correlationId, correlationId);

    if (internalServiceAuthSecret) {
      headers.set(requestHeaders.internalServiceToken, internalServiceAuthSecret);
    }

    this.applyFacilityContextHeaders(headers);

    let response: Response;

    try {
      response = await this.fetchWithTimeout(
        `${baseUrl}${path}`,
        {
          ...requestInit,
          headers
        },
        requestTimeoutMs,
        abortController
      );

      if (this.shouldRetry(method, response.status)) {
        response = await this.fetchWithTimeout(
          `${baseUrl}${path}`,
          {
            ...requestInit,
            headers
          },
          requestTimeoutMs,
          new AbortController()
        );
      }
    } catch {
      if (abortController.signal.aborted) {
        throw new GatewayTimeoutException({
          code: "upstream_timeout",
          requestId,
          service: this.configService.get<string>("SERVICE_NAME"),
          message:
            "The upstream microservice did not respond before the request timeout."
        });
      }

      throw new ServiceUnavailableException({
        code: "upstream_unavailable",
        requestId,
        service: this.configService.get<string>("SERVICE_NAME"),
        message: "The upstream microservice is unavailable.",
        ...(upstreamHint
          ? { upstreamDetail: upstreamHint }
          : {})
      });
    }

    const payload = await this.parsePayload(response);

    if (!response.ok) {
      throw new HttpException(
        this.normalizeErrorPayload(payload, response.status, requestId),
        response.status
      );
    }

    return payload as T;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    requestTimeoutMs: number,
    abortController: AbortController
  ): Promise<Response> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      timeoutHandle = setTimeout(
        () => abortController.abort(),
        requestTimeoutMs
      );

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
    if (response.status === 204) {
      return undefined;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();

    return text ? { message: text } : { message: response.statusText };
  }

  private normalizeErrorPayload(
    payload: unknown,
    status: number,
    requestId: string
  ): object {
    const service = this.configService.get<string>("SERVICE_NAME");
    const genericUpstream =
      status >= 500
        ? "The upstream microservice failed while processing the request."
        : "The upstream microservice rejected the request.";

    if (!payload || typeof payload !== "object") {
      return {
        code: "upstream_request_failed",
        requestId,
        service,
        message: genericUpstream
      };
    }

    const candidate = payload as Record<string, unknown>;
    const derivedMessage =
      extractNestStyleMessage(candidate) ?? genericUpstream;

    if (
      typeof derivedMessage === "string" &&
      !/^internal server error$/i.test(derivedMessage.trim())
    ) {
      return {
        requestId,
        service,
        ...candidate,
        message: derivedMessage,
        ...(typeof candidate.code === "string" ? {} : { code: "upstream_bad_response" })
      };
    }

    return {
      code: "upstream_request_failed",
      requestId,
      service,
      message: genericUpstream,
      ...candidate,
      ...(typeof derivedMessage === "string"
        ? { upstreamDetail: derivedMessage }
        : {})
    };
  }

  private shouldRetry(method: string, status: number): boolean {
    return method === "GET" && (status === 502 || status === 503 || status === 504);
  }

  private applyFacilityContextHeaders(headers: Headers): void {
    const facilityContext = getGatewayFacilityContext();

    if (!facilityContext) {
      return;
    }

    headers.set(requestHeaders.facilityScope, facilityContext.scope);

    if (facilityContext.scope === "single") {
      headers.set(requestHeaders.facilityId, facilityContext.facilityId);
      return;
    }

    headers.delete(requestHeaders.facilityId);
  }

  private isFormDataBody(body: RequestInit["body"]): boolean {
    return typeof FormData !== "undefined" && body instanceof FormData;
  }
}
