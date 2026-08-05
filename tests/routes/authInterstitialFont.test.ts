// BL-AUTH-INTERSTITIAL-FONT — three of the four hand-built auth documents fall
// to browser-default serif.
//
// Four route handlers return a complete `<html>` string, so neither Next root
// renders them and neither the font loader's class nor the app stylesheet
// reaches them. `app/auth/sign-out/route.ts` already solved this the right way:
// an inline `<style>` DECLARING a system stack — zero external assets, no React,
// no second font-delivery mechanism. The entry's own framing offered only two
// bad options (inline `@font-face`, or route through React) and missed the third
// sitting in its own sibling; Unit A's screen refuted the dichotomy on that
// basis, and the fix is to extend the precedent rather than invent a mechanism.
//
// ANTI-TAUTOLOGY. A `toContain("system-ui")` over each route's SOURCE would pass
// on a commented-out line and prove nothing about the bytes a browser receives.
// So the shared module is exercised as a function, and each route handler's own
// document is asserted through the exported builder it now uses. The negative
// half is the load-bearing half: an added `<link>` or `@import` would "fix" the
// font while introducing exactly the network dependency the entry rejects on a
// page that is only reached because a request already failed.
import { describe, expect, it } from "vitest";
import { INTERSTITIAL_STYLE, interstitialDocument } from "@/lib/auth/interstitialDocument";

const DOC = interstitialDocument({
  title: "Sign-in temporarily unavailable",
  heading: "Sign-in temporarily unavailable",
  body: "Please try again in a moment.",
});

