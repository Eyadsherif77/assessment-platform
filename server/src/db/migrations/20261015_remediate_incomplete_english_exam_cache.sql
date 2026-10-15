-- ============================================================================
-- Alfarabi AI — Remediation & Rollback for Incomplete Exam Record
-- Target Exam ID: ai_exam_1792056268228_n3c4zpy
-- Engine: TiDB Cloud Serverless / MySQL 8.0 Compatible
-- Date: 2026-10-15
--
-- SAFETY INSTRUCTIONS:
-- 1. DO NOT EXECUTE AGAINST PRODUCTION WITHOUT EXPLICIT OPERATOR APPROVAL.
-- 2. This script is fully deterministic, audit-logged, and rollback-safe.
-- 3. It records the exact pre-remediation row state into an audit table before
--    making any modification.
-- 4. The rollback asserts the modified state and restores the EXACT original state
--    rather than blindly flipping flags.
-- ============================================================================

-- ============================================================================
-- SECTION 1: VERIFIED ORIGINAL ROW STATE (Recorded Snapshot: 2026-10-15 09:24:29 UTC)
-- ============================================================================
-- id:                  ai_exam_1792056268228_n3c4zpy
-- config_key:          exam_cache:v1:stage=61998777-4c5f-4e51-bc0a-38de938c842a:grade=4baa5084-112d-45e5-908e-1ae67ea8b4e8:subject=33634475-0cc9-43a9-b2c4-271bc31e49c8:book=21e1d639-9f59-4a58-a8f8-8373b8e7fc90:term=1:schoolType=كلاهما:units=e6000000-9f59-4a58-a8f8-8373b8e7fc94:params=51e09550614bf45f
-- config_hash:         b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492
-- content_hash:        483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97
-- version_number:      1
-- book_id:             21e1d639-9f59-4a58-a8f8-8373b8e7fc90
-- academic_stage_id:   61998777-4c5f-4e51-bc0a-38de938c842a
-- grade_id:            4baa5084-112d-45e5-908e-1ae67ea8b4e8
-- subject_id:          33634475-0cc9-43a9-b2c4-271bc31e49c8
-- term:                1
-- school_type:         كلاهما
-- unit_ids:            ["e6000000-9f59-4a58-a8f8-8373b8e7fc94"]
-- unit_set_key:        e6000000-9f59-4a58-a8f8-8373b8e7fc94
-- parameters_json:     {"count":5,"questionTypes":["MULTIPLE_CHOICE"],"difficulty":"MEDIUM","language":"ar"}
-- param_hash:          51e09550614bf45f
-- total_questions:     4
-- provenance_verified: 1
-- created_at:          2026-10-15 09:24:29
-- updated_at:          2026-10-15 09:24:29
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: PRE-FLIGHT VERIFICATION
-- Must return EXACTLY 1 row matching all recorded snapshot attributes.
-- If 0 rows return, DO NOT PROCEED.
-- ----------------------------------------------------------------------------
SELECT id, config_hash, content_hash, version_number, book_id,
       total_questions, provenance_verified, created_at, updated_at
FROM shared_cached_exams
WHERE id = 'ai_exam_1792056268228_n3c4zpy'
  AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
  AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
  AND version_number = 1
  AND total_questions = 4
  AND provenance_verified = 1;

-- ----------------------------------------------------------------------------
-- STEP 2: CREATE AUDIT SNAPSHOT TABLE (Immutable pre-state record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_shared_cached_exams_incident_20261015 (
    backup_id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    original_config_hash VARCHAR(64) NOT NULL,
    original_content_hash VARCHAR(64) NOT NULL,
    original_total_questions INT NOT NULL,
    original_provenance_verified INT NOT NULL,
    original_parameters_json TEXT NOT NULL,
    original_created_at DATETIME,
    original_updated_at DATETIME,
    backed_up_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO backup_shared_cached_exams_incident_20261015 (
    backup_id, exam_id, original_config_hash, original_content_hash,
    original_total_questions, original_provenance_verified,
    original_parameters_json, original_created_at, original_updated_at
)
SELECT 'pre_remediation_ai_exam_1792056268228_n3c4zpy',
       id, config_hash, content_hash, total_questions, provenance_verified,
       parameters_json, created_at, updated_at
FROM shared_cached_exams
WHERE id = 'ai_exam_1792056268228_n3c4zpy'
  AND total_questions = 4
  AND provenance_verified = 1
ON DUPLICATE KEY UPDATE backed_up_at = CURRENT_TIMESTAMP;

-- ----------------------------------------------------------------------------
-- STEP 3: FORWARD REMEDIATION (Deactivate incomplete cached exam)
-- Guarded by optimistic concurrency: only updates if provenance_verified is still 1
-- and total_questions is 4.
-- ----------------------------------------------------------------------------
UPDATE shared_cached_exams
SET provenance_verified = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'ai_exam_1792056268228_n3c4zpy'
  AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
  AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
  AND total_questions = 4
  AND provenance_verified = 1;

-- ----------------------------------------------------------------------------
-- STEP 4: POST-REMEDIATION VERIFICATION
-- Verify provenance_verified is now 0.
-- ----------------------------------------------------------------------------
SELECT id, total_questions, provenance_verified, updated_at
FROM shared_cached_exams
WHERE id = 'ai_exam_1792056268228_n3c4zpy';

-- ============================================================================
-- SECTION 2: REVERSIBLE ROLLBACK (DO NOT RUN UNLESS ROLLBACK IS INTENDED)
-- Restores the row to the exact recorded snapshot state and verifies restoration.
-- ============================================================================
--
-- -- Step R1: Pre-Rollback Guard Check (Verify row is in remediated state)
-- SELECT id, total_questions, provenance_verified
-- FROM shared_cached_exams
-- WHERE id = 'ai_exam_1792056268228_n3c4zpy'
--   AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
--   AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
--   AND total_questions = 4
--   AND provenance_verified = 0;
--
-- -- Step R2: Restore Exact Original Values from Recorded Snapshot
-- UPDATE shared_cached_exams
-- SET provenance_verified = 1,
--     updated_at = '2026-10-15 09:24:29'
-- WHERE id = 'ai_exam_1792056268228_n3c4zpy'
--   AND config_hash = 'b2934963e37ce2edfab16c735e7b22712aa3b535c68fb159aa765befee377492'
--   AND content_hash = '483c313040ecfc917281e0debcb5fcb9eb090e6ac56556964b468a2998c48a97'
--   AND total_questions = 4
--   AND provenance_verified = 0;
--
-- -- Step R3: Verify Exact Original State is Restored
-- SELECT id, total_questions, provenance_verified, updated_at
-- FROM shared_cached_exams
-- WHERE id = 'ai_exam_1792056268228_n3c4zpy'
--   AND provenance_verified = 1
--   AND updated_at = '2026-10-15 09:24:29';
--
