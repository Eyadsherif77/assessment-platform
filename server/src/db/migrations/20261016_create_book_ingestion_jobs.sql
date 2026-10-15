-- Migration: 20261016_create_book_ingestion_jobs.sql
-- Description: TiDB Cloud / MySQL durable background job queue for universal textbook ingestion pipeline

CREATE TABLE IF NOT EXISTS book_ingestion_jobs (
    id VARCHAR(64) PRIMARY KEY,
    book_id VARCHAR(64) NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    current_stage VARCHAR(64) NOT NULL DEFAULT 'UPLOADED',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    lease_owner VARCHAR(64) NULL,
    lease_expires_at DATETIME NULL,
    checkpoint_data LONGTEXT NULL,
    last_error TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bij_book (book_id),
    INDEX idx_bij_stage_status (current_stage, status),
    INDEX idx_bij_lease (status, lease_expires_at)
);
