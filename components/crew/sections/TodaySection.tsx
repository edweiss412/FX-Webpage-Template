/**
 * components/crew/sections/TodaySection.tsx — crew-redesign §9 "Today" section.
 *
 * The single synchronous Server Component for the Today sub-nav section. It
 * ports the full field set of the deleted today-band tiles into one curated
 * surface:
 *
 *   - (The live right-now card left this section: the pass replaced it and
 *     mounts under the day row, from the shell's server-built pass props,
 *     crew page redesign plan Task 9.)
 *   - KeyTimesStrip — Set / Show / Strike anchors via the shared
 *     `resolveKeyTimes(show, rooms)` resolver (§4.4).
 *   - Tonight card — the first hotel reservation (name + check-in / check-out).
 *   - Where card — the show venue (name + address + dock + notes-free meta).
 *   - Need-something card — the deterministic actionable primary contact via
 *     `selectPrimaryContact(contacts)` (omitted when no actionable contact).
 *   - Dress code line — the canonical dress-code event detail (the
 *     attire/dress/dress-code label family is collapsed to it at parse time;
 *     see lib/parser/blocks/event.ts CANONICAL_KEY_MAP, M4-D1), gated by
 *     `shouldHideGenericOptional` so a sentinel value reflows out. Rendered by
 *     DressCodeLines (one phase label per `Phase: attire` line).
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
import { ChevronRight } from "lucide-react";
import type { JSX } from "react";

import { SectionTileError } from "@/components/crew/SectionTileError";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { KeyValueRows } from "@/components/crew/primitives/KeyValueRows";
import { PersonRow } from "@/components/crew/primitives/PersonRow";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { ShowDayTimelineList } from "@/components/crew/primitives/ShowDayTimelineList";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DressCodeLines } from "@/components/crew/DressCodeLines";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
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
import { TODAY_TITLES, todayRows } from "@/components/crew/sections/todayRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { cn } from "@/lib/ui/cn";

// The 5-source notes caps (ported from NotesTile.tsx) now live with the notes
// aggregation in todayRows.ts, which the search builder shares; re-exported here.
export { SOURCE_CAP, TRUNCATE_AT } from "@/components/crew/sections/todayRows";

type TodaySectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function TodaySection({
  data,
  viewer,
  today,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: TodaySectionProps): JSX.Element {
  // Single canonical viewer resolution: flags / restriction / name / isAdmin.
  // admin → all-flags + none-restriction; crew/admin_preview → matched row;
  // malformed projection throws MalformedProjectionError (INTENTIONALLY outside
  // WrappedSection so the route-level infra arm catches it, not the per-block
  // fallback).
  const ctx = resolveViewerContext(viewer, data);

  return (
    <div data-testid="section-today" className="flex flex-col gap-4">
      <WrappedSection
        ledger={ledger}
        tileId="crew:today:notes"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // Mode, key times, every card's rows and the notes, with their search
          // targets: todayRows.ts, shared with the Today search builder. The
          // Mode A gate and the date/transport trust boundaries live there.
          const model = todayRows(data, ctx, today);
          const { modeA, anchors, anchorsPresent, keyTimeTargets } = model;

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
            model.tonightRows || model.whereRows || model.contact ? (
              <div data-testid="today-quick-cards" className="flex flex-col gap-3">
                {model.tonightRows ? (
                  <div data-testid="today-card-tonight" className="flex min-w-0 flex-col">
                    <div
                      data-testid="today-tonight"
                      data-card-id="today-tonight"
                      className="flex flex-col"
                    >
                      <SectionCard
                        icon={<BedIcon />}
                        title={TODAY_TITLES.tonight}
                        action={
                          // "Booked" status pill (mock `.pill.ok`) + the recessive
                          // source link, sharing the header action slot. DESIGN.md
                          // §1 color-blind floor: the status-positive hue (calm
                          // teal, NOT green) is ALWAYS paired with a text label;
                          // the dot + "Booked" word both carry the signal. The pill
                          // is card status, not sheet data: outside search coverage.
                          <div data-search-skip="" className="flex items-center gap-2">
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-[color-mix(in_srgb,var(--color-status-positive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-status-positive)_14%,transparent)] px-2.5 py-1 text-xs font-semibold text-status-positive-text">
                              <span
                                aria-hidden="true"
                                className="size-1.5 rounded-pill bg-status-positive"
                              />
                              Booked
                            </span>
                            <CardHeaderActions
                              cardId="today-tonight"
                              driveFileId={data.driveFileId}
                              anchor={data.sourceAnchors[CARD_REGION_MAP["today-tonight"]]}
                              showId={showId}
                              cardReport={cardReport}
                            />
                          </div>
                        }
                      >
                        <KeyValueRows rows={model.tonightRows} columns={2} />
                      </SectionCard>
                    </div>
                  </div>
                ) : null}

                {model.whereRows ? (
                  <div data-testid="today-card-where" className="flex min-w-0 flex-col">
                    <div
                      data-testid="today-where"
                      data-card-id="today-where"
                      className="flex flex-col"
                    >
                      <SectionCard
                        icon={<MapPinIcon />}
                        title={TODAY_TITLES.where}
                        action={
                          <CardHeaderActions
                            cardId="today-where"
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP["today-where"]]}
                            showId={showId}
                            cardReport={cardReport}
                          />
                        }
                      >
                        <KeyValueRows rows={model.whereRows} />
                      </SectionCard>
                    </div>
                  </div>
                ) : null}

                {model.contact ? (
                  <div data-testid="today-card-need-something" className="flex min-w-0 flex-col">
                    <div
                      data-testid="today-need-something"
                      data-card-id="today-contact"
                      className="flex flex-col"
                    >
                      <SectionCard
                        icon={<PhoneIcon />}
                        title={TODAY_TITLES.contact}
                        action={
                          <CardHeaderActions
                            cardId="today-contact"
                            driveFileId={data.driveFileId}
                            anchor={data.sourceAnchors[CARD_REGION_MAP["today-contact"]]}
                            showId={showId}
                            cardReport={cardReport}
                          />
                        }
                      >
                        <ul className="flex flex-col gap-3">
                          <PersonRow person={model.contact} />
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
          // `layout="row"` lays the anchors out as an equal-width horizontal
          // strip — correct ONLY inside a BOUNDED column (Mode B's 1.6fr
          // day-context column), where it fills the width. In a FULL-WIDTH
          // context (the final else) `row` would spread 2 anchors 50/50 across
          // the whole page with a mid-page divider, so there the DEFAULT (stack)
          // posture is used (audit idx70/#51). Parameterized so the SAME card
          // chrome serves both call sites.
          const makeKeyTimesCard = (layout?: "row") =>
            anchorsPresent ? (
              <div data-testid="today-key-times" data-card-id="today-key-times">
                <SectionCard
                  icon={<ClockIcon />}
                  title={TODAY_TITLES.keyTimes}
                  action={
                    <CardHeaderActions
                      cardId="today-key-times"
                      driveFileId={data.driveFileId}
                      anchor={data.sourceAnchors[CARD_REGION_MAP["today-key-times"]]}
                      showId={showId}
                      cardReport={cardReport}
                    />
                  }
                >
                  <KeyTimesStrip
                    anchors={anchors}
                    searchTargets={keyTimeTargets}
                    {...(layout ? { layout } : {})}
                  />
                </SectionCard>
              </div>
            ) : null;
          const dressCard = model.dress ? (
            <div data-testid="today-dress" data-card-id="today-dress">
              <SectionCard
                title={TODAY_TITLES.dress}
                action={
                  <CardHeaderActions
                    cardId="today-dress"
                    driveFileId={data.driveFileId}
                    anchor={data.sourceAnchors[CARD_REGION_MAP["today-dress"]]}
                    showId={showId}
                    cardReport={cardReport}
                  />
                }
              >
                <DressCodeLines value={model.dress.value} searchTargets={model.dress.targets} />
              </SectionCard>
            </div>
          ) : null;
          const notesCard =
            model.noteRows.length > 0 ? (
              <div data-testid="today-notes" data-card-id="today-notes">
                <SectionCard icon={<NoteIcon />} title={TODAY_TITLES.showNotes}>
                  <ul className="flex flex-col gap-2">
                    {model.noteRows.map((entry, idx) => {
                      const { display, truncated } = entry;
                      return (
                        <li
                          key={`${entry.source}-${idx}`}
                          data-source={entry.source}
                          // One search line: the label and the FULL text. A
                          // truncated note's cut preview below is skipped.
                          data-search-target={entry.target}
                          {...(truncated ? { "data-truncated": "true" } : {})}
                          className="rounded-sm border border-border bg-surface"
                        >
                          <details className="group">
                            {/* Chevron, not a bare row: this summary suppresses
                                the native marker and rendered no replacement, so
                                nothing said the truncated value expands (design
                                doc 2026-08-25-ui-polish-class-sweep-design.md,
                                D10 — the same shape as
                                BL-RUNOFSHOW-SUMMARY-NO-MARKER, swept with it).
                                It sits on the label row so it does not compete
                                with the value below. */}
                            <summary className="flex min-h-tap-min cursor-pointer list-none flex-col gap-1 rounded-sm px-3 py-2 [&::-webkit-details-marker]:hidden">
                              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                                {entry.label}
                                <ChevronRight
                                  aria-hidden="true"
                                  className="inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
                                />
                              </span>
                              <span
                                data-search-skip={truncated ? "" : undefined}
                                className={cn(
                                  "text-sm/snug text-text",
                                  truncated ? "group-open:hidden" : "",
                                )}
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
                  {model.notesOverflow > 0 ? (
                    <div
                      data-testid="today-notes-overflow"
                      data-search-skip=""
                      className="mt-2 rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
                    >
                      <span className="tabular-nums">+{model.notesOverflow}</span>{" "}
                      {model.notesOverflow === 1 ? "more note" : "more notes"} on the source sheet
                    </div>
                  ) : null}
                </SectionCard>
              </div>
            ) : null;

          // §5 Today mode fork — data + privacy-driven, INSTANT (no animation).
          //
          //  • Mode A (run-of-show present): the bare KeyTimesStrip ABOVE, then
          //    the split-wide grid — run-of-show timeline LEFT (1.6fr) + the
          //    quick-cards stack RIGHT (1fr), `items-start` (the short quick-cards
          //    stack takes its natural height rather than stretching to the tall
          //    run-of-show timeline; 2026-06-21 owner amendment) — then the
          //    day-context cards (dress + notes) full-width below.
          //  • Mode B (NO run-of-show: wrapped / off-day / travel / countdown /
          //    date-restricted): the PERSISTENT split-wide grid — day-context
          //    cards (Key times + dress + notes) LEFT (1.6fr) + the quick-cards
          //    stack RIGHT (1fr), `items-start` (the two stacks differ in height).
          //    This REPLACES the prior full-width Mode B stack so non-show-day
          //    Today keeps the mock's two-column proportions on desktop instead of
          //    stretching the cards full-bleed.
          //
          // Both grids use the IDENTICAL `@min-crew-split:grid-cols-[1.6fr_1fr]`
          // mechanism (the Today block's container, not the window); narrower, both collapse
          // to a single column (the safe stack the full-width Mode B preserved).
          // When only ONE column has content the grid is skipped: a lone
          // quick-cards stack is capped (max-w-md) so it stays card-width.
          const hasLeft = Boolean(anchorsPresent || dressCard || notesCard);
          const hasRight = quickCardsStack !== null;

          return (
            <>
              {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}
              {contactsFetchFailed ? <SectionTileError domain="contacts" /> : null}

              {modeA ? (
                <>
                  {/* Bare, full-page-width banner: keep the vertical stack. The
                      "row" posture is reserved for the CARDED Key times in the
                      bounded 1.6fr column; a full-width row strip would spread 2
                      anchors 50/50 across the page with a mid-page divider. */}
                  <KeyTimesStrip anchors={anchors} searchTargets={keyTimeTargets} />
                  <div
                    data-testid="today-mode-a-grid"
                    className={cn(
                      "grid grid-cols-1 gap-4 @min-crew-split:items-start",
                      // Only split into the 1.6/1 two-track grid when there IS a
                      // right side (quick-cards). With no quick cards, keep the
                      // run-of-show full-width single column so the split never
                      // strands a dead ~38% empty right track. Mirrors how Mode B
                      // keys its identical split on `hasRight` (audit idx68/#48).
                      quickCardsStack != null ? "@min-crew-split:grid-cols-[1.6fr_1fr]" : "",
                    )}
                  >
                    <div
                      data-testid="today-run-of-show"
                      data-card-id="today-run-of-show"
                      className="min-w-0"
                    >
                      <SectionCard
                        icon={<ClockIcon />}
                        title={TODAY_TITLES.runOfShow}
                        action={
                          // "Full agenda" is a link to another section, not sheet data.
                          <div data-search-skip="" className="flex items-center gap-2">
                            <SectionChipLink section="schedule" icon={<CalendarIcon />}>
                              Full agenda
                            </SectionChipLink>
                            <CardHeaderActions
                              cardId="today-run-of-show"
                              driveFileId={data.driveFileId}
                              anchor={data.sourceAnchors[CARD_REGION_MAP["today-run-of-show"]]}
                              showId={showId}
                              cardReport={cardReport}
                            />
                          </div>
                        }
                      >
                        {model.runOfShow?.kind === "timeline" ? (
                          <ShowDayTimelineList
                            items={model.runOfShow.items}
                            isoDate={model.todayIso}
                            searchTargets={model.runOfShow.targets}
                          />
                        ) : (
                          <RunOfShowList
                            entries={model.runOfShow?.entries ?? []}
                            isoDate={model.todayIso}
                            searchTargets={model.runOfShow?.targets ?? []}
                          />
                        )}
                      </SectionCard>
                    </div>
                    {quickCardsStack != null ? (
                      <div className="min-w-0">{quickCardsStack}</div>
                    ) : null}
                  </div>
                  {dressCard}
                  {notesCard}
                </>
              ) : hasLeft && hasRight ? (
                <div
                  data-testid="today-mode-b-grid"
                  className="grid grid-cols-1 gap-4 @min-crew-split:grid-cols-[1.6fr_1fr] @min-crew-split:items-start"
                >
                  <div data-testid="today-day-context" className="flex min-w-0 flex-col gap-4">
                    {makeKeyTimesCard("row")}
                    {dressCard}
                    {notesCard}
                  </div>
                  <div className="min-w-0">{quickCardsStack}</div>
                </div>
              ) : hasRight ? (
                <div className="@min-crew-split:max-w-md">{quickCardsStack}</div>
              ) : (
                <>
                  {/* Full-width: the carded Key times uses the DEFAULT (stack)
                      KeyTimesStrip posture — a `row` strip here would spread the
                      2 anchors 50/50 across the whole page (audit idx70/#51). */}
                  {makeKeyTimesCard()}
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
