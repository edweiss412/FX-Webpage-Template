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
 * WHAT ACTUALLY BINDS THE FONT: not `inter.variable`, which only defines the
 * `--font-inter` custom property. Binding happens because next/font registers
 * the face under the LITERAL family name `Inter` (verified against the generated
 * CSS — Next 16 does not hash it), and `app/globals.css` names that literal in
 * `--font-sans`, applied at `html`. `tests/e2e/font-binding.spec.ts` measures
 * rendered text width to pin that, so a future Next release that starts hashing
 * the family name fails loudly instead of silently degrading to a system font.
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
