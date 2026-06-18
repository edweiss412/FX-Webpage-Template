/**
 * app/show/[slug]/[shareToken]/_CrewShell.tsx (Task 11)
 *
 * The crew-page section shell — the full redesigned crew show page body
 * (§4.1). Composes:
 *   Header (identityChip) → CrewSubNav → ShowRealtimeBridge → the active
 *   section (wrapped in CrewSectionTransition; the Today section leads with the
 *   RightNowHero) → Footer (per-viewer-kind report props).
 *
 * It OWNS two cross-cutting producer contracts, both verbatim from the prior
 * page bodies:
 *
 *   1. Projection-fetch observability alert (Task 8 / R5-HIGH-1 / R3-HIGH-1 /
 *      R7-HIGH). When the projection carries one or more tileErrors, the shell
 *      fires ONE best-effort admin_alerts write with code
 *      TILE_PROJECTION_FETCH_FAILED, BEFORE and INDEPENDENT of which section is
 *      active. The per-domain detail lives in context.failedKeys (sorted); the
 *      message is a viewer-independent CONSTANT so the row is dedupe-stable and
 *      carries no viewer/version identifiers. The write uses the showId PROP
 *      (ShowRow has no id field) and is fail-quiet.
 *
 *   2. Fail-closed on a malformed projection (ported from _ShowBody.tsx:113-121).
 *      When crewMembers is not an array for a crew/admin_preview viewer,
 *      resolveViewerContext throws the typed MalformedProjectionError; we render
 *      the route's infra arm (<TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />,
 *      no retryHref per §4.14) rather than an unrestricted page.
 *
 * Sections are Phase 3 — every section is a minimal placeholder here; only the
 * Today section additionally leads with the live RightNowHero.
 */
import { IdentityChip } from "@/components/auth/IdentityChip";
import { TerminalFailure } from "@/components/auth/TerminalFailure";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";
import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { RightNowHero } from "@/components/crew/RightNowHero";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { resolveActiveSection } from "@/lib/crew/resolveActiveSection";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import {
  MalformedProjectionError,
  resolveViewerContext,
  type ViewerContext,
} from "@/lib/data/viewerContext";
import { nowDate } from "@/lib/time/now";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

export type CrewShellProps = {
  data: ShowForViewer;
  viewer: Viewer;
  showId: string;
  rawSection: string | undefined;
  /**
   * Crew page slug. Threaded into the IdentityChip recovery form, the
   * realtime bridge's token endpoint, and the per-instance footer report
   * surfaceId. The real call sites (the tokenized crew route + the admin
   * preview-as route) always supply it; it is optional only so the Task-8
   * minimal-producer test (crewShellAlert.test.tsx — which exercises the
   * section-independent alert with an admin viewer and no chrome) keeps
   * compiling without it. Falls back to "" when omitted.
   */
  slug?: string;
  shareToken?: string;
  identityChip?: {
    name: string;
    role: string;
    shareToken: string;
  } | null;
};

// R3-HIGH-1: viewer-independent CONSTANT message — the per-domain detail lives
// in context.failedKeys. Keeping the message constant makes the alert
// dedupe-stable (the upsert keys on show_id + code) and carries no
// viewer/version identifiers.
const PROJECTION_ALERT_MESSAGE =
  "One or more crew-page data sources failed to load; the affected domains are listed in the alert detail.";

