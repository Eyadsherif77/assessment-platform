-- Migration: 20261108_staged_generation_and_worker_sessions.sql
-- Description: Complete Generation-Scoped Isolation across all textbook artifacts
-- Tables isolated by generation_id: books, book_chunks, book_pages, book_chapters, book_pdf_chunks

-- 1. Books: Active Generation Pointer
ALTER TABLE books ADD COLUMN active_generation_id VARCHAR(64) NULL;

-- 2. Semantic Chunks: Generation Scoped
ALTER TABLE book_chunks ADD COLUMN generation_id VARCHAR(64) NOT NULL DEFAULT 'v1';
ALTER TABLE book_chunks ADD COLUMN embedding_model VARCHAR(64) NOT NULL DEFAULT 'semantic-hash-768';
ALTER TABLE book_chunks ADD COLUMN embedding_version VARCHAR(32) NOT NULL DEFAULT '1.0';
CREATE INDEX idx_book_chunks_gen ON book_chunks (book_id, generation_id);

-- 3. Canonical Pages: Generation Scoped
ALTER TABLE book_pages ADD COLUMN generation_id VARCHAR(64) NOT NULL DEFAULT 'v1';
ALTER TABLE book_pages ADD COLUMN page_type VARCHAR(64) NOT NULL DEFAULT 'CONTENT';
ALTER TABLE book_pages ADD COLUMN metadata TEXT NULL;
ALTER TABLE book_pages ADD UNIQUE KEY uq_book_page_gen (book_id, generation_id, page_number);
ALTER TABLE book_pages DROP INDEX uq_book_page;
CREATE INDEX idx_book_pages_gen ON book_pages (book_id, generation_id, page_number);

-- 4. Chapters & Boundaries: Generation Scoped
ALTER TABLE book_chapters ADD COLUMN generation_id VARCHAR(64) NOT NULL DEFAULT 'v1';
CREATE INDEX idx_book_chapters_gen ON book_chapters (book_id, generation_id);

-- 5. Raw PDF Storage Chunks: Generation Scoped
CREATE TABLE IF NOT EXISTS book_pdf_chunks (
    book_id VARCHAR(64) NOT NULL,
    chunk_index INT NOT NULL,
    chunk_data LONGBLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, chunk_index)
);
ALTER TABLE book_pdf_chunks ADD COLUMN generation_id VARCHAR(64) NOT NULL DEFAULT 'v1';
-- TiDB-Safe Unique Key (avoids dropping clustered primary key on TiDB Cloud)
ALTER TABLE book_pdf_chunks ADD UNIQUE KEY uq_book_pdf_gen_chunk (book_id, generation_id, chunk_index);
CREATE INDEX idx_book_pdf_chunks_gen ON book_pdf_chunks (book_id, generation_id, chunk_index);

-- 6. Cloud Ingestion Worker Sessions
CREATE TABLE IF NOT EXISTS ingestion_worker_sessions (
    id VARCHAR(64) PRIMARY KEY,
    session_token_hash VARCHAR(64) NOT NULL,
    book_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NOT NULL,
    file_checksum VARCHAR(64) NOT NULL,
    generation_id VARCHAR(64) NOT NULL,
    admin_user_id VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    is_revoked TINYINT NOT NULL DEFAULT 0,
    last_batch_sequence INT NOT NULL DEFAULT 0,
    total_pages INT NOT NULL DEFAULT 0,
    processed_pages_count INT NOT NULL DEFAULT 0,
    INDEX idx_iws_book (book_id),
    INDEX idx_iws_token_hash (session_token_hash)
);

-- 7. Ingestion Batch Idempotency & Sequencing Guard
CREATE TABLE IF NOT EXISTS ingestion_batch_idempotency (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    endpoint VARCHAR(64) NOT NULL,
    batch_sequence INT NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    payload_checksum VARCHAR(64) NOT NULL,
    response_body LONGTEXT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY idx_ibi_session_idemp (session_id, idempotency_key),
    UNIQUE KEY idx_ibi_session_endpoint_seq (session_id, endpoint, batch_sequence)
);
