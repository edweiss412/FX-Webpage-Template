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
 *   - Breakdown (expand toggle): crew names+roles, schedule outline, rooms, and
 *     hotels in a balanced multi-column flow, then a FULL-WIDTH warnings callout
 *     below the rest — each list capped per §4.3.
 *
 * This is a PRESENTATIONAL card (a `row` prop). D2 deliberately adds NO
 * checkbox / select-all / approve / ignore wiring — those are D3/D4/D5. The
 * leading header slot is reserved (`shrink-0`) so the D3 checkbox drops in
 * without a layout change.
 *
 * Guard conditions (§4.6): a null/corrupt `parseResult` renders the title
 * fallback + a human "couldn't read" sentence and NO expand toggle. Undefined
 * arrays coerce to `[]` (counts render 0 — a 0 is a signal, not hidden).
 * Undefined warnings → no chip. The component never crashes on a missing
 * field (the JSONB is untyped on the wire).
 *
 * Tokens only (DESIGN.md §10): no hardcoded hex / ms / px. The breakdown
 * height-morph + reduced-motion handling live in app/globals.css
 * (`[data-step3-breakdown]`), consuming --duration-normal.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import type {
  AgendaEntry,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  ParseWarning,
  RoomRow,
  RunOfShow,
} from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { humanizeDate, humanizeDayRange } from "@/lib/dates/humanize";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { summarizeDataGaps, dataGapClassDetails } from "@/lib/parser/dataGaps";
import { venueDisplay } from "@/lib/venue/venueLocation";
import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import {
  AGENDA_CLIENT_CONCURRENCY,
  AGENDA_CLIENT_POLL_BUDGET_MS,
  AGENDA_CLIENT_QUEUE_BUDGET_MS,
} from "@/lib/agenda/constants";

// ── §4.3 caps (single source of truth) ──
const CREW_CAP = 30;
const ROOMS_CAP = 20;
const HOTELS_CAP = 12;
const SCHEDULE_DAYS_CAP = 14;
const SCHEDULE_ENTRIES_CAP = 6;

// Defensive coercion for the untyped-on-the-wire JSONB (§4.3/§4.6): anything
// that isn't an array becomes [].
function arr<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/** A "+K more" tail line, or null when nothing is truncated. */
function overflowNote(total: number, cap: number, noun: string): string | null {
  const extra = total - cap;
  return extra > 0 ? `…and ${extra} more ${noun}` : null;
}

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

/** A labeled breakdown section (varying content shape per §4.3 — never an
 * identical sub-card grid). */
function BreakdownSection({
  testId,
  label,
  count,
  children,
}: {
  testId: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="flex flex-col gap-1.5">
      <h4
        className="text-xs font-semibold uppercase text-text-subtle"
        style={{ letterSpacing: "var(--tracking-eyebrow)" }}
      >
        {label} <span className="tabular-nums text-text-faint">({count})</span>
      </h4>
      {children}
    </section>
  );
}

