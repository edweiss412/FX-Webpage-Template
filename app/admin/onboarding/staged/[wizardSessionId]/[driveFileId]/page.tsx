/**
 * app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx
 * (M10 §B Task 10.1 §B / Phase 2 / Cluster I-7)
 *
 * Wizard-scoped staged review surface for per-row finalize failures
 * (and any other wizard-partition row in wizard_approved = FALSE
 * state). Reached via the FinalizeButton / ResumeFinalizeButton's
 * re-apply links. (The Step3Review "Review and apply" link was removed
 * in D2 — first-review now renders inline, so this page is
 * failure-recovery-only; its heading is conditional on
 * last_finalize_failure_code per D6 / §8.3.)
 *
 * Per plan §M10 Task 10.1 §B finding 2:
 *   - Server Component, admin-gated by app/admin/layout.tsx (we re-call
 *     requireAdmin here defensively).
 *   - SELECT pending_syncs WHERE wizard_session_id = $wsid AND
 *     drive_file_id = $dfid AND wizard_approved = FALSE.
 *   - Row-not-found / malformed session id → rendered "already resolved"
 *     state page (F3, onboarding-fixups spec §5) — the normal post-Apply
 *     state, not a 404.
 *   - Row-found → render <StagedReviewCard mode='wizard_failed_reapply' />
 *     with last_finalize_failure_code surfaced via messageFor.
 *
 * The §9.2 1–3 informational sub-sections do NOT render here — same
 * rationale as the live /admin/show/staged/[stagedId] route (no
 * `shows` row exists yet for failed wizard rows; existing-show
 * re-applies have their own /admin/show/[slug] entry point).
 */
import { cache } from "react";
import Link from "next/link";
import type { ParseWarning } from "@/lib/parser/types";
import { operatorActionableWarnings } from "@/lib/parser/dataGaps";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { isStructurallyValidReviewItem } from "@/lib/staging/reviewPayloadGuards";

export const dynamic = "force-dynamic";

// Tab titles follow the sibling-page "X · Admin · FXAV" form (e.g.
// app/admin/show/staged/[stagedId]/page.tsx:34). The resolved branch gets its
// own title — a static "Re-apply staged sheet" tab label is misleading when
// the body says nothing is left to re-apply (impeccable MEDIUM).
const REAPPLY_TITLE = "Re-apply staged sheet · Admin · FXAV";
const RESOLVED_TITLE = "Sheet already resolved · Admin · FXAV";

type PageProps = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type WizardStagedRow = {
  staged_id: string;
  drive_file_id: string;
  staged_modified_time: string;
  base_modified_time: string | null;
  parse_result: { show?: { title?: string | null }; warnings?: ParseWarning[] } | null;
  triggered_review_items: unknown;
  last_finalize_failure_code: string | null;
  source_kind: "cron" | "push" | "manual" | "onboarding_scan";
};

// pending_syncs.wizard_session_id is uuid — a malformed id would 400 at PostgREST
// and surface as a FAKE infra error. Treat it as indistinguishable-from-consumed
// (spec §5 guard conditions; no row-existence leak). Local-const convention per
// lib/auth/picker/cookieEnvelope.ts:6.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// F3 (spec §5): the row being gone is the NORMAL post-Apply state (stale tab /
// back-nav) — render a calm resolved page, not a 404. State page, not an error
// code: no §12.4 row (invariant 5 vacuously satisfied).
function AlreadyResolvedState() {
  return (
    <main
      data-testid="wizard-staged-reapply-resolved"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-text-strong">
          This sheet is already taken care of.
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          It was applied or set aside, possibly from another tab. Nothing else is needed here.
        </p>
      </header>
      <nav aria-label="Wizard navigation" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/admin/onboarding"
          data-testid="wizard-staged-resolved-back-to-setup"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Back to setup
        </Link>
        <Link
          href="/admin"
          data-testid="wizard-staged-resolved-go-to-dashboard"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Go to dashboard
        </Link>
      </nav>
    </main>
  );
}

