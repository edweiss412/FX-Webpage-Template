"use client";

/**
 * components/admin/StagedReviewCard.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-row review card for a live `pending_syncs` row. Mounts inside
 * <ParsePanel> on the per-show admin page (`app/admin/show/[slug]/page.tsx`).
 *
 * Wires the operator's reviewer choices into §A's Pin-stop 2 extension
 * routes (handoff §0 ddafda3 pin):
 *
 *   POST /api/admin/staged/[fileId]/apply
 *     { source_scope: 'live', staged_id, choices: ReviewerChoice[] }
 *
 *   POST /api/admin/staged/[fileId]/discard
 *     { source_scope: 'live', staged_id, variant }
 *
 * Apply enforces the validator's per-invariant allowed-action set BEFORE
 * the round-trip so the operator gets immediate feedback when a required
 * choice is missing. Allowed actions match `lib/sync/applyStaged.ts`
 * `allowedActions(item)` exactly:
 *   - asset-review invariants → only `apply`
 *   - MI-12 → `rename` | `reject`
 *   - MI-13 / MI-14 → `rename` | `independent`
 *   - everything else → only `apply`
 *
 * Items whose allowed-actions set has size 1 default to that action so the
 * operator can apply immediately. Multi-action items require an explicit
 * pick — Apply blocks locally with `MISSING_REVIEWER_CHOICE` if any item
 * is unset, never round-tripping a guaranteed-400 request.
 *
 * `rename_value` is fixed to the item's `added_name` (the validator
 * rejects any other value), so the UI does not surface a free-text field —
 * picking "rename" implies the canonical rename target.
 *
 * First-seen rows (`FIRST_SEEN_REVIEW` or `ONBOARDING_SCAN_REVIEW` present
 * in `triggered_review_items`) expose all three discard variants
 * (try_again / defer_until_modified / permanent_ignore). Every other row
 * exposes only `try_again` because the discardStaged validator rejects
 * defer/ignore on existing-show rows as `INVALID_REVIEWER_ACTION`.
 *
 * All errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog so no raw codes leak into the DOM (invariant 5).
 *
 * Note on Amendment 9 (M6-D12 deferred): the current code ships
 * pre-amendment AC-6.11 behavior — first-seen live sheets stage as
 * FIRST_SEEN_REVIEW and surface here for explicit operator review.
 * Amendment 9's auto-publish + 24h undo path is M6-D12 territory.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import type { ReviewerChoice } from "@/lib/sync/applyStaged";

const ASSET_REVIEW_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  "REEL_DRIFT_PENDING",
]);

const FIRST_SEEN_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "FIRST_SEEN_REVIEW",
  "ONBOARDING_SCAN_REVIEW",
]);

type ReviewerAction = ReviewerChoice["action"];
type DiscardVariant = "try_again" | "defer_until_modified" | "permanent_ignore";

function allowedActionsFor(item: TriggeredReviewItem): readonly ReviewerAction[] {
  if (ASSET_REVIEW_INVARIANTS.has(item.invariant)) return ["apply"];
  if (item.invariant === "MI-12") return ["rename", "reject"];
  if (item.invariant === "MI-13" || item.invariant === "MI-14") {
    return ["rename", "independent"];
  }
  return ["apply"];
}

function expectedRenameValue(item: TriggeredReviewItem): string | null {
  if (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") {
    return item.added_name;
  }
  return null;
}

function describeItem(item: TriggeredReviewItem): string {
  switch (item.invariant) {
    case "FIRST_SEEN_REVIEW":
      return "New show sheet — confirm before publishing.";
    case "ONBOARDING_SCAN_REVIEW":
      return "Onboarding scan staged this sheet for review.";
    case "MI-6":
      return "A header cell drifted. Review the parse before applying.";
    case "MI-7":
      return `Section "${item.section}" row count changed (${item.prior_count} → ${item.new_count}).`;
    case "MI-7b":
      return `Section "${item.section}" row identity drifted (key: ${item.missingKey}).`;
    case "MI-8":
      return `Field "${item.field}" changed.`;
    case "MI-8b":
      return `Schedule note drifted (was ${item.prior ?? "—"} / now ${item.next ?? "—"}).`;
    case "MI-8c":
      return `Schedule debounce mode: ${item.mode}${item.details ? ` — ${item.details}` : ""}.`;
    case "MI-9":
      return `Lead role flag changed for "${item.crew_name}".`;
    case "MI-10":
      return "Crew table-anchor drift. Review before applying.";
    case "MI-11":
      return `Email changed for "${item.crew_name}" (was ${item.prior_email ?? "—"} / now ${item.new_email ?? "—"}).`;
    case "MI-12":
      return `Email "${item.email}" reassigned from "${item.removed_name}" to "${item.added_name}".`;
    case "MI-13":
      return `Position swap: "${item.removed_name}" → "${item.added_name}".`;
    case "MI-14":
      return `Position swap: "${item.removed_name}" → "${item.added_name}".`;
    case "MI-13-orphan-remove":
    case "MI-14-orphan-remove":
      return `Orphaned removal: "${item.removed_name}"${item.reason ? ` (${item.reason})` : ""}.`;
    case "MI-13-orphan-add":
    case "MI-14-orphan-add":
      return `Orphaned addition: "${item.added_name}".`;
    case "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE":
      return "Embedded diagram revisions are unavailable. Apply preserves the existing snapshot.";
    case "DIAGRAMS_EMBEDDED_NONE_FOUND":
      return "DIAGRAMS tab found no embedded objects. Apply publishes an empty gallery.";
    case "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING":
      return `Linked diagrams folder drifted (${item.drift_count} entries).`;
    case "REEL_DRIFT_PENDING":
      return "Opening reel changed since staging.";
  }
}

function actionLabel(action: ReviewerAction, item: TriggeredReviewItem): string {
  if (action === "apply") return "Apply";
  if (action === "reject") return "Reject this change";
  if (action === "independent") return "Treat as different people";
  // rename
  const target = expectedRenameValue(item);
  return target ? `Rename to "${target}"` : "Rename";
}

export type StagedRow = {
  driveFileId: string;
  stagedId: string;
  sourceKind: "cron" | "push" | "manual" | "onboarding_scan";
  stagedModifiedTime: string;
  baseModifiedTime: string | null;
  warningSummary: string;
  triggeredReviewItems: TriggeredReviewItem[];
  /** Optional one-line summary derived from `parse_result` by the page. */
  parseSummaryLine?: string;
};

