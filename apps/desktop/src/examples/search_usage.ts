// /**
//  * Search Router Usage Examples
//  * 
//  * This file demonstrates how to use the Smart Search Router
//  * in various scenarios.
//  */

// import { search, getSearchStats, validateSearchConfig } from '../services/search_router';
// import { SearchOptions } from '../types/schema';

// // ============================================================================
// // Example 1: Basic Search
// // ============================================================================

// async function basicSearchExample() {
//   const userId = 'user@example.com';
//   const query = 'authentication bug';

//   const results = await search(query, userId);

//   console.log(`Found ${results.length} results:`);
//   results.forEach((result) => {
//     console.log(`- [${result.source}] ${result.title}`);
//     console.log(`  Score: ${result.score.toFixed(2)} | Type: ${result.match_type}`);
//     console.log(`  URL: ${result.url}`);
//     console.log(`  Snippet: ${result.snippet}\n`);
//   });
// }

// // ============================================================================
// // Example 2: Exact ID Match (Level 1 - Sniper Mode)
// // ============================================================================

// async function exactIdSearchExample() {
//   const userId = 'user@example.com';
  
//   // Search for Linear issue
//   const linearResults = await search('Show me LIN-123', userId);
  
//   // Search for Jira issue
//   const jiraResults = await search('PROJ-456 status', userId);
  
//   // Search for multiple IDs
//   const multipleResults = await search('Compare LIN-123 and PROJ-456', userId);
  
//   console.log('Exact ID matches:', linearResults.length + jiraResults.length);
// }

// // ============================================================================
// // Example 3: Filtered Search (Source-Specific)
// // ============================================================================

// async function filteredSearchExample() {
//   const userId = 'user@example.com';
  
//   // Search only in Notion and Google Drive
//   const options: SearchOptions = {
//     sources: ['notion', 'google_drive'],
//     limit: 10,
//     min_score: 0.75, // Higher threshold for better matches
//   };
  
//   const results = await search('machine learning documentation', userId, options);
  
//   console.log(`Found ${results.length} docs in Notion/Drive`);
// }

// // ============================================================================
// // Example 4: Pagination (Large Result Sets)
// // ============================================================================

// async function paginatedSearchExample() {
//   const userId = 'user@example.com';
//   const query = 'API development';
//   const pageSize = 10;
  
//   // First page
//   const page1 = await search(query, userId, { limit: pageSize });
  
//   // For subsequent pages, you'd implement offset logic in the search function
//   // or use cursor-based pagination with the last result's score
  
//   console.log(`Page 1: ${page1.length} results`);
// }

// // ============================================================================
// // Example 5: Multi-Source Search with Score Filtering
// // ============================================================================

// async function highQualitySearchExample() {
//   const userId = 'user@example.com';
  
//   const options: SearchOptions = {
//     sources: ['linear', 'jira', 'notion'], // Work-related sources only
//     limit: 20,
//     min_score: 0.85, // Only high-confidence matches
//   };
  
//   const results = await search('sprint planning', userId, options);
  
//   // Group results by source
//   const bySource = results.reduce((acc, result) => {
//     if (!acc[result.source]) acc[result.source] = [];
//     acc[result.source].push(result);
//     return acc;
//   }, {} as Record<string, typeof results>);
  
//   Object.entries(bySource).forEach(([source, items]) => {
//     console.log(`${source}: ${items.length} results`);
//   });
// }

// // ============================================================================
// // Example 6: Search Statistics
// // ============================================================================

// async function searchStatsExample() {
//   const userId = 'user@example.com';
  
//   const stats = await getSearchStats(userId);
  
//   console.log('=== Search Statistics ===');
//   console.log(`Total items: ${stats.total_items}`);
//   console.log(`Recent items (<30 days): ${stats.recent_items}`);
//   console.log('\nBy Source:');
//   Object.entries(stats.by_source).forEach(([source, count]) => {
//     console.log(`  ${source}: ${count}`);
//   });
// }

