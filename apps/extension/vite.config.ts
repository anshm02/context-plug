import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "fs";

// Plugin to copy static assets after build
function copyManifestPlugin() {
  return {
    name: "copy-manifest",
    closeBundle() {
      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, "manifest.json"),
        resolve(__dirname, "dist/manifest.json")
      );

      // Copy icons
      const iconsDir = resolve(__dirname, "icons");
      const distIconsDir = resolve(__dirname, "dist/icons");

      if (existsSync(iconsDir)) {
        mkdirSync(distIconsDir, { recursive: true });
        readdirSync(iconsDir).forEach((file) => {
          if (file.endsWith(".png")) {
            copyFileSync(resolve(iconsDir, file), resolve(distIconsDir, file));
          }
        });
      }

      console.log("[vite] Copied manifest.json and icons to dist/");
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        // Use ES module format for Chrome Extension MV3
        format: "es",
        // Prevent code splitting
        manualChunks: undefined,
      },
    },
    sourcemap: false,
    minify: false,
    // Prevent code splitting into chunks
    chunkSizeWarningLimit: Infinity,
  },
  plugins: [copyManifestPlugin()],
  resolve: {
    alias: {
      "@context-plug/shared": resolve(__dirname, "../../packages/shared/src"),
    },
  },
});
