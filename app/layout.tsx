import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GlobalErrorListener } from "@/components/observe/GlobalErrorListener";

/*
 * The app's single type family, per DESIGN.md §2.1: "single contemporary sans
 * for all UI. One family, no display/body pairing. Loaded via `next/font/google`
 * in `app/layout.tsx`." This is that wiring.
 *
 * It lives at the ROOT because the font must reach every tree. It previously
 * lived in `app/show/[slug]/layout.tsx`, which bound Inter for the crew subtree
 * only — admin, auth and help rendered the system fallback, measured on real
 * routes at 187.28px against Inter's 168.91px for the same string. On a client
 * with none of the six named stack entries (a bare Linux install, which is what
 * a CI runner is) that fallback goes all the way to DejaVu Sans, which is wide
 * enough to wrap labels that fit under Inter. See BL-HEADER-FONT-FALLBACK-WRAP.
 *
 * WHAT BINDS IT: not the `variable` class below, which only defines the
 * `--font-inter` token. Binding happens because next/font registers the face
 * under the LITERAL family name `Inter` (verified against the generated CSS —
 * Next 16 does not hash it), and `app/globals.css` names that literal first in
 * `--font-sans`, applied at `html`. `tests/e2e/font-binding.spec.ts` pins the
 * result by measuring rendered text, so a future Next release that starts
 * hashing the family name fails loudly instead of silently degrading.
 *
 * `--font-inter` is exposed here rather than lower down because `<html>` is the
 * widest scope available: the token should not be narrower than the font it
 * names. Nothing consumes it today; it stays for inline use, and is pinned by
 * the same spec so it cannot vanish unnoticed.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FXAV Crew Pages",
  description: "Per-show, per-crew-member webpages.",
};

/*
 * No-FOUC theme bootstrap. Runs synchronously, BEFORE React hydrates
 * and BEFORE any CSS-driven paint, so the user never sees a flash of
 * the wrong theme on hard reload. Reads localStorage['fxav-theme']
 * (written by components/layout/ThemeToggle.tsx) and stamps
 * `<html data-theme="light|dark">` so globals.css's
 * `[data-theme="dark"]` and `:root:not([data-theme="light"])` rules
 * resolve to the right runtime variables on first paint.
 *
 * When no value is stored, the dataset stays unset — globals.css
 * already honors `@media (prefers-color-scheme: dark)` for that path
 * (line 170-195), satisfying the PRODUCT.md "respect
 * prefers-color-scheme on first paint" commitment.
 *
 * SECURITY: the IIFE source is a hardcoded module constant — no user
 * input, no template interpolation, no externally-derived value. The
 * only data it READS is localStorage['fxav-theme'], and the only
 * value it WRITES is to a dataset attribute, AFTER explicitly
 * checking equality against the literal allowlist {'light','dark'}.
 * This is the industry-standard no-FOUC pattern (next-themes,
 * theme-ui, Remix docs all ship this same shape). dangerouslySetInnerHTML
 * is unavoidable: a regular <script> with text children is not
 * guaranteed to execute synchronously before hydration in Next.js 16.
 *
 * `suppressHydrationWarning` on <html> silences React's warning about
 * the dataset attribute the script set pre-hydration but the server
 * rendered without.
 */
// Stamps `data-theme` UNCONDITIONALLY: localStorage value if present, else
// derived from matchMedia (`prefers-color-scheme: dark` → 'dark', else
// 'light'). After this script runs, `document.documentElement.dataset.theme`
// is ALWAYS one of the allowlisted values, so the ThemeToggle component's
// post-mount read can rely on dataset alone (no fallback path). This makes
// the post-mount sync deterministic across all four visitor cases (OS-light,
// OS-dark, stored-light, stored-dark) per the theme-toggle code-quality
// review. Note: the SSR placeholder icon (Moon) still flips to Sun on first
// paint for visitors whose resolved theme is 'dark', which is unavoidable in
// this pattern (SSR doesn't see localStorage or matchMedia). The
// `suppressHydrationWarning` on the icon span silences that.
const NO_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem('fxav-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />
        <GlobalErrorListener />
        {children}
      </body>
    </html>
  );
}