export async function CrewShell({
  data,
  viewer,
  showId,
  rawSection,
  slug = "",
  identityChip,
}: CrewShellProps) {
  // ── Producer contract 1: section-independent projection-fetch alert ──
  // Fires BEFORE the section model so the always-on observability write is
  // never gated on which section the viewer requested (Task 16).
  const failedKeys = Object.keys(data.tileErrors).sort();
  if (failedKeys.length > 0) {
    try {
      // not-subject-to-meta: best-effort observability write, fail-quiet
      await upsertAdminAlert({
        showId, // R7-HIGH: the showId PROP, never data.show.id (ShowRow has no id)
        code: "TILE_PROJECTION_FETCH_FAILED",
        context: {
          sheet_name: data.show.title,
          tileId: "crew:projection-alert",
          message: PROJECTION_ALERT_MESSAGE,
          failedKeys,
        },
      });
    } catch (e) {
      console.warn("[CrewShell] projection-alert upsert failed (fail-quiet):", e);
    }
  }

  // ── Producer contract 2: fail CLOSED on a malformed projection ──
  // Ported verbatim from _ShowBody.tsx:113-121. A crewMembers field that is not
  // an array for a crew/admin_preview viewer means per-crew restrictions could
  // not be verified; routing into none-restrictions would be fail-OPEN, so we
  // render the route's infra TerminalFailure arm instead. No retryHref (§4.14).
  let ctx: ViewerContext;
  try {
    ctx = resolveViewerContext(viewer, data);
  } catch (err) {
    if (err instanceof MalformedProjectionError) {
      return <TerminalFailure code="PICKER_RESOLVER_LOOKUP_FAILED" />;
    }
    throw err;
  }

  // Single financialsVisible authority for the Budget gate — used identically by
  // the sub-nav (tab presence) and resolveActiveSection (section + direct-URL).
  const budgetVisible = financialsVisible(ctx.viewerFlags, ctx.isAdmin);
  const activeSection = resolveActiveSection(rawSection, { budgetVisible });

  // Render-time "today" reads through the request-scoped clock so screenshot
  // capture can pin it (M11 Phase C). Sections consume `today` in Phase 3; the
  // Today section's RightNowHero owns its own live clock and does not take it.
  await nowDate();

  // Today leads with the live RightNowHero, built from the projection exactly as
  // _ShowBody.tsx:122-127 does. Every other section is a Phase-3 placeholder.
  //
  // Guard-condition discipline (partial data must render): a well-formed
  // ShowForViewer always carries `show.dates` and array `hotelReservations` /
  // `rooms` (getShowForViewer guarantees them), but the hero's context builder
  // dereferences all three, so a degraded/partial projection would otherwise
  // crash the whole Today page. When the projection is too thin to derive a
  // Right Now state, the Today section falls back to the bare placeholder rather
  // than throwing.
  const canBuildRightNow = Boolean(data.show?.dates);

  // Build the Right-Now context ONCE (when the projection is well-formed enough):
  // the Today section leads with it (RightNowHero) AND the Footer's bug-report
  // autocapture carries it as `rightNowState` for BOTH viewer kinds — verbatim
  // parity with _ShowBody.tsx:520-531, where every report (crew or admin-preview)
  // captures the server-built Right-Now context for triage. Null only in the
  // degraded case the guard above protects.
  const rightNowCtx = canBuildRightNow
    ? buildRightNowContext({
        show: data.show,
        dateRestriction: ctx.dateRestriction,
        hotelReservations: data.hotelReservations ?? [],
        rooms: data.rooms ?? [],
      })
    : null;

  // Guard-condition discipline: Header dereferences `show.dates` (`.set` /
  // `.travelIn` / `.showDays[0]`) and `show.venue`. A well-formed ShowForViewer
  // always carries a full ShowRow, but a degraded/partial projection (or a
  // minimal test fixture) may omit `dates`/`venue` — without this normalization
  // the header would throw and take down the whole page. Defaults are
  // all-empty (no invented content); the real path is untouched.
  const headerShow = {
    title: data.show.title,
    client_label: data.show.client_label ?? null,
    dates: data.show.dates ?? {
      travelIn: null,
      set: null,
      showDays: [],
      travelOut: null,
    },
    venue: data.show.venue ?? null,
  };

  const sectionBody =
    activeSection === "today" ? (
      <>
        {rightNowCtx ? <RightNowHero context={rightNowCtx} /> : null}
        <section data-testid={`section-${activeSection}`}>{activeSection}</section>
      </>
    ) : (
      <section data-testid={`section-${activeSection}`}>{activeSection}</section>
    );

  return (
    <div data-testid="crew-shell" data-active-section={activeSection}>
      <Header
        show={headerShow}
        identityChip={
          identityChip ? (
            <IdentityChip
              name={identityChip.name}
              role={identityChip.role}
              slug={slug}
              shareToken={identityChip.shareToken}
              showId={showId}
            />
          ) : undefined
        }
      />
      <CrewSubNav activeSection={activeSection} budgetVisible={budgetVisible} />
      <ShowRealtimeBridge showId={showId} slug={slug} renderVersion={data.viewerVersionToken} />
      <main
        data-testid="page-container"
        className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-section-gap px-4 py-6 sm:p-8"
      >
        <CrewSectionTransition sectionId={activeSection}>{sectionBody}</CrewSectionTransition>
      </main>
      <Footer
        asOf={null}
        showId={showId}
        showSlug={slug}
        // Per-viewer report-button override, ported verbatim from
        // _ShowBody.tsx:520-539: under the admin preview-as flow the footer's
        // report must file as admin AND carry the previewed-viewer context
        // (crewPreview); a plain crew viewer files as crew with no override.
        reportAutocapture={
          viewer.kind === "admin_preview"
            ? {
                ...(rightNowCtx ? { rightNowState: rightNowCtx } : {}),
                crewPreview: {
                  crewMemberId: viewer.crewMemberId,
                  name: ctx.viewerName,
                  role: ctx.viewerCrew?.role ?? null,
                },
              }
            : rightNowCtx
              ? { rightNowState: rightNowCtx }
              : {}
        }
        reportSurfaceOverride={viewer.kind === "admin_preview" ? "admin" : "crew"}
        {...(viewer.kind === "admin_preview"
          ? {
              reportSurfaceIdOverride: `admin-preview-footer-${slug}-${viewer.crewMemberId}`,
            }
          : {})}
        lastSyncedAt={data.lastSyncedAt}
        lastSyncStatus={data.lastSyncStatus}
      />
    </div>
  );
}
