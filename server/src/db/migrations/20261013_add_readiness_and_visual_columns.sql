-- ============================================================================
-- PROPOSED DATABASE MIGRATION (Phase 4G.3J)
-- Migration: 20261013_add_readiness_and_visual_columns.sql
-- Status: PROPOSAL ONLY - UNAPPLIED - DO NOT EXECUTE AGAINST ANY LIVE DATABASE
-- Dialect: TiDB Cloud / MySQL 8.0 Compatible (with SQLite/Postgres notes below)
-- ============================================================================
--
-- PURPOSE:
-- 1. Persist unit-level readiness status and visual dependency classifications
--    on `book_chapters` so the platform can gate AI generation deterministically.
-- 2. Store visual asset metadata (`diagram_url`, `diagram_asset_id`) on
--    `question_bank_items` and `exam_questions`.
-- 3. Create a dedicated `visual_asset_catalog` table to track textbook diagrams,
--    maps, and crops extracted from authoritative PDFs.
--
-- STRICT AUTHORIZATION BOUNDARY:
-- This migration MUST NOT be applied by the AI agent. It is a proposed schema
-- enhancement awaiting human administrator / database owner review.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UP MIGRATION (APPLY CHANGES)
-- ----------------------------------------------------------------------------

-- A. Add readiness & visual columns to book_chapters
ALTER TABLE book_chapters
  ADD COLUMN IF NOT EXISTS readiness_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED_READY'
    COMMENT 'Readiness gate: VERIFIED_READY, CONDITIONALLY_READY, BLOCKED, NOT_AUDITED',
  ADD COLUMN IF NOT EXISTS visual_dependency_type VARCHAR(64) NOT NULL DEFAULT 'NONE'
    COMMENT 'Visual classification: NONE, GEOMETRY_DIAGRAMS, CARTOGRAPHIC_MAPS, etc.',
  ADD COLUMN IF NOT EXISTS audit_notes TEXT NULL
    COMMENT 'Curriculum audit observations, evidence, and remaining blockers';

-- B. Add visual diagram reference to question_bank_items
ALTER TABLE question_bank_items
  ADD COLUMN IF NOT EXISTS diagram_url VARCHAR(512) NULL
    COMMENT 'Relative URL path to verified visual asset (/uploads/visual_assets/...)',
  ADD COLUMN IF NOT EXISTS diagram_asset_id VARCHAR(64) NULL
    COMMENT 'Unique UUID referencing visual_asset_catalog(id)',
  ADD COLUMN IF NOT EXISTS has_visual_dependency INT NOT NULL DEFAULT 0
    COMMENT '1 if answering this question requires inspecting visual figure; 0 otherwise';

-- C. Add visual diagram reference to exam_questions
ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS diagram_url VARCHAR(512) NULL
    COMMENT 'Relative URL path to verified visual asset (/uploads/visual_assets/...)',
  ADD COLUMN IF NOT EXISTS diagram_asset_id VARCHAR(64) NULL
    COMMENT 'Unique UUID referencing visual_asset_catalog(id)';

-- D. Create visual_asset_catalog table
CREATE TABLE IF NOT EXISTS visual_asset_catalog (
  id VARCHAR(64) PRIMARY KEY,
  book_id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  printed_page_number INT NOT NULL,
  pdf_page_index INT NOT NULL,
  asset_type VARCHAR(32) NOT NULL COMMENT 'diagram, map, chart, page_image',
  file_path VARCHAR(512) NOT NULL,
  url_path VARCHAR(512) NOT NULL UNIQUE,
  file_size INT NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  extraction_method VARCHAR(32) NOT NULL COMMENT 'pdf-lib-page, raster-crop, multimodal-ocr, vector-svg',
  validation_status VARCHAR(32) NOT NULL DEFAULT 'EXTRACTED' COMMENT 'EXTRACTED, VERIFIED, AMBIGUOUS',
  description_ar TEXT NULL,
  description_en TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vac_book_page (book_id, printed_page_number),
  INDEX idx_vac_chapter (chapter_id),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 2. DOWN MIGRATION (ROLLBACK CHANGES)
-- ----------------------------------------------------------------------------

/*
DROP TABLE IF EXISTS visual_asset_catalog;

ALTER TABLE exam_questions
  DROP COLUMN IF EXISTS diagram_asset_id,
  DROP COLUMN IF EXISTS diagram_url;

ALTER TABLE question_bank_items
  DROP COLUMN IF EXISTS has_visual_dependency,
  DROP COLUMN IF EXISTS diagram_asset_id,
  DROP COLUMN IF EXISTS diagram_url;

ALTER TABLE book_chapters
  DROP COLUMN IF EXISTS audit_notes,
  DROP COLUMN IF EXISTS visual_dependency_type,
  DROP COLUMN IF EXISTS readiness_status;
*/

-- ============================================================================
-- SQLITE LOCAL COMPATIBILITY NOTES:
-- For SQLite, ALTER TABLE ADD COLUMN supports only one column per statement,
-- and does not support IF NOT EXISTS on ADD COLUMN or COMMENT syntax.
-- Local SQLite migrations should execute individual ADD COLUMN statements.
-- ============================================================================
