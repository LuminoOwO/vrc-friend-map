import { t as tr } from "../i18n";
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
          <h1>{tr("login.vrcFriendMap")}</h1>
        </div>
        <p className="lead">{tr("login.seeYourVrchatFriendsAs")}</p>

        <ul className="login-points">
          <li>{tr("login.youSignInOnVrchat")}</li>
          <li>{tr("login.theAppNeverSeesYour")}</li>
          <li>{tr("login.itOnlyReadsDataSpaces")}</li>
        </ul>

        <label className="field">
          <span>{tr("login.contactForVrchatOptional")}</span>
          <input
            value={contact}
            placeholder={tr("login.eGYourDiscordName")}
            onChange={(e) => updateSettings({ contact: e.target.value })}
          />
          <small>{tr("login.vrchatAsksThirdPartyTools")}</small>
        </label>

        {canLogin ? (
          <div className="login-actions">
            <button className="btn primary big" disabled={busy} onClick={start}>
              {busy ? tr("login.waitingForVrchatLogin") : tr("login.logInWithVrchat")}
            </button>
            {busy && (
              <button className="btn ghost" onClick={() => backend.loginCancel().then(() => setState({ loginBusy: false }))}>
                {tr("login.cancel")}
              </button>
            )}
          </div>
        ) : (
          <p className="note">You're running the UI in a plain browser, so login isn't available. Start it with <code>{tr("login.npmRunTauriDev")}</code> {tr("login.toLogIn")}</p>
        )}
        {message && <p className="login-msg">{message}</p>}
        {busy && <p className="note">{tr("login.finishSigningInInThe")}</p>}

        <div className="login-footer">
          <button className="btn ghost" onClick={enterDemo}>
            {tr("login.tryItWithDemoData")}
          </button>
          {hasCache && <span className="note">{tr("login.yourLastSyncedDataIs")}</span>}
          <span className="note version">v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}
