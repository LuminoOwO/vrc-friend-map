// Translations. All of the app's text lives in src/i18n/locales/<language>.json (English is the
// base; a missing text falls back to English), in the i18next JSON format, so Weblate and Crowdin
// can read and write the files directly:
//   - nested keys: { "menu": { "people": "People" } } → t("menu.people")
//   - values put in with {{name}}: t("people.count", { count: 3 }) → "{{count}} friends"
//   - plurals by each language's own rules: key_one, key_other (and key_few, key_many, key_two,
//     key_zero where the language has them), picked with Intl.PluralRules from `count`.
// docs/translating.md says how to add or fix a language.
import { useSyncExternalStore } from "react";
import en from "./locales/en.json";

type Dict = { [k: string]: string | Dict };
type Vars = Record<string, string | number>;

// Every language file, loaded only when picked (English is always there).
const loaders = import.meta.glob<{ default: Dict }>("./locales/*.json");
const codeOf = (path: string) => path.match(/\/([A-Za-z-]+)\.json$/)?.[1] ?? "";

/** Languages with a file, by code ("de", "pt-BR"), English first. */
export const LANGUAGES: string[] = ["en", ...Object.keys(loaders).map(codeOf).filter((c) => c && c !== "en").sort()];

/** Languages whose text was machine-made and still needs a check by someone who speaks it. */
export const MACHINE_TRANSLATED = new Set<string>(["de"]);

let lang = "en";
let dict: Dict = en as Dict;
let version = 0;
const subs = new Set<() => void>();

function lookup(d: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = d;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralOf(code: string, n: number): string {
  let r = pluralRules.get(code);
  if (!r) {
    try {
      r = new Intl.PluralRules(code);
    } catch {
      r = new Intl.PluralRules("en");
    }
    pluralRules.set(code, r);
  }
  return r.select(n);
}

/** The text for `key` in a given dictionary, with the plural form for `count` if there is one. */
function find(d: Dict, code: string, key: string, vars?: Vars): string | undefined {
  const count = vars?.count;
  if (typeof count === "number") {
    const form = lookup(d, `${key}_${pluralOf(code, count)}`) ?? lookup(d, `${key}_other`);
    if (form !== undefined) return form;
  }
  return lookup(d, key);
}

function fill(text: string, code: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (all, name: string) => {
    const v = vars[name];
    if (v === undefined) return all;
    return typeof v === "number" ? v.toLocaleString(code) : v;
  });
}

/** The text for `key` in the current language (English if it has none; the key itself if
 *  English has none either, so a missing text shows up instead of an empty space). */
export function t(key: string, vars?: Vars): string {
  const own = find(dict, lang, key, vars);
  if (own !== undefined) return fill(own, lang, vars);
  const base = find(en as Dict, "en", key, vars);
  return fill(base ?? key, "en", vars);
}

/** The current language's code. */
export function language(): string {
  return lang;
}

/** The best language for a setting: "system" follows the device's languages, else the code
 *  itself; a regional code falls back to its base ("de-AT" → "de"), then English. */
export function resolveLanguage(setting: string | undefined, preferred: readonly string[] = typeof navigator !== "undefined" ? navigator.languages : []): string {
  const wanted = !setting || setting === "system" ? preferred : [setting];
  for (const w of wanted) {
    if (LANGUAGES.includes(w)) return w;
    const base = w.split("-")[0];
    if (LANGUAGES.includes(base)) return base;
  }
  return "en";
}

/** Switch to a language ("system" or a code). Loads its file the first time. */
export async function setLanguage(setting: string | undefined): Promise<void> {
  const code = resolveLanguage(setting);
  if (code === lang) return;
  let next: Dict = en as Dict;
  if (code !== "en") {
    const load = Object.entries(loaders).find(([p]) => codeOf(p) === code)?.[1];
    if (load) next = (await load()).default;
  }
  lang = code;
  dict = next;
  version++;
  if (typeof document !== "undefined") document.documentElement.lang = code;
  subs.forEach((f) => f());
}

/** The language's own name ("Deutsch"), for the picker. */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

/** For components: re-renders when the language changes; returns `t`. */
export function useT(): typeof t {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
    () => version,
  );
  return t;
}
