-- ============================================================================
-- PROPOSED DATABASE MIGRATION (Phase 4G.3J)
-- Migration: 20261013_prep2_social_revision_chapter.sql
-- Status: PROPOSAL ONLY - UNAPPLIED - DO NOT EXECUTE AGAINST ANY LIVE DATABASE
-- Dialect: TiDB Cloud / MySQL 8.0 Compatible (with SQLite notes below)
-- ============================================================================
--
-- PURPOSE:
-- Isolate and formalize the general revision and model examination content
-- in Prep 2 Social Studies (Book ID: 81b8a308-7fcf-4938-8c45-aa0056624f32).
--
-- CURRENT STATE:
-- 1. Unit 4 (Civilization & Government) covers pages 70–96 (chapter_id: 16d3a51f-5026-4445-9856-788c00aa1652).
-- 2. Pages 97–106 contain 8 cumulative book-chunks currently unassigned (chapter_id IS NULL).
-- 3. These 8 chunks contain comprehensive end-of-term model examinations covering
--    all 4 units (Geography + History), NOT Roman/Islamic civilization specifically.
-- 4. Merging pages 97–106 into Unit 4 would cause severe cross-unit question contamination.
--
-- PROPOSAL:
-- 1. Create a dedicated chapter for cumulative final revision:
--    id: '7f2409f5-19e4-4d89-9a2c-f684c31be991'
--    title_ar: 'الامتحانات العامة ونماذج المراجعة النهائية'
--    title_en: 'General Final Revision & Model Examinations'
--    order_index: 5
-- 2. Assign the 8 unassigned chunks (pages 97–106) to this new dedicated chapter.
--
-- STRICT AUTHORIZATION BOUNDARY:
-- This migration MUST NOT be applied by the AI agent. It is a proposed schema
-- enhancement awaiting human curriculum owner review.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UP MIGRATION (APPLY CHANGES - PENDING CURRICULUM OWNER APPROVAL)
-- ----------------------------------------------------------------------------

-- Step A: Insert dedicated revision chapter
INSERT INTO book_chapters (
  id,
  book_id,
  chapter_number,
  title_ar,
  title_en,
  order_index
) VALUES (
  '7f2409f5-19e4-4d89-9a2c-f684c31be991',
  '81b8a308-7fcf-4938-8c45-aa0056624f32',
  5,
  'الامتحانات العامة ونماذج المراجعة النهائية',
  'General Final Revision & Model Examinations',
  5
);

-- Step B: Assign pages 97–106 chunks to the dedicated revision chapter
UPDATE book_chunks
SET chapter_id = '7f2409f5-19e4-4d89-9a2c-f684c31be991'
WHERE book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32'
  AND page_number >= 97
  AND page_number <= 106
  AND (chapter_id IS NULL OR chapter_id = '');

-- ----------------------------------------------------------------------------
-- 2. DOWN MIGRATION (ROLLBACK CHANGES)
-- ----------------------------------------------------------------------------

/*
UPDATE book_chunks
SET chapter_id = NULL
WHERE book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32'
  AND chapter_id = '7f2409f5-19e4-4d89-9a2c-f684c31be991';

DELETE FROM book_chapters
WHERE id = '7f2409f5-19e4-4d89-9a2c-f684c31be991'
  AND book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32';
*/
