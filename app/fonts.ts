/**
 * The app's single type family, per DESIGN.md §2.1: "single contemporary sans
 * for all UI. One family, no display/body pairing. Loaded via `next/font/google`
 * in `app/fonts.ts`." (That line named `app/layout.tsx` until 2026-08-03; it was
 * amended in lockstep with this module, for the two-root reason below.)
 *
 * WHY THIS IS ITS OWN MODULE rather than living in `app/layout.tsx`. Next 16 has
 * two roots, not one: `app/global-error.tsx` renders its OWN `<html>` and
 * REPLACES the root layout, so anything the root layout sets up is absent on the
 * crash screen. It already re-imports `./globals.css` for exactly that reason.
 * The font has the same shape of problem, and a second `Inter()` call there
 * would emit a second `@font-face` set under the same family name. One loader
 * call, exported, consumed by both roots, is the only shape that satisfies both.
 *
 * WHAT BINDS THE FONT: `--font-sans` consumes `var(--font-inter)`, the token
 * `inter.variable` defines, so the binding follows whatever family next/font
 * generates rather than any name spelled in CSS. (Next 16 happens to use the
 * literal `Inter`, verified against the generated CSS, but nothing depends on
 * that.) `tests/e2e/font-binding.spec.ts` measures rendered text width against
 * the family READ FROM THAT TOKEN, so a future release that hashes the name
 * still passes while a genuinely unbound tree still fails.
 *
 * `--font-inter` carries BOTH `Inter` and next/font's generated, metric-matched
 * `Inter Fallback` — which is why `--font-sans` consumes this token rather than
 * naming `Inter` literally. See the note at that token in `app/globals.css`.
 */
import { Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
