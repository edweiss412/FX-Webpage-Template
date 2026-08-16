// @vitest-environment jsdom
/**
 * tests/components/crew/sections/VenueSection.wifiRoom.test.tsx — AC-3 / AC-4.
 *
 * Two display-time enrichments to the Venue Facilities card:
 *
 *   - the `event_details.internet` cell splits into "Wi-Fi network" /
 *     "Wi-Fi password" / "Internet notes" rows when it carries the
 *     observed label vocabulary, and renders BYTE-IDENTICALLY to the pre-split
 *     component when it does not (the fail-soft regression pin);
 *   - the general-session room's already-parsed name surfaces as a "Room" row,
 *     suppressed for a synthesized name, an empty name, zero rooms, and a rooms
 *     fetch failure.
 *
 * Plus the §3.5 transition audit for the rows this change adds.
 *
 * Values are the §4 corpus, and the synthesized-name case runs the REAL parser
 * over a raw fixture rather than hand-authoring `{ kind, name }`: a hand-authored
 * literal would keep passing if the parser's fallback name were ever changed,
 * which is the exact regression the suppression exists to track.
 */
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { VenueSection } from "@/components/crew/sections/VenueSection";
import { parseSheet } from "@/lib/parser";
import { parseWifiValue } from "@/lib/crew/wifiDisplay";
import { compareRooms, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import {
  makeRawWifiShow,
  RAW_WIFI_SHOW_ID,
  RAW_WIFI_TODAY,
  RAW_WIFI_VALUE,
} from "@/tests/fixtures/venueRawWifiShow";
import { ledgerProp } from "./_ledgerProp";

afterEach(cleanup);

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

/** A raw fixture whose GS block has no nameable room, so the parser synthesizes. */
const SYNTHESIZED_FIXTURE = "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md";
/** A raw fixture whose GS block names a real room. */
const REAL_NAME_FIXTURE = "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md";
/** A raw fixture carrying breakout rooms alongside its GS room. */
const BREAKOUT_FIXTURE = "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md";

function roomsFromFixture(file: string): ProjectedRoomRow[] {
  const { rooms } = parseSheet(readFileSync(file, "utf8"), file);
  return rooms.map((room, i) => ({ ...room, id: `r${i}` }));
}

function renderVenue(data: ReturnType<typeof makeShowForViewer>): HTMLElement {
  const { container } = render(
    <VenueSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return container;
}

function withInternet(internet: string): ReturnType<typeof makeShowForViewer> {
  return makeShowForViewer({
    show: { venue: { name: "Test Venue", address: "1 Main St" }, event_details: { internet } },
  });
}

/** The live Fixed Income cell — the corpus value that produces all three rows. */
const SPLIT_INTERNET = "Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025";

/** A show whose only Facilities fact is power, so the Wi-Fi rows are absent. */
function withPower(power: string): ReturnType<typeof makeShowForViewer> {
  return makeShowForViewer({
    show: { venue: { name: "Test Venue", address: "1 Main St" }, event_details: { power } },
  });
}

function withRooms(rooms: ProjectedRoomRow[], tileErrors?: Record<string, string>) {
  return makeShowForViewer({
    show: { venue: { name: "Test Venue", address: "1 Main St" } },
    rooms,
    ...(tileErrors ? { tileErrors } : {}),
  });
}

/** Only the general-session rooms — the ones the Venue row is allowed to name. */
const gsNamesOf = (rooms: ProjectedRoomRow[]): string[] =>
  rooms.filter((r) => r.kind === "gs").map((r) => r.name);

/**
 * A fact row's LABEL and VALUE read separately and compared exactly. Reading the
 * row's whole textContent with `toContain` would pass on a value that merely
 * embeds the expected string — a truncated SSID, a value with the next label
 * appended, or the value leaking into the label slot all survive containment.
 */
const labelOf = (row: Element | null): string | undefined =>
  row?.querySelector("dt")?.textContent ?? undefined;

/**
 * The raw-fallback row, located by its LABEL because it deliberately carries no
 * testid — adding one would change the markup the byte-identical pin protects.
 */
const rawWifiRow = (container: HTMLElement): Element | null =>
  [...container.querySelectorAll('[data-testid="fact-rows"] > div')].find(
    (row) => row.querySelector("dt")?.textContent === "Crew Wi-Fi",
  ) ?? null;
const valueOf = (row: Element | null): string | undefined =>
  row?.querySelector("dd")?.textContent ?? undefined;

// ---------------------------------------------------------------------------
// Wi-Fi split (AC-3)
// ---------------------------------------------------------------------------

describe("Wi-Fi split rows", () => {
  test("a labeled value renders network / password / notes rows", () => {
    // The live Fixed Income cell, verbatim.
    const container = renderVenue(
      withInternet("Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025"),
    );

    const ssid = container.querySelector('[data-testid="venue-wifi-ssid"]');
    const password = container.querySelector('[data-testid="venue-wifi-password"]');
    const notes = container.querySelector('[data-testid="venue-wifi-notes"]');

    expect(labelOf(ssid)).toBe("Wi-Fi network");
    expect(valueOf(ssid)).toBe("Hyatt_Meeting");
    expect(labelOf(password)).toBe("Wi-Fi password");
    expect(valueOf(password)).toBe("FITS2025");
    // "Internet notes", not "Crew Wi-Fi": the prose here describes a HARDLINE in
    // four of the five corpus values that produce notes, so the Wi-Fi label
    // would contradict the value (impeccable critique P1).
    expect(labelOf(notes)).toBe("Internet notes");
    expect(valueOf(notes)).toBe("Hardline from Encore");
    expect(container.textContent).not.toContain("Crew Wi-Fi");

    // Nothing anywhere in the card still shows the unsplit cell.
    expect(container.textContent).not.toContain("SSID: Hyatt_Meeting");
    expect(container.textContent).not.toContain("Code: FITS2025");
  });

  test("the password row is absent when the value carries no password label", () => {
    const container = renderVenue(withInternet("SSID: Hyatt_Meeting"));
    expect(valueOf(container.querySelector('[data-testid="venue-wifi-ssid"]'))).toBe(
      "Hyatt_Meeting",
    );
    expect(container.querySelector('[data-testid="venue-wifi-password"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-wifi-notes"]')).toBeNull();
  });

  test("the notes row is absent when the value carries no prose", () => {
    // The RIA exporter cell, verbatim — labeled pairs only.
    const container = renderVenue(withInternet("SSID - Hyatt_Meeting Password: PHC2025"));
    expect(valueOf(container.querySelector('[data-testid="venue-wifi-ssid"]'))).toBe(
      "Hyatt_Meeting",
    );
    expect(valueOf(container.querySelector('[data-testid="venue-wifi-password"]'))).toBe("PHC2025");
    expect(container.querySelector('[data-testid="venue-wifi-notes"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Transcription affordance at the real call site
  // (docs/superpowers/specs/2026-08-10-wifi-password-legibility.md AC-1/AC-2)
  // -------------------------------------------------------------------------

  test("the password row carries code-value and a copy control; the SSID row carries neither", () => {
    const container = renderVenue(withInternet(SPLIT_INTERNET));
    const password = container.querySelector('[data-testid="venue-wifi-password"]')!;
    const ssid = container.querySelector('[data-testid="venue-wifi-ssid"]')!;

    // Scoped to each row's own value span, not the card: the whole point is
    // that the flag is per-row.
    const valueSpanOf = (row: Element) =>
      row.querySelector("dd")!.querySelector("span:not([role='log'])")!;

    expect(valueSpanOf(password).getAttribute("class")).toContain("code-value");
    expect(password.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Copy the Wi-Fi password",
    );

    // An SSID is picked from the phone's visible network list, never typed
    // character by character, so the transcription rationale stops at this row
    // (spec §1.1).
    expect(valueSpanOf(ssid).getAttribute("class")).not.toContain("code-value");
    expect(ssid.querySelector("button")).toBeNull();
  });

  test("a sentinel password takes the fail-soft raw path, keeping every character (spec §7)", () => {
    // `N/A` is rejected by the pre-FactRows sentinel check, which returns the
    // WHOLE cell to the raw fallback rather than committing to a split and then
    // dropping the row — so no password row, and no lost text.
    const cell = "SSID: Hyatt_Meeting Password: N/A";
    const container = renderVenue(withInternet(cell));

    expect(container.querySelector('[data-testid="venue-wifi-password"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-wifi-ssid"]')).toBeNull();
    expect(valueOf(rawWifiRow(container))).toBe(cell);
    // No copy control anywhere: the raw row never opted in.
    expect(container.querySelector('[data-testid="venue-wifi-copy-log"]')).toBeNull();
  });

  test("an unsplittable value renders the pre-split markup byte for byte", () => {
    // Captured from the component BEFORE the split landed, with this exact
    // fixture. Equality here is the whole fail-soft contract: the raw row keeps
    // its label, its icon, its position and its markup.
    const expected = readFileSync("tests/fixtures/venueSectionRawWifi.html", "utf8");
    premise("the captured baseline is a real render", expected.length, 1000);
    premiseHolds(
      "the baseline carries the raw internet value, so the comparison can see a change to it",
      expected.includes(RAW_WIFI_VALUE),
    );

    const { container } = render(
      <VenueSection
        {...ledgerProp()}
        data={makeRawWifiShow()}
        viewer={{ kind: "admin" }}
        today={RAW_WIFI_TODAY}
        showId={RAW_WIFI_SHOW_ID}
      />,
    );
    expect(container.innerHTML).toBe(expected);
  });

  /**
   * Diff review R2 F2. The outer cell is not a sentinel, so it reaches the split
   * branch; the DERIVED ssid is one, and FactRows drops sentinel rows — so the
   * component used to commit to the split and then render nothing, losing the
   * cell. The contract is unchanged: split correctly OR render raw, never vanish.
   */
  test("a derived sentinel ssid falls back to the raw row instead of vanishing", () => {
    // `-` is deliberately NOT here: it is a separator, so the leftover-separator
    // rule rejects that cell before the derived-sentinel gate is ever consulted,
    // and including it proved a different mechanism than the one this case names
    // (review S5 R4). Every sentinel below reaches the gate as a parsed ssid.
    const SENTINELS = ["TBD", "N/A", "TBA", "—"];
    premise("sentinel ssid cases", SENTINELS.length, 0);
    for (const sentinel of SENTINELS) {
      const raw = `SSID: ${sentinel}`;
      premiseHolds(
        `${sentinel}: the splitter DOES parse it, so the derived gate is what rejects it`,
        parseWifiValue(raw)?.ssid === sentinel,
      );
      const container = renderVenue(withInternet(raw));
      // No split row claimed it...
      expect(container.querySelector('[data-testid="venue-wifi-ssid"]'), raw).toBeNull();
      // ...and the cell is still on the page, verbatim, under the raw label.
      expect(container.textContent, raw).toContain(raw);
      expect(container.textContent, raw).toContain("Crew Wi-Fi");
      cleanup();
    }
  });

  /**
   * Review R5. The R2 repair guarded the ssid only, so a sentinel `password` or
   * `notes` was suppressed by FactRows AFTER the component had committed to the
   * split — with the raw row gone, that text left the page entirely. Swept
   * across every sentinel AND every derived field, because the earlier fix
   * covered one field and the other two escaped for three rounds.
   */
  test("a sentinel in ANY derived field falls back to the raw row, losing nothing", () => {
    const SENTINELS = ["TBD", "N/A", "TBA", "—"];
    const shapes: ReadonlyArray<[string, (s: string) => string]> = [
      ["ssid", (sentinel) => `SSID: ${sentinel}`],
      ["password", (sentinel) => `SSID: Guest Password: ${sentinel}`],
      ["notes", (sentinel) => `${sentinel}\nSSID: Guest`],
    ];
    premise("sentinels swept", SENTINELS.length, 0);
    premise("derived fields swept", shapes.length, 2);

    for (const [field, build] of shapes) {
      for (const sentinel of SENTINELS) {
        const raw = build(sentinel);
        const container = renderVenue(withInternet(raw));
        const label = `${field}/${sentinel}`;
        // No split row claimed it...
        expect(container.querySelector('[data-testid="venue-wifi-ssid"]'), label).toBeNull();
        // ...and the raw row carries the cell EXACTLY. Asserting each line is
        // present somewhere would pass on flattened, reversed, or duplicated
        // output — probed, all three — which is presence, not the byte-identical
        // fallback the consequence bound requires (review S4 R1).
        expect(valueOf(rawWifiRow(container)), label).toBe(raw.trim());
        cleanup();
      }
    }
  });

  test("an empty internet value renders no Wi-Fi row at all", () => {
    const container = renderVenue(withInternet(""));
    expect(container.querySelector('[data-testid="venue-wifi-ssid"]')).toBeNull();
    expect(container.textContent).not.toContain("Crew Wi-Fi");
    expect(container.textContent).not.toContain("Wi-Fi network");
  });
});

// ---------------------------------------------------------------------------
// Room row (AC-4)
// ---------------------------------------------------------------------------

describe("Room row", () => {
  test("a real general-session room name renders", () => {
    const rooms = roomsFromFixture(REAL_NAME_FIXTURE);
    const gsNames = gsNamesOf(rooms);
    premise("the fixture parses a general-session room", gsNames.length, 0);
    premiseHolds(
      "the fixture's GS name is a real one, not the parser's synthesized fallback",
      gsNames[0]!.toLowerCase() !== "general session",
    );

    const container = renderVenue(withRooms(rooms));
    const row = container.querySelector('[data-testid="venue-room"]');
    expect(labelOf(row)).toBe("Room");
    // Expected value comes from the parsed fixture, never a hardcoded string.
    expect(valueOf(row)).toBe(gsNames[0]!);
  });

  test("a parser-synthesized general-session name is suppressed", () => {
    const rooms = roomsFromFixture(SYNTHESIZED_FIXTURE);
    const gsNames = gsNamesOf(rooms);
    premise("the fixture parses a general-session room", gsNames.length, 0);
    premiseHolds(
      "the fixture's GS name IS the parser's synthesized fallback — otherwise this " +
        "case tests suppression against a name that was never synthesized",
      gsNames[0]!.toLowerCase() === "general session",
    );

    const container = renderVenue(withRooms(rooms));
    expect(container.querySelector('[data-testid="venue-room"]')).toBeNull();
  });

  test("a sentinel room name renders no row and no empty Facilities card", () => {
    // The row would otherwise be pushed, counted by hasFacts, then dropped by
    // FactRows — leaving the card chrome with nothing in it (review R2 F2).
    const SENTINELS = ["TBD", "N/A", "TBA"];
    premise("sentinel room-name cases", SENTINELS.length, 0);
    for (const sentinel of SENTINELS) {
      const rooms = roomsFromFixture(REAL_NAME_FIXTURE).map((room) =>
        room.kind === "gs" ? { ...room, name: sentinel } : room,
      );
      // Premise on THIS case's own inputs: the transform must actually have left
      // a GS room carrying the sentinel. A mis-typed `kind` would suppress the
      // row for an unrelated reason and the assertion would still pass.
      const gs = rooms.filter((room) => room.kind === "gs");
      premise(`${sentinel}: the transformed rooms still carry a GS room`, gs.length, 0);
      premiseHolds(`${sentinel}: that room carries the sentinel name`, gs[0]!.name === sentinel);

      const container = renderVenue(withRooms(rooms));
      expect(container.querySelector('[data-testid="venue-room"]'), sentinel).toBeNull();
      // No Facilities card at all — not a card containing zero rows.
      expect(container.querySelector('[data-testid="venue-facilities"]'), sentinel).toBeNull();
      cleanup();
    }
  });

  test("zero rooms renders no row", () => {
    expect(renderVenue(withRooms([])).querySelector('[data-testid="venue-room"]')).toBeNull();
  });

  test("an empty general-session name renders no row", () => {
    const rooms = roomsFromFixture(REAL_NAME_FIXTURE).map((room) =>
      room.kind === "gs" ? { ...room, name: "   " } : room,
    );
    // Premise on THIS case's own inputs: the transform must still leave a GS
    // room, and that room's name must actually be blank. Without it a mis-typed
    // `kind` or a fixture with no GS room would suppress the row for the wrong
    // reason and the test would still pass (review R1 F3).
    const gs = rooms.filter((room) => room.kind === "gs");
    premise("the transformed rooms still carry a general-session room", gs.length, 0);
    premiseHolds("that room's name is blank", gs[0]!.name.trim().length === 0);

    expect(renderVenue(withRooms(rooms)).querySelector('[data-testid="venue-room"]')).toBeNull();
  });

  test("a rooms fetch failure suppresses the row rather than implying no room", () => {
    const rooms = roomsFromFixture(REAL_NAME_FIXTURE);
    premiseHolds(
      "the same rooms DO render a row when the fetch succeeded, so this case " +
        "isolates the failure and not an unnameable room",
      renderVenue(withRooms(rooms)).querySelector('[data-testid="venue-room"]') !== null,
    );
    cleanup();

    const container = renderVenue(withRooms(rooms, { rooms: "read failed" }));
    expect(container.querySelector('[data-testid="venue-room"]')).toBeNull();
  });

  test("a breakout-only show renders no row", () => {
    const rooms = roomsFromFixture(BREAKOUT_FIXTURE).filter((room) => room.kind !== "gs");
    premise("the fixture leaves at least one non-GS room", rooms.length, 0);
    premiseHolds(
      "those rooms carry real names, so a suppressed row is about kind and not an empty name",
      rooms.every((room) => room.name.trim().length > 0),
    );
    expect(renderVenue(withRooms(rooms)).querySelector('[data-testid="venue-room"]')).toBeNull();
  });

  test("multiple general-session rooms surface the first by compareRooms", () => {
    // compareRooms orders same-kind rooms by lowercased name, then id — so the
    // expected winner is derived by sorting, never by picking a literal.
    // Name order and ID order are deliberately OPPOSED: the alphabetically first
    // room carries the LAST id. Correlated fixtures let a comparator that sorts
    // by id pick the same winner as one that sorts by name, so the case would
    // pass against the wrong mechanism (review F2).
    const gsTemplate = roomsFromFixture(REAL_NAME_FIXTURE).find((r) => r.kind === "gs")!;
    // INPUT order, NAME order and ID order are all made to disagree. The winner
    // is listed LAST, so a component that never sorts at all still passes a test
    // whose winner happens to be first — which is what the previous fixture did;
    // and the ids are opposed to the names, so a comparator sorting by id picks
    // the other room.
    const rooms: ProjectedRoomRow[] = [
      { ...gsTemplate, id: "r1", name: "ZULU HALL" },
      { ...gsTemplate, id: "r9", name: "ALPHA HALL" },
    ];
    // Expected comes from the REAL comparator, not a re-implementation of it. A
    // hand-rolled `name.localeCompare` agreed with `compareRooms` on this
    // fixture, so the test proved "something sorted by name" rather than "the
    // specified comparator ran" (review R7).
    const byName = [...rooms].sort(compareRooms)[0]!;
    const byId = [...rooms].sort((a, b) => a.id.localeCompare(b.id))[0]!;
    const expectedName = byName.name;
    premiseHolds(
      "the two GS names differ, so 'first by compareRooms' is a decidable claim",
      rooms[0]!.name !== rooms[1]!.name,
    );
    premiseHolds(
      "name order and id order DISAGREE, so this case can tell the two apart",
      byName.name !== byId.name,
    );
    premiseHolds(
      "the comparator winner is NOT the input's first room, so an unsorted " +
        "component cannot pass by accident",
      rooms[0]!.name !== byName.name,
    );

    const row = renderVenue(withRooms(rooms)).querySelector('[data-testid="venue-room"]');
    expect(valueOf(row)).toBe(expectedName);
  });

  test("the winner is compareRooms' winner, not merely a name sort", () => {
    // compareRooms compares NORMALIZED names and breaks the resulting tie by id.
    // Two rooms whose names differ only by case therefore tie on name and resolve
    // to the lower id, while a raw `localeCompare` picks the other one. This is
    // the case that separates the specified comparator from a plausible
    // substitute (review R7).
    const gsTemplate = roomsFromFixture(REAL_NAME_FIXTURE).find((r) => r.kind === "gs")!;
    const rooms: ProjectedRoomRow[] = [
      { ...gsTemplate, id: "r9", name: "alpha" },
      { ...gsTemplate, id: "r1", name: "ALPHA" },
    ];
    const canonical = [...rooms].sort(compareRooms)[0]!;
    const rawLocale = [...rooms].sort((a, b) => a.name.localeCompare(b.name))[0]!;
    premiseHolds(
      "compareRooms and a raw localeCompare DISAGREE on this fixture, so the " +
        "case can tell the specified comparator from a substitute",
      canonical.id !== rawLocale.id,
    );

    const row = renderVenue(withRooms(rooms)).querySelector('[data-testid="venue-room"]');
    expect(valueOf(row)).toBe(canonical.name);
  });
});

// ---------------------------------------------------------------------------
// Transition audit (spec §3.5 / plan Task 3)
// ---------------------------------------------------------------------------

/**
 * | Transition                                  | Treatment                       |
 * | ------------------------------------------- | ------------------------------- |
 * | any state → any state (across server re-render) | instant — server-rendered fact list, no animation, no client state (matches every existing VenueSection row) |
 *
 * State pairs, each a server-render delta and therefore instant: Wi-Fi raw ↔
 * split ↔ absent; password row present ↔ absent; notes row present ↔ absent;
 * room row present ↔ absent. No compound transitions exist because the section
 * holds no client state.
 */
/**
 * The documented Facilities row inventory, in render order. Both halves of the
 * audit below key off it: the guard list AND the push count, so neither a new
 * condition nor an unconditional push can slip in unlisted.
 */
const DOCUMENTED_ROW_GUARDS = [
  "loadingDock",
  "parking",
  "roomName",
  "internet && wifi",
  "wifi.password",
  "wifi.notes",
  "internet",
  "power",
] as const;

/**
 * The fact-row construction block, extracted with BOTH anchors proven present
 * and ordered (diff review R2 F5). `indexOf` returns -1 for a missing anchor and
 * `slice(start, -1)` still yields a long string, so a length-only premise passed
 * after an anchor was renamed — the audit kept "passing" against a slice that no
 * longer bounded what it claimed to bound.
 */
const START_ANCHOR = "const factRows: FactRow[] = []";
const END_ANCHOR = "const hasWhere =";

function factRowSectionOf(source: string): string {
  const start = source.indexOf(START_ANCHOR);
  const end = source.indexOf(END_ANCHOR);
  premiseHolds(`the start anchor ${JSON.stringify(START_ANCHOR)} is present`, start !== -1);
  premiseHolds(`the end anchor ${JSON.stringify(END_ANCHOR)} is present`, end !== -1);
  premiseHolds("the anchors are in order, so the slice is the block", start < end);
  return source.slice(start, end);
}

describe("transition audit — the new rows are instant by construction", () => {
  const source = readFileSync("components/crew/sections/VenueSection.tsx", "utf8");
  // The row RENDERER is part of this surface: a `"use client"` there would make
  // every one of these rows a client boundary, and scanning only VenueSection
  // could not see it (review R2 F5).
  const factRowsSource = readFileSync("components/crew/primitives/FactRows.tsx", "utf8");

  test("VenueSection is a server component with no motion and no transition classes", () => {
    premiseHolds(
      "the audited sources were actually read",
      source.includes("export function VenueSection") &&
        factRowsSource.includes("export function FactRows"),
    );
    for (const [name, text] of [
      ["VenueSection.tsx", source],
      ["FactRows.tsx", factRowsSource],
    ] as const) {
      expect(text, name).not.toContain('"use client"');
      expect(text, name).not.toContain("AnimatePresence");
      expect(text, name).not.toContain("framer-motion");
      expect(text, name).not.toContain("motion.");
    }
    // `transition-colors` on the Maps anchor predates this change and is a CSS
    // hover treatment, not a row appear/disappear animation — the rows this
    // change adds introduce no `transition-` class of their own.
    const factRowSection = factRowSectionOf(source);

    expect(factRowSection).not.toContain("transition-");
    expect(factRowSection).not.toContain("animate");
  });

  test("every fact row is pushed under a plain conditional, one per documented state", () => {
    const factRowSection = factRowSectionOf(source);
    // The imperative push-guard style, not JSX ternaries: enumerate the guards
    // so a new row cannot be added without appearing in this audit.
    const conditions = [...factRowSection.matchAll(/^\s*(?:} else )?if \((.+?)\) \{$/gm)].map((m) =>
      m[1]!.trim(),
    );
    expect(conditions).toEqual(DOCUMENTED_ROW_GUARDS);

    // Counting CONDITIONS alone does not detect every new row (review R1 F2): an
    // unconditional push, or a second push inside an existing condition, leaves
    // the condition list untouched. Pin the push count to the documented
    // inventory as well, so both shapes of addition fail this audit.
    const pushes = factRowSection.match(/factRows\.push\(/g) ?? [];
    expect(pushes.length).toBe(DOCUMENTED_ROW_GUARDS.length);
  });

  /**
   * The static scan reads a SLICE of one file, so motion added to the Facilities
   * wrapper below it — or to FactRows, which renders every one of these rows —
   * was invisible to it, and the DOM assertions ignored class names entirely
   * (review S5 R1: an `animate-pulse` mutant in either place passed everything).
   *
   * This asserts the rendered truth instead: nothing inside the Facilities card
   * carries a motion class, wherever in the component tree it was applied.
   */
  test("no rendered element in the Facilities card carries a motion class", () => {
    const MOTION = /(^|\s)(animate-|transition-|motion-|duration-|ease-)/;
    // The DECLARED state inventory, not a sample of it. A mutant that animated
    // only the room row passed every earlier assertion because no case rendered
    // one (review S5 R4), so each documented state gets a render here.
    const rooms = roomsFromFixture(REAL_NAME_FIXTURE);
    const states: ReadonlyArray<[string, ReturnType<typeof makeShowForViewer>]> = [
      ["split (network + password + notes)", withInternet(SPLIT_INTERNET)],
      ["split, password absent", withInternet("SSID: Hyatt_Meeting")],
      ["split, notes absent", withInternet("SSID - Hyatt_Meeting Password: PHC2025")],
      ["raw fallback", withInternet(RAW_WIFI_VALUE)],
      ["Wi-Fi absent, another fact present", withPower("200A 3-phase")],
      ["room present", withRooms(rooms)],
    ];
    premise("declared states swept", states.length, 4);

    for (const [name, data] of states) {
      const container = renderVenue(data);
      const card = container.querySelector('[data-testid="venue-facilities"]');
      premiseHolds(`the ${name} case actually rendered a Facilities card`, card !== null);
      const auditRows = card!.querySelectorAll('[data-testid="fact-rows"] > div');
      premise(`${name}: fact rows to audit`, auditRows.length, 0);

      // Interactive controls are excluded: the card header's report button
      // carries a pre-existing hover `transition-colors`, which is a colour
      // treatment on a control, not an appear/disappear animation on a row. The
      // §3.5 inventory covers the static fact list and its chrome.
      const isInteractive = (element: Element): boolean => element.closest("button, a") !== null;
      const audited = [card!, ...card!.querySelectorAll("*")].filter(
        (element) => !isInteractive(element),
      );
      premise(`${name}: static elements audited`, audited.length, auditRows.length);

      for (const element of audited) {
        const className = element.getAttribute("class") ?? "";
        expect(className, `${name}: ${element.tagName} carries motion`).not.toMatch(MOTION);
      }
      cleanup();
    }
  });

  test("both Wi-Fi branches and both room states render without any client boundary", () => {
    // Each case proves on its OWN inputs that it reached the state it names —
    // otherwise a case that silently rendered nothing would still "pass" the
    // no-client-boundary assertion (review R1 F3).
    const wifiStates: ReadonlyArray<[string, string, (c: HTMLElement) => boolean]> = [
      [
        "split",
        "Hardline from Encore\n\nSSID: Hyatt_Meeting\nCode: FITS2025",
        (c) => c.querySelector('[data-testid="venue-wifi-ssid"]') !== null,
      ],
      [
        "raw",
        RAW_WIFI_VALUE,
        (c) =>
          c.querySelector('[data-testid="venue-wifi-ssid"]') === null &&
          (c.textContent ?? "").includes(RAW_WIFI_VALUE),
      ],
      ["absent", "", (c) => !(c.textContent ?? "").includes("Wi-Fi")],
    ];
    premise("Wi-Fi states exercised", wifiStates.length, 0);

    for (const [name, internet, reached] of wifiStates) {
      const container = renderVenue(withInternet(internet));
      premiseHolds(`the ${name} case actually reached the ${name} state`, reached(container));
      expect(container.querySelector("[data-framer-appear-id]")).toBeNull();
      expect(container.querySelector('[style*="opacity"]')).toBeNull();
      cleanup();
    }

    // The title claims both ROOM states too, and the room-present case was
    // missing entirely (review R1 F3).
    const rooms = roomsFromFixture(REAL_NAME_FIXTURE);
    const roomStates: ReadonlyArray<[string, ProjectedRoomRow[], boolean]> = [
      ["present", rooms, true],
      ["absent", [], false],
    ];
    for (const [name, roomRows, shouldRender] of roomStates) {
      const container = renderVenue(withRooms(roomRows));
      premiseHolds(
        `the room-${name} case actually reached that state`,
        (container.querySelector('[data-testid="venue-room"]') !== null) === shouldRender,
      );
      expect(container.querySelector("[data-framer-appear-id]")).toBeNull();
      expect(container.querySelector('[style*="opacity"]')).toBeNull();
      cleanup();
    }
  });
});
