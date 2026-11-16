// Your own notes and tags on worlds (this device, synced between your devices).
import { updateLocal } from "./store";

export function setWorldNote(id: string, text: string, tags: string) {
  updateLocal((l) => {
    const worldNotes = { ...(l.worldNotes ?? {}) };
    const t = tags
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!text.trim() && !t.length) delete worldNotes[id];
    else worldNotes[id] = { text: text.trim().slice(0, 1000), tags: t, t: Date.now() };
    return { ...l, worldNotes };
  });
}
