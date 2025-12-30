/**
 * Content Script for Context Bridge
 * Injects a floating button on ChatGPT that fetches context from the Desktop Hub
 * Now with multi-integration support
 */

import type { 
  ContextResponse, 
  IntegrationProvider, 
  IntegrationStatus,
  ContentItem,
  ContentFetchResponse,
} from "@context-plug/shared";

const DESKTOP_HUB_URL = "http://localhost:3124";
const BUTTON_ID = "context-bridge-btn";
const PANEL_ID = "context-bridge-panel";
const TOAST_ID = "context-bridge-toast";

interface ConnectionState {
  connected: boolean;
  lastCheck: number;
  integrations: IntegrationStatus[];
}

const state: ConnectionState = {
  connected: false,
  lastCheck: 0,
  integrations: [],
};

// Integration metadata
const INTEGRATION_META: Record<IntegrationProvider, { name: string; icon: string; color: string }> = {
  linear: { name: "Linear", icon: "⚡", color: "#5E6AD2" },
  notion: { name: "Notion", icon: "📝", color: "#ffffff" },
  "google-drive": { name: "Drive", icon: "📁", color: "#4285F4" },
  "google-mail": { name: "Gmail", icon: "✉️", color: "#EA4335" },
  jira: { name: "Jira", icon: "🎯", color: "#0052CC" },
  slack: { name: "Slack", icon: "💬", color: "#E01E5A" },
};

/**
 * Create and inject the floating button using Shadow DOM
 */
function injectButton(): void {
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = BUTTON_ID;
  host.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
  `;

  const shadow = host.attachShadow({ mode: "closed" });

  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
    }

    .bridge-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #1a1a1d 0%, #0d0d0f 100%);
      border: 1px solid #2a2a2e;
      border-radius: 12px;
      color: #ffffff;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 
        0 4px 12px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    }

    .bridge-button:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.1) inset;
      border-color: #3a3a3e;
    }

    .bridge-button:active {
      transform: translateY(0);
    }

    .bridge-button.connected {
      border-color: #00ff87;
      box-shadow: 
        0 4px 12px rgba(0, 255, 135, 0.15),
        0 0 0 1px rgba(0, 255, 135, 0.1) inset;
    }

    .bridge-button.connected:hover {
      box-shadow: 
        0 8px 24px rgba(0, 255, 135, 0.2),
        0 0 0 1px rgba(0, 255, 135, 0.15) inset;
    }

    .bridge-button.loading {
      opacity: 0.7;
      cursor: wait;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      transition: background 0.2s ease;
    }

    .bridge-button.connected .status-indicator {
      background: #00ff87;
      box-shadow: 0 0 8px #00ff87;
    }

    .icon {
      width: 18px;
      height: 18px;
      opacity: 0.9;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .bridge-button.loading .icon {
      animation: spin 1s linear infinite;
    }

    .badge {
      background: rgba(0, 255, 135, 0.2);
      color: #00ff87;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
  `;

  const button = document.createElement("button");
  button.className = "bridge-button";
  button.innerHTML = `
    <span class="status-indicator"></span>
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
    <span class="label">Connect Hub</span>
    <span class="badge" style="display: none;">0</span>
  `;

  button.addEventListener("click", handleButtonClick);

  shadow.appendChild(styles);
  shadow.appendChild(button);

  document.body.appendChild(host);

  checkConnectionStatus(button);

  console.log("[Context Bridge] Button injected successfully");
}

/**
 * Check if Desktop Hub is running and get integration statuses
 */
async function checkConnectionStatus(button: HTMLButtonElement): Promise<void> {
  try {
    const [healthResponse, integrationsResponse] = await Promise.all([
      fetch(`${DESKTOP_HUB_URL}/health`),
      fetch(`${DESKTOP_HUB_URL}/integrations`),
    ]);

    if (healthResponse.ok) {
      state.connected = true;
      button.classList.add("connected");

      if (integrationsResponse.ok) {
        const data = await integrationsResponse.json();
        state.integrations = data.integrations || [];

        const connectedCount = state.integrations.filter(
          (i) => i.status === "connected"
        ).length;

        const badge = button.querySelector(".badge") as HTMLElement;
        const label = button.querySelector(".label") as HTMLElement;

        if (connectedCount > 0) {
          badge.textContent = String(connectedCount);
          badge.style.display = "block";
          label.textContent = "Context";
        } else {
          badge.style.display = "none";
          label.textContent = "Hub Connected";
        }
      }
    } else {
      state.connected = false;
      button.classList.remove("connected");
      button.querySelector(".label")!.textContent = "Connect Hub";
    }
  } catch {
    state.connected = false;
    button.classList.remove("connected");
    button.querySelector(".label")!.textContent = "Connect Hub";
  }

  state.lastCheck = Date.now();
}

