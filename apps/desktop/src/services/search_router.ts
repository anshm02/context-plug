/**
 * Smart Search Router - Hybrid Search Engine
 * 
 * Architecture:
 * - Level 1 (Sniper): Regex-based exact ID matching (LIN-123, PROJ-456)
 * - Level 2 (Hybrid): Semantic (Pinecone) + Text Search (Supabase) in parallel
 * 
 * Ranking Strategy:
 * 1. Exact ID matches (Score: 1.0)
 * 2. Exact title matches (Score: 0.95)
 * 3. Semantic matches (Score: from Pinecone similarity)
 * 4. Partial text matches (Score: based on tsvector rank)
 */

import {
  getSupabaseClient,
  getPineconeIndex,
  generateEmbedding,
  setSupabaseUserContext,
} from '../config/clients';
import {
  SearchResult,
  SearchOptions,
  IntegrationSource,
  AnyMetadata,
  VectorMetadata,
} from '../types/schema';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0.7;
const EXACT_ID_SCORE = 1.0;
const EXACT_TITLE_SCORE = 0.95;

// ID Pattern for Linear, Jira, etc. (e.g., LIN-123, PROJ-456, ENG-789)
const ID_PATTERN = /\b([A-Z]{2,10}-\d+)\b/g;

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Smart Search Router - Primary entry point
 * 
 * @param query - Search query string
 * @param userId - User ID for content isolation
 * @param options - Search options (filters, limits, etc.)
 * @returns Array of search results, ranked by relevance
 */
export async function search(
  query: string,
  userId: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const startTime = Date.now();
  
  // Validate inputs
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }
  if (!userId) {
    throw new Error('User ID is required for search');
  }

  const normalizedQuery = query.trim();
  const limit = options.limit || DEFAULT_SEARCH_LIMIT;
  const minScore = options.min_score || DEFAULT_MIN_SCORE;

  console.log(`[Search] Query: "${normalizedQuery}" | User: ${userId}`);

  // Set user context for RLS
  await setSupabaseUserContext(userId);

  // ========================================================================
  // LEVEL 1: Exact ID Match
  // ========================================================================

  const exactIdMatch = await tryExactIdMatch(normalizedQuery, userId, options);
  
  if (exactIdMatch.length > 0) {
    const elapsed = Date.now() - startTime;
    console.log(`[Search] ✓ Exact ID match found (${elapsed}ms)`);
    return exactIdMatch;
  }

  // ========================================================================
  // LEVEL 2: HYBRID SEARCH - Semantic + Text
  // ========================================================================

  console.log('[Search] No exact ID match, running hybrid search...');
  
  const hybridResults = await runHybridSearch(
    normalizedQuery,
    userId,
    options,
    minScore
  );

  const elapsed = Date.now() - startTime;
  console.log(
    `[Search] ✓ Hybrid search complete (${elapsed}ms) - ` +
    `${hybridResults.length} results`
  );

  // Apply limit
  const finalResults = hybridResults.slice(0, limit);

  return finalResults;
}

// ============================================================================
// Level 1: Exact ID Matching
// ============================================================================

/**
 * Extract and match exact IDs (LIN-123, PROJ-456, etc.)
 * This is the fastest path - skips embedding generation
 */
