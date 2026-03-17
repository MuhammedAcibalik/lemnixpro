CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
CREATE TYPE "identity"."user_role" AS ENUM('ADMIN', 'PLANNER', 'VIEWER');--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" "identity"."user_role" DEFAULT 'VIEWER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identity_users_email_unique" ON "identity"."users" USING btree ("email");
