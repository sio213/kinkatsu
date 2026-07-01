UPDATE `reminders` SET `interval_days` = 1 WHERE `kind` = 'daily';--> statement-breakpoint
UPDATE `reminders` SET `kind` = 'interval' WHERE `kind` = 'daily';--> statement-breakpoint
UPDATE `reminders` SET `interval_days` = 7 WHERE `kind` = 'weekly';--> statement-breakpoint
UPDATE `reminders` SET `kind` = 'weekly' WHERE `kind` = 'biweekly';--> statement-breakpoint
UPDATE `reminders` SET `interval_months` = 1 WHERE `kind` = 'monthly';--> statement-breakpoint
UPDATE `reminders` SET `kind` = 'monthly' WHERE `kind` = 'month_interval';