/**
 * Background Service Worker for Context Bridge Extension
 * Handles extension lifecycle and messaging between components
 */

import type { IntegrationProvider, IntegrationsListResponse } from "@context-plug/shared";

const DESKTOP_HUB_URL = "http://localhost:3124";

// Track connection status
let isHubConnected = false;
let connectedIntegrations = 0;

interface IntegrationCache {
  lastFetch: number;
  integrations: IntegrationsListResponse["integrations"];
}

let integrationCache: IntegrationCache = {
  lastFetch: 0,
  integrations: [],
};

/**
 * Check if the Desktop Hub is available
 */
async function checkHubConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${DESKTOP_HUB_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    isHubConnected = response.ok;
    return isHubConnected;
  } catch {
    isHubConnected = false;
    return false;
  }
}

/**
 * Fetch integration statuses from the hub
 */
async function fetchIntegrations(): Promise<IntegrationsListResponse["integrations"]> {
  try {
    const response = await fetch(`${DESKTOP_HUB_URL}/integrations`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return [];
    }

    const data: IntegrationsListResponse = await response.json();
    integrationCache = {
      lastFetch: Date.now(),
      integrations: data.integrations,
    };

    connectedIntegrations = data.integrations.filter(
      (i: { status: string }) => i.status === "connected"
    ).length;

    return data.integrations;
  } catch {
    return [];
  }
}

/**
 * Update extension badge based on connection status
 */
async function updateBadge(): Promise<void> {
  const connected = await checkHubConnection();

  if (connected) {
    await fetchIntegrations();

    if (connectedIntegrations > 0) {
      chrome.action.setBadgeText({ text: String(connectedIntegrations) });
      chrome.action.setBadgeBackgroundColor({ color: "#00ff87" });
    } else {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#00ff87" });
    }
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
}

// Check connection status periodically
setInterval(updateBadge, 10000);

// Check on startup
chrome.runtime.onStartup.addListener(() => {
  console.log("[Context Bridge] Extension started");
  updateBadge();
});

// Check when installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Context Bridge] Extension installed/updated");
  updateBadge();
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHECK_HUB_STATUS") {
    checkHubConnection().then((connected) => {
      sendResponse({ connected });
    });
    return true;
  }

  if (message.type === "GET_INTEGRATIONS") {
    fetchIntegrations().then((integrations) => {
      sendResponse({ success: true, integrations });
    });
    return true;
  }

  if (message.type === "GET_CONTEXT") {
    fetch(`${DESKTOP_HUB_URL}/context`)
      .then((response) => response.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === "FETCH_CONTENT") {
    const { provider, limit = 50 } = message as {
      provider: IntegrationProvider;
      limit?: number;
    };

    fetch(`${DESKTOP_HUB_URL}/content/${provider}?limit=${limit}`)
      .then((response) => response.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === "SEARCH_CONTENT") {
    const { query, providers, limit = 20 } = message as {
      query: string;
      providers?: IntegrationProvider[];
      limit?: number;
    };

    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    });

    if (providers && providers.length > 0) {
      params.set("providers", providers.join(","));
    }

    fetch(`${DESKTOP_HUB_URL}/content/search?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // New RAG Search with Hybrid Search Engine
  if (message.type === "RAG_SEARCH") {
    const { query, user_id, sources, limit = 10, min_score = 0.7 } = message as {
      query: string;
      user_id: string;
      sources?: string[];
      limit?: number;
      min_score?: number;
    };

    fetch(`${DESKTOP_HUB_URL}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        user_id,
        sources,
        limit,
        min_score,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Initial badge update
updateBadge();

console.log("[Context Bridge] Background service worker initialized");
