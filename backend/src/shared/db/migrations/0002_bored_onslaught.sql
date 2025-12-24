CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`github_repo_id` integer NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`html_url` text NOT NULL,
	`description` text,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`is_private` integer DEFAULT false NOT NULL,
	`sync_enabled` integer DEFAULT true NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sync_error` text,
	`last_sync_at` integer,
	`issue_labels_filter` text DEFAULT '[]' NOT NULL,
	`auto_assign_agents` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `github_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `work_items` ADD `repository_id` text REFERENCES repositories(id);--> statement-breakpoint
ALTER TABLE `work_items` ADD `github_issue_id` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `github_issue_number` integer;--> statement-breakpoint
ALTER TABLE `work_items` ADD `github_issue_url` text;