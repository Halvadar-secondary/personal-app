CREATE TYPE "public"."goal_status" AS ENUM('active', 'done');--> statement-breakpoint
CREATE TYPE "public"."plan_section" AS ENUM('work', 'spare');--> statement-breakpoint
CREATE TABLE "day_plans" (
	"owner_id" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_plans_owner_id_day_pk" PRIMARY KEY("owner_id","day")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"notes" text,
	"deadline" date,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"completed_at" timestamp with time zone,
	"sort_key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_entries" ADD COLUMN "amount" real;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "planned_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "planned_week" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "plan_section" "plan_section";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "plan_sort_key" text COLLATE "C";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "target_amount" real;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "target_unit" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_time" text DEFAULT '21:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "last_reminder_on" date;--> statement-breakpoint
ALTER TABLE "day_plans" ADD CONSTRAINT "day_plans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_owner_id_goal_id_index" ON "achievements" USING btree ("owner_id","goal_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_id_planned_on_index" ON "tasks" USING btree ("owner_id","planned_on");--> statement-breakpoint
CREATE INDEX "tasks_owner_id_planned_week_index" ON "tasks" USING btree ("owner_id","planned_week");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_one_plan" CHECK ("tasks"."planned_on" is null or "tasks"."planned_week" is null);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repeat_unplanned" CHECK ("tasks"."recurrence" is null or ("tasks"."planned_on" is null and "tasks"."planned_week" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_target_pair" CHECK (("tasks"."target_amount" is null) = ("tasks"."target_unit" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_target_positive" CHECK ("tasks"."target_amount" is null or "tasks"."target_amount" > 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_target_once" CHECK ("tasks"."target_amount" is null or "tasks"."recurrence" is null);