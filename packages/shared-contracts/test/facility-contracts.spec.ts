import { describe, expect, it } from "vitest";

import {
  facilityAccessDecisionReasons,
  facilityModuleKeys,
  facilityScopes,
  facilityStatuses,
  requestHeaders,
  type ActiveFacilityContext,
  type Facility,
  type FacilityAccessCheckRequest,
  type FacilityAccessCheckResponse,
  type MainProfile,
  type ProductionPlanImportBatch,
  type SetUserFacilityGrantsRequest,
  type UserFacilityGrant
} from "../src";

describe("facility contracts", () => {
  it("defines stable facility request headers and scope values", () => {
    expect(requestHeaders.facilityId).toBe("x-lemnixpro-facility-id");
    expect(requestHeaders.facilityScope).toBe("x-lemnixpro-facility-scope");
    expect(facilityScopes).toEqual(["single", "all"]);
  });

  it("covers current and reserved facility module keys", () => {
    expect(facilityModuleKeys).toEqual([
      "workspace",
      "master-data",
      "production-plan",
      "cut-list",
      "optimization",
      "results",
      "analytics",
      "two-d-nesting"
    ]);
  });

  it("keeps facilities queryable when inactive", () => {
    expect(facilityStatuses).toEqual(["active", "inactive"]);

    const facility: Facility = {
      id: "facility-1",
      code: "IZMIR",
      name: "Izmir Plant",
      status: "inactive",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z"
    };

    expect(facility.status).toBe("inactive");
  });

  it("models user facility grants without cross-service database coupling", () => {
    const grant: UserFacilityGrant = {
      userId: "user-1",
      facilityId: "facility-1",
      facilityRole: "FACILITY_PLANNER",
      moduleKeys: ["workspace", "optimization"],
      isDefault: true,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z"
    };
    const activeContext: ActiveFacilityContext = {
      scope: "single",
      facilityId: grant.facilityId
    };

    expect(grant.moduleKeys).toContain("optimization");
    expect(activeContext).toEqual({
      scope: "single",
      facilityId: "facility-1"
    });
  });

  it("models additive user grant updates and facility access decisions", () => {
    expect(facilityAccessDecisionReasons).toEqual([
      "super_admin",
      "facility_module_granted",
      "central_planner_module_granted",
      "facility_not_granted",
      "module_not_granted",
      "all_scope_not_granted",
      "invalid_facility_context",
      "user_not_found"
    ]);

    const updateRequest: SetUserFacilityGrantsRequest = {
      grants: [
        {
          facilityId: "facility-1",
          facilityRole: "FACILITY_PLANNER",
          moduleKeys: ["workspace", "cut-list"],
          isDefault: true
        }
      ]
    };
    const checkRequest: FacilityAccessCheckRequest = {
      scope: "single",
      facilityId: "facility-1",
      moduleKey: "cut-list"
    };
    const checkResponse: FacilityAccessCheckResponse = {
      userId: "user-1",
      allowed: true,
      reason: "facility_module_granted",
      context: {
        scope: "single",
        facilityId: "facility-1"
      }
    };

    expect(updateRequest.grants[0]?.moduleKeys).toContain("cut-list");
    expect(checkRequest.facilityId).toBe("facility-1");
    expect(checkResponse.allowed).toBe(true);
  });

  it("models facility-scoped downstream records without changing existing field names", () => {
    const mainProfile = {
      id: "profile-1",
      facilityId: "facility-izmir",
      code: "MP-01",
      name: "Main Profile",
      stockLengthMm: 6000,
      linkedProductCode: "PRD-01",
      linkedProductName: "Product",
      cuttingSpecs: [],
      isActive: true,
      notes: null,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z"
    } satisfies MainProfile;
    const productionPlanBatch = {
      id: "batch-1",
      facilityId: "facility-izmir",
      fileName: "week.xlsx",
      sheetName: "Plan",
      planYear: 2026,
      weekNumber: 19,
      status: "imported",
      totalRowCount: 1,
      validRowCount: 1,
      invalidRowCount: 0,
      activatedAt: null,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z"
    } satisfies ProductionPlanImportBatch;

    expect(mainProfile.facilityId).toBe("facility-izmir");
    expect(productionPlanBatch.facilityId).toBe("facility-izmir");
  });
});
