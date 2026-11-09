import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri sets TAURI_DEV_HOST when running on a phone during `tauri android dev`.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2021", chunkSizeWarningLimit: 1200 },
});
