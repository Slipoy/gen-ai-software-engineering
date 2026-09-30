CREATE TABLE `classification_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`previous_category` text NOT NULL,
	`previous_priority` text NOT NULL,
	`confidence` real,
	`reasoning` text,
	`keywords_found` text NOT NULL,
	`applied` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `classification_decisions_ticket_idx` ON `classification_decisions` (`ticket_id`,`at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`resolved_at` text,
	`assigned_to` text,
	`tags` text NOT NULL,
	`metadata_source` text NOT NULL,
	`metadata_browser` text,
	`metadata_device_type` text,
	`classification` text,
	`manual_override` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tickets_category_idx` ON `tickets` (`category`);--> statement-breakpoint
CREATE INDEX `tickets_priority_idx` ON `tickets` (`priority`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);--> statement-breakpoint
CREATE INDEX `tickets_assigned_to_idx` ON `tickets` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `tickets_customer_email_idx` ON `tickets` (`customer_email`);--> statement-breakpoint
CREATE INDEX `tickets_created_at_idx` ON `tickets` (`created_at`);