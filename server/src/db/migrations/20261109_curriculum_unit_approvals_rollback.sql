-- Rollback Migration: 20261109_curriculum_unit_approvals_rollback.sql
-- Description: Safely revert curriculum_unit_approvals table if necessary.
-- Platform: TiDB Cloud Serverless / MySQL 8.0+

DROP TABLE IF EXISTS curriculum_unit_approvals;

