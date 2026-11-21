# Translating VRC Friend Map

All of the app's text lives in `src/i18n/locales/`, one file per language:
`en.json` (English, the base), `de.json`, … A text missing in a language shows in English, so a
language can be added bit by bit.

The files use the **i18next JSON** format (Weblate: "i18next JSON file v4"; Crowdin: "i18next
JSON"), so a translation service can read and write them directly.

## The format

```json
{
  "menu": { "people": "People" },
  "common": {
    "friends_one": "{{count}} friend",
    "friends_other": "{{count}} friends"
  }
}
```

- **Keys** are nested: `menu.people`. Translate the values only, never the keys.
- **`{{name}}`** is filled in by the app (a name, a number…). Keep every `{{…}}` exactly as it is;
  you may move it around in the sentence.
- **Plurals:** `_one`, `_other`, and where your language has them `_zero`, `_two`, `_few`,
  `_many` (the forms of [Unicode's plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
  Add the forms your language needs; the app picks the right one by itself.
- Numbers are written the way your language writes them (1,500 / 1.500) automatically.

## Adding a language

1. Copy `en.json` to `<code>.json` (`fr.json`, `pt-BR.json`, …) and translate it. It shows up
   in Settings → Appearance → Language on its own.
2. Machine-made translations are listed in `MACHINE_TRANSLATED` in `src/i18n/index.ts`; the app
   then says it still needs a check. Take the code out of that list once someone who speaks the
   language has gone through it.
3. `npx vitest run src/__tests__/i18n.test.ts` checks that every text has the same `{{…}}` as
   the English one and that there are no keys English doesn't have.

## For developers

```tsx
import { useT } from "../i18n";

function Thing({ n }: { n: number }) {
  const t = useT(); // re-renders when the language changes
  return <span>{t("common.friends", { count: n })}</span>;
}
```

Outside components, `t()` from `src/i18n` gives the text in the current language at the time it
runs. New text goes into `en.json` first; other languages fall back to it until translated.