/**
 * Handle button click - show integration panel or fetch context
 */
async function handleButtonClick(event: Event): Promise<void> {
  const button = event.currentTarget as HTMLButtonElement;

  if (button.classList.contains("loading")) {
    return;
  }

  // Check connection first
  await checkConnectionStatus(button);

  if (!state.connected) {
    showToast({
      type: "error",
      title: "Hub Offline",
      message: "Desktop Hub is not running. Please start the Context Bridge desktop app.",
      source: "Connection Check",
    });
    return;
  }

  // Show integrations panel
  showIntegrationsPanel();
}

/**
 * Show the integrations panel
 */
function showIntegrationsPanel(): void {
  // Remove existing panel
  const existingPanel = document.getElementById(PANEL_ID);
  if (existingPanel) {
    existingPanel.remove();
    return; // Toggle off
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  host.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 24px;
    z-index: 2147483647;
    width: 320px;
  `;

  const shadow = host.attachShadow({ mode: "closed" });

  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .panel {
      background: linear-gradient(145deg, #1a1a1d 0%, #0d0d0f 100%);
      border: 1px solid #2a2a2e;
      border-radius: 16px;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #ffffff;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      overflow: hidden;
      animation: slideUp 0.2s ease;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .panel-header {
      padding: 16px;
      border-bottom: 1px solid #2a2a2e;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      color: #71717a;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }

    .close-btn:hover {
      color: #ffffff;
    }

    .integrations-list {
      padding: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .integration-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .integration-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .integration-item.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .integration-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .integration-info {
      flex: 1;
    }

    .integration-name {
      font-size: 13px;
      font-weight: 500;
    }

    .integration-status {
      font-size: 11px;
      color: #71717a;
      margin-top: 2px;
    }

    .integration-status.connected {
      color: #00ff87;
    }

    .fetch-btn {
      padding: 6px 12px;
      background: rgba(0, 255, 135, 0.15);
      border: 1px solid rgba(0, 255, 135, 0.3);
      border-radius: 6px;
      color: #00ff87;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .fetch-btn:hover {
      background: rgba(0, 255, 135, 0.25);
    }

    .fetch-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .panel-footer {
      padding: 12px 16px;
      border-top: 1px solid #2a2a2e;
      display: flex;
      justify-content: center;
    }

    .search-btn {
      width: 100%;
      padding: 10px 16px;
      background: linear-gradient(135deg, #00ff87 0%, #00d9ff 100%);
      border: none;
      border-radius: 8px;
      color: #000;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      font-family: inherit;
    }

    .search-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 255, 135, 0.3);
    }

    .search-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Scrollbar styling */
    .integrations-list::-webkit-scrollbar {
      width: 6px;
    }

    .integrations-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .integrations-list::-webkit-scrollbar-thumb {
      background: #3a3a3e;
      border-radius: 3px;
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";

  const connectedIntegrations = state.integrations.filter(
    (i) => i.status === "connected"
  );

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">Integrations</span>
      <button class="close-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="integrations-list">
      ${(["linear", "notion", "google-drive", "google-mail", "jira", "slack"] as IntegrationProvider[])
        .map((provider) => {
          const integration = state.integrations.find((i) => i.provider === provider);
          const isConnected = integration?.status === "connected";
          const meta = INTEGRATION_META[provider];

          return `
            <div class="integration-item ${isConnected ? "" : "disabled"}" data-provider="${provider}">
              <div class="integration-icon" style="background: ${meta.color}22;">
                <span>${meta.icon}</span>
              </div>
              <div class="integration-info">
                <div class="integration-name">${meta.name}</div>
                <div class="integration-status ${isConnected ? "connected" : ""}">
                  ${isConnected ? "● Connected" : "○ Not connected"}
                </div>
              </div>
              ${isConnected ? `<button class="fetch-btn" data-provider="${provider}">Fetch</button>` : ""}
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="panel-footer">
      <button class="search-btn" ${connectedIntegrations.length === 0 ? "disabled" : ""}>
        🔍 Search All Connected Sources
      </button>
    </div>
  `;

  shadow.appendChild(styles);
  shadow.appendChild(panel);

  // Event listeners
  panel.querySelector(".close-btn")!.addEventListener("click", () => {
    host.remove();
  });

  panel.querySelectorAll(".fetch-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const provider = (btn as HTMLElement).dataset.provider as IntegrationProvider;
      await fetchProviderContent(provider);
    });
  });

  panel.querySelector(".search-btn")!.addEventListener("click", () => {
    showSearchModal();
  });

  document.body.appendChild(host);

  // Close panel when clicking outside
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node) && !(e.target as Element).closest(`#${BUTTON_ID}`)) {
      host.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 100);
}

