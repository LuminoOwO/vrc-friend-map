// A slider. In the new interface it looks like VRChat's: a rounded bar that fills up, with the
// position in percent on the right. The classic interface keeps the plain browser slider.
import type { InputHTMLAttributes } from "react";
import { betaActive } from "../ui2/active";

export function Range({ pct = false, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { pct?: boolean }) {
  if (!betaActive()) return <input type="range" {...props} />;
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const v = Number(props.value ?? min);
  const p = max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 0;
  return (
    <span className={`ui2-range ${props.disabled ? "dim" : ""}`} style={{ ["--p" as string]: `${p}%` }}>
      <input type="range" {...props} />
      {pct && <output>{Math.round(p)}%</output>}
    </span>
  );
}
