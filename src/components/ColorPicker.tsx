import { useEffect, useRef } from "react";
import { CIRCLE_PALETTE, colorUsage, pickCircleColor } from "../colors";

/** Popover with the circle palette. Colors other circles already use are
 *  marked, and "Pick unused" chooses the next free color. */
export function ColorPicker({
  value,
  others,
  onPick,
  onClose,
}: {
  value: string;
  /** Colors of the other circles. */
  others: string[];
  onPick: (color: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const usage = colorUsage(others);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div className="color-pop" ref={ref} role="dialog" aria-label="Circle color">
      <div className="color-grid">
        {CIRCLE_PALETTE.map((c) => {
          const used = usage.get(c) ?? 0;
          return (
            <button
              key={c}
              className={`color-cell ${c === value.toLowerCase() ? "current" : ""} ${used ? "used" : ""}`}
              style={{ background: c }}
              title={used ? `${c} · used by ${used} other circle${used === 1 ? "" : "s"}` : c}
              onClick={() => {
                onPick(c);
                onClose();
              }}
            />
          );
        })}
      </div>
      <div className="color-actions">
        <button
          className="btn small"
          onClick={() => {
            onPick(pickCircleColor(others));
            onClose();
          }}
        >
          Pick unused
        </button>
        <label className="btn small custom-color" title="Any color">
          Custom…
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#2dd4bf"} onChange={(e) => onPick(e.target.value)} />
        </label>
      </div>
      <p className="muted tiny-text">Dotted = another circle uses it.</p>
    </div>
  );
}