function CrewBreakdown({ dfid, members }: { dfid: string; members: CrewMemberRow[] }) {
  const shown = members.slice(0, CREW_CAP);
  const note = overflowNote(members.length, CREW_CAP, "people");
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-crew`}
      label="Crew"
      count={members.length}
    >
      {members.length === 0 ? (
        <p className="text-sm text-text-subtle">No crew parsed.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {shown.map((m, i) => (
            <li key={`${m.name}-${i}`} className="text-sm text-text">
              <span className="font-medium text-text-strong">{m.name || "Unnamed"}</span>
              {m.role ? <span className="text-text-subtle"> · {m.role}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

/**
 * One day's run-of-show (plan Task 2). The day's entries render as a SINGLE
 * 2-track grid so times and titles each align to one column.
 *
 * Dimensional invariant (Tailwind v4 does NOT default `align-items: stretch`):
 *   - The grid is `grid-cols-[auto_1fr]`. The `auto` track sizes to the WIDEST
 *     time across this day's entries, so ALL time cells share one left edge.
 *   - The `1fr` track's left edge is constant, so ALL title cells share one
 *     left edge regardless of time width. (`tabular-nums` only equalizes digit
 *     glyphs; it does NOT align variable-length times like "9:00 AM" vs
 *     "11:00 AM" — the shared `auto` track is what guarantees the column.)
 *   - `items-baseline` aligns each row's time/title on the text baseline.
 *
 * Truncation is replaced by in-place disclosure: the first SCHEDULE_ENTRIES_CAP
 * entries show; a "Show all M times" button reveals the rest for THIS day only
 * (local state). No silent "…+N" tail.
 */
function ScheduleDayRow({
  dfid,
  iso,
  entries,
}: {
  dfid: string;
  iso: string;
  entries: AgendaEntry[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, SCHEDULE_ENTRIES_CAP);
  const hidden = entries.length - SCHEDULE_ENTRIES_CAP;

  return (
    <li className="flex flex-col gap-1">
      <span className="text-xs font-medium tabular-nums text-text-strong">
        {humanizeDate(iso) ?? iso}
      </span>
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">
        {visible.map((e, i) => (
          <Fragment key={`${iso}-${i}`}>
            <span
              data-testid={`wizard-step3-card-${dfid}-sched-time`}
              className="whitespace-nowrap text-sm tabular-nums text-text-subtle"
            >
              {e.start}
            </span>
            <span
              data-testid={`wizard-step3-card-${dfid}-sched-title`}
              className="text-sm text-text"
            >
              {e.title || ""}
            </span>
          </Fragment>
        ))}
      </div>
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          data-testid={`wizard-step3-card-${dfid}-sched-expand-${iso}`}
          onClick={() => setShowAll(true)}
          className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {`Show all ${entries.length} times`}
        </button>
      ) : null}
    </li>
  );
}

function ScheduleBreakdown({ dfid, ros }: { dfid: string; ros: RunOfShow }) {
  const dayKeys = Object.keys(ros);
  const shownDays = dayKeys.slice(0, SCHEDULE_DAYS_CAP);
  const daysNote = (() => {
    const extra = dayKeys.length - SCHEDULE_DAYS_CAP;
    return extra > 0 ? `…and ${extra} more days` : null;
  })();
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-schedule`}
      label="Schedule"
      count={dayKeys.length}
    >
      {dayKeys.length === 0 ? (
        <p className="text-sm text-text-subtle">No run-of-show parsed.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shownDays.map((iso) => (
            <ScheduleDayRow key={iso} dfid={dfid} iso={iso} entries={arr(ros[iso]?.entries)} />
          ))}
        </ul>
      )}
      {daysNote ? <p className="text-xs text-text-subtle">{daysNote}</p> : null}
    </BreakdownSection>
  );
}

