// Open any VRChat link inside the app: profiles, worlds, groups, instances
// (vrchat.com links, vrchat:// launch links, or bare IDs).
import { setState } from "./store";

export type VrcTarget = { kind: "user"; id: string } | { kind: "world"; id: string } | { kind: "group"; id: string } | { kind: "instance"; location: string };

const ID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export function parseVrchatLink(text: string): VrcTarget | null {
  const s = text.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get("id") ?? (u.searchParams.get("worldId") && u.searchParams.get("instanceId") ? `${u.searchParams.get("worldId")}:${u.searchParams.get("instanceId")}` : null);
    if (id && /^wrld_/.test(id) && id.includes(":")) return { kind: "instance", location: decodeURIComponent(id) };
  } catch {
    // not a URL: look for IDs below
  }
  const inst = s.match(new RegExp(`(wrld_${ID}:[^\\s"'<>&]+)`));
  if (inst) return { kind: "instance", location: decodeURIComponent(inst[1]) };
  const usr = s.match(new RegExp(`usr_${ID}`));
  if (usr) return { kind: "user", id: usr[0] };
  const grp = s.match(new RegExp(`grp_${ID}`));
  if (grp) return { kind: "group", id: grp[0] };
  const wrld = s.match(new RegExp(`wrld_${ID}`));
  if (wrld) return { kind: "world", id: wrld[0] };
  return null;
}

/** Open it in the app; false when it isn't a VRChat link. */
export function openVrchatLink(text: string): boolean {
  const t = parseVrchatLink(text);
  if (!t) return false;
  if (t.kind === "user") setState({ selectedId: t.id });
  else if (t.kind === "world") setState({ openWorld: t.id });
  else if (t.kind === "group") setState({ openGroup: t.id });
  else setState({ openInstance: t.location });
  return true;
}

/** Pasting a VRChat link anywhere outside a text field opens it. */
export function installLinkPaste() {
  if (typeof document === "undefined") return;
  document.addEventListener("paste", (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    const text = e.clipboardData?.getData("text") ?? "";
    if (openVrchatLink(text)) e.preventDefault();
  });
}
