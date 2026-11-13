import { useEffect, useState } from "react";
import { updateSettings, useApp } from "../store";
import { wheelFixSet, wheelFixState, type WheelFixState } from "../wheelfix";

/** Settings → Mouse wheel (Linux): the X11 wheel fallback. */
export function WheelFixSection() {
  const on = useApp((s) => s.settings.wheelFix);
  const [st, setSt] = useState<WheelFixState | null>(null);
  useEffect(() => {
    void wheelFixState().then(setSt);
  }, []);
  return (
    <>
      <h3>Mouse wheel</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={on || !!st?.forced}
          disabled={!!st?.forced}
          onChange={async (e) => {
            updateSettings({ wheelFix: e.target.checked });
            setSt(await wheelFixSet(e.target.checked));
          }}
        />
        Fix the mouse wheel (if scrolling and zooming do nothing)
      </label>
      <p className="small muted">
        On some X11 systems (seen with XLibre) the web view never gets the wheel. This reads the wheel from the X server instead, only when
        the web view got nothing, so nothing scrolls twice. Also on with the start option <code>--wheel-fix</code>.
        {st?.forced && " On now because the app was started with --wheel-fix."}
        {st && st.enabled && !st.running && " It couldn't start here (no X11 display); see the terminal output."}
      </p>
    </>
  );
}
