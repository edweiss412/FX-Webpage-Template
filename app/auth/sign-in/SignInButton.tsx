/**
 * The sign-in CTA submits to a server Route Handler so the Supabase PKCE
 * verifier cookie is written from the HTTP response with HttpOnly attributes.
 *
 * M9 C5 / M5-D4 (R2 fix): renders Google's pre-approved Light-theme
 * Web button SVG (web_light_rd_SI from signin-assets.zip) at its
 * native 175×40 size. This is the brand-compliant choice for custom
 * apps that integrate Sign in with Google — the prior in-progress
 * variants were either (R0) on FXAV-accent background, violating the
 * standalone-G rule, or (R1) had the G rendered at 20×20 SVG which
 * effectively shrank the actual G to ~10×10 because the asset's
 * inner G fills only the center 20×20 of its 40×40 viewBox. The
 * full button asset has the G at its native bundle size; we do not
 * resize.
 *
 * The wrapping <button> handles form submission + focus ring + tap-
 * target sizing; the SVG provides the entire visual identity (white
 * surface, dark text, gray border, multicolor G). FXAV brand identity
 * lives in the wordmark above the headline.
 *
 * The image carries `alt="Sign in with Google"` (decorative chrome
 * with the text label baked in is fine here — the button's
 * accessible name comes from the wrapping <button> via aria-label).
 */
export type SignInButtonProps = {
  /**
   * The post-sign-in destination, already validated by the parent Server
   * Component via `validateNextParam`.
   */
  validatedNext: string;
};

export function SignInButton({ validatedNext }: SignInButtonProps) {
  return (
    <form data-testid="sign-in-with-google-form" action="/api/auth/google/start" method="get">
      <input type="hidden" name="next" value={validatedNext} />
      <button
        type="submit"
        data-testid="sign-in-with-google"
        aria-label="Sign in with Google"
        // Focus ring uses ring-[#1a73e8] (Google's interaction blue)
        // for ≥3:1 contrast against the white button surface (R1
        // HIGH-2 fix). Default project focus-ring (orange ~1.6:1 on
        // white) was below the 3:1 minimum.
        // min-h-tap-min: project 44px tap-target floor per DESIGN.md §3
        // (C5 R3 HIGH fix). The Google button SVG itself is 40px tall;
        // the wrapping <button> extends the hit area to ≥44px via
        // transparent padding so single-finger taps on small screens
        // always land inside the interactive region.
        className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/google-signin-button.svg"
          alt="Sign in with Google"
          data-testid="sign-in-google-button-image"
          width={175}
          height={40}
          className="block select-none"
        />
      </button>
    </form>
  );
}
