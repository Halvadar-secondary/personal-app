CREATE TABLE "oauth_clients_seen" (
	"owner_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_clients_seen_owner_id_client_id_pk" PRIMARY KEY("owner_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "oauth_clients_seen" ADD CONSTRAINT "oauth_clients_seen_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;