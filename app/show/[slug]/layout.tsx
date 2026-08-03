/**
 * app/show/[slug]/layout.tsx — page chrome for the per-show crew page (Task
 * 4.2 layout shell, plan lines 188-194).
 *
 * Wires up:
 *   1. The min-h-screen flex column container so the footer's `mt-auto`
 *      anchors to the viewport bottom on short pages — the §8.4 sticky-vs-
 *      flow rule (plan line 191).
 *
 *   2. `prefers-color-scheme` honoring on first paint — handled entirely
 *      in `app/globals.css` (the @media block at lines 141-165). No
 *      client-side hydration needed at this milestone; the future theme
 *      toggle (M9 polish) will write `[data-theme="dark"|"light"]` to
 *      <html> via a client island, and the existing CSS rules already
 *      respect that override.
 *
 * NO FONT LOADER HERE. This file used to call `Inter()` from
 * `next/font/local` itself, which bound the DESIGN.md §2.1 family for the
 * crew subtree ONLY — every other tree (admin, auth, help) rendered the
 * system fallback. The loader now lives at `app/fonts.ts`, shared by both
 * of Next 16's roots, so all trees inherit one family. Re-adding a loader
 * here fails `tests/assets/singleFontLoader.test.ts`, which pins the loader's
 * path rather than merely counting loaders — a count cannot tell "one loader,
 * at the root" from "one loader, in the wrong layout", which was exactly this
 * file's bug.
 *
 * Server Component. No `'use client'`.
 */
import type { ReactNode } from "react";

export default function ShowLayout({ children }: { children: ReactNode }) {
  return (
    // The page-shell is the outermost surface the e2e test queries. Tagged
    // here (not on <body>) because Next.js doesn't allow nested route layouts
    // to render their own <html>/<body>. min-h-screen + flex column makes
    // the footer's mt-auto behave per the §8.4 sticky-vs-flow rule.
    <div data-testid="page-shell" className="flex min-h-screen flex-col bg-bg text-text">
      {children}
    </div>
  );
}
