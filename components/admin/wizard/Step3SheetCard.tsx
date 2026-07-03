"use client";

/**
 * components/admin/wizard/Step3SheetCard.tsx (Task D2 — spec §4.2/§4.3/§4.6)
 *
 * The inline step-3 review card for ONE cleanly-parsed `staged` sheet. It
 * replaces the old "Review and apply" navigation link: instead of routing to
 * the finalize-failure recovery page, the parse preview is shown in place.
 *
 *   - Summary (always visible): the show title (a deep link to the SOURCE sheet
 *     that WRAPS, never truncates), client, dates, venue name, a dedicated city
 *     row, diagrams/reel badges, and the per-class data-gap chips when present.
 *   - Breakdown ("More" → details overlay): crew names+roles, schedule outline,
 *     rooms, and hotels in a balanced multi-column flow, then a FULL-WIDTH
 *     warnings callout below the rest — each list capped per §4.3. The "More"
 *     button opens <Step3DetailsDialog> (a bottom sheet on mobile, a centered
 *     popup on desktop), replacing the old inline height-morph expand.
 *
 * This is a PRESENTATIONAL card (a `row` prop). D2 deliberately adds NO
 * checkbox / select-all / approve / ignore wiring — those are D3/D4/D5. The
 * leading header slot is reserved (`shrink-0`) so the D3 checkbox drops in
 * without a layout change.
 *
 * Guard conditions (§4.6): a null/corrupt `parseResult` renders the title
 * fallback + a human "couldn't read" sentence and NO "More" button. Undefined
 * arrays coerce to `[]` (counts render 0 — a 0 is a signal, not hidden).
 * Undefined warnings → no chip. The component never crashes on a missing
 * field (the JSONB is untyped on the wire).
 *
 * Tokens only (DESIGN.md §10): no hardcoded hex / ms / px. The details overlay's
 * rise/pop/scrim animation lives in app/globals.css ([data-step3-details-panel]
 * / [data-step3-details-scrim]), consuming the motion tokens.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, ExternalLink } from "lucide-react";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import type { ParseResult, RunOfShow } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { humanizeDate, humanizeDayRange } from "@/lib/dates/humanize";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import {
  summarizeDataGaps,
  dataGapClassDetails,
  stripLegacyUnknownFieldAnchors,
} from "@/lib/parser/dataGaps";
import { venueDisplay } from "@/lib/venue/venueLocation";
// The section bodies + agenda live-fill machine moved to the section module
// (Task 3, spec §4/§6.1). Dependency is ONE-WAY: the card imports the bodies;
// the section module never imports the card.
import {
  arr,
  AgendaBreakdown,
  ContactsBreakdown,
  CrewBreakdown,
  EventDetailsBreakdown,
  HotelsBreakdown,
  OpsBreakdown,
  PackListBreakdown,
  RoomsBreakdown,
  ScheduleBreakdown,
  TransportBreakdown,
  VenueBreakdown,
  WarningsBreakdown,
} from "@/components/admin/wizard/step3ReviewSections";
import { Step3DetailsDialog } from "@/components/admin/wizard/Step3DetailsDialog";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";

// ── Summary date rendering (§4.2 / plan Task 3): role-LABELED segments built
// from the structured parser dates. Each present role becomes a "Label <date>"
// segment; show-days collapse into a single humanized range. `set` is dropped
// when it equals `travelIn` (the common "travel-and-set same day" case) so the
// line doesn't read the date twice. Empty/malformed values omit their segment;
// no dates at all → []. humanizeDate falls back to the raw ISO if a value is
// somehow unparseable so a present date is never silently dropped. */
function dateSummarySegments(dates: ParseResult["show"]["dates"] | undefined): string[] {
  if (!dates) return [];
  const segs: string[] = [];
  if (dates.travelIn) segs.push(`Travel in ${humanizeDate(dates.travelIn) ?? dates.travelIn}`);
  if (dates.set && dates.set !== dates.travelIn) {
    segs.push(`Set ${humanizeDate(dates.set) ?? dates.set}`);
  }
  const showDays = arr(dates.showDays);
  if (showDays.length > 0) {
    // Fall back to the raw first–last ISO if humanizing fails, mirroring the
    // `humanizeDate(...) ?? raw` guard used for travelIn/set/travelOut — a
    // present show-day is never silently dropped (whole-diff review MEDIUM).
    const range =
      humanizeDayRange(showDays) ??
      (showDays.length === 1
        ? (showDays[0] ?? "")
        : `${showDays[0] ?? ""} – ${showDays[showDays.length - 1] ?? ""}`);
    if (range) segs.push(`Show ${range}`);
  }
  if (dates.travelOut) segs.push(`Travel out ${humanizeDate(dates.travelOut) ?? dates.travelOut}`);
  return segs;
}

