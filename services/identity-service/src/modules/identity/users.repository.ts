import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { inArray } from "drizzle-orm";

import type { UserRole } from "@lemnixpro/shared-types";

import { DATABASE_CLIENT } from "../../infrastructure/db/database.tokens";
import type { IdentityDatabase } from "../../infrastructure/db/client";
import { users, type IdentityUser } from "../../infrastructure/db/schema";

type CreateUserInput = {
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
};

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly databaseClient: IdentityDatabase
  ) {}

  async findByEmail(email: string): Promise<IdentityUser | null> {
    const result = await this.databaseClient.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.email, email)
    });

    return result ?? null;
  }

  async findById(id: string): Promise<IdentityUser | null> {
    const result = await this.databaseClient.query.users.findFirst({
      where: (table, { eq: equals }) => equals(table.id, id)
    });

    return result ?? null;
  }

  async hasAdmin(): Promise<boolean> {
    const admin = await this.databaseClient.query.users.findFirst({
      where: (table) => inArray(table.role, ["SUPER_ADMIN", "ADMIN"])
    });

    return admin !== undefined;
  }

  async create(input: CreateUserInput): Promise<IdentityUser> {
    const [createdUser] = await this.databaseClient
      .insert(users)
      .values({
        id: randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        role: input.role,
        isActive: input.isActive
      })
      .returning();

    if (!createdUser) {
      throw new Error("Failed to create identity user.");
    }

    return createdUser;
  }
}
