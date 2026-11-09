-- Migration: 20261109_curriculum_unit_approvals.sql
-- Description: Persistent, Generation-Scoped Curriculum Unit Approvals
-- Platform: TiDB Cloud Serverless / MySQL 8.0+
-- Security: Ties explicit administrative approval to (book_id, chapter_id, generation_id).
-- Ingestion completion (COMPLETED) alone never grants exam readiness or AI eligibility.

CREATE TABLE IF NOT EXISTS curriculum_unit_approvals (
    id VARCHAR(64) PRIMARY KEY,
    book_id VARCHAR(64) NOT NULL,
    chapter_id VARCHAR(64) NOT NULL,
    generation_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'NOT_AUDITED',
    approved_by VARCHAR(64) NULL,
    approved_at DATETIME NULL,
    rejected_by VARCHAR(64) NULL,
    rejected_at DATETIME NULL,
    rejection_reason TEXT NULL,
    revoked_by VARCHAR(64) NULL,
    revoked_at DATETIME NULL,
    revocation_reason TEXT NULL,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cua_unit_gen (book_id, chapter_id, generation_id),
    INDEX idx_cua_book (book_id),
    INDEX idx_cua_chapter (chapter_id),
    INDEX idx_cua_status (approval_status),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
);

