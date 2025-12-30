import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import type {
  ContextResponse,
  HealthResponse,
  ErrorResponse,
  IntegrationProvider,
  IntegrationsListResponse,
  OAuthConnectResponse,
  ContentFetchResponse,
  ContentSearchResponse,
} from "@context-plug/shared";
import {
  initializeNangoService,
  getNangoService,
  fetchProviderContent,
  searchProviderContent,
  fetchAllContent,
} from "./integrations";

const PORT = 3124;

// Environment variable - only secret key needed now (public keys deprecated)
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "";

/**
 * Validate that a string is a valid integration provider
 */
function isValidProvider(provider: string): provider is IntegrationProvider {
  return ["linear", "notion", "google-drive", "google-mail", "jira", "slack"].includes(provider);
}

/**
 * Async handler wrapper for Express routes
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createServer(): express.Application {
  const app = express();

  // Initialize Nango service if secret key is available
  if (NANGO_SECRET_KEY) {
    initializeNangoService({
      secretKey: NANGO_SECRET_KEY,
    });
    console.log("[Context Bridge] Nango service initialized");
  } else {
    console.warn(
      "[Context Bridge] NANGO_SECRET_KEY not configured. Set it in your .env file."
    );
    console.warn(
      "[Context Bridge] Create apps/desktop/.env with: NANGO_SECRET_KEY=your-key-here"
    );
  }

  // CORS configuration - allowing specific origins for security
  app.use(
    cors({
      origin: [
        "http://localhost:3124",
        "chrome-extension://*",
        "https://chatgpt.com",
        "https://chat.openai.com",
        "https://claude.ai",
      ],
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );

  app.use(express.json());

  // =============================================================================
  // Health & Status Endpoints
  // =============================================================================

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    const response: HealthResponse = {
      status: "ok",
      timestamp: Date.now(),
    };
    res.json(response);
  });

  // Legacy context endpoint - returns mock data for backward compatibility
  app.get("/context", (_req: Request, res: Response) => {
    const response: ContextResponse = {
      success: true,
      data: "Secret Project Alpha specs: This is classified information retrieved from your local Desktop Hub. The bridge is working!",
      source: "Desktop-File-System",
    };
    res.json(response);
  });

  // =============================================================================
  // Integration Management Endpoints
  // =============================================================================

  /**
   * GET /integrations
   * List all integration statuses
   */
  app.get(
    "/integrations",
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const nango = getNangoService();
        const integrations = await nango.getIntegrationStatuses();

        const response: IntegrationsListResponse = {
          success: true,
          integrations,
        };
        res.json(response);
      } catch (error) {
        // If Nango is not configured, return all as disconnected
        const providers: IntegrationProvider[] = [
          "linear",
          "notion",
          "google-drive",
          "google-mail",
          "jira",
          "slack",
        ];

        const response: IntegrationsListResponse = {
          success: true,
          integrations: providers.map((provider) => ({
            provider,
            status: "disconnected" as const,
          })),
        };
        res.json(response);
      }
    })
  );

  /**
   * GET /integrations/:provider/connect
   * Get OAuth authorization URL for a specific provider
   * Uses Nango Connect Session Tokens (public keys deprecated Jan 2025)
   */
  app.get(
    "/integrations/:provider/connect",
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;

      if (!isValidProvider(provider)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Invalid provider: ${provider}`,
          code: "INVALID_PROVIDER",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        const connectionId = nango.generateConnectionId(provider);
        
        // Use the new Connect Session Token approach
        const { authUrl } = await nango.createConnectSession(provider, connectionId);

        const response: OAuthConnectResponse = {
          success: true,
          authUrl,
        };
        res.json(response);
      } catch (error) {
        console.error("[OAuth] Error creating connect session:", error);
        const errorResponse: ErrorResponse = {
          success: false,
          error: error instanceof Error ? error.message : "Nango service not configured",
          code: "NANGO_NOT_CONFIGURED",
        };
        res.status(500).json(errorResponse);
      }
    })
  );

  /**
   * POST /integrations/:provider/disconnect
   * Disconnect an integration
   */
  app.post(
    "/integrations/:provider/disconnect",
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;

      if (!isValidProvider(provider)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Invalid provider: ${provider}`,
          code: "INVALID_PROVIDER",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        
        // Find the actual connection by provider
        const connection = await nango.getConnectionByProvider(provider);
        if (!connection) {
          res.status(404).json({
            success: false,
            error: `No connection found for ${provider}`,
            code: "NOT_CONNECTED",
          });
          return;
        }
        
        const success = await nango.deleteConnection(provider, connection.connection_id);

        if (success) {
          res.json({ success: true, message: `Disconnected from ${provider}` });
        } else {
          res.status(500).json({
            success: false,
            error: "Failed to disconnect",
            code: "DISCONNECT_FAILED",
          });
        }
      } catch (error) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: "Failed to disconnect integration",
          code: "DISCONNECT_ERROR",
        };
        res.status(500).json(errorResponse);
      }
    })
  );

  /**
   * GET /integrations/:provider/status
   * Check specific integration status
   */
  app.get(
    "/integrations/:provider/status",
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;

      if (!isValidProvider(provider)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Invalid provider: ${provider}`,
          code: "INVALID_PROVIDER",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        const connectionId = nango.generateConnectionId(provider);
        const connection = await nango.getConnection(provider, connectionId);

        res.json({
          success: true,
          provider,
          status: connection ? "connected" : "disconnected",
          connectionId: connection ? connectionId : undefined,
          connectedAt: connection?.created_at,
        });
      } catch (error) {
        res.json({
          success: true,
          provider,
          status: "disconnected",
        });
      }
    })
  );

  // =============================================================================
  // Content Fetch Endpoints
  // =============================================================================

  /**
   * GET /content/:provider
   * Fetch content from a specific provider
   */
  app.get(
    "/content/:provider",
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const cursor = req.query.cursor as string | undefined;

      if (!isValidProvider(provider)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Invalid provider: ${provider}`,
          code: "INVALID_PROVIDER",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        
        // Find connection by provider (uses the actual Nango connection ID)
        const connection = await nango.getConnectionByProvider(provider);
        if (!connection) {
          const errorResponse: ErrorResponse = {
            success: false,
            error: `Not connected to ${provider}. Please connect first.`,
            code: "NOT_CONNECTED",
          };
          res.status(401).json(errorResponse);
          return;
        }

        const items = await fetchProviderContent(provider, connection.connection_id, {
          limit,
          cursor,
        });

        const response: ContentFetchResponse = {
          success: true,
          provider,
          items,
          totalCount: items.length,
        };
        res.json(response);
      } catch (error) {
        console.error(`[Content] Error fetching from ${provider}:`, error);
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Failed to fetch content from ${provider}`,
          code: "FETCH_ERROR",
        };
        res.status(500).json(errorResponse);
      }
    })
  );

  /**
   * GET /content/:provider/search
   * Search content from a specific provider
   */
  app.get(
    "/content/:provider/search",
    asyncHandler(async (req: Request, res: Response) => {
      const { provider } = req.params;
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!query) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: "Query parameter 'q' is required",
          code: "MISSING_QUERY",
        };
        res.status(400).json(errorResponse);
        return;
      }

      if (!isValidProvider(provider)) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Invalid provider: ${provider}`,
          code: "INVALID_PROVIDER",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        
        // Find connection by provider (uses the actual Nango connection ID)
        const connection = await nango.getConnectionByProvider(provider);
        if (!connection) {
          const errorResponse: ErrorResponse = {
            success: false,
            error: `Not connected to ${provider}. Please connect first.`,
            code: "NOT_CONNECTED",
          };
          res.status(401).json(errorResponse);
          return;
        }

        const results = await searchProviderContent(provider, connection.connection_id, query, {
          limit,
        });

        const response: ContentSearchResponse = {
          success: true,
          query,
          results,
          totalCount: results.length,
        };
        res.json(response);
      } catch (error) {
        console.error(`[Content] Error searching ${provider}:`, error);
        const errorResponse: ErrorResponse = {
          success: false,
          error: `Failed to search content from ${provider}`,
          code: "SEARCH_ERROR",
        };
        res.status(500).json(errorResponse);
      }
    })
  );

  /**
   * GET /content/all
   * Fetch content from all connected providers
   */
  app.get(
    "/content/all",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;

      try {
        const nango = getNangoService();
        const statuses = await nango.getIntegrationStatuses();

        // Build connection IDs for connected providers
        const connectionIds: Record<IntegrationProvider, string | undefined> = {
          linear: undefined,
          notion: undefined,
          "google-drive": undefined,
          "google-mail": undefined,
          jira: undefined,
          slack: undefined,
        };

        for (const status of statuses) {
          if (status.status === "connected" && status.connectionId) {
            connectionIds[status.provider] = status.connectionId;
          }
        }

        const items = await fetchAllContent(connectionIds, { limit });

        res.json({
          success: true,
          items,
          totalCount: items.length,
        });
      } catch (error) {
        console.error("[Content] Error fetching all content:", error);
        res.json({
          success: true,
          items: [],
          totalCount: 0,
        });
      }
    })
  );

  /**
   * GET /content/search
   * Search across all connected providers
   */
  app.get(
    "/content/search",
    asyncHandler(async (req: Request, res: Response) => {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const providersParam = req.query.providers as string | undefined;

      if (!query) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: "Query parameter 'q' is required",
          code: "MISSING_QUERY",
        };
        res.status(400).json(errorResponse);
        return;
      }

      try {
        const nango = getNangoService();
        const statuses = await nango.getIntegrationStatuses();

        // Filter to specified providers if provided
        const targetProviders = providersParam
          ? (providersParam.split(",") as IntegrationProvider[])
          : undefined;

        const connectedStatuses = statuses.filter(
          (s) =>
            s.status === "connected" &&
            s.connectionId &&
            (!targetProviders || targetProviders.includes(s.provider))
        );

        const searchPromises = connectedStatuses.map((status) =>
          searchProviderContent(status.provider, status.connectionId!, query, {
            limit: Math.ceil(limit / connectedStatuses.length),
          }).catch((err) => {
            console.error(`[Search] Error searching ${status.provider}:`, err);
            return [];
          })
        );

        const results = await Promise.all(searchPromises);
        const allResults = results.flat();

        const response: ContentSearchResponse = {
          success: true,
          query,
          results: allResults.slice(0, limit),
          totalCount: allResults.length,
        };
        res.json(response);
      } catch (error) {
        console.error("[Content] Error searching all providers:", error);
        res.json({
          success: true,
          query,
          results: [],
          totalCount: 0,
        });
      }
    })
  );

  // =============================================================================
  // Nango Status Endpoint
  // =============================================================================

  /**
   * GET /nango/status
   * Check if Nango is configured
   */
  app.get("/nango/status", (_req: Request, res: Response) => {
    const isConfigured = !!NANGO_SECRET_KEY;
    
    res.json({
      success: true,
      configured: isConfigured,
      message: isConfigured 
        ? "Nango service is configured and ready"
        : "NANGO_SECRET_KEY not set. Add it to your .env file.",
    });
  });

  /**
   * GET /nango/connections
   * Debug endpoint to list all Nango connections
   */
  app.get(
    "/nango/connections",
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const nango = getNangoService();
        const connections = await nango.listConnections();
        
        res.json({
          success: true,
          count: connections.length,
          connections: connections.map(c => ({
            id: c.id,
            connection_id: c.connection_id,
            provider_config_key: c.provider_config_key,
            created_at: c.created_at,
          })),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to list connections",
        });
      }
    })
  );

  // =============================================================================
  // Error Handler
  // =============================================================================

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Context Bridge] Error:", err);
    const errorResponse: ErrorResponse = {
      success: false,
      error: err.message || "Internal server error",
      code: "INTERNAL_ERROR",
    };
    res.status(500).json(errorResponse);
  });

  return app;
}

export function startServer(
  onReady?: (port: number) => void
): ReturnType<express.Application["listen"]> {
  const app = createServer();

  const server = app.listen(PORT, () => {
    console.log(`[Context Bridge] Server running on http://localhost:${PORT}`);
    console.log(`[Context Bridge] Endpoints available:`);
    console.log(`  - GET  /health`);
    console.log(`  - GET  /integrations`);
    console.log(`  - GET  /integrations/:provider/connect`);
    console.log(`  - POST /integrations/:provider/disconnect`);
    console.log(`  - GET  /content/:provider`);
    console.log(`  - GET  /content/:provider/search?q=query`);
    console.log(`  - GET  /content/all`);
    console.log(`  - GET  /content/search?q=query`);
    console.log(`  - GET  /nango/status`);
    console.log(`  - GET  /nango/connections (debug)`);
    onReady?.(PORT);
  });

  return server;
}

export { PORT };
