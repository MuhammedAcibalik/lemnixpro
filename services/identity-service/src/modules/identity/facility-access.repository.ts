import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";

import type {
  FacilityAccessRole,
  FacilityModuleKey
} from "@lemnixpro/shared-contracts";

import type { IdentityDatabase } from "../../infrastructure/db/client";
import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import {
  userFacilityGrants,
  type UserFacilityGrantRecord
} from "../../infrastructure/db/schema";

export type PersistedFacilityGrantInput = {
  facilityId: string;
  facilityRole: FacilityAccessRole;
  moduleKeys: FacilityModuleKey[];
  isDefault: boolean;
};

@Injectable()
export class FacilityAccessRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: IdentityDatabase
  ) {}

  async findByUserId(userId: string): Promise<UserFacilityGrantRecord[]> {
    return this.databaseClient
      .select()
      .from(userFacilityGrants)
      .where(eq(userFacilityGrants.userId, userId))
      .orderBy(
        desc(userFacilityGrants.isDefault),
        asc(userFacilityGrants.facilityId)
      );
  }

  async replaceForUser(
    userId: string,
    grants: PersistedFacilityGrantInput[]
  ): Promise<UserFacilityGrantRecord[]> {
    return this.databaseClient.transaction(async (transaction) => {
      await transaction
        .delete(userFacilityGrants)
        .where(eq(userFacilityGrants.userId, userId));

      if (grants.length > 0) {
        await transaction.insert(userFacilityGrants).values(
          grants.map((grant) => ({
            id: randomUUID(),
            userId,
            facilityId: grant.facilityId,
            facilityRole: grant.facilityRole,
            moduleKeys: grant.moduleKeys,
            isDefault: grant.isDefault
          }))
        );
      }

      return transaction
        .select()
        .from(userFacilityGrants)
        .where(eq(userFacilityGrants.userId, userId))
        .orderBy(
          desc(userFacilityGrants.isDefault),
          asc(userFacilityGrants.facilityId)
        );
    });
  }
}