function RoomsBreakdown({ dfid, rooms }: { dfid: string; rooms: RoomRow[] }) {
  const shown = rooms.slice(0, ROOMS_CAP);
  const note = overflowNote(rooms.length, ROOMS_CAP, "rooms");
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-rooms`}
      label="Rooms"
      count={rooms.length}
    >
      {rooms.length === 0 ? (
        <p className="text-sm text-text-subtle">No rooms parsed.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {shown.map((r, i) => (
            <li key={`${r.name}-${i}`} className="text-sm text-text">
              <span className="font-medium text-text-strong">{r.name || "Room"}</span>
              {r.kind ? <span className="text-text-subtle"> · {r.kind}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

function HotelsBreakdown({ dfid, hotels }: { dfid: string; hotels: HotelReservationRow[] }) {
  const shown = hotels.slice(0, HOTELS_CAP);
  const note = overflowNote(hotels.length, HOTELS_CAP, "hotels");
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-hotels`}
      label="Hotels"
      count={hotels.length}
    >
      {hotels.length === 0 ? (
        <p className="text-sm text-text-subtle">No hotels parsed.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shown.map((h, i) => (
            <li key={`${h.hotel_name ?? "hotel"}-${i}`} className="text-sm text-text">
              <span className="font-medium text-text-strong">{h.hotel_name || "Hotel"}</span>
              {arr(h.names).length > 0 ? (
                <span className="text-text-subtle"> · {arr(h.names).join(", ")}</span>
              ) : null}
              {h.check_in || h.check_out ? (
                <span className="block text-xs tabular-nums text-text-subtle">
                  {h.check_in ?? "?"} → {h.check_out ?? "?"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

/**
 * Parse-warnings breakdown (plan Task 4). The full `parseResult.warnings` list
 * is surfaced here (only `.length` was used by the summary chip before). Each
 * warning routes its DETAIL through the §12.4 catalog:
 *   - cataloged code  → the catalog `title` (+ `helpfulContext` when present)
 *   - unknown code    → the raw parser `message` (NEVER the bare code — invariant
 *     5: a human sentence, never a machine token, reaches the UI)
 *
 * One explicit line states that warnings are informational and do NOT block
 * publishing, so the count badge stops reading as an error. Severity is shown
 * subtly (a small dot + label). No publish-gate logic changes here.
 */
function WarningsBreakdown({ dfid, warnings }: { dfid: string; warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-warnings`}
      label="Warnings"
      count={warnings.length}
    >
      <p
        data-testid={`wizard-step3-card-${dfid}-warnings-nonblocking`}
        className="text-xs text-text-subtle"
      >
        These are informational and don&rsquo;t block publishing.
      </p>
      <ul className="flex flex-col gap-2">
        {warnings.map((w, i) => {
          const cataloged = isMessageCode(w.code);
          const entry = cataloged ? messageFor(w.code as MessageCode) : null;
          // Invariant 5: title is the catalog title when present, else the raw
          // human message — the bare `code` is never rendered.
          const title = (entry?.title ?? null) || w.message;
          const context = entry?.helpfulContext ?? null;
          const isWarn = w.severity === "warn";
          return (
            <li
              key={`${w.code}-${i}`}
              data-testid={`wizard-step3-card-${dfid}-warning-${i}`}
              className="flex flex-col gap-0.5"
            >
              <span className="flex items-baseline gap-1.5 text-sm text-text">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-1.5 shrink-0 rounded-pill ${
                    isWarn ? "bg-warning-text" : "bg-text-faint"
                  }`}
                />
                <span className="font-medium text-text-strong">{renderEmphasis(title)}</span>
                <span className="text-xs uppercase text-text-subtle">
                  {isWarn ? "warn" : "info"}
                </span>
              </span>
              {context ? (
                <p className="pl-3 text-xs text-text-subtle">{renderEmphasis(context)}</p>
              ) : null}
              {(() => {
                // Exact-cell deep link: when the scan captured the offending
                // source cell, offer a one-click jump to it in the Sheet. Falls
                // back to the base sheet URL for a non-allowlisted tab (still
                // useful); omitted when no anchor or no driveFileId.
                const href = w.sourceCell ? buildSheetDeepLink(dfid, w.sourceCell) : null;
                return href ? (
                  <a
                    data-testid={`wizard-step3-card-${dfid}-warning-${i}-open`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="self-start pl-3 text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  >
                    Open in Sheet <span aria-hidden="true">↗</span>
                  </a>
                ) : null;
              })()}
            </li>
          );
        })}
      </ul>
    </BreakdownSection>
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

/* ──────────────────────────────────────────────────────────────────────────
 * Agenda PDF schedule — live-fill card + 5-state machine (spec §5.3).
 *
 * The card renders the server-built `AdminAgendaItem[]` (note-only baseline at
 * first paint), POSTs to the extract endpoint, polls while "Parsing agenda…",
 * then fills in the schedule blocks (with the server-validated Open-PDF anchors)
 * when the extraction is ready. It NEVER computes an href itself — it renders
 * `item.href` only when the server supplied one AND the state is `ready`.
 *
 * States (keyed on `stateKey` = the row's `agendaStateKey`):
 *   idle → loading → { ready | stale | error }
 * A NEW `stateKey` resets to loading, clears the upgraded items back to the
 * baseline, and re-fires the POST.
 *
 *   - loading: baseline note-only items + "Parsing agenda… (N PDFs)" eyebrow,
 *     NO Open-PDF anchor.
 *   - ready (200): `agenda-schedule` blocks (via AgendaScheduleBlock) + overflow
 *     notes, WITH the server-validated anchors.
 *   - error (network / 5xx / 504 timeout / 500): note-only, NO anchor, + a
 *     source-sheet link.
 *   - stale (409): sanitized note, NO anchor, NO block.
 *   - Anchors render ONLY in `ready` (loading/error/stale all have zero).
 *
 * Late-response suppression (plan round-24): the effect captures the current
 * `stateKey` into a const + creates an `AbortController`; cleanup `abort()`s the
 * in-flight fetch on key change, and EVERY resolution checks `capturedKey ===
 * currentKeyRef.current` before any `setState` — so a late 200/409 from an old
 * generation is DROPPED and never sets `ready`/`stale` for the new generation.
 * ────────────────────────────────────────────────────────────────────────── */

type AgendaState = "idle" | "loading" | "ready" | "stale" | "error";

// ── Module-level POST throttle: at most AGENDA_CLIENT_CONCURRENCY in-flight
// extraction POSTs across every mounted card (spec §5.3). A FIFO of pending
// grants drains as slots are released. ──
let agendaActiveSlots = 0;
const agendaSlotWaiters: Array<() => void> = [];

function acquireAgendaSlot(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const grant = () => {
      agendaActiveSlots++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        agendaActiveSlots--;
        const next = agendaSlotWaiters.shift();
        if (next) next();
      });
    };
    if (agendaActiveSlots < AGENDA_CLIENT_CONCURRENCY) grant();
    else agendaSlotWaiters.push(grant);
  });
}

/** Test-only seam: reset the module-level POST throttle between test cases. */
export function __resetAgendaThrottleForTests(): void {
  agendaActiveSlots = 0;
  agendaSlotWaiters.length = 0;
}

/**
 * Test-only seam: captures `currentKeyRef.current` in the layout-effect phase
 * (after commit, before passive effects) so the g3 regression test can observe
 * whether line 761's render-time write fired before the second render pass read
 * it. Passive effects (line 768) update the same ref to the new key in both
 * branches — but after the commit — so the value reflects only the render-time
 * update. Only reading the ref here (outside render, inside layout effect)
 * avoids the react-hooks/refs rule.
 */
let _debugCurrentKeyAtLayout: string | undefined;
export function __getDebugCurrentKeyAtLayout(): string | undefined {
  return _debugCurrentKeyAtLayout;
}

/** Retry-After is delta-seconds (the endpoint sends "10"); fall back to 5s. */
function parseRetryAfterMs(header: string | null): number {
  if (!header) return 5_000;
  const secs = Number.parseInt(header, 10);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1_000 : 5_000;
}

/** An abortable delay; resolves immediately if already aborted. */
function agendaSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function agendaOverflowNotes(block: NonNullable<AdminAgendaItem["block"]>): string[] {
  const notes: string[] = [];
  if (block.droppedSessions > 0) notes.push(`…and ${block.droppedSessions} more sessions`);
  if (block.droppedDays > 0) notes.push(`…and ${block.droppedDays} more days`);
  if (block.droppedTracks > 0) notes.push(`…and ${block.droppedTracks} more tracks`);
  return notes;
}

/** The per-state note line for a note-only item (never a raw error/status code —
 * invariant 5). */
function agendaItemNote(state: AgendaState): string {
  switch (state) {
    case "error":
      return "We couldn’t read this agenda’s schedule.";
    case "stale":
      return "This agenda changed since the last scan. Re-scan to refresh.";
    case "ready":
      return "No schedule detected in this PDF.";
    default:
      return "Reading the schedule…";
  }
}

function AgendaItemRow({
  item,
  state,
  index,
}: {
  item: AdminAgendaItem;
  state: AgendaState;
  index: number;
}) {
  const showBlock = state === "ready" && item.block !== null;
  // Anchors render ONLY in `ready`, and ONLY when the server validated an href.
  const showAnchor = state === "ready" && !!item.href;
  return (
    <li data-testid="agenda-item" className="flex min-w-0 flex-col gap-1.5">
      {item.badge ? (
        <span
          className="text-xs font-semibold uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          {item.badge}
        </span>
      ) : null}
      {showBlock && item.block ? (
        <>
          <AgendaScheduleBlock extraction={item.block.extraction} label={null} />
          {agendaOverflowNotes(item.block).map((note) => (
            <p key={note} className="text-xs text-text-subtle">
              {note}
            </p>
          ))}
        </>
      ) : (
        <p
          role="status"
          aria-live="polite"
          data-testid="agenda-note"
          className={state === "error" ? "text-sm text-warning-text" : "text-sm text-text-subtle"}
        >
          {agendaItemNote(state)}
        </p>
      )}
      {showAnchor && item.href ? (
        <a
          data-testid="agenda-open-pdf"
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open PDF <span aria-hidden="true">↗</span>
        </a>
      ) : (
        // Keep the index referenced so the key is stable + lint-clean.
        <span hidden data-agenda-index={index} />
      )}
    </li>
  );
}

export function AgendaBreakdown({
  driveFileId,
  wizardSessionId,
  baseline,
  stateKey,
}: {
  driveFileId: string;
  wizardSessionId: string;
  baseline: AdminAgendaItem[];
  stateKey: string;
}) {
  const [state, setState] = useState<AgendaState>(() => (baseline.length > 0 ? "loading" : "idle"));
  const [items, setItems] = useState<AdminAgendaItem[]>(baseline);
  // A ref tracking the LIVE generation key — every late resolution checks the
  // captured key against this before any setState (round-24 suppression).
  const currentKeyRef = useRef<string>(stateKey);
  // The latest baseline read inside the keyed effect WITHOUT making the effect
  // re-run on every parent render (the parent rebuilds the array each render).
  // Updated in its own effect so the keyed effect (declared after) sees the
  // current generation's baseline; the generation itself is keyed on `stateKey`.
  const baselineRef = useRef<AdminAgendaItem[]>(baseline);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  // Generation reset — adjust state during render when `stateKey` changes (the
  // React "reset state on prop change" pattern). Clears any prior `ready` items
  // back to the baseline note-only and returns to loading; the keyed effect
  // below then re-fires the POST for the new generation.
  const [trackedKey, setTrackedKey] = useState<string>(stateKey);
  if (stateKey !== trackedKey) {
    setTrackedKey(stateKey);
    setState(baseline.length > 0 ? "loading" : "idle");
    setItems(baseline);
    // Intentional render-time ref update (react-hooks/refs disable below):
    // the effect also sets this (line 785), but passive-effect flush is too
    // late for the live() guard in a concurrent generation window.
    // eslint-disable-next-line react-hooks/refs
    currentKeyRef.current = stateKey;
  }

  useEffect(() => {
    if (baselineRef.current.length === 0) return;

    const capturedKey = stateKey;
    currentKeyRef.current = stateKey;
    const controller = new AbortController();
    let cancelled = false;
    const live = () => !cancelled && capturedKey === currentKeyRef.current;

    void (async () => {
      const release = await acquireAgendaSlot();
      try {
        if (!live()) return;
        const startedAt = Date.now();
        let admittedAt: number | null = null;

        // Poll loop — 200 ready / 409 stale / 202 retry / everything else error.
        for (;;) {
          if (!live()) return;
          let res: Response;
          try {
            res = await fetch(
              `/api/admin/onboarding/extract-agenda/${wizardSessionId}/${driveFileId}`,
              { method: "POST", signal: controller.signal },
            );
          } catch {
            if (!live()) return;
            setState("error");
            return;
          }
          if (!live()) return;

          if (res.status === 200) {
            let body: { items?: AdminAgendaItem[] } = {};
            try {
              body = (await res.json()) as { items?: AdminAgendaItem[] };
            } catch {
              /* malformed 200 → fall back to baseline note-only */
            }
            if (!live()) return;
            setItems(Array.isArray(body.items) ? body.items : baselineRef.current);
            setState("ready");
            return;
          }

          if (res.status === 409) {
            if (!live()) return;
            setState("stale");
            return;
          }

          if (res.status === 202) {
            let body: { reason?: "in_progress" | "queued" } = {};
            try {
              body = (await res.json()) as { reason?: "in_progress" | "queued" };
            } catch {
              /* default to in_progress budget below */
            }
            if (!live()) return;
            const reason = body.reason === "queued" ? "queued" : "in_progress";
            const now = Date.now();
            // Reason-aware budgets: in_progress window starts at admission; the
            // queued window starts when the first poll was issued.
            let deadline: number;
            if (reason === "in_progress") {
              if (admittedAt === null) admittedAt = now;
              deadline = admittedAt + AGENDA_CLIENT_POLL_BUDGET_MS;
            } else {
              deadline = startedAt + AGENDA_CLIENT_QUEUE_BUDGET_MS;
            }
            if (now >= deadline) {
              setState("error");
              return;
            }
            await agendaSleep(parseRetryAfterMs(res.headers.get("Retry-After")), controller.signal);
            continue;
          }

          // 504 timeout, 500, 403, and any other non-2xx → error.
          if (!live()) return;
          setState("error");
          return;
        }
      } finally {
        release();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stateKey, driveFileId, wizardSessionId]);

  // Test seam: capture currentKeyRef.current in the layout phase so the g3
  // regression can observe the render-time fix (line 761) without reading the
  // ref during render. Layout effects fire after DOM mutations but before
  // passive effects, making this the only window that distinguishes line 761
  // (render-time write) from the passive-effect write at line 768.
  useLayoutEffect(() => {
    _debugCurrentKeyAtLayout = currentKeyRef.current;
  });

  // §4.6 guard: no agenda links → no breakdown at all (and the effect above
  // never POSTs).
  if (baseline.length === 0) return null;

  const sourceHref = buildSheetDeepLink(driveFileId);

  return (
    <section
      data-testid={`wizard-step3-card-${driveFileId}-agenda`}
      className="flex flex-col gap-2"
    >
      {/* Non-heading eyebrow label: the reused AgendaScheduleBlock emits its own
          <h3> day labels, so a real <h4> here would invert the heading order
          (h4 > h3). Rendering the section label as a styled <p> keeps the inner
          <h3> from nesting under a higher-level heading. */}
      <p
        className="text-xs font-semibold uppercase text-text-subtle"
        style={{ letterSpacing: "var(--tracking-eyebrow)" }}
      >
        Agenda
      </p>
      {state === "loading" ? (
        <p
          role="status"
          aria-live="polite"
          data-testid={`wizard-step3-card-${driveFileId}-agenda-parsing`}
          className="text-xs text-text-subtle"
        >
          {`Parsing agenda… (${items.length} ${items.length === 1 ? "PDF" : "PDFs"})`}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <AgendaItemRow key={`${item.label}-${i}`} item={item} state={state} index={i} />
        ))}
      </ul>
      {state === "error" && sourceHref ? (
        <a
          data-testid="agenda-source-link"
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open the source sheet <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </section>
  );
}

export function Step3SheetCard({
  row,
  wizardSessionId,
  expanded: expandedProp,
  onToggleExpanded,
  checked: checkedProp,
  onToggleChecked,
}: {
  row: Step3Row;
  wizardSessionId: string;
  // Optional controlled expand state. When the parent grid supplies these, the
  // card is part of the single-open accordion (only one open at a time, the open
  // one spans full width). Omitted → the card self-manages its own expand state
  // (standalone / test usage stays unchanged).
  expanded?: boolean | undefined;
  onToggleExpanded?: (() => void) | undefined;
  // Optional controlled publish-intent (lifted into Step3Review). When the parent
  // supplies `onToggleChecked`, the checkbox is controlled by the shared optimistic
  // state so "Select all" updates this box instantly. Omitted → the checkbox
  // self-manages (standalone card usage unchanged).
  checked?: boolean | undefined;
  onToggleChecked?: ((next: boolean) => void) | undefined;
}) {
  const dfid = row.driveFileId;
  const pr = row.parseResult ?? null;
  const [expandedInternal, setExpandedInternal] = useState(false);
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : expandedInternal;
  const toggleExpanded = () => {
    if (isControlled) onToggleExpanded?.();
    else setExpandedInternal((v) => !v);
  };
  const panelId = useId();

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
      </article>
    );
  }

  const crewMembers = arr(pr.crewMembers);
  const rooms = arr(pr.rooms);
  const hotels = arr(pr.hotelReservations);
  const ros: RunOfShow = pr.runOfShow ?? {};
  const warnings = arr(pr.warnings);
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
      {/* Header row: a reserved leading slot (D3 checkbox lands here) + the
          summary text block. The slot is shrink-0; the block is min-w-0 flex-1
          so a long title truncates instead of overflowing the fixed-width
          list column (§4.4). */}
      <div data-testid={`wizard-step3-card-${dfid}-summary`} className="flex items-start gap-3">
        {/* Leading slot (D3): the durable publish-intent checkbox. shrink-0 so a
            long title (min-w-0 flex-1 below) truncates instead of squeezing it. */}
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

      {/* Details disclosure — a quiet, left-aligned TEXT toggle (not a boxed,
          full-width dropdown-styled button). The label + chevron is the affordance
          (discoverable without hover, PRODUCT.md); hover only adds an underline.
          ≥44px tap target via min-h-tap-min; self-start so it sizes to its content
          and sits at the card's left edge instead of stretching full width. */}
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-expand`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggleExpanded}
        className="inline-flex min-h-tap-min items-center gap-1 self-start text-sm font-medium text-text-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform duration-fast ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Bounded, height-morphing breakdown region (§4.4/§4.5). overflow-hidden
          via the [data-step3-breakdown] rule in globals.css keeps the
          fixed-width column from overflowing during the morph. `inert` while
          collapsed removes the panel's focusable controls (the "Show all N
          times" expander) from the tab order + a11y tree — the height:0 morph
          is NOT display:none, so without `inert` they'd be tabbable +
          AT-discoverable while hidden (whole-diff R2 HIGH). */}
      <div
        id={panelId}
        data-testid={`wizard-step3-card-${dfid}-breakdown`}
        data-step3-breakdown=""
        data-expanded={expanded ? "true" : "false"}
        inert={!expanded}
      >
        {/* Balanced multi-column flow. The expanded card spans the full grid
            width (the open accordion card is `lg:col-span-2 xl:col-span-3`), so on
            desktop it has room for 2–3 columns; CSS multi-column balances the
            variable-height sections into them and fills the horizontal dead space a
            single column left behind. `break-inside-avoid` keeps each section whole
            across a column boundary; `mb-6` carries the vertical rhythm `gap` can't
            provide in column flow (last section drops it). Collapses to one column
            on mobile/narrow. `wrap-break-word` still bounds any unbreakable token
            (§4.4). Column count uses named breakpoints (DESIGN.md §6: sm/lg/xl — no
            `md`), never an arbitrary value (token discipline §10). */}
        <div
          data-testid={`wizard-step3-card-${dfid}-breakdown-grid`}
          className="columns-1 gap-x-8 wrap-break-word pt-1 sm:columns-2 xl:columns-3 [&>section]:mb-6 [&>section]:break-inside-avoid [&>section:last-child]:mb-0"
        >
          <CrewBreakdown dfid={dfid} members={crewMembers} />
          <ScheduleBreakdown dfid={dfid} ros={ros} />
          <RoomsBreakdown dfid={dfid} rooms={rooms} />
          <HotelsBreakdown dfid={dfid} hotels={hotels} />
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
        {/* Warnings — pulled OUT of the multi-column data flow into a FULL-WIDTH
            bordered callout BELOW the rest of the breakdown, so the non-blocking
            data-quality notes stand apart from the show data instead of competing
            with it in a column. Warm warning-bg + a full strong border (DESIGN.md
            §1.2 — warning, not error; full border, never a side-stripe). Gated on
            warnings so there is no empty box (WarningsBreakdown also returns null
            when empty). */}
        {warnings.length > 0 ? (
          <div
            data-testid={`wizard-step3-card-${dfid}-warnings-panel`}
            className="mt-6 rounded-md border border-border-strong bg-warning-bg p-tile-pad"
          >
            <WarningsBreakdown dfid={dfid} warnings={warnings} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
