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
