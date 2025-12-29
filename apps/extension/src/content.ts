/**
 * Content Script for Context Bridge
 * Injects a floating button on ChatGPT that fetches context from the Desktop Hub
 */

import type { ContextResponse } from "@context-plug/shared";

const DESKTOP_HUB_URL = "http://localhost:3124";
const BUTTON_ID = "context-bridge-btn";
const TOAST_ID = "context-bridge-toast";

interface ConnectionState {
  connected: boolean;
  lastCheck: number;
}

const state: ConnectionState = {
  connected: false,
  lastCheck: 0,
};

/**
 * Create and inject the floating button using Shadow DOM
 */
function injectButton(): void {
  // Prevent duplicate injection
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  // Create host element
  const host = document.createElement("div");
  host.id = BUTTON_ID;
  host.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
  `;

  // Create shadow root for style isolation
  const shadow = host.attachShadow({ mode: "closed" });

  // Inject styles
  const styles = document.createElement("style");
  styles.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600&display=swap');
    
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
  `;

  // Create button
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
  `;

  // Add click handler
  button.addEventListener("click", handleButtonClick);

  // Assemble shadow DOM
  shadow.appendChild(styles);
  shadow.appendChild(button);

  // Inject into page
  document.body.appendChild(host);

  // Check connection status on load
  checkConnectionStatus(button);

  console.log("[Context Bridge] Button injected successfully");
}

/**
 * Check if Desktop Hub is running
 */
async function checkConnectionStatus(button: HTMLButtonElement): Promise<void> {
  try {
    const response = await fetch(`${DESKTOP_HUB_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      state.connected = true;
      button.classList.add("connected");
      button.querySelector(".label")!.textContent = "Hub Connected";
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
 * Handle button click - fetch context from Desktop Hub
 */
async function handleButtonClick(event: Event): Promise<void> {
  const button = event.currentTarget as HTMLButtonElement;

  // Prevent double-clicks
  if (button.classList.contains("loading")) {
    return;
  }

  button.classList.add("loading");
  button.querySelector(".label")!.textContent = "Fetching...";

  try {
    const response = await fetch(`${DESKTOP_HUB_URL}/context`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data: ContextResponse = await response.json();

    // Update button state
    button.classList.remove("loading");
    button.classList.add("connected");
    button.querySelector(".label")!.textContent = "Hub Connected";
    state.connected = true;

    // Show success toast
    showToast({
      type: "success",
      title: "Context Retrieved",
      message: data.data,
      source: data.source,
    });

    console.log("[Context Bridge] Context received:", data);
  } catch (error) {
    button.classList.remove("loading");
    button.classList.remove("connected");
    button.querySelector(".label")!.textContent = "Hub Offline";
    state.connected = false;

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Show error toast
    showToast({
      type: "error",
      title: "Connection Failed",
      message: `Could not connect to Desktop Hub. Make sure the desktop app is running on port 3124.`,
      source: errorMessage,
    });

    console.error("[Context Bridge] Error:", error);

    // Reset button text after delay
    setTimeout(() => {
      if (!state.connected) {
        button.querySelector(".label")!.textContent = "Connect Hub";
      }
    }, 3000);
  }
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
  // Remove existing toast
  const existingToast = document.getElementById(TOAST_ID);
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast host
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

  // Close button handler
  toast.querySelector(".toast-close")!.addEventListener("click", () => {
    host.remove();
  });

  shadow.appendChild(styles);
  shadow.appendChild(toast);
  document.body.appendChild(host);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    host.remove();
  }, 8000);
}

/**
 * Initialize the content script
 */
function init(): void {
  // Only run on ChatGPT
  if (
    !window.location.href.includes("chatgpt.com") &&
    !window.location.href.includes("chat.openai.com")
  ) {
    return;
  }

  console.log("[Context Bridge] Initializing on ChatGPT...");

  // Wait for page to be fully loaded
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
}

// Start the content script
init();

