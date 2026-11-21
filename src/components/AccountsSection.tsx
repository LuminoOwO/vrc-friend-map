// Settings → Account & data → Your other accounts (src/accounts.ts).
import { t as tr } from "../i18n";
import { useEffect, useState } from "react";
import { accountLive, addAccount, onAccountLive, removeAccount, setAccount } from "../accounts";
import { isMobile } from "../backend";
import { updateSettings, useApp } from "../store";

export function AccountsSection() {
  const a = useApp((s) => s.settings.accounts);
  const alts = useApp((s) => s.cache.alts);
  const [, tick] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => onAccountLive(() => tick((n) => n + 1)), []);
  return (
    <>
      <h3>{tr("accounts.yourOtherAccounts")}</h3>
      <p className="small muted">
        {tr("accounts.logInWithYourOther")}
      </p>
      {a.list.map((acc) => {
        const live = accountLive(acc.id);
        const n = Object.keys(alts?.[acc.id]?.friends ?? {}).length;
        return (
          <div key={acc.id} className="account-row">
            <div className="row">
              <b>{acc.name || acc.id}</b>
              <span className="small muted">{n ? tr("accounts.nFriends", { n }) : tr("accounts.notLoadedYet")}</span>
              {acc.live && acc.show && <span className={`chip ${live?.connected ? "ok" : ""}`}>{live?.connected ? "live" : live?.message || "connecting…"}</span>}
            </div>
            <label className="check">
              <input id={`acc-show-${acc.id}`} type="checkbox" checked={acc.show} onChange={(e) => setAccount(acc.id, { show: e.target.checked })} />
              <span>{tr("accounts.showItsFriendsOnThe")}</span>
            </label>
            <label className="check">
              <input id={`acc-live-${acc.id}`} type="checkbox" checked={acc.live} disabled={!acc.show} onChange={(e) => setAccount(acc.id, { live: e.target.checked })} />
              <span>{tr("accounts.liveUpdatesItsOwnConnection")}</span>
            </label>
            <label className="check">
              <input id={`acc-notify-${acc.id}`} type="checkbox" checked={acc.notify} disabled={!acc.show || !acc.live} onChange={(e) => setAccount(acc.id, { notify: e.target.checked })} />
              <span>{tr("accounts.notificationsForItsFriendsYour")}</span>
            </label>
            {confirm === acc.id ? (
              <div className="row">
                <span className="small">{tr("accounts.removeNameFromThisDevice", { name: acc.name })}</span>
                <button
                  className="btn small danger"
                  onClick={() => {
                    setConfirm(null);
                    void removeAccount(acc.id);
                  }}
                >
                  {tr("accounts.remove")}
                </button>
                <button className="btn small ghost" onClick={() => setConfirm(null)}>
                  {tr("accounts.keep")}
                </button>
              </div>
            ) : (
              <button className="btn small ghost" onClick={() => setConfirm(acc.id)}>
                {tr("accounts.removeFromThisDevice")}
              </button>
            )}
          </div>
        );
      })}
      {isMobile ? (
        <p className="small muted">{tr("accounts.addingAnotherAccountWorksIn")}</p>
      ) : (
        <button className="btn small" onClick={() => void addAccount()}>
          {tr("accounts.addAnotherAccount")}
        </button>
      )}
      <label className="check">
        <input id="acc-actas" type="checkbox" checked={a.actAs} onChange={(e) => updateSettings({ accounts: { ...a, actAs: e.target.checked } })} />
        <span>
          {tr("accounts.actAsAnyOfMy")}
        </span>
      </label>
    </>
  );
}
