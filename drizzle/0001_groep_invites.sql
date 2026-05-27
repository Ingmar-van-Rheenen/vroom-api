CREATE TABLE "groep_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groep_id" uuid NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groep_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "groep_invites" ADD CONSTRAINT "groep_invites_groep_id_groepen_id_fk" FOREIGN KEY ("groep_id") REFERENCES "public"."groepen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groep_invites" ADD CONSTRAINT "groep_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groep_invites" ADD CONSTRAINT "groep_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groep_invites_groep_id_idx" ON "groep_invites" USING btree ("groep_id");--> statement-breakpoint
CREATE INDEX "groep_invites_email_idx" ON "groep_invites" USING btree (lower("email"));