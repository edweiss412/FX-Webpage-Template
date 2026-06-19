import { describe, expect, test } from "vitest";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

const FORBIDDEN = ["https://", "http://", "drive.google.com", "docs.google.com"];
function assertNoUrlSubstring(out: string): void {
  for (const f of FORBIDDEN) expect(out.toLowerCase()).not.toContain(f);
}

describe("stripAgendaUrls", () => {
  test("strips a schemed Drive URL, leaving clean residue (orphan connector trimmed)", () => {
    const out = stripAgendaUrls("Opening Keynote - https://drive.google.com/file/d/abc/view");
    expect(out).toBe("Opening Keynote");
    assertNoUrlSubstring(out);
  });

  test("strips a NON-Google schemed URL (Zoom / CDN) — broader than the opening-reel helper", () => {
    assertNoUrlSubstring(stripAgendaUrls("Breakout A https://zoom.us/j/123456"));
    assertNoUrlSubstring(stripAgendaUrls("Stream https://cdn.example.com/x?sig=9"));
    expect(stripAgendaUrls("Breakout A https://zoom.us/j/123456")).toBe("Breakout A");
  });

  test("strips a SCHEME-LESS Google URL (Doug sometimes omits the scheme)", () => {
    const out = stripAgendaUrls("Slides drive.google.com/file/d/xyz/view");
    expect(out).toBe("Slides");
    assertNoUrlSubstring(out);
  });

  // Case-insensitivity (regex `i` flag): the DOM invariant checks
  // `out.toLowerCase()`, so an UPPERCASE or Mixed-Case scheme/host must still be
  // stripped — otherwise the lowercased DOM retains the forbidden substring.
  test("strips an UPPERCASE schemed URL", () => {
    const out = stripAgendaUrls("Keynote HTTPS://ZOOM.US/J/9");
    assertNoUrlSubstring(out);
    expect(out).toBe("Keynote");
  });

  test("strips a Mixed-Case schemed Google URL", () => {
    const out = stripAgendaUrls("Slides Https://Drive.Google.com/file/d/x/view");
    assertNoUrlSubstring(out);
    expect(out).toBe("Slides");
  });

  test("strips a Mixed-Case SCHEME-LESS Google host", () => {
    const out = stripAgendaUrls("Deck Drive.Google.com/file/d/y");
    assertNoUrlSubstring(out);
    expect(out).toBe("Deck");
  });

  test("strips an UPPERCASE SCHEME-LESS Google host", () => {
    const out = stripAgendaUrls("Deck DOCS.GOOGLE.COM/document/d/z");
    assertNoUrlSubstring(out);
    expect(out).toBe("Deck");
  });

  test("multiple URLs in one cell all stripped; whitespace collapsed", () => {
    const out = stripAgendaUrls("A https://a.com/1  and  https://b.com/2 B");
    assertNoUrlSubstring(out);
    expect(out).toBe("A and B");
  });

  test("pure-URL cell → empty residue", () => {
    expect(stripAgendaUrls("https://drive.google.com/file/d/abc")).toBe("");
  });

  test("no URL → returned trimmed/space-collapsed unchanged", () => {
    expect(stripAgendaUrls("  Q&A  w/   panel  ")).toBe("Q&A w/ panel");
  });

  // Documented limitation (spec §4.3 / wp — do-not-relitigate): a scheme-less
  // NON-Google bare domain is NOT stripped. Pinned so a future "widen it"
  // change is a deliberate decision, not an accident.
  test("DOCUMENTED LIMITATION: scheme-less non-Google bare domain is NOT stripped", () => {
    expect(stripAgendaUrls("Call zoom.us/j/1")).toContain("zoom.us/j/1");
  });
});
