"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { PENDING_TIMEOUT_MS } from "@/components/shared/pendingTimeout";

/**
 * The claimed roster row's submit button, extracted to a client island so it
 * can show a pending state while sign-in travels to Google.
 *
 * WHY NOT `useFormStatus` (spec §3.4, R8). The enclosing form is a NATIVE GET
 * (`action="/auth/sign-in" method="GET"`), not a Server Action. React only
 * reports pending when it owns the submission, i.e. when `action` is a
 * function. Measured before this was written:
 *
 *     NATIVE_GET=false        FUNCTION_ACTION=true
 *
 * A `useFormStatus` implementation here would return false for the entire
 * OAuth journey and the affordance would never appear. Do not "simplify" this
 * back to the admin idiom — `pickerAffordance.test.tsx` fails if you do.
 *
 * WHY LOCAL STATE IS SAFE HERE. `components/admin/RetryWatchButton.tsx:8-9`
 * forbids a local pending flag because a Server Action can return without
 * revalidating, leaving the flag stuck. That failure mode does not exist for a
 * full-page navigation, which destroys this component outright. The bfcache
 * exception is why `pageshow` resets below.
 *
 * WHY `aria-disabled` AND `preventDefault`, not the `disabled` attribute
 * (spec §3.5/§3.6). A natively disabled button leaves the focusable set, so a
 * keyboard user loses their place the instant the row goes busy. But
 * `aria-disabled` does not block activation, and an early `return` does not
 * cancel a submit button's default action — measured `submits=2` for an early
 * return alone, `1` with `preventDefault`. Both halves are load-bearing.
 */

export function ClaimedRowButton({
  name,
  role,
  crewMemberId,
  lockHint,
  rowClassName,
  chipClassName,
  chipBaseClassName,
}: {
  name: string;
  /** `role` is `text not null`; the realizable "no role" input is `""`, never null. */
  role: string;
  crewMemberId: string;
  lockHint: string;
  rowClassName: string;
  /** Idle chip classes, including its own fill. */
  chipClassName: string;
  /** Shape only — no fill, no text colour. The pending chip composes from this. */
  chipBaseClassName: string;
}) {
  const [pending, setPending] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPendingTimeout() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  // A bfcache restore returns the page with its DOM and React state intact
  // rather than remounting, so without this the restored row would still read
  // as busy. Not a designed state — the recovery path for a back-navigation.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // Clearing the timer matters as much as clearing the flag: a restore that
      // leaves the old timeout live lets its callback fire against a LATER
      // activation and drop that pending early (whole-diff R2 P1).
      clearPendingTimeout();
      setPending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => clearPendingTimeout, []);

  return (
    <>
      <button
        type="submit"
        data-testid="picker-roster-row"
        data-claimed="true"
        data-crew-member-id={crewMemberId}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className={`${rowClassName} aria-disabled:cursor-default aria-disabled:bg-surface-sunken`}
        onClick={(event) => {
          if (pending) {
            // Both statements are required: aria-disabled does not stop
            // activation, and returning does not cancel the default submit.
            event.preventDefault();
            return;
          }
          setPending(true);
          clearPendingTimeout();
          timeoutRef.current = setTimeout(() => setPending(false), PENDING_TIMEOUT_MS);
        }}
      >
        <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
          {/* Fixed-width slot shared by the lock and the spinner, so swapping
              one for the other cannot shift the name horizontally. */}
          <span className="flex size-4 shrink-0 items-center justify-center">
            {pending ? (
              <Loader2
                aria-hidden="true"
                data-testid="picker-row-spinner"
                // Stops spinning under prefers-reduced-motion, rather than
                // hiding. The critique flagged a frozen arc as reading "stuck";
                // hiding it is worse here, because the chip text is then the
                // ONLY signal and the crew-e2e suite runs its whole context
                // under reduce, so a hidden spinner also blinds every geometry
                // oracle. The chip already carries the words, so the frozen
                // glyph is a second signal, not the only one. Disposition
                // recorded in the plan §12.
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <>
                {/* Decorative to AT — aria-label on a span with an implicit
                    generic role is dropped (ARIA 1.2), so the hint rides a
                    visually-hidden sibling instead. */}
                <span data-testid="picker-row-lock" aria-hidden="true" className="text-text-subtle">
                  {/* Plain unicode lock — DESIGN.md §8 ratifies lucide-react but
                      the picker row's restraint rules out icon-as-image; a 16px
                      glyph matches the type rhythm here. */}
                  🔒
                </span>
                <span className="sr-only">{lockHint}</span>
              </>
            )}
          </span>
          <span className="truncate">{name}</span>
        </span>

        {/* Right column keeps a reserved minimum so the name does not gain and
            then lose width when the chip swaps in (critique P2). */}
        <span className="flex min-w-24 shrink-0 justify-end">
          {pending ? (
            <span
              data-testid="picker-role-chip"
              // Composed from the BASE, never from chipClassName: that string
              // already carries bg-surface-sunken/text-text-subtle, and the
              // generated Tailwind order makes them win wherever they sit in
              // the class attribute — the fill simply would not render
              // (whole-diff R2 P1). The idle chip is surface-sunken on a
              // surface-sunken row, 1.00:1; the pending chip is the
              // load-bearing signal, so it carries its own fill AND a boundary:
              // text 4.91:1 light / 8.03:1 dark, border 5.02:1 / 8.21:1.
              className={`${chipBaseClassName} whitespace-nowrap border border-accent-on-bg bg-accent-tint text-accent-on-bg`}
            >
              Signing in…
            </span>
          ) : (
            role && (
              <span data-testid="picker-role-chip" className={chipClassName}>
                {role}
              </span>
            )
          )}
        </span>
      </button>

      {/* OUTSIDE the button on purpose. aria-busy alone is weakly supported, so
          the transition is announced — but ARIA lets AT ignore descendant
          changes while an ancestor is aria-busy, and this region would be that
          descendant (whole-diff R2 P1). */}
      <span
        data-testid="picker-row-announcement"
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {pending ? `Signing in as ${name}` : ""}
      </span>
    </>
  );
}
