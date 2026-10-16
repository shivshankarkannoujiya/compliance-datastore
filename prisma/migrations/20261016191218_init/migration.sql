-- CreateEnum
CREATE TYPE "SubjectKind" AS ENUM ('PERSON', 'SITE', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'IMPORT', 'MIGRATION');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "Hierarchy" AS ENUM ('PRIMARY', 'DETAILED');

-- CreateTable
CREATE TABLE "subject" (
    "id" UUID NOT NULL,
    "kind" "SubjectKind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_alias" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "normalised" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_type_version" (
    "id" UUID NOT NULL,
    "compliance_type_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "group_level_1" TEXT NOT NULL,
    "group_level_2" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "sub_group" TEXT NOT NULL,
    "detailed_group" TEXT,
    "detailed_sub_group" TEXT,
    "core" BOOLEAN NOT NULL,
    "timeframe_months" INTEGER,
    "threshold_1" DECIMAL(6,5) NOT NULL,
    "threshold_2" DECIMAL(6,5) NOT NULL,
    "threshold_3" DECIMAL(6,5) NOT NULL,
    "threshold_4" DECIMAL(6,5) NOT NULL,
    "threshold_5" DECIMAL(6,5) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "compliance_type_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "compliance_type_id" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active_from" DATE NOT NULL,
    "active_to" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_record" (
    "id" UUID NOT NULL,
    "recorded_seq" SERIAL NOT NULL,
    "subject_id" UUID NOT NULL,
    "compliance_type_id" UUID NOT NULL,
    "completion_date" DATE,
    "completion_status" TEXT,
    "due_date" DATE,
    "issue" INTEGER,
    "notes" TEXT,
    "source" "RecordSource" NOT NULL,
    "source_ref" TEXT,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" TEXT NOT NULL,
    "supersedes_id" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "compliance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_run" (
    "id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "policy_version" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" TEXT,

    CONSTRAINT "publish_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_requirement_status" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "compliance_type_id" UUID NOT NULL,
    "record_id" UUID,
    "compliant" BOOLEAN NOT NULL,
    "due_date_kind" TEXT NOT NULL,
    "due_date" DATE,
    "completion_status" TEXT,
    "compliance" INTEGER,
    "compliance_core" INTEGER,
    "expiry" TEXT,
    "weeks_non_compliant" INTEGER,

    CONSTRAINT "published_requirement_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_type_score" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "hierarchy" "Hierarchy" NOT NULL,
    "group" TEXT NOT NULL,
    "sub_group" TEXT NOT NULL,
    "compliance_type" TEXT NOT NULL,
    "percent_compliant" DOUBLE PRECISION,
    "percent_compliant_core" DOUBLE PRECISION,
    "rag" DOUBLE PRECISION,
    "rag_core" DOUBLE PRECISION,

    CONSTRAINT "published_type_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_sub_group_score" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "hierarchy" "Hierarchy" NOT NULL,
    "group" TEXT NOT NULL,
    "sub_group" TEXT NOT NULL,
    "percent_compliant" DOUBLE PRECISION,
    "percent_compliant_core" DOUBLE PRECISION,
    "rag" DOUBLE PRECISION,
    "rag_core" DOUBLE PRECISION,

    CONSTRAINT "published_sub_group_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_group_score" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "hierarchy" "Hierarchy" NOT NULL,
    "group" TEXT NOT NULL,
    "percent_compliant" DOUBLE PRECISION,
    "percent_compliant_core" DOUBLE PRECISION,
    "rag" DOUBLE PRECISION,
    "rag_core" DOUBLE PRECISION,

    CONSTRAINT "published_group_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subject_external_ref_key" ON "subject"("external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "subject_alias_normalised_key" ON "subject_alias"("normalised");

-- CreateIndex
CREATE INDEX "subject_alias_subject_id_idx" ON "subject_alias"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_type_code_key" ON "compliance_type"("code");

-- CreateIndex
CREATE INDEX "compliance_type_version_valid_from_valid_to_idx" ON "compliance_type_version"("valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_type_version_compliance_type_id_version_key" ON "compliance_type_version"("compliance_type_id", "version");

-- CreateIndex
CREATE INDEX "requirement_compliance_type_id_idx" ON "requirement"("compliance_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_subject_id_compliance_type_id_active_from_key" ON "requirement"("subject_id", "compliance_type_id", "active_from");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_record_supersedes_id_key" ON "compliance_record"("supersedes_id");

-- CreateIndex
CREATE INDEX "compliance_record_subject_id_compliance_type_id_idx" ON "compliance_record"("subject_id", "compliance_type_id");

-- CreateIndex
CREATE INDEX "compliance_record_voided_at_idx" ON "compliance_record"("voided_at");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_record_recorded_seq_key" ON "compliance_record"("recorded_seq");

-- CreateIndex
CREATE INDEX "publish_run_status_decided_at_idx" ON "publish_run"("status", "decided_at");

-- CreateIndex
CREATE INDEX "published_requirement_status_run_id_idx" ON "published_requirement_status"("run_id");

-- CreateIndex
CREATE INDEX "published_type_score_run_id_hierarchy_idx" ON "published_type_score"("run_id", "hierarchy");

-- CreateIndex
CREATE INDEX "published_sub_group_score_run_id_hierarchy_idx" ON "published_sub_group_score"("run_id", "hierarchy");

-- CreateIndex
CREATE INDEX "published_group_score_run_id_hierarchy_idx" ON "published_group_score"("run_id", "hierarchy");

-- AddForeignKey
ALTER TABLE "subject_alias" ADD CONSTRAINT "subject_alias_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_type_version" ADD CONSTRAINT "compliance_type_version_compliance_type_id_fkey" FOREIGN KEY ("compliance_type_id") REFERENCES "compliance_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_compliance_type_id_fkey" FOREIGN KEY ("compliance_type_id") REFERENCES "compliance_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_record" ADD CONSTRAINT "compliance_record_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_record" ADD CONSTRAINT "compliance_record_compliance_type_id_fkey" FOREIGN KEY ("compliance_type_id") REFERENCES "compliance_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_record" ADD CONSTRAINT "compliance_record_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "compliance_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_requirement_status" ADD CONSTRAINT "published_requirement_status_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "publish_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_type_score" ADD CONSTRAINT "published_type_score_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "publish_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_sub_group_score" ADD CONSTRAINT "published_sub_group_score_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "publish_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_group_score" ADD CONSTRAINT "published_group_score_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "publish_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules Prisma cannot express. Kept in the init migration so every
-- environment gets them.
-- ---------------------------------------------------------------------------

-- Catalogue: one open version per type; periods and thresholds must be sane.
CREATE UNIQUE INDEX "compliance_type_version_one_open" ON "compliance_type_version" ("compliance_type_id") WHERE "valid_to" IS NULL;
ALTER TABLE "compliance_type_version"
  ADD CONSTRAINT "compliance_type_version_period" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "compliance_type_version_thresholds" CHECK (
    "threshold_1" <= 1 AND "threshold_5" >= 0 AND
    "threshold_1" >= "threshold_2" AND "threshold_2" >= "threshold_3" AND
    "threshold_3" >= "threshold_4" AND "threshold_4" >= "threshold_5"),
  ADD CONSTRAINT "compliance_type_version_timeframe" CHECK ("timeframe_months" IS NULL OR "timeframe_months" > 0),
  ADD CONSTRAINT "compliance_type_version_detailed_pair" CHECK (("detailed_group" IS NULL) = ("detailed_sub_group" IS NULL));

ALTER TABLE "requirement"
  ADD CONSTRAINT "requirement_period" CHECK ("active_to" IS NULL OR "active_to" > "active_from");

-- Evidence: void details are all set or all empty; a record cannot supersede itself.
ALTER TABLE "compliance_record"
  ADD CONSTRAINT "compliance_record_void_complete" CHECK (
    ("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL) OR
    ("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND "void_reason" IS NOT NULL)),
  ADD CONSTRAINT "compliance_record_not_self_superseding" CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id");

-- Evidence is append-only: no deletes, and the only permitted update sets the void columns once.
CREATE FUNCTION "compliance_record_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'compliance_record is append-only: rows cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'compliance_record % is already voided', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."id", NEW."recorded_seq", NEW."subject_id", NEW."compliance_type_id", NEW."completion_date",
      NEW."completion_status", NEW."due_date", NEW."issue", NEW."notes", NEW."source", NEW."source_ref",
      NEW."recorded_at", NEW."recorded_by", NEW."supersedes_id")
     IS DISTINCT FROM
     (OLD."id", OLD."recorded_seq", OLD."subject_id", OLD."compliance_type_id", OLD."completion_date",
      OLD."completion_status", OLD."due_date", OLD."issue", OLD."notes", OLD."source", OLD."source_ref",
      OLD."recorded_at", OLD."recorded_by", OLD."supersedes_id") THEN
    RAISE EXCEPTION 'compliance_record is append-only: only the void columns may be set' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "compliance_record_append_only"
  BEFORE UPDATE OR DELETE ON "compliance_record"
  FOR EACH ROW EXECUTE FUNCTION "compliance_record_append_only"();

-- Publishing: a decision has a decider, and a different person from the one who calculated the run (four eyes).
ALTER TABLE "publish_run"
  ADD CONSTRAINT "publish_run_decision" CHECK (
    ("status" = 'DRAFT' AND "decided_at" IS NULL AND "decided_by" IS NULL) OR
    ("status" <> 'DRAFT' AND "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL)),
  ADD CONSTRAINT "publish_run_four_eyes" CHECK ("status" <> 'PUBLISHED' OR "decided_by" <> "created_by");

-- ---------------------------------------------------------------------------
-- Reporting views for Power BI: the latest published run only.
-- ---------------------------------------------------------------------------
CREATE VIEW "reporting_latest_run" AS
  SELECT "id" AS "run_id", "as_of", "policy_version", "decided_at" AS "published_at"
  FROM "publish_run"
  WHERE "status" = 'PUBLISHED'
  ORDER BY "decided_at" DESC
  LIMIT 1;

CREATE VIEW "reporting_requirement_status" AS
  SELECT r."as_of", s.*, sub."display_name" AS "subject_name", ct."name" AS "compliance_type_name"
  FROM "published_requirement_status" s
  JOIN "reporting_latest_run" r ON r."run_id" = s."run_id"
  JOIN "subject" sub ON sub."id" = s."subject_id"
  JOIN "compliance_type" ct ON ct."id" = s."compliance_type_id";

CREATE VIEW "reporting_type_score" AS
  SELECT r."as_of", t.* FROM "published_type_score" t JOIN "reporting_latest_run" r ON r."run_id" = t."run_id";

CREATE VIEW "reporting_sub_group_score" AS
  SELECT r."as_of", g.* FROM "published_sub_group_score" g JOIN "reporting_latest_run" r ON r."run_id" = g."run_id";

CREATE VIEW "reporting_group_score" AS
  SELECT r."as_of", g.* FROM "published_group_score" g JOIN "reporting_latest_run" r ON r."run_id" = g."run_id";
