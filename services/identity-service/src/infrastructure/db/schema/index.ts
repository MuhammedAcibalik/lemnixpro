import {
  boolean,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import {
  facilityAccessRoles,
  type FacilityModuleKey
} from "@lemnixpro/shared-contracts";
import { userRoles } from "@lemnixpro/shared-types";

export const schemaNamespace = "identity";

export const identitySchema = pgSchema(schemaNamespace);

export const userRoleEnum = identitySchema.enum("user_role", userRoles);
export const facilityAccessRoleEnum = identitySchema.enum(
  "facility_access_role",
  facilityAccessRoles
);

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

export const userFacilityGrants = identitySchema.table(
  "user_facility_grants",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    facilityId: varchar("facility_id", { length: 128 }).notNull(),
    facilityRole: facilityAccessRoleEnum("facility_role").notNull(),
    moduleKeys: jsonb("module_keys").$type<FacilityModuleKey[]>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
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
    userFacilityUniqueIndex: uniqueIndex(
      "identity_user_facility_grants_user_facility_unique"
    ).on(table.userId, table.facilityId),
    userDefaultFacilityUniqueIndex: uniqueIndex(
      "identity_user_facility_grants_one_default_per_user"
    )
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
    userIdIndex: index("identity_user_facility_grants_user_id_idx").on(
      table.userId
    ),
    facilityIdIndex: index("identity_user_facility_grants_facility_id_idx").on(
      table.facilityId
    )
  })
);

export type UserFacilityGrantRecord =
  typeof userFacilityGrants.$inferSelect;
