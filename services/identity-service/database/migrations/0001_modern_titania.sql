CREATE TYPE "identity"."facility_access_role" AS ENUM('SUPER_ADMIN', 'CENTRAL_PLANNER', 'FACILITY_ADMIN', 'FACILITY_PLANNER', 'FACILITY_OPERATOR', 'FACILITY_VIEWER');--> statement-breakpoint
ALTER TYPE "identity"."user_role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';--> statement-breakpoint
ALTER TYPE "identity"."user_role" ADD VALUE IF NOT EXISTS 'CENTRAL_PLANNER';--> statement-breakpoint
CREATE TABLE "identity"."user_facility_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"facility_id" varchar(128) NOT NULL,
	"facility_role" "identity"."facility_access_role" NOT NULL,
	"module_keys" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."user_facility_grants" ADD CONSTRAINT "user_facility_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_facility_grants_user_facility_unique" ON "identity"."user_facility_grants" USING btree ("user_id","facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_facility_grants_one_default_per_user" ON "identity"."user_facility_grants" USING btree ("user_id") WHERE "identity"."user_facility_grants"."is_default" = true;--> statement-breakpoint
CREATE INDEX "identity_user_facility_grants_user_id_idx" ON "identity"."user_facility_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_user_facility_grants_facility_id_idx" ON "identity"."user_facility_grants" USING btree ("facility_id");