/**
 * Fetch content from a specific provider
 */
async function fetchProviderContent(provider: IntegrationProvider): Promise<void> {
  try {
    const response = await fetch(`${DESKTOP_HUB_URL}/content/${provider}?limit=10`);
    const data: ContentFetchResponse = await response.json();

    if (data.success && data.items.length > 0) {
      showContentResults(data.items, INTEGRATION_META[provider].name);
    } else {
      showToast({
        type: "error",
        title: "No Content Found",
        message: `No content available from ${INTEGRATION_META[provider].name}`,
        source: provider,
      });
    }
  } catch (error) {
    showToast({
      type: "error",
      title: "Fetch Failed",
      message: `Could not fetch content from ${INTEGRATION_META[provider].name}`,
      source: String(error),
    });
  }
}

/**
 * Show search modal
 */
function showSearchModal(): void {
  // For now, just show a simple search toast
  const query = prompt("Search across all connected sources:");
  if (!query) return;

  searchAllContent(query);
}

/**
 * Search content across all connected sources
 */
async function searchAllContent(query: string): Promise<void> {
  try {
    const response = await fetch(
      `${DESKTOP_HUB_URL}/content/search?q=${encodeURIComponent(query)}&limit=20`
    );
    const data = await response.json();

    if (data.success && data.results.length > 0) {
      showContentResults(data.results, `Search: "${query}"`);
    } else {
      showToast({
        type: "error",
        title: "No Results",
        message: `No results found for "${query}"`,
        source: "Search",
      });
    }
  } catch (error) {
    showToast({
      type: "error",
      title: "Search Failed",
      message: "Could not search content",
      source: String(error),
    });
  }
}

/**
 * Show content results in a modal
 */
function showContentResults(items: ContentItem[], title: string): void {
  // Remove existing panel first
  const existingPanel = document.getElementById(PANEL_ID);
  if (existingPanel) {
    existingPanel.remove();
  }

  const host = document.createElement("div");
  host.id = PANEL_ID;
  host.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 24px;
    z-index: 2147483647;
    width: 400px;
    max-height: 500px;
  `;

  const shadow = host.attachShadow({ mode: "closed" });

  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .panel {
      background: linear-gradient(145deg, #1a1a1d 0%, #0d0d0f 100%);
      border: 1px solid #2a2a2e;
      border-radius: 16px;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #ffffff;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      overflow: hidden;
      animation: slideUp 0.2s ease;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .panel-header {
      padding: 16px;
      border-bottom: 1px solid #2a2a2e;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
    }

    .back-btn, .close-btn {
      background: none;
      border: none;
      color: #71717a;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }

    .back-btn:hover, .close-btn:hover {
      color: #ffffff;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .results-list {
      padding: 8px;
      max-height: 400px;
      overflow-y: auto;
    }

    .result-item {
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s;
      margin-bottom: 4px;
    }

    .result-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .result-provider {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: #a1a1aa;
      text-transform: uppercase;
    }

    .result-title {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
    }

    .result-content {
      font-size: 12px;
      color: #71717a;
      line-height: 1.5;
      margin-top: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .result-meta {
      font-size: 10px;
      color: #52525b;
      margin-top: 8px;
    }

    .copy-btn {
      margin-top: 8px;
      padding: 6px 12px;
      background: rgba(0, 255, 135, 0.15);
      border: 1px solid rgba(0, 255, 135, 0.3);
      border-radius: 6px;
      color: #00ff87;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .copy-btn:hover {
      background: rgba(0, 255, 135, 0.25);
    }

    /* Scrollbar styling */
    .results-list::-webkit-scrollbar {
      width: 6px;
    }

    .results-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .results-list::-webkit-scrollbar-thumb {
      background: #3a3a3e;
      border-radius: 3px;
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">${title} (${items.length})</span>
      <div class="header-actions">
        <button class="back-btn" title="Back to integrations">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <button class="close-btn" title="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="results-list">
      ${items
        .map(
          (item) => `
          <div class="result-item" data-content="${encodeURIComponent(
            JSON.stringify(item)
          )}">
            <div class="result-header">
              <span class="result-provider">${item.provider}</span>
              <span class="result-type">${item.type}</span>
            </div>
            <div class="result-title">${escapeHtml(item.title)}</div>
            ${item.content ? `<div class="result-content">${escapeHtml(item.content.slice(0, 200))}</div>` : ""}
            ${item.url ? `<div class="result-meta">🔗 ${item.url}</div>` : ""}
            <button class="copy-btn">📋 Copy to Clipboard</button>
          </div>
        `
        )
        .join("")}
    </div>
  `;

  shadow.appendChild(styles);
  shadow.appendChild(panel);

  // Event listeners
  panel.querySelector(".close-btn")!.addEventListener("click", () => {
    host.remove();
  });

  panel.querySelector(".back-btn")!.addEventListener("click", () => {
    host.remove();
    showIntegrationsPanel();
  });

  panel.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const resultItem = (btn as HTMLElement).closest(".result-item") as HTMLElement;
      const content = JSON.parse(
        decodeURIComponent(resultItem.dataset.content || "{}")
      ) as ContentItem;

      const textToCopy = `**${content.title}**\n\n${content.content}\n\nSource: ${content.provider}${content.url ? ` - ${content.url}` : ""}`;

      try {
        await navigator.clipboard.writeText(textToCopy);
        (btn as HTMLElement).textContent = "✓ Copied!";
        setTimeout(() => {
          (btn as HTMLElement).textContent = "📋 Copy to Clipboard";
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  });

  document.body.appendChild(host);

  // Close when clicking outside
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node) && !(e.target as Element).closest(`#${BUTTON_ID}`)) {
      host.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 100);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

