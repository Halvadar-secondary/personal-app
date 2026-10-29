CREATE TYPE "public"."tracker_direction" AS ENUM('less', 'more');--> statement-breakpoint
CREATE TABLE "tracker_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tracker_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"intensity" smallint,
	"note" text,
	CONSTRAINT "tracker_moments_intensity_range" CHECK ("tracker_moments"."intensity" is null or "tracker_moments"."intensity" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"emoji" text,
	"direction" "tracker_direction" DEFAULT 'less' NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_key" text COLLATE "C" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracker_moments" ADD CONSTRAINT "tracker_moments_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_moments" ADD CONSTRAINT "tracker_moments_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracker_moments_owner_id_tracker_id_at_index" ON "tracker_moments" USING btree ("owner_id","tracker_id","at");