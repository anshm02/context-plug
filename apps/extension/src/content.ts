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
const SEARCH_DROPDOWN_ID = "context-bridge-search-dropdown";

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

  // Initialize RAG search on @@ trigger
  initRagSearch();
}

// ============================================================================
// RAG Search with @@ Trigger
// ============================================================================

interface RagSearchState {
  debounceTimer: number | null;
  currentQuery: string;
  isSearching: boolean;
  lastInputElement: HTMLElement | null;
  triggerPosition: { x: number; y: number } | null;
}

const ragSearchState: RagSearchState = {
  debounceTimer: null,
  currentQuery: "",
  isSearching: false,
  lastInputElement: null,
  triggerPosition: null,
};

/**
 * Initialize RAG search monitoring for @@ trigger
 */
function initRagSearch(): void {
  // Monitor input changes
  document.addEventListener("input", handleInputChange, true);
  document.addEventListener("keydown", handleKeyDown, true);

  // Observe DOM for new input elements (SPA)
  const observer = new MutationObserver(() => {
    attachInputListeners();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  attachInputListeners();
}

/**
 * Attach listeners to ChatGPT input fields
 */
function attachInputListeners(): void {
  // ChatGPT selectors - updated for current DOM structure
  const selectors = [
    '#prompt-textarea',                  // Primary ChatGPT input (contenteditable div)
    'textarea[placeholder*="Ask"]',      // Fallback textarea
    'div[contenteditable="true"]',       // Any contenteditable divs
    'textarea[data-id]',                 // Old selector (fallback)
    'textarea[placeholder*="Message"]',  // Generic message input
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      if (!element.hasAttribute("data-rag-search-attached")) {
        element.setAttribute("data-rag-search-attached", "true");
        
        // Use event capturing to bypass ProseMirror event blocking
        // Listen to multiple events for reliability
        element.addEventListener("input", handleInputChange as EventListener, { capture: true });
        element.addEventListener("keyup", handleInputChange as EventListener, { capture: true });
        element.addEventListener("beforeinput", handleInputChange as EventListener, { capture: true });
        element.addEventListener("keydown", handleKeyDown as EventListener, { capture: true });
        
        console.log("[RAG Search] Attached to:", selector, element);
      }
    });
  });
}

/**
 * Handle input changes to detect @@ trigger
 */
function handleInputChange(event: Event): void {
  const target = event.target as HTMLTextAreaElement | HTMLDivElement;

  if (!target) return;

  const text = (target as HTMLTextAreaElement).value || target.textContent || "";
  
  // Check if text contains @@
  const atAtIndex = text.lastIndexOf("@@");
  
  if (atAtIndex === -1) {
    // No @@ found, hide dropdown
    hideSearchDropdown();
    return;
  }

  // Extract query after @@
  const afterAtAt = text.slice(atAtIndex + 2);
  
  // Check if there's a space or newline after @@ (which would end the query)
  const endIndex = afterAtAt.search(/[\s\n]/);
  const query = endIndex === -1 ? afterAtAt : afterAtAt.slice(0, endIndex);

  // Only search if query is not empty
  if (query.length === 0) {
    hideSearchDropdown();
    return;
  }

  console.log("[RAG Search] Query detected:", query);

  ragSearchState.currentQuery = query;
  ragSearchState.lastInputElement = target;

  // Calculate dropdown position
  calculateDropdownPosition(target);

  // Debounce search
  if (ragSearchState.debounceTimer) {
    console.log("[RAG Search] Clearing previous debounce timer");
    clearTimeout(ragSearchState.debounceTimer);
  }

  console.log("[RAG Search] Setting 500ms debounce timer for query:", query);
  ragSearchState.debounceTimer = setTimeout(() => {
    console.log("[RAG Search] Debounce timer fired! Calling performRagSearch for:", query);
    performRagSearch(query, target);
  }, 500); // 500ms debounce
}

/**
 * Handle keyboard navigation in search dropdown
 */
function handleKeyDown(event: KeyboardEvent): void {
  const dropdown = document.getElementById(SEARCH_DROPDOWN_ID);
  
  if (!dropdown) return;

  const shadow = dropdown.shadowRoot;
  if (!shadow) return;

  const results = shadow.querySelectorAll(".search-result-item");
  const selectedResult = shadow.querySelector(".search-result-item.selected");

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (selectedResult) {
        const next = selectedResult.nextElementSibling;
        if (next) {
          selectedResult.classList.remove("selected");
          next.classList.add("selected");
          next.scrollIntoView({ block: "nearest" });
        }
      } else if (results.length > 0) {
        results[0].classList.add("selected");
      }
      break;

    case "ArrowUp":
      event.preventDefault();
      if (selectedResult) {
        const prev = selectedResult.previousElementSibling;
        if (prev) {
          selectedResult.classList.remove("selected");
          prev.classList.add("selected");
          prev.scrollIntoView({ block: "nearest" });
        }
      }
      break;

    case "Enter":
      if (selectedResult && ragSearchState.lastInputElement) {
        event.preventDefault();
        const resultData = (selectedResult as HTMLElement).dataset.result;
        if (resultData) {
          insertSearchResult(JSON.parse(decodeURIComponent(resultData)));
        }
      }
      break;

    case "Escape":
      event.preventDefault();
      hideSearchDropdown();
      break;
  }
}

