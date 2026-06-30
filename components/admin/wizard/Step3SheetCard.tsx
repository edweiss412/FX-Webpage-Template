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
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, ExternalLink } from "lucide-react";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import type {
  AgendaEntry,
  ClientContact,
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  ParseWarning,
  PullSheetCase,
  PullSheetItem,
  RoomRow,
  RunOfShow,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { humanizeDate, humanizeDayRange } from "@/lib/dates/humanize";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { summarizeDataGaps, dataGapClassDetails } from "@/lib/parser/dataGaps";
import { venueDisplay } from "@/lib/venue/venueLocation";
import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import {
  AGENDA_CLIENT_CONCURRENCY,
  AGENDA_CLIENT_POLL_BUDGET_MS,
  AGENDA_CLIENT_QUEUE_BUDGET_MS,
} from "@/lib/agenda/constants";
import { Step3DetailsDialog } from "@/components/admin/wizard/Step3DetailsDialog";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";

// ── §4.3 caps (single source of truth) ──
const CREW_CAP = 30;
const ROOMS_CAP = 20;
const HOTELS_CAP = 12;
// Pack-list cases shown in the review breakdown; mirrors the crew GearSection
// CASE_CAP (12) so the operator sees the same ceiling the crew page applies.
const PACK_LIST_CASES_CAP = 12;
// Items shown per expanded case before a "+K more items" tail. Bounds the
// expanded height so one fat case (e.g. a 31-item distro case) can't dominate
// the breakdown column; deep verification continues on the source sheet.
const PACK_LIST_ITEMS_CAP = 8;

// Per-room equipment-scope fields shown under each room in the review breakdown so
// the operator can VERIFY parsed gear (GEAR-tab + INFO A/V/L) before publishing. We
// show every NON-EMPTY value as-parsed (sentinels like "TBD"/"-" included) — this is
// a parse-review surface, not the crew page (which sentinel-hides), so the operator
// sees exactly what landed. Order mirrors the crew GearSection (A→V→L→Scenic→Other).
const ROOM_SCOPE_FIELDS: ReadonlyArray<{ label: string; key: keyof RoomRow }> = [
  { label: "Audio", key: "audio" },
  { label: "Video", key: "video" },
  { label: "Lighting", key: "lighting" },
  { label: "Scenic", key: "scenic" },
  { label: "Other", key: "other" },
];

/** A string field that actually parsed to content (non-null, non-whitespace). */
function hasContent(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Build {label,value} rows from [label, rawValue] pairs, keeping only as-parsed
 * content (hasContent — non-null, non-whitespace string). Used by the operator
 * review-modal field-group sections (Venue / Ops / Transport / Contacts).
 */
function contentRows(
  pairs: ReadonlyArray<readonly [string, unknown]>,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [label, val] of pairs) if (hasContent(val)) out.push({ label, value: val });
  return out;
}

/** Vertical label:value list shared by the review-modal field-group sections. */
function FieldRowList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <li key={r.label} className="wrap-break-word text-sm text-text">
          <span className="font-medium text-text-strong">{r.label}:</span> {r.value}
        </li>
      ))}
    </ul>
  );
}
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

