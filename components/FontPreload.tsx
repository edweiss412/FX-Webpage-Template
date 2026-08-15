/**
 * The `<link rel="preload">` for the one committed face.
 *
 * SHARED BY BOTH NEXT ROOTS, and that is the point. `app/global-error.tsx`
 * renders its own `<html>` and REPLACES the root layout, so anything the root
 * sets up is absent there. The framework font loader used to preload by default
 * and both roots inherited it through the shared loader instance; a hand-written
 * link in `app/layout.tsx` alone silently dropped the crash screen -- exactly
 * the second-root gap `BL-HEADER-FONT-FALLBACK-WRAP` was filed against, one
 * mechanism later.
 *
 * WHY PRELOAD AT ALL: without the hint the browser discovers the font only
 * after CSSOM, lengthening the interval where text renders in the fallback.
 * No runtime test can observe that -- every screenshot path and
 * `tests/e2e/font-binding.spec.ts` await `document.fonts.ready`, so none of them
 * can see discovery latency -- which is why it is pinned statically instead.
 *
 * `crossOrigin` is the JSX spelling; raw `crossorigin` fails typecheck against
 * React's `LinkHTMLAttributes`.
 */
export function FontPreload() {
  return (
    <link
      rel="preload"
      as="font"
      type="font/woff2"
      href="/fonts/InterVariable-latin.d5549562.woff2"
      crossOrigin="anonymous"
    />
  );
}
