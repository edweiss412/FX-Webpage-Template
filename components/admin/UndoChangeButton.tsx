// Phase 6 T6.3 — UndoChangeButton (form-action submit-safe).
//
// A <form action={serverAction}> whose submit button disables/aria-busy on
// useFormStatus().pending ONLY — NEVER a synchronous onClick self-disable, which
// cancels the React 19 form-action dispatch (0 POSTs, strands on "Undoing…";
// feedback_react_form_action_synchronous_disable_cancels_submit, the B1 "revoke
// hang" precedent). Pattern mirrors RotateShareTokenButton / the M12.2 fix.
//
// The changeLogId is carried verbatim as a hidden field (PF14 — the value Phase 5
// populated on entry.changeLogId, never re-derived); the bound undo action reads
// it from FormData and delegates to undo_change.
"use client";
import { useFormStatus } from "react-dom";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
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
  // The bound undo server action; React ignores its return value for a plain
  // <form action>, so the type is intentionally permissive (the action may
  // return a typed UndoChangeResult that the form discards).
  undoAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  // The form action must satisfy React's void-returning shape; we discard the
  // helper's typed result (a plain <form action> ignores it; the page revalidates
  // on the action's success path).
  const formAction = async (formData: FormData): Promise<void> => {
    await undoAction(formData);
  };
  return (
    <form action={formAction}>
      <input type="hidden" name="changeLogId" value={changeLogId} />
      <SubmitButton label="Undo this change" />
    </form>
  );
}
