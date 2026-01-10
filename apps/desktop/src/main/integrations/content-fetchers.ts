/**
 * Content Fetchers
 * Provider-specific content fetching logic
 */

import type {
  IntegrationProvider,
  ContentItem,
  LinearIssue,
  NotionPage,
  GoogleDriveFile,
  GmailMessage,
  JiraIssue,
  SlackMessage,
} from "@context-plug/shared";
import { getNangoService } from "./nango-service";

/**
 * Base interface for content fetcher
 */
interface ContentFetcher {
  fetchContent(connectionId: string, options?: FetchOptions): Promise<ContentItem[]>;
  search?(connectionId: string, query: string, options?: FetchOptions): Promise<ContentItem[]>;
}

interface FetchOptions {
  limit?: number;
  cursor?: string;
}

// =============================================================================
// Linear Fetcher
// =============================================================================

const linearFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<LinearIssue[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;

    // Linear uses GraphQL
    const query = `
      query Issues($first: Int, $after: String) {
        issues(first: $first, after: $after, orderBy: updatedAt) {
          nodes {
            id
            identifier
            title
            description
            url
            state { name }
            priority
            assignee { name }
            project { name }
            labels { nodes { name } }
            createdAt
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const response = await nango.proxyRequest<{
      data: {
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            description: string | null;
            url: string;
            state: { name: string };
            priority: number;
            assignee: { name: string } | null;
            project: { name: string } | null;
            labels: { nodes: Array<{ name: string }> };
            createdAt: string;
            updatedAt: string;
          }>;
        };
      };
    }>("linear", connectionId, "/graphql", {
      method: "POST",
      body: {
        query,
        variables: { first: limit, after: options.cursor },
      },
    });

    const issues = response.data.data?.issues?.nodes ?? [];

    return issues.map((issue) => ({
      id: issue.id,
      provider: "linear" as const,
      type: "issue" as const,
      title: `${issue.identifier}: ${issue.title}`,
      content: issue.description ?? "",
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      metadata: {
        state: issue.state.name,
        priority: issue.priority,
        assignee: issue.assignee?.name,
        project: issue.project?.name,
        labels: issue.labels.nodes.map((l) => l.name),
      },
    }));
  },
};

// =============================================================================
// Notion Fetcher
// =============================================================================

const notionFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<NotionPage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;

    // Search all pages
    const response = await nango.proxyRequest<{
      results: Array<{
        id: string;
        object: "page" | "database";
        url: string;
        created_time: string;
        last_edited_time: string;
        parent: { type: string; page_id?: string; database_id?: string };
        icon: { type: string; emoji?: string } | null;
        properties: Record<string, { title?: Array<{ plain_text: string }> }>;
      }>;
      next_cursor: string | null;
    }>("notion", connectionId, "/v1/search", {
      method: "POST",
      headers: {
        "Notion-Version": "2022-06-28",
      },
      body: {
        page_size: limit,
        start_cursor: options.cursor,
      },
    });

    const pages = response.data.results ?? [];

    return pages.map((page) => {
      // Extract title from properties
      const titleProp = Object.values(page.properties).find((p) => p.title);
      const title = titleProp?.title?.[0]?.plain_text ?? "Untitled";

      return {
        id: page.id,
        provider: "notion" as const,
        type: page.object as "page" | "database",
        title,
        content: "", // Would need additional API call to get content
        url: page.url,
        createdAt: page.created_time,
        updatedAt: page.last_edited_time,
        metadata: {
          parentId: page.parent.page_id ?? page.parent.database_id,
          parentType: page.parent.type,
          icon: page.icon?.emoji,
        },
      };
    });
  },

  async search(connectionId: string, query: string, options: FetchOptions = {}): Promise<NotionPage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 20;

    const response = await nango.proxyRequest<{
      results: Array<{
        id: string;
        object: "page" | "database";
        url: string;
        created_time: string;
        last_edited_time: string;
        parent: { type: string; page_id?: string; database_id?: string };
        icon: { type: string; emoji?: string } | null;
        properties: Record<string, { title?: Array<{ plain_text: string }> }>;
      }>;
    }>("notion", connectionId, "/v1/search", {
      method: "POST",
      headers: {
        "Notion-Version": "2022-06-28",
      },
      body: {
        query,
        page_size: limit,
      },
    });

    const pages = response.data.results ?? [];

    return pages.map((page) => {
      const titleProp = Object.values(page.properties).find((p) => p.title);
      const title = titleProp?.title?.[0]?.plain_text ?? "Untitled";

      return {
        id: page.id,
        provider: "notion" as const,
        type: page.object as "page" | "database",
        title,
        content: "",
        url: page.url,
        createdAt: page.created_time,
        updatedAt: page.last_edited_time,
        metadata: {
          parentId: page.parent.page_id ?? page.parent.database_id,
          parentType: page.parent.type,
          icon: page.icon?.emoji,
        },
      };
    });
  },
};

// =============================================================================
// Google Drive Fetcher
// =============================================================================

const googleDriveFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<GoogleDriveFile[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;

    const params = new URLSearchParams({
      pageSize: String(limit),
      fields: "files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size,owners,shared),nextPageToken",
      orderBy: "modifiedTime desc",
    });

    if (options.cursor) {
      params.set("pageToken", options.cursor);
    }

    const response = await nango.proxyRequest<{
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        webViewLink: string;
        createdTime: string;
        modifiedTime: string;
        size?: string;
        owners?: Array<{ displayName: string }>;
        shared?: boolean;
      }>;
      nextPageToken?: string;
    }>("google-drive", connectionId, `/drive/v3/files?${params.toString()}`);

    const files = response.data.files ?? [];

    return files.map((file) => {
      // Map MIME type to our type
      let type: GoogleDriveFile["type"] = "file";
      if (file.mimeType === "application/vnd.google-apps.folder") {
        type = "folder";
      } else if (file.mimeType === "application/vnd.google-apps.document") {
        type = "document";
      } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
        type = "spreadsheet";
      } else if (file.mimeType === "application/vnd.google-apps.presentation") {
        type = "presentation";
      }

      return {
        id: file.id,
        provider: "google-drive" as const,
        type,
        title: file.name,
        content: "", // Would need to fetch file content separately
        url: file.webViewLink,
        createdAt: file.createdTime,
        updatedAt: file.modifiedTime,
        metadata: {
          mimeType: file.mimeType,
          size: file.size ? parseInt(file.size, 10) : undefined,
          owners: file.owners?.map((o) => o.displayName),
          shared: file.shared,
        },
      };
    });
  },

  async search(connectionId: string, query: string, options: FetchOptions = {}): Promise<GoogleDriveFile[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 20;

    const params = new URLSearchParams({
      pageSize: String(limit),
      q: `fullText contains '${query.replace(/'/g, "\\'")}'`,
      fields: "files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size,owners,shared)",
    });

    const response = await nango.proxyRequest<{
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        webViewLink: string;
        createdTime: string;
        modifiedTime: string;
        size?: string;
        owners?: Array<{ displayName: string }>;
        shared?: boolean;
      }>;
    }>("google-drive", connectionId, `/drive/v3/files?${params.toString()}`);

    const files = response.data.files ?? [];

    return files.map((file) => {
      let type: GoogleDriveFile["type"] = "file";
      if (file.mimeType === "application/vnd.google-apps.folder") {
        type = "folder";
      } else if (file.mimeType === "application/vnd.google-apps.document") {
        type = "document";
      } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
        type = "spreadsheet";
      } else if (file.mimeType === "application/vnd.google-apps.presentation") {
        type = "presentation";
      }

      return {
        id: file.id,
        provider: "google-drive" as const,
        type,
        title: file.name,
        content: "",
        url: file.webViewLink,
        createdAt: file.createdTime,
        updatedAt: file.modifiedTime,
        metadata: {
          mimeType: file.mimeType,
          size: file.size ? parseInt(file.size, 10) : undefined,
          owners: file.owners?.map((o) => o.displayName),
          shared: file.shared,
        },
      };
    });
  },
};

