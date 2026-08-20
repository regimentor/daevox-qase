-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "TestCasePriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TestCaseSeverity" AS ENUM ('BLOCKER', 'CRITICAL', 'MAJOR', 'NORMAL', 'MINOR', 'TRIVIAL');

-- CreateEnum
CREATE TYPE "TestCaseType" AS ENUM ('FUNCTIONAL', 'SMOKE', 'REGRESSION', 'SECURITY', 'PERFORMANCE', 'USABILITY', 'COMPATIBILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('MANUAL', 'TO_AUTOMATE', 'AUTOMATED', 'CANNOT_AUTOMATE');

-- CreateEnum
CREATE TYPE "TestRunStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('PASSED', 'FAILED', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "next_case_number" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_suites" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "case_number" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "preconditions" TEXT,
    "postconditions" TEXT,
    "priority" "TestCasePriority" NOT NULL,
    "severity" "TestCaseSeverity" NOT NULL,
    "type" "TestCaseType" NOT NULL,
    "automation_status" "AutomationStatus" NOT NULL,
    "assignee_id" UUID,
    "estimated_duration_seconds" INTEGER,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_steps" (
    "id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "test_data" TEXT,
    "expected_result" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_tags" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_case_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plan_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_plan_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_plan_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "test_plan_id" UUID,
    "environment_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "status" "TestRunStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_run_cases" (
    "id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_test_case_id" UUID NOT NULL,
    "assignee_id" UUID,
    "case_number" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "preconditions" TEXT,
    "postconditions" TEXT,
    "priority" "TestCasePriority" NOT NULL,
    "severity" "TestCaseSeverity" NOT NULL,
    "type" "TestCaseType" NOT NULL,
    "automation_status" "AutomationStatus" NOT NULL,
    "estimated_duration_seconds" INTEGER,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_run_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_run_case_steps" (
    "id" UUID NOT NULL,
    "test_run_case_id" UUID NOT NULL,
    "source_test_step_id" UUID,
    "position" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "test_data" TEXT,
    "expected_result" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_run_case_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" UUID NOT NULL,
    "test_run_case_id" UUID NOT NULL,
    "status" "TestResultStatus" NOT NULL,
    "executed_by" UUID NOT NULL,
    "comment" TEXT,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_step_results" (
    "id" UUID NOT NULL,
    "test_result_id" UUID NOT NULL,
    "test_run_case_id" UUID NOT NULL,
    "test_run_case_step_id" UUID NOT NULL,
    "status" "TestResultStatus" NOT NULL,
    "actual_result" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_step_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_result_attachments" (
    "id" UUID NOT NULL,
    "test_result_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_result_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_deletions" (
    "id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "object_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_code_key" ON "projects"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "test_suites_project_id_idx" ON "test_suites"("project_id");

-- CreateIndex
CREATE INDEX "test_suites_parent_id_idx" ON "test_suites"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_suites_id_project_id_key" ON "test_suites"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_suites_project_id_parent_id_position_key" ON "test_suites"("project_id", "parent_id", "position");

-- CreateIndex
CREATE INDEX "test_cases_project_id_idx" ON "test_cases"("project_id");

-- CreateIndex
CREATE INDEX "test_cases_suite_id_idx" ON "test_cases"("suite_id");

-- CreateIndex
CREATE INDEX "test_cases_assignee_id_idx" ON "test_cases"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_id_project_id_key" ON "test_cases"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_project_id_case_number_key" ON "test_cases"("project_id", "case_number");

-- CreateIndex
CREATE INDEX "test_steps_test_case_id_idx" ON "test_steps"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_steps_id_test_case_id_key" ON "test_steps"("id", "test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_steps_test_case_id_position_key" ON "test_steps"("test_case_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tags_id_project_id_key" ON "tags"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_project_id_name_key" ON "tags"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "test_case_tags_test_case_id_tag_id_key" ON "test_case_tags"("test_case_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_plans_id_project_id_key" ON "test_plans"("id", "project_id");

-- CreateIndex
CREATE INDEX "test_plan_cases_test_plan_id_idx" ON "test_plan_cases"("test_plan_id");

-- CreateIndex
CREATE INDEX "test_plan_cases_test_case_id_idx" ON "test_plan_cases"("test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_plan_cases_test_plan_id_test_case_id_key" ON "test_plan_cases"("test_plan_id", "test_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_plan_cases_test_plan_id_position_key" ON "test_plan_cases"("test_plan_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "environments_id_project_id_key" ON "environments"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "environments_project_id_name_key" ON "environments"("project_id", "name");

-- CreateIndex
CREATE INDEX "test_runs_project_id_idx" ON "test_runs"("project_id");

-- CreateIndex
CREATE INDEX "test_runs_status_idx" ON "test_runs"("status");

-- CreateIndex
CREATE INDEX "test_runs_created_at_idx" ON "test_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_runs_id_project_id_key" ON "test_runs"("id", "project_id");

-- CreateIndex
CREATE INDEX "test_run_cases_test_run_id_idx" ON "test_run_cases"("test_run_id");

-- CreateIndex
CREATE INDEX "test_run_cases_assignee_id_idx" ON "test_run_cases"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_run_cases_id_test_run_id_key" ON "test_run_cases"("id", "test_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_run_cases_test_run_id_position_key" ON "test_run_cases"("test_run_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "test_run_case_steps_id_test_run_case_id_key" ON "test_run_case_steps"("id", "test_run_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_run_case_steps_test_run_case_id_position_key" ON "test_run_case_steps"("test_run_case_id", "position");

-- CreateIndex
CREATE INDEX "test_results_test_run_case_id_idx" ON "test_results"("test_run_case_id");

-- CreateIndex
CREATE INDEX "test_results_created_at_idx" ON "test_results"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_results_id_test_run_case_id_key" ON "test_results"("id", "test_run_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_step_results_test_result_id_test_run_case_step_id_key" ON "test_step_results"("test_result_id", "test_run_case_step_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_workspace_id_idx" ON "attachments"("workspace_id");

-- CreateIndex
CREATE INDEX "attachments_status_created_at_idx" ON "attachments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_result_attachments_test_result_id_attachment_id_key" ON "test_result_attachments"("test_result_id", "attachment_id");

-- CreateIndex
CREATE INDEX "object_deletions_next_attempt_at_idx" ON "object_deletions"("next_attempt_at");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_parent_id_project_id_fkey" FOREIGN KEY ("parent_id", "project_id") REFERENCES "test_suites"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_suite_id_project_id_fkey" FOREIGN KEY ("suite_id", "project_id") REFERENCES "test_suites"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_steps" ADD CONSTRAINT "test_steps_test_case_id_project_id_fkey" FOREIGN KEY ("test_case_id", "project_id") REFERENCES "test_cases"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_tags" ADD CONSTRAINT "test_case_tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_tags" ADD CONSTRAINT "test_case_tags_test_case_id_project_id_fkey" FOREIGN KEY ("test_case_id", "project_id") REFERENCES "test_cases"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_tags" ADD CONSTRAINT "test_case_tags_tag_id_project_id_fkey" FOREIGN KEY ("tag_id", "project_id") REFERENCES "tags"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_test_plan_id_project_id_fkey" FOREIGN KEY ("test_plan_id", "project_id") REFERENCES "test_plans"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_test_case_id_project_id_fkey" FOREIGN KEY ("test_case_id", "project_id") REFERENCES "test_cases"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_test_plan_id_project_id_fkey" FOREIGN KEY ("test_plan_id", "project_id") REFERENCES "test_plans"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_environment_id_project_id_fkey" FOREIGN KEY ("environment_id", "project_id") REFERENCES "environments"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_test_run_id_project_id_fkey" FOREIGN KEY ("test_run_id", "project_id") REFERENCES "test_runs"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_source_test_case_id_project_id_fkey" FOREIGN KEY ("source_test_case_id", "project_id") REFERENCES "test_cases"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_case_steps" ADD CONSTRAINT "test_run_case_steps_test_run_case_id_fkey" FOREIGN KEY ("test_run_case_id") REFERENCES "test_run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_run_case_id_fkey" FOREIGN KEY ("test_run_case_id") REFERENCES "test_run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_step_results" ADD CONSTRAINT "test_step_results_test_result_id_test_run_case_id_fkey" FOREIGN KEY ("test_result_id", "test_run_case_id") REFERENCES "test_results"("id", "test_run_case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_step_results" ADD CONSTRAINT "test_step_results_test_run_case_id_fkey" FOREIGN KEY ("test_run_case_id") REFERENCES "test_run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_step_results" ADD CONSTRAINT "test_step_results_test_run_case_step_id_test_run_case_id_fkey" FOREIGN KEY ("test_run_case_step_id", "test_run_case_id") REFERENCES "test_run_case_steps"("id", "test_run_case_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result_attachments" ADD CONSTRAINT "test_result_attachments_test_result_id_fkey" FOREIGN KEY ("test_result_id") REFERENCES "test_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_result_attachments" ADD CONSTRAINT "test_result_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain check constraints not expressible in Prisma schema.
ALTER TABLE "projects" ADD CONSTRAINT "projects_code_format_check"
  CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,31}$');
ALTER TABLE "projects" ADD CONSTRAINT "projects_next_case_number_check"
  CHECK ("next_case_number" > 0);
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_position_check" CHECK ("position" >= 0);
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_case_number_check" CHECK ("case_number" > 0);
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_duration_check"
  CHECK ("estimated_duration_seconds" IS NULL OR "estimated_duration_seconds" >= 0);
ALTER TABLE "test_steps" ADD CONSTRAINT "test_steps_position_check" CHECK ("position" >= 0);
ALTER TABLE "test_plan_cases" ADD CONSTRAINT "test_plan_cases_position_check" CHECK ("position" >= 0);
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_position_check" CHECK ("position" >= 0);
ALTER TABLE "test_run_cases" ADD CONSTRAINT "test_run_cases_duration_check"
  CHECK ("estimated_duration_seconds" IS NULL OR "estimated_duration_seconds" >= 0);
ALTER TABLE "test_run_case_steps" ADD CONSTRAINT "test_run_case_steps_position_check" CHECK ("position" >= 0);
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_duration_check"
  CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_size_check" CHECK ("size" >= 0);

-- Prisma's nullable compound unique does not cover root siblings.
CREATE UNIQUE INDEX "test_suites_root_position_key"
  ON "test_suites" ("project_id", "position") WHERE "parent_id" IS NULL;
CREATE INDEX "test_cases_active_project_idx"
  ON "test_cases" ("project_id", "case_number", "id") WHERE "archived_at" IS NULL;
CREATE INDEX "test_runs_project_created_desc_idx"
  ON "test_runs" ("project_id", "created_at" DESC, "id" DESC);
CREATE INDEX "test_results_run_case_latest_idx"
  ON "test_results" ("test_run_case_id", "created_at" DESC, "id" DESC);

-- Snapshot payload may never be rewritten after creation; assignment is the sole mutable field.
CREATE FUNCTION protect_test_run_case_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."test_run_id", NEW."project_id", NEW."source_test_case_id", NEW."case_number",
      NEW."title", NEW."description", NEW."preconditions", NEW."postconditions",
      NEW."priority", NEW."severity", NEW."type", NEW."automation_status",
      NEW."estimated_duration_seconds", NEW."position", NEW."created_at")
     IS DISTINCT FROM
     (OLD."test_run_id", OLD."project_id", OLD."source_test_case_id", OLD."case_number",
      OLD."title", OLD."description", OLD."preconditions", OLD."postconditions",
      OLD."priority", OLD."severity", OLD."type", OLD."automation_status",
      OLD."estimated_duration_seconds", OLD."position", OLD."created_at") THEN
    RAISE EXCEPTION 'test run case snapshot is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "test_run_case_snapshot_immutable"
  BEFORE UPDATE ON "test_run_cases" FOR EACH ROW EXECUTE FUNCTION protect_test_run_case_snapshot();

CREATE FUNCTION protect_test_run_case_step_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'test run case step snapshot is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "test_run_case_step_snapshot_immutable"
  BEFORE UPDATE ON "test_run_case_steps" FOR EACH ROW EXECUTE FUNCTION protect_test_run_case_step_snapshot();
