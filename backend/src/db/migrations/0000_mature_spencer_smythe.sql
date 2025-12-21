CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`system_prompt` text NOT NULL,
	`permission_mode` text DEFAULT 'askUser' NOT NULL,
	`max_turns` integer DEFAULT 100 NOT NULL,
	`builtin_tools` text DEFAULT '[]' NOT NULL,
	`mcp_servers` text DEFAULT '[]' NOT NULL,
	`allowed_work_item_types` text DEFAULT '["*"]' NOT NULL,
	`default_role` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_id` text,
	`work_item_id` text,
	`event_type` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`success_criteria` text DEFAULT '[]' NOT NULL,
	`linked_files` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`assigned_agents` text DEFAULT '{}' NOT NULL,
	`requires_approval` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`parent_id` text,
	`child_ids` text DEFAULT '[]' NOT NULL,
	`blocked_by` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`current_work_item_id` text,
	`current_role` text,
	`session_id` text NOT NULL,
	`spawned_at` integer NOT NULL,
	`context_window_used` integer DEFAULT 0 NOT NULL,
	`context_window_limit` integer DEFAULT 200000 NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`tool_calls` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE no action
);
