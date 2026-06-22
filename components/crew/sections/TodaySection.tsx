/**
 * components/crew/sections/TodaySection.tsx — crew-redesign §9 "Today" section.
 *
 * The single synchronous Server Component for the Today sub-nav section. It
 * ports the full field set of the deleted today-band tiles into one curated
 * surface:
 *
 *   - RightNowHero (the live `'use client'` island; built from the projection
 *     via `buildRightNowContext`). The hero owns its own `new Date()` clock —
 *     this section is synchronous and passes it NO `today`.
 *   - KeyTimesStrip — Set / Show / Strike anchors via the shared
 *     `resolveKeyTimes(show, rooms)` resolver (§4.4).
 *   - Tonight card — the first hotel reservation (name + check-in / check-out).
 *   - Where card — the show venue (name + address + dock + notes-free meta).
 *   - Need-something card — the deterministic actionable primary contact via
 *     `selectPrimaryContact(contacts)` (omitted when no actionable contact).
 *   - Dress code line — `event_details.{dress_code|dress|attire}`, gated by
 *     `shouldHideGenericOptional` so sentinels reflow out.
 *   - Show notes — the 5-source aggregation venue → hotel → room → transport →
 *     contact (`SOURCE_CAP` / `TRUNCATE_AT` ported from NotesTile). The
 *     transport note is gated on `transportTileVisible` so a non-assigned crew
 *     member never sees the driver's prose.
 *
 * `client_contact` is read NOWHERE. The actionable contacts list is the only
 * contact source — the client rep is never surfaced to crew (§30).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `next/headers`,
 * no `new Date()` / `nowDate()` inside). `today` + `showId` are passed in.
 */
import type { JSX } from "react";

import { RightNowHero } from "@/components/crew/RightNowHero";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { SectionChipLink } from "@/components/crew/SectionChipLink";
import {
  BedIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  NoteIcon,
  PhoneIcon,
} from "@/components/crew/icons/sectionIcons";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import { aggregateDays, displayableEntries } from "@/lib/crew/agendaDisplay";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

// Ported from NotesTile.tsx (:57-58) — the 5-source aggregation caps.
const TRUNCATE_AT = 280;
const SOURCE_CAP = 8;

type NotesEntry = {
  source: "venue" | "hotel" | "room" | "transport" | "contact";
  label: string;
  text: string;
};

/**
 * Identity-field non-empty predicate (NotesTile.tsx:88-92) — raw truthiness for
 * labels (hotel_name, room.name, contact.name) which may legitimately be a
 * sentinel-looking string.
 */
function nonEmpty(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Notes-text predicate (NotesTile.tsx:104-108) — §8.3 generic-optional: hides
 * null/empty/whitespace AND the universal sentinels via the single predicate.
 */
function notesText(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  if (shouldHideGenericOptional(s)) return null;
  return s.trim();
}

/**
 * Aggregate every notes source in the canonical order venue → hotel → room →
 * transport → contact (NotesTile.tsx:116-174). The transport source is only
 * included when `includeTransport` is true (the viewer can see the transport
 * tile per `transportTileVisible`).
 */
function aggregateNotes(data: ShowForViewer, includeTransport: boolean): NotesEntry[] {
  const out: NotesEntry[] = [];

  const venueText = notesText(data.show.venue?.notes ?? null);
  if (venueText) {
    out.push({ source: "venue", label: "Venue", text: venueText });
  }

  for (const h of data.hotelReservations) {
    const text = notesText(h.notes);
    if (!text) continue;
    const name = nonEmpty(h.hotel_name);
    out.push({ source: "hotel", label: name ? `Hotel: ${name}` : "Hotel", text });
  }

  for (const r of data.rooms) {
    const text = notesText(r.notes);
    if (!text) continue;
    const name = nonEmpty(r.name);
    out.push({ source: "room", label: name ? `Room: ${name}` : "Room", text });
  }

  if (includeTransport && data.transportation) {
    const text = notesText(data.transportation.notes);
    if (text) {
      out.push({ source: "transport", label: "Transport", text });
    }
  }

  for (const c of data.contacts) {
    const text = notesText(c.notes);
    if (!text) continue;
    const name = nonEmpty(c.name);
    out.push({ source: "contact", label: name ? `Contact: ${name}` : "Contact", text });
  }

  return out;
}

/** Truncate on codepoint count; single Unicode ellipsis (NotesTile.tsx:184-187). */
function truncate(text: string, max: number): { display: string; truncated: boolean } {
  if (text.length <= max) return { display: text, truncated: false };
  return { display: `${text.slice(0, max - 1).trimEnd()}…`, truncated: true };
}

type TodaySectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
};

