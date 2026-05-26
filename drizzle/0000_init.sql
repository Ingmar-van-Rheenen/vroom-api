CREATE TYPE "public"."groep_rol" AS ENUM('admin', 'lid');--> statement-breakpoint
CREATE TYPE "public"."groep_type" AS ENUM('solo', 'stel', 'familie', 'anders');--> statement-breakpoint
CREATE TABLE "groep_leden" (
	"groep_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rol" "groep_rol" DEFAULT 'lid' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groep_leden_groep_id_user_id_pk" PRIMARY KEY("groep_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groepen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"naam" text NOT NULL,
	"type" "groep_type" DEFAULT 'solo' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"naam" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groep_leden" ADD CONSTRAINT "groep_leden_groep_id_groepen_id_fk" FOREIGN KEY ("groep_id") REFERENCES "public"."groepen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groep_leden" ADD CONSTRAINT "groep_leden_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groepen" ADD CONSTRAINT "groepen_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groep_leden_user_id_idx" ON "groep_leden" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_unique" ON "users" USING btree (lower("email"));