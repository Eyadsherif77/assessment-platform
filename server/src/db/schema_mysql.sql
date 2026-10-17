-- منصة التقييم من أجل التعليم - TiDB Cloud / MySQL Schema (Exact 1:1 Match with Platform Engine)

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    super_id VARCHAR(64),
    hybrid_id VARCHAR(64),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    governorate_id VARCHAR(64),
    subject_id VARCHAR(64),
    created_by VARCHAR(64),
    permissions TEXT,
    is_active INT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS countries (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS governorates (
    id VARCHAR(64) PRIMARY KEY,
    country_id VARCHAR(64) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schools (
    id VARCHAR(64) PRIMARY KEY,
    governorate_id VARCHAR(64) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    FOREIGN KEY (governorate_id) REFERENCES governorates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS academic_stages (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grades (
    id VARCHAR(64) PRIMARY KEY,
    stage_id VARCHAR(64) NOT NULL,
    code VARCHAR(64) UNIQUE NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 1,
    FOREIGN KEY (stage_id) REFERENCES academic_stages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(64) PRIMARY KEY,
    grade_id VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    icon VARCHAR(64) DEFAULT 'BookOpen',
    sort_order INT NOT NULL DEFAULT 1,
    UNIQUE KEY uq_grade_subject (grade_id, code),
    FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    country_id VARCHAR(64),
    governorate_id VARCHAR(64),
    school_id VARCHAR(64),
    school_name VARCHAR(255),
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    section VARCHAR(64),
    school_type VARCHAR(64),
    max_devices INT DEFAULT 2,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (academic_stage_id) REFERENCES academic_stages(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id)
);

CREATE TABLE IF NOT EXISTS user_active_devices (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    device_name VARCHAR(128),
    ip_address VARCHAR(64),
    last_active_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_user (user_id),
    UNIQUE KEY uq_user_device (user_id, device_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    school_id VARCHAR(64),
    school_name VARCHAR(255),
    specialization VARCHAR(255),
    governorate_id VARCHAR(64),
    subject_id VARCHAR(64),
    supervisor_id VARCHAR(64),
    grade_id VARCHAR(64),
    academic_stage_id VARCHAR(64),
    assigned_subjects TEXT,
    assigned_grades TEXT,
    teaching_assignments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(64) PRIMARY KEY,
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NOT NULL,
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    teacher_id VARCHAR(64),
    file_url VARCHAR(500),
    file_size BIGINT DEFAULT 0,
    total_pages INT DEFAULT 0,
    processing_status VARCHAR(64) DEFAULT 'COMPLETED',
    processing_error TEXT,
    school_type VARCHAR(64) DEFAULT 'كلاهما',
    term INT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (academic_stage_id) REFERENCES academic_stages(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS book_chapters (
    id VARCHAR(64) PRIMARY KEY,
    book_id VARCHAR(64) NOT NULL,
    chapter_number INT NOT NULL,
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NOT NULL,
    description TEXT,
    start_page INT DEFAULT 1,
    end_page INT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS book_pages (
    id VARCHAR(64) PRIMARY KEY,
    book_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    raw_text LONGTEXT NOT NULL,
    char_count INT DEFAULT 0,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    UNIQUE KEY uq_book_page (book_id, page_number)
);

CREATE TABLE IF NOT EXISTS book_chunks (
    id VARCHAR(64) PRIMARY KEY,
    book_id VARCHAR(64) NOT NULL,
    chapter_id VARCHAR(64),
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    chunk_index INT NOT NULL,
    content LONGTEXT NOT NULL,
    metadata TEXT,
    embedding LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS question_banks (
    id VARCHAR(64) PRIMARY KEY,
    subject_id VARCHAR(64) NOT NULL,
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (academic_stage_id) REFERENCES academic_stages(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS question_bank_items (
    id VARCHAR(64) PRIMARY KEY,
    bank_id VARCHAR(64) NOT NULL,
    chapter_id VARCHAR(64),
    question_text TEXT NOT NULL,
    question_type VARCHAR(64) DEFAULT 'MULTIPLE_CHOICE',
    difficulty VARCHAR(32) DEFAULT 'MEDIUM',
    bloom_level VARCHAR(64) DEFAULT 'COMPREHENSION',
    explanation TEXT,
    source_chunk_id VARCHAR(64),
    page_reference INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS question_bank_options (
    id VARCHAR(64) PRIMARY KEY,
    question_item_id VARCHAR(64) NOT NULL,
    option_text TEXT NOT NULL,
    is_correct INT DEFAULT 0,
    FOREIGN KEY (question_item_id) REFERENCES question_bank_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(64) PRIMARY KEY,
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NOT NULL,
    teacher_id VARCHAR(64) NOT NULL,
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    governorate_id VARCHAR(64),
    book_id VARCHAR(64),
    chapter_id VARCHAR(64),
    duration_minutes INT DEFAULT 30,
    is_published INT DEFAULT 0,
    is_style_reference TINYINT NOT NULL DEFAULT 0,
    school_type VARCHAR(64) DEFAULT 'كلاهما',
    term INT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (academic_stage_id) REFERENCES academic_stages(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    question_item_id VARCHAR(64),
    question_text TEXT NOT NULL,
    question_type VARCHAR(64) DEFAULT 'MULTIPLE_CHOICE',
    points INT DEFAULT 1,
    page_reference VARCHAR(64),
    explanation TEXT,
    order_index INT DEFAULT 1,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_question_options (
    id VARCHAR(64) PRIMARY KEY,
    question_id VARCHAR(64) NOT NULL,
    option_text TEXT NOT NULL,
    is_correct INT DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id VARCHAR(64) PRIMARY KEY,
    exam_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    score DOUBLE DEFAULT 0,
    total_points INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'COMPLETED',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_answers (
    id VARCHAR(64) PRIMARY KEY,
    attempt_id VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    selected_option_id VARCHAR(64),
    answer_text TEXT,
    is_correct INT DEFAULT 0,
    points_awarded DOUBLE DEFAULT 0,
    FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    book_id VARCHAR(64) NOT NULL,
    chapter_id VARCHAR(64),
    subject_id VARCHAR(64) NOT NULL,
    score DOUBLE DEFAULT 0,
    total_questions INT DEFAULT 0,
    questions_data LONGTEXT NOT NULL,
    student_answers_data LONGTEXT NOT NULL,
    evaluation_report LONGTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE SET NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_topic_mastery (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    chapter_id VARCHAR(64) NOT NULL,
    total_attempted INT DEFAULT 0,
    total_correct INT DEFAULT 0,
    mastery_percentage DOUBLE DEFAULT 0,
    status VARCHAR(32) DEFAULT 'NEEDS_WORK',
    weak_subtopics LONGTEXT,
    strong_subtopics LONGTEXT,
    last_assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_subject_chapter (student_id, subject_id, chapter_id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_learning_history (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    reference_id VARCHAR(64),
    subject_id VARCHAR(64),
    chapter_id VARCHAR(64),
    score_percentage DOUBLE DEFAULT 0,
    weak_areas LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
    FOREIGN KEY (chapter_id) REFERENCES book_chapters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS shared_cached_exams (
    id VARCHAR(64) PRIMARY KEY,
    config_key TEXT NOT NULL,
    config_hash VARCHAR(64) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    version_number INT NOT NULL DEFAULT 1,
    book_id VARCHAR(64) NOT NULL,
    academic_stage_id VARCHAR(64) NOT NULL,
    grade_id VARCHAR(64) NOT NULL,
    subject_id VARCHAR(64) NOT NULL,
    term INT NOT NULL DEFAULT 1,
    school_type VARCHAR(64) NOT NULL DEFAULT 'كلاهما',
    unit_ids TEXT NOT NULL,
    unit_set_key TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    param_hash VARCHAR(64) NOT NULL,
    questions_data LONGTEXT NOT NULL,
    total_questions INT NOT NULL DEFAULT 0,
    provenance_verified INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cached_config_hash (config_hash),
    UNIQUE KEY uq_config_content (config_hash, content_hash),
    INDEX idx_cached_exam_book (book_id),
    INDEX idx_cached_exam_curriculum (academic_stage_id, grade_id, subject_id, term),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (academic_stage_id) REFERENCES academic_stages(id),
    FOREIGN KEY (grade_id) REFERENCES grades(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS student_exam_assignments (
    id VARCHAR(64) PRIMARY KEY,
    cached_exam_id VARCHAR(64) NOT NULL,
    student_id VARCHAR(64) NOT NULL,
    config_hash VARCHAR(64) NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) DEFAULT 'ASSIGNED',
    UNIQUE KEY uq_student_cached_exam (student_id, cached_exam_id),
    INDEX idx_asgn_student_config (student_id, config_hash),
    INDEX idx_asgn_exam (cached_exam_id),
    INDEX idx_asgn_student (student_id),
    FOREIGN KEY (cached_exam_id) REFERENCES shared_cached_exams(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_usage_metrics (
    id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(32) NOT NULL,
    student_id VARCHAR(64),
    book_id VARCHAR(64),
    chapter_id VARCHAR(64),
    config_hash VARCHAR(64),
    cached_exam_id VARCHAR(64),
    model_name VARCHAR(64),
    prompt_tokens INT DEFAULT 0,
    candidates_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    estimated_cost_usd DOUBLE DEFAULT 0,
    duration_ms INT DEFAULT 0,
    error_code VARCHAR(64),
    is_estimated TINYINT NOT NULL DEFAULT 0,
    call_purpose VARCHAR(64) NOT NULL DEFAULT 'EXAM_GENERATION',
    correlation_id VARCHAR(64) NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    cached_tokens INT NOT NULL DEFAULT 0,
    cost_status VARCHAR(32) NOT NULL DEFAULT 'ESTIMATED',
    grade_id VARCHAR(64) NULL,
    subject_id VARCHAR(64) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metric_event (event_type),
    INDEX idx_metric_created (created_at),
    INDEX idx_metric_config (config_hash),
    INDEX idx_metric_cached_exam (cached_exam_id)
);

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