export function TodaySection({ data, viewer, today, showId }: TodaySectionProps): JSX.Element {
  // Single canonical viewer resolution: flags / restriction / name / isAdmin.
  // admin → all-flags + none-restriction; crew/admin_preview → matched row;
  // malformed projection throws MalformedProjectionError (INTENTIONALLY outside
  // WrappedSection so the route-level infra arm catches it, not the per-block
  // fallback).
  const ctx = resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-today" className="flex flex-col gap-4">
      <WrappedSection
        tileId="crew:today:notes"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // ── Mode A gate (the today-only run-of-show fork; §5). ────────────
          // The Today run-of-show timeline is a NEW data surface that MUST
          // enforce the IDENTICAL date-restriction trust boundary as
          // ScheduleSection — via the SAME shared code path, never a
          // re-implemented predicate. The viewer is resolved OUTSIDE this
          // closure (`ctx`, above) so a malformed projection throws
          // MalformedProjectionError at the route-level infra arm, not the
          // per-block WrappedSection fallback (mirrors ScheduleSection).
          //
          //   - unknown_asterisk → ZERO leak: the *** marker is the operator's
          //     "haven't told us yet" signal. NO timeline, NO show-day text →
          //     Mode B (identical to ScheduleSection.tsx unknown_asterisk arm).
          //   - todayIso is the SHOW-tz date (todayIsoInShowTimezone) — NEVER
          //     new Date()/UTC. Around tz midnight the wrong run-of-show day
          //     must not show, and a date-restricted viewer must not see the
          //     NEXT day's agenda before it is actually that day in the show tz.
          //   - isShowDay: todayIso ∈ aggregateDays(dates) (Codex plan R1 HIGH)
          //     — guards a stale/off-aggregate runOfShow key whose date is not
          //     one of THIS show's days.
          //   - eligible: kind==='none' OR (kind==='explicit' AND days has
          //     todayIso) — the SAME rule Schedule uses to intersect.
          //   - todays: displayableEntries(...) — the SAME leak-critical filter
          //     (URL-only/sentinel titles never occupy a row).
          //
          // Mode A iff isShowDay && eligible && todays.length > 0. Fail-closed:
          // any ambiguity (unknown_asterisk, not a show day, ineligible, empty
          // filter, no runOfShow) → Mode B (the full-width stack, unchanged).
          // Data-driven render fork — instant, no animation (§ Transitions).
          const dateRestriction = ctx.dateRestriction;
          const todayIso = todayIsoInShowTimezone(data.show, today);
          const isShowDay = aggregateDays(data.show.dates).some((d) => d.date === todayIso);
          const eligible =
            dateRestriction.kind === "none" ||
            (dateRestriction.kind === "explicit" && new Set(dateRestriction.days).has(todayIso));
          const todays =
            dateRestriction.kind === "unknown_asterisk"
              ? []
              : displayableEntries(data.runOfShow?.[todayIso]);
          const modeA = isShowDay && eligible && todays.length > 0;

          const rightNowContext = buildRightNowContext({
            show: data.show,
            dateRestriction: ctx.dateRestriction,
            hotelReservations: data.hotelReservations,
            rooms: data.rooms,
          });

          const anchors = resolveKeyTimes(data.show, data.rooms);

          const firstHotel = data.hotelReservations[0] ?? null;
          const tonightRows: KeyValueRow[] = firstHotel
            ? [
                { k: "Hotel", v: firstHotel.hotel_name ?? "" },
                { k: "Check in", v: firstHotel.check_in ?? "" },
                { k: "Check out", v: firstHotel.check_out ?? "" },
              ]
            : [];

          const venue = data.show.venue;
          const whereRows: KeyValueRow[] = venue
            ? [
                { k: "Venue", v: venue.name ?? "" },
                { k: "Address", v: venue.address ?? "" },
                ...(venue.loadingDock != null
                  ? [{ k: "Loading dock", v: venue.loadingDock } as KeyValueRow]
                  : []),
              ]
            : [];

          const primaryContact = selectPrimaryContact(data.contacts);

          // Dress code — first NON-SENTINEL of the candidate keys (ported verbatim
          // from ShowStatusTile.pickDressCode, ShowStatusTile.tsx:66-77). A plain
          // `??` chain is WRONG: a sentinel `dress_code:"N/A"` is non-null, so `??`
          // would stop there and the real `attire:"Black tie"` would be dropped.
          // Iterate candidates (case-insensitive, incl. the spaced "dress code"
          // variant) and skip sentinels so a meaningful later key still surfaces.
          const dressLower = new Map(
            Object.entries(data.show.event_details).map(([k, v]) => [k.toLowerCase(), v]),
          );
          let dressRaw: string | null = null;
          for (const key of ["dress_code", "dress code", "dress", "attire"]) {
            const v = dressLower.get(key);
            if (typeof v === "string" && !shouldHideGenericOptional(v)) {
              dressRaw = v;
              break;
            }
          }
          const showDress = dressRaw !== null;

          // 5-source notes — transport source gated on transportTileVisible (the gate
          // uses the projection's `viewerName`, per the NotesTile transport contract).
          const transportVisible = transportTileVisible({
            transportation: data.transportation,
            viewerName: data.viewerName,
            isAdmin: ctx.isAdmin,
          });
          const noteEntries = aggregateNotes(data, transportVisible);
          const visibleNotes = noteEntries.slice(0, SOURCE_CAP);
          const overflowCount = Math.max(0, noteEntries.length - SOURCE_CAP);

          // §4.13 mechanism #3 — active-section FETCH-error visual fallback.
          // rooms feeds the KeyTimesStrip anchors (scope shown to all →
          // effectively ungated); hotel feeds the Tonight card (gate = isAdmin).
          // admin → inline degraded block; crew → omission. NO upsertAdminAlert
          // (the _CrewShell projection alert is the sole producer). A false gate
          // is a silent omission (no boundary widening). Composes with the
          // WrappedSection render-throw arm.
          const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && ctx.isAdmin;
          const hotelFetchFailed = Boolean(data.tileErrors["hotel"]) && ctx.isAdmin;
          // Today consumes contacts in TWO places (the Need-something card +
          // the contact source of the 5-source notes), so a contacts fetch
          // failure must surface as a degraded block on the PRIMARY section,
          // not a silent omission (else admins can't tell "fetch failed" from
          // "genuinely contact-less"). Contacts is ungated, so the degraded
          // block is admin-only (crew omission); no second upsertAdminAlert.
          const contactsFetchFailed = Boolean(data.tileErrors["contacts"]) && ctx.isAdmin;

          // §4.9 quick-cards STACK (Tonight / Where / Need-something). In Mode B
          // these three cards stack in a single full-width vertical column at ALL
          // widths (the Phase-1 owner decision: stacking avoids the 390px clip).
          // In Mode A this SAME stack becomes the RIGHT (narrow) column of the
          // split-wide grid, run-of-show on the LEFT. The container is a plain
          // `flex flex-col gap-3` (no `items-stretch`, no row, no per-card
          // `flex-1`, no equal-height invariant). Each card keeps `min-w-0` so a
          // long hotel/venue string wraps instead of overflowing 390px. The stack
          // only mounts when at least one card has data — a fully-empty stack
          // would reflow an empty band.
          const quickCardsStack =
            firstHotel || venue || primaryContact ? (
              <div data-testid="today-quick-cards" className="flex flex-col gap-3">
                {firstHotel ? (
                  <div data-testid="today-card-tonight" className="flex min-w-0 flex-col">
                    <div data-testid="today-tonight" data-card-id="today-tonight" className="flex flex-col">
                      <SectionCard
                        icon={<BedIcon />}
                        title="Tonight"
                        action={
                          // "Booked" status pill (mock `.pill.ok`) + the recessive
                          // source link, sharing the header action slot. DESIGN.md
                          // §1 color-blind floor: the status-positive hue (calm
                          // teal, NOT green) is ALWAYS paired with a text label;
                          // the dot + "Booked" word both carry the signal.
                          <span className="flex items-center gap-2">
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--color-status-positive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-status-positive)_14%,transparent)] px-2.5 py-1 text-xs font-semibold text-status-positive-text">
                              <span
                                aria-hidden="true"
                                className="size-1.5 rounded-pill bg-status-positive"
                              />
                              Booked
                            </span>
                            <SourceLink
                              driveFileId={data.driveFileId}
                              anchor={data.sourceAnchors[CARD_REGION_MAP["today-tonight"]]}
                            />
                          </span>
                        }
                      >
                        <KeyValueRows rows={tonightRows} />
                      </SectionCard>
                    </div>
                  </div>
                ) : null}

                {venue ? (
                  <div data-testid="today-card-where" className="flex min-w-0 flex-col">
                    <div data-testid="today-where" data-card-id="today-where" className="flex flex-col">
                      <SectionCard
                        icon={<MapPinIcon />}
                        title="Where"
                        action={
                          <SourceLink
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP["today-where"]]}
                          />
                        }
                      >
                        <KeyValueRows rows={whereRows} />
                      </SectionCard>
                    </div>
                  </div>
                ) : null}

                {primaryContact ? (
                  <div data-testid="today-card-need-something" className="flex min-w-0 flex-col">
                    <div data-testid="today-need-something" data-card-id="today-contact" className="flex flex-col">
                      <SectionCard
                        icon={<PhoneIcon />}
                        title="Need something"
                        action={
                          <SourceLink
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP["today-contact"]]}
                          />
                        }
                      >
                        <ul className="flex flex-col gap-3">
                          <PersonRow
                            person={{
                              ...(primaryContact.name != null ? { name: primaryContact.name } : {}),
                              fallbackLabel:
                                primaryContact.kind === "in_house_av"
                                  ? "In-house AV"
                                  : "Venue contact",
                              ...(primaryContact.phone != null
                                ? { phone: primaryContact.phone }
                                : {}),
                              ...(primaryContact.email != null
                                ? { email: primaryContact.email }
                                : {}),
                              primary: true,
                            }}
                          />
                        </ul>
                      </SectionCard>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null;

          // ── Day-context cards ────────────────────────────────────────────
          // In Mode A these are full-width siblings BELOW the run-of-show grid
          // (key times stays the bare strip ABOVE it — unchanged). In Mode B they
          // become the wide-LEFT column of the persistent split-wide grid. Each
          // is null when its source is empty so a column never holds an empty
          // card. `anchorsPresent` mirrors KeyTimesStrip's own all-absent → null
          // rule, so the "Key times" card never wraps an empty strip.
          const anchorsPresent =
            anchors.set != null || anchors.show != null || anchors.strike != null;
          const keyTimesCard = anchorsPresent ? (
            <div data-testid="today-key-times" data-card-id="today-key-times">
              <SectionCard
                icon={<ClockIcon />}
                title="Key times"
                action={
                  <SourceLink
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["today-key-times"]]}
                  />
                }
              >
                <KeyTimesStrip anchors={anchors} />
              </SectionCard>
            </div>
          ) : null;
          const dressCard = showDress ? (
            <div data-testid="today-dress" data-card-id="today-dress">
              <SectionCard
                title="Dress code"
                action={
                  <SourceLink
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["today-dress"]]}
                  />
                }
              >
                <p className="text-sm text-text">{dressRaw}</p>
              </SectionCard>
            </div>
          ) : null;
          const notesCard =
            visibleNotes.length > 0 ? (
              <div data-testid="today-notes" data-card-id="today-notes">
                <SectionCard icon={<NoteIcon />} title="Show notes">
                  <ul className="flex flex-col gap-2">
                    {visibleNotes.map((entry, idx) => {
                      const { display, truncated } = truncate(entry.text, TRUNCATE_AT);
                      return (
                        <li
                          key={`${entry.source}-${idx}`}
                          data-source={entry.source}
                          {...(truncated ? { "data-truncated": "true" } : {})}
                          className="rounded-sm border border-border bg-surface"
                        >
                          <details className="group">
                            <summary className="flex min-h-tap-min cursor-pointer list-none flex-col gap-1 rounded-sm px-3 py-2 [&::-webkit-details-marker]:hidden">
                              <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                {entry.label}
                              </span>
                              <span
                                className={[
                                  "text-sm leading-snug text-text",
                                  truncated ? "group-open:hidden" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {display}
                              </span>
                            </summary>
                            {truncated ? (
                              <div className="whitespace-pre-wrap border-t border-border p-3 text-sm/relaxed text-text">
                                {entry.text}
                              </div>
                            ) : null}
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                  {overflowCount > 0 ? (
                    <div
                      data-testid="today-notes-overflow"
                      className="mt-2 rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
                    >
                      <span className="tabular-nums">+{overflowCount}</span>{" "}
                      {overflowCount === 1 ? "more note" : "more notes"} on the source sheet
                    </div>
                  ) : null}
                </SectionCard>
              </div>
            ) : null;

          // §5 Today mode fork — data + privacy-driven, INSTANT (no animation).
          //
          //  • Mode A (run-of-show present): the bare KeyTimesStrip ABOVE, then
          //    the split-wide grid — run-of-show timeline LEFT (1.6fr) + the
          //    quick-cards stack RIGHT (1fr), equal-height (items-stretch) — then
          //    the day-context cards (dress + notes) full-width below. Unchanged
          //    from the ratified §5 fork apart from the card chrome (icon +
          //    "Full agenda" chip on the run-of-show card).
          //  • Mode B (NO run-of-show: wrapped / off-day / travel / countdown /
          //    date-restricted): the PERSISTENT split-wide grid — day-context
          //    cards (Key times + dress + notes) LEFT (1.6fr) + the quick-cards
          //    stack RIGHT (1fr), `items-start` (the two stacks differ in height).
          //    This REPLACES the prior full-width Mode B stack so non-show-day
          //    Today keeps the mock's two-column proportions on desktop instead of
          //    stretching the cards full-bleed.
          //
          // Both grids use the IDENTICAL `min-[720px]:grid-cols-[1.6fr_1fr]`
          // mechanism the layout-dimensions gate pins; below 720px both collapse
          // to a single column (the safe stack the full-width Mode B preserved).
          // When only ONE column has content the grid is skipped: a lone
          // quick-cards stack is capped (max-w-md) so it stays card-width.
          const hasLeft = Boolean(keyTimesCard || dressCard || notesCard);
          const hasRight = quickCardsStack !== null;

          return (
            <>
              <RightNowHero context={rightNowContext} />

              {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}
              {contactsFetchFailed ? <SectionTileError domain="contacts" /> : null}

              {modeA ? (
                <>
                  <KeyTimesStrip anchors={anchors} />
                  <div
                    data-testid="today-mode-a-grid"
                    className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-stretch"
                  >
                    <div data-testid="today-run-of-show" data-card-id="today-run-of-show" className="min-w-0">
                      <SectionCard
                        icon={<ClockIcon />}
                        title="Run of show"
                        action={
                          <span className="flex items-center gap-2">
                            <SectionChipLink section="schedule" icon={<CalendarIcon />}>
                              Full agenda
                            </SectionChipLink>
                            <SourceLink
                              driveFileId={data.driveFileId}
                              anchor={data.sourceAnchors[CARD_REGION_MAP["today-run-of-show"]]}
                            />
                          </span>
                        }
                      >
                        <RunOfShowList entries={data.runOfShow![todayIso]!} isoDate={todayIso} />
                      </SectionCard>
                    </div>
                    <div className="min-w-0">{quickCardsStack}</div>
                  </div>
                  {dressCard}
                  {notesCard}
                </>
              ) : hasLeft && hasRight ? (
                <div
                  data-testid="today-mode-b-grid"
                  className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-start"
                >
                  <div data-testid="today-day-context" className="flex min-w-0 flex-col gap-4">
                    {keyTimesCard}
                    {dressCard}
                    {notesCard}
                  </div>
                  <div className="min-w-0">{quickCardsStack}</div>
                </div>
              ) : hasRight ? (
                <div className="min-[720px]:max-w-md">{quickCardsStack}</div>
              ) : (
                <>
                  {keyTimesCard}
                  {dressCard}
                  {notesCard}
                </>
              )}
            </>
          );
        }}
      />
    </div>
  );
}
