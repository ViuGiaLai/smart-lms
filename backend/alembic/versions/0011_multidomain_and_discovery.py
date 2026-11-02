"""add multi-domain learning categories, education levels, ai discovery, and topic mastery

Revision ID: 0011_multidomain_and_discovery
Revises: 0010_youtube_import
Create Date: 2026-10-31

Master specification:
- Dynamic learning categories (tree hierarchy)
- Independent education levels
- Course metadata: category_id, education_level_id, grade_label, proficiency_level, target_audience, language
- AI Discovery jobs and items
- Student topic mastery tracking
"""

from __future__ import annotations
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0011_multidomain_and_discovery"
down_revision: Union[str, None] = "0010_youtube_import"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Learning categories
    op.execute("""
        CREATE TABLE IF NOT EXISTS learning_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            icon VARCHAR(64),
            parent_id INTEGER REFERENCES learning_categories(id) ON DELETE SET NULL,
            order_index INTEGER DEFAULT 0 NOT NULL,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_learning_categories_parent_id ON learning_categories(parent_id);
        CREATE INDEX IF NOT EXISTS ix_learning_categories_slug ON learning_categories(slug);
    """)

    # 2. Education levels
    op.execute("""
        CREATE TABLE IF NOT EXISTS education_levels (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) NOT NULL UNIQUE,
            description TEXT,
            order_index INTEGER DEFAULT 0 NOT NULL,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_education_levels_code ON education_levels(code);
    """)

    # 3. Courses metadata
    op.execute("""
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES learning_categories(id) ON DELETE SET NULL;
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS education_level_id INTEGER REFERENCES education_levels(id) ON DELETE SET NULL;
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS grade_label VARCHAR(100);
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS proficiency_level VARCHAR(50);
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_audience VARCHAR(255);
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'vi';
        CREATE INDEX IF NOT EXISTS ix_courses_category_id ON courses(category_id);
        CREATE INDEX IF NOT EXISTS ix_courses_education_level_id ON courses(education_level_id);
    """)

    # 4. Discovery tables
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE discoverystatus AS ENUM ('pending', 'approved', 'rejected', 'converted');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        CREATE TABLE IF NOT EXISTS discovery_jobs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            topic VARCHAR(512) NOT NULL,
            target_level VARCHAR(100),
            domain_category VARCHAR(100),
            status discoverystatus DEFAULT 'pending' NOT NULL,
            summary TEXT,
            proposed_blueprint JSON,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_discovery_jobs_user_id ON discovery_jobs(user_id);

        CREATE TABLE IF NOT EXISTS discovery_items (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
            item_type VARCHAR(50) NOT NULL,
            title VARCHAR(512) NOT NULL,
            description TEXT,
            source_url VARCHAR(1024),
            provider_name VARCHAR(255),
            metadata_info JSON,
            order_index INTEGER DEFAULT 0 NOT NULL,
            status discoverystatus DEFAULT 'pending' NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_discovery_items_job_id ON discovery_items(job_id);
    """)

    # 5. Topic mastery
    op.execute("""
        CREATE TABLE IF NOT EXISTS student_topic_mastery (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            topic_name VARCHAR(255) NOT NULL,
            mastery_score DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
            attempts_count INTEGER DEFAULT 0 NOT NULL,
            weak_points JSON,
            strong_points JSON,
            recommended_next_step VARCHAR(512),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            CONSTRAINT uq_user_course_topic_mastery UNIQUE (user_id, course_id, topic_name)
        );
        CREATE INDEX IF NOT EXISTS ix_student_topic_mastery_user_id ON student_topic_mastery(user_id);
        CREATE INDEX IF NOT EXISTS ix_student_topic_mastery_course_id ON student_topic_mastery(course_id);
    """)


def downgrade() -> None:
    pass
