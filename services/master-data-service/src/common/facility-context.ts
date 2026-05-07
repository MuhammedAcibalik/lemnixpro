import { BadRequestException, ForbiddenException } from "@nestjs/common";

import { requestHeaders } from "@lemnixpro/shared-contracts";
import { normalizeHeaderValue } from "@lemnixpro/shared-utils";

export const DEFAULT_FACILITY_ID = "default-facility";

export type FacilityRequestHeaders = Record<
  string,
  string | string[] | undefined
>;

export type SingleFacilityContext = {
  facilityId: string;
  source: "header" | "compatibility-default";
};

export function resolveSingleFacilityContext(
  headers: FacilityRequestHeaders | undefined
): SingleFacilityContext {
  const facilityId = readHeader(headers, requestHeaders.facilityId);
  const facilityScope = readHeader(headers, requestHeaders.facilityScope);

  if (
    facilityScope !== null &&
    facilityScope !== "single" &&
    facilityScope !== "all"
  ) {
    throw new BadRequestException("Facility scope must be single or all.");
  }

  if (facilityScope === "all") {
    throw new ForbiddenException(
      "All-facility scope is not supported for master data endpoints in this slice."
    );
  }

  if (facilityId) {
    return {
      facilityId,
      source: "header"
    };
  }

  if (facilityScope === "single") {
    throw new BadRequestException("Single-facility scope requires a facility id.");
  }

  if (process.env.NODE_ENV === "production") {
    throw new BadRequestException("A single active facility context is required.");
  }

  return {
    facilityId: DEFAULT_FACILITY_ID,
    source: "compatibility-default"
  };
}

function readHeader(
  headers: FacilityRequestHeaders | undefined,
  name: string
): string | null {
  if (!headers) {
    return null;
  }

  return normalizeHeaderValue(headers[name] ?? headers[name.toLowerCase()]);
}
