CREATE TABLE `announcement_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`announcement_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`delivered` integer DEFAULT 0 NOT NULL,
	`email_status` text DEFAULT 'Not Required' NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `recipients_ann_idx` ON `announcement_recipients` (`announcement_id`);--> statement-breakpoint
CREATE INDEX `recipients_emp_idx` ON `announcement_recipients` (`employee_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`type` text NOT NULL,
	`audience` text NOT NULL,
	`audience_label` text NOT NULL,
	`attachment_key` text,
	`status` text DEFAULT 'Draft' NOT NULL,
	`publish_at` text,
	`published_at` text,
	`email_notification` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcements_status_idx` ON `announcements` (`status`);--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`shift_code` text NOT NULL,
	`scheduled_start` text,
	`punch_in` text,
	`actual_working_start` text,
	`verification_completed_at` text,
	`verification_method` text DEFAULT 'NONE' NOT NULL,
	`verification_result` text DEFAULT 'PENDING' NOT NULL,
	`gps_lat` real,
	`gps_lng` real,
	`gps_accuracy` real,
	`office_ip_match` integer,
	`clock_out` text,
	`total_working_seconds` integer DEFAULT 0 NOT NULL,
	`attendance_status` text DEFAULT 'Pending Review' NOT NULL,
	`late_status` text DEFAULT 'Pending Review' NOT NULL,
	`is_manual` integer DEFAULT 0 NOT NULL,
	`hr_review_status` text DEFAULT 'Not Reviewed' NOT NULL,
	`hr_review_note` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_emp_date_idx` ON `attendance_sessions` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `attendance_status_idx` ON `attendance_sessions` (`attendance_status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor`);--> statement-breakpoint
CREATE TABLE `break_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`closed_by` text DEFAULT 'EMPLOYEE' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `breaks_emp_date_idx` ON `break_sessions` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`protected` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_idx` ON `departments` (`name`);--> statement-breakpoint
CREATE INDEX `departments_order_idx` ON `departments` (`display_order`);--> statement-breakpoint
CREATE TABLE `designations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`department_id` text,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `designations_name_idx` ON `designations` (`name`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`email` text NOT NULL,
	`designation` text NOT NULL,
	`department_id` text NOT NULL,
	`sub_department_id` text,
	`reporting_manager` text,
	`joining_date` text NOT NULL,
	`shift_code` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`portal` text DEFAULT 'EMPLOYEE' NOT NULL,
	`role` text DEFAULT 'HR_VIEWER' NOT NULL,
	`base_salary` integer,
	`allowances` integer,
	`profile_photo_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_id_idx` ON `employees` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_idx` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_dept_idx` ON `employees` (`department_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`owner_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_key_idx` ON `files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_id`);--> statement-breakpoint
CREATE TABLE `leave_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`total_days` integer NOT NULL,
	`reason` text NOT NULL,
	`attachment_key` text,
	`attachment_name` text,
	`submitted_at` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`review_reason` text,
	`email_status` text DEFAULT 'Not Sent' NOT NULL,
	`approved_at` text,
	`decided_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_application_id_idx` ON `leave_applications` (`application_id`);--> statement-breakpoint
CREATE INDEX `leave_emp_idx` ON `leave_applications` (`employee_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`created_at` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`email_status` text DEFAULT 'Not Required' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_emp_idx` ON `notifications` (`employee_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`read`);--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_email_idx` ON `otp_codes` (`email`);--> statement-breakpoint
CREATE TABLE `overtime_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`requested_start` text,
	`requested_end` text,
	`requested_minutes` integer DEFAULT 0 NOT NULL,
	`approved_start` text,
	`approved_end` text,
	`approved_minutes` integer DEFAULT 0 NOT NULL,
	`actual_minutes` integer,
	`status` text DEFAULT 'Pending' NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text
);
--> statement-breakpoint
CREATE INDEX `overtime_emp_idx` ON `overtime_requests` (`employee_id`);--> statement-breakpoint
CREATE TABLE `roster_change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`roster_id` text NOT NULL,
	`roster_version` integer NOT NULL,
	`employee_id` text NOT NULL,
	`previous_shift` text NOT NULL,
	`updated_shift` text NOT NULL,
	`changed_by` text NOT NULL,
	`changed_at` text NOT NULL,
	`publish_status` text NOT NULL,
	`notification_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roster_log_roster_idx` ON `roster_change_log` (`roster_id`);--> statement-breakpoint
CREATE TABLE `roster_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`current_date` text NOT NULL,
	`current_shift` text NOT NULL,
	`requested_date` text NOT NULL,
	`requested_shift` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`update_mode` text,
	`roster_updated` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text
);
--> statement-breakpoint
CREATE INDEX `roster_requests_emp_idx` ON `roster_change_requests` (`employee_id`);--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`roster_id` text NOT NULL,
	`roster_version` integer NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`shift_code` text NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `roster_entries_roster_idx` ON `roster_entries` (`roster_id`);--> statement-breakpoint
CREATE INDEX `roster_entries_emp_date_idx` ON `roster_entries` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`publish_at` text,
	`published_at` text,
	`published_by` text,
	`notification_sent` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rosters_range_idx` ON `rosters` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `salary_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`month` text NOT NULL,
	`basic_salary` integer DEFAULT 0 NOT NULL,
	`allowances` integer DEFAULT 0 NOT NULL,
	`overtime_payment` integer DEFAULT 0 NOT NULL,
	`bonus_amount` integer DEFAULT 0 NOT NULL,
	`deductions` integer DEFAULT 0 NOT NULL,
	`net_payable` integer DEFAULT 0 NOT NULL,
	`late_days` integer DEFAULT 0 NOT NULL,
	`approved_overtime_minutes` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_emp_month_idx` ON `salary_records` (`employee_id`,`month`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_employee_idx` ON `sessions` (`employee_id`);--> statement-breakpoint
CREATE TABLE `signup_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`mobile` text NOT NULL,
	`employee_id` text NOT NULL,
	`designation` text NOT NULL,
	`email` text NOT NULL,
	`department_name` text NOT NULL,
	`sub_department_name` text,
	`reporting_manager` text,
	`joining_date` text NOT NULL,
	`password_hash` text,
	`submitted_at` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`review_note` text,
	`salary` integer,
	`decided_at` text,
	`decided_by` text
);
--> statement-breakpoint
CREATE INDEX `signups_status_idx` ON `signup_applications` (`status`);--> statement-breakpoint
CREATE TABLE `staffing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`shift_code` text NOT NULL,
	`min_employees` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staffing_dept_idx` ON `staffing_rules` (`department_id`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`records` integer DEFAULT 0 NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_created_idx` ON `sync_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `task_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`submitted_at` text NOT NULL,
	`submission_link` text,
	`file_key` text,
	`file_name` text,
	`note` text,
	`reviewer_feedback` text
);
--> statement-breakpoint
CREATE INDEX `submissions_task_idx` ON `task_submissions` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`department_name` text NOT NULL,
	`employee_id` text NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`assigned_date` text NOT NULL,
	`start_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'Yet to Start' NOT NULL,
	`reference_link` text,
	`attachment_key` text,
	`notes` text,
	`complete_date` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_task_id_idx` ON `tasks` (`task_id`);--> statement-breakpoint
CREATE INDEX `tasks_emp_idx` ON `tasks` (`employee_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`employee_id` text NOT NULL,
	`role` text DEFAULT 'HR_VIEWER' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_employee_idx` ON `users` (`employee_id`);