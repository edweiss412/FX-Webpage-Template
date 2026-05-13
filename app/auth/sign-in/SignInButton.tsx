/**
 * The sign-in CTA submits to a server Route Handler so the Supabase PKCE
 * verifier cookie is written from the HTTP response with HttpOnly attributes.
 *
 * M9 C5 / M5-D4 (R1 BLOCKER fix): button styled as Google's "Light"
 * theme per the current brand guidelines — white background, dark text,
 * gray border. The G mark on the left is the unmodified 40×40 SVG from
 * Google's official signin-assets.zip bundle (Web → svg → light →
 * web_light_rd_na). Google's brand guidelines forbid placing the
 * standard color G on a non-prescribed colored button (the previous
 * FXAV-accent variant violated that constraint). FXAV brand identity
 * lives in the wordmark above the headline, not on the OAuth CTA.
 * The button text uses Google's approved verbatim "Sign in with
 * Google" phrasing.
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
        // Google "Light" theme: white surface (#fff) + #1f1f1f text +
        // #747775 1px border + ≥40px height + medium-weight Roboto-
        // equivalent (project Inter is metric-compatible). The
        // `text-[#1f1f1f]` and `border-[#747775]` are pinned per
        // Google's hex specs — not project tokens — so the button
        // stays brand-compliant regardless of theme-token drift.
        className="inline-flex h-10 min-w-tap-min items-center justify-center gap-3 rounded-sm border border-[#747775] bg-white px-4 font-medium text-[#1f1f1f] transition-colors duration-fast hover:bg-[#f6f6f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/google-g.svg"
          alt=""
          aria-hidden="true"
          data-testid="sign-in-google-g"
          width={20}
          height={20}
          className="size-5 select-none"
        />
        Sign in with Google
      </button>
    </form>
  );
}
