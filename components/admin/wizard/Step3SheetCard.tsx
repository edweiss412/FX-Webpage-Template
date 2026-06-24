"use client";

/**
 * components/admin/wizard/Step3SheetCard.tsx (Task D2 — spec §4.2/§4.3/§4.6)
 *
 * The inline step-3 review card for ONE cleanly-parsed `staged` sheet. It
 * replaces the old "Review and apply" navigation link: instead of routing to
 * the finalize-failure recovery page, the parse preview is shown in place.
 *
 *   - Summary (always visible): show title, client, dates, the counts strip
 *     (N crew · N rooms · N hotels · N schedule days), diagrams/reel badges,
 *     and a warnings chip when warnings exist.
 *   - Breakdown (expand toggle): crew names+roles, schedule outline, rooms,
 *     hotels — each capped per §4.3.
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
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import type {
  AgendaEntry,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  RoomRow,
  RunOfShow,
} from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { summarizeDataGaps, dataGapClassDetails } from "@/lib/parser/dataGaps";

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

// ── Summary date rendering (§4.2): render only present segments. ──
function dateSegments(dates: ParseResult["show"]["dates"] | undefined): string[] {
  if (!dates) return [];
  const segs: string[] = [];
  if (dates.travelIn) segs.push(dates.travelIn);
  if (dates.set) segs.push(dates.set);
  for (const d of arr(dates.showDays)) segs.push(d);
  if (dates.travelOut) segs.push(dates.travelOut);
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
          {shownDays.map((iso) => {
            const entries: AgendaEntry[] = arr(ros[iso]?.entries);
            const shownEntries = entries.slice(0, SCHEDULE_ENTRIES_CAP);
            const extra = entries.length - SCHEDULE_ENTRIES_CAP;
            return (
              <li key={iso} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium tabular-nums text-text-strong">{iso}</span>
                {shownEntries.map((e, i) => (
                  <span key={`${iso}-${i}`} className="text-sm text-text">
                    <span className="tabular-nums text-text-subtle">{e.start}</span>
                    {e.title ? <span> · {e.title}</span> : null}
                  </span>
                ))}
                {extra > 0 ? (
                  <span className="text-xs text-text-subtle">{`…+${extra}`}</span>
                ) : null}
              </li>
            );
          })}
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
 * The durable publish-intent checkbox (§4.1/§4.6/§7.2). Checked = the row's
 * manifest status is 'applied'. On toggle it POSTs to the LIGHTWEIGHT approve /
 * un-approve pair (NOT the heavy navigation-era apply route — finalize
 * re-validates at apply time, so the checkbox stays cheap) and then refreshes the
 * RSC tree. The control optimistically reflects the new state and DISABLES itself
 * while its request is in flight (§4.6 — prevents a double-toggle race).
 *
 * A real <input type=checkbox> (keyboard-operable, sr-only) backs the visible
 * tile; the tile is a ≥44px tap target via the wrapping <label>. The native input
 * is visually hidden but never removed from the tree (focusable + announced).
 */
