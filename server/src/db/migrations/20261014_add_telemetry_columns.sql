-- ============================================================================
-- Migration: Add Telemetry Columns to ai_usage_metrics
-- Date: 2026-10-14
-- Engine: TiDB / MySQL
-- Note: DDL in TiDB is non-transactional and commits immediately.
-- Execute once via controlled operator migration runner.
-- ============================================================================

-- Pre-flight existence check
SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_metrics';

-- Add is_estimated (TINYINT NOT NULL DEFAULT 0)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS is_estimated TINYINT NOT NULL DEFAULT 0;

-- Add call_purpose (VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION')
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS call_purpose VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION';

-- Post-flight verification query (Must return exactly 2 rows)
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'ai_usage_metrics' 
  AND COLUMN_NAME IN ('is_estimated', 'call_purpose');
