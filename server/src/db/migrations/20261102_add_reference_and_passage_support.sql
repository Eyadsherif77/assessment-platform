-- Migration: Add reading comprehension passage and reference question indicators
-- Supports: SQLite, PostgreSQL, and TiDB (MySQL)

-- 1. Add passage_text and is_reference to question_bank_items
ALTER TABLE question_bank_items ADD COLUMN passage_text TEXT;
ALTER TABLE question_bank_items ADD COLUMN is_reference INTEGER DEFAULT 0;

-- 2. Add passage_text to exam_questions
ALTER TABLE exam_questions ADD COLUMN passage_text TEXT;

-- 3. Add is_ai_reference to exams (to isolate AI exam reference containers from static exams)
ALTER TABLE exams ADD COLUMN is_ai_reference INTEGER DEFAULT 0;