// // ============================================================================
// // Example 7: Configuration Validation
// // ============================================================================

// async function validateConfigExample() {
//   const { isValid, errors } = await validateSearchConfig();
  
//   if (!isValid) {
//     console.error('❌ Search configuration is invalid:');
//     errors.forEach((error) => console.error(`  - ${error}`));
//     process.exit(1);
//   }
  
//   console.log('✓ Search configuration is valid');
// }

// // ============================================================================
// // Example 8: Real-Time Search (Debounced)
// // ============================================================================

// async function realTimeSearchExample() {
//   const userId = 'user@example.com';
//   let searchTimeout: NodeJS.Timeout | undefined;
  
//   // Simulate user typing
//   const userInput = ['a', 'au', 'aut', 'auth', 'authen'];
  
//   for (const query of userInput) {
//     // Debounce search (wait for user to stop typing)
//     if (searchTimeout) clearTimeout(searchTimeout);
    
//     searchTimeout = setTimeout(async () => {
//       if (query.length < 3) {
//         console.log('Query too short, skipping...');
//         return;
//       }
      
//       const results = await search(query, userId, { limit: 5 });
//       console.log(`"${query}" -> ${results.length} results`);
//     }, 300); // 300ms debounce
//   }
// }

// // ============================================================================
// // Example 9: Error Handling
// // ============================================================================

// async function errorHandlingExample() {
//   const userId = 'user@example.com';
  
//   try {
//     // Empty query
//     await search('', userId);
//   } catch (error) {
//     console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
//   }
  
//   try {
//     // Missing user ID
//     await search('test query', '');
//   } catch (error) {
//     console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
//   }
  
//   try {
//     // Invalid options
//     await search('test', userId, { limit: -1 });
//   } catch (error) {
//     console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
//   }
// }

// // ============================================================================
// // Example 10: Search Result Transformation
// // ============================================================================

// async function transformResultsExample() {
//   const userId = 'user@example.com';
//   const results = await search('deployment issues', userId);
  
//   // Transform to UI-friendly format
//   const uiResults = results.map((result) => ({
//     id: result.id,
//     title: result.title,
//     subtitle: `${result.source} • ${result.external_id}`,
//     description: result.snippet,
//     icon: getSourceIcon(result.source),
//     url: result.url,
//     relevance: Math.round(result.score * 100),
//   }));
  
//   console.log('UI-friendly results:', uiResults);
// }

// function getSourceIcon(source: string): string {
//   const icons: Record<string, string> = {
//     linear: '🔷',
//     notion: '📝',
//     jira: '🟦',
//     google_drive: '📄',
//     slack: '💬',
//   };
//   return icons[source] || '📋';
// }

// // ============================================================================
// // Run All Examples
// // ============================================================================

// async function runAllExamples() {
//   console.log('=== Search Router Examples ===\n');
  
//   // Validate config first
//   await validateConfigExample();
  
//   console.log('\n1. Basic Search');
//   await basicSearchExample();
  
//   console.log('\n2. Exact ID Search');
//   await exactIdSearchExample();
  
//   console.log('\n3. Filtered Search');
//   await filteredSearchExample();
  
//   console.log('\n4. Search Statistics');
//   await searchStatsExample();
  
//   console.log('\n5. High-Quality Search');
//   await highQualitySearchExample();
  
//   console.log('\n6. Error Handling');
//   await errorHandlingExample();
  
//   console.log('\nAll examples completed!');
// }

// // Export for use in other modules
// export {
//   basicSearchExample,
//   exactIdSearchExample,
//   filteredSearchExample,
//   paginatedSearchExample,
//   highQualitySearchExample,
//   searchStatsExample,
//   validateConfigExample,
//   realTimeSearchExample,
//   errorHandlingExample,
//   transformResultsExample,
//   runAllExamples,
// };

