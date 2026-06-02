/**
 * components/admin/PendingPanel.tsx (M10 §B Task 10.6 / Phase 2)
 *
 * Panel 2 of the /admin Dashboard per spec §9.1. Combined queue of:
 *   - LIVE pending_ingestions rows (hard-failed parses on the watched
 *     folder). Actions: Retry now, Discard (defer-until-modified or
 *     permanently-ignore).
 *   - LIVE first-seen pending_syncs rows (sheets parsed-but-staged with
 *     no shows row yet). Action: "Review and Apply" routes to
 *     /admin/show/staged/[stagedId].
 *
 * Server Component shell with thin client islands for each action
 * button. POSTs to the Pin-2 LIVE routes only:
 *   /api/admin/pending-ingestions/[id]/retry
 *   /api/admin/pending-ingestions/[id]/discard
 *
 * AdminAlertsBanner per-show resolve cross-show-forgery rule (plan §M10
 * Task 10.6): this panel never sends per-show admin_alerts requests to
 * the global resolve route — show-scoped alerts are resolved from the
 * per-show panel (§9.2).
 */
import Link from "next/link";
import { PendingPanelRetryButton } from "@/components/admin/PendingPanelRetryButton";
import { PendingPanelDiscardButtons } from "@/components/admin/PendingPanelDiscardButtons";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

export type PendingIngestionRow = {
  id: string;
  driveFileId: string;
  driveFileName: string | null;
  firstSeenAt: string | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type FirstSeenStagedRow = {
  stagedId: string;
  driveFileId: string;
  candidateTitle: string | null;
  stagedModifiedTime: string | null;
};

type PendingPanelProps = {
  pendingIngestions: PendingIngestionRow[];
  firstSeenStaged: FirstSeenStagedRow[];
};

export function PendingPanel({
  pendingIngestions,
  firstSeenStaged,
}: PendingPanelProps) {
  const isEmpty = pendingIngestions.length === 0 && firstSeenStaged.length === 0;

  return (
    <section
      data-testid="admin-pending-panel"
      aria-labelledby="pending-panel-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <h3
          id="pending-panel-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Sheets we couldn&rsquo;t auto-apply
        </h3>
        <HelpTooltip
          label="Help: Sheets we couldn't auto-apply"
          testId="help-affordance--dashboard-pending-ingestion--tooltip"
        >
          <p>
            New sheets land here for first-time review, and any sheet we
            failed to parse stays here until you decide what to do. Use
            Review and apply for a clean new sheet, or Retry, Defer, or
            Ignore for a sheet that failed. Anything you decide here
            disappears from this list right away.
          </p>
          <p className="mt-2">
            <a
              href="/help/admin/review-queues#first-seen"
              aria-label="Learn more about sheets we couldn't auto-apply"
              className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Learn more →
            </a>
          </p>
        </HelpTooltip>
      </div>

      {isEmpty ? (
        <div
          data-testid="admin-pending-panel-empty"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-base text-text-subtle"
        >
          <p className="font-semibold text-text-strong">
            Nothing waiting on you.
          </p>
          <p>
            New sheets that hit a parse problem or need first-time review
            will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {firstSeenStaged.map((row) => (
            <li
              key={row.stagedId}
              data-testid={`admin-pending-first-seen-${row.stagedId}`}
              className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex flex-col gap-0.5 sm:flex-1">
                <p className="text-base font-semibold text-text-strong">
                  {row.candidateTitle ?? row.driveFileId}
                </p>
                <p className="text-sm text-text-subtle">
                  {/* §4.3 / AC-B2.9: catalog-driven copy (invariant 5 — no raw
                      codes). When auto-publish is OFF, a clean first-seen sheet
                      stages with the reused FIRST_SEEN_REVIEW sentinel and waits
                      for approval; this is the per-staged inbox line. */}
                  {messageFor("SHOW_AWAITING_PUBLISH_APPROVAL").dougFacing}
                </p>
              </div>
              <Link
                data-testid={`admin-pending-first-seen-review-${row.stagedId}`}
                href={`/admin/show/staged/${encodeURIComponent(row.stagedId)}`}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Review and apply
              </Link>
            </li>
          ))}
          {pendingIngestions.map((row) => (
            <li
              key={row.id}
              data-testid={`admin-pending-ingestion-${row.id}`}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
            >
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-text-strong">
                  {row.driveFileName ?? row.driveFileId}
                </p>
                <p className="text-sm text-text-subtle">
                  {lookupDougFacing(row.errorCode) ??
                    row.errorMessage ??
                    "We could not parse this sheet."}
                </p>
                <HelpAffordance code={row.errorCode} />
                <p className="text-xs text-text-subtle tabular-nums">
                  attempts: {row.attemptCount}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PendingPanelRetryButton pendingIngestionId={row.id} />
                <PendingPanelDiscardButtons pendingIngestionId={row.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
