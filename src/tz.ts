// Friends' local time. A time zone is either verified (you set it, or the
// friend shares theirs through the app) or a suggestion worked out from:
// - what they wrote: bio, status, pronouns, linked pages (X / Instagram /
//   Bluesky bios, "Location:" fields), e.g. "german fur", 🇩🇪, "UTC+9",
//   "EST", "Berlin", "Europe/Berlin";
// - VRChat's languages field;
// - the groups they're in ("Germany VRC", "Japan Club");
// - their usual online hours (weak: people tend to be online in the evening).
// Suggestions are ranked candidates with reasons; when hints disagree (groups
// "America" and "Japan") you see several and pick. Nothing here is shared.

export interface TzCandidate {
  tz: string;
  label: string;
  score: number;
  reasons: string[];
}

interface Country {
  iso: string;
  name: string;
  /** Lowercase words that point here (names, adjectives, own-language names). */
  words: string[];
  /** Time zones, most people first. */
  zones: string[];
  /** VRChat language codes spoken mostly here (not English/Spanish etc.). */
  langs?: string[];
}

const COUNTRIES: Country[] = [
  { iso: "DE", name: "Germany", words: ["germany", "german", "deutschland", "deutsch", "deutsche", "germ"], zones: ["Europe/Berlin"], langs: ["deu", "de", "ger"] },
  { iso: "AT", name: "Austria", words: ["austria", "austrian", "österreich", "osterreich"], zones: ["Europe/Vienna"] },
  { iso: "CH", name: "Switzerland", words: ["switzerland", "swiss", "schweiz", "suisse"], zones: ["Europe/Zurich"] },
  { iso: "NL", name: "Netherlands", words: ["netherlands", "dutch", "holland", "nederland", "nederlands"], zones: ["Europe/Amsterdam"], langs: ["nld", "nl", "dut"] },
  { iso: "BE", name: "Belgium", words: ["belgium", "belgian", "belgië", "belgique"], zones: ["Europe/Brussels"] },
  { iso: "FR", name: "France", words: ["france", "french", "français", "francais", "française"], zones: ["Europe/Paris"], langs: ["fra", "fr", "fre"] },
  { iso: "GB", name: "United Kingdom", words: ["uk", "united kingdom", "britain", "british", "england", "english", "scotland", "scottish", "wales", "welsh", "brit"], zones: ["Europe/London"] },
  { iso: "IE", name: "Ireland", words: ["ireland", "irish", "éire"], zones: ["Europe/Dublin"] },
  { iso: "ES", name: "Spain", words: ["spain", "spanish", "españa", "espana", "español"], zones: ["Europe/Madrid"] },
  { iso: "PT", name: "Portugal", words: ["portugal", "portuguese", "português"], zones: ["Europe/Lisbon"] },
  { iso: "IT", name: "Italy", words: ["italy", "italian", "italia", "italiano", "italiana"], zones: ["Europe/Rome"], langs: ["ita", "it"] },
  { iso: "PL", name: "Poland", words: ["poland", "polish", "polska", "polski"], zones: ["Europe/Warsaw"], langs: ["pol", "pl"] },
  { iso: "CZ", name: "Czechia", words: ["czech", "czechia", "česko", "cesko"], zones: ["Europe/Prague"], langs: ["ces", "cze", "cs"] },
  { iso: "SK", name: "Slovakia", words: ["slovakia", "slovak", "slovensko"], zones: ["Europe/Bratislava"], langs: ["slk", "slo", "sk"] },
  { iso: "HU", name: "Hungary", words: ["hungary", "hungarian", "magyar"], zones: ["Europe/Budapest"], langs: ["hun", "hu"] },
  { iso: "DK", name: "Denmark", words: ["denmark", "danish", "danmark", "dansk"], zones: ["Europe/Copenhagen"], langs: ["dan", "da"] },
  { iso: "SE", name: "Sweden", words: ["sweden", "swedish", "sverige", "svensk"], zones: ["Europe/Stockholm"], langs: ["swe", "sv"] },
  { iso: "NO", name: "Norway", words: ["norway", "norwegian", "norge", "norsk"], zones: ["Europe/Oslo"], langs: ["nor", "nob", "no"] },
  { iso: "FI", name: "Finland", words: ["finland", "finnish", "suomi"], zones: ["Europe/Helsinki"], langs: ["fin", "fi"] },
  { iso: "EE", name: "Estonia", words: ["estonia", "estonian", "eesti"], zones: ["Europe/Tallinn"], langs: ["est", "et"] },
  { iso: "LV", name: "Latvia", words: ["latvia", "latvian", "latvija"], zones: ["Europe/Riga"], langs: ["lav", "lv"] },
  { iso: "LT", name: "Lithuania", words: ["lithuania", "lithuanian", "lietuva"], zones: ["Europe/Vilnius"], langs: ["lit", "lt"] },
  { iso: "GR", name: "Greece", words: ["greece", "greek", "ελλάδα", "hellas"], zones: ["Europe/Athens"], langs: ["ell", "gre", "el"] },
  { iso: "RO", name: "Romania", words: ["romania", "romanian", "românia"], zones: ["Europe/Bucharest"], langs: ["ron", "rum", "ro"] },
  { iso: "BG", name: "Bulgaria", words: ["bulgaria", "bulgarian"], zones: ["Europe/Sofia"], langs: ["bul", "bg"] },
  { iso: "HR", name: "Croatia", words: ["croatia", "croatian", "hrvatska"], zones: ["Europe/Zagreb"], langs: ["hrv", "hr"] },
  { iso: "RS", name: "Serbia", words: ["serbia", "serbian", "srbija"], zones: ["Europe/Belgrade"], langs: ["srp", "sr"] },
  { iso: "SI", name: "Slovenia", words: ["slovenia", "slovenian", "slovenija"], zones: ["Europe/Ljubljana"], langs: ["slv", "sl"] },
  { iso: "UA", name: "Ukraine", words: ["ukraine", "ukrainian", "україна", "ukraina"], zones: ["Europe/Kyiv"], langs: ["ukr", "uk"] },
  { iso: "RU", name: "Russia", words: ["russia", "russian", "россия", "rossiya"], zones: ["Europe/Moscow", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok"], langs: ["rus", "ru"] },
  { iso: "TR", name: "Türkiye", words: ["turkey", "turkish", "türkiye", "turkiye", "türk"], zones: ["Europe/Istanbul"], langs: ["tur", "tr"] },
  { iso: "IL", name: "Israel", words: ["israel", "israeli"], zones: ["Asia/Jerusalem"], langs: ["heb", "he"] },
  { iso: "SA", name: "Saudi Arabia", words: ["saudi", "ksa"], zones: ["Asia/Riyadh"] },
  { iso: "AE", name: "UAE", words: ["uae", "emirates", "dubai", "emirati"], zones: ["Asia/Dubai"] },
  { iso: "EG", name: "Egypt", words: ["egypt", "egyptian"], zones: ["Africa/Cairo"] },
  { iso: "ZA", name: "South Africa", words: ["south africa", "south african"], zones: ["Africa/Johannesburg"], langs: ["afr", "af"] },
  { iso: "IN", name: "India", words: ["india", "indian", "desi"], zones: ["Asia/Kolkata"], langs: ["hin", "hi"] },
  { iso: "PK", name: "Pakistan", words: ["pakistan", "pakistani"], zones: ["Asia/Karachi"], langs: ["urd", "ur"] },
  { iso: "TH", name: "Thailand", words: ["thailand", "thai"], zones: ["Asia/Bangkok"], langs: ["tha", "th"] },
  { iso: "VN", name: "Vietnam", words: ["vietnam", "vietnamese", "việt nam"], zones: ["Asia/Ho_Chi_Minh"], langs: ["vie", "vi"] },
  { iso: "MY", name: "Malaysia", words: ["malaysia", "malaysian"], zones: ["Asia/Kuala_Lumpur"], langs: ["msa", "may", "ms"] },
  { iso: "SG", name: "Singapore", words: ["singapore", "singaporean"], zones: ["Asia/Singapore"] },
  { iso: "ID", name: "Indonesia", words: ["indonesia", "indonesian"], zones: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"], langs: ["ind", "id"] },
  { iso: "PH", name: "Philippines", words: ["philippines", "filipino", "filipina", "pinoy", "pinay", "pilipinas"], zones: ["Asia/Manila"], langs: ["fil", "tgl", "tl"] },
  { iso: "CN", name: "China", words: ["china", "chinese", "中国"], zones: ["Asia/Shanghai"], langs: ["zho", "chi", "zh", "cmn"] },
  { iso: "TW", name: "Taiwan", words: ["taiwan", "taiwanese", "台灣", "台湾"], zones: ["Asia/Taipei"] },
  { iso: "HK", name: "Hong Kong", words: ["hong kong", "hongkong", "香港"], zones: ["Asia/Hong_Kong"], langs: ["yue"] },
  { iso: "KR", name: "South Korea", words: ["korea", "korean", "한국", "대한민국"], zones: ["Asia/Seoul"], langs: ["kor", "ko"] },
  { iso: "JP", name: "Japan", words: ["japan", "japanese", "nihon", "nippon", "日本"], zones: ["Asia/Tokyo"], langs: ["jpn", "ja"] },
  { iso: "AU", name: "Australia", words: ["australia", "australian", "aussie", "straya"], zones: ["Australia/Sydney", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth"] },
  { iso: "NZ", name: "New Zealand", words: ["new zealand", "kiwi", "aotearoa"], zones: ["Pacific/Auckland"], langs: ["mri"] },
  { iso: "US", name: "United States", words: ["usa", "united states", "america", "american", "murica", "us american"], zones: ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Denver"] },
  { iso: "CA", name: "Canada", words: ["canada", "canadian", "canuck"], zones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax"] },
  { iso: "MX", name: "Mexico", words: ["mexico", "mexican", "méxico", "mexicano", "mexicana"], zones: ["America/Mexico_City", "America/Tijuana"] },
  { iso: "BR", name: "Brazil", words: ["brazil", "brazilian", "brasil", "brasileiro", "brasileira", "br"], zones: ["America/Sao_Paulo", "America/Manaus"], langs: ["por", "pt"] },
  { iso: "AR", name: "Argentina", words: ["argentina", "argentinian", "argentine", "argentino"], zones: ["America/Argentina/Buenos_Aires"] },
  { iso: "CL", name: "Chile", words: ["chile", "chilean", "chileno"], zones: ["America/Santiago"] },
  { iso: "CO", name: "Colombia", words: ["colombia", "colombian", "colombiano"], zones: ["America/Bogota"] },
  { iso: "PE", name: "Peru", words: ["peru", "peruvian", "perú", "peruano"], zones: ["America/Lima"] },
  { iso: "VE", name: "Venezuela", words: ["venezuela", "venezuelan"], zones: ["America/Caracas"] },
];

/** Cities and regions inside countries with several zones (and big cities anywhere). */
const PLACES: [string, string, string][] = [
  // US
  ["new york", "America/New_York", "New York"], ["nyc", "America/New_York", "New York"], ["florida", "America/New_York", "Florida"], ["georgia", "America/New_York", "Georgia (US)"], ["ohio", "America/New_York", "Ohio"], ["michigan", "America/Detroit", "Michigan"], ["pennsylvania", "America/New_York", "Pennsylvania"], ["virginia", "America/New_York", "Virginia"], ["carolina", "America/New_York", "Carolina"], ["boston", "America/New_York", "Boston"], ["atlanta", "America/New_York", "Atlanta"], ["miami", "America/New_York", "Miami"],
  ["texas", "America/Chicago", "Texas"], ["chicago", "America/Chicago", "Chicago"], ["illinois", "America/Chicago", "Illinois"], ["minnesota", "America/Chicago", "Minnesota"], ["wisconsin", "America/Chicago", "Wisconsin"], ["missouri", "America/Chicago", "Missouri"], ["tennessee", "America/Chicago", "Tennessee"], ["alabama", "America/Chicago", "Alabama"], ["louisiana", "America/Chicago", "Louisiana"], ["oklahoma", "America/Chicago", "Oklahoma"], ["iowa", "America/Chicago", "Iowa"], ["kansas", "America/Chicago", "Kansas"], ["dallas", "America/Chicago", "Dallas"], ["houston", "America/Chicago", "Houston"],
  ["colorado", "America/Denver", "Colorado"], ["utah", "America/Denver", "Utah"], ["denver", "America/Denver", "Denver"], ["arizona", "America/Phoenix", "Arizona"], ["new mexico", "America/Denver", "New Mexico"],
  ["california", "America/Los_Angeles", "California"], ["cali", "America/Los_Angeles", "California"], ["oregon", "America/Los_Angeles", "Oregon"], ["washington state", "America/Los_Angeles", "Washington"], ["seattle", "America/Los_Angeles", "Seattle"], ["los angeles", "America/Los_Angeles", "Los Angeles"], ["san francisco", "America/Los_Angeles", "San Francisco"], ["nevada", "America/Los_Angeles", "Nevada"], ["las vegas", "America/Los_Angeles", "Las Vegas"],
  ["alaska", "America/Anchorage", "Alaska"], ["hawaii", "Pacific/Honolulu", "Hawaii"],
  // Canada, Australia, Brazil, Russia
  ["toronto", "America/Toronto", "Toronto"], ["ontario", "America/Toronto", "Ontario"], ["quebec", "America/Toronto", "Québec"], ["montreal", "America/Toronto", "Montréal"], ["vancouver", "America/Vancouver", "Vancouver"], ["british columbia", "America/Vancouver", "British Columbia"], ["alberta", "America/Edmonton", "Alberta"], ["calgary", "America/Edmonton", "Calgary"], ["manitoba", "America/Winnipeg", "Manitoba"], ["nova scotia", "America/Halifax", "Nova Scotia"],
  ["sydney", "Australia/Sydney", "Sydney"], ["melbourne", "Australia/Melbourne", "Melbourne"], ["brisbane", "Australia/Brisbane", "Brisbane"], ["queensland", "Australia/Brisbane", "Queensland"], ["perth", "Australia/Perth", "Perth"], ["adelaide", "Australia/Adelaide", "Adelaide"], ["victoria", "Australia/Melbourne", "Victoria"], ["nsw", "Australia/Sydney", "New South Wales"],
  ["são paulo", "America/Sao_Paulo", "São Paulo"], ["sao paulo", "America/Sao_Paulo", "São Paulo"], ["rio", "America/Sao_Paulo", "Rio de Janeiro"], ["manaus", "America/Manaus", "Manaus"],
  ["moscow", "Europe/Moscow", "Moscow"], ["moskau", "Europe/Moscow", "Moscow"], ["siberia", "Asia/Novosibirsk", "Siberia"], ["vladivostok", "Asia/Vladivostok", "Vladivostok"],
  // big cities elsewhere
  ["berlin", "Europe/Berlin", "Berlin"], ["munich", "Europe/Berlin", "Munich"], ["münchen", "Europe/Berlin", "Munich"], ["hamburg", "Europe/Berlin", "Hamburg"], ["cologne", "Europe/Berlin", "Cologne"], ["köln", "Europe/Berlin", "Cologne"], ["vienna", "Europe/Vienna", "Vienna"], ["wien", "Europe/Vienna", "Vienna"], ["zurich", "Europe/Zurich", "Zurich"], ["amsterdam", "Europe/Amsterdam", "Amsterdam"], ["paris", "Europe/Paris", "Paris"], ["london", "Europe/London", "London"], ["manchester", "Europe/London", "Manchester"], ["dublin", "Europe/Dublin", "Dublin"], ["madrid", "Europe/Madrid", "Madrid"], ["barcelona", "Europe/Madrid", "Barcelona"], ["lisbon", "Europe/Lisbon", "Lisbon"], ["rome", "Europe/Rome", "Rome"], ["milan", "Europe/Rome", "Milan"], ["warsaw", "Europe/Warsaw", "Warsaw"], ["prague", "Europe/Prague", "Prague"], ["stockholm", "Europe/Stockholm", "Stockholm"], ["oslo", "Europe/Oslo", "Oslo"], ["copenhagen", "Europe/Copenhagen", "Copenhagen"], ["helsinki", "Europe/Helsinki", "Helsinki"], ["kyiv", "Europe/Kyiv", "Kyiv"], ["kiev", "Europe/Kyiv", "Kyiv"], ["istanbul", "Europe/Istanbul", "Istanbul"],
  ["tokyo", "Asia/Tokyo", "Tokyo"], ["osaka", "Asia/Tokyo", "Osaka"], ["seoul", "Asia/Seoul", "Seoul"], ["shanghai", "Asia/Shanghai", "Shanghai"], ["beijing", "Asia/Shanghai", "Beijing"], ["taipei", "Asia/Taipei", "Taipei"], ["manila", "Asia/Manila", "Manila"], ["jakarta", "Asia/Jakarta", "Jakarta"], ["bangkok", "Asia/Bangkok", "Bangkok"], ["mumbai", "Asia/Kolkata", "Mumbai"], ["delhi", "Asia/Kolkata", "Delhi"],
  ["mexico city", "America/Mexico_City", "Mexico City"], ["buenos aires", "America/Argentina/Buenos_Aires", "Buenos Aires"], ["santiago", "America/Santiago", "Santiago"], ["bogota", "America/Bogota", "Bogotá"], ["lima", "America/Lima", "Lima"], ["auckland", "Pacific/Auckland", "Auckland"],
];

const ABBR: [string, string, string, number][] = [
  // abbreviation, zone, label, weight (ambiguous ones less)
  ["est", "America/New_York", "Eastern Time (US)", 3], ["edt", "America/New_York", "Eastern Time (US)", 3],
  ["cst", "America/Chicago", "Central Time (US)", 2], ["cdt", "America/Chicago", "Central Time (US)", 3],
  ["mst", "America/Denver", "Mountain Time (US)", 3], ["mdt", "America/Denver", "Mountain Time (US)", 3],
  ["pst", "America/Los_Angeles", "Pacific Time (US)", 3], ["pdt", "America/Los_Angeles", "Pacific Time (US)", 3],
  ["akst", "America/Anchorage", "Alaska", 3], ["hst", "Pacific/Honolulu", "Hawaii", 3],
  ["gmt", "Europe/London", "UK time", 1], ["bst", "Europe/London", "UK time", 2],
  ["cet", "Europe/Berlin", "Central European Time", 3], ["cest", "Europe/Berlin", "Central European Time", 3], ["mez", "Europe/Berlin", "Central European Time", 3],
  ["eet", "Europe/Helsinki", "Eastern European Time", 3], ["eest", "Europe/Helsinki", "Eastern European Time", 3], ["wet", "Europe/Lisbon", "Western European Time", 3],
  ["msk", "Europe/Moscow", "Moscow time", 3], ["ist", "Asia/Kolkata", "India time", 1], ["jst", "Asia/Tokyo", "Japan time", 3], ["kst", "Asia/Seoul", "Korea time", 3],
  ["aest", "Australia/Sydney", "Australian Eastern Time", 3], ["aedt", "Australia/Sydney", "Australian Eastern Time", 3], ["acst", "Australia/Adelaide", "Australian Central Time", 3], ["awst", "Australia/Perth", "Australian Western Time", 3],
  ["nzst", "Pacific/Auckland", "New Zealand time", 3], ["nzdt", "Pacific/Auckland", "New Zealand time", 3], ["sgt", "Asia/Singapore", "Singapore time", 3], ["pht", "Asia/Manila", "Philippine time", 3], ["hkt", "Asia/Hong_Kong", "Hong Kong time", 3], ["brt", "America/Sao_Paulo", "Brasília time", 3],
];

const ZONE_LABEL: Record<string, string> = Object.fromEntries([
  // Places only name zones no country names (later entries win).
  ...PLACES.map(([, z, l]) => [z, l]),
  ...COUNTRIES.flatMap((c) => c.zones.map((z) => [z, c.zones.length > 1 ? `${c.name} (${z.split("/").pop()!.replace(/_/g, " ")})` : c.name])),
  ["America/New_York", "US East (New York)"],
  ["America/Chicago", "US Central (Chicago)"],
  ["America/Denver", "US Mountain (Denver)"],
  ["America/Los_Angeles", "US West (Los Angeles)"],
]);

export function zoneLabel(tz: string): string {
  if (ZONE_LABEL[tz]) return ZONE_LABEL[tz];
  const m = tz.match(/^Etc\/GMT([+-])(\d+)$/);
  if (m) return `UTC${m[1] === "-" ? "+" : "-"}${m[2]}`;
  return tz.split("/").pop()!.replace(/_/g, " ");
}

/** Flag emoji → ISO country code. */
function flagsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)) {
    const a = m[1].codePointAt(0)! - 0x1f1e6 + 65;
    const b = m[2].codePointAt(0)! - 0x1f1e6 + 65;
    out.push(String.fromCharCode(a, b));
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(w)}(?:$|[^\\p{L}\\p{N}])`, "iu");

type Adder = (tz: string, score: number, reason: string) => void;

/** Hints in one text. `weight` scales the source (bio 1, group names 0.6…). */
export function hintsInText(text: string, source: string, add: Adder, weight = 1) {
  if (!text) return;
  const lower = text.toLowerCase();
  // IANA names
  for (const m of text.matchAll(/\b((?:Europe|America|Asia|Australia|Africa|Pacific)\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?)\b/g)) add(m[1], 5 * weight, `${source}: "${m[1]}"`);
  // UTC / GMT offsets
  for (const m of text.matchAll(/\b(?:utc|gmt)\s*([+-−])\s*(\d{1,2})(?::?(\d\d))?\b/gi)) {
    const sign = m[1] === "+" ? "+" : "-";
    const h = Number(m[2]);
    if (h > 14) continue;
    const mins = Number(m[3] ?? 0);
    const tz = mins ? `${sign}${String(h).padStart(2, "0")}:${m[3]}` : `Etc/GMT${sign === "+" ? "-" : "+"}${h}`;
    add(tz, 5 * weight, `${source}: "${m[0].trim()}"`);
  }
  // abbreviations (only as whole words, upper case in the original to avoid "est" in words)
  for (const [ab, tz, label, w] of ABBR) {
    if (new RegExp(`(?:^|[^A-Za-z])${ab.toUpperCase()}(?:$|[^A-Za-z])`).test(text)) add(tz, w * weight, `${source}: "${ab.toUpperCase()}" (${label})`);
  }
  // flags
  for (const iso of flagsIn(text)) {
    const c = COUNTRIES.find((x) => x.iso === iso);
    if (c) c.zones.forEach((z, i) => add(z, (i === 0 ? 3 : 1.5) * weight, `${source}: ${c.name} flag`));
  }
  // places first (more specific), then countries
  for (const [w, tz, label] of PLACES) if (wordRe(w).test(lower)) add(tz, 3.5 * weight, `${source}: "${label}"`);
  for (const c of COUNTRIES) {
    const hit = c.words.find((w) => w.length > 2 && wordRe(w).test(lower));
    if (hit) c.zones.forEach((z, i) => add(z, (i === 0 ? 2.5 : 1.2 / i) * weight, `${source}: "${hit}"`));
  }
}

export interface TzInput {
  texts: { source: string; text: string; weight?: number }[];
  languages?: string[];
  groups?: string[];
  /** Their online share per hour of the week (0–1), in this device's time. */
  hours?: number[] | null;
}

/** Ranked time zone candidates (best first), at most 4. */
export function guessTimezones(input: TzInput): TzCandidate[] {
  const map = new Map<string, TzCandidate>();
  const add: Adder = (tz, score, reason) => {
    const c = map.get(tz) ?? { tz, label: zoneLabel(tz), score: 0, reasons: [] };
    // The same reason twice (bio and a mirrored link page) counts once.
    if (!c.reasons.includes(reason)) {
      c.score += score;
      c.reasons.push(reason);
    }
    map.set(tz, c);
  };
  for (const t of input.texts) hintsInText(t.text, t.source, add, t.weight ?? 1);
  for (const g of input.groups ?? []) hintsInText(g, `group "${g}"`, add, 0.6);
  for (const l of input.languages ?? []) {
    const code = l.toLowerCase().replace(/^language_/, "");
    const c = COUNTRIES.find((x) => x.langs?.includes(code));
    if (c) add(c.zones[0], 1.5, `speaks ${c.name === "Brazil" ? "Portuguese" : c.name === "United Kingdom" ? "English" : langName(code, c)}`);
  }
  // Online hours: people are mostly online in the evening (19–24 local).
  const off = eveningOffset(input.hours);
  if (off !== null) {
    for (const c of map.values()) {
      const zoneOff = offsetHours(c.tz);
      if (zoneOff !== null && Math.abs(zoneOff - off) <= 1.5) {
        c.score += 1;
        c.reasons.push(`usually online in the evening there`);
      }
    }
    if (!map.size) add(fixedZone(off), 0.8, "usually online hours (weak)");
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}

function langName(code: string, c: Country): string {
  const names: Record<string, string> = { deu: "German", de: "German", ger: "German", jpn: "Japanese", ja: "Japanese", kor: "Korean", ko: "Korean", fra: "French", fr: "French", ita: "Italian", it: "Italian", pol: "Polish", rus: "Russian", ru: "Russian", tur: "Turkish", nld: "Dutch", swe: "Swedish", fin: "Finnish", tha: "Thai", vie: "Vietnamese", zho: "Chinese", chi: "Chinese", zh: "Chinese", ukr: "Ukrainian" };
  return names[code] ?? `the language of ${c.name}`;
}

function fixedZone(offset: number): string {
  const h = Math.round(offset);
  return h === 0 ? "Etc/GMT" : `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`;
}

/** UTC offset in hours of a zone right now (null if the zone is unknown). */
export function offsetHours(tz: string, at = new Date()): number | null {
  if (/^[+-]\d\d:\d\d$/.test(tz)) {
    const [h, m] = tz.slice(1).split(":").map(Number);
    return (tz[0] === "-" ? -1 : 1) * (h + m / 60);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = name.match(/GMT([+-])(\d\d):(\d\d)/);
    if (!m) return name === "GMT" ? 0 : null;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
  } catch {
    return null;
  }
}

/** If their online hours show a clear evening peak, the UTC offset that puts it at ~21:00. */
export function eveningOffset(hours: number[] | null | undefined, myOffset = -new Date().getTimezoneOffset() / 60): number | null {
  if (!hours || hours.length !== 168) return null;
  const day = new Array(24).fill(0);
  hours.forEach((v, i) => (day[i % 24] += v));
  const total = day.reduce((a, b) => a + b, 0);
  if (!total) return null;
  // Circular mean of the online hours (in this device's time).
  let sx = 0;
  let sy = 0;
  day.forEach((v, h) => {
    sx += v * Math.cos((h / 24) * 2 * Math.PI);
    sy += v * Math.sin((h / 24) * 2 * Math.PI);
  });
  const strength = Math.hypot(sx, sy) / total;
  if (strength < 0.35) return null; // online all day: no clear peak
  const peak = ((Math.atan2(sy, sx) / (2 * Math.PI)) * 24 + 24) % 24;
  // Their 21:00 = our `peak`: offset difference = 21 - peak.
  let off = myOffset + (21 - peak);
  while (off > 14) off -= 24;
  while (off < -12) off += 24;
  return Math.round(off);
}

/** The time in a zone ("21:34"), or "" if the zone is unknown. */
export function timeIn(tz: string, at = new Date()): string {
  try {
    if (/^[+-]\d\d:\d\d$/.test(tz)) {
      const off = offsetHours(tz)!;
      const d = new Date(at.getTime() + off * 36e5);
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    }
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);
  } catch {
    return "";
  }
}

/** Hours ahead (+) or behind (−) your own time. */
export function differenceFromMe(tz: string, at = new Date()): number | null {
  const off = offsetHours(tz, at);
  return off === null ? null : off + at.getTimezoneOffset() / 60;
}

/** The hour there, 0–23 (whatever the 12- or 24-hour clock the app shows). */
export function hourIn(tz: string, at = new Date()): number | null {
  const off = offsetHours(tz, at);
  if (off === null) return null;
  const h = Math.floor((((at.getUTCHours() + at.getUTCMinutes() / 60 + off) % 24) + 24) % 24);
  return Number.isFinite(h) ? h : null;
}

export type DayPart = "night" | "early morning" | "morning" | "afternoon" | "evening" | "late evening";

/** Which part of the day an hour (0–23) is. */
export function dayPart(h: number): DayPart {
  if (h < 5) return "night";
  if (h < 8) return "early morning";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "late evening";
}

/** Is it night there (00–05)? For "it's 3 am for them". */
export function isNightThere(tz: string, at = new Date()): boolean {
  const h = hourIn(tz, at);
  return h !== null && dayPart(h) === "night";
}

/**
 * The world's time zones by UTC offset (standard time), one representative
 * zone each so summer time still works, with places people know. 38 of them.
 */
export const ZONE_LIST: { tz: string; offset: string; places: string }[] = [
  { tz: "Etc/GMT+12", offset: "UTC−12", places: "Baker Island" },
  { tz: "Pacific/Pago_Pago", offset: "UTC−11", places: "American Samoa, Niue" },
  { tz: "Pacific/Honolulu", offset: "UTC−10", places: "Hawaii, Tahiti" },
  { tz: "Pacific/Marquesas", offset: "UTC−9:30", places: "Marquesas Islands" },
  { tz: "America/Anchorage", offset: "UTC−9", places: "Alaska" },
  { tz: "America/Los_Angeles", offset: "UTC−8", places: "US & Canada Pacific: Los Angeles, Seattle, Vancouver" },
  { tz: "America/Denver", offset: "UTC−7", places: "US & Canada Mountain: Denver, Calgary" },
  { tz: "America/Chicago", offset: "UTC−6", places: "US & Canada Central: Chicago, Dallas, Winnipeg" },
  { tz: "America/New_York", offset: "UTC−5", places: "US & Canada Eastern: New York, Toronto, Miami" },
  { tz: "America/Halifax", offset: "UTC−4", places: "Atlantic Canada, Puerto Rico, Bolivia" },
  { tz: "America/St_Johns", offset: "UTC−3:30", places: "Newfoundland" },
  { tz: "America/Sao_Paulo", offset: "UTC−3", places: "Brazil, Argentina, Chile" },
  { tz: "Atlantic/South_Georgia", offset: "UTC−2", places: "South Georgia, Fernando de Noronha" },
  { tz: "Atlantic/Azores", offset: "UTC−1", places: "Azores, Cape Verde" },
  { tz: "Europe/London", offset: "UTC±0", places: "UK, Ireland, Portugal, Iceland" },
  { tz: "Europe/Berlin", offset: "UTC+1", places: "Central Europe: Germany, France, Spain, Italy, Poland" },
  { tz: "Europe/Athens", offset: "UTC+2", places: "Eastern Europe: Finland, Greece, Ukraine, Romania; Egypt" },
  { tz: "Europe/Moscow", offset: "UTC+3", places: "Moscow, Turkey, Saudi Arabia, Kenya" },
  { tz: "Asia/Tehran", offset: "UTC+3:30", places: "Iran" },
  { tz: "Asia/Dubai", offset: "UTC+4", places: "UAE, Georgia, Armenia" },
  { tz: "Asia/Kabul", offset: "UTC+4:30", places: "Afghanistan" },
  { tz: "Asia/Karachi", offset: "UTC+5", places: "Pakistan, Uzbekistan" },
  { tz: "Asia/Kolkata", offset: "UTC+5:30", places: "India, Sri Lanka" },
  { tz: "Asia/Kathmandu", offset: "UTC+5:45", places: "Nepal" },
  { tz: "Asia/Dhaka", offset: "UTC+6", places: "Bangladesh, Kazakhstan" },
  { tz: "Asia/Yangon", offset: "UTC+6:30", places: "Myanmar" },
  { tz: "Asia/Bangkok", offset: "UTC+7", places: "Thailand, Vietnam, Jakarta" },
  { tz: "Asia/Shanghai", offset: "UTC+8", places: "China, Singapore, Philippines, Perth" },
  { tz: "Australia/Eucla", offset: "UTC+8:45", places: "Eucla" },
  { tz: "Asia/Tokyo", offset: "UTC+9", places: "Japan, Korea" },
  { tz: "Australia/Adelaide", offset: "UTC+9:30", places: "Adelaide, Darwin" },
  { tz: "Australia/Sydney", offset: "UTC+10", places: "Sydney, Melbourne, Brisbane, Guam" },
  { tz: "Australia/Lord_Howe", offset: "UTC+10:30", places: "Lord Howe Island" },
  { tz: "Pacific/Noumea", offset: "UTC+11", places: "New Caledonia, Solomon Islands" },
  { tz: "Pacific/Auckland", offset: "UTC+12", places: "New Zealand, Fiji" },
  { tz: "Pacific/Chatham", offset: "UTC+12:45", places: "Chatham Islands" },
  { tz: "Pacific/Tongatapu", offset: "UTC+13", places: "Tonga, Samoa" },
  { tz: "Pacific/Kiritimati", offset: "UTC+14", places: "Line Islands (Kiribati)" },
];

/** The list entry a zone belongs to: the same one, or the one with the same offset right now. */
export function zoneEntry(tz: string, at = new Date()): (typeof ZONE_LIST)[number] | undefined {
  const exact = ZONE_LIST.find((z) => z.tz === tz);
  if (exact) return exact;
  const off = offsetHours(tz, at);
  return off === null ? undefined : ZONE_LIST.find((z) => offsetHours(z.tz, at) === off);
}
