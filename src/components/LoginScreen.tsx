import { enterDemo } from "../session";
import { backend } from "../backend";
import { setState, updateSettings, useApp } from "../store";

export function LoginScreen({ canLogin }: { canLogin: boolean }) {
  const busy = useApp((s) => s.loginBusy);
  const message = useApp((s) => s.loginMessage);
  const contact = useApp((s) => s.settings.contact);
  const hasCache = useApp((s) => Object.keys(s.cache.friends).length > 0);

  const start = async () => {
    setState({ loginBusy: true, loginMessage: "" });
    try {
      await backend.loginStart();
    } catch (e) {
      setState({ loginBusy: false, loginMessage: String(e) });
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" />
          <h1>VRC Friend Map</h1>
        </div>
        <p className="lead">See your VRChat friends as a map: who knows whom, who's online, and your own circles.</p>

        <ul className="login-points">
          <li>You sign in on VRChat's own website, inside this app. Any login method the site offers works, including 2FA.</li>
          <li>The app never sees your password. It keeps only the session cookie, stored on this device.</li>
          <li>It only reads data, spaces requests at least a second apart, and caches everything locally.</li>
        </ul>

        <label className="field">
          <span>Contact for VRChat (optional)</span>
          <input
            value={contact}
            placeholder="e.g. your Discord name or email"
            onChange={(e) => updateSettings({ contact: e.target.value })}
          />
          <small>VRChat asks third-party tools to include contact info in their requests, in case something goes wrong.</small>
        </label>

        {canLogin ? (
          <div className="login-actions">
            <button className="btn primary big" disabled={busy} onClick={start}>
              {busy ? "Waiting for VRChat login…" : "Log in with VRChat"}
            </button>
            {busy && (
              <button className="btn ghost" onClick={() => backend.loginCancel().then(() => setState({ loginBusy: false }))}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <p className="note">You're running the UI in a plain browser, so login isn't available. Start it with <code>npm run tauri dev</code> to log in.</p>
        )}
        {message && <p className="login-msg">{message}</p>}
        {busy && <p className="note">Finish signing in in the VRChat window. It closes by itself once you're in.</p>}

        <div className="login-footer">
          <button className="btn ghost" onClick={enterDemo}>
            Try it with demo data
          </button>
          {hasCache && <span className="note">Your last synced data is kept and will show again after login.</span>}
          <span className="note version">v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}
