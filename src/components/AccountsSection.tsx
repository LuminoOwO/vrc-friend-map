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
        Log in with your other VRChat accounts too: their friends join the map, cards and search, each with a small mark for which of your accounts knows
        them, and friends of more than one of your accounts stand out. Logins stay on this device.
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
              <span>Live updates (its own connection to VRChat; off: its friends' status refreshes with each sync)</span>
            </label>
            <label className="check">
              <input id={`acc-notify-${acc.id}`} type="checkbox" checked={acc.notify} disabled={!acc.show || !acc.live} onChange={(e) => setAccount(acc.id, { notify: e.target.checked })} />
              <span>Notifications for its friends (your usual rules; needs live updates)</span>
            </label>
            {confirm === acc.id ? (
              <div className="row">
                <span className="small">Remove {acc.name} from this device?</span>
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
          Act as any of my accounts: on a profile, pick which account sends a friend request, unfriends, blocks or mutes. Off: those always use your main
          account.
        </span>
      </label>
    </>
  );
}
