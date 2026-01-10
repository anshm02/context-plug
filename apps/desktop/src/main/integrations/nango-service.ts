/**
 * Nango Service
 * Core service for interacting with Nango API for OAuth and content fetching
 * Updated to use Connect Session Tokens (public keys deprecated Jan 2025)
 */

import type {
  IntegrationProvider,
  IntegrationStatus,
  ConnectionStatus,
} from "@context-plug/shared";

interface NangoConfig {
  secretKey: string;
  baseUrl?: string;
}

interface NangoConnection {
  id: number;
  connection_id: string;
  provider_config_key: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

interface ConnectSessionResponse {
  data: {
    token: string;
    connect_link: string;
    expires_at: string;
  };
}

interface NangoProxyResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * Creates and manages Nango API interactions
 */
export class NangoService {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(config: NangoConfig) {
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl ?? "https://api.nango.dev";
  }

  /**
   * Generate a unique connection ID for a user/integration combo
   */
  generateConnectionId(provider: IntegrationProvider, userId = "default"): string {
    return `${userId}-${provider}`;
  }

  /**
   * Create a Connect Session Token for OAuth flow
   * This replaces the deprecated public key approach
   */
  async createConnectSession(
    provider: IntegrationProvider,
    connectionId: string
  ): Promise<{ token: string; authUrl: string }> {
    const response = await fetch(`${this.baseUrl}/connect/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        end_user: {
          id: connectionId,
        },
        allowed_integrations: [provider],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[NangoService] Session creation failed:", response.status, errorText);
      throw new Error(`Failed to create connect session: ${response.status} ${errorText}`);
    }

    const responseData: ConnectSessionResponse = await response.json();
    
    console.log("[NangoService] Session created for provider:", provider);
    
    const { token, connect_link } = responseData.data;
    
    // Use the connect_link from Nango directly - it has the correct format
    // The session is already scoped to the allowed_integrations (provider)
    return {
      token,
      authUrl: connect_link,
    };
  }

  /**
   * List all connections for the account
   */
  async listConnections(): Promise<NangoConnection[]> {
    try {
      const response = await fetch(`${this.baseUrl}/connection`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      });

      if (!response.ok) {
        console.error(`[NangoService] Failed to list connections: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`[NangoService] All connections:`, JSON.stringify(data, null, 2));
      return data.connections ?? [];
    } catch (error) {
      console.error(`[NangoService] List connections error:`, error);
      return [];
    }
  }

  /**
   * Get a specific connection by ID and provider
   */
  async getConnection(
    provider: IntegrationProvider,
    connectionId: string
  ): Promise<NangoConnection | null> {
    try {
      console.log(`[NangoService] Checking connection: provider=${provider}, connectionId=${connectionId}`);
      
      const response = await fetch(
        `${this.baseUrl}/connection/${connectionId}?provider_config_key=${provider}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      console.log(`[NangoService] Connection check response: ${response.status}`);

      // 404 = connection not found
      // 400 = integration not configured or invalid request
      // Both mean "no valid connection exists"
      if (response.status === 404 || response.status === 400) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      console.log(`[NangoService] Connection found:`, data.connection_id);
      return data;
    } catch (error) {
      console.error(`[NangoService] Connection check error:`, error);
      return null;
    }
  }

  /**
   * Find a connection by provider (searches all connections)
   * Returns the first matching connection for the provider
   */
  async getConnectionByProvider(
    provider: IntegrationProvider
  ): Promise<NangoConnection | null> {
    try {
      const connections = await this.listConnections();
      const connection = connections.find(
        (c) => c.provider_config_key === provider
      );
      
      if (connection) {
        console.log(`[NangoService] Found connection for ${provider}: ${connection.connection_id}`);
      } else {
        console.log(`[NangoService] No connection found for ${provider}`);
      }
      
      return connection ?? null;
    } catch (error) {
      console.error(`[NangoService] Error finding connection for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Delete a connection
   */
  async deleteConnection(
    provider: IntegrationProvider,
    connectionId: string
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/connection/${connectionId}?provider_config_key=${provider}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.error(`[NangoService] Error deleting connection:`, error);
      return false;
    }
  }

  /**
   * Get integration status for all providers
   * Uses listConnections to find existing connections by provider
   */
  async getIntegrationStatuses(
    _userId = "default"
  ): Promise<IntegrationStatus[]> {
    const providers: IntegrationProvider[] = [
      "linear",
      "notion",
      "google-drive",
      "google-mail",
      "jira",
      "slack",
    ];

    // Fetch all connections once and match by provider
    const connections = await this.listConnections();
    console.log(`[NangoService] Found ${connections.length} total connections`);

    const statuses = providers.map((provider) => {
      // Find a connection for this provider (use the most recent one if multiple exist)
      const connection = connections.find(
        (c) => c.provider_config_key === provider
      );

      let status: ConnectionStatus = "disconnected";
      let connectedAt: string | undefined;
      let connectionId: string | undefined;

      if (connection) {
        status = "connected";
        connectedAt = connection.created_at;
        connectionId = connection.connection_id;
        console.log(`[NangoService] ${provider}: connected (${connectionId})`);
      } else {
        console.log(`[NangoService] ${provider}: not connected`);
      }

      return {
        provider,
        status,
        connectionId,
        connectedAt,
      } satisfies IntegrationStatus;
    });

    return statuses;
  }

  /**
   * Make a proxied API request through Nango
   * Nango handles token refresh automatically
   */
  async proxyRequest<T>(
    provider: IntegrationProvider,
    connectionId: string,
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      body?: unknown;
      headers?: Record<string, string>;
      baseUrlOverride?: string;
    } = {}
  ): Promise<NangoProxyResponse<T>> {
    const { method = "GET", body, headers = {} } = options;

    const response = await fetch(`${this.baseUrl}/proxy${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Provider-Config-Key": provider,
        "Connection-Id": connectionId,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    return {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  /**
   * Get raw access token for custom API calls
   * Use sparingly - prefer proxyRequest for automatic token refresh
   */
  async getAccessToken(
    provider: IntegrationProvider,
    connectionId: string
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/connection/${connectionId}?provider_config_key=${provider}&force_refresh=true`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.credentials?.access_token ?? null;
    } catch (error) {
      console.error(`[NangoService] Error getting access token:`, error);
      return null;
    }
  }
}

// Singleton instance
let nangoServiceInstance: NangoService | null = null;

/**
 * Initialize the Nango service with configuration
 */
export function initializeNangoService(config: NangoConfig): NangoService {
  nangoServiceInstance = new NangoService(config);
  return nangoServiceInstance;
}

/**
 * Get the Nango service instance
 */
export function getNangoService(): NangoService {
  if (!nangoServiceInstance) {
    throw new Error("NangoService not initialized. Call initializeNangoService first.");
  }
  return nangoServiceInstance;
}
