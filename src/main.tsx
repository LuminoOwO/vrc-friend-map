import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as store from "./store";
import "./styles.css";
import { applySafeArea } from "./safearea";
import { unlockAudioOnInput } from "./notify";
import { loadCustomSounds } from "./notifications";
import { startTray } from "./tray";

applySafeArea();
unlockAudioOnInput();
void loadCustomSounds();
startTray();

// Dev server only: lets UI test scripts set up state (stripped from builds).
if (import.meta.env.DEV) {
  (window as unknown as { __vfm: typeof store }).__vfm = store;
  const perf = new URLSearchParams(location.search).get("perf");
  if (perf) import("./perf").then((m) => m.runPerf(perf));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
