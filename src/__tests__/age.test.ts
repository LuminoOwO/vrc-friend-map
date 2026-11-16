import { describe, expect, it } from "vitest";
import { hintsIn, linkHint, summarize } from "../age";

const verdict = (t: string) => summarize(hintsIn(t, "bio")).verdict;

describe("age hints", () => {
  it("reads stated ages", () => {
    expect(verdict("hey, I'm 15 and love VR")).toBe("minor");
    expect(verdict("24 y/o, artist")).toBe("adult");
    expect(verdict("Age: 19")).toBe("adult");
    expect(verdict("16yo gamer")).toBe("minor");
  });
  it("reads 'minors DNI' as an adult hint, not a minor one", () => {
    expect(verdict("minors dni pls")).toBe("adult");
    expect(verdict("DNI if you're a minor")).toBe("adult");
    expect(verdict("DNI minors")).toBe("adult");
  });
  it("school and birth years", () => {
    expect(verdict("8th grade, band kid")).toBe("minor");
    expect(verdict("born 1998")).toBe("adult");
  });
  it("doesn't count heights, followers or percentages as ages", () => {
    expect(verdict("I'm 17k followers strong")).toBe("none");
    expect(verdict("im 16% done")).toBe("none");
  });
  it("nothing to go on means no hint", () => {
    expect(verdict("discord - Sirplus1881. <-- with the period\nBarq - Dxrtbag\nSingle")).toBe("none");
    expect(verdict("")).toBe("none");
  });
  it("mixed signals stay mixed", () => {
    expect(verdict("I'm 16, 18+ only content lol")).toBe("mixed");
  });
  it("a number alone at the start of a line is a weaker age hint", () => {
    expect(verdict("18")).toBe("adult");
    expect(summarize(hintsIn("18", "bio")).strong).toBe(false);
    expect(verdict("19\nPresonality flirty\nDont be afraid to ask")).toBe("adult");
    expect(verdict("21 | he/him | artist")).toBe("adult");
    expect(verdict("15 • she/her")).toBe("minor");
    expect(verdict("hi!\n16\nlikes cats")).toBe("minor");
  });
  it("doesn't take other numbers for ages", () => {
    expect(verdict("2026 was fun")).toBe("none");
    expect(verdict("10:30 pm usually online")).toBe("none");
    expect(verdict("50 followers on twitch")).toBe("none");
    expect(verdict("3 cats")).toBe("none");
  });
  it("a stated age wins over a lone number", () => {
    expect(hintsIn("19\nI'm 19 btw", "bio")).toHaveLength(1);
  });
  it("links to adults-only sites", () => {
    expect(linkHint("https://onlyfans.com/someone")?.dir).toBe("adult");
    expect(linkHint("https://www.fansly.com/x")?.dir).toBe("adult");
    expect(linkHint("https://x.com/someone")).toBeNull();
    expect(linkHint("https://notonlyfans.com.evil.example/")).toBeNull();
    expect(linkHint("not a url")).toBeNull();
  });
});
