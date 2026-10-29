/**
 * components/crew/sections/venueRows.ts — the Venue section's row derivations
 * (Where, Facilities, Venue status), shared by `VenueSection` and the search
 * index builder (lib/search/sections/venue.ts), so the page and the index read
 * the same rows (spec §2.4).
 *
 * Every rendered row carries its search target id (lib/search/entryId.ts),
 * computed once here, over the exact display strings, in render order.
 *
 * Non-client module: the builder runs on the server and imports it. The
 * Facilities icons are created with `createElement` because this is a `.ts`
 * module, not because they differ from the JSX the section used to inline.
 */
import { createElement } from "react";

import { CarIcon, DockIcon, WifiIcon } from "@/components/crew/icons/sectionIcons";
import type { FactRow } from "@/components/crew/primitives/FactRows";
import type { KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { compareRooms } from "@/lib/crew/resolveKeyTimes";
import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { entryId } from "@/lib/search/entryId";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { streetFromAddress, venueDisplay } from "@/lib/venue/venueLocation";

/** Card titles (the search `group`) and `data-card-id`s (the search region). */
export const WHERE_TITLE = "Where";
export const WHERE_CARD_ID = "venue-where";
export const FACILITIES_TITLE = "Facilities";
export const FACILITIES_CARD_ID = "venue-facilities";
export const STATUS_TITLE = "Venue status";
export const STATUS_CARD_ID = "venue-status";

/** The Facilities rows the copy controls key on (spec §3 `copy`). */
export const WIFI_SSID_TEST_ID = "venue-wifi-ssid";
export const WIFI_PASSWORD_TEST_ID = "venue-wifi-password";

/**
 * The name the parser synthesizes when a v1 / metadata-trimmed sheet heads its
 * general-session block with nothing nameable (`lib/parser/blocks/rooms.ts` —
 * "fall back to 'General Session' rather than mis-naming the GS room"). Five of
 * the ten raw fixtures parse to exactly this. A row reading "Room: General
 * Session" restates the block heading and tells a crew member nothing, so it is
 * suppressed. Held locally rather than imported because the parser is out of
 * scope for this change; the suppression test is fixture-derived (it runs the
 * real parser) so a renamed fallback fails loudly instead of passing vacuously.
 */
const SYNTHESIZED_GS_ROOM_NAME = "General Session";

type Venue = ShowForViewer["show"]["venue"];

/** Ids for the rows a primitive will render; a sentinel/empty row carries none. */
function withTargets<R extends { k: string; v: string; searchTarget?: string }>(
  rows: R[],
  region: string,
  group: string,
): R[] {
  const seen = new Map<string, number>();
  return rows.map((row) =>
    shouldHideGenericOptional(row.v)
      ? row
      : { ...row, searchTarget: entryId("venue", region, group, row.k, row.v, seen) },
  );
}

/**
 * Where: discrete Venue / City / Address rows. venueDisplay resolves the city
 * (geocoded → structured-address → trailing-known city in the NAME) and returns
 * the venue name with a redundant trailing city stripped, so a blank-address
 * FXAV venue ("Four Seasons Hotel Chicago") still shows a clean "Chicago" City
 * row WITHOUT printing the city twice. streetFromAddress drops the city tail
 * from the Address value; an empty street value reflows the Address row out
 * (KeyValueRows sentinel-hides empty values).
 */
export function venueWhereRows(venue: Venue): KeyValueRow[] {
  const { name: venueDisplayName, city: venueCity } = venueDisplay(venue);
  const rows: KeyValueRow[] = venue
    ? [
        { k: "Venue", v: venueDisplayName ?? venue.name ?? "" },
        ...(venueCity ? [{ k: "City", v: venueCity } as KeyValueRow] : []),
        { k: "Address", v: streetFromAddress(venue.address, venueCity) ?? "" },
      ]
    : [];
  return withTargets(rows, WHERE_CARD_ID, WHERE_TITLE);
}

/** The Parking row's gate: the viewer's transport tile is visible (§9 test 17). */
export function venueTransportVisible(data: ShowForViewer, isAdmin: boolean): boolean {
  return transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin,
  });
}

