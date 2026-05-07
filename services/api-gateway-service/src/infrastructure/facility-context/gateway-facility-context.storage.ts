import { AsyncLocalStorage } from "node:async_hooks";

import type { ActiveFacilityContext } from "@lemnixpro/shared-contracts";

const facilityContextStorage = new AsyncLocalStorage<ActiveFacilityContext>();

export function getGatewayFacilityContext():
  | ActiveFacilityContext
  | undefined {
  return facilityContextStorage.getStore();
}

export function runWithGatewayFacilityContext<T>(
  context: ActiveFacilityContext,
  callback: () => T
): T {
  return facilityContextStorage.run(context, callback);
}
