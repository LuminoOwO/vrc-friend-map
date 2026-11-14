import { describe, expect, it } from "vitest";
import { hintsIn, summarize } from "../age";

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
});
