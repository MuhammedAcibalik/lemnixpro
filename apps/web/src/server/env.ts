import "server-only";

type ServerEnv = {
  apiGatewayBaseUrl: string;
  apiGatewayRequestTimeoutMs: number;
  isProduction: boolean;
  uploadRequestTimeoutMs: number;
};

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const configuredApiGatewayBaseUrl = process.env.API_GATEWAY_BASE_URL?.trim();
  const apiGatewayBaseUrl =
    configuredApiGatewayBaseUrl ||
    (isProduction ? undefined : "http://localhost:3001");

  if (!apiGatewayBaseUrl) {
    throw new Error("API_GATEWAY_BASE_URL must be configured.");
  }

  cachedEnv = {
    apiGatewayBaseUrl: apiGatewayBaseUrl.replace(/\/$/, ""),
    apiGatewayRequestTimeoutMs: readPositiveInteger(
      process.env.API_GATEWAY_REQUEST_TIMEOUT_MS,
      8_000
    ),
    isProduction,
    uploadRequestTimeoutMs: readPositiveInteger(
      process.env.UPLOAD_REQUEST_TIMEOUT_MS,
      60_000
    )
  };

  return cachedEnv;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
