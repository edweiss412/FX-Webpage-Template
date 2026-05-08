/**
 * The sign-in CTA submits to a server Route Handler so the Supabase PKCE
 * verifier cookie is written from the HTTP response with HttpOnly attributes.
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
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        Sign in with Google
      </button>
    </form>
  );
}
