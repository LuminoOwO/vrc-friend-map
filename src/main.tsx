import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as store from "./store";
import "./styles.css";
import { applySafeArea } from "./safearea";
import { startAppVisibility } from "./appvisible";
import { unlockAudioOnInput } from "./notify";
import { loadCustomSounds } from "./notifications";
import { startTray } from "./tray";
import { startWheelFix, wheelFixHere } from "./wheelfix";
import { startKeys } from "./keys";
import { startUpdateChecks } from "./updates";
import { installHaptics } from "./haptics";
import { installLinkPaste } from "./vrclinks";
import { startPhone } from "./phone";
import { watchImageLoads } from "./ui2/smooth";

applySafeArea();
startAppVisibility();
// Linux desktop app: dropdown lists inside the page, not in X11 popup windows (styles.css).
if (wheelFixHere) document.documentElement.classList.add("in-page-select");
unlockAudioOnInput();
void loadCustomSounds();
startTray();
startWheelFix();
startKeys();
startUpdateChecks();
installHaptics();
installLinkPaste();
startPhone();
watchImageLoads();

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