/**
 * Calculate position for search dropdown
 */
function calculateDropdownPosition(inputElement: HTMLElement): void {
  const rect = inputElement.getBoundingClientRect();
  ragSearchState.triggerPosition = {
    x: rect.left,
    y: rect.top + rect.height + 8,
  };
}

/**
 * Perform RAG search via Desktop Hub API
 */
async function performRagSearch(query: string, inputElement: HTMLElement): Promise<void> {
  console.log("[RAG Search] performRagSearch called with query:", query);
  
  if (ragSearchState.isSearching) {
    console.log("[RAG Search] Already searching, skipping...");
    return;
  }

  ragSearchState.isSearching = true;
  console.log("[RAG Search] Starting search...");

  try {
    // Get user ID (you might want to fetch this from localStorage or settings)
    const userId = localStorage.getItem("context_plug_user_id") || "demo@example.com";
    console.log("[RAG Search] User ID:", userId);

    // Use background script to bypass CSP restrictions
    console.log("[RAG Search] Sending message to background script...");
    const response = await chrome.runtime.sendMessage({
      type: "RAG_SEARCH",
      query,
      user_id: userId,
      limit: 5,
      min_score: 0.7,
    });

    console.log("[RAG Search] Response received:", response);

    if (!response.success) {
      throw new Error(response.error || "Search failed");
    }

    const data = response.data;
    console.log("[RAG Search] Data:", data);

    if (data.success && data.results.length > 0) {
      console.log("[RAG Search] Showing dropdown with", data.results.length, "results");
      showSearchDropdown(data.results, inputElement);
    } else {
      console.log("[RAG Search] No results found, showing empty dropdown");
      showSearchDropdown([], inputElement);
    }
  } catch (error) {
    console.error("[RAG Search] Error:", error);
    showToast({
      type: "error",
      title: "Search Failed",
      message: "Could not perform RAG search. Is Desktop Hub running?",
      source: "RAG Search",
    });
  } finally {
    ragSearchState.isSearching = false;
    console.log("[RAG Search] Search completed");
  }
}

/**
 * Show search results dropdown
 */
