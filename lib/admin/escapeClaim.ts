/**
 * lib/admin/escapeClaim.ts
 * (2026-08-28-published-escape-consumed-claim §3.2)
 *
 * The published review modal's consumed-key decision, as a PURE function.
 *
 * It lives here rather than inline in the component because the branch it decides
 * is reachable only in state P — panel mounted, its own capture listener not yet
 * installed — which three probed routes showed jsdom cannot stage. Inline, the
 * only available assertions were textual, and whole-diff review round 2 showed
 * what that is worth: an early `return true` inserted ABOVE the branch's body
 * swallows state P's Escape while every asserted string is still present, and the
 * guard stays green.
 *
 * Extracted, the decision is testable directly over its whole input space, which
 * is four states and two outcomes, and the component's job shrinks to applying the
 * action it returns.
 */

/** What the modal does with an Escape the shell would otherwise close on. */
export type EscapeDecision =
  /** State P: the panel is up but cannot defend itself. Dismiss it, keep the
   *  dialog, and return focus the way the panel's own handler would. */
  | { kind: "dismiss-panel" }
  /** State N: the panel is already gone and a claim is pending. Spend the claim
   *  and keep the dialog. This is the ONE key that changes nothing visible, and
   *  it is bounded to one by the spending. */
  | { kind: "consume-claim" }
  /** State O: nothing to defer. The shell closes the dialog. */
  | { kind: "let-dialog-close" };

export function decideEscape(input: {
  /** The panel is rendered and interactive. */
  panelOpen: boolean;
  /** A claim survived a transient takedown and has not been spent or cleared. */
  claimPending: boolean;
}): EscapeDecision {
  if (input.panelOpen) return { kind: "dismiss-panel" };
  if (input.claimPending) return { kind: "consume-claim" };
  return { kind: "let-dialog-close" };
}

/** True when the modal handled the key, so the shell must NOT close the dialog. */
export function consumesKey(decision: EscapeDecision): boolean {
  return decision.kind !== "let-dialog-close";
}

/** The effects a decision commands. The component supplies real ones; a test
 *  supplies spies. Separating the DECISION from its APPLICATION is what makes both
 *  testable: whole-diff review round 3 found the decision covered by a truth table
 *  while the switch that applies it was exercised by nothing, so dropping an effect
 *  stayed invisible. */
export type EscapeActions = {
  /** Take the panel down. */
  dismissPanel: () => void;
  /** Spend the claim, so the next Escape belongs to the dialog. */
  clearClaim: () => void;
  /** Return focus to the pill, as the panel's own handler does. */
  focusPill: () => void;
};

/** Applies a decision and reports whether the modal consumed the key.
 *
 *  Exhaustive by construction: a new `EscapeDecision` kind fails to compile here
 *  rather than falling through and consuming an operator's Escape while applying
 *  none of its effects. */
export function applyEscapeDecision(decision: EscapeDecision, actions: EscapeActions): boolean {
  switch (decision.kind) {
    case "dismiss-panel":
      actions.dismissPanel();
      actions.clearClaim();
      actions.focusPill();
      return true;
    case "consume-claim":
      actions.clearClaim();
      return true;
    case "let-dialog-close":
      return false;
    default: {
      const unhandled: never = decision;
      return unhandled;
    }
  }
}
