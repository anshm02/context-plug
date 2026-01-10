# RAG Search Feature - @@ Trigger Guide

## 🎯 Overview

The RAG (Retrieval-Augmented Generation) Search feature allows you to search your connected integrations (Linear, Notion, Jira, Google Drive, Slack) directly from the ChatGPT or Claude input box using the `@@` trigger.

---

## ✨ How It Works

1. **Type `@@` in ChatGPT/Claude** - This activates the search trigger
2. **Continue typing your query** - e.g., `@@authentication bug`
3. **Wait 500ms** - Search automatically triggers after you stop typing
4. **Browse results** - A dropdown appears with relevant results
5. **Select a result** - Click or press Enter to insert it into your message

---

## 🚀 Usage Examples

### Example 1: Search for Linear Issues

```
Type in ChatGPT: @@LIN-123
```

**Result**: Instantly finds and displays Linear issue LIN-123 with exact ID match (score: 100%)

### Example 2: Semantic Search

```
Type in ChatGPT: @@oauth login problem
```

**Result**: Searches across all sources and finds semantically related content like:
- Linear issues about authentication
- Notion docs about OAuth setup
- Slack threads discussing login bugs

### Example 3: Search Notion Documentation

```
Type in ChatGPT: @@API documentation
```

**Result**: Finds Notion pages, Google Drive docs, and other content related to API docs

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↓` (Down Arrow) | Navigate to next result |
| `↑` (Up Arrow) | Navigate to previous result |
| `Enter` | Select highlighted result |
| `Esc` | Close dropdown without selecting |

---

## 🎨 Result Display

Each search result shows:

- **Source** - Which integration it's from (Linear, Notion, etc.)
- **Score** - Relevance score (0-100%)
- **Title** - Name of the item
- **Snippet** - Preview of the content
- **Match Type** - How it was found:
  - `exact_id` - Exact ID match (LIN-123, PROJ-456)
  - `exact_title` - Title contains your query
  - `semantic` - AI-powered semantic match
  - `hybrid` - Combination of text and semantic

---

## 🔧 Configuration

### Set Your User ID

By default, the extension uses `demo@example.com` as the user ID. To use your own:

1. Open DevTools Console (F12)
2. Run:
```javascript
localStorage.setItem('context_plug_user_id', 'your-email@example.com');
```

### Adjust Search Parameters

The search uses these defaults:
- **Limit**: 5 results
- **Min Score**: 0.7 (70% relevance threshold)
- **Debounce**: 500ms after typing stops

To customize, edit `content.ts`:

```typescript
const response = await fetch(`${DESKTOP_HUB_URL}/api/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query,
    user_id: userId,
    limit: 5,        // Change this
    min_score: 0.7,  // Change this
  }),
});
```

---

## 💡 Pro Tips

### 1. Use Exact IDs for Instant Results

When you know the exact ID:
```
@@LIN-123
@@PROJ-456
@@ENG-789
```

These bypass semantic search and return results in ~50ms.

### 2. Use Natural Language for Discovery

When exploring:
```
@@deployment issues last week
@@authentication architecture
@@customer feedback about pricing
```

The AI-powered semantic search will find relevant content even if it doesn't match exact words.

### 3. Result Insertion Format

Selected results are inserted as markdown links:
```markdown
[Linear Issue: Fix auth bug](https://linear.app/issue/LIN-123)
```

This makes it easy to reference in your ChatGPT/Claude conversations.

---

## 🐛 Troubleshooting

### Issue: No Results Appear

**Possible Causes:**
1. Desktop Hub not running
2. No content synced yet
3. Query too short (minimum 1 character after `@@`)

**Fix:**
```bash
# Check if Desktop Hub is running
curl http://localhost:3124/health

# Check search endpoint
curl -X POST http://localhost:3124/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test","user_id":"demo@example.com"}'
```

### Issue: Search is Slow

**Possible Causes:**
1. First search (cold start)
2. Large result set
3. OpenAI API latency

**Expected Performance:**
- Exact ID match: ~50ms
- Semantic search: ~300-500ms

### Issue: Results Not Relevant

**Solutions:**
1. Lower `min_score` threshold (default: 0.7)
2. Add more specific keywords
3. Use exact IDs when possible
4. Check that content is synced to Supabase

---

## 🔐 Privacy & Security

- All searches go through your local Desktop Hub (`localhost:3124`)
- No data is sent to external servers (except OpenAI for embeddings)
- User isolation via Row-Level Security (RLS) in Supabase
- Results are filtered to only show your own content

---

## 📊 Performance Metrics

| Search Type | Latency | Use Case |
|-------------|---------|----------|
| Exact ID | ~50ms | LIN-123, PROJ-456 |
| Title Match | ~100ms | Exact text in title |
| Semantic | ~300ms | Natural language queries |
| Hybrid | ~400ms | Complex queries |

---

## 🎓 Advanced Usage

### Chaining Searches

You can use multiple `@@` triggers in one message:

```
I'm working on @@LIN-123 which relates to @@authentication architecture. 
We discussed this in @@slack thread about oauth
```

Each `@@` will be replaced with the selected result.

### Using in Prompts

```
Explain the solution for @@LIN-123 in the context of our @@API documentation
```

This allows you to build context-rich prompts by pulling in relevant documentation.

### Combining with ChatGPT Features

```
@@ + Tab (for inline suggestions)
@@ + Shift+Enter (for new line without submitting)
```

---

## 📚 API Reference

The RAG search uses the new `/api/search` endpoint:

```typescript
POST /api/search
{
  "query": "authentication bug",
  "user_id": "user@example.com",
  "sources": ["linear", "notion"],  // Optional filter
  "limit": 10,                       // Optional (default: 10)
  "min_score": 0.7                   // Optional (default: 0.7)
}
```

**Response:**
```json
{
  "success": true,
  "query": "authentication bug",
  "results": [
    {
      "id": "uuid",
      "source": "linear",
      "external_id": "LIN-123",
      "title": "Fix authentication bug in login flow",
      "url": "https://linear.app/issue/LIN-123",
      "snippet": "Users are unable to log in...",
      "score": 0.92,
      "match_type": "semantic"
    }
  ],
  "count": 1,
  "elapsed_ms": 287
}
```

---

## 🔄 Future Enhancements

Planned features:
- [ ] Customize trigger character (e.g., `##` instead of `@@`)
- [ ] Filter by source (e.g., `@@linear: auth bug`)
- [ ] Date range filters (e.g., `@@last week deployment`)
- [ ] Result preview on hover
- [ ] History of recent searches
- [ ] Keyboard shortcut to open search (Cmd+K)

---

## 🆘 Getting Help

If you encounter issues:

1. **Check Console**: Open DevTools (F12) → Console tab
2. **Check Network**: DevTools → Network tab → Filter by "localhost:3124"
3. **Check Desktop Hub**: Logs should show incoming search requests
4. **Review Docs**: See `/apps/desktop/docs/SEARCH_ARCHITECTURE.md`

---

## ✅ Success Checklist

Before using RAG search, ensure:

- [ ] Desktop Hub is running (`http://localhost:3124`)
- [ ] Search health check passes (`/api/search/health`)
- [ ] Content is synced to Supabase
- [ ] User ID is configured (localStorage)
- [ ] Extension is loaded in Chrome
- [ ] You're on ChatGPT or Claude

---

**Happy Searching! 🚀**

For more details, see:
- Technical docs: `/apps/desktop/docs/SEARCH_ARCHITECTURE.md`
- API guide: `/apps/desktop/docs/API_INTEGRATION.md`
- Setup: `/apps/desktop/docs/INTEGRATION_CHECKLIST.md`