// =============================================================================
// Gmail Fetcher
// =============================================================================

const gmailFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<GmailMessage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;

    // First, get message list
    const params = new URLSearchParams({
      maxResults: String(limit),
    });

    if (options.cursor) {
      params.set("pageToken", options.cursor);
    }

    const listResponse = await nango.proxyRequest<{
      messages: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>("google-mail", connectionId, `/gmail/v1/users/me/messages?${params.toString()}`);

    const messageIds = listResponse.data.messages ?? [];

    // Fetch full message details (batch would be more efficient)
    const messages = await Promise.all(
      messageIds.slice(0, 20).map(async (msg) => {
        const response = await nango.proxyRequest<{
          id: string;
          snippet: string;
          labelIds: string[];
          payload: {
            headers: Array<{ name: string; value: string }>;
          };
          internalDate: string;
        }>("google-mail", connectionId, `/gmail/v1/users/me/messages/${msg.id}?format=metadata`);

        const data = response.data;
        const headers = data.payload?.headers ?? [];

        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

        return {
          id: data.id,
          provider: "google-mail" as const,
          type: "message" as const,
          title: getHeader("Subject") || "(No Subject)",
          content: data.snippet ?? "",
          createdAt: new Date(parseInt(data.internalDate, 10)).toISOString(),
          metadata: {
            from: getHeader("From"),
            to: getHeader("To").split(",").map((s) => s.trim()),
            subject: getHeader("Subject"),
            snippet: data.snippet,
            labels: data.labelIds,
            isUnread: data.labelIds?.includes("UNREAD"),
          },
        } satisfies GmailMessage;
      })
    );

    return messages;
  },

  async search(connectionId: string, query: string, options: FetchOptions = {}): Promise<GmailMessage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 20;

    const params = new URLSearchParams({
      maxResults: String(limit),
      q: query,
    });

    const listResponse = await nango.proxyRequest<{
      messages: Array<{ id: string; threadId: string }>;
    }>("google-mail", connectionId, `/gmail/v1/users/me/messages?${params.toString()}`);

    const messageIds = listResponse.data.messages ?? [];

    const messages = await Promise.all(
      messageIds.map(async (msg) => {
        const response = await nango.proxyRequest<{
          id: string;
          snippet: string;
          labelIds: string[];
          payload: {
            headers: Array<{ name: string; value: string }>;
          };
          internalDate: string;
        }>("google-mail", connectionId, `/gmail/v1/users/me/messages/${msg.id}?format=metadata`);

        const data = response.data;
        const headers = data.payload?.headers ?? [];

        const getHeader = (name: string) =>
          headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

        return {
          id: data.id,
          provider: "google-mail" as const,
          type: "message" as const,
          title: getHeader("Subject") || "(No Subject)",
          content: data.snippet ?? "",
          createdAt: new Date(parseInt(data.internalDate, 10)).toISOString(),
          metadata: {
            from: getHeader("From"),
            to: getHeader("To").split(",").map((s) => s.trim()),
            subject: getHeader("Subject"),
            snippet: data.snippet,
            labels: data.labelIds,
            isUnread: data.labelIds?.includes("UNREAD"),
          },
        } satisfies GmailMessage;
      })
    );

    return messages;
  },
};

