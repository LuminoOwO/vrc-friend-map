// Edit your own VRChat profile: status, status text, pronouns, bio, links,
// languages, and the profile's look (theme, background, banner color) as far
// as VRChat's API allows. Reads GET /profile/{me}?asSelf=true; saves only what
// changed (PUT /users/{me} and PUT /profile/{me}).
import { t as tr, lazy } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { backend } from "../backend";
import { LANGUAGES } from "../model";
import { showToast, useApp } from "../store";
import { fetchProfile } from "../sync";
import { Icon } from "./Icon";

const STATUSES = lazy(() => [
  { value: "join me", label: tr("profileEditor.joinMe") },
  { value: "active", label: tr("profileEditor.online") },
  { value: "ask me", label: tr("profileEditor.askMe") },
  { value: "busy", label: tr("profileEditor.doNotDisturb") },
]);

interface Theme {
  id: string;
  name: string;
  buttonColor?: string;
  iconColor?: string;
  subtextColor?: string;
}

interface Form {
  status: string;
  statusDescription: string;
  pronouns: string;
  bio: string;
  bioLinks: string[];
  languages: string[];
  themeId: string;
  backgroundType: string;
  backgroundGradientTop: string;
  backgroundGradientBottom: string;
  bannerType: string;
  bannerColor: string;
}