async function tryExactIdMatch(
  query: string,
  userId: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  // Extract all potential IDs from the query
  const matches = Array.from(query.matchAll(ID_PATTERN));
  
  if (matches.length === 0) {
    return [];
  }

  const extractedIds = matches.map((m) => m[1].toUpperCase());
  console.log(`[Search:L1] Extracted IDs: ${extractedIds.join(', ')}`);

  // Query Supabase for exact matches
  const supabase = getSupabaseClient();
  let dbQuery = supabase
    .from('metadata')
    .select('*')
    .eq('user_id', userId)
    .in('external_id', extractedIds)
    .eq('is_archived', false);

  // Apply source filter if specified
  if (options.sources && options.sources.length > 0) {
    dbQuery = dbQuery.in('source', options.sources);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error('[Search:L1] Query error:', error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Convert to SearchResult format
  return data.map((item: Record<string, unknown>) => convertToSearchResult(item as unknown as AnyMetadata, EXACT_ID_SCORE, 'exact_id'));
}

// ============================================================================
// Level 2: Hybrid Search (Semantic + Text)
// ============================================================================

/**
 * Run semantic (vector) and text search in parallel
 * Merge and rank results intelligently
 */
async function runHybridSearch(
  query: string,
  userId: string,
  options: SearchOptions,
  minScore: number
): Promise<SearchResult[]> {
  // Generate embedding for semantic search
  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (error) {
    console.error('[Search:L2] Embedding generation failed:', error);
    // Fallback to text-only search
    return runTextSearch(query, userId, options);
  }

  // Run both searches in parallel
  const [semanticResults, textResults] = await Promise.all([
    runSemanticSearch(embedding, userId, options, minScore),
    runTextSearch(query, userId, options),
  ]);

  console.log(
    `[Search:L2] Semantic: ${semanticResults.length} | Text: ${textResults.length}`
  );

  // Merge and deduplicate results
  const mergedResults = mergeSearchResults(semanticResults, textResults);

  // Sort by score (descending)
  mergedResults.sort((a, b) => b.score - a.score);

  return mergedResults;
}

// ============================================================================
// Semantic Search (Pinecone)
// ============================================================================

/**
 * Query Pinecone for semantically similar content
 */
async function runSemanticSearch(
  embedding: number[],
  userId: string,
  options: SearchOptions,
  minScore: number
): Promise<SearchResult[]> {
  const index = getPineconeIndex();
  const topK = options.limit ? options.limit * 2 : DEFAULT_SEARCH_LIMIT * 2; // Fetch extra for merging

  try {
    // Build filter for Pinecone metadata
    const filter: Record<string, unknown> = {
      user_id: { $eq: userId },
    };

    if (options.sources && options.sources.length > 0) {
      filter.source = { $in: options.sources };
    }

    // Query Pinecone
    const queryResponse = await index.query({
      vector: embedding,
      topK,
      filter,
      includeMetadata: true,
    });

    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return [];
    }

    // Filter by minimum score and fetch full metadata from Supabase
    const relevantMatches = queryResponse.matches.filter(
      (match: { score?: number }) => match.score && match.score >= minScore
    );

    if (relevantMatches.length === 0) {
      return [];
    }

    // Extract Supabase IDs (format: {uuid}_{chunk_index})
    const supabaseIds = relevantMatches.map((match: { id: string }) => {
      const id = match.id.split('_')[0]; // Remove chunk_index suffix
      return id;
    });

    // Fetch full metadata from Supabase
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('metadata')
      .select('*')
      .in('id', supabaseIds)
      .eq('is_archived', false);

    if (error || !data) {
      console.error('[Search:Semantic] Supabase fetch error:', error);
      return [];
    }

    // Map scores back to metadata
    const scoreMap = new Map<string, number>();
    relevantMatches.forEach((match: { id: string; score?: number }) => {
      const id = match.id.split('_')[0];
      const currentScore = scoreMap.get(id) || 0;
      // Take the highest score if multiple chunks
      scoreMap.set(id, Math.max(currentScore, match.score || 0));
    });

    // Convert to SearchResult format
    return data.map((item: Record<string, unknown>) => {
      const typedItem = item as unknown as AnyMetadata;
      const score = scoreMap.get(typedItem.id) || minScore;
      return convertToSearchResult(typedItem, score, 'semantic');
    });
  } catch (error) {
    console.error('[Search:Semantic] Query error:', error);
    return [];
  }
}

// ============================================================================
// Text Search (Supabase Full-Text)
// ============================================================================

/**
 * Query Supabase using PostgreSQL full-text search (tsvector)
 * Also checks for exact title matches
 */
async function runTextSearch(
  query: string,
  userId: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const supabase = getSupabaseClient();
  const limit = options.limit ? options.limit * 2 : DEFAULT_SEARCH_LIMIT * 2;

  try {
    // ======================================================================
    // Query 1: Exact Title Match (ILIKE)
    // ======================================================================
    
    let exactTitleQuery = supabase
      .from('metadata')
      .select('*')
      .eq('user_id', userId)
      .ilike('title', `%${query}%`)
      .eq('is_archived', false)
      .limit(limit);

    if (options.sources && options.sources.length > 0) {
      exactTitleQuery = exactTitleQuery.in('source', options.sources);
    }

    const { data: exactTitleData, error: exactTitleError } = await exactTitleQuery;

    if (exactTitleError) {
      console.error('[Search:Text] Exact title query error:', exactTitleError);
    }

    // ======================================================================
    // Query 2: Full-Text Search (tsvector)
    // ======================================================================
    
    // Build tsquery from search terms
    const searchTerms = query
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `${term}:*`)
      .join(' & ');

    let fullTextQuery = supabase
      .from('metadata')
      .select('*')
      .textSearch('search_vector', searchTerms, {
        type: 'websearch',
        config: 'english',
      })
      .eq('user_id', userId)
      .eq('is_archived', false)
      .limit(limit);

    if (options.sources && options.sources.length > 0) {
      fullTextQuery = fullTextQuery.in('source', options.sources);
    }

    const { data: fullTextData, error: fullTextError } = await fullTextQuery;

    if (fullTextError) {
      console.error('[Search:Text] Full-text query error:', fullTextError);
    }

    // ======================================================================
    // Merge Results
    // ======================================================================

    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    // Add exact title matches first (higher priority)
    if (exactTitleData) {
      exactTitleData.forEach((item: Record<string, unknown>) => {
        const typedItem = item as unknown as AnyMetadata;
        results.push(convertToSearchResult(typedItem, EXACT_TITLE_SCORE, 'exact_title'));
        seenIds.add(typedItem.id);
      });
    }

    // Add full-text search results (avoiding duplicates)
    if (fullTextData) {
      fullTextData.forEach((item: any) => {
        const typedItem = item as unknown as AnyMetadata;
        if (!seenIds.has(typedItem.id)) {
          // Use a default score for text matches (lower than exact title but decent)
          const normalizedScore = 0.8;
          results.push(convertToSearchResult(typedItem, normalizedScore, 'hybrid'));
          seenIds.add(typedItem.id);
        }
      });
    }

    return results;
  } catch (error) {
    console.error('[Search:Text] Unexpected error:', error);
    return [];
  }
}

