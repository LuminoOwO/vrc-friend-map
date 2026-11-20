import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Tauri sets TAURI_DEV_HOST when running on a phone during `tauri android dev`.
const host = process.env.TAURI_DEV_HOST;

// Short commit id, shown in Settings → About so test builds can be told apart.
let build = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
if (!build) {
  try {
    build = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    build = "unknown";
  }
}

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD__: JSON.stringify(build) },
  clearScreen: false,
  // .tools holds Tauri's own sources for the Chromium build; their tests aren't ours.
  test: { exclude: ["**/node_modules/**", "**/dist/**", ".tools/**", "src-tauri/**"] },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2021", chunkSizeWarningLimit: 1200 },
});