describe("the shared interstitial document", () => {
  it("declares a font stack, so the document does not fall to browser-default serif", () => {
    expect(DOC).toContain("system-ui");
    // Declared inside a real <style> block in <head>, not stranded in a comment
    // or dropped into <body> where it would be parse-order dependent.
    const head = DOC.slice(DOC.indexOf("<head>"), DOC.indexOf("</head>"));
    expect(head).toContain("<style>");
    expect(head).toContain("system-ui");
  });

  it("requests ZERO external assets — the whole reason the stack is declared, not delivered", () => {
    // This is the constraint the entry actually cares about: these documents are
    // reached BECAUSE a request already failed, so a webfont would add a first
    // network dependency at the worst possible moment.
    expect(DOC).not.toMatch(/<link\b/i);
    expect(DOC).not.toMatch(/@import/i);
    expect(DOC).not.toMatch(/@font-face/i);
    expect(DOC).not.toMatch(/https?:\/\//i);
    expect(DOC).not.toMatch(/<script\b/i);
  });

  it("is a complete, well-formed document with the copy it was given", () => {
    expect(DOC.startsWith("<!doctype html>")).toBe(true);
    expect(DOC).toContain('<html lang="en">');
    expect(DOC).toContain('<meta charset="utf-8">');
    expect(DOC).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(DOC).toContain("<title>Sign-in temporarily unavailable</title>");
    expect(DOC).toContain("<h1>Sign-in temporarily unavailable</h1>");
    expect(DOC).toContain("<p>Please try again in a moment.</p>");
    expect(DOC.endsWith("</html>")).toBe(true);
  });

  it("puts caller-supplied markup where the caller asked, after the copy", () => {
    const withForm = interstitialDocument({
      title: "t",
      heading: "h",
      body: "b",
      extraBodyHtml: '<form method="POST"><button type="submit">Retry</button></form>',
    });
    expect(withForm.indexOf("<p>b</p>")).toBeLessThan(withForm.indexOf("<form"));
    expect(withForm.indexOf("<form")).toBeLessThan(withForm.indexOf("</body>"));
    // And omitting it emits no empty shell.
    expect(DOC).not.toContain("<form");
  });

  it("keeps the sign-out precedent's own rules, so the four look alike", () => {
    // The style block is the sign-out document's, verbatim in effect: a shared
    // DECLARATION is the point. If these selectors drift the four documents
    // start looking like four different products again.
    for (const rule of ["body{", "h1{", "p{", "button{"]) {
      expect(INTERSTITIAL_STYLE).toContain(rule);
    }
    expect(INTERSTITIAL_STYLE).toContain("16px/1.5 system-ui,sans-serif");
  });
});

describe("the style block is accessible in both schemes", () => {
  // Both measured 2026-08-04 with the WCAG relative-luminance formula. The
  // border was `#999` when this block belonged to sign-out alone: 2.85:1 on
  // white, under the 3:1 non-text floor. Extracting the block propagated it to
  // four documents, which is what makes it this change's problem to fix.
  const ratio = (a: string, b: string): number => {
    const lum = (hex: string): number => {
      const [r, g, b2] = [0, 2, 4]
        .map((i) => parseInt(hex.slice(1).substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
    };
    const [l1, l2] = [lum(a), lum(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  it("clears the 3:1 non-text floor on the button border", () => {
    const border = /button\{[^}]*border:1px solid (#[0-9a-f]{6})/.exec(INTERSTITIAL_STYLE)?.[1];
    expect(border, "button border color not found in the style block").toBeDefined();
    const fill = /button\{[^}]*background:(#[0-9a-f]{6})/.exec(INTERSTITIAL_STYLE)?.[1];
    expect(fill).toBeDefined();
    // Against BOTH neighbours: the page behind it and the fill it encloses.
    expect(ratio(border!, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(ratio(border!, fill!)).toBeGreaterThanOrEqual(3);
  });

  it("has a dark scheme, because both are first-class on this product", () => {
    // A crew member hitting a sign-in failure backstage at midnight should not
    // get a full-white flash. Costs a media block and no assets, which is the
    // only constraint these documents actually have.
    expect(INTERSTITIAL_STYLE).toContain("prefers-color-scheme:dark");
    const dark = INTERSTITIAL_STYLE.slice(INTERSTITIAL_STYLE.indexOf("prefers-color-scheme:dark"));
    const bg = /body\{[^}]*background:(#[0-9a-f]{6})/.exec(dark)?.[1];
    const fg = /body\{[^}]*color:(#[0-9a-f]{6})/.exec(dark)?.[1];
    expect(bg, "dark scheme sets no body background").toBeDefined();
    expect(fg, "dark scheme sets no body color").toBeDefined();
    expect(ratio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
  });

  it("still ships zero assets after gaining a second scheme", () => {
    // The dark block must not be the thing that sneaks a network dependency in.
    expect(INTERSTITIAL_STYLE).not.toMatch(/url\(/i);
    expect(INTERSTITIAL_STYLE).not.toMatch(/@import/i);
    expect(INTERSTITIAL_STYLE).not.toMatch(/https?:/i);
  });
});

describe("the text slots are escaped", () => {
  // Traced 2026-08-04: all four current call sites pass either a string literal
  // or `messageFor(...)` catalog copy, so nothing attacker-controlled reaches
  // the builder TODAY and this is hardening rather than a live bug. It is worth
  // having anyway — this is a new shared primitive that interpolates into raw
  // HTML, and the next caller is the one that will not check. Escaping at the
  // boundary means a future `interstitialDocument({ body: searchParams.get(...) })`
  // is merely ugly instead of an injection.
  it("escapes the text slots rather than trusting the caller", () => {
    const doc = interstitialDocument({
      title: "</title><script>t()</script>",
      heading: '<img src=x onerror="h()">',
      body: "a & b < c > d \" e ' f",
    });
    expect(doc).not.toContain("<script>");
    expect(doc).not.toContain("<img");
    // NOT asserted: the absence of the substring `onerror=`. Escaping leaves it
    // there as inert TEXT — only the quotes around its value are encoded — and a
    // test demanding its absence would be demanding stripping, not escaping.
    // What actually makes it inert is that no unescaped `<` survives to open a
    // tag, which the two checks above and the tag-count check below pin.
    expect(doc).toContain("&lt;img src=x onerror=&quot;h()&quot;&gt;");
    // Escaped, not stripped: the copy still says what it said.
    expect(doc).toContain("&lt;script&gt;");
    // The interpolated payload opened no element: the document has exactly the
    // tags the builder itself emits, and a `</title>` break-out would add more.
    expect((doc.match(/<title\b/g) ?? []).length).toBe(1);
    expect((doc.match(/<\/title>/g) ?? []).length).toBe(1);
    expect(doc).toContain("a &amp; b &lt; c &gt; d");
    // The ampersand is escaped FIRST, so an escape is never double-encoded into
    // `&amp;lt;` — the classic ordering bug in a hand-rolled escaper.
    expect(doc).not.toContain("&amp;lt;");
  });

  it("leaves extraBodyHtml raw, because it is markup by contract", () => {
    // Sign-out's retry form is markup the CALLER authored, not text. Escaping it
    // would render the form as visible angle brackets, so the asymmetry is
    // deliberate — and named here so nobody "fixes" it later.
    const doc = interstitialDocument({
      title: "t",
      heading: "h",
      body: "b",
      extraBodyHtml: '<form method="POST"><button type="submit">Retry</button></form>',
    });
    expect(doc).toContain('<form method="POST">');
    expect(doc).toContain('<button type="submit">Retry</button>');
  });
});

describe("every hand-built auth document uses it", () => {
  // Source-level, and deliberately so: these builders are module-private inside
  // route files that need env and a request to invoke. What is checked is not
  // "the string appears somewhere" but that each route IMPORTS the shared module
  // and no longer hand-rolls its own <head> — a route that kept its own would
  // silently keep its serif.
  const ROUTES = [
    "app/api/auth/google/start/route.ts",
    "app/api/auth/picker-bootstrap/route.ts",
    "app/auth/callback/route.ts",
    "app/auth/sign-out/route.ts",
  ];

  it.each(ROUTES)("%s imports the shared document builder", async (rel) => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(rel, "utf8");
    expect(src).toContain("interstitialDocument");
    // No hand-rolled head survives: the duplicated <head> is what let three of
    // the four drift away from the fourth in the first place.
    expect(src).not.toContain('<meta charset="utf-8">');
  });
});
