// What VRChat tells the app over OSC (opt-in, Settings → Notifications →
// Chatbox (OSC) → Listen): the avatar you're wearing, its toggles, AFK and
// muted. A history of your own avatars is kept on this device.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { getState, subscribeState } from "./store";

export type ParamValue = boolean | number | string;
export interface AvatarParam {
  name: string;
  type: "Bool" | "Int" | "Float" | string;
  /** VRChat takes it as input (it can be set from the app). */
  input: boolean;
}
export interface AvatarConfig {
  id: string;
  name: string;
  parameters: AvatarParam[];
}
export interface WornAvatar {
  id: string;
  name: string;
  at: number;
}

export interface OscLive {
  listening: boolean;
  error: string;
  avatar: string | null;
  config: AvatarConfig | null;
  params: Record<string, ParamValue>;
  history: WornAvatar[];
}

/** VRChat's own parameters: not avatar toggles. */
export const BUILT_IN = new Set(
  "IsLocal Viseme Voice GestureLeft GestureRight GestureLeftWeight GestureRightWeight AngularY VelocityX VelocityY VelocityZ VelocityMagnitude Upright Grounded Seated AFK TrackingType VRMode MuteSelf InStation Earmuffs IsOnFriendsList AvatarVersion ScaleModified ScaleFactor ScaleFactorInverse EyeHeightAsMeters EyeHeightAsPercent IsAnimatorEnabled PreviewMode".split(
    " ",
  ),
);

const HISTORY = "vfm-osc-avatars";
const KEEP = 200;

function loadHistory(): WornAvatar[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}

/** The history with `id` worn now on top (once), newest first. */
export function wear(history: WornAvatar[], id: string, name: string, at = Date.now()): WornAvatar[] {
  const prev = history.find((h) => h.id === id);
  return [{ id, name: name || prev?.name || "", at }, ...history.filter((h) => h.id !== id)].slice(0, KEEP);
}

/** Toggles you can set from the app: inputs that aren't VRChat's own. */
export function toggles(config: AvatarConfig | null): AvatarParam[] {
  return (config?.parameters ?? []).filter((p) => p.input && !BUILT_IN.has(p.name) && ["Bool", "Int", "Float"].includes(p.type));
}

let state: OscLive = { listening: false, error: "", avatar: null, config: null, params: {}, history: loadHistory() };
const subs = new Set<() => void>();
function set(patch: Partial<OscLive>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function useOscLive(): OscLive {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

async function onAvatar(id: string) {
  set({ avatar: id, params: {}, config: null });
  const config = await invoke<AvatarConfig | null>("osc_avatar_config", { id }).catch(() => null);
  if (state.avatar !== id) return;
  const history = wear(state.history, id, config?.name ?? "");
  try {
    localStorage.setItem(HISTORY, JSON.stringify(history));
  } catch {
    /* storage blocked: keep it in memory */
  }
  set({ config, history });
}

/** Set a toggle on your avatar (sent to VRChat's OSC input). */
export async function setParam(name: string, value: ParamValue, kind?: string) {
  const o = getState().settings.extras.osc;
  await invoke("osc_set_param", { name, value, kind, host: o.host, port: o.port });
  set({ params: { ...state.params, [name]: value } });
}

let unlisten: UnlistenFn | null = null;
let running = "";

async function apply() {
  const o = getState().settings.extras.osc;
  const want = o.listen ? `${o.listenPort}|${o.host}` : "";
  if (want === running) return;
  running = want;
  if (!want) {
    await invoke("osc_listen_stop").catch(() => {});
    set({ listening: false, error: "" });
    return;
  }
  if (!unlisten)
    unlisten = await listen<{ avatar: string | null; params: Record<string, ParamValue> }>("osc-live", (e) => {
      if (e.payload.avatar) void onAvatar(e.payload.avatar);
      if (Object.keys(e.payload.params).length) set({ params: { ...state.params, ...e.payload.params } });
    });
  try {
    await invoke("osc_listen_start", { port: o.listenPort, from: o.host });
    set({ listening: true, error: "" });
  } catch (e) {
    set({ listening: false, error: String(e) });
  }
}

let unsub: (() => void) | null = null;
export function startOscLive() {
  if (unsub) return;
  let last: unknown = null;
  unsub = subscribeState(() => {
    const o = getState().settings.extras.osc;
    if (o === last) return;
    last = o;
    void apply();
  });
  void apply();
}

export function stopOscLive() {
  unsub?.();
  unsub = null;
  unlisten?.();
  unlisten = null;
  running = "";
  void invoke("osc_listen_stop").catch(() => {});
}
