import { describe, expect, it } from "vitest";
import { normalize, type Token } from "@/lib/search/normalize";

/**
 * Every token must re-read its own characters from the ORIGINAL display string,
 * because highlight ranges (spec §6.4) slice the string the viewer sees.
 */
function reread(display: string, tokens: Token[]): string[] {
  return tokens.map((t) => display.slice(t.start, t.end));
}

describe("normalize (spec §5.1)", () => {
  it("joins a hyphen between letters and keeps display offsets", () => {
    const display = "Wi-Fi password";
    const tokens = normalize(display);
    expect(tokens).toEqual([
      { text: "wifi", start: 0, end: 5 },
      { text: "password", start: 6, end: 14 },
    ]);
    expect(reread(display, tokens)).toEqual(["Wi-Fi", "password"]);
  });

  it("folds accents and joins an apostrophe; offsets cover the displayed words", () => {
    const display = "Café Doug's";
    const tokens = normalize(display);
    expect(tokens).toEqual([
      { text: "cafe", start: 0, end: 4 },
      { text: "dougs", start: 5, end: 11 },
    ]);
    expect(reread(display, tokens)).toEqual(["Café", "Doug's"]);
  });

  it("folds a decomposed accent without splitting the word or dropping the mark", () => {
    const display = "Café open";
    const tokens = normalize(display);
    expect(tokens.map((t) => t.text)).toEqual(["cafe", "open"]);
    expect(reread(display, tokens)).toEqual(["Café", "open"]);
  });

  it("joins a typographic apostrophe between letters", () => {
    const display = "Doug’s rig";
    const tokens = normalize(display);
    expect(tokens.map((t) => t.text)).toEqual(["dougs", "rig"]);
    expect(reread(display, tokens)).toEqual(["Doug’s", "rig"]);
  });

  it("splits times on the colon and joins load-in", () => {
    const display = "load-in 6:30 AM";
    const tokens = normalize(display);
    expect(tokens.map((t) => t.text)).toEqual(["loadin", "6", "30", "am"]);
    expect(reread(display, tokens)).toEqual(["load-in", "6", "30", "AM"]);
  });

  it("joins a hyphen between digits", () => {
    expect(normalize("PO-44821").map((t) => t.text)).toEqual(["po44821"]);
  });

  it("drops leading and trailing punctuation", () => {
    expect(normalize("(GS)")).toEqual([{ text: "gs", start: 1, end: 3 }]);
  });

  it("splits on a hyphen that is not between two letters or digits", () => {
    const display = "- dock -";
    expect(normalize(display)).toEqual([{ text: "dock", start: 2, end: 6 }]);
    // Doubled, leading and trailing joiners are separators too.
    expect(normalize("a--b").map((t) => t.text)).toEqual(["a", "b"]);
    expect(normalize("'quoted'").map((t) => t.text)).toEqual(["quoted"]);
    expect(normalize("dock-").map((t) => t.text)).toEqual(["dock"]);
  });

  it("lowercases and keeps digits", () => {
    expect(normalize("Grand Ballroom B 2").map((t) => t.text)).toEqual([
      "grand",
      "ballroom",
      "b",
      "2",
    ]);
  });

  it("maps compatibility characters to their plain letters at the original offset", () => {
    // U+FB01 (fi ligature) is one display character that folds to two letters.
    const display = "ﬁle";
    const tokens = normalize(display);
    expect(tokens).toEqual([{ text: "file", start: 0, end: 3 }]);
  });

  it("returns no tokens for empty, whitespace-only and punctuation-only input", () => {
    expect(normalize("")).toEqual([]);
    expect(normalize("   \t\n ")).toEqual([]);
    expect(normalize(" - / . ")).toEqual([]);
  });

  it("keeps offsets right after a character outside the basic plane", () => {
    // An emoji is two UTF-16 units; the token after it must still re-read itself.
    const display = "🎤 mics";
    const tokens = normalize(display);
    expect(tokens.map((t) => t.text)).toEqual(["mics"]);
    expect(reread(display, tokens)).toEqual(["mics"]);
  });
});
