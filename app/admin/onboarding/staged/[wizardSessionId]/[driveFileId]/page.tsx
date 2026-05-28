/**
 * app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx
 * (M10 §B Task 10.1 §B / Phase 2 / Cluster I-7)
 *
 * Wizard-scoped staged review surface for per-row finalize failures
 * (and any other wizard-partition row in wizard_approved = FALSE
 * state). Reached via the FinalizeButton / ResumeFinalizeButton's
 * re-apply links and the Step3Review "Review and apply" link.
 *
 * Per plan §M10 Task 10.1 §B finding 2:
 *   - Server Component, admin-gated by app/admin/layout.tsx (we re-call
 *     requireAdmin here defensively).
 *   - SELECT pending_syncs WHERE wizard_session_id = $wsid AND
 *     drive_file_id = $dfid AND wizard_approved = FALSE.
 *   - Row-not-found → 404 with STALE_DISCARD_REJECTED context.
 *   - Row-found → render <StagedReviewCard mode='wizard_failed_reapply' />
 *     with last_finalize_failure_code surfaced via messageFor.
 *
 * The §9.2 1–3 informational sub-sections do NOT render here — same
 * rationale as the live /admin/show/staged/[stagedId] route (no
 * `shows` row exists yet for failed wizard rows; existing-show
 * re-applies have their own /admin/show/[slug] entry point).
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";

export const dynamic = "force-dynamic";
export const metadata = { title: "Re-apply staged sheet · Admin · FXAV" };

type PageProps = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type WizardStagedRow = {
  staged_id: string;
  drive_file_id: string;
  staged_modified_time: string;
  base_modified_time: string | null;
  parse_result: { show?: { title?: string | null } } | null;
  triggered_review_items: unknown;
  last_finalize_failure_code: string | null;
  source_kind: "cron" | "push" | "manual" | "onboarding_scan";
};

function summaryFromParseResult(
  parseResult: WizardStagedRow["parse_result"],
): string | undefined {
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

export default async function WizardStagedReapplyPage({ params }: PageProps) {
  await requireAdmin();
  const { wizardSessionId, driveFileId } = await params;

  const result = await fetchWizardStagedRow(wizardSessionId, driveFileId);

  if (result !== null && typeof result === "object" && "kind" in result && result.kind === "infra_error") {
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
            The admin database query failed. Refresh in a moment. If this
            keeps happening, contact the developer.
          </p>
        </header>
      </main>
    );
  }

  if (result === null) {
    // Row not found — likely re-applied by a sibling tab or discarded.
    notFound();
  }

  const row = result as WizardStagedRow;

  const parsedReviewItems = parseTriggeredReviewItems(row.triggered_review_items);
  const stagedRow: StagedRow = {
    driveFileId: row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    stagedModifiedTime: row.staged_modified_time,
    baseModifiedTime: row.base_modified_time,
    warningSummary: "",
    triggeredReviewItems: parsedReviewItems.ok ? parsedReviewItems.items : [],
    reviewItemsCorrupt: !parsedReviewItems.ok,
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
        <h2 className="text-2xl font-semibold text-text-strong">
          Re-apply this sheet
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          The last publish attempt could not finish this sheet. Re-make any
          choices below and click Apply, or set the sheet aside.
        </p>
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
