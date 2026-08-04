/**
 * lib/auth/interstitialDocument.ts — the one hand-built auth error document.
 *
 * Four route handlers return a complete `<html>` string rather than rendering
 * through React: the Google-auth start (503), the picker bootstrap (403/502),
 * the auth callback (503), and sign-out (500). Neither Next root renders them,
 * so neither the font loader's generated class nor the app stylesheet reaches
 * them. Three of the four carried charset/title/viewport and nothing else, and
 * fell to browser-default serif — a typeface nobody chose, on the pages a user
 * sees at their least forgiving moment.
 *
 * **Why a declaration and not a delivery mechanism** (BL-AUTH-INTERSTITIAL-FONT).
 * The entry framed this as a choice between inlining `@font-face` into each
 * document — a SECOND font-delivery mechanism, the same objection that keeps
 * `BL-HARNESS-FONT-FIDELITY` open — and routing the four through React, a far
 * larger change to auth plumbing than a font justifies. Its own sibling had
 * already taken a third path: sign-out inlines a `<style>` block naming a system
 * stack. That declares a typeface without shipping one. Zero external assets, no
 * React, nothing new to keep in sync with the app's real font pipeline.
 *
 * That constraint is load-bearing rather than incidental. These documents are
 * reached BECAUSE a request already failed, so a webfont would add a first
 * network dependency at the worst possible moment. Nothing here may ever emit a
 * `<link>`, an `@import`, an `@font-face`, or a `<script>`; the suite asserts all
 * four absences, and they are the half of it that matters.
 *
 * This is deliberately NOT a general "error pages avoid webfonts" principle —
 * the app's own fatal-error page binds the real font, and should. It is a rule
 * about documents that must stand alone with no runtime behind them.
 */

/**
 * The sign-out precedent's style block, now shared by all four.
 *
 * Kept as one string rather than composed per-caller because a shared
 * DECLARATION is the entire point: four documents that each spell their own
 * chrome are four documents that drift, which is how three of them lost the
 * font in the first place. The `button` rule is unused by the three that have no
 * form, and that is fine — an unused selector costs nothing, while a fifth
 * variant of "roughly this styling" costs the consistency this exists to hold.
 */
export const INTERSTITIAL_STYLE = [
  "body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;max-width:32rem;margin-inline:auto;color:#1a1a1a}",
  "h1{font-size:1.5rem;margin:0 0 1rem}",
  "p{margin:0 0 1rem}",
  "form{margin:1rem 0 0}",
  "button{font:inherit;padding:.6rem 1rem;border:1px solid #999;background:#f5f5f5;border-radius:.375rem;cursor:pointer}",
].join("");

export type InterstitialDocument = {
  /** `<title>` — what a tab and a screen reader announce first. */
  title: string;
  /** The `<h1>`. Usually the same words as the title, and separate so it can differ. */
  heading: string;
  /** The catalog copy. Never a raw error code (AGENTS.md invariant 5). */
  body: string;
  /**
   * Markup appended after the copy, inside `<body>` — sign-out's retry form is
   * the only current caller. Omitted emits nothing at all rather than an empty
   * wrapper, so the three form-less documents stay byte-minimal.
   */
  extraBodyHtml?: string;
};

/** A complete standalone HTML document: no external assets, no scripts, no React. */
export function interstitialDocument({
  title,
  heading,
  body,
  extraBodyHtml,
}: InterstitialDocument): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>",
    INTERSTITIAL_STYLE,
    "</style>",
    "</head>",
    "<body>",
    `<h1>${heading}</h1>`,
    `<p>${body}</p>`,
    ...(extraBodyHtml ? [extraBodyHtml] : []),
    "</body>",
    "</html>",
  ].join("");
}
