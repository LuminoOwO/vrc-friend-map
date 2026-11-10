// Thin wrapper around the Rust commands. When the UI runs in a plain browser
// (npm run dev without Tauri) only demo mode works, and storage falls back to
// localStorage.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LogScanReport, PresenceStats } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface ApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  retry_after: number | null;
}

export interface SessionInfo {
  logged_in: boolean;
  user_id: string | null;
  display_name: string | null;
}

export interface PipelineEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
}

export interface PipelineStatus {
  connected: boolean;
  message: string;
  fatal: boolean;
}

export interface LoginEvent {
  ok: boolean;
  message: string;
}

const NO_BACKEND = "This needs the desktop/mobile app (Tauri). In a plain browser only demo mode works.";

function lsKey(name: string) {
  return `vrcfm:${name}`;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const backend = {
  async sessionInfo(): Promise<SessionInfo> {
    if (!isTauri) return { logged_in: false, user_id: null, display_name: null };
    return invoke<SessionInfo>("session_info");
  },
  async loginStart(): Promise<void> {
    if (!isTauri) throw new Error(NO_BACKEND);
    await invoke("login_start");
  },
  async loginCancel(): Promise<void> {
    if (isTauri) await invoke("login_cancel");
  },
  async logout(): Promise<void> {
    if (isTauri) await invoke("logout");
  },
  async setApiSettings(contact: string, intervalMs: number): Promise<void> {
    if (isTauri) await invoke("set_api_settings", { settings: { contact, interval_ms: intervalMs } });
  },
  async vrcGet(path: string, query?: Record<string, string | number | boolean>): Promise<ApiResponse> {
    if (!isTauri) throw new Error(NO_BACKEND);
    const q = query ? Object.entries(query).map(([k, v]) => [k, String(v)] as [string, string]) : undefined;
    return invoke<ApiResponse>("vrc_get", { path, query: q });
  },
  async storeRead(name: string): Promise<string | null> {
    if (!isTauri) return localStorage.getItem(lsKey(name));
    return invoke<string | null>("store_read", { name });
  },
  async storeWrite(name: string, contents: string): Promise<void> {
    if (!isTauri) {
      try {
        localStorage.setItem(lsKey(name), contents);
      } catch {
        /* quota exceeded in browser demo; ignore */
      }
      return;
    }
    await invoke("store_write", { name, contents });
  },
  /** Copy a store file to store/backups before a migration. */
  async storeBackup(name: string, tag: string): Promise<string | null> {
    if (!isTauri) {
      const v = localStorage.getItem(lsKey(name));
      if (v) localStorage.setItem(lsKey(`backup-${name}-${tag}`), v);
      return v ? tag : null;
    }
    return invoke<string | null>("store_backup", { name, tag });
  },
  /** linux, windows, macos, android, ios — or "browser". */
  async platform(): Promise<string> {
    if (!isTauri) return "browser";
    return invoke<string>("app_platform");
  },
  async logsDetect(): Promise<string[]> {
    if (!isTauri) return [];
    return invoke<string[]>("logs_detect");
  },
  async logsScan(dirs: string[], retentionDays: number): Promise<LogScanReport> {
    return invoke<LogScanReport>("logs_scan", { dirs, retentionDays });
  },
  async logsInfo(): Promise<LogScanReport | null> {
    if (!isTauri) return null;
    return invoke<LogScanReport>("logs_info");
  },
  async logsStats(query: { friend_ids: string[]; self_id: string | null; crowd: string; since: number | null }): Promise<PresenceStats> {
    return invoke<PresenceStats>("logs_stats", { query });
  },
  async logsClear(): Promise<void> {
    if (isTauri) await invoke("logs_clear");
  },
  async storageInfo(): Promise<{ data_dir: string; image_cache_bytes: number } | null> {
    if (!isTauri) return null;
    return invoke("storage_info");
  },
  async clearImageCache(): Promise<void> {
    if (isTauri) await invoke("clear_image_cache");
  },
  async hashIds(salt: string, ids: string[]): Promise<string[]> {
    if (isTauri) return invoke<string[]>("hash_ids", { salt, ids });
    return Promise.all(ids.map((id) => sha256Hex(`${salt}:${id}`)));
  },
  async saveExport(filename: string, contents: string): Promise<string> {
    if (!isTauri) {
      const blob = new Blob([contents], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return filename;
    }
    return invoke<string>("save_export", { filename, contents });
  },
  async pipelineStart(): Promise<void> {
    if (isTauri) await invoke("pipeline_start");
  },
  async pipelineStop(): Promise<void> {
    if (isTauri) await invoke("pipeline_stop");
  },
  async pipelineConnected(): Promise<boolean> {
    if (!isTauri) return false;
    return invoke<boolean>("pipeline_connected");
  },
  onPipeline(cb: (e: PipelineEvent) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<PipelineEvent>("vrc-pipeline", (e) => cb(e.payload));
  },
  onPipelineStatus(cb: (e: PipelineStatus) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<PipelineStatus>("vrc-pipeline-status", (e) => cb(e.payload));
  },
  onLoginFinished(cb: (e: LoginEvent) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<LoginEvent>("login-finished", (e) => cb(e.payload));
  },
  onLoginProgress(cb: (e: LoginEvent) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<LoginEvent>("login-progress", (e) => cb(e.payload));
  },
};

/** Image URL as the webview should load it: VRChat URLs go through the
 *  Rust image proxy (cookie + disk cache); data: URLs pass through. */
export function imgSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!isTauri) return url;
  return convertFileSrc(url, "vrcimg");
}

export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
