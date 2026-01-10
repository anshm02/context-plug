// Load environment variables FIRST, before any other imports
// This ensures process.env is populated before server.ts reads it
import * as path from "path";

// Determine the .env path based on whether we're in dev or production
const envPath = path.join(__dirname, "../../.env");

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  const result = dotenv.config({ path: envPath });
  
  if (result.error) {
    console.warn(`[Context Bridge] Could not load .env from ${envPath}`);
    console.warn("[Context Bridge] Make sure to create apps/desktop/.env with your NANGO_SECRET_KEY");
  } else {
    console.log("[Context Bridge] Environment loaded from .env");
    // Debug: show if key is present (don't log the actual key!)
    console.log("[Context Bridge] NANGO_SECRET_KEY configured:", !!process.env.NANGO_SECRET_KEY);
  }
} catch (err) {
  console.warn("[Context Bridge] dotenv not available, using system environment variables");
}

// Now import everything else AFTER env vars are loaded
import { app, BrowserWindow, shell, ipcMain } from "electron";
import { startServer, PORT } from "./server";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0b",
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Handle OAuth URL opening
 * Opens the OAuth authorization URL in the default browser
 */
ipcMain.handle("open-oauth-url", async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error("[OAuth] Failed to open URL:", error);
    return { success: false, error: String(error) };
  }
});

/**
 * Handle refresh integrations request
 */
ipcMain.handle("refresh-integrations", async () => {
  // This will be called after OAuth completion to refresh the UI
  if (mainWindow) {
    mainWindow.webContents.send("integrations-updated");
  }
  return { success: true };
});

app.whenReady().then(() => {
  // Start the Express server
  startServer((port) => {
    console.log(`[Electron] Context Bridge server started on port ${port}`);
  });

  // Create the main window
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Log the port for debugging
console.log(`[Context Bridge] Will start on port ${PORT}`);
