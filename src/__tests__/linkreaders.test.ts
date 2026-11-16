import { describe, expect, it } from "vitest";
import { linksIn, pageText, readLinks, readOne, readerFor, siteName, stripHtml, DEFAULT_READ } from "../linkreaders";

const pages: Record<string, string> = {
  "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=lumi.bsky.social": JSON.stringify({ handle: "lumi.bsky.social", displayName: "Lumi", description: "29yo artist, Berlin" }),
  "https://linktr.ee/lumi": '<html><head><meta name="description" content="Lumi\'s links"></head><body><a href="https://bsky.app/profile/lumi.bsky.social">bsky</a><a href="https://x.com/lumi">x</a><a href="https://example.com/shop">shop</a></body></html>',
  "https://api.fxtwitter.com/lumi": JSON.stringify({ user: { name: "Lumi", screen_name: "lumi", description: "adult only", location: "Tokyo" } }),
  "https://mastodon.social/api/v1/accounts/lookup?acct=lumi": JSON.stringify({ display_name: "Lumi", note: "<p>he/him &amp; 25</p>", fields: [{ name: "Time zone", value: "UTC+1" }] }),
  "https://steamcommunity.com/id/lumi/?xml=1": "<profile><steamID><![CDATA[Lumi]]></steamID><location><![CDATA[Germany]]></location><summary><![CDATA[hi i'm 22]]></summary></profile>",
};
const fetcher = async (u: string) => {
  if (u in pages) return pages[u];
  if (u.includes("instagram")) throw new Error("HTTP 403");
  throw new Error("HTTP 404");
};

describe("link readers", () => {
  it("knows the sites", () => {
    expect(siteName("https://bsky.app/profile/a.b")).toBe("Bluesky");
    expect(siteName("https://x.com/someone")).toBe("X / Twitter");
    expect(siteName("https://twitter.com/home")).toBe("twitter.com");
    expect(siteName("https://linktr.ee/x")).toBe("Linktree");
    expect(siteName("https://someone.carrd.co")).toBe("Carrd");
    expect(siteName("https://mastodon.social/@lumi")).toBe("Fediverse");
    expect(readerFor(new URL("https://example.com/about"))).toBeNull();
  });
  it("reads APIs", async () => {
    const r = await readOne("https://bsky.app/profile/lumi.bsky.social", fetcher, DEFAULT_READ);
    expect(r.status).toBe("read");
    expect(r.text).toContain("29yo artist");
    const m = await readOne("https://mastodon.social/@lumi", fetcher, DEFAULT_READ);
    expect(m.text).toContain("he/him & 25");
    expect(m.text).toContain("Time zone: UTC+1");
    const st = await readOne("https://steamcommunity.com/id/lumi", fetcher, DEFAULT_READ);
    expect(st.text).toContain("Location: Germany");
  });
  it("X only with the FxTwitter switch, socials only when allowed", async () => {
    expect((await readOne("https://x.com/lumi", fetcher, DEFAULT_READ)).status).toBe("skipped");
    const x = await readOne("https://x.com/lumi", fetcher, { ...DEFAULT_READ, fxTwitter: true });
    expect(x.text).toContain("Location: Tokyo");
    expect((await readOne("https://bsky.app/profile/lumi.bsky.social", fetcher, { ...DEFAULT_READ, socials: false })).status).toBe("skipped");
  });
  it("login walls", async () => {
    expect((await readOne("https://instagram.com/lumi", fetcher, DEFAULT_READ)).status).toBe("login");
  });
  it("follows link pages one step, only to known sites", async () => {
    const reads = await readLinks(["https://linktr.ee/lumi"], fetcher, { ...DEFAULT_READ, fxTwitter: true });
    expect(reads.map((r) => r.site)).toEqual(["Linktree", "Bluesky", "X / Twitter"]);
    expect(reads[1].from).toBe("https://linktr.ee/lumi");
    const flat = await readLinks(["https://linktr.ee/lumi"], fetcher, { ...DEFAULT_READ, depth: 0 });
    expect(flat).toHaveLength(1);
    const capped = await readLinks(["https://linktr.ee/lumi"], fetcher, { ...DEFAULT_READ, fxTwitter: true, maxPages: 2 });
    expect(capped.filter((r) => r.status !== "skipped")).toHaveLength(2);
  });
  it("page text and links", () => {
    expect(stripHtml("<p>a&amp;b</p><br>c")).toBe("a&b\nc");
    expect(pageText('<title>T</title><script>"bio":"x"</script>"bio":"hello 19"<body>Body</body>')).toContain("hello 19");
    expect(linksIn('<a href="https://bsky.app/profile/x.y">a</a> "https:\\/\\/linktr.ee\\/z"')).toEqual(["https://bsky.app/profile/x.y", "https://linktr.ee/z"]);
  });
});
