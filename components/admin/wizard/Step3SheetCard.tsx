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
import { useCallback, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import type { RunOfShow } from "@/lib/parser/types";
import { Step3RowBadge, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { summarizeDataGaps, stripLegacyUnknownFieldAnchors } from "@/lib/parser/dataGaps";
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
import {
  Step3ReviewModal,
  type Step3ReviewResolution,
} from "@/components/admin/wizard/Step3ReviewModal";
import type { ReviewerChoice } from "@/lib/sync/applyStaged";
import { postPublishIntent } from "@/lib/admin/publishIntent";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";

// Summary date rendering (§4.2): `dateSummarySegments` moved to
// step3ReviewSections.tsx in Task 4 (imported above) so the review modal's
// header subline shares the exact derivation without importing the card.

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
  disabled = false,
}: {
  driveFileId: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  // Spec §4.4 R8: frozen while a publish/resume run is active.
  disabled?: boolean;
}) {
  // A 20px visible box (size-5) with a ≥44px hit area: p-3 (12px) + the size-5
  // box = 44px clickable square, pulled back by -m-3 so the layout footprint
  // stays ~20px and the box sits flush at the card's top-left, aligned to the
  // title (the negative top margin re-applies the mt-0.5 title offset after -m-3).
  // The native input is sr-only but focusable.
  return (
    <label
      className="relative -m-3 inline-flex shrink-0 cursor-pointer items-center justify-center p-3"
      title={checked ? "Publishing this show" : "Publish this show"}
    >
      <input
        type="checkbox"
        data-testid={`wizard-step3-checkbox-${driveFileId}`}
        checked={checked}
        disabled={disabled}
        aria-label={
          checked ? "Publishing this show. Uncheck to keep it unpublished." : "Publish this show"
        }
        onChange={(e) => onToggle(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        data-testid={`wizard-step3-card-${driveFileId}-checkbox-box`}
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
function RescanReviewBanner({ dfid }: { dfid: string }) {
  // Step-3 consolidation (spec §4.4): the recovery action is the card's own
  // "Review" button, which opens the folded Step3ReviewModal with its tiered
  // resolution — NOT a link to the (deleted) standalone staged page. The banner
  // is now context-only.
  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-rescan-review`}
      className="flex items-start gap-2 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-medium">
        This sheet changed since you reviewed it. Use Review to resolve it before publishing.
      </p>
    </div>
  );
}

export function Step3SheetCard({
  row,
  wizardSessionId,
  checked: checkedProp,
  onToggleChecked,
  isPublishRunActive = false,
  checkpointStatus = null,
}: {
  row: Step3Row;
  wizardSessionId: string;
  // Spec §4.4 R8: while a publish/resume run is active, every row mutator freezes
  // (checkbox, Select-all, Re-scan, Review→, and the modal's Approve/Re-scan/
  // Ignore). Threaded from Step3ReviewWithFinalize.run.isRunning (Task 2.4).
  isPublishRunActive?: boolean;
  // Spec §4.2 rule 7: at a non-null checkpoint the editable publish checkbox is
  // not rendered at all — the row shows its derived-state badge instead.
  checkpointStatus?: "in_progress" | "all_batches_complete" | null;
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

  // ── Re-apply resolution (spec §4.4) — the ONLY path to clear a blocked
  // re-apply row is the folded Step3ReviewModal (never a blind inline approve).
  // Approve POSTs the wizard apply route; Ignore POSTs the wizard discard route
  // with kind:"permanent_ignore" (the route reads only { stagedId, kind }). ──
  async function applyResolve(reviewerChoices: ReviewerChoice[]): Promise<boolean> {
    if (!row.stagedId) return false;
    try {
      const res = await fetch(
        `/api/admin/onboarding/staged/${encodeURIComponent(wizardSessionId)}/${encodeURIComponent(dfid)}/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stagedId: row.stagedId,
            reviewerChoicesVersion: 1,
            reviewerChoices,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { status?: string };
      const ok = res.ok && json.status === "reapplied";
      if (ok) router.refresh();
      return ok;
    } catch {
      return false;
    }
  }
  async function ignoreResolve(): Promise<boolean> {
    if (!row.stagedId) return false;
    try {
      const res = await fetch(
        `/api/admin/onboarding/staged/${encodeURIComponent(wizardSessionId)}/${encodeURIComponent(dfid)}/discard`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stagedId: row.stagedId, kind: "permanent_ignore" }),
        },
      );
      const ok = res.ok;
      if (ok) router.refresh();
      return ok;
    } catch {
      return false;
    }
  }
  // A blocked re-apply row (needs_review_reapply) folds its resolution into the
  // modal. Every other displayState leaves `resolution` undefined → the modal is
  // the read-only preview it has always been.
  const resolution: Step3ReviewResolution | undefined =
    row.displayState === "needs_review_reapply" && row.stagedId
      ? {
          triggeredReviewItems: row.triggeredReviewItems ?? [],
          reviewItemsCorrupt: row.reviewItemsCorrupt === true,
          stagedId: row.stagedId,
          isPublishRunActive,
          onApplyResolve: applyResolve,
          onRescan: () => {},
          onIgnore: ignoreResolve,
        }
      : undefined;

  // ── §4.6 guard: null/corrupt parseResult → no-details state, no expand. ──
  if (!pr || typeof pr !== "object" || !pr.show) {
    // Post-finalize badge-only (spec §4.2 rule 7): at a non-null checkpoint the
    // row is display-only and the finalize batch has DELETED its pending_syncs
    // parse preview (route `deleteApprovedPending`), so `pr` is legitimately
    // absent. Render the derived badge — NOT the pre-finalize Re-scan/Ignore
    // recovery, which does not apply once publishing has begun. (Blocked
    // re-apply rows retain their pending_syncs, so they never reach here with a
    // missing preview.) Codex whole-diff R3.
    if (checkpointStatus !== null && row.displayState) {
      return (
        <article
          data-testid={`wizard-step3-card-${dfid}`}
          className="flex items-center gap-3 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
        >
          <div className="min-w-0 flex-1">
            <SheetTitleLink dfid={dfid} title={titleFallback} />
          </div>
          <Step3RowBadge displayState={row.displayState} />
        </article>
      );
    }
    return (
      <article
        data-testid={`wizard-step3-card-${dfid}`}
        data-no-details="true"
        className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad shadow-tile"
      >
        <div data-testid={`wizard-step3-card-${dfid}-summary`} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SheetTitleLink dfid={dfid} title={titleFallback} />
            <p className="mt-1 text-sm text-warning-text">
              We couldn&rsquo;t read the details of this sheet.
            </p>
          </div>
        </div>
        {/* Step-3 consolidation (spec §4.2.1/§4.4): a no-details row recovers
            INLINE — Re-scan, or Ignore this sheet (session-scoped permanent_ignore).
            The old reapply-page link is gone (the standalone staged page is
            deleted; old URL 307s to /admin). */}
        <div className="flex flex-wrap items-center gap-2">
          <RescanSheetButton
            driveFileId={dfid}
            wizardSessionId={wizardSessionId}
            disabled={isPublishRunActive}
          />
          {row.stagedId ? (
            <button
              type="button"
              data-testid={`wizard-step3-card-${dfid}-no-details-ignore`}
              onClick={() => void ignoreResolve()}
              disabled={isPublishRunActive}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Ignore this sheet
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  const crewMembers = arr(pr.crewMembers);
  const rooms = arr(pr.rooms);
  const hotels = arr(pr.hotelReservations);
  const pullSheet = arr(pr.pullSheet);
  const archivedPullSheetTabs = arr(pr.archivedPullSheetTabs);
  const ros: RunOfShow = pr.runOfShow ?? {};
  const warnings = stripLegacyUnknownFieldAnchors(arr(pr.warnings));
  // Data-quality gap count drives the compact card's "needs a look" state: a
  // clean row WITH parse warnings gets the warn border + chip + Review button;
  // a clean row without gets the plain border + View. The per-class breakdown
  // now lives in the review modal, not the card face.
  const gaps = summarizeDataGaps(warnings);
  const needsLook = gaps.total > 0;

  const title = pr.show.title || titleFallback;
  const client = pr.show.client_label || null;
  const segs = dateSummarySegments(pr.show.dates);
  const { name: venueName } = venueDisplay(pr.show.venue);

  // Compact meta line (§4.3): client · dates · venue, each segment present only
  // when its datum is, joined by a small dot separator (kept OUT of the segment
  // text nodes so the -client/-dates/-venue assertions stay clean).
  const metaSegments = [
    client ? (
      <span key="client" data-testid={`wizard-step3-card-${dfid}-client`}>
        {client}
      </span>
    ) : null,
    segs.length > 0 ? (
      <span key="dates" data-testid={`wizard-step3-card-${dfid}-dates`}>
        {segs.join(" · ")}
      </span>
    ) : null,
    venueName ? (
      <span key="venue" data-testid={`wizard-step3-card-${dfid}-venue`}>
        {venueName}
      </span>
    ) : null,
  ].filter((n): n is ReactElement => n != null);
  // §4.3: when client, dates, AND venue are all absent, render NO meta line at
  // all (not an empty <p> that would leave a dangling gap under the title).
  const metaLine =
    metaSegments.length > 0 ? (
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle">
        {metaSegments.flatMap((seg, i) =>
          i === 0
            ? [seg]
            : ([
                <span
                  key={`dot-${i}`}
                  aria-hidden="true"
                  className="size-[3px] shrink-0 rounded-full bg-border-strong"
                />,
                seg,
              ] as ReactElement[]),
        )}
      </p>
    ) : null;

  // The warn "needs a look" chip: a bg-status-review dot + bg-warning-bg pill
  // (dot+text paired, DESIGN.md §1.3). Selectable warn rows show a COUNT; demoted
  // rows show the non-numeric "Needs another look".
  const reviewChip = (text: string) => (
    <span
      data-testid={`wizard-step3-card-${dfid}-review-chip`}
      className="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-text"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status-review" />
      {text}
    </span>
  );

  // The modal trigger — the SAME self-managed modal in every variant. "View" for
  // a clean row (ghost), "Review" for a needs-a-look / demoted row (outline —
  // NOT accent; the accent budget is the bar's Publish CTA + checked boxes).
  const triggerButton = (label: "View" | "Review") => (
    <button
      type="button"
      data-testid={`wizard-step3-card-${dfid}-more`}
      aria-haspopup="dialog"
      onClick={() => setDetailsOpen(true)}
      className={[
        "inline-flex min-h-tap-min shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
        // Review = outline + strong text (the primary needs-a-look action); View =
        // subtler ghost (a clean row needs no urging), so the two read distinctly.
        label === "Review"
          ? "border border-border-strong text-text-strong"
          : "text-text-subtle hover:text-text-strong",
      ].join(" ")}
    >
      {label}
    </button>
  );

  // Persistent SR announcer (§9.3, FinalizeButton pattern) + the self-managed
  // review modal, shared by BOTH the demoted and selectable variants (both keep
  // read-only modal access; publish intent flows through requestSetChecked).
  const sharedTail = (
    <>
      <span
        data-testid={`wizard-step3-card-${dfid}-publish-live`}
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {liveMessage}
      </span>
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
            archivedPullSheetTabs,
            ros,
            warnings,
            agendaBaseline: arr(row.adminAgendaPreview),
          }}
          checked={checked}
          isDirtyRescan={isDirtyRescan}
          onRequestSetChecked={requestSetChecked}
          onClose={closeDetails}
          // R8: the modal keeps read-only view access during a run, but its own
          // mutators (Publish/Unpublish/Re-scan) must freeze — thread the flag
          // directly so a NON-reapply (View/Publish) modal freezes too, not only
          // the resolution path (Codex R1 HIGH).
          isPublishRunActive={isPublishRunActive}
          // exactOptionalPropertyTypes: pass the prop ABSENT (never `undefined`)
          // when this row is not a blocked re-apply row.
          {...(resolution ? { resolution } : {})}
        />
      ) : null}
    </>
  );

  // ── Demoted variant (§4.3): a row demoted by ANY finalize failure code is not
  // publishable — no checkbox. It keeps the source-sheet title link, a non-numeric
  // "Needs another look" chip, a read-only Review modal trigger, and its banner
  // (dirty re-scan → reapply link) OR note (any other demoted code). ──
  if (isFinalizeDemoted) {
    return (
      <article
        data-testid={`wizard-step3-card-${dfid}`}
        className="flex flex-col gap-3 rounded-md border border-border-strong bg-surface p-tile-pad shadow-tile"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <SheetTitleLink dfid={dfid} title={title} />
            {metaLine}
          </div>
          <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:justify-between">
            {reviewChip("Needs another look")}
            {triggerButton("Review")}
          </div>
        </div>
        {isDirtyRescan ? (
          // Dirty re-scan: the banner's "Review this sheet" reapply link IS the
          // recovery action — no competing Re-scan button (matches the old card).
          <RescanReviewBanner dfid={dfid} />
        ) : (
          // Any other finalize-demoted code: a not-publishable note PLUS the
          // Re-scan recovery action (re-scan stays a no-details/demoted affordance;
          // the old shared tail rendered it for every non-dirty row).
          <>
            <NotPublishableNote dfid={dfid} />
            <RescanSheetButton
              driveFileId={dfid}
              wizardSessionId={wizardSessionId}
              disabled={isPublishRunActive}
            />
          </>
        )}
        {sharedTail}
      </article>
    );
  }

  // ── Selectable variant (§4.3): checkbox + title/meta + right cluster. A clean
  // row WITH data-quality warnings ("needs a look") gets a warn border, the
  // "N need(s) a look" chip, and a Review button; a clean-no-warnings row gets a
  // plain border, no chip, and a ghost View button. Both open the same modal.
  // spec §5 mobile: the row WRAPS below `sm` (flex-wrap) — the right cluster
  // becomes a full-width second row (max-sm:w-full + justify-between). ──
  return (
    <article
      data-testid={`wizard-step3-card-${dfid}`}
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border ${
        needsLook ? "border-border-strong" : "border-border"
      } bg-surface p-tile-pad shadow-tile`}
    >
      {/* Spec §4.2 rule 7: pre-finalize (checkpoint null) shows the editable
          publish checkbox. Post-finalize the row is badge-only — the derived
          badge lives in the right cluster below (NOT the left slot), so it
          shares the right-edge badge column with the compact card variant. */}
      {checkpointStatus === null ? (
        <PublishCheckbox
          driveFileId={dfid}
          checked={checked}
          onToggle={(next) => void requestSetChecked(next)}
          disabled={isPublishRunActive}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        {/* The data-quality glyph (same one the admin dashboard rows use) sits
            AT THE END OF THE TITLE — inline, not a right-aligned count chip
            (owner decision, 2026-07-06). Title truncates (min-w-0), badge is
            shrink-0 so it never gets clipped. Renders null when gaps.total===0. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            data-testid={`wizard-step3-card-${dfid}-title`}
            className="truncate text-base font-semibold text-text-strong"
          >
            {title}
          </p>
          <DataQualityBadge slug={dfid} dataGaps={gaps} />
        </div>
        {metaLine}
      </div>
      {/* On mobile this cluster is a full-width second row holding View/Review +
          the post-finalize badge, so it WRAPS (max-sm:flex-wrap) instead of
          overflowing the card at ~390px. Desktop is content-sized and never
          wraps, so the shipped desktop layout is unchanged. */}
      <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:flex-wrap max-sm:justify-between">
        {triggerButton(needsLook ? "Review" : "View")}
        {checkpointStatus !== null && row.displayState ? (
          <Step3RowBadge displayState={row.displayState} />
        ) : null}
      </div>
      {sharedTail}
    </article>
  );
}
