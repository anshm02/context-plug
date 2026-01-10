/**
 * Database and API Client Configuration
 * 
 * Initializes connections to:
 * - Supabase (Metadata DB)
 * - Pinecone (Vector DB)
 * - OpenAI (Embeddings)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// ============================================================================
// Environment Variables
// ============================================================================

interface EnvConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  pinecone: {
    apiKey: string;
    indexName: string;
    environment?: string; // Optional - for older Pinecone versions
  };
  openai: {
    apiKey: string;
    embeddingModel: string;
    embeddingDimensions: number;
  };
}

function getEnvConfig(): EnvConfig {
  // Validate required environment variables
  const requiredVars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      'Please ensure these are set in your .env file.'
    );
  }

  return {
    supabase: {
      url: requiredVars.SUPABASE_URL!,
      anonKey: requiredVars.SUPABASE_ANON_KEY!,
    },
    pinecone: {
      apiKey: requiredVars.PINECONE_API_KEY!,
      indexName: requiredVars.PINECONE_INDEX_NAME!,
      environment: process.env.PINECONE_ENVIRONMENT,
    },
    openai: {
      apiKey: requiredVars.OPENAI_API_KEY!,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      embeddingDimensions: parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10),
    },
  };
}

// ============================================================================
// Client Instances
// ============================================================================

let supabaseClient: SupabaseClient | null = null;
let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;
let pineconeIndex: ReturnType<Pinecone['index']> | null = null;

// ============================================================================
// Supabase Client
// ============================================================================

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const config = getEnvConfig();
    supabaseClient = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: {
        persistSession: false, // Desktop app doesn't need session persistence
      },
    });
    console.log('[Supabase] Client initialized');
  }
  return supabaseClient;
}

/**
 * Set user context for Row-Level Security (RLS)
 * This must be called before any query that requires user isolation
 */
export async function setSupabaseUserContext(userId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.rpc('set_config', {
    setting: 'app.user_id',
    value: userId,
  });

  if (error) {
    console.warn('[Supabase] Failed to set user context:', error.message);
  }
}

// ============================================================================
// Pinecone Client
// ============================================================================

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const config = getEnvConfig();
    pineconeClient = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
    console.log('[Pinecone] Client initialized');
  }
  return pineconeClient;
}

export function getPineconeIndex() {
  if (!pineconeIndex) {
    const config = getEnvConfig();
    const client = getPineconeClient();
    pineconeIndex = client.index(config.pinecone.indexName);
    console.log(`[Pinecone] Index "${config.pinecone.indexName}" connected`);
  }
  return pineconeIndex;
}

// ============================================================================
// OpenAI Client
// ============================================================================

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const config = getEnvConfig();
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    console.log('[OpenAI] Client initialized');
  }
  return openaiClient;
}

/**
 * Generate embeddings for text using OpenAI
 * @param text - Text to embed
 * @returns Embedding vector (1536 dimensions for text-embedding-3-small)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getEnvConfig();
  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: config.openai.embeddingModel,
      input: text,
      encoding_format: 'float',
    });

    const embedding = response.data[0].embedding;
    
    // Validate dimensions
    if (embedding.length !== config.openai.embeddingDimensions) {
      throw new Error(
        `Expected ${config.openai.embeddingDimensions} dimensions, got ${embedding.length}`
      );
    }

    return embedding;
  } catch (error) {
    console.error('[OpenAI] Embedding generation failed:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate embeddings for multiple texts in a batch
 * More efficient than calling generateEmbedding multiple times
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const config = getEnvConfig();
  const client = getOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: config.openai.embeddingModel,
      input: texts,
      encoding_format: 'float',
    });

    return response.data.map((item: { embedding: number[] }) => item.embedding);
  } catch (error) {
    console.error('[OpenAI] Batch embedding generation failed:', error);
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Connection Testing
// ============================================================================

export async function testConnections(): Promise<{
  supabase: boolean;
  pinecone: boolean;
  openai: boolean;
}> {
  const results = {
    supabase: false,
    pinecone: false,
    openai: false,
  };

  // Test Supabase
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('metadata').select('id').limit(1);
    results.supabase = !error;
    console.log('[Supabase] Connection test:', results.supabase ? '✓' : '✗');
  } catch (error) {
    console.error('[Supabase] Connection test failed:', error);
  }

  // Test Pinecone
  try {
    const client = getPineconeClient();
    await client.listIndexes();
    results.pinecone = true;
    console.log('[Pinecone] Connection test: ✓');
  } catch (error) {
    console.error('[Pinecone] Connection test failed:', error);
  }

  // Test OpenAI
  try {
    await generateEmbedding('test');
    results.openai = true;
    console.log('[OpenAI] Connection test: ✓');
  } catch (error) {
    console.error('[OpenAI] Connection test failed:', error);
  }

  return results;
}

// ============================================================================
// Cleanup
// ============================================================================

export function closeConnections(): void {
  // Note: Supabase and OpenAI clients don't require explicit cleanup
  // Pinecone client is stateless (HTTP-based)
  supabaseClient = null;
  pineconeClient = null;
  openaiClient = null;
  pineconeIndex = null;
  console.log('[Clients] All connections closed');
}

