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
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { buildRightNowContext } from "@/components/right-now/buildRightNowContext";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
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

export function TodaySection({ data, viewer, showId }: TodaySectionProps): JSX.Element {
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

          return (
            <>
              <RightNowHero context={rightNowContext} />

              {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}

              <KeyTimesStrip anchors={anchors} />

              {firstHotel ? (
                <div data-testid="today-tonight">
                  <SectionCard title="Tonight">
                    <KeyValueRows rows={tonightRows} />
                  </SectionCard>
                </div>
              ) : null}

              {venue ? (
                <div data-testid="today-where">
                  <SectionCard title="Where">
                    <KeyValueRows rows={whereRows} />
                  </SectionCard>
                </div>
              ) : null}

              {primaryContact ? (
                <div data-testid="today-need-something">
                  <SectionCard title="Need something">
                    <ul className="flex flex-col gap-3">
                      <PersonRow
                        person={{
                          ...(primaryContact.name != null ? { name: primaryContact.name } : {}),
                          fallbackLabel:
                            primaryContact.kind === "in_house_av" ? "In-house AV" : "Venue contact",
                          ...(primaryContact.phone != null ? { phone: primaryContact.phone } : {}),
                          ...(primaryContact.email != null ? { email: primaryContact.email } : {}),
                          primary: true,
                        }}
                      />
                    </ul>
                  </SectionCard>
                </div>
              ) : null}

              {showDress ? (
                <div data-testid="today-dress">
                  <SectionCard title="Dress code">
                    <p className="text-sm text-text">{dressRaw}</p>
                  </SectionCard>
                </div>
              ) : null}

              {visibleNotes.length > 0 ? (
                <div data-testid="today-notes">
                  <SectionCard title="Show notes">
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
                                <span className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
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
                                <div className="whitespace-pre-wrap border-t border-border px-3 py-3 text-sm leading-relaxed text-text">
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
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}
