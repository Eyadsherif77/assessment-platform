-- منصة التقييم من أجل التعليم - SQLite Schema
-- Compatible with better-sqlite3; UUIDs stored as TEXT, vectors as TEXT (JSON array)

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- 1. Identity & Reference Data
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    super_id TEXT,
    hybrid_id TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN', 'CENTRAL_ADMIN', 'GOVERNORATE_ADMIN', 'SUPERVISOR')),
    full_name TEXT NOT NULL,
    governorate_id TEXT,
    subject_id TEXT,
    created_by TEXT,
    permissions TEXT DEFAULT '{"can_upload_books":true,"can_create_exams":true,"can_delete_content":true,"can_view_analytics":true,"is_active":true}',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS countries (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS governorates (
    id TEXT PRIMARY KEY,
    country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    governorate_id TEXT NOT NULL REFERENCES governorates(id) ON DELETE CASCADE,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_stages (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    stage_id TEXT NOT NULL REFERENCES academic_stages(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon TEXT DEFAULT 'BookOpen',
    sort_order INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_grade_subject UNIQUE (grade_id, code)
);

-- 2. User Profiles
CREATE TABLE IF NOT EXISTS student_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    country_id TEXT REFERENCES countries(id),
    governorate_id TEXT REFERENCES governorates(id),
    school_id TEXT REFERENCES schools(id),
    school_name TEXT,
    academic_stage_id TEXT NOT NULL REFERENCES academic_stages(id),
    grade_id TEXT NOT NULL REFERENCES grades(id),
    section TEXT,
    school_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    school_id TEXT REFERENCES schools(id),
    school_name TEXT,
    specialization TEXT,
    governorate_id TEXT REFERENCES governorates(id),
    subject_id TEXT REFERENCES subjects(id),
    supervisor_id TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. Books, Chapters, Pages & Semantic Chunks
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    academic_stage_id TEXT NOT NULL REFERENCES academic_stages(id) ON DELETE RESTRICT,
    grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    file_url TEXT,
    file_size INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    processing_status TEXT DEFAULT 'COMPLETED' CHECK (processing_status IN ('PENDING', 'EXTRACTING', 'EMBEDDING', 'COMPLETED', 'FAILED')),
    processing_error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description TEXT,
    start_page INTEGER DEFAULT 1,
    end_page INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_pages (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    char_count INTEGER DEFAULT 0,
    CONSTRAINT uq_book_page UNIQUE (book_id, page_number)
);

CREATE TABLE IF NOT EXISTS book_chunks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
    academic_stage_id TEXT NOT NULL REFERENCES academic_stages(id),
    grade_id TEXT NOT NULL REFERENCES grades(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    embedding TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 4. Question Bank (Reusable across exams and evaluations)
CREATE TABLE IF NOT EXISTS question_banks (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    academic_stage_id TEXT NOT NULL REFERENCES academic_stages(id),
    grade_id TEXT NOT NULL REFERENCES grades(id),
    title TEXT NOT NULL,
    description TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_bank_items (
    id TEXT PRIMARY KEY,
    bank_id TEXT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'MULTIPLE_CHOICE' CHECK (question_type IN ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER')),
    difficulty TEXT DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    bloom_level TEXT DEFAULT 'COMPREHENSION',
    explanation TEXT,
    source_chunk_id TEXT REFERENCES book_chunks(id) ON DELETE SET NULL,
    page_reference INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_bank_options (
    id TEXT PRIMARY KEY,
    question_item_id TEXT NOT NULL REFERENCES question_bank_items(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct INTEGER DEFAULT 0
);

-- 5. Exams & Live Evaluations
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    academic_stage_id TEXT NOT NULL REFERENCES academic_stages(id),
    grade_id TEXT NOT NULL REFERENCES grades(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    governorate_id TEXT REFERENCES governorates(id),
    book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
    chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
    duration_minutes INTEGER DEFAULT 30,
    is_published INTEGER DEFAULT 0,
    school_type TEXT DEFAULT 'كلاهما',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_questions (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_item_id TEXT REFERENCES question_bank_items(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    question_type TEXT DEFAULT 'MULTIPLE_CHOICE',
    points INTEGER DEFAULT 1,
    page_reference TEXT,
    explanation TEXT,
    order_index INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS exam_question_options (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score REAL DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_answers (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    selected_option_id TEXT REFERENCES exam_question_options(id) ON DELETE SET NULL,
    answer_text TEXT,
    is_correct INTEGER DEFAULT 0,
    points_awarded REAL DEFAULT 0
);

-- 6. AI Grounded Evaluations & Targeted Study Guidance
CREATE TABLE IF NOT EXISTS ai_evaluations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    score REAL DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    questions_data TEXT NOT NULL DEFAULT '[]',
    student_answers_data TEXT NOT NULL DEFAULT '[]',
    evaluation_report TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- 7. Longitudinal Student Learning Analytics
CREATE TABLE IF NOT EXISTS student_topic_mastery (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL REFERENCES book_chapters(id) ON DELETE CASCADE,
    total_attempted INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    mastery_percentage REAL DEFAULT 0,
    status TEXT DEFAULT 'NEEDS_WORK' CHECK (status IN ('NEEDS_WORK', 'DEVELOPING', 'PROFICIENT', 'MASTERED')),
    weak_subtopics TEXT DEFAULT '[]',
    strong_subtopics TEXT DEFAULT '[]',
    last_assessed_at TEXT DEFAULT (datetime('now')),
    CONSTRAINT uq_student_subject_chapter UNIQUE (student_id, subject_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS student_learning_history (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('EXAM', 'AI_ASSESSMENT')),
    reference_id TEXT,
    subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
    chapter_id TEXT REFERENCES book_chapters(id) ON DELETE SET NULL,
    score_percentage REAL DEFAULT 0,
    weak_areas TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT
);


-- High-performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_role_email ON users(role, email);
CREATE INDEX IF NOT EXISTS idx_student_profiles_stage_grade ON student_profiles(academic_stage_id, grade_id);
CREATE INDEX IF NOT EXISTS idx_books_stage_grade_subject ON books(academic_stage_id, grade_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_chunks_stage_grade_subject_chapter ON book_chunks(academic_stage_id, grade_id, subject_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_exams_stage_grade_published ON exams(academic_stage_id, grade_id, is_published);
CREATE INDEX IF NOT EXISTS idx_attempts_student_exam ON exam_attempts(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_ai_evaluations_student ON ai_evaluations(student_id, subject_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_lookup ON student_topic_mastery(student_id, subject_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_learning_history_student ON student_learning_history(student_id, created_at);
