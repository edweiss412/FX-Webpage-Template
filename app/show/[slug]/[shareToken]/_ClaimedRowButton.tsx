"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
}: {
  name: string;
  /** `role` is `text not null`; the realizable "no role" input is `""`, never null. */
  role: string;
  crewMemberId: string;
  lockHint: string;
  rowClassName: string;
  chipClassName: string;
}) {
  const [pending, setPending] = useState(false);

  // A bfcache restore returns the page with its DOM and React state intact
  // rather than remounting, so without this the restored row would still read
  // as busy. Not a designed state — the recovery path for a back-navigation.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <button
      type="submit"
      data-testid="picker-roster-row"
      data-claimed="true"
      data-crew-member-id={crewMemberId}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      className={`${rowClassName} aria-disabled:bg-surface-sunken aria-disabled:cursor-default`}
      onClick={(event) => {
        if (pending) {
          // Both statements are required: aria-disabled does not stop
          // activation, and returning does not cancel the default submit.
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
    >
      <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
        {/* Fixed-width slot shared by the lock and the spinner, so swapping one
            for the other cannot shift the name horizontally. */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {pending ? (
            <Loader2
              aria-hidden="true"
              data-testid="picker-row-spinner"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <span data-testid="picker-row-lock" aria-label={lockHint} className="text-text-subtle">
              {/* Plain unicode lock — DESIGN.md §8 ratifies lucide-react but the
                  picker row's restraint rules out icon-as-image; a 16px glyph
                  matches the type rhythm here. */}
              🔒
            </span>
          )}
        </span>
        <span className="truncate">{name}</span>
      </span>
      {pending ? (
        <span
          data-testid="picker-role-chip"
          className={`${chipClassName} whitespace-nowrap`}
          // R4: renders even when `role` is empty — in that case it is the only
          // right-side signal that the tap landed.
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
    </button>
  );
}
