-- AlterTable
ALTER TABLE "test_suites"
  ADD COLUMN "preconditions" TEXT,
  ADD COLUMN "postconditions" TEXT;

-- CreateTable
CREATE TABLE "test_run_case_suite_metadata" (
    "id" UUID NOT NULL,
    "test_run_case_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "suite_title" VARCHAR(500) NOT NULL,
    "preconditions" TEXT,
    "postconditions" TEXT,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_run_case_suite_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_run_case_suite_metadata_id_test_run_case_id_key"
  ON "test_run_case_suite_metadata"("id", "test_run_case_id");
CREATE UNIQUE INDEX "test_run_case_suite_metadata_test_run_case_id_position_key"
  ON "test_run_case_suite_metadata"("test_run_case_id", "position");
CREATE INDEX "test_run_case_suite_metadata_test_run_case_id_idx"
  ON "test_run_case_suite_metadata"("test_run_case_id");

-- AddForeignKey
ALTER TABLE "test_run_case_suite_metadata"
  ADD CONSTRAINT "test_run_case_suite_metadata_test_run_case_id_fkey"
  FOREIGN KEY ("test_run_case_id") REFERENCES "test_run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "test_run_case_suite_metadata"
  ADD CONSTRAINT "test_run_case_suite_metadata_position_check" CHECK ("position" >= 0);

-- Suite metadata belongs to the immutable run-case snapshot and cannot be edited.
CREATE FUNCTION protect_test_run_case_suite_metadata_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."test_run_case_id", NEW."suite_id", NEW."suite_title", NEW."preconditions",
      NEW."postconditions", NEW."position", NEW."created_at", NEW."updated_at")
     IS DISTINCT FROM
     (OLD."test_run_case_id", OLD."suite_id", OLD."suite_title", OLD."preconditions",
      OLD."postconditions", OLD."position", OLD."created_at", OLD."updated_at") THEN
    RAISE EXCEPTION 'test run case suite metadata snapshot is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "test_run_case_suite_metadata_snapshot_immutable"
  BEFORE UPDATE ON "test_run_case_suite_metadata" FOR EACH ROW
  EXECUTE FUNCTION protect_test_run_case_suite_metadata_snapshot();
