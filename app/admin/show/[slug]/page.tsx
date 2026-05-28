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
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { ParsePanel } from "@/components/admin/ParsePanel";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { PerShowCrewSection } from "@/components/admin/PerShowCrewSection";
import { ReSyncButton } from "@/components/admin/ReSyncButton";
import { CurrentShareLinkPanel } from "./CurrentShareLinkPanel";
import { ResetPickerEpochButton } from "./ResetPickerEpochButton";
import { RotateShareTokenButton } from "./RotateShareTokenButton";
import type { PerShowCrewRow } from "@/components/admin/PerShowCrewSection";
import type { StagedRow } from "@/components/admin/StagedReviewCard";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";

export const dynamic = "force-dynamic";

type ShowLookupRow = {
  id: string;
  slug: string;
  title: string;
  drive_file_id: string;
  published: boolean;
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

type CrewMemberRow = {
  id: string;
  name: string;
  role: string | null;
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

export default async function AdminShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ alert_id?: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  // AGENTS.md §1.9: every Supabase await wraps in try/catch so a thrown
  // infra fault (auth expiration, network reset, RLS reject mid-query)
  // surfaces as the same Error("<surface>_lookup_failed") this file
  // already throws on the returned `.error` branch — Next.js routes
  // both through the same error boundary. Client construction is also
  // wrapped so a thrown service-client construction failure does not
  // leak as a raw framework exception.
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    console.error(
      "[/admin/show/[slug]] supabase client construction threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("supabase_client_construction_failed");
  }

  let show: ShowLookupRow | null;
  try {
    const { data, error: showError } = await supabase
      .from("shows")
      .select("id, slug, title, drive_file_id, published")
      .eq("slug", slug)
      .maybeSingle<ShowLookupRow>();
    if (showError) {
      console.error("[/admin/show/[slug]] show lookup failed:", showError.message);
      throw new Error("show_lookup_failed");
    }
    show = data;
  } catch (err) {
    if (err instanceof Error && err.message === "show_lookup_failed") throw err;
    console.error(
      "[/admin/show/[slug]] show lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("show_lookup_failed");
  }
  if (!show) {
    notFound();
  }

  let pendingRows: PendingSyncRow[] | null;
  try {
    const { data, error: pendingError } = await supabase
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
    pendingRows = data;
  } catch (err) {
    if (err instanceof Error && err.message === "pending_syncs_lookup_failed") throw err;
    console.error(
      "[/admin/show/[slug]] pending_syncs lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("pending_syncs_lookup_failed");
  }

  const rows: StagedRow[] = (pendingRows ?? []).map((row) => {
    const summary = deriveParseSummary(row.parse_result);
    const parsed = parseTriggeredReviewItems(row.triggered_review_items);
    const base: StagedRow = {
      driveFileId: row.drive_file_id,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      stagedModifiedTime: row.staged_modified_time,
      baseModifiedTime: row.base_modified_time,
      warningSummary: row.warning_summary,
      triggeredReviewItems: parsed.ok ? parsed.items : [],
      reviewItemsCorrupt: !parsed.ok,
    };
    return summary ? { ...base, parseSummaryLine: summary } : base;
  });

  let crew: PerShowCrewRow[] = [];
  let crewLookupFailed = false;
  try {
    const { data, error } = await supabase
      .from("crew_members")
      .select("id, name, role")
      .eq("show_id", show.id)
      .order("name", { ascending: true })
      .returns<CrewMemberRow[]>();
    if (error) {
      console.error("[/admin/show/[slug]] crew_members lookup failed:", error.message);
      crewLookupFailed = true;
    } else {
      crew = data ?? [];
    }
  } catch (err) {
    console.error(
      "[/admin/show/[slug]] crew_members lookup threw:",
      err instanceof Error ? err.message : String(err),
    );
    crewLookupFailed = true;
  }

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

      <PerShowAlertSection
        showId={show.id}
        slug={show.slug}
        highlightAlertId={sp.alert_id ?? null}
      />

      <section
        data-testid="admin-show-sync-health-section"
        aria-labelledby="admin-show-sync-health-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <h2
            id="admin-show-sync-health-heading"
            className="text-lg font-semibold text-text-strong"
          >
            Sync health
          </h2>
          <HelpTooltip
            label="Help: Sync health"
            testId="help-affordance--per-show-sync-health--tooltip"
          >
            <p>
              When the app last read this show&apos;s sheet from Drive, and
              whether the latest read succeeded. Use Re-sync to fetch the
              sheet again on demand; the dashboard&apos;s show row also
              shows the result of every sync.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/per-show-panel#sync-health"
                aria-label="Learn more about sync health"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <ReSyncButton slug={show.slug} />
      </section>

      <section
        data-testid="admin-show-preview-as-section"
        aria-labelledby="admin-show-preview-as-heading"
        data-published={String(show.published)}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <h2
            id="admin-show-preview-as-heading"
            className="text-lg font-semibold text-text-strong"
          >
            Preview as a crew member
          </h2>
          <HelpTooltip
            label="Help: Preview as a crew member"
            testId="help-affordance--per-show-preview-links--tooltip"
          >
            <p>
              Open the crew page the way one of these crew members sees
              it. A yellow banner at the top reminds you that you are
              previewing. This is the same data Doug sees on the crew
              page, including any role-based redactions.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/preview-as-crew"
                aria-label="Learn more about previewing as a crew member"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        {!show.published ? (
          // Per spec §9.0 amendment: hide preview-as for shows that
          // have not yet been published (the crew-side route gates
          // non-admin viewers behind `published = TRUE`, and
          // `admin_preview` resolves identically to crew inside
          // `getShowForViewer`). Linking from here would 404 the
          // operator on click, which is the broken admin flow the
          // adversarial review flagged.
          <p
            data-testid="admin-show-preview-as-unpublished"
            className="rounded-sm border border-border bg-info-bg p-3 text-sm text-text-subtle"
          >
            This show is not published to crew yet. Preview becomes
            available once publishing finishes.
          </p>
        ) : crewLookupFailed ? (
          <p
            data-testid="admin-show-preview-as-error"
            className="rounded-sm border border-border bg-warning-bg p-3 text-sm text-warning-text"
          >
            We could not load the crew list right now. Refresh the
            page; if the problem repeats, contact the developer.
          </p>
        ) : crew.length === 0 ? (
          <p
            data-testid="admin-show-preview-as-empty"
            className="text-sm text-text-subtle"
          >
            This show has no crew members yet. Once a sync brings them
            in, they will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {crew.map((member) => {
              const id = (member as { id?: string }).id ?? "";
              const name = (member as { name?: string }).name ?? "";
              const role = (member as { role?: string }).role ?? null;
              if (!id || !name) return null;
              return (
                <li
                  key={id}
                  data-testid={`admin-show-preview-as-row-${id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
                >
                  <div className="flex flex-col">
                    <span className="text-base font-semibold text-text-strong">
                      {name}
                    </span>
                    {role ? (
                      <span className="text-xs text-text-subtle">{role}</span>
                    ) : null}
                  </div>
                  <Link
                    data-testid={`admin-show-preview-as-link-${id}`}
                    href={`/admin/show/${encodeURIComponent(show.slug)}/preview/${encodeURIComponent(id)}`}
                    className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    Preview as
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        data-testid="admin-show-parse-warnings-section"
        aria-labelledby="admin-show-parse-warnings-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <h2
            id="admin-show-parse-warnings-heading"
            className="text-lg font-semibold text-text-strong"
          >
            Parse warnings
          </h2>
          <HelpTooltip
            label="Help: Parse warnings"
            testId="help-affordance--per-show-parse-warnings--tooltip"
          >
            <p>
              Anything the app couldn&apos;t auto-apply for this show shows
              up below as a staged review card with the rows that need a
              decision. Apply once you&apos;ve resolved the warning, or
              discard with a reason if the change shouldn&apos;t land.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/parse-warnings"
                aria-label="Learn more about parse warnings"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <ParsePanel rows={rows} showId={show.id} />
      </section>

      <section
        data-testid="admin-share-access-section"
        aria-labelledby="admin-share-access-heading"
        className="space-y-3"
      >
        <h2
          id="admin-share-access-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Share &amp; access
        </h2>
        <p className="max-w-prose text-sm text-text-subtle">
          One share-link reaches the whole crew. Rotate the link if it
          leaks; reset the picker if a crew member needs to re-pick
          their identity (e.g. they tapped the wrong name).
        </p>
        <CurrentShareLinkPanel showId={show.id} slug={show.slug} />
        <div className="flex flex-col items-end gap-4">
          <ResetPickerEpochButton showId={show.id} />
          <RotateShareTokenButton showId={show.id} slug={show.slug} />
        </div>
      </section>

      <PerShowCrewSection
        showId={show.id}
        crew={crew}
        crewLookupFailed={crewLookupFailed}
      />
    </main>
  );
}