interface ToastOptions {
  type: "success" | "error";
  title: string;
  message: string;
  source: string;
}

/**
 * Show a toast notification
 */
function showToast(options: ToastOptions): void {
  const existingToast = document.getElementById(TOAST_ID);
  if (existingToast) {
    existingToast.remove();
  }

  const host = document.createElement("div");
  host.id = TOAST_ID;
  host.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 24px;
    z-index: 2147483647;
    max-width: 400px;
  `;

  const shadow = host.attachShadow({ mode: "closed" });

  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
    }

    .toast {
      background: linear-gradient(135deg, #1a1a1d 0%, #0d0d0f 100%);
      border: 1px solid ${options.type === "success" ? "#00ff87" : "#ef4444"};
      border-radius: 12px;
      padding: 16px;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #ffffff;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .toast-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .toast-icon {
      width: 20px;
      height: 20px;
      color: ${options.type === "success" ? "#00ff87" : "#ef4444"};
    }

    .toast-title {
      font-weight: 600;
      font-size: 14px;
    }

    .toast-message {
      font-size: 13px;
      line-height: 1.5;
      color: #a1a1aa;
      margin-bottom: 8px;
      word-break: break-word;
    }

    .toast-source {
      font-size: 11px;
      color: #52525b;
      font-family: monospace;
    }

    .toast-close {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: #52525b;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
    }

    .toast-close:hover {
      color: #a1a1aa;
    }
  `;

  const iconSvg =
    options.type === "success"
      ? `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`
      : `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>`;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.position = "relative";
  toast.innerHTML = `
    <button class="toast-close">&times;</button>
    <div class="toast-header">
      ${iconSvg}
      <span class="toast-title">${options.title}</span>
    </div>
    <div class="toast-message">${options.message}</div>
    <div class="toast-source">Source: ${options.source}</div>
  `;

  toast.querySelector(".toast-close")!.addEventListener("click", () => {
    host.remove();
  });

  shadow.appendChild(styles);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  setTimeout(() => {
    host.remove();
  }, 8000);
}

/**
 * Initialize the content script
 */
function init(): void {
  // Only run on ChatGPT and Claude
  if (
    !window.location.href.includes("chatgpt.com") &&
    !window.location.href.includes("chat.openai.com") &&
    !window.location.href.includes("claude.ai")
  ) {
    return;
  }

  console.log("[Context Bridge] Initializing...");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }

  // Re-inject button if removed (SPA navigation)
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) {
      injectButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Periodically refresh integration status
  setInterval(() => {
    const button = document
      .getElementById(BUTTON_ID)
      ?.shadowRoot?.querySelector(".bridge-button") as HTMLButtonElement | null;
    if (button) {
      checkConnectionStatus(button);
    }
  }, 30000);
}

// Start the content script
init();
