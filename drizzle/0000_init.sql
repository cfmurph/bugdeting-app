CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linked_item_id` integer NOT NULL,
	`plaid_account_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`subtype` text,
	`mask` text,
	`currency` text DEFAULT 'CAD' NOT NULL,
	FOREIGN KEY (`linked_item_id`) REFERENCES `linked_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_item_plaid_uq` ON `accounts` (`linked_item_id`,`plaid_account_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_slug_uq` ON `categories` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `category_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`target_category_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `linked_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`plaid_item_id` text NOT NULL,
	`institution_id` text,
	`institution_name` text,
	`access_token_enc` text NOT NULL,
	`transactions_cursor` text,
	`last_successful_sync_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linked_items_plaid_item_id_unique` ON `linked_items` (`plaid_item_id`);--> statement-breakpoint
CREATE TABLE `projection_inputs` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`savings_goal_amount_cents` integer,
	`target_date` text,
	`income_schedule_json` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linked_item_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`error_message` text,
	`upserted_count` integer DEFAULT 0,
	FOREIGN KEY (`linked_item_id`) REFERENCES `linked_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`dedupe_key` text NOT NULL,
	`provider_transaction_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`iso_currency_code` text DEFAULT 'CAD' NOT NULL,
	`date` text NOT NULL,
	`name` text,
	`merchant_name` text,
	`pending` integer DEFAULT false NOT NULL,
	`provider_category_primary` text,
	`provider_category_detail` text,
	`user_category_id` integer,
	`is_transfer` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'plaid' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedupe_key_unique` ON `transactions` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