// ============================================================================
// Result Merging and Deduplication
// ============================================================================

/**
 * Merge semantic and text search results
 * Handle deduplication and score aggregation
 */
function mergeSearchResults(
  semanticResults: SearchResult[],
  textResults: SearchResult[]
): SearchResult[] {
  const resultMap = new Map<string, SearchResult>();

  // Add semantic results
  semanticResults.forEach((result) => {
    resultMap.set(result.id, result);
  });

  // Merge or add text results
  textResults.forEach((textResult) => {
    const existing = resultMap.get(textResult.id);
    
    if (existing) {
      // Item found in both searches - boost score
      const combinedScore = Math.min(
        existing.score * 0.6 + textResult.score * 0.4,
        1.0
      );
      existing.score = combinedScore;
      existing.match_type = 'hybrid';
    } else {
      // New item from text search
      resultMap.set(textResult.id, textResult);
    }
  });

  return Array.from(resultMap.values());
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert raw database record to SearchResult format
 */
function convertToSearchResult(
  item: AnyMetadata,
  score: number,
  matchType: SearchResult['match_type']
): SearchResult {
  // Extract snippet based on source type
  let snippet = '';
  const sourceData = item.source_data as Record<string, unknown>;
  const title = item.title || item.external_id;

  if (item.source === 'linear') {
    snippet = truncate((sourceData.description as string) || '', 200);
  } else if (item.source === 'notion') {
    snippet = truncate((sourceData.content_snippet as string) || '', 200);
  } else if (item.source === 'jira') {
    snippet = truncate((sourceData.description as string) || (sourceData.summary as string) || '', 200);
  } else if (item.source === 'google_drive') {
    snippet = truncate((sourceData.text_preview as string) || '', 200);
  } else if (item.source === 'slack') {
    snippet = truncate((sourceData.thread_summary as string) || title, 200);
  } else {
    snippet = truncate(title, 200);
  }

  return {
    id: item.id,
    source: item.source,
    external_id: item.external_id,
    title,
    url: item.url || '',
    snippet,
    score,
    match_type: matchType,
    metadata: {
      created_at: item.created_at,
      updated_at: item.updated_at,
      ...sourceData,
    },
  };
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.slice(0, maxLength).trim() + '...';
}

// ============================================================================
// Utility Functions for Testing
// ============================================================================

/**
 * Get search statistics for debugging
 */
export async function getSearchStats(userId: string): Promise<{
  total_items: number;
  by_source: Record<IntegrationSource, number>;
  recent_items: number; // Last 30 days
}> {
  const supabase = getSupabaseClient();
  await setSupabaseUserContext(userId);

  // Total items
  const { count: totalCount } = await supabase
    .from('metadata')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_archived', false);

  // By source
  const { data: sourceData } = await supabase
    .from('metadata')
    .select('source')
    .eq('user_id', userId)
    .eq('is_archived', false);

  const bySource: Record<string, number> = {};
  sourceData?.forEach((item: { source: string }) => {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  });

  // Recent items (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count: recentCount } = await supabase
    .from('metadata')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_archived', false)
    .gte('created_at', thirtyDaysAgo.toISOString());

  return {
    total_items: totalCount || 0,
    by_source: bySource as Record<IntegrationSource, number>,
    recent_items: recentCount || 0,
  };
}

/**
 * Validate search configuration
 */
export async function validateSearchConfig(): Promise<{
  isValid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'PINECONE_API_KEY',
    'PINECONE_INDEX_NAME',
    'OPENAI_API_KEY',
  ];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      errors.push(`Missing environment variable: ${varName}`);
    }
  });

  // Try to initialize clients
  try {
    getSupabaseClient();
  } catch (error) {
    errors.push(`Supabase initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    getPineconeIndex();
  } catch (error) {
    errors.push(`Pinecone initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

