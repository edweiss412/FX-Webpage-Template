"use client";

/**
 * components/admin/UnarchiveShowButton.tsx (M12.2 Phase B2 Task 6.2 — spec
 * §3.1 / §2.3).
 *
 * One-tap Unarchive control rendered inside each read-only ArchivedShowRow.
 * Unarchive is SAFE (it exposes nothing — the show lands in Held, which is
 * crew-unreachable via the `!published` gate, §1/§2.3), so there is no two-tap
 * confirm: a single tap dispatches.
 *
 * Server-action contract (Phase 7 supplies the implementation):
 *
 *   unarchiveAction(showId: string): Promise<void>
 *
 * Phase 7 builds `app/admin/show/[slug]/_actions/unarchive.ts` (a `"use
 * server"` action that `requireAdmin()` → resolves slug→show_id → invokes the
 * existing `lib/showLifecycle/unarchiveShow` caller). This button receives that
 * action (already bound to a `showId` by the row) via the `unarchiveAction`
 * prop and posts to it through a `<form action>` so the React 19 form-action
 * dispatch fires. On success the action revalidates / refreshes and the row
 * relocates from the Archived to the Active segment on the next render.
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): the submit button must
 * NOT setState-disable itself synchronously in its own onClick — that cancels
 * the form-action dispatch (0 POSTs, stranded on the pending label). Instead it
 * is a plain `type="submit"` button and disables ONLY on
 * `useFormStatus().pending`, which React flips AFTER the dispatch begins and
 * clears automatically when the action returns (even on failure — no stuck
 * "Unarchiving…" control, no required reload).
 */
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type UnarchiveShowButtonProps = {
  /** `shows.id` of the archived show this button unarchives. */
  showId: string;
  /**
   * share-hub: reports the submit-pending LEVEL to a host that gates its own
   * dismissal on in-flight children (the ShareHub popover). Optional — the
   * archived dashboard row passes nothing.
   */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Phase-7 server action, already scoped to this show. Called with `showId`
   * on submit. Typed as a no-arg-or-showId thunk so the row can pass either a
   * pre-bound action or one that reads `showId`.
   */
  unarchiveAction: (showId: string) => Promise<void>;
};

function SubmitButton({
  showId,
  onBusyChange,
}: {
  showId: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onBusyChange?.(pending);
    return () => {
      if (pending) onBusyChange?.(false);
    };
  }, [pending, onBusyChange]);
  return (
    <button
      type="submit"
      data-testid={`unarchive-show-button-${showId}`}
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-tap-min items-center justify-center self-center rounded-sm border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface"
    >
      {pending ? "Unarchiving…" : "Unarchive"}
    </button>
  );
}

export function UnarchiveShowButton({
  showId,
  unarchiveAction,
  onBusyChange,
}: UnarchiveShowButtonProps) {
  // The action returns void, so a failure has no result to branch on — only a
  // rejection. Without this the button simply reverts to "Unarchive" and
  // NOTHING is shown or announced. That was tolerable in the archived dashboard
  // row, where the row's continued presence was itself the signal; in the hub
  // popover this control is Unarchive's only home, so silence is the entire
  // feedback (impeccable audit P2). Mirrors ArchiveShowButton's generic branch:
  // plain-language retry prose, never a raw code (invariant 5).
  const [failed, setFailed] = useState(false);

  // The form action is a thin closure so the button stays a child of <form>
  // (useFormStatus requires that). The closure calls the Phase-7 action with
  // this row's showId.
  return (
    <div className="flex flex-col items-start gap-2">
      <form
        action={async () => {
          setFailed(false);
          try {
            await unarchiveAction(showId);
          } catch {
            setFailed(true);
          }
        }}
        className="flex"
      >
        <SubmitButton showId={showId} {...(onBusyChange ? { onBusyChange } : {})} />
      </form>

      {failed ? (
        <p
          role="alert"
          data-testid={`unarchive-show-error-${showId}`}
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          Unarchiving didn&rsquo;t go through. Try again in a moment; if it keeps failing, contact
          the developer.
        </p>
      ) : null}
    </div>
  );
}
