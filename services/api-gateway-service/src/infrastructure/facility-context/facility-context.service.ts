import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import {
  facilityScopes,
  requestHeaders,
  type ActiveFacilityContext,
  type FacilityAccessCheckRequest,
  type FacilityModuleKey,
  type JwtClaims
} from "@lemnixpro/shared-contracts";
import { normalizeHeaderValue } from "@lemnixpro/shared-utils";

import { IdentityAuthClient } from "../http/identity-auth.client";

type RequestLike = {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: JwtClaims;
};

const WRITE_LIKE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class FacilityContextService {
  constructor(
    @Inject(IdentityAuthClient)
    private readonly identityAuthClient: IdentityAuthClient
  ) {}

  async resolveForRequest(
    request: RequestLike
  ): Promise<ActiveFacilityContext | null> {
    if (this.shouldSkipRequest(request)) {
      return null;
    }

    const parsedContext = this.parseFacilityContext(request);

    if (!parsedContext) {
      return null;
    }

    if (
      parsedContext.scope === "all" &&
      WRITE_LIKE_METHODS.has((request.method ?? "GET").toUpperCase())
    ) {
      throw new ForbiddenException(
        "All-facility scope is not allowed for write-like gateway requests."
      );
    }

    const authorizationHeader = this.readHeader(request, "authorization");

    if (!request.user || !authorizationHeader) {
      throw new UnauthorizedException(
        "Facility context requires an authenticated user."
      );
    }

    const moduleKey = this.moduleKeyForRequestPath(request);
    const accessRequest: FacilityAccessCheckRequest = {
      scope: parsedContext.scope,
      facilityId: parsedContext.facilityId
    };

    if (moduleKey) {
      accessRequest.moduleKey = moduleKey;
    }
    const decision = await this.identityAuthClient.resolveFacilityAccess(
      authorizationHeader,
      accessRequest
    );

    if (!decision.allowed || !decision.context) {
      throw new ForbiddenException({
        code: "facility_context_forbidden",
        message: "The active facility context is not allowed for this user.",
        reason: decision.reason
      });
    }

    return decision.context;
  }

  private parseFacilityContext(
    request: RequestLike
  ): ActiveFacilityContext | null {
    const rawFacilityId = this.readHeader(request, requestHeaders.facilityId);
    const rawScope = this.readHeader(request, requestHeaders.facilityScope);

    if (!rawFacilityId && !rawScope) {
      return null;
    }

    if (
      rawScope &&
      !(facilityScopes as readonly string[]).includes(rawScope)
    ) {
      throw new BadRequestException("Facility scope must be single or all.");
    }

    const scope = rawScope ?? (rawFacilityId ? "single" : null);

    if (scope === "all") {
      if (rawFacilityId) {
        throw new BadRequestException(
          "All-facility scope must not include a facility id."
        );
      }

      return {
        scope: "all",
        facilityId: null
      };
    }

    if (scope !== "single") {
      throw new BadRequestException("Facility scope must be single or all.");
    }

    if (!rawFacilityId) {
      throw new BadRequestException(
        "Single-facility scope requires a facility id."
      );
    }

    return {
      scope: "single",
      facilityId: rawFacilityId
    };
  }

  private shouldSkipRequest(request: RequestLike): boolean {
    const requestPath = this.normalizedPath(request);

    return (
      requestPath === "/health/live" ||
      requestPath === "/health/ready" ||
      requestPath === "/" ||
      requestPath.startsWith("/auth/") ||
      requestPath.startsWith("/docs")
    );
  }

  private moduleKeyForRequestPath(
    request: RequestLike
  ): FacilityModuleKey | undefined {
    const requestPath = this.normalizedPath(request);

    if (requestPath.startsWith("/workspace")) {
      return "workspace";
    }

    if (requestPath.startsWith("/main-profiles")) {
      return "master-data";
    }

    if (
      requestPath.startsWith("/production-plan-imports") ||
      requestPath.startsWith("/production-plan-weeks") ||
      requestPath.startsWith("/production-plan-rows")
    ) {
      return "production-plan";
    }

    if (requestPath.startsWith("/cut-lists")) {
      return "cut-list";
    }

    if (requestPath.startsWith("/optimization-requests")) {
      return "optimization";
    }

    if (requestPath.startsWith("/results")) {
      return "results";
    }

    if (requestPath.startsWith("/analytics")) {
      return "analytics";
    }

    return undefined;
  }

  private normalizedPath(request: RequestLike): string {
    const rawPath = request.path ?? request.url ?? "/";
    const [pathname] = rawPath.split("?");

    return pathname || "/";
  }

  private readHeader(request: RequestLike, headerName: string): string | null {
    const headers = request.headers ?? {};
    const lowerCaseHeaderName = headerName.toLowerCase();

    return normalizeHeaderValue(
      headers[lowerCaseHeaderName] ?? headers[headerName]
    );
  }
}
