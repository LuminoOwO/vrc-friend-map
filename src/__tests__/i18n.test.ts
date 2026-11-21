import { afterEach, describe, expect, it } from "vitest";
import { language, LANGUAGES, resolveLanguage, setLanguage, t } from "../i18n";

type Dict = { [k: string]: string | Dict };
const files = import.meta.glob<{ default: Dict }>("../i18n/locales/*.json", { eager: true });
const byCode = Object.fromEntries(Object.entries(files).map(([p, m]) => [p.match(/\/([A-Za-z-]+)\.json$/)![1], m.default]));

function flat(d: Dict, pre = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string") out[pre + k] = v;
    else Object.assign(out, flat(v, `${pre}${k}.`));
  }
  return out;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k: string) => k.replace(PLURAL, "");
const holes = (s: string) => [...s.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]).sort();

afterEach(async () => {
  await setLanguage("en");
});

describe("translations", () => {
  it("looks up nested texts, falls back to the key when missing", () => {
    expect(t("menu.people")).toBe("People");
    expect(t("no.such.text")).toBe("no.such.text");
  });
  it("plurals and inserted values", async () => {
    expect(t("common.friends", { count: 1 })).toBe("1 friend");
    expect(t("common.friends", { count: 3 })).toBe("3 friends");
    expect(t("language.system", { name: "Deutsch" })).toBe("Like the system (Deutsch)");
    await setLanguage("de");
    expect(language()).toBe("de");
    expect(t("menu.people")).toBe("Leute");
    expect(t("common.friends", { count: 1 })).toBe("1 Freund");
    // Numbers in the language's own format.
    expect(t("common.friends", { count: 1500 })).toBe("1.500 Freunde");
  });
  it("picks the language from the setting or the system", () => {
    expect(resolveLanguage("de", [])).toBe("de");
    expect(resolveLanguage("system", ["de-AT", "en-US"])).toBe("de");
    expect(resolveLanguage("system", ["xx", "en"])).toBe("en");
    expect(resolveLanguage("system", ["xx"])).toBe("en");
    expect(resolveLanguage("zz", [])).toBe("en");
    expect(LANGUAGES[0]).toBe("en");
    expect(LANGUAGES).toContain("de");
  });
  it("every language file fits the English one (no unknown texts, same {{values}})", () => {
    const en = flat(byCode.en);
    const enBases = new Set(Object.keys(en).map(base));
    for (const [code, d] of Object.entries(byCode)) {
      if (code === "en") continue;
      for (const [k, v] of Object.entries(flat(d))) {
        expect(enBases.has(base(k)), `${code}: "${k}" isn't in en.json`).toBe(true);
        const ref = en[k] ?? en[`${base(k)}_other`] ?? en[base(k)];
        expect(holes(v), `${code}: "${k}" has other {{values}} than English`).toEqual(holes(ref));
        expect(v.trim().length, `${code}: "${k}" is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("every text the code asks for exists", () => {
  it("t(\"…\") / tr(\"…\") keys are all in en.json", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const en = flat(byCode.en);
    const has = (k: string) => k in en || `${k}_other` in en || `${k}_one` in en;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(path.resolve(__dirname, ".."));
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(?:t|tr|tx)\(\s*"([a-zA-Z][\w]*(?:\.[\w]+)+)"/g)) if (!has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});
