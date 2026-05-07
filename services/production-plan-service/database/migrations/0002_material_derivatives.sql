ALTER TABLE "production_plan"."production_plan_rows" ADD COLUMN "material_color" varchar(40);
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows" ADD COLUMN "material_size" varchar(20);
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows" ADD COLUMN "department_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "production_plan"."production_plan_rows" ADD COLUMN "priority_level" integer;
