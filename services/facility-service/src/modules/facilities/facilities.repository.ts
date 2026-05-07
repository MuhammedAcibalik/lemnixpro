import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";

import type { FacilityStatus } from "@lemnixpro/shared-contracts";

import type { FacilityDatabase } from "../../infrastructure/db/client";
import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import {
  facilities,
  type FacilityRecord
} from "../../infrastructure/db/schema";

export type CreateFacilityRecord = {
  code: string;
  name: string;
  status: FacilityStatus;
};

export type UpdateFacilityRecord = Partial<CreateFacilityRecord>;

@Injectable()
export class FacilitiesRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: FacilityDatabase
  ) {}

  async create(input: CreateFacilityRecord): Promise<FacilityRecord> {
    const [createdFacility] = await this.databaseClient
      .insert(facilities)
      .values({
        id: randomUUID(),
        code: input.code,
        name: input.name,
        status: input.status
      })
      .returning();

    if (!createdFacility) {
      throw new Error("Failed to create facility.");
    }

    return createdFacility;
  }

  async findAll(): Promise<FacilityRecord[]> {
    return this.databaseClient
      .select()
      .from(facilities)
      .orderBy(asc(facilities.code));
  }

  async findById(id: string): Promise<FacilityRecord | null> {
    const [facility] = await this.databaseClient
      .select()
      .from(facilities)
      .where(eq(facilities.id, id))
      .limit(1);

    return facility ?? null;
  }

  async findByCode(code: string): Promise<FacilityRecord | null> {
    const [facility] = await this.databaseClient
      .select()
      .from(facilities)
      .where(eq(facilities.code, code.trim().toUpperCase()))
      .limit(1);

    return facility ?? null;
  }

  async update(
    id: string,
    input: UpdateFacilityRecord
  ): Promise<FacilityRecord | null> {
    const [updatedFacility] = await this.databaseClient
      .update(facilities)
      .set({
        ...input,
        updatedAt: sql`now()`
      })
      .where(eq(facilities.id, id))
      .returning();

    return updatedFacility ?? null;
  }
}
