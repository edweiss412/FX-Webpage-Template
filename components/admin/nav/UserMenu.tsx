"use client";

/**
 * components/admin/nav/UserMenu.tsx (M12.2 B1 Task 3.3)
 *
 * Avatar button → popover with the admin identity (email primary line)
 * and a Sign out control. Sign out is a real POST form to
 * /auth/sign-out — the route is POST-only (app/auth/sign-out/route.ts:89;
 * GET returns 405), so a Link/GET would dead-end. The form is same-origin
 * (relative action), satisfying the route's same-origin guard.
 *
 * Open/close state is local; the popover closes on backdrop click and on
 * route change (usePathname effect). Initials derive from the email
 * local-part tokens (split on `.`/`_`/`+`), uppercased, max 2. Empty email
 * → neutral "•" avatar with Sign out only (guard for partial/missing
 * identity).
 *
 * Tokens only; the popover uses the `route-enter` class (app/globals.css,
 * with a prefers-reduced-motion guard) for its entrance.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function deriveInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const tokens = local.split(/[._+]/).filter(Boolean);
  const initials = tokens
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "•";
}

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change — legitimate external-state sync, not a derived-state cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const initials = deriveInitials(email);
  const hasEmail = email.trim().length > 0;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="admin-user-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-pill border border-border bg-surface text-sm font-semibold text-text-subtle transition-colors duration-fast hover:border-border-strong hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      {open && (
        <>
          {/* Backdrop — click anywhere outside closes the popover. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            data-testid="admin-user-menu"
            className="route-enter absolute right-0 z-20 mt-2 w-56 rounded-md border border-border bg-surface-raised p-2 shadow-lg"
          >
            {hasEmail && (
              <div className="border-b border-border px-2 pb-2">
                <p className="truncate text-sm font-semibold text-text-strong">{email}</p>
              </div>
            )}
            <form
              method="post"
              action="/auth/sign-out"
              data-testid="admin-user-signout-form"
              className={hasEmail ? "pt-2" : ""}
            >
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-tap-min w-full items-center rounded-sm px-2 text-left text-sm text-text transition-colors duration-fast hover:bg-surface hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
