// A group's icon, with a default picture when the group has none or its icon doesn't load
// (WebKitGTK shows a "?" box for broken images).
import { useState } from "react";
import { imgSrc } from "../backend";

/** Hue from the group's name, so the same group always gets the same colour. */
function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function GroupPic({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) return <img className={className} src={imgSrc(url)} alt="" loading="lazy" onError={() => setBroken(url)} />;
  const h = hue(name || "?");
  const letter = [...(name.trim() || "?")][0].toUpperCase();
  return (
    <span
      className={`gpic-default ${className ?? ""}`}
      aria-hidden
      style={{ background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 28%))` }}
    >
      {letter}
    </span>
  );
}
