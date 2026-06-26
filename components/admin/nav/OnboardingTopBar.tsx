/**
 * components/admin/nav/OnboardingTopBar.tsx (Onboarding UX Polish — Task 1)
 *
 * Slim admin chrome shown during first-run onboarding in place of the full
 * <AdminNav>. The setup wizard owns the whole screen and the nav tabs point at
 * destinations that do not meaningfully exist yet, so they are suppressed; this
 * bar keeps only the FXAV wordmark (left) and the admin identity + a sign-out
 * control (right).
 *
 * Server Component (no 'use client') — `email` is passed in from the layout.
 * The wordmark reuses the exact icon + "FXAV" treatment from <AdminNav> (the
 * brand block, AdminNav.tsx:54-71) minus the navigational <Link> wrapper (there
 * is nowhere to navigate during onboarding). Sign out reuses <UserMenu>'s
 * mechanism: a real POST form to the POST-only /auth/sign-out route
 * (app/auth/sign-out/route.ts; a GET would 405). Tokens only (DESIGN.md).
 */
import Image from "next/image";

export function OnboardingTopBar({ email }: { email: string }) {
  const hasEmail = email.trim().length > 0;

  return (
    <header
      data-testid="onboarding-top-bar"
      // Mirrors the <AdminNav> top-bar rhythm (AdminNav.tsx:52): a single
      // border-b rule, the same gap + bottom padding, so the slim bar sits in
      // the page at the same vertical position the full nav would.
      className="mb-4 flex items-center gap-3 border-b border-border pb-3"
    >
      <div className="flex items-center gap-2">
        <Image
          src="/brand/fxav-icon.png"
          alt=""
          aria-hidden
          width={28}
          height={28}
          className="size-7 shrink-0"
        />
        <span className="text-lg font-semibold tracking-tight text-text-strong">FXAV</span>
        <span className="rounded-pill border border-border bg-surface-raised px-2 text-xs font-semibold text-text-subtle">
          Setup
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {hasEmail && (
          <span className="hidden max-w-[12rem] truncate text-sm text-text-subtle sm:inline">
            {email}
          </span>
        )}
        <form method="post" action="/auth/sign-out" data-testid="onboarding-signout-form">
          <button
            type="submit"
            className="inline-flex min-h-tap-min items-center rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
