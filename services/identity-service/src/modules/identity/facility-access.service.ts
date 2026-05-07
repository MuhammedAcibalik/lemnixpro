import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  facilityAccessRoles,
  facilityModuleKeys,
  type FacilityAccessCheckRequest,
  type FacilityAccessCheckResponse,
  type FacilityAccessDecisionReason,
  type FacilityAccessRole,
  type FacilityModuleKey,
  type SetUserFacilityGrantsRequest,
  type UserFacilityAccessResponse,
  type UserFacilityGrant
} from "@lemnixpro/shared-contracts";
import type { UserRole } from "@lemnixpro/shared-types";

import type {
  IdentityUser,
  UserFacilityGrantRecord
} from "../../infrastructure/db/schema";

import {
  FacilityAccessRepository,
  type PersistedFacilityGrantInput
} from "./facility-access.repository";
import { UsersRepository } from "./users.repository";

const FACILITY_ID_MAX_LENGTH = 128;
const ALL_SCOPE_ROLES = new Set<UserRole>(["SUPER_ADMIN", "CENTRAL_PLANNER"]);

@Injectable()
export class FacilityAccessService {
  constructor(
    @Inject(UsersRepository)
    private readonly usersRepository: UsersRepository,
    @Inject(FacilityAccessRepository)
    private readonly facilityAccessRepository: FacilityAccessRepository
  ) {}

  async getAccessForUser(
    userId: string
  ): Promise<UserFacilityAccessResponse> {
    const user = await this.getUserOrThrow(userId);
    const grants = await this.facilityAccessRepository.findByUserId(userId);

    return this.toAccessResponse(user, grants);
  }

  async replaceGrantsForUser(
    userId: string,
    request: SetUserFacilityGrantsRequest
  ): Promise<UserFacilityAccessResponse> {
    const user = await this.getUserOrThrow(userId);
    const normalizedGrants = this.normalizeGrantInputs(request);
    const grants = await this.facilityAccessRepository.replaceForUser(
      userId,
      normalizedGrants
    );

    return this.toAccessResponse(user, grants);
  }

  async resolveAccessForUser(
    userId: string,
    request: FacilityAccessCheckRequest
  ): Promise<FacilityAccessCheckResponse> {
    const user = await this.usersRepository.findById(userId);

    if (!user || !user.isActive) {
      return this.denied(userId, "user_not_found", null);
    }

    const context = this.normalizeAccessCheckContext(request);

    if (!context) {
      return this.denied(userId, "invalid_facility_context", null);
    }

    if (user.role === "SUPER_ADMIN") {
      return {
        userId,
        allowed: true,
        reason: "super_admin",
        context
      };
    }

    const grants = await this.facilityAccessRepository.findByUserId(userId);

    if (context.scope === "all") {
      return this.resolveAllScopeAccess(user, grants, request.moduleKey, context);
    }

    const grant = grants.find(
      (candidate) => candidate.facilityId === context.facilityId
    );

    if (!grant) {
      return this.denied(userId, "facility_not_granted", context);
    }

    if (
      request.moduleKey &&
      !this.grantIncludesModule(grant, request.moduleKey)
    ) {
      return this.denied(userId, "module_not_granted", context);
    }

    return {
      userId,
      allowed: true,
      reason: "facility_module_granted",
      context
    };
  }

  private resolveAllScopeAccess(
    user: IdentityUser,
    grants: UserFacilityGrantRecord[],
    moduleKey: FacilityModuleKey | undefined,
    context: { scope: "all"; facilityId: null }
  ): FacilityAccessCheckResponse {
    if (!ALL_SCOPE_ROLES.has(user.role)) {
      return this.denied(user.id, "all_scope_not_granted", context);
    }

    if (user.role === "SUPER_ADMIN") {
      return {
        userId: user.id,
        allowed: true,
        reason: "super_admin",
        context
      };
    }

    const hasCentralPlannerGrant = grants.some((grant) => {
      if (grant.facilityRole !== "CENTRAL_PLANNER") {
        return false;
      }

      return moduleKey ? this.grantIncludesModule(grant, moduleKey) : true;
    });

    if (!hasCentralPlannerGrant) {
      return this.denied(user.id, "all_scope_not_granted", context);
    }

    return {
      userId: user.id,
      allowed: true,
      reason: "central_planner_module_granted",
      context
    };
  }

