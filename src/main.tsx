import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as store from "./store";
import "./styles.css";

// Dev server only: lets UI test scripts set up state (stripped from builds).
if (import.meta.env.DEV) (window as unknown as { __vfm: typeof store }).__vfm = store;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
