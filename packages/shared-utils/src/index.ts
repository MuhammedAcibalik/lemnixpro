import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID, timingSafeEqual } from "node:crypto";

export type RequestContext = {
  requestId: string;
  correlationId: string;
  serviceName?: string;
};

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  header?: (name: string) => HeaderValue;
  headers?: Record<string, HeaderValue>;
  method?: string;
  path?: string;
  url?: string;
};

type ResponseLike = {
  setHeader?: (name: string, value: string) => void;
  status?: (statusCode: number) => ResponseLike;
  json?: (body: unknown) => void;
};

type MiddlewareHost = {
  use: (middleware: unknown) => void;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const logLevelOrder = {
  fatal: 0,
  error: 1,
  warn: 2,
  log: 3,
  debug: 4,
  verbose: 5
} as const;
const sensitiveLogKeyPattern =
  /(authorization|cookie|password|secret|token|jwt|api[-_]?key)/i;

type LogLevel = keyof typeof logLevelOrder;

export function isoNow(): string {
  return new Date().toISOString();
}

export function asNumber(value: unknown, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function asBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export function createRequestId(): string {
  return randomUUID();
}

export function createMessageMetadata(input?: {
  correlationId?: string;
  causationId?: string;
  occurredAt?: string;
}): {
  messageId: string;
  correlationId: string;
  causationId?: string;
  attempt: number;
  occurredAt: string;
} {
  const currentContext = getRequestContext();

  return {
    messageId: createRequestId(),
    correlationId:
      input?.correlationId ?? currentContext?.correlationId ?? createRequestId(),
    ...(input?.causationId ? { causationId: input.causationId } : {}),
    attempt: 1,
    occurredAt: input?.occurredAt ?? isoNow()
  };
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function createStructuredLogger(options: {
  serviceName: string;
  minimumLevel?: string;
}): {
  log: (message: unknown, ...optionalParams: unknown[]) => void;
  error: (message: unknown, ...optionalParams: unknown[]) => void;
  warn: (message: unknown, ...optionalParams: unknown[]) => void;
  debug: (message: unknown, ...optionalParams: unknown[]) => void;
  verbose: (message: unknown, ...optionalParams: unknown[]) => void;
  fatal: (message: unknown, ...optionalParams: unknown[]) => void;
} {
  const minimumLevel = normalizeLogLevel(options.minimumLevel);

  return {
    log: (message, ...optionalParams) =>
      writeStructuredLog("log", options.serviceName, minimumLevel, message, optionalParams),
    error: (message, ...optionalParams) =>
      writeStructuredLog(
        "error",
        options.serviceName,
        minimumLevel,
        message,
        optionalParams
      ),
    warn: (message, ...optionalParams) =>
      writeStructuredLog(
        "warn",
        options.serviceName,
        minimumLevel,
        message,
        optionalParams
      ),
    debug: (message, ...optionalParams) =>
      writeStructuredLog(
        "debug",
        options.serviceName,
        minimumLevel,
        message,
        optionalParams
      ),
    verbose: (message, ...optionalParams) =>
      writeStructuredLog(
        "verbose",
        options.serviceName,
        minimumLevel,
        message,
        optionalParams
      ),
    fatal: (message, ...optionalParams) =>
      writeStructuredLog(
        "fatal",
        options.serviceName,
        minimumLevel,
        message,
        optionalParams
      )
  };
}

export function installRequestContextMiddleware(
  app: MiddlewareHost,
  options: {
    requestIdHeader: string;
    correlationIdHeader: string;
    serviceName?: string;
  }
): void {
  app.use((request: RequestLike, response: ResponseLike, next: () => void) => {
    const requestId =
      readHeader(request, options.requestIdHeader) ?? createRequestId();
    const correlationId =
      readHeader(request, options.correlationIdHeader) ?? requestId;
    const context: RequestContext = {
      requestId,
      correlationId,
      ...(options.serviceName ? { serviceName: options.serviceName } : {})
    };

    writeHeader(response, options.requestIdHeader, requestId);
    writeHeader(response, options.correlationIdHeader, correlationId);
    Object.assign(request, context);
    requestContextStorage.run(context, next);
  });
}

export function installInternalServiceAuthMiddleware(
  app: MiddlewareHost,
  options: {
    enabled: boolean;
    serviceName: string;
    tokenHeader: string;
    expectedToken?: string;
    publicPaths?: string[];
  }
): void {
  if (!options.enabled) {
    return;
  }

  app.use((request: RequestLike, response: ResponseLike, next: () => void) => {
    const requestPath = normalizeRequestPath(request);

    if (options.publicPaths?.includes(requestPath)) {
      next();
      return;
    }

    const expectedToken = options.expectedToken?.trim() ?? "";
    const providedToken = readHeader(request, options.tokenHeader);

    if (
      expectedToken &&
      providedToken &&
      constantTimeEquals(providedToken, expectedToken)
    ) {
      next();
      return;
    }

    const context = getRequestContext();
    response.status?.(401).json?.({
      code: "internal_service_auth_required",
      message: "Internal service authentication is required.",
      requestId: context?.requestId,
      service: options.serviceName
    });
  });
}

export function normalizeHeaderValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    return normalizeHeaderValue(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue === "" ? null : normalizedValue;
}

export function readHeader(
  request: RequestLike,
  headerName: string
): string | null {
  const lowerCaseHeaderName = headerName.toLowerCase();

  return normalizeHeaderValue(
    request.header?.(headerName) ??
      request.headers?.[lowerCaseHeaderName] ??
      request.headers?.[headerName]
  );
}

export function writeHeader(
  response: ResponseLike,
  headerName: string,
  value: string
): void {
  response.setHeader?.(headerName, value);
}

export function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertProductionSafeSecret(input: {
  environment: string;
  name: string;
  value: string | undefined;
  forbiddenValues?: string[];
  minLength?: number;
}): void {
  if (input.environment !== "production") {
    return;
  }

  const value = input.value?.trim() ?? "";
  const minLength = input.minLength ?? 32;

  if (value.length < minLength) {
    throw new Error(
      `${input.name} must be at least ${minLength} characters in production.`
    );
  }

  if (input.forbiddenValues?.includes(value)) {
    throw new Error(`${input.name} uses an unsafe production default value.`);
  }
}

export function assertProductionSafeUrl(input: {
  environment: string;
  name: string;
  value: string | undefined;
  forbiddenSubstrings?: string[];
}): void {
  if (input.environment !== "production") {
    return;
  }

  const value = input.value?.trim() ?? "";

  if (value === "") {
    throw new Error(`${input.name} is required in production.`);
  }

  for (const forbiddenSubstring of input.forbiddenSubstrings ?? []) {
    if (value.includes(forbiddenSubstring)) {
      throw new Error(
        `${input.name} uses a development credential or host in production.`
      );
    }
  }
}

function normalizeRequestPath(request: RequestLike): string {
  const rawPath = request.path ?? request.url ?? "/";
  const [pathname] = rawPath.split("?");

  return pathname || "/";
}

function normalizeLogLevel(value: string | undefined): LogLevel {
  if (value && value in logLevelOrder) {
    return value as LogLevel;
  }

  return "log";
}

function writeStructuredLog(
  level: LogLevel,
  serviceName: string,
  minimumLevel: LogLevel,
  message: unknown,
  optionalParams: unknown[]
): void {
  if (logLevelOrder[level] > logLevelOrder[minimumLevel]) {
    return;
  }

  const context = getRequestContext();
  const payload = {
    timestamp: isoNow(),
    level,
    service: serviceName,
    ...(context
      ? {
          requestId: context.requestId,
          correlationId: context.correlationId
        }
      : {}),
    message: serializeLogMessage(message),
    ...(optionalParams.length > 0
      ? { context: optionalParams.map((param) => serializeLogMessage(param)) }
      : {})
  };
  const serializedPayload = JSON.stringify(payload);

  if (level === "error" || level === "fatal") {
    console.error(serializedPayload);
    return;
  }

  if (level === "warn") {
    console.warn(serializedPayload);
    return;
  }

  console.log(serializedPayload);
}

function serializeLogMessage(message: unknown): unknown {
  if (message instanceof Error) {
    return {
      name: message.name,
      message: message.message,
      stack: message.stack
    };
  }

  return redactLogValue(message);
}

function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactLogValue(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    redacted[key] = sensitiveLogKeyPattern.test(key)
      ? "[Redacted]"
      : redactLogValue(entry, depth + 1);
  }

  return redacted;
}