  private normalizeGrantInputs(
    request: SetUserFacilityGrantsRequest
  ): PersistedFacilityGrantInput[] {
    if (!request || !Array.isArray(request.grants)) {
      throw new BadRequestException("grants must be an array.");
    }

    const facilityIds = new Set<string>();
    let defaultGrantCount = 0;

    return request.grants.map((grant) => {
      const facilityId = this.normalizeFacilityId(grant.facilityId);

      if (facilityIds.has(facilityId)) {
        throw new BadRequestException(
          `Duplicate facility grant for "${facilityId}".`
        );
      }

      facilityIds.add(facilityId);

      const isDefault = grant.isDefault === true;

      if (isDefault) {
        defaultGrantCount += 1;
      }

      if (defaultGrantCount > 1) {
        throw new BadRequestException(
          "At most one default facility grant is allowed per user."
        );
      }

      return {
        facilityId,
        facilityRole: this.normalizeFacilityRole(grant.facilityRole),
        moduleKeys: this.normalizeModuleKeys(grant.moduleKeys),
        isDefault
      };
    });
  }

  private normalizeAccessCheckContext(
    request: FacilityAccessCheckRequest
  ): FacilityAccessCheckResponse["context"] {
    if (request.scope === "all") {
      if (request.facilityId) {
        return null;
      }

      return {
        scope: "all",
        facilityId: null
      };
    }

    if (request.scope !== "single") {
      return null;
    }

    const facilityId = this.normalizeOptionalFacilityId(request.facilityId);

    if (!facilityId) {
      return null;
    }

    return {
      scope: "single",
      facilityId
    };
  }

  private normalizeFacilityId(value: unknown): string {
    const normalizedValue = this.normalizeOptionalFacilityId(value);

    if (!normalizedValue) {
      throw new BadRequestException("facilityId is required.");
    }

    return normalizedValue;
  }

  private normalizeOptionalFacilityId(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      return null;
    }

    if (normalizedValue.length > FACILITY_ID_MAX_LENGTH) {
      throw new BadRequestException(
        `facilityId must be at most ${FACILITY_ID_MAX_LENGTH} characters.`
      );
    }

    return normalizedValue;
  }

  private normalizeFacilityRole(value: unknown): FacilityAccessRole {
    if (
      typeof value === "string" &&
      (facilityAccessRoles as readonly string[]).includes(value)
    ) {
      return value as FacilityAccessRole;
    }

    throw new BadRequestException("facilityRole is not supported.");
  }

  private normalizeModuleKeys(value: unknown): FacilityModuleKey[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException("moduleKeys must contain at least one module.");
    }

    const moduleKeys = value.map((entry) => {
      if (
        typeof entry === "string" &&
        (facilityModuleKeys as readonly string[]).includes(entry)
      ) {
        return entry as FacilityModuleKey;
      }

      throw new BadRequestException("moduleKeys contains an unsupported module.");
    });

    if (new Set(moduleKeys).size !== moduleKeys.length) {
      throw new BadRequestException("moduleKeys must not contain duplicates.");
    }

    return moduleKeys;
  }

  private async getUserOrThrow(userId: string): Promise<IdentityUser> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException(`User "${userId}" was not found.`);
    }

    return user;
  }

  private toAccessResponse(
    user: IdentityUser,
    grantRecords: UserFacilityGrantRecord[]
  ): UserFacilityAccessResponse {
    const grants = grantRecords.map((grant) => this.toGrantResponse(grant));

    return {
      userId: user.id,
      effectiveRole: user.role,
      canUseAllFacilities: this.canUseAllFacilities(user, grantRecords),
      defaultFacilityId:
        grants.find((grant) => grant.isDefault)?.facilityId ?? null,
      grants
    };
  }

  private canUseAllFacilities(
    user: IdentityUser,
    grantRecords: UserFacilityGrantRecord[]
  ): boolean {
    if (user.role === "SUPER_ADMIN") {
      return true;
    }

    if (user.role !== "CENTRAL_PLANNER") {
      return false;
    }

    return grantRecords.some(
      (grant) => grant.facilityRole === "CENTRAL_PLANNER"
    );
  }

  private toGrantResponse(
    grant: UserFacilityGrantRecord
  ): UserFacilityGrant {
    return {
      userId: grant.userId,
      facilityId: grant.facilityId,
      facilityRole: grant.facilityRole,
      moduleKeys: grant.moduleKeys,
      isDefault: grant.isDefault,
      createdAt: grant.createdAt,
      updatedAt: grant.updatedAt
    };
  }

  private grantIncludesModule(
    grant: UserFacilityGrantRecord,
    moduleKey: FacilityModuleKey
  ): boolean {
    return grant.moduleKeys.includes(moduleKey);
  }

  private denied(
    userId: string,
    reason: FacilityAccessDecisionReason,
    context: FacilityAccessCheckResponse["context"]
  ): FacilityAccessCheckResponse {
    return {
      userId,
      allowed: false,
      reason,
      context
    };
  }
}
