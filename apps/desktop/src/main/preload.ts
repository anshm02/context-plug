// Preload script - runs in renderer context with Node.js access
// For MVP, we don't expose any APIs to the renderer
// This file is kept minimal for security

window.addEventListener("DOMContentLoaded", () => {
  console.log("[Preload] Context Bridge Desktop loaded");
});