export type StagedReviewCardProps = {
  row: StagedRow;
  /** Callback invoked after a successful Apply or Discard, before router.refresh(). */
  onMutated?: () => void;
};

export function StagedReviewCard({ row, onMutated }: StagedReviewCardProps) {
  // Items with a single allowed action default to that action so an
  // operator can apply immediately. Multi-action items (MI-12 / MI-13 /
  // MI-14) start unset and force an explicit choice.
  const initialChoices = useMemo(() => {
    const initial = new Map<string, ReviewerAction>();
    for (const item of row.triggeredReviewItems) {
      const allowed = allowedActionsFor(item);
      if (allowed.length === 1) initial.set(item.id, allowed[0]!);
    }
    return initial;
  }, [row.triggeredReviewItems]);

  const [choices, setChoices] = useState<Map<string, ReviewerAction>>(initialChoices);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const router = useRouter();

  const isFirstSeen = row.triggeredReviewItems.some((i) =>
    FIRST_SEEN_INVARIANTS.has(i.invariant),
  );

  const setChoice = (itemId: string, action: ReviewerAction) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(itemId, action);
      return next;
    });
  };

  const applyEndpoint = `/api/admin/staged/${encodeURIComponent(row.driveFileId)}/apply`;
  const discardEndpoint = `/api/admin/staged/${encodeURIComponent(row.driveFileId)}/discard`;

  const handleApply = async () => {
    if (pending) return;
    setErrorCode(null);
    const reviewerChoices: ReviewerChoice[] = [];
    for (const item of row.triggeredReviewItems) {
      const action = choices.get(item.id);
      if (!action) {
        setErrorCode("MISSING_REVIEWER_CHOICE");
        return;
      }
      const choice: ReviewerChoice = { item_id: item.id, action };
      if (action === "rename") {
        const target = expectedRenameValue(item);
        if (target !== null) choice.rename_value = target;
      }
      reviewerChoices.push(choice);
    }
    setPending(true);
    try {
      const res = await fetch(applyEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_scope: "live",
          staged_id: row.stagedId,
          choices: reviewerChoices,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        onMutated?.();
        router.refresh();
      } else {
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  const handleDiscard = async (variant: DiscardVariant) => {
    if (pending) return;
    setErrorCode(null);
    setPending(true);
    try {
      const res = await fetch(discardEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_scope: "live",
          staged_id: row.stagedId,
          variant,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        onMutated?.();
        router.refresh();
      } else {
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  return (
    <article
      data-testid="staged-review-card"
      data-staged-id={row.stagedId}
      data-drive-file-id={row.driveFileId}
      className="rounded-md border border-border-strong bg-surface-raised p-tile-pad shadow-tile"
    >
      <header className="mb-4">
        <h3 className="text-base font-semibold text-text-strong">Staged review</h3>
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm text-text-subtle">
          <dt>Source</dt>
          <dd data-testid="staged-source-kind">{row.sourceKind}</dd>
          <dt>Staged at</dt>
          <dd>
            <time dateTime={row.stagedModifiedTime}>{row.stagedModifiedTime}</time>
          </dd>
          {row.baseModifiedTime ? (
            <>
              <dt>Previous</dt>
              <dd>
                <time dateTime={row.baseModifiedTime}>{row.baseModifiedTime}</time>
              </dd>
            </>
          ) : null}
        </dl>
        {row.parseSummaryLine ? (
          <p className="mt-3 text-sm text-text" data-testid="staged-parse-summary">
            {row.parseSummaryLine}
          </p>
        ) : null}
        {row.warningSummary ? (
          <p className="mt-2 text-sm text-warning-text" data-testid="staged-warning-summary">
            {row.warningSummary}
          </p>
        ) : null}
      </header>

      {row.triggeredReviewItems.length > 0 ? (
        <ul className="space-y-4" data-testid="staged-review-items">
          {row.triggeredReviewItems.map((item) => {
            const allowed = allowedActionsFor(item);
            return (
              <li
                key={item.id}
                data-testid={`review-item-${item.id}`}
                className="rounded-sm border border-border bg-surface p-3"
              >
                <p className="text-sm text-text-strong">{describeItem(item)}</p>
                <fieldset className="mt-2 space-y-1">
                  <legend className="sr-only">How should this change be applied?</legend>
                  {allowed.map((action) => {
                    const id = `item-${item.id}-${action}`;
                    return (
                      <label
                        key={action}
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-text"
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`item-${item.id}`}
                          value={action}
                          checked={choices.get(item.id) === action}
                          onChange={() => setChoice(item.id, action)}
                          className="size-4"
                        />
                        <span>{actionLabel(action, item)}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-subtle" data-testid="staged-review-no-items">
          No reviewer choices required for this stage.
        </p>
      )}

      {errorCode ? (
        <div
          data-testid="staged-review-card-error"
          role="alert"
          className="mt-4 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={errorCode} surface="admin" />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={pending}
          data-testid="staged-review-apply"
          className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => handleDiscard("try_again")}
          disabled={pending}
          data-testid="staged-review-discard-try-again"
          className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
        >
          Discard
        </button>
        {isFirstSeen ? (
          <>
            <button
              type="button"
              onClick={() => handleDiscard("defer_until_modified")}
              disabled={pending}
              data-testid="staged-review-discard-defer"
              className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              Defer until edited
            </button>
            <button
              type="button"
              onClick={() => handleDiscard("permanent_ignore")}
              disabled={pending}
              data-testid="staged-review-discard-ignore"
              className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ignore permanently
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
