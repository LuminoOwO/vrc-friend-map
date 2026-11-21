// Your other VRChat accounts (Settings → Account & data → Your other
// accounts). Their sessions live in the Rust side (accounts.json on this
// device); here: which ones show on the map, their own live connections,
// notifications for their friends, and adding / removing them.

import { t as tr } from "./i18n";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { backend, isTauri } from "./backend";
import { getState, showToast, subscribeState, updateCache, updateSettings } from "./store";
import { applyAccountEvent, fetchAccountFriends, remergeAlts } from "./sync";
import type { AccountEntry } from "./types";

/** Live connection state per account, for the settings. */
const liveState = new Map<string, { connected: boolean; message: string }>();
const subs = new Set<() => void>();
export function accountLive(id: string) {
  return liveState.get(id);
}
export function onAccountLive(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** The settings list matched to the accounts stored on this device: new ones added (shown, nothing else on), gone ones dropped. */
export function reconcile(list: AccountEntry[], stored: { id: string; name: string }[]): AccountEntry[] {
  const out = stored.map((s) => {
    const had = list.find((a) => a.id === s.id);
    return had ? { ...had, name: s.name || had.name } : { id: s.id, name: s.name, show: true, live: false, notify: false };
  });
  const same = out.length === list.length && out.every((a, i) => JSON.stringify(a) === JSON.stringify(list[i]));
  return same ? list : out;
}

async function refreshList() {
  const stored = await backend.accountsList().catch(() => []);
  const a = getState().settings.accounts;
  const list = reconcile(a.list, stored);
  if (list !== a.list) updateSettings({ accounts: { ...a, list } });
  return list;
}

let running = new Map<string, boolean>();
function applyLive() {
  const want = new Map(getState().settings.accounts.list.map((a) => [a.id, a.show && a.live]));
  for (const [id, on] of want) {
    if ((running.get(id) ?? false) !== on) void backend.accountLive(id, on).catch(() => {});
  }
  for (const id of running.keys()) if (!want.has(id)) void backend.accountLive(id, false).catch(() => {});
  running = want;
}

let unlistens: UnlistenFn[] = [];

export async function startAccounts() {
  if (!isTauri || unlistens.length) return;
  unlistens.push(
    await listen<{ account: string; type: string; content: unknown }>("vrc-pipeline-account", (e) => {
      const acc = getState().settings.accounts.list.find((a) => a.id === e.payload.account);
      if (!acc) return;
      let content = e.payload.content;
      if (typeof content === "string") {
        try {
          content = JSON.parse(content);
        } catch {
          return;
        }
      }
      applyAccountEvent(acc.id, e.payload.type, content, acc.notify);
    }),
    await listen<{ account: string; connected: boolean; message: string }>("vrc-pipeline-account-status", (e) => {
      liveState.set(e.payload.account, { connected: e.payload.connected, message: e.payload.message });
      subs.forEach((f) => f());
    }),
    await listen<{ ok: boolean; message: string }>("account-login-finished", async (e) => {
      if (!e.payload.ok) {
        if (e.payload.message !== "Login cancelled") showToast(e.payload.message);
        return;
      }
      showToast(tr("accountsMsg.addedMessage", { message: e.payload.message }));
      const list = await refreshList();
      const added = list.find((a) => a.name === e.payload.message) ?? list[list.length - 1];
      if (added) void fetchAccountFriends(added.id).catch((err) => showToast(String(err)));
    }),
  );
  let last: unknown = null;
  unlistens.push(
    subscribeState(() => {
      const a = getState().settings.accounts;
      if (a === last) return;
      const before = last as typeof a | null;
      last = a;
      applyLive();
      // Shown accounts changed: mix the map again.
      const key = (x: typeof a | null) => x?.list.map((l) => `${l.id}:${l.show}`).join() ?? "";
      if (before && key(before) !== key(a)) remergeAlts();
    }),
  );
  await refreshList();
  applyLive();
}

export function stopAccounts() {
  unlistens.forEach((u) => u());
  unlistens = [];
  for (const id of running.keys()) void backend.accountLive(id, false).catch(() => {});
  running = new Map();
}

export async function addAccount() {
  try {
    await backend.addAccount();
  } catch (e) {
    showToast(String(e));
  }
}

export async function removeAccount(id: string) {
  await backend.accountRemove(id);
  updateCache((c) => {
    if (!c.alts?.[id]) return c;
    const alts = { ...c.alts };
    delete alts[id];
    return { ...c, alts };
  });
  const a = getState().settings.accounts;
  updateSettings({ accounts: { ...a, list: a.list.filter((x) => x.id !== id) } });
  remergeAlts();
}

export function setAccount(id: string, patch: Partial<AccountEntry>) {
  const a = getState().settings.accounts;
  updateSettings({ accounts: { ...a, list: a.list.map((x) => (x.id === id ? { ...x, ...patch } : x)) } });
}
