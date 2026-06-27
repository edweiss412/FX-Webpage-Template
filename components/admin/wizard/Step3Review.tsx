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
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { messageFor } from "@/lib/messages/lookup";
import { resolveIngestionCopy } from "@/lib/admin/needsAttention";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { ParseResult } from "@/lib/parser/types";

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// Surface-appropriate generic for hard-fail wizard rows whose producer code is
// non-catalog/unresolvable. The shared SHEET_PROCESS_FAILED generic says "Open
// the show…", but a phase-1 hard-fail may have produced no show, and this row's
// only controls are Retry/Defer/Ignore below — so point Doug at those instead
// (Codex R6). Exported for the surface-appropriateness regression test.
export const WIZARD_HARD_FAIL_GENERIC =
  "We couldn't read this sheet. Fix it in Drive and Retry, or choose Defer or Permanently ignore below.";

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
  // §7.1: the full parse preview for a staged row (the step-3 card renders
  // summary + breakdown from this). A staged row carries its `ParseResult`;
  // non-staged rows have `null`. Coerced from untyped jsonb in fetchStep3Data.
  parseResult?: ParseResult | null;
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
    action === "retry" ? "retry" : action === "defer" ? "defer_until_modified" : "permanent_ignore";
  return `/api/admin/onboarding/pending_ingestions/${pendingIngestionId}/${slug}`;
}

function HardFailedActions({ row }: { row: Step3Row & { pendingIngestionId: string } }) {
  const router = useRouter();
  const [pending, setPending] = useState<ActionLabel | null>(null);
  const [error, setError] = useState<{ copy: string; code: string | null } | null>(null);

  async function run(action: ActionLabel) {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const response = await fetch(endpointForAction(action, row.pendingIngestionId), {
        method: "POST",
      });
      const body = (await response.json()) as { status: string } | { ok: false; code: string };
      if ("ok" in body && body.ok === false) {
        setError({
          copy:
            lookupDougFacing(body.code) ??
            "That action could not complete. Refresh the wizard and try again.",
          code: body.code,
        });
        return;
      }
      router.refresh();
    } catch {
      setError({
        copy: "We could not reach the server. Check your connection and try again.",
        code: null,
      });
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
        <div
          role="alert"
          data-testid={`wizard-step3-error-${row.driveFileId}`}
          className="flex flex-col gap-1 text-sm text-warning-text"
        >
          <p>{renderEmphasis(error.copy)}</p>
          <HelpAffordance code={error.code} />
        </div>
      ) : null}
    </div>
  );
}

// The AC11-accepted external-resolve exit for live_row_conflict: a link to the
// dashboard where Doug resolves the conflicting live row, then re-runs setup. It
// renders ALONGSIDE the in-wizard "Permanently ignore" button (DS3-1) — AC11 is
// "Ignore OR external resolve", so live_row_conflict offers both exits.
function DashboardResolveLink({ driveFileId }: { driveFileId: string }) {
  return (
    <Link
      href="/admin"
      data-testid={`wizard-step3-conflict-dashboard-${driveFileId}`}
      className="inline-flex min-h-tap-min items-center self-start font-medium text-text-strong underline underline-offset-2 hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      Resolve in the dashboard, then re-run setup
    </Link>
  );
}