function Badge({ testId, label }: { testId: string; label: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text"
    >
      {label}
    </span>
  );
}

/**
 * The durable publish-intent checkbox (§4.1/§4.6/§7.2). Checked = the row's
 * manifest status is 'applied'. On toggle it POSTs to the LIGHTWEIGHT approve /
 * un-approve pair (NOT the heavy navigation-era apply route — finalize
 * re-validates at apply time, so the checkbox stays cheap) and then refreshes the
 * RSC tree.
 *
 * In UNCONTROLLED (standalone) mode the control optimistically reflects the new
 * state and DISABLES itself while its own request is in flight (§4.6 — prevents a
 * double-toggle race). In CONTROLLED (grid) mode the parent (Step3Review) owns the
 * write and is NEVER disabled: race-safety there comes from the parent's per-row
 * coalescing, so the box stays interactive (it does not grey out mid-batch).
 *
 * A real <input type=checkbox> (keyboard-operable, sr-only) backs the visible
 * tile; the tile is a ≥44px tap target via the wrapping <label>. The native input
 * is visually hidden but never removed from the tree (focusable + announced).
 */
export function PublishCheckbox({
  driveFileId,
  wizardSessionId,
  initialChecked,
  controlledChecked,
  onToggle,
}: {
  driveFileId: string;
  wizardSessionId: string;
  initialChecked: boolean;
  // Optional CONTROLLED mode. When the parent (Step3Review) supplies `onToggle`, the
  // publish-intent state is LIFTED: the parent owns `checked` and performs the POST +
  // router.refresh() (with per-row coalescing), so "Select all" flips every box
  // instantly through shared optimistic state instead of waiting on each box to
  // re-seed from a refresh (the select-all-doesn't-stick bug — the per-box useState
  // was decoupled from the header's optimistic state). Omitted → the box self-manages
  // its own state and POST (standalone / single-card usage is unchanged, and the call
  // site keeps `key={row.status}` to re-seed on refresh).
  controlledChecked?: boolean | undefined;
  onToggle?: ((next: boolean) => void) | undefined;
}) {
  const controlled = onToggle !== undefined;
  const router = useRouter();
  // Uncontrolled state — used only when the parent does not control this box.
  const [checkedInternal, setCheckedInternal] = useState(initialChecked);
  const [pendingInternal, setPendingInternal] = useState(false);
  const checked = controlled ? !!controlledChecked : checkedInternal;
  // Controlled mode never disables (the parent coalesces writes); only the
  // standalone path disables itself while its own request is in flight.
  const pending = controlled ? false : pendingInternal;

  async function toggleSelf(next: boolean) {
    if (pendingInternal) return; // §4.6 guard — ignore re-entry while a write is in flight
    const action = next ? "approve" : "unapprove";
    setPendingInternal(true);
    setCheckedInternal(next); // optimistic
    try {
      const response = await fetch(
        `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) {
        setCheckedInternal(!next); // revert optimistic state on a refused/failed write
        return;
      }
      router.refresh();
    } catch {
      setCheckedInternal(!next); // network failure → revert
    } finally {
      setPendingInternal(false);
    }
  }

  function handleChange(next: boolean) {
    if (pending) return; // §4.6 guard (controlled or not)
    if (controlled) onToggle?.(next);
    else void toggleSelf(next);
  }

  // A 20px visible box (size-5) with a ≥44px hit area: p-3 (12px) + the size-5
  // box = 44px clickable square, pulled back by -m-3 so the layout footprint
  // stays ~20px and the box sits flush at the card's top-left, aligned to the
  // title (the negative top margin re-applies the mt-0.5 title offset after -m-3).
  // The native input is sr-only but focusable.
  return (
    <label
      className="relative -m-3 -mt-2.5 inline-flex shrink-0 cursor-pointer items-start justify-start p-3 has-disabled:cursor-not-allowed has-disabled:opacity-60"
      title={checked ? "Publishing this show" : "Publish this show"}
    >
      <input
        type="checkbox"
        data-testid={`wizard-step3-checkbox-${driveFileId}`}
        checked={checked}
        disabled={pending}
        aria-label={
          checked ? "Publishing this show. Uncheck to keep it unpublished." : "Publish this show"
        }
        onChange={(e) => handleChange(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-5 items-center justify-center rounded-sm border-2 transition-colors duration-fast peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2 ${
          checked ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-bg"
        }`}
      >
        <Check
          className={`size-3.5 transition-opacity duration-fast ${checked ? "opacity-100" : "opacity-0"}`}
          strokeWidth={3}
        />
      </span>
    </label>
  );
}

/**
 * The show title rendered as a deep link to its SOURCE Google Sheet (the base
 * sheet URL needs only the driveFileId, so it works even for a no-details row).
 * The title WRAPS (never truncates) so a long show name stays fully readable, and
 * opens in a new tab. Falls back to plain text only if the deep link can't be
 * built (a missing driveFileId — not expected for a real row).
 */
function SheetTitleLink({ dfid, title }: { dfid: string; title: string }) {
  const href = buildSheetDeepLink(dfid);
  if (!href) {
    return <p className="wrap-break-word text-base font-semibold text-text-strong">{title}</p>;
  }
  return (
    <a
      data-testid={`wizard-step3-card-${dfid}-title-link`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the source sheet for ${title} in Google Sheets (opens in a new tab)`}
      className="wrap-break-word text-base font-semibold text-text-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {title}
      {/* Persistent (non-hover) "opens the source sheet" cue, mirroring the
          warnings' "Open in Sheet ↗" affordance. text-text-subtle (NOT text-text-faint,
          which DESIGN.md scopes to decorative copy) so it reads as a real, at-rest link
          affordance; inline so it trails the last word when the title wraps; aria-hidden
          (the link's aria-label already says it opens the sheet). */}
      <ExternalLink
        aria-hidden="true"
        strokeWidth={2}
        className="ml-1 inline-block size-3.5 -translate-y-px align-middle text-text-subtle"
      />
    </a>
  );
}

/**
 * Task 5b (spec §6.1): the DISTINCT dirty-rescan state. A row demoted by a per-sheet
 * re-scan (`last_finalize_failure_code === 'RESCAN_REVIEW_REQUIRED'`) cannot be cleared
 * by the plain publish checkbox (that would silently re-approve a crew change), so the
 * card suppresses the checkbox and surfaces this warning callout instead: a plain-English
 * sentence + a link to the reapply page, which has the real per-item choice controls.
 * Warm warning-bg + full strong border (DESIGN.md §1.2 — warning, not error; never a
 * side-stripe), paired with an icon + text (color-blind floor §1).
 */
function RescanReviewBanner({ dfid, wizardSessionId }: { dfid: string; wizardSessionId: string }) {
  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-rescan-review`}
      className="flex flex-col gap-2 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="text-sm font-medium">
          This sheet changed since you reviewed it. Review it before publishing.
        </p>
      </div>
      <Link
        data-testid={`wizard-step3-rescan-review-${dfid}`}
        href={`/admin/onboarding/staged/${wizardSessionId}/${dfid}`}
        className="inline-flex min-h-tap-min items-center gap-1 self-start text-sm font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        Review this sheet
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

export function Step3SheetCard({
  row,
  wizardSessionId,
  checked: checkedProp,
  onToggleChecked,
}: {
  row: Step3Row;
  wizardSessionId: string;
  // Optional controlled publish-intent (lifted into Step3Review). When the parent
  // supplies `onToggleChecked`, the checkbox is controlled by the shared optimistic
  // state so "Select all" updates this box instantly. Omitted → the checkbox
  // self-manages (standalone card usage unchanged).
  checked?: boolean | undefined;
  onToggleChecked?: ((next: boolean) => void) | undefined;
}) {
  const dfid = row.driveFileId;
  const pr = row.parseResult ?? null;
  // Task 5b (spec §6.1): a row demoted by a per-sheet re-scan renders the distinct
  // "review before publishing" state (banner + reapply link), and its publish checkbox
  // is suppressed (the checkbox cannot safely clear this code).
  const isDirtyRescan = row.lastFinalizeFailureCode === RESCAN_REVIEW_REQUIRED;
  // The details overlay is self-managed per card: "More" opens it, the dialog
  // closes itself (Escape / scrim / close button). It is a MODAL, so only one is
  // ever open at a time (the scrim covers the viewport) — no parent accordion
  // state is needed, and every card stays a uniform cell in the grid.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Stable close handler so the dialog's Escape keydown effect (keyed on onClose)
  // subscribes once per open, not on every parent re-render while it is open.
  const closeDetails = useCallback(() => setDetailsOpen(false), []);

  const titleFallback = row.driveFileName || dfid;

  // ── §4.6 guard: null/corrupt parseResult → no-details state, no expand. ──
  if (!pr || typeof pr !== "object" || !pr.show) {
    return (
      <article
        data-testid={`wizard-step3-card-${dfid}`}
        data-no-details="true"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad"
      >
        <div data-testid={`wizard-step3-card-${dfid}-summary`} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SheetTitleLink dfid={dfid} title={titleFallback} />
            <p className="mt-1 text-sm text-warning-text">
              We couldn&rsquo;t read the details of this sheet.
            </p>
          </div>
        </div>
        {/* A dirty re-scan routes to the reapply page (the review link is primary, even
            for a no-details row); otherwise re-scanning is exactly how a no-details row
            recovers, so the Re-scan button leads the recovery here (spec §9). */}
        {isDirtyRescan ? (
          <RescanReviewBanner dfid={dfid} wizardSessionId={wizardSessionId} />
        ) : (
          <RescanSheetButton driveFileId={dfid} wizardSessionId={wizardSessionId} />
        )}
      </article>
    );
  }

  const crewMembers = arr(pr.crewMembers);
  const rooms = arr(pr.rooms);
  const hotels = arr(pr.hotelReservations);
  const pullSheet = arr(pr.pullSheet);
  const ros: RunOfShow = pr.runOfShow ?? {};
  const warnings = stripLegacyUnknownFieldAnchors(arr(pr.warnings));
  // parse-data-quality-warnings §6.2a — the publish-decision point. Derive the
  // per-class data-gap breakdown (single-sourced via summarizeDataGaps) so the
  // operator sees WHAT dropped, not just a count, before ticking the publish
  // checkbox.
  const dataGapsSummary = summarizeDataGaps(warnings);
  const dataGapDetails = dataGapClassDetails(dataGapsSummary);

  const title = pr.show.title || titleFallback;
  const client = pr.show.client_label || null;
  const segs = dateSummarySegments(pr.show.dates);

  const hasDiagrams =
    pr.diagrams?.linkedFolder != null || arr(pr.diagrams?.embeddedImages).length > 0;
  const hasReel = pr.openingReel != null;

  // Collapsed-summary Venue row (replaces the old Totals strip): venue name is the
  // primary value, a best-effort city the muted secondary line. The per-section
  // counts now live ONLY in the expanded breakdown section headers ("Crew (N)"),
  // so they are no longer recomputed here.
  const { name: venueName, city: venueCity } = venueDisplay(pr.show.venue);

  return (
    <article
      data-testid={`wizard-step3-card-${dfid}`}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)"
    >
      {/* Task 5b: a dirty re-scan demotes the row — the review-before-publishing
          banner leads the card and the publish checkbox below is suppressed. */}
      {isDirtyRescan ? <RescanReviewBanner dfid={dfid} wizardSessionId={wizardSessionId} /> : null}
      {/* Header row: a reserved leading slot (D3 checkbox lands here) + the
          summary text block. The slot is shrink-0; the block is min-w-0 flex-1
          so a long title truncates instead of overflowing the fixed-width
          list column (§4.4). */}
      <div data-testid={`wizard-step3-card-${dfid}-summary`} className="flex items-start gap-3">
        {/* Leading slot (D3): the durable publish-intent checkbox. shrink-0 so a
            long title (min-w-0 flex-1 below) truncates instead of squeezing it.
            Task 5b: suppressed for a dirty re-scan row (the checkbox /approve cannot
            safely clear RESCAN_REVIEW_REQUIRED — recovery flows through the reapply
            page via the banner above). */}
        {isDirtyRescan ? null : (
          <PublishCheckbox
            // Controlled mode (in the Step3Review grid): the parent owns the
            // optimistic checked state, so a stable key by dfid keeps the box mounted
            // and the parent drives it. Uncontrolled mode (standalone): re-seed
            // (remount) on a server-status flip so a refreshed status takes effect.
            key={onToggleChecked !== undefined ? dfid : row.status}
            driveFileId={dfid}
            wizardSessionId={wizardSessionId}
            initialChecked={row.status === "applied"}
            controlledChecked={
              onToggleChecked !== undefined ? (checkedProp ?? row.status === "applied") : undefined
            }
            onToggle={onToggleChecked}
          />
        )}
        <div className="min-w-0 flex-1">
          <SheetTitleLink dfid={dfid} title={title} />
          {client ? <p className="truncate text-sm text-text-subtle">{client}</p> : null}

          {/* Dates and Venue are DISTINCT visual roles: each row carries a small
              uppercase eyebrow label so the two stop reading as one run-on
              metadata block. Shared 2-track grid so both eyebrows share a left
              edge and both values share a left edge. */}
          {/* `minmax(0,1fr)` (not the default `1fr` = `minmax(auto,1fr)`) lets the
              value column shrink below its content so a long unbreakable token
              wraps instead of forcing horizontal overflow past the card width. */}
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
            <dt
              className="text-xs font-semibold uppercase text-text-subtle"
              style={{ letterSpacing: "var(--tracking-eyebrow)" }}
            >
              Dates
            </dt>
            <dd
              data-testid={`wizard-step3-card-${dfid}-dates`}
              className="text-sm text-text-subtle"
            >
              {segs.length > 0 ? segs.join(" · ") : "Dates not detected"}
            </dd>
            {/* Venue row — the venue NAME only (the best-effort city moved to its own
                "City" row below). Falls back to a human "Venue not detected" sentence
                (invariant 5), never an empty cell. */}
            <dt
              className="text-xs font-semibold uppercase text-text-subtle"
              style={{ letterSpacing: "var(--tracking-eyebrow)" }}
            >
              Venue
            </dt>
            <dd
              data-testid={`wizard-step3-card-${dfid}-venue`}
              className="min-w-0 text-sm text-text-subtle"
            >
              {venueName ? (
                <span className="wrap-break-word text-text">{venueName}</span>
              ) : (
                "Venue not detected"
              )}
            </dd>
            {/* City row — a dedicated best-effort city mined from the venue address
                (conservative: null rather than a wrong guess). Replaces the old
                collapsed crew preview. Rendered ONLY when a city is confidently
                detected: most FXAV sheets put the location in the venue NAME (e.g.
                "Four Seasons Hotel Chicago") and leave the address blank, so a
                "City not detected" fallback would be noise on nearly every card.
                Per the agreed "Venue Name + City IF POSSIBLE", the row simply
                drops when the city isn't derivable. */}
            {venueCity ? (
              <>
                <dt
                  className="text-xs font-semibold uppercase text-text-subtle"
                  style={{ letterSpacing: "var(--tracking-eyebrow)" }}
                >
                  City
                </dt>
                <dd
                  data-testid={`wizard-step3-card-${dfid}-city`}
                  className="min-w-0 text-sm text-text-subtle"
                >
                  <span className="wrap-break-word text-text">{venueCity}</span>
                </dd>
              </>
            ) : null}
          </dl>

          {(hasDiagrams || hasReel) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {hasDiagrams ? (
                <Badge testId={`wizard-step3-card-${dfid}-badge-diagrams`} label="Diagrams ✓" />
              ) : null}
              {hasReel ? (
                <Badge testId={`wizard-step3-card-${dfid}-badge-reel`} label="Reel ✓" />
              ) : null}
            </div>
          )}

          {/* parse-data-quality-warnings §6.2a — the per-class data-gap chips
              (warning-colored, PLAIN-LANGUAGE labels only — invariant 5, never the
              raw §12.4 code). Self-explanatory at a glance ("2 unreadable fields");
              non-data-gap warnings are NOT chipped here — the full per-warning list
              lives under "Show details". Present iff there's a data gap; instant,
              no animation. */}
          {dataGapDetails.length > 0 ? (
            <ul
              data-testid={`wizard-step3-card-${dfid}-data-gaps`}
              className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-warning-text"
            >
              {dataGapDetails.map((d) => (
                <li
                  key={d.key}
                  data-testid={`wizard-step3-card-${dfid}-data-gap-${d.key}`}
                  className="inline-flex items-center gap-1 rounded-sm bg-warning-bg px-2 py-0.5 font-medium"
                >
                  <span className="tabular-nums">{d.count}</span> {d.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* "More" — a quiet, left-aligned TEXT button that opens the details
          overlay (<Step3DetailsDialog>: a bottom sheet on mobile, a centered
          popup on desktop). It replaced the old inline expand toggle, so the
          card stays a compact summary tile and every grid cell is uniform.
          `aria-haspopup="dialog"` announces that it opens a modal; the trailing
          chevron is the persistent (non-hover) "opens more" affordance. ≥44px
          tap target via min-h-tap-min; self-start so it sizes to its content at
          the card's left edge instead of stretching full width. */}
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-more`}
        aria-haspopup="dialog"
        onClick={() => setDetailsOpen(true)}
        className="inline-flex min-h-tap-min items-center gap-1 self-start text-sm font-medium text-text-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <span>More</span>
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>

      {/* Re-scan this sheet (spec §9): a quiet recovery CTA alongside "More". Suppressed
          for a dirty re-scan row — its banner above already routes to the reapply page,
          so a competing Re-scan button would muddy the primary action. */}
      {isDirtyRescan ? null : (
        <RescanSheetButton driveFileId={dfid} wizardSessionId={wizardSessionId} />
      )}

      {/* The details overlay — mounted ONLY while open, so a closed card carries
          no breakdown (and none of its focusable "Show all N times" controls) in
          the DOM at all (absent, not merely `inert`). The breakdown lays its
          sections out in a balanced column flow — 1 column in the mobile sheet,
          2 in the desktop popup, both bounded by the dialog width (no longer the
          grid cell) — with the FULL-WIDTH warnings callout below.
          `break-inside-avoid` keeps each section whole across a column break;
          `mb-6` carries the vertical rhythm column flow can't get from `gap`
          (last section drops it). `wrap-break-word` bounds any unbreakable token
          (§4.4). Column count uses the named `sm` breakpoint (DESIGN.md §6),
          which is also the sheet→popup mode boundary, so 1-col tracks the sheet
          and 2-col tracks the popup. */}
      {detailsOpen ? (
        <Step3DetailsDialog dfid={dfid} title={title} onClose={closeDetails}>
          <div
            data-testid={`wizard-step3-card-${dfid}-breakdown-grid`}
            className="columns-1 gap-x-8 wrap-break-word sm:columns-2 [&>section]:mb-6 [&>section]:break-inside-avoid [&>section:last-child]:mb-0"
          >
            <CrewBreakdown dfid={dfid} members={crewMembers} />
            <ContactsBreakdown
              dfid={dfid}
              clientContact={pr.show.client_contact}
              contacts={arr(pr.contacts)}
            />
            <ScheduleBreakdown dfid={dfid} ros={ros} />
            <RoomsBreakdown dfid={dfid} rooms={rooms} />
            <VenueBreakdown dfid={dfid} venue={pr.show.venue} />
            <EventDetailsBreakdown dfid={dfid} eventDetails={pr.show.event_details} />
            <PackListBreakdown dfid={dfid} cases={pullSheet} />
            <TransportBreakdown dfid={dfid} transportation={pr.transportation} />
            <HotelsBreakdown dfid={dfid} hotels={hotels} />
            <OpsBreakdown dfid={dfid} show={pr.show} />
          </div>
          {/* Agenda PDF schedule — live-fill card (spec §5.3). Renders nothing when
              the row has no agenda links; otherwise POSTs to the extract endpoint
              and fills in the schedule blocks when ready. Keyed on agendaStateKey so
              a rescan resets the per-row state. */}
          {arr(row.adminAgendaPreview).length > 0 ? (
            <div className="mt-6">
              <AgendaBreakdown
                driveFileId={dfid}
                wizardSessionId={wizardSessionId}
                baseline={arr(row.adminAgendaPreview)}
                stateKey={row.agendaStateKey ?? dfid}
              />
            </div>
          ) : null}
          {/* Warnings — pulled OUT of the column flow into a FULL-WIDTH bordered
              callout BELOW the rest, so the non-blocking data-quality notes stand
              apart from the show data. Warm warning-bg + a full strong border
              (DESIGN.md §1.2 — warning, not error; full border, never a
              side-stripe). Gated on warnings so there is no empty box. */}
          {warnings.length > 0 ? (
            <div
              data-testid={`wizard-step3-card-${dfid}-warnings-panel`}
              className="mt-6 rounded-md border border-border-strong bg-warning-bg p-tile-pad"
            >
              <WarningsBreakdown dfid={dfid} warnings={warnings} />
            </div>
          ) : null}
        </Step3DetailsDialog>
      ) : null}
    </article>
  );
}
