CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_hash_unique` ON `players` (`token_hash`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`player_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`kind` text NOT NULL,
	`level` integer NOT NULL,
	`ruleset` text NOT NULL,
	`campaign_id` text,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`completed_at` integer,
	`elapsed_ms` integer,
	`active_ms` integer,
	`ending` text,
	`deaths` integer DEFAULT 0 NOT NULL,
	`assisted` integer DEFAULT 0 NOT NULL,
	`completion_nonce` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_player` ON `runs` (`player_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `runs_campaign` ON `runs` (`campaign_id`,`level`,`completed_at`);--> statement-breakpoint
CREATE INDEX `runs_expiry` ON `runs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `scores` (
	`player_id` text NOT NULL,
	`difficulty` text NOT NULL,
	`kind` text NOT NULL,
	`level` integer NOT NULL,
	`ruleset` text NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`achieved_at` integer NOT NULL,
	`run_id` text NOT NULL,
	`ending` text,
	`deaths` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`player_id`, `difficulty`, `kind`, `level`, `ruleset`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scores_board` ON `scores` (`ruleset`,`difficulty`,`kind`,`level`,`elapsed_ms`,`achieved_at`,`player_id`);