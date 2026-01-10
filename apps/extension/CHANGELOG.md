# Changelog - Chrome Extension

## [1.2.0] - 2025-01-01

### 🎉 New Features

#### RAG Search with @@ Trigger
- **@@ Trigger**: Type `@@` in ChatGPT/Claude to activate intelligent search
- **Auto-complete**: Search results appear 500ms after you stop typing
- **Smart Routing**:
  - Exact ID match (LIN-123) → Instant results (~50ms)
  - Semantic search → AI-powered relevance (~300ms)
  - Hybrid search → Best of both worlds
- **Keyboard Navigation**: 
  - ↑↓ to navigate results
  - Enter to select
  - Esc to close
- **Result Insertion**: Selected items are inserted as markdown links

### 🔧 Improvements
- Added debounced search (500ms) for better performance
- Improved dropdown positioning relative to input
- Enhanced result display with scores and match types
- Better error handling for offline Desktop Hub

### 📚 Documentation
- Added `RAG_SEARCH_GUIDE.md` with complete usage instructions
- Added troubleshooting section
- Added keyboard shortcuts reference

---

## [1.1.0] - Previous Release

### Features
- Multi-integration panel
- Content fetching from connected sources
- Basic search functionality
- Toast notifications

---

## Future Releases

### Planned for v1.3.0
- Customizable trigger character
- Source-specific search (e.g., `@@linear: bug`)
- Date range filters
- Search history
- Global keyboard shortcut (Cmd/Ctrl+K)

