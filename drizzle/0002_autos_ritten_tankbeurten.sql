CREATE TABLE "autos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groep_id" uuid NOT NULL,
	"naam" text NOT NULL,
	"merk" text,
	"kenteken" text,
	"km_per_liter" double precision NOT NULL,
	"prijs_per_liter" double precision NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ritten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auto_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"datum" timestamp with time zone NOT NULL,
	"start_lat" double precision,
	"start_lng" double precision,
	"eind_lat" double precision,
	"eind_lng" double precision,
	"km" double precision NOT NULL,
	"gps_track" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tankbeurten" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auto_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"datum" timestamp with time zone NOT NULL,
	"liters" double precision NOT NULL,
	"prijs_per_liter" double precision NOT NULL,
	"totaal" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "autos" ADD CONSTRAINT "autos_groep_id_groepen_id_fk" FOREIGN KEY ("groep_id") REFERENCES "public"."groepen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritten" ADD CONSTRAINT "ritten_auto_id_autos_id_fk" FOREIGN KEY ("auto_id") REFERENCES "public"."autos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritten" ADD CONSTRAINT "ritten_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankbeurten" ADD CONSTRAINT "tankbeurten_auto_id_autos_id_fk" FOREIGN KEY ("auto_id") REFERENCES "public"."autos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankbeurten" ADD CONSTRAINT "tankbeurten_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autos_groep_id_idx" ON "autos" USING btree ("groep_id");--> statement-breakpoint
CREATE INDEX "ritten_auto_id_idx" ON "ritten" USING btree ("auto_id");--> statement-breakpoint
CREATE INDEX "ritten_user_id_idx" ON "ritten" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tankbeurten_auto_id_idx" ON "tankbeurten" USING btree ("auto_id");--> statement-breakpoint
CREATE INDEX "tankbeurten_user_id_idx" ON "tankbeurten" USING btree ("user_id");