function ContactsBreakdown({
  dfid,
  clientContact,
  contacts,
}: {
  dfid: string;
  clientContact: ClientContact | null;
  contacts: ContactRow[];
}) {
  // Client people: primary + optional secondary (null-safe). Each a "Client contact".
  const clientPeople = [clientContact, clientContact?.secondary].filter(Boolean) as {
    name: string;
    phone: string | null;
    email: string | null;
    officePhone?: string | null;
  }[];
  const blocks = [
    ...clientPeople.map((p) => ({
      key: `client-${p.name}`,
      kind: "Client contact",
      rows: contentRows([
        ["Name", p.name],
        ["Phone", p.phone],
        ["Email", p.email],
        ["Office", p.officePhone],
      ]),
    })),
    ...contacts.map((c, i) => ({
      key: `contact-${i}`,
      kind: c.kind === "in_house_av" ? "In-house AV" : "Venue contact",
      rows: contentRows([
        ["Name", c.name],
        ["Phone", c.phone],
        ["Email", c.email],
      ]),
    })),
  ].filter((b) => b.rows.length > 0);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-contacts`}
      label="Contacts"
      count={blocks.length}
    >
      {blocks.length === 0 ? (
        <p className="text-sm text-text-subtle">No contacts parsed.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {blocks.map((b) => (
            <li key={b.key} className="text-sm text-text">
              <span className="text-xs font-semibold uppercase text-text-subtle">{b.kind}</span>
              <FieldRowList rows={b.rows} />
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}

function VenueBreakdown({ dfid, venue }: { dfid: string; venue: ShowRow["venue"] }) {
  const rows = venue
    ? contentRows([
        ["Venue", venue.name],
        ["Address", venue.address],
        ["City", venue.city],
        ["Loading dock", venue.loadingDock],
        ["Maps link", venue.googleLink],
      ])
    : [];
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-venue`}
      label="Venue"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No venue details parsed.</p>
      ) : (
        <FieldRowList rows={rows} />
      )}
    </BreakdownSection>
  );
}

function TransportBreakdown({
  dfid,
  transportation,
}: {
  dfid: string;
  transportation: TransportationRow | null;
}) {
  const t = transportation;
  const fieldRows = t
    ? contentRows([
        ["Driver", t.driver_name],
        ["Driver phone", t.driver_phone],
        ["Driver email", t.driver_email],
        ["Vehicle", t.vehicle],
        ["License plate", t.license_plate],
        ["Color", t.color],
        ["Parking", t.parking],
        ["Notes", t.notes],
      ])
    : [];
  // schedule legs — arr()-guarded against untyped JSONB; each leg gated on stage.
  const legs = (t ? arr(t.schedule) : [])
    .filter((leg) => hasContent(leg.stage))
    .map((leg) => {
      const when = [leg.date, leg.time].filter((x) => hasContent(x)).join(" ");
      const who = arr(leg.assigned_names)
        .filter((n) => hasContent(n))
        .join(", ");
      return {
        stage: leg.stage as string,
        meta: [when, who].filter((x) => x.length > 0).join(" — "),
      };
    });
  const count = fieldRows.length + legs.length;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-transport`}
      label="Transport"
      count={count}
    >
      {count === 0 ? (
        <p className="text-sm text-text-subtle">No transportation parsed.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fieldRows.length > 0 ? <FieldRowList rows={fieldRows} /> : null}
          {legs.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {legs.map((leg, i) => (
                <li key={`${leg.stage}-${i}`} className="wrap-break-word text-sm text-text">
                  <span className="font-medium text-text-strong">{leg.stage}</span>
                  {leg.meta ? <span className="text-text-subtle"> · {leg.meta}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </BreakdownSection>
  );
}

function OpsBreakdown({ dfid, show }: { dfid: string; show: ShowRow }) {
  const rows = contentRows([
    ["COI", show.coi_status],
    ["Proposal", show.proposal],
    ["PO#", show.po],
    ["Invoice", show.invoice],
    ["Invoice notes", show.invoice_notes],
  ]);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-ops`}
      label="Ops"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No ops details parsed.</p>
      ) : (
        <FieldRowList rows={rows} />
      )}
    </BreakdownSection>
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
              {hasContent(m.phone) ? <span className="text-text-subtle"> · {m.phone}</span> : null}
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
  // Cap-exemption partition (spec §9.4): cap ONLY the agenda group at
  // SCHEDULE_ENTRIES_CAP; ALWAYS render the synthetic group (strike/load-out)
  // after it. The "Show all M times" toggle + overflow count are agenda-only —
  // a same-day load-out is never hidden behind the cap.
  const agenda = entries.filter((e) => e.kind !== "strike" && e.kind !== "loadout");
  const synthetic = entries.filter((e) => e.kind === "strike" || e.kind === "loadout");
  const visibleAgenda = showAll ? agenda : agenda.slice(0, SCHEDULE_ENTRIES_CAP);
  const hidden = agenda.length - SCHEDULE_ENTRIES_CAP;
  // Synthetic rows always follow the (capped) agenda rows in the SAME 2-track
  // grid, so their time/title cells share the agenda rows' column edges.
  const rows = [...visibleAgenda, ...synthetic];

  return (
    <li className="flex flex-col gap-1">
      <span className="text-xs font-medium tabular-nums text-text-strong">
        {humanizeDate(iso) ?? iso}
      </span>
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">
        {rows.map((e, i) => {
          const isSynthetic = e.kind === "strike" || e.kind === "loadout";
          return (
            <Fragment key={`${iso}-${i}`}>
              <span
                data-testid={`wizard-step3-card-${dfid}-sched-time`}
                className="whitespace-nowrap text-sm tabular-nums text-text-subtle"
              >
                {e.start}
              </span>
              {/* Title cell = the 1fr track. A synthetic entry (strike/load-out)
                  carries a MUTED tone + a leading hairline rule INSIDE this cell
                  (§9.3 "muted-title" option — no kind-word badge that would repeat
                  the title's own leading word), so the two-track alignment holds. */}
              <span
                data-testid={`wizard-step3-card-${dfid}-sched-title`}
                data-entry-kind={isSynthetic ? e.kind : undefined}
                className={`text-sm ${
                  isSynthetic ? "border-l border-border pl-2 text-text-subtle" : "text-text"
                }`}
              >
                {e.title || ""}
              </span>
            </Fragment>
          );
        })}
      </div>
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          data-testid={`wizard-step3-card-${dfid}-sched-expand-${iso}`}
          onClick={() => setShowAll(true)}
          className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {`Show all ${agenda.length} times`}
        </button>
      ) : null}
    </li>
  );
}