// DS3-1: the in-wizard "Permanently ignore" exit for the two blocking statuses
// that have NO pending_ingestions row (live_row_conflict / discard_retryable). An
// ignore-only mirror of HardFailedActions — it does NOT build endpointForAction
// from row.pendingIngestionId (these rows lack one); it posts the manifest-keyed
// route keyed on (wizardSessionId, driveFileId). On success it router.refresh()es;
// an error body routes through lookupDougFacing (no raw §12.4 code leaks, invariant
// 5) into the shared wizard-step3-error-<dfid> alert.
function ManifestIgnoreAction({
  wizardSessionId,
  row,
}: {
  wizardSessionId: string;
  row: Step3Row;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ copy: string; code: string | null } | null>(null);

  async function run() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/onboarding/manifest/${wizardSessionId}/${row.driveFileId}/ignore`,
        { method: "POST" },
      );
      const body = (await response.json()) as { status: string } | { ok: false; code: string };
      if ("ok" in body && body.ok === false) {
        setError({
          copy:
            lookupDougFacing(body.code) ??
            "That action could not complete. Refresh the wizard and try again.",
          code: body.code,
        });
        return;
      }
      router.refresh();
    } catch {
      setError({
        copy: "We could not reach the server. Check your connection and try again.",
        code: null,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={`wizard-step3-ignore-${row.driveFileId}`}
        onClick={() => void run()}
        disabled={pending}
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-3 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {pending ? "Ignoring…" : "Permanently ignore"}
      </button>
      {error ? (
        <div
          role="alert"
          data-testid={`wizard-step3-error-${row.driveFileId}`}
          className="flex flex-col gap-1 text-sm text-warning-text"
        >
          <p>{renderEmphasis(error.copy)}</p>
          <HelpAffordance code={error.code} />
        </div>
      ) : null}
    </div>
  );
}

function RowItem({
  row,
  wizardSessionId,
  expanded,
  onToggleExpanded,
  checked,
  onToggleChecked,
  checkboxPending,
}: {
  row: Step3Row;
  wizardSessionId: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  // Lifted publish-intent (clean rows only) — forwarded to the card's checkbox so
  // Select-all updates every box through Step3Review's shared optimistic state.
  checked?: boolean;
  onToggleChecked?: (next: boolean) => void;
  checkboxPending?: boolean;
}) {
  const badge = badgeForStatus(row.status);
  const liveConflictCopy = lookupDougFacing("LIVE_ROW_CONFLICT");

  // §4.1 / D2 / D6: a clean review sheet renders its parse preview INLINE via
  // <Step3SheetCard> (summary + expandable breakdown). This replaces the old
  // "Review and apply" link to the finalize-failure recovery page (D6). The card
  // supplies its own <article>; we keep the `wizard-step3-row-<dfid>` wrapper
  // testid so the per-manifest-row contract still resolves.
  //
  // FIX 1 (CRITICAL): BOTH 'staged' (unchecked) and 'applied' (checked) clean
  // rows route here — a checked card flips the manifest status to 'applied' and
  // re-renders after router.refresh(); it must stay the card (with a CHECKED,
  // individually-uncheckable checkbox — the card's checkbox checked-state is
  // `status === "applied"`, and clicking it POSTs unapprove), NOT collapse to a
  // dead "Applied" badge. 'applied' is NOT blocking, so it never enters the
  // "Needs your attention" group.
  if (isCleanRow(row.status)) {
    return (
      <div data-testid={`wizard-step3-row-${row.driveFileId}`} data-status={row.status}>
        <Step3SheetCard
          row={row}
          wizardSessionId={wizardSessionId}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          checked={checked}
          onToggleChecked={onToggleChecked}
          checkboxPending={checkboxPending}
        />
      </div>
    );
  }
  // Hard-fail rows ARE pending_ingestions rows (row.errorCode = last_error_code).
  // Route through the SHARED resolver the needs-attention inbox + emails use, not
  // the catalog-only lookupDougFacing: the real phase-1 producer codes include
  // non-catalog values (MI-2_EMPTY_TITLE, MI-3_NO_VALID_DATES, PARSE_HARD_FAIL)
  // for which lookupDougFacing returned null, leaving the row's reason blank
  // (Codex R5). resolveIngestionCopy falls back to GENERIC copy (never empty),
  // strips emphasis markers, and fills the sheet name — one resolver, three
  // surfaces. Always non-null, so the render guard below only filters non-hard-fail.
  const hardFailCopy =
    row.status === "hard_failed"
      ? resolveIngestionCopy({
          code: row.errorCode ?? null,
          driveFileName: row.driveFileName ?? null,
          genericFallback: WIZARD_HARD_FAIL_GENERIC,
        })
      : null;

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

      {row.status === "hard_failed" && row.pendingIngestionId ? (
        <>
          {hardFailCopy ? (
            // resolveIngestionCopy already filled the sheet name and stripped
            // emphasis markers (plaintext), so render it directly.
            <p className="text-sm text-text-subtle">{hardFailCopy}</p>
          ) : null}
          {row.errorCode ? <HelpAffordance code={row.errorCode} /> : null}
          <HardFailedActions row={row as Step3Row & { pendingIngestionId: string }} />
        </>
      ) : null}

      {row.status === "skipped_non_sheet" ? (
        <p className="text-sm text-text-subtle">
          We skipped this because it is not a Google Sheet. No action needed.
        </p>
      ) : null}

      {row.status === "discard_retryable" ? (
        // Legacy-only status: the redesign no longer produces discard_retryable
        // (the "Retry on next sync" action was removed). Defensive render so a
        // stray/legacy row still has an in-wizard exit. DS3-1 wires the in-wizard
        // "Permanently ignore" (spec §4.1 lists only Ignore for this status) via
        // the manifest-keyed route (these rows have no pendingIngestionId).
        <div className="flex flex-col gap-2 text-sm text-warning-text">
          <p>
            This sheet was set aside by an earlier version of setup. Permanently ignore it to clear
            it from setup.
          </p>
          <ManifestIgnoreAction wizardSessionId={wizardSessionId} row={row} />
        </div>
      ) : null}

      {row.status === "live_row_conflict" ? (
        // AC11 "Ignore OR external resolve": KEEP the dashboard-resolve link +
        // LIVE_ROW_CONFLICT help affordance, and ADD the in-wizard Ignore (DS3-1)
        // via the manifest-keyed route (no pendingIngestionId on these rows).
        <div className="flex flex-col gap-2 text-sm text-warning-text">
          <p>
            {liveConflictCopy
              ? renderEmphasis(liveConflictCopy)
              : "This sheet conflicts with a live row. Resolve it from the dashboard and re-run setup."}
          </p>
          <ManifestIgnoreAction wizardSessionId={wizardSessionId} row={row} />
          <DashboardResolveLink driveFileId={row.driveFileId} />
          <HelpAffordance code="LIVE_ROW_CONFLICT" />
        </div>
      ) : null}
    </article>
  );
}

// A clean row is one with a show to publish — manifest `staged` (unchecked) or
// `applied` (checked). Only clean rows participate in Select-all / the count.
function isCleanRow(status: Step3ManifestStatus): boolean {
  return status === "staged" || status === "applied";
}

/**
 * Header publish controls (§4.1, presentational): a **Select all** checkbox + a
 * live "N of M selected to publish" count. N = clean rows currently checked; M =
 * all clean rows. ALL state is LIFTED into Step3Review — the header, every per-card
 * checkbox, and this count read from one shared optimistic publish-intent overlay,
 * so Select all flips every card instantly (§4.5) without waiting on each box to
 * re-seed from a router.refresh() (the select-all-doesn't-stick bug). Disabled
 * while its batch is in flight (§4.6). The count is tabular-nums so a digit change
 * never shifts layout.
 */
function Step3PublishHeader({
  allChecked,
  appliedCount,
  cleanCount,
  pending,
  onToggleSelectAll,
}: {
  allChecked: boolean;
  appliedCount: number;
  cleanCount: number;
  pending: boolean;
  onToggleSelectAll: () => void;
}) {
  if (cleanCount === 0) {
    // No publishable rows → no select-all; still emit the count (0 of 0) so the
    // line is stable and the testid always resolves.
    return (
      <p data-testid="wizard-step3-publish-count" className="text-sm tabular-nums text-text-subtle">
        <span className="tabular-nums">{appliedCount}</span> of{" "}
        <span className="tabular-nums">{cleanCount}</span> selected to publish
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="inline-flex min-h-tap-min cursor-pointer items-center gap-2 has-disabled:cursor-not-allowed has-disabled:opacity-60">
        <input
          type="checkbox"
          data-testid="wizard-step3-select-all"
          checked={allChecked}
          disabled={pending}
          aria-label="Select all sheets to publish"
          onChange={() => onToggleSelectAll()}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`flex size-5 items-center justify-center rounded-sm border-2 transition-colors duration-fast peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2 ${
            allChecked ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-bg"
          }`}
        >
          <Check
            className={`size-3.5 transition-opacity duration-fast ${allChecked ? "opacity-100" : "opacity-0"}`}
            strokeWidth={3}
          />
        </span>
        <span className="text-sm font-medium text-text-strong">Select all</span>
      </label>
      <p data-testid="wizard-step3-publish-count" className="text-sm tabular-nums text-text-subtle">
        <span className="tabular-nums text-text-strong">{appliedCount}</span> of{" "}
        <span className="tabular-nums">{cleanCount}</span> selected to publish
      </p>
    </div>
  );
}

/**
 * A de-emphasized group for rows that are NOT publishable and need no action —
 * permanently ignored, deferred, or skipped (not a Google Sheet). Each status gets
 * its OWN section (hidden when empty), rendered BELOW the publish grid so these
 * resolved rows never sit inside it. Quiet treatment: a small subtle heading + the
 * same RowItem cards (titled card + status badge / informational copy).
 */
function SetAsideSection({
  testId,
  heading,
  description,
  rows,
  wizardSessionId,
}: {
  testId: string;
  heading: string;
  description?: string;
  rows: Step3Row[];
  wizardSessionId: string;
}) {
  if (rows.length === 0) return null; // hidden when empty
  return (
    <section data-testid={testId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-text-subtle">
          {heading} <span className="tabular-nums text-text-faint">({rows.length})</span>
        </h3>
        {description ? <p className="text-xs text-text-subtle">{description}</p> : null}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.driveFileId}>
            <RowItem row={row} wizardSessionId={wizardSessionId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// §7.3 canonical blocking set — the statuses that need an acknowledged in-wizard
// exit (Retry / Ignore / dashboard-resolve) before finish. Identical to the
// `finishable` predicate's set (OnboardingWizard.tsx) and the server gate. These
// rows render in the distinct "Needs your attention" group (§4.1), never as a
// clean publish card.
const BLOCKING_STATUSES: ReadonlySet<Step3ManifestStatus> = new Set([
  "hard_failed",
  "live_row_conflict",
  "discard_retryable",
]);

function isBlocking(status: Step3ManifestStatus): boolean {
  return BLOCKING_STATUSES.has(status);
}

export function Step3Review({ wizardSessionId, rows }: Step3ReviewProps) {
  const router = useRouter();
  const unresolvedCount = rows.filter((r) => !isResolved(r.status)).length;
  const allResolved = unresolvedCount === 0 && rows.length > 0;

  // Row partitions (§4.1). Order within each list is preserved.
  //   - publishRows  → clean (staged/applied) → the publish GRID.
  //   - blockingRows → hard-fail / live-conflict / discard → "Needs your attention".
  //   - ignored / deferred / skipped → their own de-emphasized set-aside sections
  //     BELOW the grid, so these resolved, non-publishable rows never sit inside it.
  const publishRows = rows.filter((r) => isCleanRow(r.status));
  const blockingRows = rows.filter((r) => isBlocking(r.status));
  const blockingCount = blockingRows.length;
  const ignoredRows = rows.filter((r) => r.status === "permanent_ignore");
  const deferredRows = rows.filter((r) => r.status === "defer_until_modified");
  const skippedRows = rows.filter((r) => r.status === "skipped_non_sheet");
  const hasSetAside = ignoredRows.length + deferredRows.length + skippedRows.length > 0;

  // Accordion: at most ONE card's detail open at a time. The open card's CELL spans
  // the full grid width (lg:col-span-2 xl:col-span-3) while the grid STAYS
  // multi-column; `grid-flow-row-dense` backfills the gap the wide cell would
  // otherwise leave, so only the open card goes full-width and the rest keep their
  // grid positions (previously the whole grid collapsed to one column). null = all
  // collapsed.
  const [expandedDfid, setExpandedDfid] = useState<string | null>(null);

  // Lifted publish-intent: ONE optimistic overlay shared by the header's Select-all,
  // the live count, and every per-card checkbox. `overlay[dfid]` (when present) is
  // the in-flight intent; otherwise the box reflects the server status. Select-all
  // writes the overlay for every clean row at once, so all boxes flip instantly —
  // independent of when router.refresh() lands. (The select-all-doesn't-stick bug:
  // the per-box state used to update only when a refresh re-keyed each box, which
  // raced/failed in the real app and left the cards unchecked until a manual click.)
  const [overlay, setOverlay] = useState<Record<string, boolean>>({});
  const [pendingDfids, setPendingDfids] = useState<ReadonlySet<string>>(new Set());
  const [selectAllPending, setSelectAllPending] = useState(false);

  // Reconcile during render (React's "adjust state when a prop changes" pattern —
  // not an effect): when a refresh delivers a NEW `rows` reference, drop overlay
  // entries that now match the server status (the server is the source of truth, so
  // a stale overlay can't mask a later server-side change). Entries that still
  // differ (refresh not yet landed / write in flight) persist. A same-reference
  // re-render (Step3Review's own setState) leaves the overlay untouched, which is
  // what makes the optimistic Select-all stick without depending on a refresh.
  const [reconciledRows, setReconciledRows] = useState(rows);
  if (reconciledRows !== rows) {
    setReconciledRows(rows);
    setOverlay((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<string, boolean> = {};
      for (const row of rows) {
        const o = prev[row.driveFileId];
        if (o !== undefined && o !== (row.status === "applied")) next[row.driveFileId] = o;
      }
      return next;
    });
  }

  const isChecked = (row: Step3Row): boolean =>
    row.driveFileId in overlay ? !!overlay[row.driveFileId] : row.status === "applied";

  const appliedCount = publishRows.filter(isChecked).length;
  const cleanCount = publishRows.length;
  const allChecked = cleanCount > 0 && appliedCount === cleanCount;

  async function postApproval(driveFileId: string, next: boolean): Promise<boolean> {
    const action = next ? "approve" : "unapprove";
    try {
      const res = await fetch(
        `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/${action}`,
        { method: "POST" },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  function setPending(driveFileId: string, on: boolean) {
    setPendingDfids((prev) => {
      const next = new Set(prev);
      if (on) next.add(driveFileId);
      else next.delete(driveFileId);
      return next;
    });
  }

  async function toggleOne(driveFileId: string, next: boolean): Promise<void> {
    if (pendingDfids.has(driveFileId)) return; // §4.6 guard
    setOverlay((o) => ({ ...o, [driveFileId]: next })); // optimistic
    setPending(driveFileId, true);
    const ok = await postApproval(driveFileId, next);
    if (!ok) setOverlay((o) => ({ ...o, [driveFileId]: !next })); // revert on failure
    setPending(driveFileId, false);
    router.refresh();
  }

  async function toggleSelectAll(): Promise<void> {
    if (selectAllPending || cleanCount === 0) return; // §4.6 guard
    const next = !allChecked;
    // Only rows whose current state differs from the target are written.
    const targets = publishRows.filter((r) => isChecked(r) !== next);
    setSelectAllPending(true);
    setOverlay((o) => {
      const n = { ...o };
      for (const r of publishRows) n[r.driveFileId] = next; // instant flip for ALL boxes
      return n;
    });
    await Promise.all(
      targets.map(async (r) => {
        const ok = await postApproval(r.driveFileId, next);
        if (!ok) setOverlay((o) => ({ ...o, [r.driveFileId]: !next })); // revert just this one
      }),
    );
    setSelectAllPending(false);
    router.refresh();
  }

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
        <div className="flex items-center gap-2">
          <h2 id="wizard-step3-heading" className="text-2xl font-semibold text-text-strong">
            Review &amp; publish your sheets
          </h2>
          <HelpTooltip
            label="Help: Review and publish your sheets"
            testId="help-affordance--wizard-step3--tooltip"
          >
            <p>
              Each row below is one sheet from your folder. Tick a sheet to publish it now. Leave it
              unchecked to keep it as a draft you can publish later from Unpublished, or clear
              anything that does not belong. Tap What does this mean on any error for a
              plain-language explanation.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/onboarding-wizard#step-3"
                aria-label="Learn more about reviewing your sheets"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          Every sheet we found in your folder is listed below. Tick the shows to publish now; the
          rest stay under Unpublished, where you can publish them whenever you are ready.
        </p>
        {rows.length > 0 ? (
          <Step3PublishHeader
            allChecked={allChecked}
            appliedCount={appliedCount}
            cleanCount={cleanCount}
            pending={selectAllPending}
            onToggleSelectAll={() => void toggleSelectAll()}
          />
        ) : null}
        {/* F1 (§8.1): finishable-aware status. Finish is allowed unless a
            blocking row (hard-fail / live-row conflict) remains. No publish
            COUNT here — that lives on the FinalizeButton (D5). The
            data-all-resolved / data-unresolved-count attributes are retained
            for the wizard chrome + existing tests. */}
        <p
          data-testid="wizard-step3-resolution-status"
          data-all-resolved={allResolved ? "true" : "false"}
          data-unresolved-count={unresolvedCount}
          data-blocking-count={blockingCount}
          className="text-sm text-text-subtle tabular-nums"
        >
          {blockingCount > 0
            ? "Clear the sheets under Needs your attention to finish setup."
            : "You can finish setup whenever you are ready."}
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          data-testid="wizard-step3-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">We did not find any sheets to review.</p>
          <p>
            The folder you shared is empty or has no Google Sheets in it. Add sheets in Drive and
            click &quot;Start over&quot; to scan again.
          </p>
        </div>
      ) : (
        <>
          {/* §4.1 "Needs your attention": a distinct grouped section, set apart
              from the clean publish cards by a heading + a sunken plate, for the
              blocking statuses. Hidden entirely when no blocking row exists.
              Warm-yellow warning treatment (DESIGN.md §1.2 — warning, not red),
              paired with a heading + per-row icon, never a side-stripe.
              Task 6: rendered ABOVE the card grid and spanning the full
              container width (a sibling of the grid, never a grid cell) so the
              blocking rows surface before the publishable cards. */}
          {blockingRows.length > 0 ? (
            <section
              data-testid="wizard-step3-needs-attention"
              aria-labelledby="wizard-step3-needs-attention-heading"
              className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-sunken p-tile-pad"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-warning-text" />
                  <h3
                    id="wizard-step3-needs-attention-heading"
                    className="text-base font-semibold text-text-strong"
                  >
                    Needs your attention
                  </h3>
                </div>
                <p className="text-sm text-text-subtle">
                  These sheets have no show to publish yet. Clear each one to finish setup.
                </p>
              </div>
              <ul className="flex flex-col gap-3">
                {blockingRows.map((row) => (
                  <li key={row.driveFileId}>
                    <RowItem row={row} wizardSessionId={wizardSessionId} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* The publishable (clean) review cards lay out in a responsive grid — 1
              col on mobile, 2 at lg, 3 at xl. `items-start` so each card sizes to
              its own content height (CSS grid defaults to align-items:stretch, which
              we override so a short card never stretches to match the tallest in its
              row — this repo's Tailwind v4 requires every such dimensional
              relationship to be stated explicitly). When a card is open, ONLY its
              cell spans the full width (`lg:col-span-2 xl:col-span-3`); the grid
              stays multi-column and `grid-flow-row-dense` backfills the gap, so the
              other cards keep their grid positions instead of all going full-width. */}
          {publishRows.length > 0 ? (
            <ul
              data-testid="wizard-step3-card-grid"
              className="grid grid-flow-row-dense grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-3"
            >
              {publishRows.map((row) => (
                <li
                  key={row.driveFileId}
                  className={
                    expandedDfid === row.driveFileId ? "lg:col-span-2 xl:col-span-3" : undefined
                  }
                >
                  <RowItem
                    row={row}
                    wizardSessionId={wizardSessionId}
                    expanded={expandedDfid === row.driveFileId}
                    onToggleExpanded={() =>
                      setExpandedDfid((cur) => (cur === row.driveFileId ? null : row.driveFileId))
                    }
                    checked={isChecked(row)}
                    onToggleChecked={(next) => void toggleOne(row.driveFileId, next)}
                    checkboxPending={pendingDfids.has(row.driveFileId)}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {/* Set-aside groups: rows that are NOT publishable and need no action,
              each in its OWN section (hidden when empty), BELOW the publish grid so
              they never sit inside it. Quiet, de-emphasized treatment. */}
          {hasSetAside ? (
            <div className="flex flex-col gap-6">
              <SetAsideSection
                testId="wizard-step3-ignored"
                heading="Permanently ignored"
                description="These stay out of setup. No action needed."
                rows={ignoredRows}
                wizardSessionId={wizardSessionId}
              />
              <SetAsideSection
                testId="wizard-step3-deferred"
                heading="Deferred until modified"
                description="These come back for review the next time the sheet changes in Drive."
                rows={deferredRows}
                wizardSessionId={wizardSessionId}
              />
              <SetAsideSection
                testId="wizard-step3-skipped"
                heading="Skipped"
                description="Not a Google Sheet, so there is nothing to publish. No action needed."
                rows={skippedRows}
                wizardSessionId={wizardSessionId}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
