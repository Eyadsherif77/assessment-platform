-- ============================================================================
-- Migration: 20261015_add_telemetry_columns.sql
-- Description: Add extended telemetry columns to ai_usage_metrics for Task 2
-- Dialect: TiDB Cloud / MySQL 8.0 Compatible
-- Note: Non-destructive, idempotent ALTER TABLE statements
-- ============================================================================

-- Pre-flight check
SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_metrics';

-- 1. Add is_estimated (TINYINT NOT NULL DEFAULT 0)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS is_estimated TINYINT NOT NULL DEFAULT 0;

-- 2. Add call_purpose (VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION')
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS call_purpose VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION';

-- 3. Add correlation_id (VARCHAR(64) NULL)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64) NULL;

-- 4. Add attempt_number (INT NOT NULL DEFAULT 1)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1;

-- 5. Add cached_tokens (INT NOT NULL DEFAULT 0)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS cached_tokens INT NOT NULL DEFAULT 0;

-- 6. Add cost_status (VARCHAR(32) NOT NULL DEFAULT 'ESTIMATED')
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS cost_status VARCHAR(32) NOT NULL DEFAULT 'ESTIMATED';

-- 7. Add grade_id (VARCHAR(64) NULL)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS grade_id VARCHAR(64) NULL;

-- 8. Add subject_id (VARCHAR(64) NULL)
ALTER TABLE ai_usage_metrics 
ADD COLUMN IF NOT EXISTS subject_id VARCHAR(64) NULL;

-- Post-flight check
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'ai_usage_metrics' 
  AND COLUMN_NAME IN (
    'is_estimated', 'call_purpose', 'correlation_id', 'attempt_number',
    'cached_tokens', 'cost_status', 'grade_id', 'subject_id'
  );
