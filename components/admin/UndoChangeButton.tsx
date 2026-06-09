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
import { useActionState } from "react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";

export type UndoButtonResult = { ok: true } | { ok: false; code: string };

type UndoServerAction = (
  prev: UndoButtonResult | null,
  formData: FormData,
) => UndoButtonResult | Promise<UndoButtonResult>;

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="change-feed-undo"
      className="min-h-tap-min min-w-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Undoing…" : label}
    </button>
  );
}

export function UndoChangeButton({
  changeLogId,
  undoAction,
}: {
  changeLogId: string;
  // The bound undo server action; returns a typed UndoButtonResult so the typed
  // failure can be surfaced post-submit (P6-F1).
  undoAction: UndoServerAction;
}) {
  const [result, dispatch, pending] = useActionState(undoAction, null);
  const failing = result && result.ok === false ? result : null;

  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch}>
        <input type="hidden" name="changeLogId" value={changeLogId} />
        <SubmitButton pending={pending} label="Undo this change" />
      </form>
      {failing ? (
        <div
          data-testid="change-feed-undo-result"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={failing.code} surface="admin" />
        </div>
      ) : null}
    </div>
  );
}
