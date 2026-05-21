"use client";

/**
 * app/admin/show/[slug]/IssueLinkButton.tsx (M9.5)
 *
 * One-tap admin affordance for Issue-new-link (or Issue-first-link).
 *
 * Issue-new is creative (not destructive) — no two-tap confirm step
 * per spec line 1100 ("single primary action labeled..."). The visual
 * mirror to RevokeRowButton's idle branch is intentional but the
 * confirm machinery is absent.
 *
 * Uses useActionState to read the terminal ShowLinkActionResult so a
 * refused outcome (show_not_found, crew_member_not_found) surfaces
 * inline rather than vanishing into a no-op.
 *
 * The "ok" path triggers revalidatePath inside the Server Action,
 * which re-renders the page and re-mounts this row. The inline ok
 * banner stays visible until the revalidation completes — useful on
 * slow networks so the admin sees terminal confirmation before the
 * row re-mounts with the bumped version state.
 */
import { useActionState } from "react";

import { getDougFacing } from "@/lib/messages/lookup";

import {
  issueNewLinkAction,
  type ShowLinkActionResult,
} from "./actions";

export function IssueLinkButton({
  showId,
  crewName,
  isFresh,
  disabled = false,
}: {
  showId: string;
  crewName: string;
  isFresh: boolean;
  /** Defensive disable for auth-missing rows (Codex R1 HIGH-1 fix). Default false. */
  disabled?: boolean;
}) {
  const [result, formAction, isPending] = useActionState<
    ShowLinkActionResult | null,
    FormData
  >(issueNewLinkAction, null);

  const label = isFresh ? "Issue first link" : "Issue new link";
  const pendingLabel = isFresh ? "Issuing first link…" : "Issuing…";
  const okMessage = result?.kind === "ok" ? getDougFacing(result.code) : null;
  const refusedMessage =
    result?.kind === "refused" ? getDougFacing(result.code) : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="showId" value={showId} />
        <input type="hidden" name="crewName" value={crewName} />
        <button
          type="submit"
          disabled={isPending || disabled}
          aria-busy={isPending}
          data-testid="per-show-crew-issue-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? pendingLabel : label}
        </button>
      </form>
      {okMessage && (
        <p
          data-testid="per-show-crew-issue-ok"
          role="status"
          className="w-full rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
        >
          {okMessage}
        </p>
      )}
      {refusedMessage && (
        <p
          data-testid="per-show-crew-issue-refused"
          role="alert"
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {refusedMessage}
        </p>
      )}
    </div>
  );
}
