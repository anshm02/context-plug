import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script for the Context Bridge Desktop Hub
 * Exposes safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Open an OAuth URL in the default browser
   */
  openOAuthUrl: (url: string) => ipcRenderer.invoke("open-oauth-url", url),

  /**
   * Trigger a refresh of integrations (called after OAuth completes)
   */
  refreshIntegrations: () => ipcRenderer.invoke("refresh-integrations"),

  /**
   * Listen for integration updates
   */
  onIntegrationsUpdated: (callback: () => void) => {
    ipcRenderer.on("integrations-updated", callback);
    return () => {
      ipcRenderer.removeListener("integrations-updated", callback);
    };
  },
});

// Expose the hub URL for API calls
contextBridge.exposeInMainWorld("hubConfig", {
  baseUrl: "http://localhost:3124",
});
