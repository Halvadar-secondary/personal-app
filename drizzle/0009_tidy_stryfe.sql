CREATE TYPE "public"."profile_section" AS ENUM('about', 'focus', 'planning', 'style');--> statement-breakpoint
CREATE TABLE "profile_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"section" "profile_section" NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_sections" ADD CONSTRAINT "profile_sections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_sections_owner_section" ON "profile_sections" USING btree ("owner_id","section");