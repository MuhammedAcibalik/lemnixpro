import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { asc, and, eq, sql } from "drizzle-orm";

import type { MainProfileCuttingSpec } from "@lemnixpro/shared-contracts";

import { DATABASE_CLIENT } from "../../../infrastructure/db/database.tokens";
import type { MasterDataDatabase } from "../../../infrastructure/db/client";
import {
  mainProfileImportBatches,
  mainProfiles,
  type MainProfile,
  type MainProfileImportBatch
} from "../../../infrastructure/db/schema";

export type CreateMainProfileRecord = {
  code: string;
  name: string;
  stockLengthMm: number;
  linkedProductCode: string;
  linkedProductName: string;
  cuttingSpecs: MainProfileCuttingSpec[];
  isActive: boolean;
  notes: string | null;
};

export type UpdateMainProfileRecord = Partial<CreateMainProfileRecord>;

export type CreateMainProfileImportBatchRecord = {
  fileName: string;
  sheetName: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  importedProfileCount: number;
  importedCuttingSpecCount: number;
};

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
        cuttingSpecs: input.cuttingSpecs,
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
      .orderBy(asc(mainProfiles.linkedProductCode), asc(mainProfiles.code));
  }

  async createImportBatch(
    input: CreateMainProfileImportBatchRecord
  ): Promise<MainProfileImportBatch> {
    const [createdBatch] = await this.databaseClient
      .insert(mainProfileImportBatches)
      .values({
        id: randomUUID(),
        fileName: input.fileName,
        sheetName: input.sheetName,
        totalRowCount: input.totalRowCount,
        validRowCount: input.validRowCount,
        invalidRowCount: input.invalidRowCount,
        importedProfileCount: input.importedProfileCount,
        importedCuttingSpecCount: input.importedCuttingSpecCount
      })
      .returning();

    if (!createdBatch) {
      throw new Error("Failed to create main profile import batch.");
    }

    return createdBatch;
  }

  async upsertImportedProfiles(
    inputs: CreateMainProfileRecord[]
  ): Promise<MainProfile[]> {
    const upsertedProfiles: MainProfile[] = [];

    for (const input of inputs) {
      const [upsertedProfile] = await this.databaseClient
        .insert(mainProfiles)
        .values({
          id: randomUUID(),
          code: input.code,
          name: input.name,
          stockLengthMm: input.stockLengthMm,
          linkedProductCode: input.linkedProductCode,
          linkedProductName: input.linkedProductName,
          cuttingSpecs: input.cuttingSpecs,
          isActive: input.isActive,
          notes: input.notes
        })
        .onConflictDoUpdate({
          target: [mainProfiles.linkedProductCode, mainProfiles.code],
          set: {
            name: input.name,
            stockLengthMm: input.stockLengthMm,
            linkedProductCode: input.linkedProductCode,
            linkedProductName: input.linkedProductName,
            cuttingSpecs: input.cuttingSpecs,
            isActive: input.isActive,
            notes: input.notes,
            updatedAt: sql`now()`
          }
        })
        .returning();

      if (!upsertedProfile) {
        throw new Error(`Failed to upsert main profile "${input.code}".`);
      }

      upsertedProfiles.push(upsertedProfile);
    }

    return upsertedProfiles;
  }

  async findById(id: string): Promise<MainProfile | null> {
    const [profile] = await this.databaseClient
      .select()
      .from(mainProfiles)
      .where(eq(mainProfiles.id, id))
      .limit(1);

    return profile ?? null;
  }

  async findByLinkedProductAndCode(
    linkedProductCode: string,
    profileCode: string
  ): Promise<MainProfile | null> {
    const linked = linkedProductCode.trim().toUpperCase();
    const code = profileCode.trim().toUpperCase();

    const [profile] = await this.databaseClient
      .select()
      .from(mainProfiles)
      .where(
        and(
          eq(mainProfiles.linkedProductCode, linked),
          eq(mainProfiles.code, code)
        )
      )
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
