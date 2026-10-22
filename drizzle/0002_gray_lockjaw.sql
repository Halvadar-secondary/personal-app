CREATE TYPE "public"."achievement_status" AS ENUM('backlog', 'active', 'done');--> statement-breakpoint
CREATE TYPE "public"."change_op" AS ENUM('create', 'update', 'delete', 'restore');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"area_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"status" "achievement_status" DEFAULT 'backlog' NOT NULL,
	"deadline" date,
	"completed_at" timestamp with time zone,
	"sort_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"emoji" text,
	"cover" jsonb,
	"description" text,
	"sort_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"task_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer,
	"metrics" jsonb,
	"note" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_categories" (
	"task_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	CONSTRAINT "task_categories_task_id_category_id_pk" PRIMARY KEY("task_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"occurrence_date" date NOT NULL,
	"xp_awarded" integer NOT NULL,
	CONSTRAINT "task_completions_task_id_occurrence_date_unique" UNIQUE("task_id","occurrence_date")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"achievement_id" uuid,
	"area_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"effort" smallint DEFAULT 2 NOT NULL,
	"deadline" date,
	"recurrence" jsonb,
	"completed_at" timestamp with time zone,
	"sort_key" text NOT NULL,
	CONSTRAINT "tasks_effort_range" CHECK ("tasks"."effort" between 1 and 5),
	CONSTRAINT "tasks_area_needs_achievement" CHECK ("tasks"."achievement_id" is not null or "tasks"."area_id" is null)
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"owner_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" "change_op" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_batch" uuid,
	CONSTRAINT "change_events_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_entries" ADD CONSTRAINT "practice_entries_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_entries" ADD CONSTRAINT "practice_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_owner_id_area_id_status_sort_key_index" ON "achievements" USING btree ("owner_id","area_id","status","sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_owner_name_unique" ON "categories" USING btree ("owner_id",lower("name")) WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_owner_id_achievement_id_sort_key_index" ON "tasks" USING btree ("owner_id","achievement_id","sort_key");--> statement-breakpoint
CREATE INDEX "change_events_owner_id_batch_id_index" ON "change_events" USING btree ("owner_id","batch_id");--> statement-breakpoint
CREATE INDEX "change_events_owner_id_entity_type_entity_id_index" ON "change_events" USING btree ("owner_id","entity_type","entity_id");