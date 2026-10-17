-- Email delivery was removed: course reminders are in-app notifications now.
ALTER TABLE "teacher_reminders" DROP CONSTRAINT IF EXISTS "teacher_reminders_delivery_id_email_deliveries_id_fk";--> statement-breakpoint
ALTER TABLE "teacher_reminders" DROP COLUMN IF EXISTS "delivery_id";--> statement-breakpoint
DROP TABLE IF EXISTS "email_deliveries";
