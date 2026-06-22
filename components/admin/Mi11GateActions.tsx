// Phase 6 T6.4 — Mi11GateActions (MI-11 gate Approve/Reject).
//
// Two <form action={...}> controls (Approve, Reject) for an open mi11_pending
// hold. Canonical-fields-only props (PF17): holdId, disposition (the canonical
// Disposition union), baseModifiedTime (PF40 staleness token AS RENDERED by the
// feed), and the two server actions returning a typed Mi11GateResult. NO detail /
// groupState / conflictCode props — those are not on FeedEntry and would force a
// second query (PF14).
//
// PF40: each form carries TWO hidden inputs — holdId and expectedBaseModifiedTime
// (the CLIENT-rendered baseModifiedTime the admin SAW, emitted VERBATIM via
// `baseModifiedTime ?? ""`, NEVER re-read server-side; a null base round-trips as
// "" and the server action normalizes it back to null). A re-read would make the
// Phase 2 MI11_TARGET_MOVED retarget guard vacuous.
//
// PF17: the Approve label is always "Approve" — the swap/collision/
// IDENTITY_WOULD_COLLIDE vs approved-group outcome is determined by the action's
// typed RESULT after submit (captured via useActionState). On {ok:false,code} the
// component renders <ErrorExplainer> (catalog copy, no raw code — invariant 5,
// including MI11_TARGET_MOVED). On {ok:true} the page revalidates and the entry
// flips status. This component NEVER pre-renders a conflict or group state.
//
// Submit-safety: buttons disable on the useActionState `pending` flag, NEVER a
// synchronous onClick self-disable (would cancel the React 19 dispatch).
"use client";

import { useActionState, useState } from "react";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { Disposition } from "@/lib/sync/holds/types";

export type Mi11GateActionResult = { ok: true } | { ok: false; code: string };

type GateServerAction = (
  prev: Mi11GateActionResult | null,
  formData: FormData,
) => Mi11GateActionResult | Promise<Mi11GateActionResult>;

function dispositionName(disposition: Disposition): string | null {
  return disposition.disposition === "removal" ? null : disposition.name;
}

function GateButton({
  variant,
  pending,
  disabled,
  accessibleName,
  onMark,
}: {
  variant: "approve" | "reject";
  // `pending` = THIS button's own in-flight state (drives the busy label + aria-busy).
  pending: boolean;
  // `disabled` = the SINGLE-critical-section gate (P6-F3): true while EITHER action
  // is in flight, so the sibling can't be submitted concurrently.
  disabled: boolean;
  accessibleName: string;
  // Records this button as the last-submitted action SYNCHRONOUSLY, before/outside
  // the form-action transition (P6-F4). Does NOT disable — so the dispatch survives.
  onMark: () => void;
}) {
  const isApprove = variant === "approve";
  const idleLabel = isApprove ? "Approve" : "Reject";
  const pendingLabel = isApprove ? "Approving…" : "Rejecting…";
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-busy={pending}
      aria-label={accessibleName}
      onClick={onMark}
      data-testid={isApprove ? "mi11-approve" : "mi11-reject"}
      className={
        isApprove
          ? // Brand-primary CTA (DESIGN §1.3: status hues are dots/pills only, never a
            // large fill; mirrors PublishShowButton). accent-text on accent + semibold
            // clears WCAG AA for the 14px label.
            "min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          : "min-h-tap-min min-w-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function Mi11GateActions({
  holdId,
  disposition,
  baseModifiedTime,
  approveAction,
  rejectAction,
}: {
  holdId: string;
  disposition: Disposition;
  baseModifiedTime: string | null;
  approveAction: GateServerAction;
  rejectAction: GateServerAction;
}) {
  const [approveResult, approveDispatch, approvePending] = useActionState(approveAction, null);
  const [rejectResult, rejectDispatch, rejectPending] = useActionState(rejectAction, null);

  // P6-F2/F4: track which gate action was submitted LAST so the error panel reflects
  // ONLY the latest submitted action's own result — never a fall-back to the other
  // action's stale failure. Recorded SYNCHRONOUSLY in each button's onMouseDown/onClick
  // (which fires BEFORE — and outside — the React 19 form-action transition); setting
  // it inside the action wrapper would defer the update into the transition and let a
  // stale render show the prior action's error. The onClick does NOT disable the button
  // (the disabled gate is the rendered `disabled={anyPending}` prop), so it can't cancel
  // the dispatch.
  const [lastSubmitted, setLastSubmitted] = useState<"approve" | "reject" | null>(null);

  const name = dispositionName(disposition);
  const forWhom = name ? ` for ${name}` : "";
  // PF40: the token the admin SAW, emitted verbatim. A null base → "" (the server
  // action normalizes "" → null before delegating).
  const token = baseModifiedTime ?? "";

  // P6-F3 — SINGLE critical section: while EITHER gate action is in flight, BOTH
  // buttons are disabled, so the same hold can never have two concurrent in-flight
  // resolutions (the backend advisory lock would otherwise pick a nondeterministic
  // winner). Disabled via the rendered `disabled` prop (NOT a synchronous onClick
  // self-disable, which would cancel the React 19 form-action dispatch).
  const anyPending = approvePending || rejectPending;

  // P6-F4 — render ONLY the LAST-SUBMITTED action's OWN result, with NO fallback to
  // the other action's stale failure. A failure shows only when the last-submitted
  // action is SETTLED-and-failing; while it is PENDING or after it SUCCEEDS, show
  // NO error. So a newer submission (pending or success) immediately supersedes any
  // prior error.
  const lastResult =
    lastSubmitted === "approve" ? approveResult : lastSubmitted === "reject" ? rejectResult : null;
  const lastPending =
    lastSubmitted === "approve"
      ? approvePending
      : lastSubmitted === "reject"
        ? rejectPending
        : false;
  const failing = !lastPending && lastResult && lastResult.ok === false ? lastResult : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={approveDispatch}>
          <input type="hidden" name="holdId" value={holdId} />
          <input type="hidden" name="expectedBaseModifiedTime" value={token} />
          <GateButton
            variant="approve"
            pending={approvePending}
            disabled={anyPending}
            accessibleName={`Approve change${forWhom}`}
            onMark={() => setLastSubmitted("approve")}
          />
        </form>
        <form action={rejectDispatch}>
          <input type="hidden" name="holdId" value={holdId} />
          <input type="hidden" name="expectedBaseModifiedTime" value={token} />
          <GateButton
            variant="reject"
            pending={rejectPending}
            disabled={anyPending}
            accessibleName={`Reject change${forWhom}`}
            onMark={() => setLastSubmitted("reject")}
          />
        </form>
      </div>
      {failing ? (
        <div
          data-testid="mi11-gate-result"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={failing.code} surface="admin" />
        </div>
      ) : null}
    </div>
  );
}
