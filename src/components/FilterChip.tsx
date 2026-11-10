import type { ReactNode } from "react";
import { applyFilterPatch, defaultFilters, getState, previewFilters } from "../store";
import type { Filters } from "../types";

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** What clicking would change, given the current filters. */
export function statusToggle(keys: string[], mode: "set" | "toggle"): Partial<Filters> {
  const cur = getState().filters.statuses;
  if (mode === "set") return { statuses: sameSet(cur, keys) ? [] : keys };
  const next = cur.includes(keys[0]) ? cur.filter((k) => !keys.includes(k)) : [...cur, ...keys];
  return { statuses: next };
}

export function trustToggle(key: string): Partial<Filters> {
  const cur = getState().filters.trust;
  return { trust: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
}

export function clearAll(): Partial<Filters> {
  const d = defaultFilters();
  return { ...d, search: "" };
}

/** A button that previews a filter while pointed at, and applies it on click. */
export function FilterChip({
  patch,
  active,
  className = "",
  title,
  children,
}: {
  patch: () => Partial<Filters>;
  active: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`filter-chip ${active ? "on" : ""} ${className}`}
      title={title}
      aria-pressed={active}
      onPointerEnter={(e) => e.pointerType === "mouse" && previewFilters(patch())}
      onPointerLeave={() => previewFilters(null)}
      onClick={() => applyFilterPatch(patch())}
    >
      {children}
    </button>
  );
}
