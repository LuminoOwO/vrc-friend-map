// Backup and export (Settings → Local data): your notes, circles, stars,
// nicknames, block reasons, settings and your own sounds in one file (age
// notes stay on the device),
// encrypted with a password you choose (PBKDF2-SHA-256 + AES-GCM), to move
// to another device without a server. Your VRChat login, server keys and the
// friend cache aren't in it: sign in again on the new device and it syncs.
import { t as tr } from "./i18n";
import { customSounds, loadCustomSounds, restoreCustomSounds } from "./notifications";
import { flushSaves, getState, normalizeLocal, normalizeSettings, setState, updateLocal, updateSettings } from "./store";
import type { CustomSound } from "./types";

const FORMAT = "vfm-backup";
const ITER = 310_000;

interface Plain {
  format: typeof FORMAT;
  v: 1;
  t: number;
  local: unknown;
  settings: unknown;
  sounds: CustomSound[];
}
interface Sealed {
  format: typeof FORMAT;
  v: 1;
  kdf: { name: "PBKDF2-SHA-256"; iter: number; salt: string };
  iv: string;
  data: string;
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function b64big(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function key(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Server keys live outside the settings (in the app's key store) and aren't in here. */
function settingsForBackup(): unknown {
  return structuredClone(getState().settings);
}

function localForBackup(): unknown {
  const l = structuredClone(getState().local) as unknown as Record<string, unknown>;
  // This device's own push registration isn't for another device.
  delete l.push;
  delete l.deviceId;
  // Age notes never leave the device, not even encrypted.
  l.ageNotes = {};
  return l;
}

export async function makeBackup(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  await loadCustomSounds();
  await flushSaves();
  const plain: Plain = { format: FORMAT, v: 1, t: Date.now(), local: localForBackup(), settings: settingsForBackup(), sounds: customSounds() };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(password, salt, ITER), new TextEncoder().encode(JSON.stringify(plain)));
  const sealed: Sealed = { format: FORMAT, v: 1, kdf: { name: "PBKDF2-SHA-256", iter: ITER, salt: b64(salt) }, iv: b64(iv), data: b64big(new Uint8Array(ct)) };
  return JSON.stringify(sealed);
}

export async function openBackup(text: string, password: string): Promise<Plain> {
  let sealed: Sealed;
  try {
    sealed = JSON.parse(text);
  } catch {
    throw new Error("That isn't a VRC Friend Map backup.");
  }
  if (sealed?.format !== FORMAT || sealed.v !== 1) throw new Error("That isn't a VRC Friend Map backup (or it's from a newer version).");
  const iter = Math.min(5_000_000, Math.max(100_000, Number(sealed.kdf?.iter) || ITER));
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, await key(password, unb64(sealed.kdf.salt), iter), unb64(sealed.data));
  } catch {
    throw new Error("Wrong password, or the file is damaged.");
  }
  const plain = JSON.parse(new TextDecoder().decode(pt)) as Plain;
  if (plain?.format !== FORMAT) throw new Error("The backup is damaged.");
  return plain;
}

/** What a backup holds, for the "restore?" question. */
export function describeBackup(p: Plain): string {
  const l = normalizeLocal(p.local as never);
  const parts = [
    `${l.circles.length} circle${l.circles.length === 1 ? "" : "s"}`,
    `${Object.keys(l.nicknames ?? {}).length} nicknames`,
    `${(l.starred ?? []).length} starred`,
    `${p.sounds.length} sound${p.sounds.length === 1 ? "" : "s"}`,
  ];
  return tr("backupMsg.fromValueValue2AndSettings", { value: new Date(p.t).toLocaleString(), value2: parts.join(", ") });
}

/** Replace this device's notes, circles, settings and sounds with the backup's. */
export async function restoreBackup(p: Plain, opts: { settings: boolean }) {
  const keepPush = getState().local.push;
  const keepDevice = getState().local.deviceId;
  const local = normalizeLocal(p.local as never);
  const keepAge = getState().local.ageNotes;
  updateLocal(() => ({ ...local, push: keepPush, deviceId: keepDevice, ageNotes: keepAge }));
  if (opts.settings) {
    const cur = getState().settings;
    const next = normalizeSettings(p.settings as never);
    // Servers: keep this device's own keys; the backup has none.
    const servers = next.sharing.servers.map((s) => {
      const mine = cur.sharing.servers.find((c) => c.id === s.id);
      return mine ? { ...s, ...mine } : s;
    });
    updateSettings({ ...next, sharing: { ...next.sharing, servers } });
  }
  await restoreCustomSounds(p.sounds ?? []);
  setState({});
  await flushSaves();
}
