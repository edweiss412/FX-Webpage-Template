import type { Metadata } from "next";
import "./globals.css";

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
const NO_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem('fxav-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
