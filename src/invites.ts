// Invites and invite requests, and the saved messages that go with them.
// VRChat keeps 12 message slots per kind ("message" for invites you send,
// "request" for asking someone for an invite); a slot can be changed once an
// hour. The app shows them as invite templates and keeps a copy for one-click
// sending (local.inviteTemplates).
import { t as tr } from "./i18n";
import { backend } from "./backend";
import { getState, updateLocal } from "./store";
import type { InviteTemplate } from "./types";
import { errorText, vrcWrite } from "./writes";

export async function requestInvite(userId: string, slot?: number): Promise<string | null> {
  try {
    const r = await vrcWrite("POST", `/requestInvite/${userId}`, slot !== undefined ? { requestSlot: slot } : {}, "Request invite");
    return r.status >= 200 && r.status < 300 ? null : `${r.status} ${errorText(r)}`.trim();
  } catch (e) {
    return String(e);
  }
}

export async function inviteTo(userId: string, instanceId: string, slot?: number): Promise<string | null> {
  try {
    const r = await vrcWrite("POST", `/invite/${userId}`, { instanceId, ...(slot !== undefined ? { messageSlot: slot } : {}) }, "Invite");
    return r.status >= 200 && r.status < 300 ? null : `${r.status} ${errorText(r)}`.trim();
  } catch (e) {
    return String(e);
  }
}

/** Send yourself an invite to an instance (join from here: VRChat shows it in game). */
export async function inviteMyself(location: string): Promise<string | null> {
  try {
    const r = await vrcWrite("POST", `/invite/myself/to/${location}`, undefined, "Invite myself");
    return r.status >= 200 && r.status < 300 ? null : `${r.status} ${errorText(r)}`.trim();
  } catch (e) {
    return String(e);
  }
}

export interface MessageSlot {
  slot: number;
  message: string;
  /** Minutes until it can be changed again. */
  cooldown: number;
}

type Kind = "message" | "request";

/** Your saved messages of a kind from VRChat; keeps a copy as templates. */
export async function loadSlots(kind: Kind): Promise<MessageSlot[]> {
  const me = getState().cache.me?.id;
  if (!me) return [];
  const r = await backend.vrcGet(`/message/${me}/${kind}`);
  if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`VRChat: ${r.status} ${errorText(r)}`.trim());
  const slots = (r.data as { slot?: number; message?: string; remainingCooldownMinutes?: number }[])
    .filter((m) => typeof m.slot === "number")
    .map((m) => ({ slot: m.slot!, message: m.message ?? "", cooldown: m.remainingCooldownMinutes ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
  const tplKind: InviteTemplate["kind"] = kind === "message" ? "invite" : "request";
  updateLocal((l) => ({
    ...l,
    inviteTemplates: [
      ...(l.inviteTemplates ?? []).filter((t) => t.kind !== tplKind),
      ...slots.filter((s) => s.message).map((s) => ({ id: `${tplKind}:${s.slot}`, kind: tplKind, text: s.message, slot: s.slot })),
    ],
  }));
  return slots;
}

/** Change one saved message (VRChat allows it once an hour per slot). */
export async function saveSlot(kind: Kind, slot: number, message: string): Promise<string | null> {
  const me = getState().cache.me?.id;
  if (!me) return tr("invitesMsg.notLoggedIn");
  const r = await vrcWrite("PUT", `/message/${me}/${kind}/${slot}`, { message: message.slice(0, 64) }, "Save invite message");
  if (r.status < 200 || r.status >= 300) return `${r.status} ${errorText(r)}`.trim();
  await loadSlots(kind).catch(() => {});
  return null;
}
