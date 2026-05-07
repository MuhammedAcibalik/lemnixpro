import "server-only";

import { cookies, headers } from "next/headers";

import {
  requestHeaders,
  type ActiveFacilityContext
} from "@lemnixpro/shared-contracts";

const ACTIVE_FACILITY_ID_COOKIE = "lemnixpro.activeFacilityId";
const ACTIVE_FACILITY_SCOPE_COOKIE = "lemnixpro.activeFacilityScope";

export async function readActiveFacilityHeaders(): Promise<Record<string, string>> {
  const context = await readActiveFacilityContext();

  if (!context) {
    return {};
  }

  if (context.scope === "all") {
    return {
      [requestHeaders.facilityScope]: "all"
    };
  }

  return {
    [requestHeaders.facilityId]: context.facilityId,
    [requestHeaders.facilityScope]: "single"
  };
}

export async function requireSingleActiveFacilityHeaders(): Promise<
  Record<string, string>
> {
  const context = await readActiveFacilityContext();

  if (!context || context.scope !== "single") {
    throw new Error(
      "Aktif tesis secimi olmadan bu islem yapilamaz. Lutfen once tek bir tesis secin."
    );
  }

  return {
    [requestHeaders.facilityId]: context.facilityId,
    [requestHeaders.facilityScope]: "single"
  };
}

async function readActiveFacilityContext(): Promise<ActiveFacilityContext | null> {
  const requestHeaderStore = await headers();
  const cookieStore = await cookies();
  const headerFacilityId = normalizeScalar(
    requestHeaderStore.get(requestHeaders.facilityId)
  );
  const headerScope = normalizeScalar(
    requestHeaderStore.get(requestHeaders.facilityScope)
  );
  const cookieFacilityId = normalizeScalar(
    cookieStore.get(ACTIVE_FACILITY_ID_COOKIE)?.value
  );
  const cookieScope = normalizeScalar(
    cookieStore.get(ACTIVE_FACILITY_SCOPE_COOKIE)?.value
  );
  const scope = headerScope ?? cookieScope;
  const facilityId = headerFacilityId ?? cookieFacilityId;

  if (scope === "all") {
    return {
      scope: "all",
      facilityId: null
    };
  }

  if (facilityId) {
    return {
      scope: "single",
      facilityId
    };
  }

  return null;
}

function normalizeScalar(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}
