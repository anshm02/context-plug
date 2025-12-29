# Context Bridge - Universal Context Bridge MVP

A monorepo that connects a Desktop App (Electron + Express) to a Chrome Extension, enabling seamless context sharing between your local file system and web applications like ChatGPT.

## Architecture

```
context-plug/
├── apps/
│   ├── desktop/     # Electron app with Express server (The Hub)
│   └── extension/   # Chrome Extension (Manifest V3)
├── packages/
│   └── shared/      # Shared TypeScript types
├── turbo.json       # Turborepo configuration
└── package.json     # Root workspace configuration
```

## How It Works

1. **Desktop Hub**: Runs an Express server on `localhost:3124` inside an Electron app
2. **Chrome Extension**: Injects a floating button on ChatGPT that fetches context from the Desktop Hub
3. **Communication**: Extension makes HTTP requests to the local server

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome browser

### Installation

```bash
# Install all dependencies
npm install

# Build the shared package first
npm run build --workspace=@context-plug/shared

# Generate extension icons
node apps/extension/scripts/generate-icons.js
```

### Running the Desktop App

```bash
# Build and run the desktop app
npm run dev:desktop
```

This will:
- Start an Express server on port 3124
- Open an Electron window showing "Server Running"

### Building the Chrome Extension

```bash
# Build the extension
npm run build:extension
```

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `apps/extension/dist` folder (after building)
5. The extension should now be active

### Testing the Bridge

1. Make sure the Desktop app is running
2. Visit [ChatGPT](https://chatgpt.com)
3. Look for the floating "Connect Hub" button in the bottom-right corner
4. Click it to fetch context from your Desktop Hub
5. A toast notification will show the received data

## API Endpoints

The Desktop Hub exposes these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check - returns `{ status: "ok" }` |
| `/context` | GET | Returns mock context data |

## Development

### Run Everything in Dev Mode

```bash
# Using Turbo (runs all dev scripts in parallel)
npm run dev
```

### Individual Workspaces

```bash
# Desktop only
npm run dev:desktop

# Extension only (watch mode)
npm run dev:extension
```

## Project Structure

### Desktop App (`apps/desktop`)

- `src/main/main.ts` - Electron main process
- `src/main/server.ts` - Express server with CORS
- `src/renderer/index.html` - Simple UI showing server status

### Extension (`apps/extension`)

- `manifest.json` - Manifest V3 configuration
- `src/content.ts` - Content script injected into ChatGPT
- `src/background.ts` - Background service worker

### Shared (`packages/shared`)

- `src/types.ts` - Shared TypeScript interfaces

## Security Notes

⚠️ **MVP Configuration**: CORS is set to allow all origins (`*`) for development. For production:
- Restrict CORS to specific origins
- Add authentication tokens
- Consider using a more secure communication channel

## Troubleshooting

### Extension shows "Hub Offline"
- Make sure the Desktop app is running
- Check that port 3124 is not blocked by firewall
- Verify the server is accessible: `curl http://localhost:3124/health`

### Button doesn't appear on ChatGPT
- Check Chrome extension permissions
- Look for errors in Chrome DevTools console
- Try refreshing the ChatGPT page

### Build errors
- Run `npm install` at the root
- Build shared package first: `npm run build --workspace=@context-plug/shared`

## License

MIT