const hex = (c: string | undefined) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : "#000000");
const unhex = (c: string) => c.replace(/^#/, "").toLowerCase();

export function ProfileEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const demo = useApp((s) => s.demo);
  const [loaded, setLoaded] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [langPrefix, setLangPrefix] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (demo) {
        setError("Editing works with your own account (not in demo mode).");
        return;
      }
      const r = await backend.vrcGet(`/profile/${encodeURIComponent(id)}`, { asSelf: true });
      if (stop) return;
      if (r.status !== 200 || !r.data) {
        setError(`Couldn't load your profile (${r.status}).`);
        return;
      }
      const d = r.data;
      const langs: string[] = Array.isArray(d.languages) ? d.languages : [];
      setLangPrefix(langs.some((l) => l.startsWith("language_")) ? "language_" : "");
      const f: Form = {
        status: d.status ?? "active",
        statusDescription: d.statusDescription ?? "",
        pronouns: d.pronouns ?? "",
        bio: d.bio ?? "",
        bioLinks: Array.isArray(d.bioLinks) ? d.bioLinks.slice(0, 3) : [],
        languages: langs.map((l) => l.replace(/^language_/, "")).slice(0, 3),
        themeId: d.themeId ?? "default",
        backgroundType: d.backgroundType ?? "default",
        backgroundGradientTop: d.backgroundGradientTop ?? "",
        backgroundGradientBottom: d.backgroundGradientBottom ?? "",
        bannerType: d.bannerType ?? "avatarBanner",
        bannerColor: d.bannerColor ?? "",
      };
      setThemes(Array.isArray(d.themes) ? d.themes.filter((t: Theme) => t && typeof t.id === "string") : []);
      setLoaded(f);
      setForm(f);
    })().catch((e) => setError(String(e)));
    return () => {
      stop = true;
    };
  }, [id, demo]);

  const changes = useMemo(() => {
    if (!form || !loaded) return { user: {}, profile: {} };
    const user: Record<string, unknown> = {};
    const profile: Record<string, unknown> = {};
    for (const k of ["status", "statusDescription", "pronouns"] as const) if (form[k] !== loaded[k]) user[k] = form[k];
    if (form.bio !== loaded.bio) profile.bio = form.bio;
    const links = form.bioLinks.map((l) => l.trim()).filter(Boolean);
    if (JSON.stringify(links) !== JSON.stringify(loaded.bioLinks)) profile.bioLinks = links;
    if (JSON.stringify(form.languages) !== JSON.stringify(loaded.languages)) profile.languages = form.languages.map((l) => langPrefix + l);
    for (const k of ["themeId", "backgroundType", "backgroundGradientTop", "backgroundGradientBottom", "bannerType", "bannerColor"] as const)
      if (form[k] !== loaded[k]) profile[k] = form[k];
    return { user, profile };
  }, [form, loaded, langPrefix]);
  const dirty = Object.keys(changes.user).length + Object.keys(changes.profile).length > 0;

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await backend.updateProfile(id, changes.user, changes.profile);
      const bad = res.find((r) => r.status < 200 || r.status >= 300);
      if (bad) {
        const msg = typeof bad.data === "object" && bad.data ? (bad.data.error?.message ?? bad.data.message) : "";
        setError(`VRChat said no (${bad.status})${msg ? `: ${msg}` : ""}`);
      } else {
        showToast(tr("profileEditor.profileSaved"));
        await fetchProfile(id).catch(() => {});
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal profile-editor" role="dialog" aria-label={tr("profileEditor.editYourProfile")}>
        <div className="modal-head">
          <h2>
            <Icon name="user" /> {tr("profileEditor.editYourProfile")}
          </h2>
          <button className="icon-btn" onClick={onClose} title={tr("profileEditor.close")}>
            <Icon name="close" />
          </button>
        </div>
        {!form ? (
          <p className={error ? "error-text" : "muted"}>{error || "Loading…"}</p>
        ) : (
          <div className="pe-body">
            <div className="row">
              <label className="field narrow">
                <span>{tr("profileEditor.status")}</span>
                <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status text ({form.statusDescription.length}/32)</span>
                <input value={form.statusDescription} maxLength={32} onChange={(e) => set({ statusDescription: e.target.value })} />
              </label>
              <label className="field narrow">
                <span>{tr("profileEditor.pronouns")}</span>
                <input value={form.pronouns} maxLength={32} onChange={(e) => set({ pronouns: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>About me ({form.bio.length}/512)</span>
              <textarea rows={6} value={form.bio} maxLength={512} onChange={(e) => set({ bio: e.target.value })} />
            </label>
            <div className="field">
              <span>{tr("profileEditor.linksUpTo3")}</span>
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  value={form.bioLinks[i] ?? ""}
                  placeholder={tr("profileEditor.https")}
                  onChange={(e) => {
                    const l = [...form.bioLinks];
                    l[i] = e.target.value;
                    set({ bioLinks: l });
                  }}
                />
              ))}
            </div>
            <div className="field">
              <span>{tr("profileEditor.languagesUpTo3")}</span>
              <div className="row">
                {[0, 1, 2].map((i) => (
                  <select
                    key={i}
                    value={form.languages[i] ?? ""}
                    onChange={(e) => {
                      const l = [...form.languages];
                      if (e.target.value) l[i] = e.target.value;
                      else l.splice(i, 1);
                      set({ languages: [...new Set(l.filter(Boolean))] });
                    }}
                  >
                    <option value="">—</option>
                    {Object.entries(LANGUAGES)
                      .sort((a, b) => a[1].localeCompare(b[1]))
                      .map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                  </select>
                ))}
              </div>
            </div>
            <h4 className="sub-h">{tr("profileEditor.look")}</h4>
            <div className="row">
              <label className="field narrow">
                <span>{tr("profileEditor.theme")}</span>
                <select value={form.themeId} onChange={(e) => set({ themeId: e.target.value })}>
                  <option value="default">{tr("profileEditor.default")}</option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {themes.find((t) => t.id === form.themeId) && (
                <span className="pe-theme-dots">
                  {(["buttonColor", "iconColor", "subtextColor"] as const).map((k) => (
                    <span key={k} style={{ background: hex(themes.find((t) => t.id === form.themeId)?.[k]) }} />
                  ))}
                </span>
              )}
            </div>
            <div className="row">
              <label className="field narrow">
                <span>{tr("profileEditor.background")}</span>
                <select value={form.backgroundType} onChange={(e) => set({ backgroundType: e.target.value })}>
                  <option value="default">{tr("profileEditor.default")}</option>
                  <option value="gradient">{tr("profileEditor.gradient")}</option>
                  {!["default", "gradient"].includes(form.backgroundType) && <option value={form.backgroundType}>Keep current ({form.backgroundType})</option>}
                </select>
              </label>
              {form.backgroundType === "gradient" && (
                <>
                  <label className="field narrow">
                    <span>{tr("profileEditor.top")}</span>
                    <input type="color" value={hex(form.backgroundGradientTop)} onChange={(e) => set({ backgroundGradientTop: unhex(e.target.value) })} />
                  </label>
                  <label className="field narrow">
                    <span>{tr("profileEditor.bottom")}</span>
                    <input type="color" value={hex(form.backgroundGradientBottom)} onChange={(e) => set({ backgroundGradientBottom: unhex(e.target.value) })} />
                  </label>
                </>
              )}
            </div>
            <div className="row">
              <label className="field narrow">
                <span>{tr("profileEditor.banner")}</span>
                <select value={form.bannerType} onChange={(e) => set({ bannerType: e.target.value })}>
                  <option value="avatarBanner">{tr("profileEditor.yourAvatar")}</option>
                  <option value="color">{tr("profileEditor.aColor")}</option>
                  {form.bannerType === "customImage" && <option value="customImage">{tr("profileEditor.yourCustomPicture")}</option>}
                </select>
              </label>
              {form.bannerType === "color" && (
                <label className="field narrow">
                  <span>{tr("profileEditor.color")}</span>
                  <input type="color" value={hex(form.bannerColor)} onChange={(e) => set({ bannerColor: unhex(e.target.value) })} />
                </label>
              )}
            </div>
            <p className="small muted">{tr("profileEditor.someLooksNeedVrcVrchat")}</p>
            {error && <p className="error-text">{error}</p>}
            <div className="row end">
              <button className="btn" onClick={onClose} disabled={busy}>
                {tr("profileEditor.cancel")}
              </button>
              <button className="btn primary" disabled={!dirty || busy} onClick={save}>
                {busy ? tr("profileEditor.saving") : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
