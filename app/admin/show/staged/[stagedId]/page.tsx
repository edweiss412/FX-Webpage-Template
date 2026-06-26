/**
 * app/admin/show/staged/[stagedId]/page.tsx
 * (M10 §B Task 10.10 §B / Phase 2 / Cluster I-7)
 *
 * LIVE first-seen staged review page. Renders the review surface for a
 * `pending_syncs` row that has NO matching `shows` row yet (the
 * first-seen path). Reached from the Dashboard Needs-attention inbox's
 * first-seen "Review →" link.
 *
 * Server Component:
 *   - admin-gated by app/admin/layout.tsx (we re-call requireAdmin
 *     defensively).
 *   - SELECT pending_syncs WHERE staged_id = $stagedId AND
 *     wizard_session_id IS NULL (live scope).
 *   - Row-not-found → notFound() (Next.js 404).
 *   - Infra error → cataloged placeholder.
 *   - Row-found → renders <StagedReviewCard mode='first_seen' />.
 *     On apply success the card receives `{ slug }` and redirects to
 *     /admin/show/[slug] (the first slug-bearing URL for this show).
 *
 * Note: this is the LIVE first-seen route (wizard_session_id IS NULL).
 * The wizard-scoped equivalent for failed re-applies lives at
 * /admin/onboarding/staged/[wizardSessionId]/[driveFileId] (Cluster I-7
 * earlier commit).
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { summarizeDataGaps, isDataQualityWarning } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review first-seen sheet · Admin · FXAV" };

type PageProps = {
  params: Promise<{ stagedId: string }>;
};

type LiveFirstSeenRow = {
  staged_id: string;
  drive_file_id: string;
  staged_modified_time: string;
  base_modified_time: string | null;
  // parse-data-quality-warnings §6.1: parse_result carries `.warnings`
  // (the full ParseWarning[]) — the DATA-QUALITY subset feeds the StagedReviewCard
  // surface. (The pre-joined `warning_summary` column is intentionally NOT read —
  // see warningSummaryFor: it can contain a raw non-DQ code, R1 [high].)
  parse_result: {
    show?: { title?: string | null };
    warnings?: ParseWarning[] | null;
  } | null;
  triggered_review_items: unknown;
  source_kind: "cron" | "push" | "manual" | "onboarding_scan";
};

type FetchResult =
  | { kind: "row"; row: LiveFirstSeenRow }
  | { kind: "redirect_to_show"; slug: string; stagedId: string }
  | { kind: "not_found" }
  | { kind: "infra_error"; message: string };

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function fetchLiveFirstSeenRow(stagedId: string): Promise<FetchResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // AGENTS.md §1.9: every Supabase await wraps in try/catch so a thrown
  // infra fault surfaces as the same typed `infra_error` result as the
  // returned `.error` branch — never as an uncaught framework exception.
  let row: LiveFirstSeenRow;
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select(
        "staged_id, drive_file_id, staged_modified_time, base_modified_time, parse_result, triggered_review_items, source_kind",
      )
      .eq("staged_id", stagedId)
      .is("wizard_session_id", null)
      .maybeSingle();
    if (error) {
      return {
        kind: "infra_error",
        message: `pending_syncs query failed: ${error.message}`,
      };
    }
    if (!data) return { kind: "not_found" };
    row = data as unknown as LiveFirstSeenRow;
  } catch (err) {
    return {
      kind: "infra_error",
      message: `pending_syncs query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Existing-show staged rows MUST redirect to the canonical per-show
  // review surface (/admin/show/<slug>?review=<stagedId>). The first-seen
  // page is for staged rows whose drive_file_id has NO `shows` row yet;
  // a live re-stage of an already-live show would otherwise be opened
  // with first-time copy + first-seen apply/discard endpoints instead of
  // the per-show context the operator expects (plan §M10 Task 10.10).
  let showLookupSlug: string | null = null;
  try {
    const showLookup = await supabase
      .from("shows")
      .select("slug")
      .eq("drive_file_id", row.drive_file_id)
      .maybeSingle();
    if (showLookup.error) {
      return {
        kind: "infra_error",
        message: `shows lookup failed: ${showLookup.error.message}`,
      };
    }
    if (showLookup.data && typeof (showLookup.data as { slug?: string }).slug === "string") {
      showLookupSlug = (showLookup.data as { slug: string }).slug;
    }
  } catch (err) {
    return {
      kind: "infra_error",
      message: `shows lookup threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (showLookupSlug !== null) {
    return { kind: "redirect_to_show", slug: showLookupSlug, stagedId };
  }

  return { kind: "row", row };
}

function summaryFromParseResult(parseResult: LiveFirstSeenRow["parse_result"]): string | undefined {
  if (!parseResult || typeof parseResult !== "object") return undefined;
  const title = parseResult.show?.title;
  return typeof title === "string" && title.length > 0 ? title : undefined;
}

// parse-data-quality-warnings §6.1 — build the warning text for the
// StagedReviewCard from the staged row's DATA-QUALITY warnings only.
//
// Whole-diff review R1 [high] class-sweep: we deliberately do NOT surface the
// pre-joined phase1 `warning_summary` string. That string joins EVERY warn-severity
// `.message`, and a non-DQ producer (asset reelWarning()) emits a warn warning whose
// `.message` IS the raw code — so the joined string can contain a raw §12.4 code that
// cannot be filtered out post-join (invariant 5). Building from the parse_result
// warnings array, gated by `isDataQualityWarning`, makes this surface leak-proof and
// consistent with the per-show panel + the dataGaps breakdown. (Pre-Task-7 this card
// showed `""`, so DQ-only is strictly more than before — never a regression.)
function warningSummaryFor(row: LiveFirstSeenRow): string {
  const warnings = row.parse_result?.warnings;
  if (!Array.isArray(warnings)) return "";
  return warnings
    .filter(isDataQualityWarning)
    .map((w) => w.message)
    .filter((m): m is string => typeof m === "string" && m.length > 0)
    .join("; ");
}

/**
 * Map a live first-seen `pending_syncs` row to the StagedReviewCard's `StagedRow`
 * (parse-data-quality-warnings Task 7 / §6.1). Exported so the data-gap surfacing
 * is unit-testable against the SEEDED warning array (anti-tautology) without a
 * full server-component render. Replaces the prior `warningSummary: ""` hardcode.
 */
