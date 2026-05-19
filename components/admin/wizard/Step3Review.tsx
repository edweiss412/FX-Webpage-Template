"use client";

/**
 * components/admin/wizard/Step3Review.tsx (M10 §B Task 10.4 / Phase 2)
 *
 * Wizard step 3 — "First sheets review." Renders one row per manifest
 * row with its status badge per spec §9.0 step 3:
 *   - staged (parsed and ready)        → "Review" link to wizard-scoped
 *                                          re-apply page
 *   - hard_failed (couldn't parse)     → Retry / Defer / Ignore buttons
 *   - skipped_non_sheet (not a sheet)  → informational only
 *   - applied / defer_until_modified /
 *     permanent_ignore                 → resolved badge (no action)
 *   - discard_retryable / live_row_conflict → unresolved badge with
 *     explanatory copy (live_row_conflict has no in-wizard transition
 *     per spec §9.0).
 *
 * Resolution gate per plan §M10 Task 10.5 + §6.8.1:
 *   resolved iff status ∈ { applied, defer_until_modified,
 *   permanent_ignore, skipped_non_sheet }.
 *   default try_again_next_sync Discard (discard_retryable) and
 *   live_row_conflict do NOT count. Exposed via
 *   data-all-resolved on data-testid wizard-step3-resolution-status so
 *   the wizard chrome can wire its FinalizeButton.
 *
 * Action buttons POST to §A Pin-2 routes:
 *   /api/admin/onboarding/pending_ingestions/[id]/retry
 *   /api/admin/onboarding/pending_ingestions/[id]/defer_until_modified
 *   /api/admin/onboarding/pending_ingestions/[id]/permanent_ignore
 * Error responses render via messageFor (no raw §12.4 codes).
 *
 * The staged-row Apply + Discard flow is delegated to
 * `/admin/onboarding/staged/[wizardSessionId]/[driveFileId]` (Cluster
 * I-7 wizard-scoped staged review page) so reviewer-choices controls
 * live on a dedicated surface, not inline in the list.
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

export type Step3ManifestStatus =
  | "staged"
  | "hard_failed"
  | "skipped_non_sheet"
  | "applied"
  | "defer_until_modified"
  | "permanent_ignore"
  | "discard_retryable"
  | "live_row_conflict";

export type Step3Row = {
  driveFileId: string;
  driveFileName?: string | null;
  status: Step3ManifestStatus;
  stagedShowTitle?: string | null;
  pendingIngestionId?: string;
  errorCode?: string;
};

type Step3ReviewProps = {
  wizardSessionId: string;
  rows: Step3Row[];
};

type ActionLabel = "retry" | "defer" | "ignore";

function isResolved(status: Step3ManifestStatus): boolean {
  return (
    status === "applied" ||
    status === "defer_until_modified" ||
    status === "permanent_ignore" ||
    status === "skipped_non_sheet"
  );
}

function badgeForStatus(status: Step3ManifestStatus): {
  label: string;
  tone: "ok" | "warn" | "info" | "blocked";
} {
  switch (status) {
    case "staged":
      return { label: "Ready for review", tone: "info" };
    case "hard_failed":
      return { label: "Couldn’t parse", tone: "warn" };
    case "skipped_non_sheet":
      return { label: "Skipped: not a Google Sheet", tone: "info" };
    case "applied":
      return { label: "Applied", tone: "ok" };
    case "defer_until_modified":
      return { label: "Deferred until modified", tone: "ok" };
    case "permanent_ignore":
      return { label: "Permanently ignored", tone: "ok" };
    case "discard_retryable":
      return { label: "Set aside (try again next sync)", tone: "warn" };
    case "live_row_conflict":
      return { label: "Live row conflict", tone: "blocked" };
  }
}

function toneClasses(tone: "ok" | "warn" | "info" | "blocked"): string {
  switch (tone) {
    case "ok":
      return "bg-accent text-accent-text";
    case "warn":
      return "bg-warning-bg text-warning-text";
    case "info":
      return "bg-surface-sunken text-text";
    case "blocked":
      return "bg-warning-bg text-warning-text";
  }
}

function endpointForAction(action: ActionLabel, pendingIngestionId: string): string {
  const slug =
    action === "retry"
      ? "retry"
      : action === "defer"
        ? "defer_until_modified"
        : "permanent_ignore";
  return `/api/admin/onboarding/pending_ingestions/${pendingIngestionId}/${slug}`;
}

function HardFailedActions({
  row,
}: {
  row: Step3Row & { pendingIngestionId: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionLabel | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: ActionLabel) {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const response = await fetch(endpointForAction(action, row.pendingIngestionId), {
        method: "POST",
      });
      const body = (await response.json()) as
        | { status: string }
        | { ok: false; code: string };
      if ("ok" in body && body.ok === false) {
        setError(
          lookupDougFacing(body.code) ??
            "That action could not complete. Refresh the wizard and try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError(
        "We could not reach the server. Check your connection and try again.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`wizard-step3-retry-${row.driveFileId}`}
          onClick={() => run("retry")}
          disabled={pending !== null}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {pending === "retry" ? "Retrying…" : "Retry now"}
        </button>
        <button
          type="button"
          data-testid={`wizard-step3-defer-${row.driveFileId}`}
          onClick={() => run("defer")}
          disabled={pending !== null}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {pending === "defer" ? "Deferring…" : "Defer until modified"}
        </button>
        <button
          type="button"
          data-testid={`wizard-step3-ignore-${row.driveFileId}`}
          onClick={() => run("ignore")}
          disabled={pending !== null}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {pending === "ignore" ? "Ignoring…" : "Permanently ignore"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid={`wizard-step3-error-${row.driveFileId}`}
          className="text-sm text-warning-text"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RowItem({
  row,
  wizardSessionId,
}: {
  row: Step3Row;
  wizardSessionId: string;
}) {
  const badge = badgeForStatus(row.status);
  const liveConflictCopy = lookupDougFacing("LIVE_ROW_CONFLICT");
  const hardFailCopy =
    row.status === "hard_failed" ? lookupDougFacing(row.errorCode) : null;

  return (
    <article
      data-testid={`wizard-step3-row-${row.driveFileId}`}
      data-status={row.status}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
    >
      <header className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-text-strong">
            {row.driveFileName ?? row.driveFileId}
          </p>
          {row.stagedShowTitle ? (
            <p className="text-sm text-text-subtle">{row.stagedShowTitle}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 items-center self-start rounded-pill px-3 py-1 text-xs font-semibold ${toneClasses(badge.tone)}`}
        >
          {badge.label}
        </span>
      </header>

      {row.status === "staged" ? (
        <div className="flex flex-wrap gap-2">
          <Link
            data-testid={`wizard-step3-review-${row.driveFileId}`}
            href={`/admin/onboarding/staged/${wizardSessionId}/${row.driveFileId}`}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Review and apply
          </Link>
        </div>
      ) : null}

      {row.status === "hard_failed" && row.pendingIngestionId ? (
        <>
          {hardFailCopy ? (
            <p className="text-sm text-text-subtle">{hardFailCopy}</p>
          ) : null}
          <HardFailedActions
            row={row as Step3Row & { pendingIngestionId: string }}
          />
        </>
      ) : null}

      {row.status === "skipped_non_sheet" ? (
        <p className="text-sm text-text-subtle">
          We skipped this because it is not a Google Sheet. No action needed.
        </p>
      ) : null}

      {row.status === "discard_retryable" ? (
        <p className="text-sm text-warning-text">
          This sheet has been set aside for the next sync. You still need to
          decide whether to defer it until modified or permanently ignore it
          before finishing setup.
        </p>
      ) : null}

      {row.status === "live_row_conflict" ? (
        <p className="text-sm text-warning-text">
          {liveConflictCopy ??
            "This sheet conflicts with a live row. Resolve it from the dashboard and re-run setup."}
        </p>
      ) : null}
    </article>
  );
}

export function Step3Review({ wizardSessionId, rows }: Step3ReviewProps) {
  const unresolvedCount = rows.filter((r) => !isResolved(r.status)).length;
  const allResolved = unresolvedCount === 0 && rows.length > 0;

  return (
    <section
      data-testid="wizard-step3"
      aria-labelledby="wizard-step3-heading"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          data-testid="wizard-step3-eyebrow"
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Step 3 of 3
        </p>
        <h2
          id="wizard-step3-heading"
          className="text-2xl font-semibold text-text-strong"
        >
          Review your sheets
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          Every sheet we found in your folder is listed below. Approve, set
          aside, or defer each one. Setup finishes once every row is resolved.
        </p>
        <p
          data-testid="wizard-step3-resolution-status"
          data-all-resolved={allResolved ? "true" : "false"}
          data-unresolved-count={unresolvedCount}
          className="text-sm text-text-subtle tabular-nums"
        >
          {allResolved
            ? "All sheets resolved. You can publish when ready."
            : `${unresolvedCount} sheet${unresolvedCount === 1 ? "" : "s"} still need attention.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          data-testid="wizard-step3-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">
            We did not find any sheets to review.
          </p>
          <p>
            The folder you shared is empty or has no Google Sheets in it. Add
            sheets in Drive and click &quot;Start over&quot; to scan again.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.driveFileId}>
              <RowItem row={row} wizardSessionId={wizardSessionId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
