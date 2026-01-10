-- ============================================================================
-- Context-Plug Metadata Database Schema (Supabase/PostgreSQL)
-- ============================================================================
-- Purpose: Store exact metadata for ALL content history across integrations
-- Vector embeddings are stored separately in Pinecone (for recent content <30 days)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable text search capabilities
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Core Metadata Table
-- ============================================================================

CREATE TABLE metadata (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL CHECK (source IN ('linear', 'notion', 'jira', 'google_drive', 'slack')),
    external_id VARCHAR(500) NOT NULL, -- Source-specific ID (LIN-123, UUID, etc.)
    
    -- User/Tenant isolation
    user_id VARCHAR(255) NOT NULL, -- Owner who synced this content
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Common searchable fields
    title TEXT, -- Issue title, page title, file name, etc.
    url TEXT, -- Web URL to view the content
    
    -- Source-specific JSON data
    source_data JSONB NOT NULL, -- All source-specific fields stored here
    
    -- Full-text search vector (auto-generated)
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(external_id, ''))
    ) STORED,
    
    -- Soft delete flag
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Unique constraint: one entry per external_id per user
    CONSTRAINT unique_user_source_external UNIQUE (user_id, source, external_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Index for user isolation queries
CREATE INDEX idx_metadata_user_id ON metadata(user_id) WHERE is_archived = FALSE;

-- Index for source filtering
CREATE INDEX idx_metadata_source ON metadata(source) WHERE is_archived = FALSE;

-- Composite index for user + source queries
CREATE INDEX idx_metadata_user_source ON metadata(user_id, source) WHERE is_archived = FALSE;

-- Index for external_id lookups (exact ID match - Level 1 search)
CREATE INDEX idx_metadata_external_id ON metadata(external_id) WHERE is_archived = FALSE;

-- GIN index for full-text search (Level 2 fallback)
CREATE INDEX idx_metadata_search_vector ON metadata USING GIN(search_vector);

-- Index for JSONB queries on source_data
CREATE INDEX idx_metadata_source_data ON metadata USING GIN(source_data);

-- Index for time-based queries (recent content)
CREATE INDEX idx_metadata_created_at ON metadata(created_at DESC);
CREATE INDEX idx_metadata_last_synced ON metadata(last_synced_at DESC);

-- Trigram index for fuzzy title matching (ILIKE queries)
CREATE INDEX idx_metadata_title_trgm ON metadata USING GIN(title gin_trgm_ops);

-- ============================================================================
-- Source-Specific Views (Typed Access)
-- ============================================================================

-- Linear Issues View
CREATE VIEW linear_issues AS
SELECT 
    id,
    external_id,
    user_id,
    created_at,
    updated_at,
    last_synced_at,
    title,
    url,
    (source_data->>'status')::TEXT AS status,
    (source_data->>'priority')::INT AS priority,
    (source_data->>'assignee')::TEXT AS assignee,
    (source_data->>'assignee_id')::TEXT AS assignee_id,
    (source_data->>'team_name')::TEXT AS team_name,
    (source_data->>'description')::TEXT AS description,
    (source_data->'labels')::JSONB AS labels
FROM metadata
WHERE source = 'linear' AND is_archived = FALSE;

-- Notion Pages View
CREATE VIEW notion_pages AS
SELECT 
    id,
    external_id,
    user_id,
    created_at,
    updated_at,
    last_synced_at,
    title,
    url,
    (source_data->>'last_edited_time')::TIMESTAMP WITH TIME ZONE AS last_edited_time,
    (source_data->>'last_edited_by')::TEXT AS last_edited_by,
    (source_data->>'parent_type')::TEXT AS parent_type,
    (source_data->>'parent_id')::TEXT AS parent_id,
    (source_data->>'content_snippet')::TEXT AS content_snippet,
    (source_data->>'is_archived')::BOOLEAN AS is_archived,
    (source_data->>'icon_emoji')::TEXT AS icon_emoji
FROM metadata
WHERE source = 'notion' AND is_archived = FALSE;

-- Jira Issues View
CREATE VIEW jira_issues AS
SELECT 
    id,
    external_id AS key,
    user_id,
    created_at,
    updated_at,
    last_synced_at,
    title AS summary,
    url,
    (source_data->>'status')::TEXT AS status,
    (source_data->>'issue_type')::TEXT AS issue_type,
    (source_data->>'priority')::TEXT AS priority,
    (source_data->>'assignee')::TEXT AS assignee,
    (source_data->>'assignee_email')::TEXT AS assignee_email,
    (source_data->>'reporter')::TEXT AS reporter,
    (source_data->>'project_key')::TEXT AS project_key,
    (source_data->>'project_name')::TEXT AS project_name,
    (source_data->>'description')::TEXT AS description,
    (source_data->'labels')::JSONB AS labels
FROM metadata
WHERE source = 'jira' AND is_archived = FALSE;

-- Google Drive Files View
CREATE VIEW google_drive_files AS
SELECT 
    id,
    external_id AS file_id,
    user_id,
    created_at,
    updated_at,
    last_synced_at,
    title AS name,
    url,
    (source_data->>'mime_type')::TEXT AS mime_type,
    (source_data->>'starred')::BOOLEAN AS starred,
    (source_data->>'trashed')::BOOLEAN AS trashed,
    (source_data->>'parent_folder_id')::TEXT AS parent_folder_id,
    (source_data->>'parent_folder_name')::TEXT AS parent_folder_name,
    (source_data->>'size_bytes')::BIGINT AS size_bytes,
    (source_data->>'modified_time')::TIMESTAMP WITH TIME ZONE AS modified_time,
    (source_data->'owners')::JSONB AS owners,
    (source_data->>'text_preview')::TEXT AS text_preview,
    (source_data->>'thumbnail_link')::TEXT AS thumbnail_link
FROM metadata
WHERE source = 'google_drive' AND is_archived = FALSE;

-- Slack Messages View
CREATE VIEW slack_messages AS
SELECT 
    id,
    external_id,
    user_id,
    created_at,
    updated_at,
    last_synced_at,
    title AS text,
    url AS permalink,
    (source_data->>'channel_id')::TEXT AS channel_id,
    (source_data->>'channel_name')::TEXT AS channel_name,
    (source_data->>'ts')::TEXT AS ts,
    (source_data->>'thread_ts')::TEXT AS thread_ts,
    (source_data->>'author')::TEXT AS author,
    (source_data->>'author_id')::TEXT AS author_id,
    (source_data->>'thread_summary')::TEXT AS thread_summary,
    (source_data->'reactions')::JSONB AS reactions,
    (source_data->>'has_attachments')::BOOLEAN AS has_attachments,
    (source_data->>'is_bot_message')::BOOLEAN AS is_bot_message
FROM metadata
WHERE source = 'slack' AND is_archived = FALSE;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_metadata_updated_at
    BEFORE UPDATE ON metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to clean up old archived content (optional - run periodically)
CREATE OR REPLACE FUNCTION cleanup_archived_metadata(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM metadata
    WHERE is_archived = TRUE
    AND updated_at < NOW() - MAKE_INTERVAL(days => days_to_keep);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent content IDs for vector sync
CREATE OR REPLACE FUNCTION get_recent_content_ids(days_ago INT DEFAULT 30)
RETURNS TABLE(id UUID, source VARCHAR, external_id VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.source, m.external_id
    FROM metadata m
    WHERE m.created_at >= NOW() - MAKE_INTERVAL(days => days_ago)
    AND m.is_archived = FALSE
    ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on metadata table
ALTER TABLE metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own content
CREATE POLICY user_isolation_policy ON metadata
    FOR ALL
    USING (user_id = current_setting('app.user_id', TRUE));

-- ============================================================================
-- Sample Data Insert Helper (for testing)
-- ============================================================================

-- Function to insert a Linear issue
CREATE OR REPLACE FUNCTION insert_linear_issue(
    p_user_id VARCHAR,
    p_external_id VARCHAR,
    p_title TEXT,
    p_status VARCHAR,
    p_description TEXT,
    p_assignee VARCHAR DEFAULT NULL,
    p_team_name VARCHAR DEFAULT 'Engineering',
    p_url TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO metadata (user_id, source, external_id, title, url, source_data)
    VALUES (
        p_user_id,
        'linear',
        p_external_id,
        p_title,
        COALESCE(p_url, 'https://linear.app/issue/' || p_external_id),
        jsonb_build_object(
            'status', p_status,
            'priority', 2,
            'assignee', p_assignee,
            'team_name', p_team_name,
            'description', p_description,
            'labels', '[]'::jsonb
        )
    )
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE metadata IS 'Central metadata store for all integrated content sources';
COMMENT ON COLUMN metadata.external_id IS 'Source-specific ID (e.g., LIN-123 for Linear, UUID for Notion)';
COMMENT ON COLUMN metadata.source_data IS 'JSONB storage for source-specific fields - flexible schema per integration';
COMMENT ON COLUMN metadata.search_vector IS 'Auto-generated tsvector for full-text search on title + external_id';

