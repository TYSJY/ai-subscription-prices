CREATE TABLE `price_sources` (
	`key` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`region` text NOT NULL,
	`payload` text,
	`observed_at` integer DEFAULT 0 NOT NULL,
	`attempted_at` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `service_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
