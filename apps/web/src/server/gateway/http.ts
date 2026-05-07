import "server-only";

import { randomUUID } from "node:crypto";

import {
  requestHeaders,
  type ApiErrorResponse
} from "@lemnixpro/shared-contracts";

import { requireSessionToken } from "../auth/session";
import { getServerEnv } from "../env";

type GatewayErrorPayload = ApiErrorResponse & {
  error?: string;
};

export type GatewayRequestInit = RequestInit & {
  timeoutMs?: number;
  token?: string;
};

export class GatewayRequestError extends Error {
  readonly status: number;
  readonly payload: GatewayErrorPayload | null;

  constructor(status: number, payload: GatewayErrorPayload | null) {
    super(payload?.message ?? "Gateway request failed.");
    this.name = "GatewayRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export function isGatewayRequestError(
  error: unknown
): error is GatewayRequestError {
  return error instanceof GatewayRequestError;
}

function appendRequestIdSuffix(
  message: string,
  payload: GatewayErrorPayload | null
): string {
  const id = payload?.requestId?.trim();

  if (!id) {
    return message;
  }

  return `${message} Istek no: ${id}`;
}

export function getGatewayErrorMessage(error: unknown): string {
  if (isGatewayRequestError(error)) {
    const payload = error.payload;
    const upstreamDetail =
      typeof payload?.upstreamDetail === "string"
        ? payload.upstreamDetail.trim()
        : "";
    const envelopeMessage =
      (typeof payload?.message === "string"
        ? payload.message.trim()
        : "") || error.message;
    const errCode =
      typeof payload?.code === "string" ? payload.code.trim() : "";

    if (
      errCode === "internal_service_auth_required" ||
      /internal\s+service\s+authentication\s+is\s+required/i.test(
        envelopeMessage
      )
    ) {
      const svc =
        typeof payload?.service === "string" && payload.service.trim()
          ? ` Reddeden servis: ${payload.service.trim()}.`
          : "";
      return appendRequestIdSuffix(
        `Ic servis kimligi basarisiz (x-lemnixpro-internal-token).${svc} Kok .env icinde INTERNAL_SERVICE_AUTH_SECRET tanimli olmali ve tum mikroservislerde ayni deger kullanilmali. Cozum: proje kokunden 'pnpm sync:service-env', ardindan 'npm run dev' ile tum servisleri yeniden baslatin.`,
        payload
      );
    }

    if (upstreamDetail) {
      if (/internal\s+server\s+error/i.test(upstreamDetail)) {
        return appendRequestIdSuffix(
          "Mikroservis istegi islenemedi (500). Ilgili servis logunu ve veritabani migration durumunu kontrol edin.",
          payload
        );
      }

      const genericUpstreamEnvelope =
        /^the upstream microservice (failed while processing|rejected) the request\.?$/i.test(
          envelopeMessage
        );

      if (genericUpstreamEnvelope) {
        return appendRequestIdSuffix(
          `Bagli mikroservis: ${upstreamDetail}`,
          payload
        );
      }

      return appendRequestIdSuffix(
        `${envelopeMessage} — ${upstreamDetail}`,
        payload
      );
    }

    if (/internal\s+server\s+error/i.test(envelopeMessage)) {
      return appendRequestIdSuffix(
        "Mikroservis istegi islenemedi. Ilgili servis logunu ve veritabani migration durumunu kontrol edin.",
        payload
      );
    }

    if (
      /^the upstream microservice (failed while processing|rejected) the request\.?$/i.test(
        envelopeMessage
      )
    ) {
      return appendRequestIdSuffix(
        "Mikroservis istegi islenemedi (bagli servis hata yaniti). Ilgili servis logunu ve migration durumunu kontrol edin.",
        payload
      );
    }

    if (error.status === 504) {
      return appendRequestIdSuffix(
        "Gateway veya bagli mikroservis zamaninda yanit vermedi. Lutfen tekrar deneyin.",
        payload
      );
    }

    if (error.status === 503) {
      const code = typeof payload?.code === "string" ? payload.code.trim() : "";

      if (code === "api_gateway_unavailable") {
        return appendRequestIdSuffix(
          "Next.js API gatewaye TCP ile baglanamadi. api-gateway-service'in calistigini (varsayilan http://localhost:3001) ve API_GATEWAY_BASE_URL ayarini kontrol edin.",
          payload
        );
      }

      if (code === "upstream_unavailable") {
        const hint =
          typeof payload?.upstreamDetail === "string" ? payload.upstreamDetail.trim() : "";
        const target = hint ? `Hedef: ${hint}. ` : "";
        return appendRequestIdSuffix(
          `${target}API gateway ayakta ancak bir mikroservise TCP ile baglanilamadi (ornek: cut-list-service 3005, production-plan-service 3004, master-data-service 3003). api-gateway-service .env icindeki CUT_LIST_SERVICE_BASE_URL vb. adresleri, servislerin calistigini (\`pnpm dev:services\`) ve Postgres/RabbitMQ icin \`pnpm infra:up\` kullanimini dogrulayin.`,
          payload
        );
      }

      const lcEnvelope = envelopeMessage.toLowerCase();
      if (
        lcEnvelope.includes("upstream microservice") &&
        lcEnvelope.includes("unavailable")
      ) {
        const hint =
          typeof payload?.upstreamDetail === "string" ? payload.upstreamDetail.trim() : "";
        const target = hint ? `Hedef: ${hint}. ` : "";
        return appendRequestIdSuffix(
          `${target}API gateway ayakta ancak bir mikroservise TCP ile baglanilamadi (ornek: cut-list-service 3005, production-plan-service 3004). Yerelde tum servisleri baslatin (\`pnpm dev:services\`) ve gateway .env \`*_SERVICE_BASE_URL\` degerlerini kontrol edin.`,
          payload
        );
      }

      const svc =
        typeof payload?.service === "string" && payload.service.trim()
          ? ` Servis: ${payload.service.trim()}.`
          : "";
      const extra =
        envelopeMessage &&
        envelopeMessage !== "Gateway request failed." &&
        envelopeMessage.toLowerCase() !== "gateway request failed." &&
        !/^gateway request failed/i.test(envelopeMessage)
          ? ` ${envelopeMessage}`
          : "";
      return appendRequestIdSuffix(
        `${errCode === "" ? "" : `Hata kodu ${errCode}.`}${svc}${extra} Gateway veya bagli mikroservis uygun yanit vermiyor. Yerelde Postgres migrasyonunu unutmayin: pnpm db:migrate:optimization-orchestrator (ve gerekirse cut-list/production-plan); ardindan gelistirici sunucusunu yeniden baslatin.`,
        payload
      );
    }

    return appendRequestIdSuffix(envelopeMessage, payload);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Istek islenirken beklenmeyen bir hata olustu.";
}

export async function requestGateway<T>(
  path: string,
  init: GatewayRequestInit = {}
): Promise<T> {
  const {
    apiGatewayBaseUrl,
    apiGatewayRequestTimeoutMs,
    uploadRequestTimeoutMs
  } = getServerEnv();
  const { timeoutMs, token, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const timeout =
    timeoutMs ??
    (isFormDataBody(requestInit.body)
      ? uploadRequestTimeoutMs
      : apiGatewayRequestTimeoutMs);
  const abortController = new AbortController();
  const requestId = randomUUID();

  headers.set("accept", "application/json");
  headers.set(requestHeaders.requestId, requestId);
  headers.set(requestHeaders.correlationId, requestId);

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutHandle = setTimeout(() => abortController.abort(), timeout);
    response = await fetch(`${apiGatewayBaseUrl}${path}`, {
      ...requestInit,
      cache: requestInit.cache ?? "no-store",
      headers,
      signal: abortController.signal
    });
  } catch {
    if (abortController.signal.aborted) {
      throw new GatewayRequestError(504, {
        code: "api_gateway_timeout",
        requestId,
        service: "apps-web",
        message: "API gateway did not respond before timeout."
      });
    }

    throw new GatewayRequestError(503, {
      code: "api_gateway_unavailable",
      requestId,
      service: "apps-web",
      message: "API gateway is unavailable."
    });
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  const payload = await parseGatewayPayload(response);

  if (!response.ok) {
    throw new GatewayRequestError(
      response.status,
      isGatewayErrorPayload(payload) ? payload : null
    );
  }

  return payload as T;
}

export async function requestGatewayWithSession<T>(
  path: string,
  init: GatewayRequestInit = {}
): Promise<T> {
  const token = await requireSessionToken();

  return requestGateway<T>(path, {
    ...init,
    token
  });
}

async function parseGatewayPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  return {
    code: "upstream_text_response",
    message: text
  };
}

function isGatewayErrorPayload(value: unknown): value is GatewayErrorPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof value.message === "string"
  );
}

function isFormDataBody(body: BodyInit | null | undefined): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}
