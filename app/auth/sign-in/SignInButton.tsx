/**
 * The sign-in CTA submits to a server Route Handler so the Supabase PKCE
 * verifier cookie is written from the HTTP response with HttpOnly attributes.
 *
 * M9 C5 / M5-D4: button carries the official Google G mark on the left of
 * the canonical "Sign in with Google" text. The G asset
 * (`public/brand/google-g.svg`) is the unmodified 40×40 SVG from Google's
 * official signin-assets.zip bundle (Web > svg > light > web_light_rd_na).
 * Google's brand guidelines require the mark to render unmodified at its
 * native aspect ratio — we render at 20px square with the original viewBox.
 * The button text uses one of Google's approved verbatim phrasings
 * (Sign in / Sign up / Continue with Google).
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
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
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
