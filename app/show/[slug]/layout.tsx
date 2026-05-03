/**
 * app/show/[slug]/layout.tsx — page chrome for the per-show crew page (Task
 * 4.2 layout shell, plan lines 188-194).
 *
 * Wires up:
 *   1. Inter via next/font/google with `variable: '--font-inter'` so the
 *      DESIGN.md §2.1 single-family commitment is enforced at the chrome
 *      level. The `--font-inter` variable is exposed on the body wrapper;
 *      `app/globals.css` already maps `--font-sans` to "Inter, ..." so
 *      every component that reads the body's inherited font-family gets
 *      Inter for free. Including the variable here also makes it usable
 *      inline (e.g., `font-[var(--font-inter)]` if a future component
 *      needs to escape a font override).
 *
 *   2. The min-h-screen flex column container so the footer's `mt-auto`
 *      anchors to the viewport bottom on short pages — the §8.4 sticky-vs-
 *      flow rule (plan line 191).
 *
 *   3. `prefers-color-scheme` honoring on first paint — handled entirely
 *      in `app/globals.css` (the @media block at lines 141-165). No
 *      client-side hydration needed at this milestone; the future theme
 *      toggle (M9 polish) will write `[data-theme="dark"|"light"]` to
 *      <html> via a client island, and the existing CSS rules already
 *      respect that override.
 *
 * Server Component. No `'use client'`.
 */
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function ShowLayout({ children }: { children: ReactNode }) {
  return (
    // The page-shell is the outermost surface the e2e test queries. Tagged
    // here (not on <body>) because Next.js doesn't allow nested route layouts
    // to render their own <html>/<body>. min-h-screen + flex column makes
    // the footer's mt-auto behave per the §8.4 sticky-vs-flow rule.
    <div
      data-testid="page-shell"
      className={`${inter.variable} flex min-h-screen flex-col bg-bg text-text`}
    >
      {children}
    </div>
  );
}
