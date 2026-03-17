import {
  boolean,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { userRoles } from "@lemnixpro/shared-types";

export const schemaNamespace = "identity";

export const identitySchema = pgSchema(schemaNamespace);

export const userRoleEnum = identitySchema.enum("user_role", userRoles);

export const users = identitySchema.table(
  "users",
  {
    id: uuid("id").primaryKey().notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    role: userRoleEnum("role").notNull().default("VIEWER"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      mode: "string",
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    emailUniqueIndex: uniqueIndex("identity_users_email_unique").on(table.email)
  })
);

export type IdentityUser = typeof users.$inferSelect;
