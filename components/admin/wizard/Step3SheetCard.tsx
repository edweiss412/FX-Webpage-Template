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
 *   - Details ("More" → <Step3ReviewModal>, spec 2026-07-02 §5-§10): the full
 *     section-registry review surface (rail/chip nav + restyled section
 *     panels), superseding the retired Step3DetailsDialog + breakdown grid.
 *     The card builds the modal's `SectionData` from its own derived values.
 *
 * Publish-intent wiring (spec §9.2/§9.3): the card is the single checked-state
 * controller in BOTH modes via `requestSetChecked(next): Promise<boolean>` —
 * controlled (the Step3Review grid) delegates to the parent's result-bearing
 * `onToggleChecked`; uncontrolled (tests/standalone) owns the optimistic state
 * + `postPublishIntent` + revert-on-fail (moved OUT of PublishCheckbox, which
 * is now purely controlled). A persistent sr-only `aria-live` region announces
 * publish success/failure (§9.3); the checkbox click path stays
 * fire-and-forget while the modal's publish button awaits the promise.
 *
 * Guard conditions (§4.6): a null/corrupt `parseResult` renders the title
 * fallback + a human "couldn't read" sentence and NO "More" button. Undefined
 * arrays coerce to `[]` (counts render 0 — a 0 is a signal, not hidden).
 * Undefined warnings → no chip. The component never crashes on a missing
 * field (the JSONB is untyped on the wire).
 *
 * Tokens only (DESIGN.md §10): no hardcoded hex / ms / px. The review modal's
 * rise/pop/scrim animation lives in app/globals.css ([data-step3-review-panel]
 * / [data-step3-review-scrim]), consuming the motion tokens.
 */
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, ExternalLink } from "lucide-react";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import type { RunOfShow } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import {
  summarizeDataGaps,
  dataGapClassDetails,
  stripLegacyUnknownFieldAnchors,
} from "@/lib/parser/dataGaps";
import { venueDisplay } from "@/lib/venue/venueLocation";
// The section bodies + agenda live-fill machine live in the section module
// (Task 3, spec §4/§6.1) and are rendered by the review modal's registry.
// Dependency is ONE-WAY: the card imports the helpers; the section module
// never imports the card.
import {
  arr,
  dateSummarySegments,
  NotPublishableNote,
} from "@/components/admin/wizard/step3ReviewSections";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import { postPublishIntent } from "@/lib/admin/publishIntent";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";

