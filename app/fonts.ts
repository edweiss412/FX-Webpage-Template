/**
 * The app's single type family, per DESIGN.md §2.1: "single contemporary sans
 * for all UI. One family, no display/body pairing. Loaded via `next/font/local`
 * from the vendored binary in `app/_fonts/`." (That line named `app/layout.tsx`
 * until 2026-08-03 and `next/font/google` until the numeral-disambiguation
 * change; both were amended in lockstep with this module.)
 *
 * WHY THIS IS ITS OWN MODULE rather than living in `app/layout.tsx`. Next 16 has
 * two roots, not one: `app/global-error.tsx` renders its OWN `<html>` and
 * REPLACES the root layout, so anything the root layout sets up is absent on the
 * crash screen. It already re-imports `./globals.css` for exactly that reason.
 * The font has the same shape of problem, and a second loader call there would
 * emit a second `@font-face` set under the same family name. One loader call,
 * exported, consumed by both roots, is the only shape that satisfies both.
 *
 * WHY LOCAL RATHER THAN GOOGLE. The build Google Fonts serves has Inter's
 * character variants and stylistic sets stripped — measured 2026-08-03, the
 * latin subset carries only `calt ccmp dnom frac kern locl mark mkmk numr pnum
 * tnum` and a `wght` axis. So `app/globals.css` spent three months declaring
 * `"cv11" 1` against a font that could not honor it, rendering nothing on every
 * route. The vendored upstream release carries the full feature set plus the
 * `opsz` axis. `app/_fonts/PROVENANCE.md` records the version and checksums;
 * `tests/styles/fontFeatureAvailability.test.ts` makes a repeat of that silent
 * failure fail the build instead.
 *
 * EVERY OPTION BELOW IS LOAD-BEARING:
 *   - `weight` and `style` are emitted as `@font-face` descriptors only when
 *     passed, and `declarations` is forbidden from carrying them. Omitting
 *     `weight` on a variable font leaves the face at an implied `normal`, so the
 *     browser synthesises bold instead of using the `wght` axis. These two
 *     values reproduce exactly what the Google loader emitted before the swap.
 *   - `adjustFontFallback` is left at its default, which is ON, and for the
 *     local loader it computes its size-adjust from THIS file's own metrics
 *     rather than a static table.
 *   - `preload` is left at its default, which is `true`, matching prior
 *     behaviour. The preloaded payload grows from 47 KB to 344 KB; that cost is
 *     accepted in the spec's §2.6.
 *
 * WHAT BINDS THE FONT: `--font-sans` consumes `var(--font-inter)`, the token
 * `inter.variable` defines, so the binding follows whatever family next/font
 * generates rather than any name spelled in CSS. The local loader derives that
 * family from this module's variable name, LOWERCASED: the emitted rule is
 * `font-family:inter`, where the Google loader emitted the literal `Inter`.
 * Verified against the built CSS, and precisely why nothing may depend on a
 * literal family name. `tests/e2e/font-binding.spec.ts` measures rendered text
 * against the family READ FROM THAT TOKEN, so the rename is invisible to it
 * while a genuinely unbound tree still fails.
 *
 * `--font-inter` carries BOTH that generated family and next/font's generated,
 * size-adjusted companion — which is why `--font-sans` consumes this token
 * rather than naming a family literally. See the note at that token in
 * `app/globals.css`.
 */
import localFont from "next/font/local";

export const inter = localFont({
  src: "./_fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});