function ScheduleBreakdown({ dfid, ros }: { dfid: string; ros: RunOfShow }) {
  const dayKeys = Object.keys(ros);
  // Day cap-exemption (spec §9.2): a day whose entries contain a strike/load-out
  // is ALWAYS rendered (a malformed/long sheet could push the exact admin-only
  // synthetic day past the cap). shownDays = (first SCHEDULE_DAYS_CAP days) ∪
  // (every synthetic-bearing day); the "…and N more days" note counts only the
  // dropped NON-synthetic days.
  const isSyntheticDay = (iso: string): boolean =>
    arr(ros[iso]?.entries).some((e) => e.kind === "strike" || e.kind === "loadout");
  const shownDays = dayKeys.filter((iso, idx) => idx < SCHEDULE_DAYS_CAP || isSyntheticDay(iso));
  const droppedNonSynthetic = dayKeys.filter(
    (iso, idx) => idx >= SCHEDULE_DAYS_CAP && !isSyntheticDay(iso),
  ).length;
  const daysNote = droppedNonSynthetic > 0 ? `…and ${droppedNonSynthetic} more days` : null;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-schedule`}
      label="Crew Schedule"
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
          {shown.map((r, i) => {
            const scope = ROOM_SCOPE_FIELDS.filter((f) => hasContent(r[f.key]));
            return (
              <li key={`${r.name}-${i}`} className="text-sm text-text">
                <span className="font-medium text-text-strong">{r.name || "Room"}</span>
                {r.kind ? <span className="text-text-subtle"> · {r.kind}</span> : null}
                {scope.length > 0 ? (
                  <ul
                    data-testid={`wizard-step3-card-${dfid}-room-${i}-scope`}
                    className="mt-0.5 flex flex-col gap-0.5 pl-3 text-xs text-text-subtle"
                  >
                    {scope.map((f) => (
                      <li key={f.label} className="wrap-break-word">
                        <span className="font-medium text-text">{f.label}:</span>{" "}
                        {r[f.key] as string}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(() => {
                  // Per-room physical + schedule detail (BL-ROOM-DETAIL-UNRENDERED).
                  // Coerce once; keep non-empty AS-PARSED (sentinels visible — review
                  // surface, NOT sentinel-hidden like the crew page).
                  const detail = ROOM_DETAIL_FIELDS.map((f) => ({
                    label: f.label,
                    value: String(r[f.key] ?? "").trim(),
                  })).filter((d) => d.value.length > 0);
                  return detail.length > 0 ? (
                    <ul
                      data-testid={`wizard-step3-card-${dfid}-room-${i}-detail`}
                      className="mt-0.5 flex flex-col gap-0.5 pl-3 text-xs text-text-subtle"
                    >
                      {detail.map((d) => (
                        <li key={d.label} className="wrap-break-word">
                          <span className="font-medium text-text">{d.label}:</span> {d.value}
                        </li>
                      ))}
                    </ul>
                  ) : null;
                })()}
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

// Show-level event-detail fields the crew GearSection surfaces — keynote + opening
// reel — so the operator can verify them at the publish gate. opening_reel is
// URL-stripped (stripOpeningReelText) for a clean line; values shown as-parsed.
function EventDetailsBreakdown({
  dfid,
  eventDetails,
}: {
  dfid: string;
  eventDetails: Record<string, string> | undefined;
}) {
  const ed = eventDetails ?? {};
  // Render every known TEXT spec (closed-vocab EVENT_DETAILS_LABELS; `diagrams`
  // is excluded there — folder link) so the operator sees the full picture
  // pre-publish (BL-EVENT-DETAILS-UNRENDERED). This is a REVIEW surface, so
  // sentinels are shown AS-PARSED (a 'TBD'/'N/A' tells the operator the cell
  // parsed-but-unfilled) — deliberately NOT sentinel-hidden like the crew card.
  // This asymmetry is the existing, tested contract (Step3Review.test.tsx
  // "shown as-parsed (review surface, not sentinel-hidden like the crew page)").
  // Coerce FIRST (String() is null/non-string-safe), then keep any non-empty
  // value; `opening_reel` keeps its URL-strip cleanup; trim prevents whitespace
  // from inflating `count`.
  const fields: { label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(EVENT_DETAILS_LABELS)) {
    const text = String(ed[key] ?? "").trim();
    const value = key === "opening_reel" ? stripOpeningReelText(text).trim() : text;
    if (value.length > 0) fields.push({ label, value });
  }
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-event-details`}
      label="Event details"
      count={fields.length}
    >
      {fields.length === 0 ? (
        <p className="text-sm text-text-subtle">No event details parsed.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {fields.map((f) => (
            <li key={f.label} className="wrap-break-word text-sm text-text">
              <span className="font-medium text-text-strong">{f.label}:</span> {f.value}
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}

// One parsed PULL-sheet item rendered as the crew GearSection renders it
// (GearSection.tsx:339-345): `qty × item (cat / subCat)`, with the decorative
// cat/subCat taxonomy sentinel-guarded (hidden when TBD/N/A/empty) and the qty
// prefix dropped when null. The item NAME itself is shown as-parsed — this is a
// review surface, so a garbled name must be visible, not hidden.
function packItemLabel(item: PullSheetItem): string {
  const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
  const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
  const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
  const qtyPart = item.qty !== null && item.qty !== undefined ? `${item.qty} × ` : "";
  // Defensive (§4.6, untyped-on-wire JSONB): the type says `item: string`, but a
  // malformed row must never render the literal "undefined". A nameless item is
  // itself a parse signal worth seeing on a review surface, so label it.
  const name = hasContent(item.item) ? item.item : "(unnamed item)";
  return `${qtyPart}${name}${taxonomy ? ` (${taxonomy})` : ""}`;
}

// The parsed PULL-tab pack list (`pr.pullSheet`) — the same data the crew
// GearSection renders, surfaced here so the operator can verify it parsed at the
// publish gate. Each case is a native <details>: the COLLAPSED summary is the
// case label (or "Case N" fallback) + item count; EXPANDING reveals the parsed
// items (qty × item (cat/subCat)), capped at PACK_LIST_ITEMS_CAP, so the default
// view stays compact while full crew parity is one click away. Cases are capped
// at PACK_LIST_CASES_CAP (the crew CASE_CAP). UNGATED — unlike the crew page
// (which date-gates pack-list visibility via isPackListVisibleToday), a review
// surface always shows what parsed. A case with zero items renders as a plain
// non-expandable line.
function PackListBreakdown({ dfid, cases }: { dfid: string; cases: PullSheetCase[] }) {
  const shown = cases.slice(0, PACK_LIST_CASES_CAP);
  const note = overflowNote(cases.length, PACK_LIST_CASES_CAP, "cases");
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-pack-list`}
      label="Pack list"
      count={cases.length}
    >
      {cases.length === 0 ? (
        <p className="text-sm text-text-subtle">No pack list parsed.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {shown.map((c, i) => {
            const items = arr(c.items);
            const label = c.caseLabel || `Case ${i + 1}`;
            const head = (
              <>
                <span className="font-medium text-text-strong">{label}</span>
                <span className="text-text-subtle">
                  {" "}
                  · <span className="tabular-nums">{items.length}</span>{" "}
                  {items.length === 1 ? "item" : "items"}
                </span>
              </>
            );
            // No items → nothing to expand; render a plain line (the count still
            // tells the operator the case parsed but is empty).
            if (items.length === 0) {
              return (
                <li key={`${label}-${i}`} className="wrap-break-word text-sm text-text">
                  {head}
                </li>
              );
            }
            const shownItems = items.slice(0, PACK_LIST_ITEMS_CAP);
            const itemsNote = overflowNote(items.length, PACK_LIST_ITEMS_CAP, "items");
            return (
              <li key={`${label}-${i}`} className="text-sm text-text">
                <details data-testid={`wizard-step3-card-${dfid}-pack-case-${i}`}>
                  <summary className="wrap-break-word cursor-pointer marker:text-text-subtle">
                    {head}
                  </summary>
                  <ul className="mt-0.5 flex flex-col gap-0.5 pl-3 text-xs text-text-subtle">
                    {shownItems.map((item, j) => (
                      <li key={`${item.item}-${j}`} className="wrap-break-word">
                        {packItemLabel(item)}
                      </li>
                    ))}
                    {itemsNote ? <li className="text-text-faint">{itemsNote}</li> : null}
                  </ul>
                </details>
              </li>
            );
          })}
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
              {hasContent(h.hotel_address) ? (
                <span className="block text-xs text-text-subtle">{h.hotel_address}</span>
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
  onLiveKeyLayout,
}: {
  driveFileId: string;
  wizardSessionId: string;
  baseline: AdminAgendaItem[];
  stateKey: string;
  /**
   * Test-only observability seam (production never passes it): receives
   * `currentKeyRef.current` in the LAYOUT-effect phase — after commit, before
   * passive effects — which is the only window that reflects ONLY the
   * render-time live-key write (the generation-race fix) and not the later
   * passive-effect write. Per-instance (no shared module state).
   */
  onLiveKeyLayout?: (liveKey: string) => void;
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

  // Test-only observability (no-op in production — `onLiveKeyLayout` is never
  // passed): report the live generation key in the layout phase so the g3
  // regression can observe the render-time fix without reading the ref during
  // render. Layout effects fire after DOM mutations but before passive effects,
  // the only window that distinguishes the render-time live-key write from the
  // passive-effect write.
  useLayoutEffect(() => {
    onLiveKeyLayout?.(currentKeyRef.current);
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
            <TransportBreakdown dfid={dfid} transportation={pr.transportation} />
            <EventDetailsBreakdown dfid={dfid} eventDetails={pr.show.event_details} />
            <PackListBreakdown dfid={dfid} cases={pullSheet} />
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
