-- CreateEnum
CREATE TYPE "ArchiveOperationKind" AS ENUM ('SUITE', 'CASE');

-- CreateTable
CREATE TABLE "archive_operations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "ArchiveOperationKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_operations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "test_suites" ADD COLUMN "archived_at" TIMESTAMPTZ(3),
ADD COLUMN "archive_operation_id" UUID;

ALTER TABLE "test_cases" ADD COLUMN "archive_operation_id" UUID;

ALTER TABLE "test_plan_cases" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archived_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "test_plan_source_suites" (
    "project_id" UUID NOT NULL,
    "test_plan_id" UUID NOT NULL,
    "test_suite_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_plan_source_suites_pkey" PRIMARY KEY ("test_plan_id", "test_suite_id")
);

CREATE TABLE "test_plan_case_sources" (
    "project_id" UUID NOT NULL,
    "test_plan_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "source_suite_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_plan_case_sources_pkey" PRIMARY KEY ("test_plan_id", "test_case_id", "source_suite_id")
);

-- CreateIndex
CREATE INDEX "archive_operations_project_id_kind_idx" ON "archive_operations"("project_id", "kind");
CREATE INDEX "test_suites_archive_operation_id_idx" ON "test_suites"("archive_operation_id");
CREATE INDEX "test_cases_archive_operation_id_idx" ON "test_cases"("archive_operation_id");
CREATE INDEX "test_plan_cases_test_plan_id_archived_at_idx" ON "test_plan_cases"("test_plan_id", "archived_at");
CREATE INDEX "test_plan_source_suites_test_suite_id_project_id_idx" ON "test_plan_source_suites"("test_suite_id", "project_id");
CREATE INDEX "test_plan_case_sources_source_suite_id_project_id_idx" ON "test_plan_case_sources"("source_suite_id", "project_id");

-- AddForeignKey
ALTER TABLE "archive_operations" ADD CONSTRAINT "archive_operations_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_archive_operation_id_fkey"
    FOREIGN KEY ("archive_operation_id") REFERENCES "archive_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_archive_operation_id_fkey"
    FOREIGN KEY ("archive_operation_id") REFERENCES "archive_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "test_plan_source_suites" ADD CONSTRAINT "test_plan_source_suites_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_source_suites" ADD CONSTRAINT "test_plan_source_suites_test_plan_id_project_id_fkey"
    FOREIGN KEY ("test_plan_id", "project_id") REFERENCES "test_plans"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_source_suites" ADD CONSTRAINT "test_plan_source_suites_test_suite_id_project_id_fkey"
    FOREIGN KEY ("test_suite_id", "project_id") REFERENCES "test_suites"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_case_sources" ADD CONSTRAINT "test_plan_case_sources_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_case_sources" ADD CONSTRAINT "test_plan_case_sources_test_plan_id_test_case_id_fkey"
    FOREIGN KEY ("test_plan_id", "test_case_id") REFERENCES "test_plan_cases"("test_plan_id", "test_case_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_case_sources" ADD CONSTRAINT "test_plan_case_sources_test_case_id_project_id_fkey"
    FOREIGN KEY ("test_case_id", "project_id") REFERENCES "test_cases"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_plan_case_sources" ADD CONSTRAINT "test_plan_case_sources_source_suite_id_project_id_fkey"
    FOREIGN KEY ("source_suite_id", "project_id") REFERENCES "test_suites"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
