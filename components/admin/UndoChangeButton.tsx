// Phase 6 T6.3 + P6-F1 — UndoChangeButton (form-action submit-safe + typed-failure
// surfacing).
//
// A <form action={...}> driven by useActionState so the undo action's typed
// result is CAPTURED (not discarded). The submit button disables/aria-busy on the
// useActionState `pending` flag ONLY — NEVER a synchronous onClick self-disable,
// which cancels the React 19 form-action dispatch (0 POSTs, strands on "Undoing…";
// feedback_react_form_action_synchronous_disable_cancels_submit, the B1 "revoke
// hang" precedent).
//
// P6-F1: undo_change can fail typed (UNDO_SUPERSEDED / UNDO_EMAIL_CLAIMED /
// UNDO_NOT_FOUND) — e.g. a stale tab / double-submit. On {ok:false, code} the
// component renders <ErrorExplainer> (catalog copy via lib/messages; NO raw code
// in the DOM — invariant 5), mirroring how Mi11GateActions surfaces Approve/Reject
// failures. On {ok:true} the page revalidation flips the row to undone.
//
// The changeLogId is carried verbatim as a hidden field (PF14 — the value Phase 5
// populated on entry.changeLogId, never re-derived); the bound undo action reads
// it from FormData and delegates to undo_change.
"use client";
import { useActionState, useCallback, useContext } from "react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { UndoAnnounceContext, undoneAnnouncement } from "@/components/admin/undoAnnounceContext";

export type UndoButtonResult = { ok: true } | { ok: false; code: string };

type UndoServerAction = (
  prev: UndoButtonResult | null,
  formData: FormData,
) => UndoButtonResult | Promise<UndoButtonResult>;

function SubmitButton({
  pending,
  label,
  stretch,
  quiet,
}: {
  pending: boolean;
  label: string;
  stretch: boolean;
  quiet: boolean;
}) {
  // Quiet = a recessive/secondary treatment (borderless, transparent fill) so the
  // reverting action reads as clearly secondary next to a bordered Accept — the
  // consequential control must not be a visual twin of the safe one. Text stays
  // text-strong (actionable contrast), differentiation is by weight, not hue.
  const frame = quiet
    ? "border border-transparent bg-transparent"
    : "border border-text-faint bg-surface";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="change-feed-undo"
      {...(quiet ? { "data-quiet": "" } : {})}
      className={`min-h-tap-min min-w-tap-min rounded-sm ${frame} px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60${stretch ? " w-full" : ""}`}
    >
      {pending ? "Undoing…" : label}
    </button>
  );
}

export function UndoChangeButton({
  changeLogId,
  undoAction,
  stretch = false,
  quiet = false,
  announceLabel,
}: {
  changeLogId: string;
  // The bound undo server action; returns a typed UndoButtonResult so the typed
  // failure can be surfaced post-submit (P6-F1).
  undoAction: UndoServerAction;
  // When true, the form + button fill their container width (grid-cell layout).
  // Default false preserves the intrinsic-width per-show feed rendering.
  stretch?: boolean;
  // When true, renders a recessive/secondary treatment (see SubmitButton). Default
  // false keeps the standard bordered button for the per-show feed page.
  quiet?: boolean;
  // The row's summary, announced on success. Omitted → the bare sentence.
  announceLabel?: string;
}) {
  // Announce from INSIDE the action's async continuation, not from an effect.
  // On success this component unmounts (canUndo goes false once the row leaves
  // status='applied' — shapeChangeFeed.ts:65), and an effect scheduled on that
  // commit is not guaranteed to run. An already-executing continuation always
  // finishes, and it closes over the PROVIDER's announce, not this instance.
  const { announce } = useContext(UndoAnnounceContext);
  const announcingAction = useCallback<UndoServerAction>(
    async (prev, formData) => {
      const r = await undoAction(prev, formData);
      if (r.ok) announce(undoneAnnouncement(announceLabel));
      return r;
    },
    [undoAction, announce, announceLabel],
  );
  const [result, dispatch, pending] = useActionState(announcingAction, null);
  const failing = result && result.ok === false ? result : null;

  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch} className={stretch ? "w-full" : undefined}>
        <input type="hidden" name="changeLogId" value={changeLogId} />
        <SubmitButton pending={pending} label="Undo this change" stretch={stretch} quiet={quiet} />
      </form>
      {/* ALWAYS mounted, so the card's appearance is a TEXT CHANGE inside a live
          region rather than a node insertion — a conditionally inserted region is
          the classic not-announced pitfall (DESIGN.md:479). sr-only when idle is
          position:absolute, so it is not a flex item and adds no phantom gap to
          the parent's gap-2. */}
      <div
        data-testid="change-feed-undo-result"
        role="status"
        className={
          failing
            ? "rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
            : "sr-only"
        }
      >
        {failing ? <ErrorExplainer code={failing.code} surface="admin" /> : null}
      </div>
    </div>
  );
}