// =============================================================================
// Jira Fetcher
// =============================================================================

const jiraFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<JiraIssue[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;
    const startAt = options.cursor ? parseInt(options.cursor, 10) : 0;

    // First, get accessible resources (cloud IDs)
    const resourcesResponse = await nango.proxyRequest<
      Array<{ id: string; name: string; url: string }>
    >("jira", connectionId, "/oauth/token/accessible-resources");

    const cloudId = resourcesResponse.data[0]?.id;
    if (!cloudId) {
      return [];
    }

    const params = new URLSearchParams({
      maxResults: String(limit),
      startAt: String(startAt),
      fields: "summary,description,status,issuetype,priority,assignee,reporter,project,created,updated",
    });

    const response = await nango.proxyRequest<{
      issues: Array<{
        id: string;
        key: string;
        self: string;
        fields: {
          summary: string;
          description: string | null;
          status: { name: string };
          issuetype: { name: string };
          priority?: { name: string };
          assignee?: { displayName: string };
          reporter?: { displayName: string };
          project: { key: string; name: string };
          created: string;
          updated: string;
        };
      }>;
      total: number;
    }>("jira", connectionId, `/ex/jira/${cloudId}/rest/api/3/search?${params.toString()}`);

    const issues = response.data.issues ?? [];

    return issues.map((issue) => ({
      id: issue.id,
      provider: "jira" as const,
      type: "issue" as const,
      title: `${issue.key}: ${issue.fields.summary}`,
      content: issue.fields.description ?? "",
      url: issue.self.replace("/rest/api/3/issue/", "/browse/"),
      createdAt: issue.fields.created,
      updatedAt: issue.fields.updated,
      metadata: {
        key: issue.key,
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter?.displayName,
        project: issue.fields.project.name,
      },
    }));
  },

  async search(connectionId: string, query: string, options: FetchOptions = {}): Promise<JiraIssue[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 20;

    // First, get accessible resources
    const resourcesResponse = await nango.proxyRequest<
      Array<{ id: string; name: string; url: string }>
    >("jira", connectionId, "/oauth/token/accessible-resources");

    const cloudId = resourcesResponse.data[0]?.id;
    if (!cloudId) {
      return [];
    }

    const jql = `text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    const params = new URLSearchParams({
      maxResults: String(limit),
      jql,
      fields: "summary,description,status,issuetype,priority,assignee,reporter,project,created,updated",
    });

    const response = await nango.proxyRequest<{
      issues: Array<{
        id: string;
        key: string;
        self: string;
        fields: {
          summary: string;
          description: string | null;
          status: { name: string };
          issuetype: { name: string };
          priority?: { name: string };
          assignee?: { displayName: string };
          reporter?: { displayName: string };
          project: { key: string; name: string };
          created: string;
          updated: string;
        };
      }>;
    }>("jira", connectionId, `/ex/jira/${cloudId}/rest/api/3/search?${params.toString()}`);

    const issues = response.data.issues ?? [];

    return issues.map((issue) => ({
      id: issue.id,
      provider: "jira" as const,
      type: "issue" as const,
      title: `${issue.key}: ${issue.fields.summary}`,
      content: issue.fields.description ?? "",
      url: issue.self.replace("/rest/api/3/issue/", "/browse/"),
      createdAt: issue.fields.created,
      updatedAt: issue.fields.updated,
      metadata: {
        key: issue.key,
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype.name,
        priority: issue.fields.priority?.name,
        assignee: issue.fields.assignee?.displayName,
        reporter: issue.fields.reporter?.displayName,
        project: issue.fields.project.name,
      },
    }));
  },
};

// =============================================================================
// Slack Fetcher
// =============================================================================

const slackFetcher: ContentFetcher = {
  async fetchContent(connectionId: string, options: FetchOptions = {}): Promise<SlackMessage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 50;

    // First, get list of channels
    const channelsResponse = await nango.proxyRequest<{
      channels: Array<{
        id: string;
        name: string;
        is_member: boolean;
      }>;
    }>("slack", connectionId, "/conversations.list?types=public_channel,private_channel&limit=20");

    const channels = channelsResponse.data.channels?.filter((c) => c.is_member) ?? [];
    const messages: SlackMessage[] = [];

    // Fetch recent messages from each channel (limited to first 3 channels for performance)
    for (const channel of channels.slice(0, 3)) {
      const historyResponse = await nango.proxyRequest<{
        messages: Array<{
          ts: string;
          text: string;
          user: string;
          thread_ts?: string;
          reactions?: Array<{ name: string; count: number }>;
        }>;
      }>("slack", connectionId, `/conversations.history?channel=${channel.id}&limit=${Math.floor(limit / 3)}`);

      const channelMessages = historyResponse.data.messages ?? [];

      for (const msg of channelMessages) {
        messages.push({
          id: msg.ts,
          provider: "slack" as const,
          type: "message" as const,
          title: msg.text.slice(0, 100) + (msg.text.length > 100 ? "..." : ""),
          content: msg.text,
          createdAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          metadata: {
            channel: channel.id,
            channelName: channel.name,
            author: msg.user,
            threadTs: msg.thread_ts,
            reactions: msg.reactions,
          },
        });
      }
    }

    return messages;
  },

  async search(connectionId: string, query: string, options: FetchOptions = {}): Promise<SlackMessage[]> {
    const nango = getNangoService();
    const limit = options.limit ?? 20;

    const params = new URLSearchParams({
      query,
      count: String(limit),
    });

    const response = await nango.proxyRequest<{
      messages: {
        matches: Array<{
          ts: string;
          text: string;
          user: string;
          channel: { id: string; name: string };
          permalink: string;
        }>;
      };
    }>("slack", connectionId, `/search.messages?${params.toString()}`);

    const matches = response.data.messages?.matches ?? [];

    return matches.map((msg) => ({
      id: msg.ts,
      provider: "slack" as const,
      type: "message" as const,
      title: msg.text.slice(0, 100) + (msg.text.length > 100 ? "..." : ""),
      content: msg.text,
      url: msg.permalink,
      createdAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      metadata: {
        channel: msg.channel.id,
        channelName: msg.channel.name,
        author: msg.user,
      },
    }));
  },
};

// =============================================================================
// Fetcher Registry
// =============================================================================

const fetchers: Record<IntegrationProvider, ContentFetcher> = {
  linear: linearFetcher,
  notion: notionFetcher,
  "google-drive": googleDriveFetcher,
  "google-mail": gmailFetcher,
  jira: jiraFetcher,
  slack: slackFetcher,
};

/**
 * Fetch content from a specific provider
 */
export async function fetchProviderContent(
  provider: IntegrationProvider,
  connectionId: string,
  options?: FetchOptions
): Promise<ContentItem[]> {
  const fetcher = fetchers[provider];
  if (!fetcher) {
    throw new Error(`No fetcher configured for provider: ${provider}`);
  }

  return fetcher.fetchContent(connectionId, options);
}

/**
 * Search content from a specific provider
 */
export async function searchProviderContent(
  provider: IntegrationProvider,
  connectionId: string,
  query: string,
  options?: FetchOptions
): Promise<ContentItem[]> {
  const fetcher = fetchers[provider];
  if (!fetcher) {
    throw new Error(`No fetcher configured for provider: ${provider}`);
  }

  if (!fetcher.search) {
    // Fall back to fetching all and filtering locally
    const allContent = await fetcher.fetchContent(connectionId, { ...options, limit: 100 });
    const lowerQuery = query.toLowerCase();
    return allContent.filter(
      (item) =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.content.toLowerCase().includes(lowerQuery)
    );
  }

  return fetcher.search(connectionId, query, options);
}

/**
 * Fetch content from all connected providers
 */
export async function fetchAllContent(
  connectionIds: Record<IntegrationProvider, string | undefined>,
  options?: FetchOptions
): Promise<ContentItem[]> {
  const results = await Promise.allSettled(
    Object.entries(connectionIds)
      .filter(([, connectionId]) => connectionId)
      .map(([provider, connectionId]) =>
        fetchProviderContent(provider as IntegrationProvider, connectionId!, options)
      )
  );

  const allContent: ContentItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allContent.push(...result.value);
    } else {
      console.error("[ContentFetchers] Error fetching content:", result.reason);
    }
  }

  // Sort by updatedAt or createdAt, most recent first
  return allContent.sort((a, b) => {
    const dateA = new Date(a.updatedAt ?? a.createdAt ?? 0);
    const dateB = new Date(b.updatedAt ?? b.createdAt ?? 0);
    return dateB.getTime() - dateA.getTime();
  });
}