// Summary date rendering (§4.2): `dateSummarySegments` moved to
// step3ReviewSections.tsx in Task 4 (imported above) so the review modal's
// header subline shares the exact derivation without importing the card.

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
 * The durable publish-intent checkbox (§4.1/§4.6/§7.2), PURELY CONTROLLED
 * (spec 2026-07-02 §4/§9.2): `checked` + `onToggle` are required; the old
 * uncontrolled internal mode (`initialChecked` + internal POST + self-disable)
 * moved UP into `Step3SheetCard.requestSetChecked`, so there is ONE publish
 * path per mode and the box itself never fetches, never disables, and carries
 * no pending UI — race-safety comes from the owner (Step3Review's per-row
 * coalescing, or the card's uncontrolled re-entry guard), never from greying
 * the control.
 *
 * A real <input type=checkbox> (keyboard-operable, sr-only) backs the visible
 * tile; the tile is a ≥44px tap target via the wrapping <label>. The native
 * input is visually hidden but never removed from the tree (focusable +
 * announced).
 */
export function PublishCheckbox({
  driveFileId,
  checked,
  onToggle,
}: {
  driveFileId: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  // A 20px visible box (size-5) with a ≥44px hit area: p-3 (12px) + the size-5
  // box = 44px clickable square, pulled back by -m-3 so the layout footprint
  // stays ~20px and the box sits flush at the card's top-left, aligned to the
  // title (the negative top margin re-applies the mt-0.5 title offset after -m-3).
  // The native input is sr-only but focusable.
  return (
    <label
      className="relative -m-3 -mt-2.5 inline-flex shrink-0 cursor-pointer items-start justify-start p-3"
      title={checked ? "Publishing this show" : "Publish this show"}
    >
      <input
        type="checkbox"
        data-testid={`wizard-step3-checkbox-${driveFileId}`}
        checked={checked}
        aria-label={
          checked ? "Publishing this show. Uncheck to keep it unpublished." : "Publish this show"
        }
        onChange={(e) => onToggle(e.currentTarget.checked)}
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
  // state so "Select all" updates this box instantly, and the RESULT-BEARING
  // promise (spec §9.2) resolves at the row's settlement. Omitted → the CARD
  // self-manages the optimistic state + POST (standalone/test usage).
  checked?: boolean | undefined;
  onToggleChecked?: ((next: boolean) => Promise<boolean>) | undefined;
}) {
  const dfid = row.driveFileId;
  const pr = row.parseResult ?? null;
  const router = useRouter();
  const controlled = onToggleChecked !== undefined;
  // Task 5b (spec §6.1): a row demoted by a per-sheet re-scan renders the distinct
  // "review before publishing" state (banner + reapply link), and its publish checkbox
  // is suppressed (the checkbox cannot safely clear this code).
  const isDirtyRescan = row.lastFinalizeFailureCode === RESCAN_REVIEW_REQUIRED;
  // audit idx39/#180: a row demoted by ANY finalize failure code (DRIVE_FETCH_FAILED,
  // STAGED_PARSE_SOURCE_OUT_OF_SCOPE, WIZARD_SESSION_SUPERSEDED, …) is NOT publish-ready —
  // Step3Review.selectableRows already excludes every row with a `lastFinalizeFailureCode`
  // from Select-all and the "N of M" count, and the server /approve refuses it. So the
  // publish checkbox is suppressed for EVERY demoted code (not just RESCAN); otherwise the
  // card would show an enabled checkbox the count/Select-all never touch (an inconsistency).
  const isFinalizeDemoted = row.lastFinalizeFailureCode != null;
  // The review modal is self-managed per card: "More" opens it, the modal
  // closes itself (Escape / scrim / drag / close button / successful publish).
  // It is a MODAL, so only one is ever open at a time (the scrim covers the
  // viewport) — no parent accordion state is needed, and every card stays a
  // uniform cell in the grid.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Stable close handler so the modal's Escape keydown effect (keyed on onClose)
  // subscribes once per open, not on every parent re-render while it is open.
  const closeDetails = useCallback(() => setDetailsOpen(false), []);

  // ── Publish-intent state (spec §9.2) — the card is the single checked-state
  // controller in BOTH modes. Uncontrolled: card-local optimistic state (moved
  // out of the old PublishCheckbox.toggleSelf), re-seeded when a refresh flips
  // the server status (render-time adjust — the "state from props" pattern). ──
  const [checkedLocal, setCheckedLocal] = useState(row.status === "applied");
  const [prevStatus, setPrevStatus] = useState(row.status);
  if (prevStatus !== row.status) {
    setPrevStatus(row.status);
    setCheckedLocal(row.status === "applied");
  }
  // §4.6 re-entry guard (uncontrolled only): a click while this card's own
  // write is in flight is IGNORED — never a competing parallel POST. The box
  // itself is never disabled (no pending UI). Controlled mode needs no guard:
  // Step3Review's per-row coalescing is the race-safety there.
  const uncontrolledPendingRef = useRef(false);
  const checked = controlled ? (checkedProp ?? row.status === "applied") : checkedLocal;

  // §9.3 announcer: a PERSISTENT sr-only polite live region whose text mutates
  // (FinalizeButton.tsx pattern — a region inserted already-populated is often
  // missed; a stable region whose text changes is announced).
  const [liveMessage, setLiveMessage] = useState("");

  /**
   * Result-bearing publish intent (spec §9.2): true = the write settled as
   * intended; false = refused/failed (optimistic state reverted). Controlled →
   * the parent's settlement machinery; uncontrolled → card-local optimistic
   * state + the shared POST helper + revert-on-fail. Both paths feed the §9.3
   * live region: success-as-checked announces "Selected to publish"; any
   * failure announces the shared plain-English error (never a raw §12.4 code).
   * The checkbox click path calls this fire-and-forget; the modal awaits it.
   */
  async function requestSetChecked(next: boolean): Promise<boolean> {
    if (!controlled && uncontrolledPendingRef.current) return false; // ignored re-entry — no announcement
    let ok = false;
    if (onToggleChecked) {
      try {
        ok = await onToggleChecked(next);
      } catch {
        ok = false;
      }
    } else {
      uncontrolledPendingRef.current = true;
      setCheckedLocal(next); // optimistic
      try {
        ok = await postPublishIntent(wizardSessionId, dfid, next);
        if (ok) router.refresh();
        else setCheckedLocal(row.status === "applied"); // revert to server truth
      } finally {
        uncontrolledPendingRef.current = false;
      }
    }
    if (ok && next) setLiveMessage("Selected to publish");
    else if (!ok) setLiveMessage("Couldn't update the publish selection.");
    return ok;
  }

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
      {/* audit idx39/#180: a non-RESCAN finalize-demoted row also has its checkbox
          suppressed — surface a minimal "needs attention — not publishable" note so the
          card doesn't read as a normal, checkable publish card. Mutually exclusive with
          the RESCAN banner above. */}
      {!isDirtyRescan && isFinalizeDemoted ? <NotPublishableNote dfid={dfid} /> : null}
      {/* Header row: a reserved leading slot (D3 checkbox lands here) + the
          summary text block. The slot is shrink-0; the block is min-w-0 flex-1
          so a long title truncates instead of overflowing the fixed-width
          list column (§4.4). */}
      <div data-testid={`wizard-step3-card-${dfid}-summary`} className="flex items-start gap-3">
        {/* Leading slot (D3): the durable publish-intent checkbox. shrink-0 so a
            long title (min-w-0 flex-1 below) truncates instead of squeezing it.
            Suppressed for ANY finalize-demoted row (audit idx39/#180): a dirty re-scan
            routes through the reapply page (banner above); any other demoted code is
            simply not publishable (note above). Either way the server /approve refuses
            it and selectableRows excludes it, so the box must not render. */}
        {isFinalizeDemoted ? null : (
          <PublishCheckbox
            // Purely controlled by the card in BOTH modes (spec §9.2): the
            // checked state is the shared optimistic overlay (controlled) or
            // the card-local optimistic state (uncontrolled), and the click
            // path is deliberately fire-and-forget — no pending UI on the box.
            driveFileId={dfid}
            checked={checked}
            onToggle={(next) => void requestSetChecked(next)}
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

      {/* Persistent SR announcer (§9.3, FinalizeButton pattern): announces
          publish-intent success/failure from BOTH the modal's publish button
          and the checkbox's fire-and-forget path. */}
      <span
        data-testid={`wizard-step3-card-${dfid}-publish-live`}
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {liveMessage}
      </span>

      {/* "More" — a quiet, left-aligned TEXT button that opens the review
          modal (<Step3ReviewModal>: a bottom sheet on mobile, a centered
          panel on desktop). It replaced the old inline expand toggle, so the
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

      {/* The review modal — mounted ONLY while open, so a closed card carries
          no section bodies (and none of their focusable "Show all N times"
          controls) in the DOM at all (absent, not merely `inert`). The §6.1
          section registry inside the modal renders EVERY section (crew,
          schedule, …, agenda when a baseline exists, and the always-rendered
          warnings checks row), so the card only assembles `SectionData` from
          its existing derived values. Publish intent flows through the card's
          result-bearing `requestSetChecked` (§9.2): the modal closes only when
          its own request settles true (§9.2.5). */}
      {detailsOpen ? (
        <Step3ReviewModal
          data={{
            pr,
            row,
            dfid,
            wizardSessionId,
            crewMembers,
            rooms,
            hotels,
            pullSheet,
            ros,
            warnings,
            agendaBaseline: arr(row.adminAgendaPreview),
          }}
          checked={checked}
          isDirtyRescan={isDirtyRescan}
          onRequestSetChecked={requestSetChecked}
          onClose={closeDetails}
        />
      ) : null}
    </article>
  );
}
