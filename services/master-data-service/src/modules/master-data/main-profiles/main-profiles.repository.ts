import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";

import { DATABASE_CLIENT } from "../../../infrastructure/db/database.tokens";
import type { MasterDataDatabase } from "../../../infrastructure/db/client";
import { mainProfiles, type MainProfile } from "../../../infrastructure/db/schema";

export type CreateMainProfileRecord = {
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  isActive: boolean;
  notes: string | null;
};

export type UpdateMainProfileRecord = Partial<CreateMainProfileRecord>;

@Injectable()
export class MainProfilesRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: MasterDataDatabase
  ) {}

  async create(input: CreateMainProfileRecord): Promise<MainProfile> {
    const [createdProfile] = await this.databaseClient
      .insert(mainProfiles)
      .values({
        id: randomUUID(),
        code: input.code,
        name: input.name,
        stockLengthMm: input.stockLengthMm,
        linkedProductCode: input.linkedProductCode,
        linkedProductName: input.linkedProductName,
        isActive: input.isActive,
        notes: input.notes
      })
      .returning();

    if (!createdProfile) {
      throw new Error("Failed to create main profile.");
    }

    return createdProfile;
  }

  async findAll(): Promise<MainProfile[]> {
    return this.databaseClient
      .select()
      .from(mainProfiles)
      .orderBy(asc(mainProfiles.code));
  }

  async findById(id: string): Promise<MainProfile | null> {
    const [profile] = await this.databaseClient
      .select()
      .from(mainProfiles)
      .where(eq(mainProfiles.id, id))
      .limit(1);

    return profile ?? null;
  }

  async findByCode(code: string): Promise<MainProfile | null> {
    const [profile] = await this.databaseClient
      .select()
      .from(mainProfiles)
      .where(eq(mainProfiles.code, code))
      .limit(1);

    return profile ?? null;
  }

  async update(
    id: string,
    input: UpdateMainProfileRecord
  ): Promise<MainProfile | null> {
    const [updatedProfile] = await this.databaseClient
      .update(mainProfiles)
      .set({
        ...input,
        updatedAt: sql`now()`
      })
      .where(eq(mainProfiles.id, id))
      .returning();

    return updatedProfile ?? null;
  }
}
