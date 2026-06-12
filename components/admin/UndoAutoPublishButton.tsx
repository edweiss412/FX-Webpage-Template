// components/admin/UndoAutoPublishButton.tsx (M12.13 Task 12 — spec §6.2/§6.3)
//
// The shared in-app "Undo auto-publish" client island. ONE component consumed by
// BOTH surfaces — the per-show quiet-footer action group and the
// SHOW_FIRST_PUBLISHED alert row — so copy and behavior cannot drift (spec §6.3).
//
// A <form action={dispatch}> driven by useActionState so the typed outcome is
// CAPTURED, not discarded. The submit button disables / aria-busy on the
// useActionState `pending` flag ONLY — NEVER a synchronous onClick self-disable,
// which cancels the React 19 form-action dispatch (the B1 "revoke hang" trap:
// feedback_react_form_action_synchronous_disable_cancels_submit).
//
// Outcomes (the bound undoAutoPublishAction returns a typed UndoAutoPublishOutcome):
//   success  → no panel; the page revalidation flips the show into its Archived
//              presentation and both undo affordances disappear.
//   consumed → catalog UNPUBLISH_TOKEN_CONSUMED copy (single-use; allowed in-app).
//   expired  → catalog UNPUBLISH_TOKEN_EXPIRED copy.
//   infra_error → a plain-language RETRY state (no raw code in the DOM — invariant 5).
//
// Transition treatment (spec §6.2 inventory): instant appear/disappear — server-
// rendered visibility gate on the page; NO client mount/exit animation and NO
// motion/presence wrapper (the transition-audit meta greps admin sources).
//
// Styling matches the secondary register of the sibling footer controls
// (ArchiveShowButton compact / UndoChangeButton): bordered surface button, not the
// accent-filled primary register.
"use client";
import { useActionState } from "react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { UndoAutoPublishOutcome } from "@/app/admin/show/[slug]/_actions/undoAutoPublish";

type UndoServerAction = (
  prev: UndoAutoPublishOutcome | null,
  formData: FormData,
) => UndoAutoPublishOutcome | Promise<UndoAutoPublishOutcome>;

export type UndoAutoPublishButtonProps = {
  /** The show slug — carried verbatim as a hidden field for the bound action. */
  slug: string;
  /** The bound undo server action; returns a typed outcome surfaced post-submit. */
  undoAction: UndoServerAction;
  /** Distinct test id per consumer (footer vs alert row). */
  testId?: string;
};

const CATALOG_CODE: Record<"consumed" | "expired", string> = {
  consumed: "UNPUBLISH_TOKEN_CONSUMED",
  expired: "UNPUBLISH_TOKEN_EXPIRED",
};

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="undo-auto-publish-submit"
      className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-status-warn hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Undoing…" : "Undo auto-publish"}
    </button>
  );
}

export function UndoAutoPublishButton({
  slug,
  undoAction,
  testId = "undo-auto-publish",
}: UndoAutoPublishButtonProps) {
  const [outcome, dispatch, pending] = useActionState(undoAction, null);

  const catalogCode =
    outcome && (outcome.outcome === "consumed" || outcome.outcome === "expired")
      ? CATALOG_CODE[outcome.outcome]
      : null;
  const isInfra = outcome?.outcome === "infra_error";

  return (
    <div className="flex flex-col items-start gap-2" data-testid={testId}>
      <form action={dispatch}>
        <input type="hidden" name="slug" value={slug} />
        <SubmitButton pending={pending} />
      </form>
      {catalogCode ? (
        <div
          role="alert"
          data-testid="undo-auto-publish-result"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={catalogCode} surface="admin" />
        </div>
      ) : null}
      {isInfra ? (
        <p
          role="alert"
          data-testid="undo-auto-publish-retry"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          That didn&rsquo;t go through. Try again in a moment; if it keeps failing, contact the
          developer.
        </p>
      ) : null}
    </div>
  );
}
