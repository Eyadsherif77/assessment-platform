-- Migration: 20261108_expand_checkpoint_data_and_ocr_pages.sql
-- Description: Expand checkpoint_data to MEDIUMTEXT and create dedicated book_ocr_page_results table for durable per-page persistence

ALTER TABLE book_ingestion_jobs MODIFY COLUMN checkpoint_data MEDIUMTEXT;

CREATE TABLE IF NOT EXISTS book_ocr_page_results (
    job_id VARCHAR(64) NOT NULL,
    book_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    extracted_text MEDIUMTEXT NOT NULL,
    char_count INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, page_number),
    INDEX idx_ocr_book_page (book_id, page_number)
);

