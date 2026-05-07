import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { facilityStatuses } from "@lemnixpro/shared-contracts";

export const schemaNamespace = "facility";

export const facilitySchema = pgSchema(schemaNamespace);

export const facilityStatusEnum = facilitySchema.enum(
  "facility_status",
  facilityStatuses
);

export const facilities = facilitySchema.table(
  "facilities",
  {
    id: uuid("id").primaryKey().notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: facilityStatusEnum("status").notNull().default("active"),
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
    codeUniqueIndex: uniqueIndex("facility_facilities_code_unique").on(
      table.code
    ),
    statusIndex: index("facility_facilities_status_idx").on(table.status),
    codeNotBlankCheck: check(
      "facility_facilities_code_not_blank",
      sql`length(trim(${table.code})) > 0`
    ),
    codeUppercaseCheck: check(
      "facility_facilities_code_uppercase",
      sql`${table.code} = upper(${table.code})`
    ),
    nameNotBlankCheck: check(
      "facility_facilities_name_not_blank",
      sql`length(trim(${table.name})) > 0`
    )
  })
);

export type FacilityRecord = typeof facilities.$inferSelect;