function showSearchDropdown(results: any[], inputElement: HTMLElement): void {
  console.log("[RAG Search] showSearchDropdown called with", results.length, "results");
  
  // Remove existing dropdown
  hideSearchDropdown();

  if (results.length === 0) {
    console.log("[RAG Search] No results to show, skipping dropdown");
    return; // Don't show empty dropdown
  }

  console.log("[RAG Search] Creating dropdown element...");
  const host = document.createElement("div");
  host.id = SEARCH_DROPDOWN_ID;
  
  const rect = inputElement.getBoundingClientRect();
  host.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 8}px;
    z-index: 2147483646;
    width: ${Math.min(500, rect.width)}px;
    max-width: 90vw;
  `;

  console.log("[RAG Search] Dropdown position:", { left: rect.left, top: rect.bottom + 8 });

  const shadow = host.attachShadow({ mode: "open" });

  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .dropdown {
      background: linear-gradient(145deg, #1a1a1d 0%, #0d0d0f 100%);
      border: 1px solid #2a2a2e;
      border-radius: 12px;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #ffffff;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      overflow: hidden;
      animation: slideDown 0.15s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .dropdown-header {
      padding: 10px 12px;
      border-bottom: 1px solid #2a2a2e;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 255, 135, 0.05);
    }

    .dropdown-title {
      font-size: 11px;
      font-weight: 600;
      color: #00ff87;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .dropdown-hint {
      font-size: 10px;
      color: #71717a;
    }

    .results-container {
      max-height: 300px;
      overflow-y: auto;
    }

    .search-result-item {
      padding: 12px;
      cursor: pointer;
      transition: background 0.1s;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .search-result-item:hover,
    .search-result-item.selected {
      background: rgba(0, 255, 135, 0.08);
    }

    .search-result-item:last-child {
      border-bottom: none;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .result-source {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 255, 135, 0.15);
      color: #00ff87;
      text-transform: uppercase;
      font-weight: 600;
    }

    .result-score {
      font-size: 10px;
      color: #71717a;
    }

    .result-title {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .result-snippet {
      font-size: 11px;
      color: #a1a1aa;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .result-match-type {
      font-size: 10px;
      color: #52525b;
      margin-top: 4px;
    }

    .no-results {
      padding: 24px;
      text-align: center;
      color: #71717a;
      font-size: 12px;
    }

    /* Scrollbar styling */
    .results-container::-webkit-scrollbar {
      width: 6px;
    }

    .results-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .results-container::-webkit-scrollbar-thumb {
      background: #3a3a3e;
      border-radius: 3px;
    }
  `;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";

  dropdown.innerHTML = `
    <div class="dropdown-header">
      <span class="dropdown-title">🔍 RAG Search Results</span>
      <span class="dropdown-hint">↑↓ navigate • Enter select • Esc close</span>
    </div>
    <div class="results-container">
      ${results.length > 0
        ? results
            .map(
              (result, index) => `
          <div 
            class="search-result-item ${index === 0 ? "selected" : ""}" 
            data-result="${encodeURIComponent(JSON.stringify(result))}"
          >
            <div class="result-header">
              <span class="result-source">${result.source}</span>
              <span class="result-score">Score: ${(result.score * 100).toFixed(0)}%</span>
            </div>
            <div class="result-title">${escapeHtml(result.title)}</div>
            <div class="result-snippet">${escapeHtml(result.snippet)}</div>
            <div class="result-match-type">Match: ${result.match_type}</div>
          </div>
        `
            )
            .join("")
        : `<div class="no-results">No results found for "${escapeHtml(ragSearchState.currentQuery)}"</div>`}
    </div>
  `;

  shadow.appendChild(styles);
  shadow.appendChild(dropdown);

  console.log("[RAG Search] Shadow DOM created, adding click handlers...");

  // Add click handlers
  shadow.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const resultData = (item as HTMLElement).dataset.result;
      if (resultData) {
        insertSearchResult(JSON.parse(decodeURIComponent(resultData)));
      }
    });
  });

  document.body.appendChild(host);
  console.log("[RAG Search] Dropdown appended to body! Dropdown should be visible now.");

  // Close dropdown when clicking outside
  const closeHandler = (e: MouseEvent) => {
    if (!host.contains(e.target as Node) && e.target !== inputElement) {
      hideSearchDropdown();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 100);
}

/**
 * Hide search dropdown
 */
function hideSearchDropdown(): void {
  const existing = document.getElementById(SEARCH_DROPDOWN_ID);
  if (existing) {
    existing.remove();
  }

  if (ragSearchState.debounceTimer) {
    clearTimeout(ragSearchState.debounceTimer);
    ragSearchState.debounceTimer = null;
  }
}

/**
 * Insert selected search result into input
 */
function insertSearchResult(result: any): void {
  if (!ragSearchState.lastInputElement) return;

  const input = ragSearchState.lastInputElement as HTMLTextAreaElement | HTMLDivElement;
  const currentText = (input as HTMLTextAreaElement).value || input.textContent || "";

  // Find and replace @@ with the result
  const atAtIndex = currentText.lastIndexOf("@@");
  if (atAtIndex === -1) return;

  // Find the end of the query (space, newline, or end of text)
  const afterAtAt = currentText.slice(atAtIndex + 2);
  const endIndex = afterAtAt.search(/[\s\n]/);
  const queryEnd = endIndex === -1 ? currentText.length : atAtIndex + 2 + endIndex;

  // Create replacement text
  const replacement = `[${result.title}](${result.url})`;
  const newText = currentText.slice(0, atAtIndex) + replacement + currentText.slice(queryEnd);
  const newCursorPos = atAtIndex + replacement.length;

  // Update input based on element type
  if (input instanceof HTMLTextAreaElement) {
    // Handle textarea
    input.value = newText;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.setSelectionRange(newCursorPos, newCursorPos);
  } else {
    // Handle contenteditable div
    input.textContent = newText;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    
    // Set cursor position for contenteditable
    try {
      const range = document.createRange();
      const selection = window.getSelection();
      const textNode = input.firstChild;
      
      if (textNode && selection) {
        const position = Math.min(newCursorPos, (input.textContent || "").length);
        range.setStart(textNode, position);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) {
      console.error("[RAG Search] Cursor positioning error:", e);
    }
  }

  // Hide dropdown
  hideSearchDropdown();

  // Focus input
  input.focus();

  // Show success toast
  showToast({
    type: "success",
    title: "Result Inserted",
    message: `Added: ${result.title}`,
    source: result.source,
  });
}

// Start the content script
init();