/**
 * Facilities: the mock `.kvrow` fact list, in its fixed push order — Loading
 * dock, Parking, Room, the connectivity rows derived from
 * `event_details.internet`, Power. Every value routes through
 * `shouldHideGenericOptional` at the read site.
 */
export function venueFactRows(
  data: ShowForViewer,
  { transportVisible }: { transportVisible: boolean },
): FactRow[] {
  const venue = data.show.venue;

  // --- Parking: transportTileVisible-gated -----------------------------------
  const rawParking = data.transportation?.parking ?? null;
  const parking =
    transportVisible && !shouldHideGenericOptional(rawParking) ? rawParking!.trim() : null;

  // --- Connectivity: Wi-Fi (internet) + power --------------------------------
  const rawInternet = data.show.event_details["internet"] ?? null;
  const internet = shouldHideGenericOptional(rawInternet) ? null : rawInternet!.trim();
  // Display-time split into SSID / password / notes. `null` means the value is
  // outside the observed label vocabulary, and the raw row below renders it
  // verbatim — the value is never silently reshaped.
  //
  // The DERIVED ssid is re-checked against the sentinel predicate (diff review
  // R2 F2). `SSID: TBD` is not a sentinel as a whole cell, so it reaches the
  // split branch, but its ssid IS one — and FactRows drops sentinel rows, so the
  // component committed to the split branch and then rendered nothing at all,
  // losing the cell entirely. Rejecting the split here returns it to the raw row,
  // which renders "SSID: TBD" verbatim.
  const splitWifi = internet !== null ? parseWifiValue(internet) : null;
  // EVERY derived field is re-checked, not just the ssid. FactRows drops a
  // sentinel row, so a sentinel `password` or `notes` used to be suppressed
  // AFTER the component had committed to the split — the raw row was gone too,
  // and that text left the page entirely. One sentinel anywhere returns the
  // whole cell to the raw row, where it renders verbatim.
  const splitHasSentinel =
    splitWifi !== null &&
    [splitWifi.ssid, splitWifi.password, splitWifi.notes].some(
      (value) => value !== null && shouldHideGenericOptional(value),
    );
  const wifi = splitWifi !== null && !splitHasSentinel ? splitWifi : null;
  const rawPower = data.show.event_details["power"] ?? null;
  const power = shouldHideGenericOptional(rawPower) ? null : rawPower!.trim();

  // --- Room: the general-session room's name ---------------------------------
  // Already parsed (ROOMS header line 2, section prefix stripped) — surfaced
  // here, never re-derived. Suppressed on a rooms fetch failure: `readRooms`
  // fail-softs to `[]` with `tileErrors.rooms`, so the array alone cannot tell
  // "no rooms" from "we could not read them", and the failure is already
  // surfaced by the rooms-consuming tiles' SectionTileError. Suppressed for the
  // parser's synthesized fallback name too: a v1 sheet that never named its room
  // gets the literal "General Session" from the parser, and echoing that back is
  // noise, not information.
  const roomsFetchFailed = Boolean(data.tileErrors["rooms"]);
  const gsRoom = roomsFetchFailed
    ? null
    : (data.rooms.filter((room) => room.kind === "gs").sort(compareRooms)[0] ?? null);
  // Sentinel-gated at the READ SITE like every other value in this module: a
  // room literally named "TBD" would otherwise be pushed as a row, counted by
  // `hasFacts`, and then dropped by FactRows — rendering an empty Facilities
  // card when Room is the only fact (diff review R2 F2).
  const gsRoomName = shouldHideGenericOptional(gsRoom?.name ?? null) ? "" : gsRoom!.name.trim();
  const roomName =
    gsRoomName.length > 0 && gsRoomName.toLowerCase() !== SYNTHESIZED_GS_ROOM_NAME.toLowerCase()
      ? gsRoomName
      : null;

  // --- Loading dock — §8.3 generic-optional; sentinels reflow out ------------
  // Read at THIS site through `shouldHideGenericOptional` so the sentinel-hiding
  // meta-test (which walks venue.loadingDock, .ts included) stays green;
  // FactRows then also sentinel-gates the row, but the read-site guard is the
  // contract surface.
  const loadingDock = shouldHideGenericOptional(venue?.loadingDock ?? null)
    ? null
    : venue!.loadingDock!.trim();

  // The mock `.kvrow` fact list: each row gets a 28px sunken mini-icon. Dock →
  // DockIcon, Parking → CarIcon, the first connectivity row → WifiIcon (whether
  // that is the split "Wi-Fi network" row or the raw "Crew Wi-Fi" fallback).
  // FactRows omits any row
  // whose `v` is empty/sentinel, so we still gate each value above and only
  // push rows we want; empty strings here would also reflow out inside FactRows.
  const factRows: FactRow[] = [];
  if (loadingDock) {
    factRows.push({
      k: "Loading dock",
      v: loadingDock,
      icon: createElement(DockIcon),
    });
  }
  if (parking) {
    factRows.push({ k: "Parking", v: parking, icon: createElement(CarIcon) });
  }
  if (roomName) {
    factRows.push({ k: "Room", v: roomName, testId: "venue-room" });
  }
  if (internet && wifi) {
    // Split: labeled network + password rows, with any surrounding prose kept as
    // the value of an "Internet notes" row. The prose is operationally
    // load-bearing (hardline vs Wi-Fi for streaming) and is never dropped.
    factRows.push({
      k: "Wi-Fi network",
      v: wifi.ssid,
      icon: createElement(WifiIcon),
      testId: WIFI_SSID_TEST_ID,
    });
    if (wifi.password) {
      // The one row on a crew page that gets transcribed character by character
      // into a phone's Wi-Fi dialog, often in a dim ballroom mid-task. `code`
      // buys the slashed zero and tabular figures; the copy control is the only
      // complete answer for the ambiguities no font feature fixes (`rn`/`m`,
      // and a trailing period that IS part of the password). The SSID row above
      // deliberately takes neither: it is picked from a visible network list.
      factRows.push({
        k: "Wi-Fi password",
        v: wifi.password,
        testId: WIFI_PASSWORD_TEST_ID,
        code: true,
        copyLabel: "Copy the Wi-Fi password",
      });
    }
    if (wifi.notes) {
      // Labeled "Internet notes", NOT "Crew Wi-Fi" (impeccable critique P1): four
      // of the five corpus values that produce notes describe a HARDLINE, so
      // "Crew Wi-Fi: Hardline from Encore" tells a crew member the opposite of
      // what the sheet says. The raw-fallback row keeps "Crew Wi-Fi" because
      // there the value IS the whole internet cell.
      factRows.push({ k: "Internet notes", v: wifi.notes, testId: "venue-wifi-notes" });
    }
  } else if (internet) {
    // Fail-soft: byte-identical to the pre-split row (no testId — adding one
    // would change the markup this branch exists to preserve).
    factRows.push({ k: "Crew Wi-Fi", v: internet, icon: createElement(WifiIcon) });
  }
  if (power) {
    factRows.push({ k: "Power", v: power });
  }
  return withTargets(factRows, FACILITIES_CARD_ID, FACILITIES_TITLE);
}

/** One Venue status block: its eyebrow label, its value, and its search target. */
export type VenueStatusLine = { label: string; value: string; searchTarget: string };

/**
 * Venue status: COI and Venue notes, each sentinel-guarded and omitted
 * entirely when hidden (the AC-4.1 `coi-status` span is never rendered empty).
 */
export function venueStatusLines(data: ShowForViewer): {
  coi: VenueStatusLine | null;
  notes: VenueStatusLine | null;
} {
  const rawCoi = data.show.coi_status ?? null;
  const coi = shouldHideGenericOptional(rawCoi) ? null : rawCoi!.trim();
  const rawNotes = data.show.venue?.notes ?? null;
  const notes = shouldHideGenericOptional(rawNotes) ? null : rawNotes!.trim();

  const seen = new Map<string, number>();
  const line = (label: string, value: string | null): VenueStatusLine | null =>
    value === null
      ? null
      : {
          label,
          value,
          searchTarget: entryId("venue", STATUS_CARD_ID, STATUS_TITLE, label, value, seen),
        };
  return { coi: line("COI", coi), notes: line("Venue notes", notes) };
}
