/**
 * Background Service Worker for Context Bridge Extension
 * Handles extension lifecycle and messaging between components
 */

const DESKTOP_HUB_URL = "http://localhost:3124";

// Track connection status
let isHubConnected = false;

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
 * Update extension badge based on connection status
 */
async function updateBadge(): Promise<void> {
  const connected = await checkHubConnection();

  if (connected) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00ff87" });
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
    return true; // Keep channel open for async response
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
    return true; // Keep channel open for async response
  }
});

// Initial badge update
updateBadge();

console.log("[Context Bridge] Background service worker initialized");

