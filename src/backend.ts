// Thin wrapper around the Rust commands. When the UI runs in a plain browser
// (npm run dev without Tauri) only demo mode works, and storage falls back to
// localStorage.
import type { LiveEvent } from "./activity";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LiveSnapshot, LogScanReport, MetPerson, PresenceStats } from "./types";

export type GraphicsMode = "auto" | "gpu" | "software";
export interface GraphicsInfo {
  mode: GraphicsMode;
  /** Set when the VRC_FRIEND_MAP_GPU environment variable overrides the saved choice. */
  forced: GraphicsMode | null;
  /** False where the choice does nothing (macOS, phones). */
  supported: boolean;
  /** chromium, webkitgtk, webview2, wkwebview or android-webview. */
  engine?: string;
  os?: string;
  arch?: string;
  /** Environment variables that affect drawing. */
  env?: [string, string][];
  /** Saved: run faster than the screen (next start). */
  unlocked?: boolean;
  /** This run is faster than the screen. */
  unlocked_now?: boolean;
  /** Possible on this build (Chromium on Linux, WebView2 on Windows). */
  can_unlock?: boolean;
}

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

function need<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return Promise.reject(new Error(NO_BACKEND));
  return invoke<T>(cmd, args);
}

export interface MyIdentity {
  userId: string;
  fingerprint: string;
  /** Put in your VRChat bio so friends' apps can confirm your key. */
  proof: string;
}

export interface RawServerInfo {
  software: string;
  version: string;
  protocol: number;
  name: string;
  encryption: "force-off" | "optional" | "recommended" | "force-on";
  registration: "open" | "invite" | "closed";
  box_pk: string;
  sign_pk: string;
  max_item_bytes: number;
  kinds: string[];
  logger: { enabled: boolean; paired: boolean };
  motd: string;
}

export interface InfoResult {
  url: string;
  info: RawServerInfo;
  keyChanged: boolean;
}

export interface PublishResult {
  sealed: boolean;
  recipients: number;
  notOnServer: string[];
  keyChanged: string[];
}

export interface InboxItem {
  owner: string;
  kind: string;
  created: number;
  sealed: boolean;
  fingerprint: string;
  payload: unknown;
  error: string | null;
}

export interface KeyPin {
  signPk: string;
  boxPk: string;
  fingerprint: string;
  firstSeen: number;
  servers: string[];
  offered?: { user_id: string; sign_pk: string; box_pk: string } | null;
}

export interface LoggerStatus {
  paired: boolean;
  owner: string | null;
  displayName: string;
  pairedAt: number;
  connected: boolean;
  message: string;
  connectedSince: number;
  lastEvent: number;
  events: number;
  friends: number;
  online: number;
  inVisibleInstances: number;
  since: number;
  pairs: number;
  lastResync: number;
}

export interface LoggerStats {
  since: number;
  updated: number;
  pairs: { a: string; b: string; secs: number; weighted: number; visits: number; days: number; last: number }[];
  people: { id: string; secs: number; hops: number; last: number }[];
  worlds: [string, number][];
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
  async logout(keepServerSession = false): Promise<void> {
    if (isTauri) await invoke("logout", { keepServerSession });
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
  /** Open a link in the system browser (or VRChat for vrchat:// links). */
  async openUrl(url: string): Promise<void> {
    if (!isTauri) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
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
  async graphicsSetUnlocked(unlocked: boolean): Promise<void> {
    if (!isTauri) return;
    await invoke("graphics_set_unlocked", { unlocked });
  },
  async graphicsInfo(): Promise<GraphicsInfo | null> {
    if (!isTauri) return null;
    return invoke<GraphicsInfo>("graphics_get");
  },
  /** Applies the next time the app starts. */
  async setGraphicsMode(mode: GraphicsMode): Promise<void> {
    if (isTauri) await invoke("graphics_set", { mode });
  },
  async restartApp(): Promise<void> {
    if (isTauri) await invoke("app_restart");
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
  // ---- live game log (src-tauri/src/livelog.rs) ----
  liveStart: (dirs: string[]) => need<void>("live_start", { dirs }),
  liveStop: () => (isTauri ? invoke<void>("live_stop") : Promise.resolve()),
  liveSnapshot: () => need<LiveSnapshot>("live_snapshot"),
  liveEvents: (since: number) => need<LiveEvent[]>("live_events", { since }),
  onLiveEvents(cb: (e: LiveEvent[]) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<LiveEvent[]>("live-events", (e) => cb(e.payload));
  },
  onLive(cb: (s: LiveSnapshot) => void): Promise<UnlistenFn> {
    if (!isTauri) return Promise.resolve(() => {});
    return listen<LiveSnapshot>("live-instance", (e) => cb(e.payload));
  },
  logsMet: (query: { exclude: string[]; min_secs: number; limit: number }) => need<MetPerson[]>("logs_met", { query }),
  /** One friend request (or its cancel), only ever from a button click. */
  friendRequest: (userId: string, cancel: boolean) => need<ApiResponse>("friend_request", { userId, cancel }),
  friendStatus: (userId: string) => need<ApiResponse>("friend_status", { userId }),
  /** Only ever from a button click, after the user confirmed. */
  unfriend: (userId: string) => need<ApiResponse>("unfriend", { userId }),
  moderateUser: (userId: string, kind: string, undo: boolean) => need<ApiResponse>("moderate_user", { userId, kind, undo }),
  // ---- vfm-servers (src-tauri/src/share.rs) ----
  share: {
    identity: () => need<MyIdentity>("share_identity"),
    exportKey: () => need<string>("share_export_key"),
    importKey: (text: string) => need<MyIdentity>("share_import_key", { text }),
    info: (url: string) => need<InfoResult>("share_info", { url }),
    trustServer: (url: string) => need<void>("share_trust_server", { url }),
    register: (url: string, invite?: string) => need<{ ok: boolean; existing: boolean }>("share_register", { url, invite: invite || null }),
    me: (url: string) => need<{ user: unknown; items: { kind: string; sealed: boolean; recipients: string[]; created: number }[]; loggerOwner: boolean }>("share_me", { url }),
    leave: (url: string) => need<unknown>("share_leave", { url }),
    publish: (url: string, kind: string, payload: string, recipients: string[], encrypt: boolean) =>
      need<PublishResult>("share_publish", { url, kind, payload, recipients, encrypt }),
    unpublish: (url: string, kind: string) => need<unknown>("share_unpublish", { url, kind }),
    inbox: (url: string) => need<InboxItem[]>("share_inbox", { url }),
    pins: () => need<Record<string, KeyPin>>("share_pins"),
    trustKey: (user: string) => need<void>("share_trust_key", { user }),
    loggerPair: (url: string, code: string) => need<unknown>("logger_pair", { url, code }),
    loggerUnpair: (url: string, forget: boolean) => need<unknown>("logger_unpair", { url, forget }),
    loggerStatus: (url: string) => need<LoggerStatus>("logger_status", { url }),
    loggerStats: (url: string) => need<LoggerStats>("logger_stats", { url }),
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
