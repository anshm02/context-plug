/**
 * Response from the Desktop Context Bridge
 */
export interface ContextResponse {
  /** Whether the request was successful */
  success: boolean;
  /** The context data payload */
  data: string;
  /** Where the data originated from */
  source: string;
}

/**
 * Health check response from the Desktop server
 */
export interface HealthResponse {
  status: "ok" | "error";
  timestamp: number;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

// =============================================================================
// Integration Types
// =============================================================================

/**
 * Supported integration providers
 */
export type IntegrationProvider =
  | "linear"
  | "notion"
  | "google-drive"
  | "google-mail"
  | "jira"
  | "slack";

/**
 * Human-readable integration names and metadata
 */
export const INTEGRATION_METADATA: Record<
  IntegrationProvider,
  {
    name: string;
    description: string;
    icon: string;
    color: string;
  }
> = {
  linear: {
    name: "Linear",
    description: "Issue tracking and project management",
    icon: "linear",
    color: "#5E6AD2",
  },
  notion: {
    name: "Notion",
    description: "Notes, docs, and wikis",
    icon: "notion",
    color: "#000000",
  },
  "google-drive": {
    name: "Google Drive",
    description: "Files and documents",
    icon: "google-drive",
    color: "#4285F4",
  },
  "google-mail": {
    name: "Gmail",
    description: "Email messages",
    icon: "gmail",
    color: "#EA4335",
  },
  jira: {
    name: "Jira",
    description: "Issue and project tracking",
    icon: "jira",
    color: "#0052CC",
  },
  slack: {
    name: "Slack",
    description: "Team messages and channels",
    icon: "slack",
    color: "#4A154B",
  },
};

/**
 * Connection status for an integration
 */
export type ConnectionStatus = "connected" | "disconnected" | "error" | "pending";

/**
 * Single integration status
 */
export interface IntegrationStatus {
  provider: IntegrationProvider;
  status: ConnectionStatus;
  connectionId?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response for listing all integrations
 */
export interface IntegrationsListResponse {
  success: boolean;
  integrations: IntegrationStatus[];
}

/**
 * Response for OAuth connection initiation
 */
export interface OAuthConnectResponse {
  success: boolean;
  authUrl?: string;
  error?: string;
}

/**
 * Response after OAuth callback completion
 */
export interface OAuthCallbackResponse {
  success: boolean;
  provider: IntegrationProvider;
  connectionId?: string;
  error?: string;
}

// =============================================================================
// Content Types
// =============================================================================

/**
 * Base content item from any provider
 */
export interface ContentItem {
  id: string;
  provider: IntegrationProvider;
  type: string;
  title: string;
  content: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Linear-specific content types
 */
export interface LinearIssue extends ContentItem {
  provider: "linear";
  type: "issue";
  metadata: {
    state: string;
    priority: number;
    assignee?: string;
    project?: string;
    labels?: string[];
  };
}

/**
 * Notion-specific content types
 */
export interface NotionPage extends ContentItem {
  provider: "notion";
  type: "page" | "database";
  metadata: {
    parentId?: string;
    parentType?: string;
    icon?: string;
  };
}

/**
 * Google Drive-specific content types
 */
export interface GoogleDriveFile extends ContentItem {
  provider: "google-drive";
  type: "file" | "folder" | "document" | "spreadsheet" | "presentation";
  metadata: {
    mimeType: string;
    size?: number;
    owners?: string[];
    shared?: boolean;
  };
}

/**
 * Gmail-specific content types
 */
export interface GmailMessage extends ContentItem {
  provider: "google-mail";
  type: "message";
  metadata: {
    from: string;
    to: string[];
    subject: string;
    snippet: string;
    labels?: string[];
    isUnread?: boolean;
  };
}

/**
 * Jira-specific content types
 */
export interface JiraIssue extends ContentItem {
  provider: "jira";
  type: "issue";
  metadata: {
    key: string;
    status: string;
    issueType: string;
    priority?: string;
    assignee?: string;
    reporter?: string;
    project: string;
  };
}

/**
 * Slack-specific content types
 */
export interface SlackMessage extends ContentItem {
  provider: "slack";
  type: "message" | "channel";
  metadata: {
    channel: string;
    channelName?: string;
    author?: string;
    threadTs?: string;
    reactions?: { name: string; count: number }[];
  };
}

/**
 * Union type for all content items
 */
export type ProviderContent =
  | LinearIssue
  | NotionPage
  | GoogleDriveFile
  | GmailMessage
  | JiraIssue
  | SlackMessage;

/**
 * Response for content fetch
 */
export interface ContentFetchResponse {
  success: boolean;
  provider: IntegrationProvider;
  items: ContentItem[];
  nextCursor?: string;
  totalCount?: number;
}

/**
 * Search request parameters
 */
export interface ContentSearchParams {
  query: string;
  providers?: IntegrationProvider[];
  limit?: number;
  cursor?: string;
}

/**
 * Search response
 */
export interface ContentSearchResponse {
  success: boolean;
  query: string;
  results: ContentItem[];
  totalCount: number;
}

// =============================================================================
// IPC Types (for Electron main/renderer communication)
// =============================================================================

/**
 * IPC channel names
 */
export const IPC_CHANNELS = {
  // Integration management
  GET_INTEGRATIONS: "integrations:get",
  CONNECT_INTEGRATION: "integrations:connect",
  DISCONNECT_INTEGRATION: "integrations:disconnect",
  
  // Content fetching
  FETCH_CONTENT: "content:fetch",
  SEARCH_CONTENT: "content:search",
  
  // OAuth flow
  OAUTH_START: "oauth:start",
  OAUTH_CALLBACK: "oauth:callback",
  OAUTH_COMPLETE: "oauth:complete",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
