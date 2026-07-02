ALTER TABLE `exercises` ADD `category` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `exercises` ADD `favorite` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `exercises` ADD `note` text;--> statement-breakpoint
ALTER TABLE `exercises` ADD `source` text NOT NULL DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE `exercises` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `exercises` ADD `updated_at` integer;--> statement-breakpoint
DELETE FROM `exercises` WHERE `name` IN ('テストエクササイズ1', 'テストエクササイズ2');