export function PublishCheckbox({
  driveFileId,
  wizardSessionId,
  initialChecked,
}: {
  driveFileId: string;
  wizardSessionId: string;
  initialChecked: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initialChecked);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    if (pending) return; // §4.6 guard — ignore re-entry while a write is in flight
    const action = next ? "approve" : "unapprove";
    setPending(true);
    setChecked(next); // optimistic
    try {
      const response = await fetch(
        `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) {
        setChecked(!next); // revert optimistic state on a refused/failed write
        return;
      }
      router.refresh();
    } catch {
      setChecked(!next); // network failure → revert
    } finally {
      setPending(false);
    }
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
          checked ? "Publishing this show — uncheck to keep it unpublished" : "Publish this show"
        }
        onChange={(e) => void toggle(e.currentTarget.checked)}
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

export function Step3SheetCard({
  row,
  wizardSessionId,
}: {
  row: Step3Row;
  wizardSessionId: string;
}) {
  const dfid = row.driveFileId;
  const pr = row.parseResult ?? null;
  const [expanded, setExpanded] = useState(false);
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
            <p className="truncate text-base font-semibold text-text-strong">{titleFallback}</p>
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
  const scheduleDays = Object.keys(ros).length;
  const warnings = arr(pr.warnings);
  // parse-data-quality-warnings §6.2a — the publish-decision point. Derive the
  // per-class data-gap breakdown (single-sourced via summarizeDataGaps) so the
  // operator sees WHAT dropped, not just a generic warning count, before ticking
  // the publish checkbox. Distinct from the generic `warnings.length` chip below
  // (which counts every warning class).
  const dataGapDetails = dataGapClassDetails(summarizeDataGaps(warnings));

  const title = pr.show.title || titleFallback;
  const client = pr.show.client_label || null;
  const segs = dateSegments(pr.show.dates);

  const hasDiagrams =
    pr.diagrams?.linkedFolder != null || arr(pr.diagrams?.embeddedImages).length > 0;
  const hasReel = pr.openingReel != null;

  // Counts strip — dot-separated, tabular figures (§4.2). A 0 renders.
  const counts = [
    `${crewMembers.length} crew`,
    `${rooms.length} rooms`,
    `${hotels.length} hotels`,
    `${scheduleDays} schedule days`,
  ].join(" · ");

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
          driveFileId={dfid}
          wizardSessionId={wizardSessionId}
          initialChecked={row.status === "applied"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-text-strong" title={title}>
            {title}
          </p>
          {client ? <p className="truncate text-sm text-text-subtle">{client}</p> : null}
          <p className="mt-1 text-sm tabular-nums text-text-subtle">
            {segs.length > 0 ? (
              <span>{segs.join(" → ")}</span>
            ) : (
              <span className="text-text-subtle">Dates not found</span>
            )}
          </p>
          <p className="mt-1 text-sm tabular-nums text-text-subtle">{counts}</p>

          {(hasDiagrams || hasReel || warnings.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {hasDiagrams ? (
                <Badge testId={`wizard-step3-card-${dfid}-badge-diagrams`} label="Diagrams ✓" />
              ) : null}
              {hasReel ? (
                <Badge testId={`wizard-step3-card-${dfid}-badge-reel`} label="Reel ✓" />
              ) : null}
              {warnings.length > 0 ? (
                <span
                  data-testid={`wizard-step3-card-${dfid}-warnings`}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-text"
                >
                  <span aria-hidden="true" className="size-1.5 rounded-pill bg-warning-text" />
                  <span className="tabular-nums">{warnings.length}</span>{" "}
                  {warnings.length === 1 ? "warning" : "warnings"}
                </span>
              ) : null}
            </div>
          )}

          {/* parse-data-quality-warnings §6.2a — per-class data-gap detail shown
              before the publish decision. PLAIN-LANGUAGE labels only (invariant
              5 — never the raw §12.4 code). Static parse state → present iff
              total>0 / absent otherwise; instant, no animation. */}
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

      {/* Expand toggle — full-width quiet control, ≥44px tap target, no
          hover-only affordance (PRODUCT.md). */}
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-expand`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex min-h-tap-min items-center justify-between gap-2 rounded-sm border border-border bg-bg px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform duration-fast ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Bounded, height-morphing breakdown region (§4.4/§4.5). overflow-hidden
          via the [data-step3-breakdown] rule in globals.css keeps the
          fixed-width column from overflowing during the morph. */}
      <div
        id={panelId}
        data-testid={`wizard-step3-card-${dfid}-breakdown`}
        data-step3-breakdown=""
        data-expanded={expanded ? "true" : "false"}
      >
        {/* wrap-break-word bounds any unbreakable long token (a run-on role
            label or sheet-derived name) so the breakdown never horizontally
            overflows the fixed-width list column (§4.4). */}
        <div className="flex flex-col gap-4 wrap-break-word pt-1">
          <CrewBreakdown dfid={dfid} members={crewMembers} />
          <ScheduleBreakdown dfid={dfid} ros={ros} />
          <RoomsBreakdown dfid={dfid} rooms={rooms} />
          <HotelsBreakdown dfid={dfid} hotels={hotels} />
        </div>
      </div>
    </article>
  );
}
