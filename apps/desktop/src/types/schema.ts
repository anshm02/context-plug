/**
 * Data Schema for Context-Plug Metadata DB
 * 
 * Architecture:
 * - Metadata DB: Supabase (PostgreSQL) - Stores ALL history
 * - Vector DB: Pinecone (Serverless) - Stores embeddings for recent content (<30 days)
 * - Embeddings: OpenAI text-embedding-3-small (1536 dimensions)
 */

// ============================================================================
// Base Types
// ============================================================================

export type IntegrationSource = 'linear' | 'notion' | 'jira' | 'google_drive' | 'slack';

export interface BaseMetadata {
  id: string; // UUID (Primary Key in Supabase)
  source: IntegrationSource;
  external_id: string; // Source-specific ID (LIN-123, PROJ-456, etc.)
  user_id: string; // Owner/User who synced this content
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  last_synced_at: string; // ISO 8601
  title: string; // Common title field
  url: string; // Common URL field
  source_data: Record<string, unknown>; // JSONB storage for source-specific fields
  is_archived: boolean;
}

// ============================================================================
// Source-Specific Schemas
// ============================================================================

/**
 * Linear Issues
 * Example: LIN-123, ENG-456
 */
export interface LinearIssueMetadata extends BaseMetadata {
  source: 'linear';
  external_id: string; // Format: [A-Z]+-\d+ (e.g., LIN-123)
  title: string;
  status: string; // 'Todo' | 'In Progress' | 'Done' | 'Canceled'
  priority: number; // 0-4 (0=No priority, 4=Urgent)
  assignee: string | null; // User email or name
  assignee_id: string | null;
  team_name: string;
  url: string;
  description: string; // VECTORIZED - Stored in Pinecone if <30 days
  labels: string[]; // JSON array of label names
}

/**
 * Notion Pages
 * Uses UUIDs as IDs
 */
export interface NotionPageMetadata extends BaseMetadata {
  source: 'notion';
  external_id: string; // UUID (32 chars with hyphens)
  title: string;
  url: string;
  last_edited_time: string; // ISO 8601
  last_edited_by: string | null;
  parent_type: 'workspace' | 'page' | 'database';
  parent_id: string | null;
  content_snippet: string; // First ~500 chars - VECTORIZED
  is_archived: boolean;
  icon_emoji: string | null;
}

/**
 * Jira Issues
 * Example: PROJ-123, TEAM-456
 */
export interface JiraIssueMetadata extends BaseMetadata {
  source: 'jira';
  external_id: string; // Format: [A-Z]+-\d+ (e.g., PROJ-123)
  key: string; // Same as external_id (for clarity)
  summary: string; // VECTORIZED - The title/summary of the issue
  status: string; // 'To Do' | 'In Progress' | 'Done' | etc.
  issue_type: string; // 'Story' | 'Bug' | 'Task' | 'Epic'
  priority: string; // 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest'
  assignee: string | null;
  assignee_email: string | null;
  reporter: string | null;
  project_key: string;
  project_name: string;
  url: string;
  description: string | null; // VECTORIZED
  labels: string[];
}

/**
 * Google Drive Files
 * Supports Docs, Sheets, PDFs, etc.
 */
export interface GoogleDriveFileMetadata extends BaseMetadata {
  source: 'google_drive';
  external_id: string; // Google Drive file ID
  name: string;
  mime_type: string; // 'application/vnd.google-apps.document' | 'application/pdf' | etc.
  url: string; // Web view link
  starred: boolean;
  trashed: boolean;
  parent_folder_id: string | null;
  parent_folder_name: string | null;
  size_bytes: number | null; // Null for Google native formats
  modified_time: string; // ISO 8601
  owners: string[]; // Array of owner emails
  text_preview: string; // First ~1000 chars - VECTORIZED
  thumbnail_link: string | null;
}

/**
 * Slack Messages
 * Includes threads and channel messages
 */
export interface SlackMessageMetadata extends BaseMetadata {
  source: 'slack';
  external_id: string; // Format: channelId-timestamp (C123ABC-1234567890.123456)
  channel_id: string;
  channel_name: string;
  ts: string; // Slack timestamp (unique per channel)
  thread_ts: string | null; // Parent message timestamp if in thread
  author: string; // User display name
  author_id: string; // Slack user ID
  text: string; // Message text
  thread_summary: string | null; // VECTORIZED - AI-generated summary if thread
  permalink: string;
  reactions: Array<{ name: string; count: number }>; // Emoji reactions
  has_attachments: boolean;
  is_bot_message: boolean;
}

// ============================================================================
// Union Type for All Metadata
// ============================================================================

export type AnyMetadata =
  | LinearIssueMetadata
  | NotionPageMetadata
  | JiraIssueMetadata
  | GoogleDriveFileMetadata
  | SlackMessageMetadata;

// ============================================================================
// Vector Store Schema (Pinecone)
// ============================================================================

export interface VectorMetadata {
  id: string; // Same as Supabase UUID
  source: IntegrationSource;
  external_id: string;
  user_id: string;
  title: string; // For display in search results
  url: string;
  created_at: string;
  chunk_index: number; // For long content split into chunks (0 for single-chunk items)
}

export interface PineconeVector {
  id: string; // Format: {supabase_uuid}_{chunk_index}
  values: number[]; // Embedding vector (1536 dimensions)
  metadata: VectorMetadata;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  id: string;
  source: IntegrationSource;
  external_id: string;
  title: string;
  url: string;
  snippet: string;
  score: number; // 0-1 (higher = better match)
  match_type: 'exact_id' | 'exact_title' | 'semantic' | 'hybrid';
  metadata: Partial<AnyMetadata>; // Additional fields based on source
}

export interface SearchOptions {
  sources?: IntegrationSource[]; // Filter by source
  limit?: number; // Default: 10
  min_score?: number; // Default: 0.7 for semantic search
  include_archived?: boolean; // Default: false
}

// ============================================================================
// Database Query Types
// ============================================================================

export interface MetadataQueryParams {
  user_id: string;
  sources?: IntegrationSource[];
  external_id?: string;
  title_pattern?: string; // For ILIKE queries
  created_after?: string; // ISO 8601
  created_before?: string; // ISO 8601
  limit?: number;
}

export interface VectorQueryParams {
  embedding: number[];
  user_id: string;
  sources?: IntegrationSource[];
  top_k?: number; // Default: 10
  min_score?: number; // Default: 0.7
}

