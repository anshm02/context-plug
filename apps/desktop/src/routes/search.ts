/**
 * Search API Routes
 * 
 * Express endpoints for the Smart Search Router
 * Mount these routes in your main Express server (server.ts)
 */

import { Router, Request, Response } from 'express';
import { search, getSearchStats, validateSearchConfig } from '../services/search_router';
import { SearchOptions, IntegrationSource } from '../types/schema';

const router = Router();

// ============================================================================
// POST /api/search - Main Search Endpoint
// ============================================================================

interface SearchRequestBody {
  query: string;
  user_id: string;
  sources?: IntegrationSource[];
  limit?: number;
  min_score?: number;
  include_archived?: boolean;
}

router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, user_id, sources, limit, min_score, include_archived } = req.body as SearchRequestBody;

    // Validate required fields
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "query" field',
        code: 'INVALID_QUERY',
      });
    }

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "user_id" field',
        code: 'INVALID_USER_ID',
      });
    }

    // Build search options
    const options: SearchOptions = {
      sources,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      min_score: min_score ? parseFloat(String(min_score)) : undefined,
      include_archived: include_archived === true,
    };

    // Execute search
    const startTime = Date.now();
    const results = await search(query, user_id, options);
    const elapsed = Date.now() - startTime;

    // Return results
    res.json({
      success: true,
      query,
      results,
      count: results.length,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    console.error('[API:Search] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'SEARCH_ERROR',
    });
  }
});

// ============================================================================
// GET /api/search/stats - Search Statistics
// ============================================================================

router.get('/search/stats', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid "user_id" query parameter',
        code: 'INVALID_USER_ID',
      });
    }

    const stats = await getSearchStats(user_id);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[API:SearchStats] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'STATS_ERROR',
    });
  }
});

// ============================================================================
// GET /api/search/health - Configuration Health Check
// ============================================================================

router.get('/search/health', async (_req: Request, res: Response) => {
  try {
    const { isValid, errors } = await validateSearchConfig();

    if (!isValid) {
      return res.status(503).json({
        success: false,
        healthy: false,
        errors,
      });
    }

    res.json({
      success: true,
      healthy: true,
      message: 'Search engine is configured correctly',
    });
  } catch (error) {
    console.error('[API:SearchHealth] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'HEALTH_CHECK_ERROR',
    });
  }
});

// ============================================================================
// GET /api/search/sources - List Available Sources
// ============================================================================

router.get('/search/sources', (_req: Request, res: Response) => {
  const sources: Array<{ id: IntegrationSource; name: string; icon: string }> = [
    { id: 'linear', name: 'Linear', icon: '🔷' },
    { id: 'notion', name: 'Notion', icon: '📝' },
    { id: 'jira', name: 'Jira', icon: '🟦' },
    { id: 'google_drive', name: 'Google Drive', icon: '📄' },
    { id: 'slack', name: 'Slack', icon: '💬' },
  ];

  res.json({
    success: true,
    sources,
  });
});

// ============================================================================
// Error Handler Middleware
// ============================================================================

router.use((err: Error, _req: Request, res: Response, _next: Function) => {
  console.error('[API:Search] Unhandled error:', err);
  res.status(500).json({
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
  });
});

export default router;