function summaryFromParseResult(parseResult: WizardStagedRow["parse_result"]): string | undefined {
  if (!parseResult || typeof parseResult !== "object") return undefined;
  const title = parseResult.show?.title;
  return typeof title === "string" && title.length > 0 ? title : undefined;
}

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function fetchWizardStagedRow(
  wizardSessionId: string,
  driveFileId: string,
): Promise<WizardStagedRow | null | { kind: "infra_error"; message: string }> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, base_modified_time, parse_result, triggered_review_items, last_finalize_failure_code, source_kind",
      )
      .eq("wizard_session_id", wizardSessionId)
      .eq("drive_file_id", driveFileId)
      .eq("wizard_approved", false)
      .maybeSingle();
    if (error) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${error.message}`,
      };
    }
    if (!data) return null;
    return data as unknown as WizardStagedRow;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Per-request dedupe so generateMetadata + the page body share ONE
// pending_syncs query (React request cache; passthrough outside a request).
const fetchWizardStagedRowCached = cache(fetchWizardStagedRow);

export async function generateMetadata({ params }: PageProps) {
  const { wizardSessionId, driveFileId } = await params;
  // Mirrors the page's branch logic: malformed id short-circuits pre-query
  // (uuid column — PostgREST would 400); row gone = resolved. Infra errors
  // keep the re-apply title — the body renders the retry cue.
  if (!UUID_RE.test(wizardSessionId)) {
    return { title: RESOLVED_TITLE };
  }
  const result = await fetchWizardStagedRowCached(wizardSessionId, driveFileId);
  if (result === null) {
    return { title: RESOLVED_TITLE };
  }
  return { title: REAPPLY_TITLE };
}

export default async function WizardStagedReapplyPage({ params }: PageProps) {
  await requireAdmin();
  const { wizardSessionId, driveFileId } = await params;

  // Malformed session id: indistinguishable from consumed without leaking row
  // existence — same state page, and never sent to PostgREST (uuid column).
  if (!UUID_RE.test(wizardSessionId)) {
    return <AlreadyResolvedState />;
  }

  const result = await fetchWizardStagedRowCached(wizardSessionId, driveFileId);

  if (
    result !== null &&
    typeof result === "object" &&
    "kind" in result &&
    result.kind === "infra_error"
  ) {
    return (
      <main
        data-testid="wizard-staged-reapply-infra-error"
        className="mx-auto flex max-w-2xl flex-col gap-section-gap"
      >
        <header className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold text-text-strong">
            We could not load that staged sheet.
          </h2>
          <p className="max-w-prose text-base text-text-subtle">
            This is usually temporary. Refresh in a moment. If it keeps happening, contact the
            developer.
          </p>
        </header>
      </main>
    );
  }

  if (result === null) {
    // Row gone = applied or set aside (possibly another tab) — the normal
    // post-Apply state, not an error (F3, spec §5).
    return <AlreadyResolvedState />;
  }

  const row = result as WizardStagedRow;

  // WM-R7 finding 2: array-level `ok` is not enough — bare-cast ELEMENTS
  // (`[null]`, missing-field objects) crash StagedReviewCard's
  // `item.id`/`item.invariant` derefs and kill the recovery page. Run the
  // shared element guard (lib/staging/reviewPayloadGuards.ts) and fail closed
  // into the card's existing corrupt state, mirroring the Apply-path
  // STAGED_REVIEW_ITEMS_CORRUPT posture.
  const parsedReviewItems = parseTriggeredReviewItems(row.triggered_review_items);
  const reviewItems =
    parsedReviewItems.ok && parsedReviewItems.items.every(isStructurallyValidReviewItem)
      ? parsedReviewItems.items
      : null;
  const stagedRow: StagedRow = {
    driveFileId: row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    stagedModifiedTime: row.staged_modified_time,
    baseModifiedTime: row.base_modified_time,
    warningSummary: "",
    operatorActionable: operatorActionableWarnings(
      Array.isArray(row.parse_result?.warnings) ? row.parse_result!.warnings : [],
    ),
    triggeredReviewItems: reviewItems ?? [],
    reviewItemsCorrupt: reviewItems === null,
    ...(summaryFromParseResult(row.parse_result) !== undefined
      ? { parseSummaryLine: summaryFromParseResult(row.parse_result)! }
      : {}),
  };

  return (
    <main
      data-testid="wizard-staged-reapply-page"
      data-wizard-session-id={wizardSessionId}
      data-drive-file-id={driveFileId}
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <nav aria-label="Wizard navigation">
        <Link
          href="/admin"
          data-testid="wizard-staged-reapply-back"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          ← Back to setup
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Setup
        </p>
        {/* D6 (§8.3): the failure heading + subcopy are conditional on
            last_finalize_failure_code. Since the D2 link removal, first-review
            traffic no longer routes here, so a row reached WITHOUT a finalize
            failure gets neutral copy — never the "last publish attempt could
            not finish" claim that didn't happen. State page, no §12.4 code. */}
        {row.last_finalize_failure_code !== null ? (
          <>
            <h2 className="text-2xl font-semibold text-text-strong">Re-apply this sheet</h2>
            <p className="max-w-prose text-base text-text-subtle">
              The last publish attempt could not finish this sheet. Re-make any choices below and
              click Apply, or set the sheet aside.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-text-strong">Re-review this sheet</h2>
            <p className="max-w-prose text-base text-text-subtle">
              Re-make any choices below and click Apply, or set the sheet aside.
            </p>
          </>
        )}
      </header>

      <StagedReviewCard
        row={stagedRow}
        mode="wizard_failed_reapply"
        wizardSessionId={wizardSessionId}
        lastFinalizeFailureCode={row.last_finalize_failure_code}
      />
    </main>
  );
}
