CREATE TABLE `announcement_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`announcement_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`read_at` text,
	`email_status` text DEFAULT 'not_required' NOT NULL,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `announcement_recipients_unique` ON `announcement_recipients` (`announcement_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`type` text NOT NULL,
	`target_type` text DEFAULT 'all' NOT NULL,
	`target_ids` text NOT NULL,
	`target_label` text,
	`attachment_key` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` text,
	`published_at` text,
	`email_notification` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcements_status_idx` ON `announcements` (`status`);--> statement-breakpoint
CREATE TABLE `attendance_bonus_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`late_days` integer DEFAULT 0 NOT NULL,
	`bonus_amount` integer DEFAULT 0 NOT NULL,
	`eligible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_bonus_snapshots_unique` ON `attendance_bonus_snapshots` (`employee_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`shift_id` text,
	`segment` text,
	`scheduled_start` text,
	`scheduled_end` text,
	`punch_in_at` text,
	`actual_working_start` text,
	`verification_completed_at` text,
	`verification_method` text DEFAULT 'none' NOT NULL,
	`verification_result` text DEFAULT 'pending' NOT NULL,
	`latitude` integer,
	`longitude` integer,
	`accuracy_meters` integer,
	`office_ip_matched` integer,
	`office_ip` text,
	`clock_out_at` text,
	`working_seconds` integer DEFAULT 0 NOT NULL,
	`break_seconds` integer DEFAULT 0 NOT NULL,
	`break_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`late_status` text DEFAULT 'pending_review' NOT NULL,
	`attendance_status` text DEFAULT 'present' NOT NULL,
	`auto_action` text,
	`review_status` text DEFAULT 'not_required' NOT NULL,
	`review_note` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`exception_history` text,
	`is_overtime` integer DEFAULT false NOT NULL,
	`overtime_request_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attendance_sessions_employee_date_idx` ON `attendance_sessions` (`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_status_idx` ON `attendance_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_review_idx` ON `attendance_sessions` (`review_status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before` text,
	`after` text,
	`ip` text,
	`user_agent` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE TABLE `breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`session_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`closed_by` text DEFAULT 'employee' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `breaks_employee_idx` ON `breaks` (`employee_id`);--> statement-breakpoint
CREATE INDEX `breaks_session_idx` ON `breaks` (`session_id`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'regular' NOT NULL,
	`parent_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `departments_name_idx` ON `departments` (`name`);--> statement-breakpoint
CREATE INDEX `departments_parent_idx` ON `departments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `designations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `designations_name_unique` ON `designations` (`name`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_unique` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_id`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'holiday' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_date_unique` ON `holidays` (`date`);--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`leave_type` text NOT NULL,
	`entitled` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_balances_unique` ON `leave_balances` (`employee_id`,`year`,`leave_type`);--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`total_days` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`attachment_key` text,
	`attachment_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_roster_change` integer DEFAULT false NOT NULL,
	`roster_change_id` text,
	`roster_update_mode` text,
	`roster_update_status` text DEFAULT 'none' NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leave_requests_employee_idx` ON `leave_requests` (`employee_id`);--> statement-breakpoint
CREATE INDEX `leave_requests_status_idx` ON `leave_requests` (`status`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link` text,
	`email_sent` integer DEFAULT false NOT NULL,
	`email_status` text DEFAULT 'not_required' NOT NULL,
	`email_error` text,
	`read_at` text,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`meta` text,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_employee_idx` ON `notifications` (`employee_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`employee_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_type_idx` ON `notifications` (`type`);--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text DEFAULT 'signup' NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_codes_email_idx` ON `otp_codes` (`email`);--> statement-breakpoint
CREATE INDEX `otp_codes_purpose_idx` ON `otp_codes` (`purpose`);--> statement-breakpoint
CREATE TABLE `overtime_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`requested_start` text,
	`requested_end` text,
	`requested_hours` integer DEFAULT 0 NOT NULL,
	`approved_start` text,
	`approved_end` text,
	`approved_hours` integer,
	`actual_start` text,
	`actual_end` text,
	`actual_hours` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `overtime_requests_employee_idx` ON `overtime_requests` (`employee_id`);--> statement-breakpoint
CREATE INDEX `overtime_requests_status_idx` ON `overtime_requests` (`status`);--> statement-breakpoint
CREATE TABLE `payroll_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`basic_salary` integer DEFAULT 0 NOT NULL,
	`allowances` integer DEFAULT 0 NOT NULL,
	`overtime_amount` integer DEFAULT 0 NOT NULL,
	`bonus_amount` integer DEFAULT 0 NOT NULL,
	`deductions` integer DEFAULT 0 NOT NULL,
	`net_payable` integer DEFAULT 0 NOT NULL,
	`working_days` integer DEFAULT 0 NOT NULL,
	`present_days` integer DEFAULT 0 NOT NULL,
	`late_days` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_records_unique` ON `payroll_records` (`employee_id`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `payroll_records_period_idx` ON `payroll_records` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `profile_update_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`fields` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_update_requests_employee_idx` ON `profile_update_requests` (`employee_id`);--> statement-breakpoint
CREATE TABLE `roster_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`roster_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`previous_shift_id` text,
	`new_shift_id` text,
	`previous_is_off` integer,
	`new_is_off` integer,
	`change_type` text DEFAULT 'publish' NOT NULL,
	`notified` integer DEFAULT false NOT NULL,
	`changed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roster_changes_roster_idx` ON `roster_changes` (`roster_id`);--> statement-breakpoint
CREATE INDEX `roster_changes_employee_idx` ON `roster_changes` (`employee_id`);--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`roster_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`shift_id` text,
	`is_off` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`roster_id`) REFERENCES `rosters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_entries_unique` ON `roster_entries` (`roster_id`,`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `roster_entries_employee_date_idx` ON `roster_entries` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` text,
	`published_at` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rosters_range_idx` ON `rosters` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `rosters_status_idx` ON `rosters` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`ends_next_day` integer DEFAULT false NOT NULL,
	`location_policy` text DEFAULT 'office' NOT NULL,
	`requires_office_verification` integer DEFAULT true NOT NULL,
	`segments` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_code_unique` ON `shifts` (`code`);--> statement-breakpoint
CREATE TABLE `signup_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_salary` integer,
	`reviewed_by` text,
	`review_note` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signup_requests_status_idx` ON `signup_requests` (`status`);--> statement-breakpoint
CREATE INDEX `signup_requests_user_idx` ON `signup_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `staffing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`shift_id` text,
	`min_staff` integer DEFAULT 0 NOT NULL,
	`day_of_week` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text DEFAULT 'manual' NOT NULL,
	`sheet_id` text,
	`tab` text,
	`status` text DEFAULT 'running' NOT NULL,
	`rows_processed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`triggered_by` text
);
--> statement-breakpoint
CREATE TABLE `task_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`submission_link` text,
	`notes` text,
	`attachment_key` text,
	`attachment_name` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`feedback` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_submissions_task_idx` ON `task_submissions` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`department_id` text,
	`assigned_employee_id` text,
	`reviewer_id` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assigned_date` text,
	`start_date` text,
	`due_date` text,
	`completed_at` text,
	`status` text DEFAULT 'yet_to_start' NOT NULL,
	`reference_link` text,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_employee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_code_unique` ON `tasks` (`task_code`);--> statement-breakpoint
CREATE INDEX `tasks_employee_idx` ON `tasks` (`assigned_employee_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_department_idx` ON `tasks` (`department_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`employee_code` text NOT NULL,
	`designation_id` text,
	`designation_label` text NOT NULL,
	`department_id` text,
	`sub_department_id` text,
	`reporting_manager_id` text,
	`joining_date` text NOT NULL,
	`avatar_key` text,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`designation_id`) REFERENCES `designations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sub_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_employee_code_unique` ON `users` (`employee_code`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department_id`);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);