// Flow-4 T5 — AcceptChangeButton (form-action submit-safe + typed-failure
// surfacing). A near-copy of UndoChangeButton.
//
// A <form action={...}> driven by useActionState so the accept action's typed
// result is CAPTURED (not discarded). The submit button disables/aria-busy on
// the useActionState `pending` flag ONLY — NEVER a synchronous onClick
// self-disable, which cancels the React 19 form-action dispatch (0 POSTs;
// feedback_react_form_action_synchronous_disable_cancels_submit).
//
// Renders one hidden <input> per `hiddenFields` entry so callers carry either a
// single-row payload ({ showId, changeLogId }) or an Accept-all payload
// ({ showId, ids }). The bound accept action reads them from FormData.
//
// On {ok:false, code} the component renders <ErrorExplainer> (catalog copy via
// lib/messages; NO raw code in the DOM — invariant 5). On {ok:true} the page
// revalidation reflects the accepted change.
"use client";
import { useActionState } from "react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";

export type AcceptButtonResult = { ok: true } | { ok: false; code: string };

type AcceptServerAction = (
  prev: AcceptButtonResult | null,
  formData: FormData,
) => AcceptButtonResult | Promise<AcceptButtonResult>;

function SubmitButton({
  disabled,
  "aria-busy": ariaBusy,
  children,
}: {
  disabled: boolean;
  "aria-busy": boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-busy={ariaBusy}
      data-testid="change-feed-accept"
      className="min-h-tap-min min-w-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AcceptChangeButton({
  acceptAction,
  hiddenFields,
  label = "Accept",
}: {
  // The bound accept server action; returns a typed AcceptButtonResult so the
  // typed failure can be surfaced post-submit.
  acceptAction: AcceptServerAction;
  // Carried verbatim as hidden form fields (single-row or Accept-all payload).
  hiddenFields: Record<string, string>;
  label?: string;
}) {
  const [result, dispatch, pending] = useActionState(acceptAction, null);
  const failing = result && result.ok === false ? result : null;

  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch}>
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SubmitButton disabled={pending} aria-busy={pending}>
          {label}
        </SubmitButton>
      </form>
      {failing ? (
        <div
          data-testid="change-feed-accept-result"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={failing.code} surface="admin" />
        </div>
      ) : null}
    </div>
  );
}