export function stagedRowFromLiveFirstSeen(row: LiveFirstSeenRow): StagedRow {
  const parsedReviewItems = parseTriggeredReviewItems(row.triggered_review_items);
  const warnings = Array.isArray(row.parse_result?.warnings) ? row.parse_result!.warnings! : [];
  const summaryLine = summaryFromParseResult(row.parse_result);
  return {
    driveFileId: row.drive_file_id,
    stagedId: row.staged_id,
    sourceKind: row.source_kind,
    stagedModifiedTime: row.staged_modified_time,
    baseModifiedTime: row.base_modified_time,
    warningSummary: warningSummaryFor(row),
    dataGaps: summarizeDataGaps(warnings as ParseWarning[]),
    triggeredReviewItems: parsedReviewItems.ok ? parsedReviewItems.items : [],
    reviewItemsCorrupt: !parsedReviewItems.ok,
    ...(summaryLine !== undefined ? { parseSummaryLine: summaryLine } : {}),
  };
}

export default async function LiveFirstSeenStagedPage({ params }: PageProps) {
  await requireAdmin();
  const { stagedId } = await params;

  const result = await fetchLiveFirstSeenRow(stagedId);

  if (result.kind === "infra_error") {
    return (
      <main
        data-testid="live-first-seen-staged-infra-error"
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

  if (result.kind === "redirect_to_show") {
    redirect(
      `/admin/show/${encodeURIComponent(result.slug)}?review=${encodeURIComponent(result.stagedId)}`,
    );
  }

  if (result.kind === "not_found") {
    notFound();
  }

  const row = result.row;

  const stagedRow = stagedRowFromLiveFirstSeen(row);

  return (
    <main
      data-testid="live-first-seen-staged-page"
      data-staged-id={stagedId}
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <nav aria-label="Admin navigation">
        <Link
          href="/admin"
          data-testid="live-first-seen-staged-back"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          ← Back to dashboard
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">Review this sheet</h2>
        <p className="max-w-prose text-base text-text-subtle">
          This is the first time we have seen this sheet. Approve the parsed details and it goes
          live, or set it aside.
        </p>
      </header>

      <StagedReviewCard row={stagedRow} mode="first_seen" />
    </main>
  );
}
