CREATE SCHEMA "master_data";
--> statement-breakpoint
CREATE TABLE "master_data"."main_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"stock_length_mm" integer NOT NULL,
	"linked_product_code" varchar(100) NOT NULL,
	"linked_product_name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_data_main_profiles_stock_length_positive" CHECK ("master_data"."main_profiles"."stock_length_mm" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "master_data_main_profiles_code_unique" ON "master_data"."main_profiles" USING btree ("code");