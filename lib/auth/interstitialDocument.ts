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
  "body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;max-width:32rem;margin-inline:auto;background:#ffffff;color:#1a1a1a}",
  "h1{font-size:1.5rem;margin:0 0 1rem}",
  "p{margin:0 0 1rem}",
  "form{margin:1rem 0 0}",
  // 44px min tap target for the venue-floor phone context (PRODUCT.md), and a
  // border at #767676 rather than the #999 this block carried as sign-out's:
  // #999 measures 2.85:1 on white, under the 3:1 non-text floor. It was one
  // document's defect before; extracting the block would have made it four.
  "button{font:inherit;min-height:44px;padding:.6rem 1rem;border:1px solid #767676;background:#f5f5f5;color:#1a1a1a;border-radius:.375rem;cursor:pointer}",
  // Both schemes are first-class on this product (PRODUCT.md): a crew member
  // hitting a sign-in failure backstage at midnight should not get a full-white
  // flash. A media block costs no assets, which is the only constraint these
  // documents actually have. Values track the app's own dark surface without
  // depending on it — nothing here may import a token.
  "@media (prefers-color-scheme:dark){",
  "body{background:#0f1014;color:#e8e8ea}",
  "button{border-color:#8a8b93;background:#23242b;color:#e8e8ea}",
  "}",
].join("");

/**
 * Escape a TEXT slot for interpolation into raw HTML.
 *
 * Traced 2026-08-04: every current call site passes a string literal or
 * `messageFor(...)` catalog copy, so nothing attacker-controlled reaches this
 * builder today and this is hardening rather than a live bug. It is here because
 * the builder is a shared primitive that interpolates into raw HTML, and the
 * next caller is the one who will not check — escaping at the boundary makes a
 * future `interstitialDocument({ body: searchParams.get("reason") })` merely
 * ugly rather than an injection.
 *
 * `&` is replaced FIRST so an escape is never re-escaped into `&amp;lt;` — the
 * ordering bug every hand-rolled escaper gets wrong once.
 */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
   *
   * Emitted RAW, unlike the three text slots above, because it is markup by
   * contract rather than copy: escaping it would render sign-out's retry form as
   * visible angle brackets. The asymmetry is deliberate and asserted, so nobody
   * "fixes" it later — callers own what they put here.
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
    `<title>${escapeText(title)}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>",
    INTERSTITIAL_STYLE,
    "</style>",
    "</head>",
    "<body>",
    `<h1>${escapeText(heading)}</h1>`,
    `<p>${escapeText(body)}</p>`,
    ...(extraBodyHtml ? [extraBodyHtml] : []),
    "</body>",
    "</html>",
  ].join("");
}
