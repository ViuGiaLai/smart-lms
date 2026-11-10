-- ============================================================
-- Smart LMS – Reference SQL Schema (PostgreSQL)
-- Generated: 2026-11-10  |  Source: backend/app/models/*.py
--
-- ⚠️  CHỈ ĐỂ ĐỐI CHIẾU — KHÔNG THỰC THI FILE NÀY.
--     Migration được quản lý bởi Alembic.
--     Chạy migration: cd backend && alembic upgrade head
-- ============================================================

-- Enums
CREATE TYPE userrole AS ENUM ('student', 'instructor', 'admin');
CREATE TYPE coursestatus AS ENUM ('draft', 'published', 'archived');
CREATE TYPE discoverystatus AS ENUM ('pending', 'approved', 'rejected', 'converted');

-- ── users ───────────────────────────────────────────────────
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(255)  NOT NULL UNIQUE,
    name             VARCHAR(255)  NOT NULL,
    hashed_password  VARCHAR(255)  NOT NULL,
    role             userrole      NOT NULL DEFAULT 'student',
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    avatar_url       VARCHAR(512),
    token_version    INTEGER       NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_users_id    ON users (id);
CREATE INDEX ix_users_email ON users (email);

-- ── learning_categories ─────────────────────────────────────
CREATE TABLE learning_categories (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(255)  NOT NULL,
    slug         VARCHAR(255)  NOT NULL,
    description  TEXT,
    icon         VARCHAR(64),
    parent_id    INTEGER REFERENCES learning_categories(id) ON DELETE SET NULL,
    order_index  INTEGER       NOT NULL DEFAULT 0,
    is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_learning_categories_slug UNIQUE (slug)
);
CREATE INDEX ix_learning_categories_id        ON learning_categories (id);
CREATE INDEX ix_learning_categories_slug      ON learning_categories (slug);
CREATE INDEX ix_learning_categories_parent_id ON learning_categories (parent_id);

-- ── education_levels ────────────────────────────────────────
CREATE TABLE education_levels (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL,
    code         VARCHAR(50)   NOT NULL,
    description  TEXT,
    order_index  INTEGER       NOT NULL DEFAULT 0,
    is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_education_levels_code UNIQUE (code)
);
CREATE INDEX ix_education_levels_id   ON education_levels (id);
CREATE INDEX ix_education_levels_code ON education_levels (code);

-- ── courses ─────────────────────────────────────────────────
CREATE TABLE courses (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(512)   NOT NULL,
    slug                VARCHAR(255)   NOT NULL,
    description         TEXT,
    instructor_id       INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price               NUMERIC(12,2)  NOT NULL DEFAULT 0.00,
    thumbnail           VARCHAR(512),
    status              coursestatus   NOT NULL DEFAULT 'draft',
    category            VARCHAR(255),
    level               VARCHAR(50),
    category_id         INTEGER REFERENCES learning_categories(id) ON DELETE SET NULL,
    education_level_id  INTEGER REFERENCES education_levels(id) ON DELETE SET NULL,
    grade_label         VARCHAR(100),
    proficiency_level   VARCHAR(50),
    target_audience     VARCHAR(255),
    language            VARCHAR(20) DEFAULT 'vi',
    outcomes            JSON,
    prerequisites       JSON,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_courses_slug UNIQUE (slug)
);
CREATE INDEX ix_courses_id                 ON courses (id);
CREATE INDEX ix_courses_slug               ON courses (slug);
CREATE INDEX ix_courses_instructor_id      ON courses (instructor_id);
CREATE INDEX ix_courses_category_id        ON courses (category_id);
CREATE INDEX ix_courses_education_level_id ON courses (education_level_id);

-- ── lessons ─────────────────────────────────────────────────
CREATE TABLE lessons (
    id                 SERIAL PRIMARY KEY,
    course_id          INTEGER       NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title              VARCHAR(512)  NOT NULL,
    description        TEXT,
    video_url          VARCHAR(1024),
    duration           INTEGER       NOT NULL DEFAULT 0,
    order_index        INTEGER       NOT NULL DEFAULT 0,
    transcript         TEXT,
    resources_url      VARCHAR(1024),
    youtube_video_id   VARCHAR(32),
    subtitle_status    VARCHAR(20)   NOT NULL DEFAULT 'none',
    subtitle_language  VARCHAR(16),
    subtitle_srt       TEXT,
    subtitle_checksum  VARCHAR(64),
    subtitle_error     TEXT,
    source_type        VARCHAR(20)   NOT NULL DEFAULT 'manual',
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_lessons_id               ON lessons (id);
CREATE INDEX ix_lessons_course_id        ON lessons (course_id);
CREATE INDEX ix_lessons_youtube_video_id ON lessons (youtube_video_id);

-- ── lesson_materials ────────────────────────────────────────
CREATE TABLE lesson_materials (
    id            SERIAL PRIMARY KEY,
    lesson_id     INTEGER        NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    kind          VARCHAR(20)    NOT NULL,
    title         VARCHAR(512)   NOT NULL,
    file_url      VARCHAR(1024)  NOT NULL,
    storage_key   VARCHAR(1024)  UNIQUE,
    mime_type     VARCHAR(255),
    size_bytes    INTEGER,
    status        VARCHAR(20)    NOT NULL DEFAULT 'ready',
    error_message VARCHAR(1024),
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX ix_lesson_materials_id          ON lesson_materials (id);
CREATE INDEX ix_lesson_materials_lesson_id   ON lesson_materials (lesson_id);

-- ── enrollments ─────────────────────────────────────────────
CREATE TABLE enrollments (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id   INTEGER     NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_course_enrollment UNIQUE (user_id, course_id)
);
CREATE INDEX ix_enrollments_id        ON enrollments (id);
CREATE INDEX ix_enrollments_user_id   ON enrollments (user_id);
CREATE INDEX ix_enrollments_course_id ON enrollments (course_id);

-- ── progress ────────────────────────────────────────────────
CREATE TABLE progress (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    lesson_id        INTEGER     NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    percent_complete FLOAT       NOT NULL DEFAULT 0.0,
    is_completed     BOOLEAN     NOT NULL DEFAULT FALSE,
    last_position    INTEGER     NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_lesson_progress UNIQUE (user_id, lesson_id)
);
CREATE INDEX ix_progress_id        ON progress (id);
CREATE INDEX ix_progress_user_id   ON progress (user_id);
CREATE INDEX ix_progress_lesson_id ON progress (lesson_id);

-- ── quizzes ─────────────────────────────────────────────────
CREATE TABLE quizzes (
    id              SERIAL PRIMARY KEY,
    course_id       INTEGER      NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    lesson_id       INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
    title           VARCHAR(512) NOT NULL,
    description     TEXT,
    time_limit      INTEGER,
    pass_score      FLOAT        NOT NULL DEFAULT 0.6,
    is_ai_generated BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_quizzes_id        ON quizzes (id);
CREATE INDEX ix_quizzes_course_id ON quizzes (course_id);
CREATE INDEX ix_quizzes_lesson_id ON quizzes (lesson_id);

-- ── quiz_questions ──────────────────────────────────────────
CREATE TABLE quiz_questions (
    id             SERIAL PRIMARY KEY,
    quiz_id        INTEGER     NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text  TEXT        NOT NULL,
    options        JSON        NOT NULL DEFAULT '[]',
    correct_answer VARCHAR(10) NOT NULL,
    explanation    TEXT,
    order_index    INTEGER     NOT NULL DEFAULT 0
);
CREATE INDEX ix_quiz_questions_id      ON quiz_questions (id);
CREATE INDEX ix_quiz_questions_quiz_id ON quiz_questions (quiz_id);

-- ── quiz_submissions ────────────────────────────────────────
CREATE TABLE quiz_submissions (
    id           SERIAL PRIMARY KEY,
    quiz_id      INTEGER     NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id      INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    answers      JSON        NOT NULL DEFAULT '{}',
    score        FLOAT       NOT NULL DEFAULT 0.0,
    passed       BOOLEAN     NOT NULL DEFAULT FALSE,
    time_spent   INTEGER,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_quiz_submissions_id      ON quiz_submissions (id);
CREATE INDEX ix_quiz_submissions_quiz_id ON quiz_submissions (quiz_id);
CREATE INDEX ix_quiz_submissions_user_id ON quiz_submissions (user_id);

-- ── course_reviews ──────────────────────────────────────────
CREATE TABLE course_reviews (
    id         SERIAL PRIMARY KEY,
    course_id  INTEGER     NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    rating     INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_review_user UNIQUE (course_id, user_id)
);
CREATE INDEX ix_course_reviews_id         ON course_reviews (id);
CREATE INDEX ix_course_reviews_course_id  ON course_reviews (course_id);
CREATE INDEX ix_course_reviews_created_at ON course_reviews (created_at);

-- ── chat_messages ───────────────────────────────────────────
CREATE TABLE chat_messages (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    lesson_id  INTEGER     NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,
    content    TEXT        NOT NULL,
    sources    JSON,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_chat_messages_id                   ON chat_messages (id);
CREATE INDEX ix_chat_messages_user_id              ON chat_messages (user_id);
CREATE INDEX ix_chat_messages_lesson_id            ON chat_messages (lesson_id);
CREATE INDEX ix_chat_messages_user_lesson_created  ON chat_messages (user_id, lesson_id, created_at);

-- ── ai_message_feedback ─────────────────────────────────────
CREATE TABLE ai_message_feedback (
    id         SERIAL PRIMARY KEY,
    message_id INTEGER     NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    rating     VARCHAR(8)  NOT NULL,
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_feedback_message_user UNIQUE (message_id, user_id)
);
CREATE INDEX ix_ai_message_feedback_id         ON ai_message_feedback (id);
CREATE INDEX ix_ai_message_feedback_message_id ON ai_message_feedback (message_id);
CREATE INDEX ix_ai_message_feedback_user_id    ON ai_message_feedback (user_id);

-- ── ai_usage_logs ───────────────────────────────────────────
-- Note: user_id & lesson_id are soft references (no FK constraint in model)
CREATE TABLE ai_usage_logs (
    id                SERIAL PRIMARY KEY,
    feature           VARCHAR(32)  NOT NULL,
    provider          VARCHAR(32)  NOT NULL DEFAULT 'gemini',
    model             VARCHAR(128),
    prompt_tokens     INTEGER      NOT NULL DEFAULT 0,
    completion_tokens INTEGER      NOT NULL DEFAULT 0,
    total_tokens      INTEGER      NOT NULL DEFAULT 0,
    is_estimated      BOOLEAN      NOT NULL DEFAULT FALSE,
    user_id           INTEGER,
    lesson_id         INTEGER,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_usage_logs_id         ON ai_usage_logs (id);
CREATE INDEX ix_ai_usage_logs_feature    ON ai_usage_logs (feature);
CREATE INDEX ix_ai_usage_logs_user_id    ON ai_usage_logs (user_id);
CREATE INDEX ix_ai_usage_logs_lesson_id  ON ai_usage_logs (lesson_id);
CREATE INDEX ix_ai_usage_logs_created_at ON ai_usage_logs (created_at);

-- ── essay_gradings ──────────────────────────────────────────
CREATE TABLE essay_gradings (
    id               SERIAL PRIMARY KEY,
    instructor_id    INTEGER      NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    course_id        INTEGER REFERENCES courses(id)  ON DELETE SET NULL,
    lesson_id        INTEGER REFERENCES lessons(id)  ON DELETE SET NULL,
    student_name     VARCHAR(255) NOT NULL,
    student_email    VARCHAR(255),
    question         TEXT,
    student_answer   TEXT         NOT NULL,
    reference_answer TEXT,
    rubric           JSON         NOT NULL DEFAULT '[]',
    total_score      FLOAT        NOT NULL,
    max_total_score  FLOAT        NOT NULL DEFAULT 10.0,
    percentage       FLOAT        NOT NULL DEFAULT 0.0,
    grade_level      VARCHAR(8)   NOT NULL DEFAULT 'C',
    criteria_scores  JSON         NOT NULL DEFAULT '[]',
    overall_feedback TEXT,
    strengths        JSON         NOT NULL DEFAULT '[]',
    improvements     JSON         NOT NULL DEFAULT '[]',
    provider         VARCHAR(32)  NOT NULL DEFAULT 'gemini',
    model            VARCHAR(128),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_essay_gradings_id            ON essay_gradings (id);
CREATE INDEX ix_essay_gradings_instructor_id ON essay_gradings (instructor_id);
CREATE INDEX ix_essay_gradings_course_id     ON essay_gradings (course_id);
CREATE INDEX ix_essay_gradings_lesson_id     ON essay_gradings (lesson_id);
CREATE INDEX ix_essay_gradings_created_at    ON essay_gradings (created_at);

-- ── learning_events ─────────────────────────────────────────
CREATE TABLE learning_events (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id        INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    lesson_id        INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
    event_type       VARCHAR(40) NOT NULL,
    duration_seconds INTEGER,
    metadata         JSON,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_learning_events_id                    ON learning_events (id);
CREATE INDEX ix_learning_events_user_id               ON learning_events (user_id);
CREATE INDEX ix_learning_events_course_id             ON learning_events (course_id);
CREATE INDEX ix_learning_events_lesson_id             ON learning_events (lesson_id);
CREATE INDEX ix_learning_events_event_type            ON learning_events (event_type);
CREATE INDEX ix_learning_events_created_at            ON learning_events (created_at);
CREATE INDEX ix_learning_events_course_type_created   ON learning_events (course_id, event_type, created_at);
CREATE INDEX ix_learning_events_user_created          ON learning_events (user_id, created_at);

-- ── password_reset_tokens ───────────────────────────────────
CREATE TABLE password_reset_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_password_reset_tokens_id           ON password_reset_tokens (id);
CREATE INDEX ix_password_reset_tokens_user_id      ON password_reset_tokens (user_id);
CREATE INDEX ix_password_reset_tokens_token_hash   ON password_reset_tokens (token_hash);
CREATE INDEX ix_password_reset_tokens_user_created ON password_reset_tokens (user_id, created_at);

-- ── student_topic_mastery ───────────────────────────────────
CREATE TABLE student_topic_mastery (
    id                    SERIAL PRIMARY KEY,
    user_id               INTEGER      NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id             INTEGER      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    topic_name            VARCHAR(255) NOT NULL,
    mastery_score         FLOAT        NOT NULL DEFAULT 0.0,
    attempts_count        INTEGER      NOT NULL DEFAULT 0,
    weak_points           JSON,
    strong_points         JSON,
    recommended_next_step VARCHAR(512),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_course_topic_mastery UNIQUE (user_id, course_id, topic_name)
);
CREATE INDEX ix_student_topic_mastery_id        ON student_topic_mastery (id);
CREATE INDEX ix_student_topic_mastery_user_id   ON student_topic_mastery (user_id);
CREATE INDEX ix_student_topic_mastery_course_id ON student_topic_mastery (course_id);

-- ── discovery_jobs ──────────────────────────────────────────
CREATE TABLE discovery_jobs (
    id                 SERIAL PRIMARY KEY,
    user_id            INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic              VARCHAR(512)    NOT NULL,
    target_level       VARCHAR(100),
    domain_category    VARCHAR(100),
    status             discoverystatus NOT NULL DEFAULT 'pending',
    summary            TEXT,
    proposed_blueprint JSON,
    created_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX ix_discovery_jobs_id      ON discovery_jobs (id);
CREATE INDEX ix_discovery_jobs_user_id ON discovery_jobs (user_id);

-- ── discovery_items ─────────────────────────────────────────
CREATE TABLE discovery_items (
    id            SERIAL PRIMARY KEY,
    job_id        INTEGER         NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
    item_type     VARCHAR(50)     NOT NULL,
    title         VARCHAR(512)    NOT NULL,
    description   TEXT,
    source_url    VARCHAR(1024),
    provider_name VARCHAR(255),
    metadata_info JSON,
    order_index   INTEGER         NOT NULL DEFAULT 0,
    status        discoverystatus NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX ix_discovery_items_id     ON discovery_items (id);
CREATE INDEX ix_discovery_items_job_id ON discovery_items (job_id);
