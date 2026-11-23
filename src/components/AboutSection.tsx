// Settings → About: version, where the code lives, how to report a problem or help translate.
import { t as tr, useT } from "../i18n";
import { backend, isMobile, isTauri } from "../backend";
import { showToast } from "../store";
import { AppLogo } from "../ui2/AppLogo";
import { Icon } from "./Icon";

const REPO = "https://github.com/LuminoOwO/vrc-friend-map";

function engine(): string {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return "Android WebView";
  if (/iPhone|iPad/.test(ua)) return "WKWebView";
  if (/Edg\//.test(ua)) return "WebView2 (Edge)";
  if (/Chrome\/(\d+)/.test(ua)) return `Chromium ${ua.match(/Chrome\/(\d+)/)![1]}`;
  if (/AppleWebKit/.test(ua) && /Linux/.test(ua)) return "WebKitGTK";
  if (/AppleWebKit/.test(ua)) return "WebKit";
  return "?";
}

export function AboutSection() {
  const t = useT();
  const open = (url: string) => void backend.openUrl(url).catch(() => window.open(url, "_blank", "noopener"));
  const links: [string, string, string][] = [
    ["link", t("about.source"), REPO],
    ["download", t("about.releases"), `${REPO}/releases`],
    ["bulb", t("about.changelog"), `${REPO}/blob/main/CHANGELOG.md`],
    ["warn", t("about.report"), `${REPO}/issues/new`],
    ["share", t("about.translate"), `${REPO}/blob/main/docs/translating.md`],
  ];
  const version = `VRC Friend Map ${__APP_VERSION__} (build ${__APP_BUILD__}) · ${engine()}${isTauri ? "" : " · browser"}${isMobile ? " · phone" : ""}`;
  return (
    <div className="about">
      <div className="about-head">
        <AppLogo size={56} />
        <div>
          <b className="about-name">VRC Friend Map</b>
          <span className="small muted">
            {t("about.version", { version: __APP_VERSION__, build: __APP_BUILD__ })} · {engine()}
          </span>
        </div>
        <button
          className="btn small ghost"
          title={t("about.copyTitle")}
          onClick={() => {
            void navigator.clipboard?.writeText(version).then(() => showToast(tr("about.copied")), () => showToast(version));
          }}
        >
          <Icon name="copy" size={14} /> {t("about.copy")}
        </button>
      </div>
      <p className="small">{t("about.what")}</p>
      <div className="about-links">
        {links.map(([icon, label, url]) => (
          <button key={url} className="about-link" onClick={() => open(url)}>
            <Icon name={icon} size={16} />
            <span>{label}</span>
            <Icon name="external" size={13} />
          </button>
        ))}
      </div>
      <p className="small muted">{t("about.privacy")}</p>
      <p className="small muted">{t("about.license")}</p>
    </div>
  );
}
