-- ============================================================================
-- Migration: 20261015_prep2_social_revision_chapter.sql
-- Description: Create dedicated General Semester Revision chapter for Prep 2 Social Studies
--              and assign the 8 unassigned chunks (pages 97-104).
-- Dialect: TiDB Cloud / MySQL 8.0 Compatible
-- Safety: Non-destructive, Idempotent, Scoped strictly to book 81b8a308-7fcf-4938-8c45-aa0056624f32
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. UP MIGRATION
-- ----------------------------------------------------------------------------

-- Step A: Insert dedicated revision chapter (idempotent: ignore if already exists)
INSERT IGNORE INTO book_chapters (
  id,
  book_id,
  chapter_number,
  title_ar,
  title_en,
  start_page,
  end_page,
  description,
  description_en,
  created_at
) VALUES (
  '7f2409f5-19e4-4d89-9a2c-f684c31be991',
  '81b8a308-7fcf-4938-8c45-aa0056624f32',
  5,
  'المراجعة العامة على الفصل الدراسي الأول',
  'General Semester Revision',
  97,
  104,
  'المراجعة العامة ونماذج امتحانات الفصل الدراسي الأول لمادة الدراسات الاجتماعية',
  'General semester revision and model exams for Social Studies',
  CURRENT_TIMESTAMP
);

-- Step B: Assign only the verified 8 revision chunks to Chapter 5
UPDATE book_chunks
SET chapter_id = '7f2409f5-19e4-4d89-9a2c-f684c31be991'
WHERE book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32'
  AND id IN (
    'bddd7ea7-4300-4255-98c5-d0ac4f0af45d', -- Page 97
    '2b4402a5-7e0e-4f40-a40d-ba9e7f79f7b6', -- Page 98
    'c05f49ac-8b0c-4774-9168-9fde699300de', -- Page 99
    '970e5683-e52f-44d6-924c-ef0c8595d086', -- Page 100
    'fc7a7c19-11e3-4691-902b-002cdd21d703', -- Page 101
    'cd5de032-7026-4cf2-91a7-5a0a0e7965ba', -- Page 102
    'bc822680-a0c1-4cac-8f73-2ac40ef46e63', -- Page 103
    'b4cfd1d3-6df4-4f37-a2bf-f07f4f19b086'  -- Page 104
  )
  AND (chapter_id IS NULL OR chapter_id = '7f2409f5-19e4-4d89-9a2c-f684c31be991');

-- ----------------------------------------------------------------------------
-- 2. DOWN MIGRATION (ROLLBACK PLAN)
-- ----------------------------------------------------------------------------

/*
-- Rollback Step A: Unassign the 8 revision chunks back to NULL
UPDATE book_chunks
SET chapter_id = NULL
WHERE book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32'
  AND id IN (
    'bddd7ea7-4300-4255-98c5-d0ac4f0af45d',
    '2b4402a5-7e0e-4f40-a40d-ba9e7f79f7b6',
    'c05f49ac-8b0c-4774-9168-9fde699300de',
    '970e5683-e52f-44d6-924c-ef0c8595d086',
    'fc7a7c19-11e3-4691-902b-002cdd21d703',
    'cd5de032-7026-4cf2-91a7-5a0a0e7965ba',
    'bc822680-a0c1-4cac-8f73-2ac40ef46e63',
    'b4cfd1d3-6df4-4f37-a2bf-f07f4f19b086'
  )
  AND chapter_id = '7f2409f5-19e4-4d89-9a2c-f684c31be991';

-- Rollback Step B: Remove Chapter 5
DELETE FROM book_chapters
WHERE id = '7f2409f5-19e4-4d89-9a2c-f684c31be991'
  AND book_id = '81b8a308-7fcf-4938-8c45-aa0056624f32';
*/
