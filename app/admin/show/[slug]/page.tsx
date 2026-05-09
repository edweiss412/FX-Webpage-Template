/**
 * app/admin/show/[slug]/page.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-show admin parse panel. Lists the live `pending_syncs` rows for the
 * show (`AND wizard_session_id IS NULL` — wizard partition is M10's
 * surface) and renders one <StagedReviewCard> per row, plus a "Re-sync"
 * CTA that POSTs to §A's manual-sync route.
 *
 * AlertBanner is mounted by `app/admin/layout.tsx`, so admin alerts
 * surface above the page chrome automatically — no per-page mount.
 *
 * RLS: `requireAdmin()` runs at the layout level AND here as
 * defense-in-depth (per AGENTS.md §1.6 Server Action discipline);
 * `pending_syncs.admin_only` policy gates the SELECT regardless.
 *
 * Server Component (no 'use client'); the Re-sync button and review
 * cards are Client Components mounted as children.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ParsePanel } from "@/components/admin/ParsePanel";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import type { StagedRow } from "@/components/admin/StagedReviewCard";
import type { TriggeredReviewItem } from "@/lib/parser/types";

export const dynamic = "force-dynamic";

type ShowLookupRow = {
  id: string;
  slug: string;
  title: string;
  drive_file_id: string;
};

type PendingSyncRow = {
  staged_id: string;
  drive_file_id: string;
  source_kind: StagedRow["sourceKind"];
  staged_modified_time: string;
  base_modified_time: string | null;
  warning_summary: string;
  triggered_review_items: unknown;
  parse_result: unknown;
};

function safeStringField(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function deriveParseSummary(parseResult: unknown): string | undefined {
  if (parseResult === null || typeof parseResult !== "object") return undefined;
  const show = (parseResult as Record<string, unknown>).show;
  const title = safeStringField(show, "title");
  const client = safeStringField(show, "client_label");
  const parts: string[] = [];
  if (title) parts.push(title);
  if (client) parts.push(client);
  if (parts.length === 0) return undefined;
  return parts.join(" — ");
}

function asTriggeredReviewItems(value: unknown): TriggeredReviewItem[] {
  if (!Array.isArray(value)) return [];
  // Trust the §A producer (Phase 1 emits this jsonb) — the structural
  // contract is enforced upstream. We narrow only enough to satisfy the
  // card prop type; further validation happens at the Apply call.
  return value as TriggeredReviewItem[];
}

export default async function AdminShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();

  const { data: show, error: showError } = await supabase
    .from("shows")
    .select("id, slug, title, drive_file_id")
    .eq("slug", slug)
    .maybeSingle<ShowLookupRow>();

  if (showError) {
    console.error("[/admin/show/[slug]] show lookup failed:", showError.message);
    throw new Error("show_lookup_failed");
  }
  if (!show) {
    notFound();
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from("pending_syncs")
    .select(
      "staged_id, drive_file_id, source_kind, staged_modified_time, base_modified_time, warning_summary, triggered_review_items, parse_result",
    )
    .eq("drive_file_id", show.drive_file_id)
    .is("wizard_session_id", null)
    .order("staged_modified_time", { ascending: false })
    .returns<PendingSyncRow[]>();

  if (pendingError) {
    console.error("[/admin/show/[slug]] pending_syncs lookup failed:", pendingError.message);
    throw new Error("pending_syncs_lookup_failed");
  }

  const rows: StagedRow[] = (pendingRows ?? []).map((row) => {
    const summary = deriveParseSummary(row.parse_result);
    const base: StagedRow = {
      driveFileId: row.drive_file_id,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      stagedModifiedTime: row.staged_modified_time,
      baseModifiedTime: row.base_modified_time,
      warningSummary: row.warning_summary,
      triggeredReviewItems: asTriggeredReviewItems(row.triggered_review_items),
    };
    return summary ? { ...base, parseSummaryLine: summary } : base;
  });

  return (
    <main data-testid="admin-show-page" className="space-y-section-gap">
      <header className="space-y-2">
        <p className="text-sm text-text-subtle">
          <a href="/admin" className="underline underline-offset-2">
            ← Admin home
          </a>
        </p>
        <h1 className="text-2xl font-semibold text-text-strong" data-testid="admin-show-title">
          {show.title}
        </h1>
        <p className="text-sm text-text-subtle">
          Slug: <code className="rounded-sm bg-surface-sunken px-1">{show.slug}</code>
        </p>
      </header>

      <ReSyncButton slug={show.slug} />

      <ParsePanel rows={rows} />
    </main>
  );
}
