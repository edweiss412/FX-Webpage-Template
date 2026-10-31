/**
 * lib/crew/passModel.ts — the server-side builder of the pass props.
 *
 * Spec docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §4.3 (Pass),
 * §4.2 (day set), §9.2 / §9.3 (copy), §11 (guards), §2.2 (the leak this closes).
 * Plan docs/superpowers/plans/2026-10-26-crew-page-redesign-pr-a.md, Task 3.
 *
 * Shows come from the raw corpus through the real parser wherever the case can
 * use one, so an expected value is read back from the sheet that produced it and
 * a case cannot pass on a literal the code happens to also contain. Spec copy
 * ("Show day N of M", "Your lead", ...) is asserted through templates filled from
 * fixture values.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import type { DateRestriction, HotelReservationRow, ParsedSheet } from "@/lib/parser/types";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import {
  buildPassProps,
  passDaySet,
  passStatusLine,
  PASS_COUNTDOWN_WINDOW_MINUTES,
  type PassDay,
  type PassProps,
} from "@/lib/crew/passModel";
import { aggregateDays, visibleShowDays } from "@/lib/crew/agendaDisplay";
import { compareRooms, resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { daysBetween, formatIsoForTimezone, selectRightNowState } from "@/lib/time/rightNow";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { namesReferAny } from "@/lib/data/nameMatch";
import { normalizeDateRestriction } from "@/lib/data/normalizeDateRestriction";
import { effectiveViewerDateRestriction } from "@/lib/crew/stageSchedule";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";
import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";

const RAW_DIR = "fixtures/shows/raw";
const RAW_FIXTURES = readdirSync(RAW_DIR)
  .filter((f) => f.endsWith(".md") && !f.startsWith(CORPUS_TEMP_PREFIX))
  .sort();

/** Separate travel-in, load-in, two show days, travel-out; a real GS room name; one hotel. */
const WALDORF = "2026-04-asset-mgmt-cfo-coo-waldorf.md";
/** Travel in and load in on one date; neither that date nor show day 1 has a ScheduleDay. */
const EAST_COAST = "2024-05-east-coast-family-office.md";
/** The parser synthesizes the GS room name ("General Session"); a dress code is set. */
const REDEFINING = "2025-05-redefining-fixed-income-private-credit.md";
/** A crew member with an explicit day restriction. */
const ASSET_MGMT = "2025-04-asset-mgmt-cfo-coo.md";

function parseFixture(name: string): ParsedSheet {
  const file = join(RAW_DIR, name);
  return parseSheet(readFileSync(file, "utf8"), file);
}

type ViewerKind = Viewer["kind"];

/**
 * The projection getShowForViewer would hand the page for this viewer, built
 * from a parse: crew ids assigned in roster order, the viewer's restriction
 * optionally overridden, runOfShow keys intersected with the viewer's show days
 * (as the projection does), hotels filtered to the viewer for crew and
 * admin_preview unless `allHotels` asks for the unfiltered set.
 */
function projectFixture(
  parsed: ParsedSheet,
  opts: {
    kind: ViewerKind;
    viewerName?: string;
    restriction?: DateRestriction;
    allHotels?: boolean;
  },
): { data: ShowForViewer; viewer: Viewer } {
  const crewMembers: ShowForViewer["crewMembers"] = parsed.crewMembers.map((c, i) => ({
    id: `crew-${i}`,
    name: c.name,
    email: c.email,
    phone: c.phone,
    role: c.role,
    roleFlags: c.role_flags,
    // The projection's own restriction derivation (getShowForViewer): M/D days
    // normalized to ISO, then an explicit stage restriction folded in.
    dateRestriction:
      opts.restriction !== undefined && c.name === opts.viewerName
        ? opts.restriction
        : effectiveViewerDateRestriction(
            parsed.show.dates,
            parsed.show.schedule_phases,
            normalizeDateRestriction(c.date_restriction, parsed.show.dates),
            c.stage_restriction,
          ),
    stageRestriction: c.stage_restriction,
  }));
  const member =
    opts.kind === "admin" ? null : (crewMembers.find((c) => c.name === opts.viewerName) ?? null);
  if (opts.kind !== "admin" && member === null) {
    throw new Error(`no crew member named ${opts.viewerName} in the fixture`);
  }
  const restriction: DateRestriction = member?.dateRestriction ?? { kind: "none" };
  const keep = new Set(visibleShowDays(parsed.show.dates, restriction));
  const runOfShow = parsed.runOfShow
    ? Object.fromEntries(Object.entries(parsed.runOfShow).filter(([iso]) => keep.has(iso)))
    : null;
  const aliases = member ? [member.name] : [];
  const hotelReservations =
    opts.kind === "admin" || opts.allHotels
      ? parsed.hotelReservations
      : parsed.hotelReservations.filter((h) => h.names.some((n) => namesReferAny(n, aliases)));
  const data: ShowForViewer = {
    ...makeShowForViewer(),
    show: parsed.show,
    crewMembers,
    hotelReservations,
    rooms: parsed.rooms.map((r, i) => ({ ...r, id: `room-${i}` })),
    transportation: parsed.transportation,
    contacts: parsed.contacts,
    runOfShow: runOfShow && Object.keys(runOfShow).length > 0 ? runOfShow : null,
    viewerName: member?.name ?? null,
    viewerNameAliases: aliases,
    viewerId: member?.id ?? null,
  };
  const viewer: Viewer =
    opts.kind === "admin" ? { kind: "admin" } : { kind: opts.kind, crewMemberId: member!.id };
  return { data, viewer };
}

/** The viewer-side anchors the builder should be reading, from the shared resolver. */
function anchorsFor(data: ShowForViewer, viewer: Viewer) {
  const member =
    viewer.kind === "admin" ? null : data.crewMembers.find((c) => c.id === viewer.crewMemberId)!;
  return resolveKeyTimes(
    data.show,
    data.rooms,
    data.runOfShow,
    member?.dateRestriction ?? { kind: "none" },
    member?.stageRestriction ?? { kind: "none" },
  );
}

function dated(props: PassProps): Extract<PassProps, { mode: "dated" }> {
  if (props.mode !== "dated") throw new Error(`expected dated pass props, got ${props.mode}`);
  return props;
}

function dayOf(props: PassProps, iso: string): PassDay {
  const day = dated(props).days.find((d) => d.iso === iso);
  if (!day) throw new Error(`no pass day for ${iso}`);
  return day;
}

const factsOf = (day: PassDay) => day.facts.map((f) => [f.label, f.value]);
const factLabels = (day: PassDay) => day.facts.map((f) => f.label);

/** Noon in the show timezone on that date. */
function noonOn(iso: string, timeZone: string): Date {
  return instantAt(iso, 12 * 60, timeZone);
}

function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return value("hour") * 60 + value("minute");
}

/** The instant that reads `minuteOfDay` on `iso` in `timeZone` (minutes may run past either midnight). */
function instantAt(iso: string, minuteOfDay: number, timeZone: string): Date {
  let t = Date.parse(`${iso}T00:00:00Z`) + minuteOfDay * 60_000;
  for (let i = 0; i < 4; i += 1) {
    const at = new Date(t);
    const drift =
      daysBetween(iso, formatIsoForTimezone(at, timeZone)) * 1440 +
      localMinutes(at, timeZone) -
      minuteOfDay;
    if (drift === 0) return at;
    t -= drift * 60_000;
  }
  throw new Error(`could not place minute ${minuteOfDay} on ${iso} in ${timeZone}`);
}

function weekdayOf(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/** Every ISO date a viewer whose dates are suppressed must not receive. */
function withheldDates(parsed: ParsedSheet): string[] {
  const d = parsed.show.dates;
  const out = new Set<string>();
  for (const iso of [d.travelIn, d.set, ...(d.showDays ?? []), d.travelOut]) {
    if (iso) out.add(iso);
  }
  for (const iso of Object.keys(parsed.runOfShow ?? {})) out.add(iso);
  for (const h of parsed.hotelReservations) {
    if (h.check_in) out.add(h.check_in);
    if (h.check_out) out.add(h.check_out);
  }
  return [...out].sort();
}

function hotelDates(parsed: ParsedSheet): string[] {
  return [
    ...new Set(parsed.hotelReservations.flatMap((h) => [h.check_in, h.check_out]).filter(Boolean)),
  ] as string[];
}

function showDates(parsed: ParsedSheet): string[] {
  return aggregateDays(parsed.show.dates).map((d) => d.date);
}

/** Every needle that appears anywhere in the serialized props. */
function foundIn(props: unknown, needles: readonly string[]): string[] {
  const text = JSON.stringify(props);
  return needles.filter((n) => text.includes(n));
}

/** The first LEAD in roster order, as the Crew section renders the roster. */
function firstLead(data: ShowForViewer) {
  return data.crewMembers.find((c) => c.roleFlags.includes("LEAD")) ?? null;
}

/** Phase label template per spec §4.3 / §9.1, filled from the fixture's dates. */
function expectedLabel(parsed: ParsedSheet, iso: string): string {
  const days = aggregateDays(parsed.show.dates);
  const shows = days.filter((d) => d.phase === "Show");
  const day = days.find((d) => d.date === iso)!;
  switch (day.phase) {
    case "Show":
      return `Show day ${shows.findIndex((d) => d.date === iso) + 1} of ${shows.length}`;
    case "Set":
      return "Load in";
    case "Travel In":
      return parsed.show.dates.set === iso ? "Travel in, load in" : "Travel in";
    case "Travel Out":
      return "Travel out";
  }
}

const TODAY = new Date("2026-10-27T16:00:00Z");

// ---------------------------------------------------------------------------
// Day set, day phases and big time (spec §4.2, §4.3 L175, L179)
// ---------------------------------------------------------------------------

describe("pass model: days and phases", () => {
  it("pass model: an unrestricted viewer gets one day per aggregate day, each with its phase label", () => {
    const parsed = parseFixture(WALDORF);
    const crew = parsed.crewMembers.find((c) => !c.role_flags.includes("LEAD"))!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: crew.name });
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));

    expect(props.days.map((d) => d.iso)).toEqual(showDates(parsed));
    for (const day of props.days) {
      expect(day.label, day.iso).toBe(expectedLabel(parsed, day.iso));
    }
    // Every phase is represented, so the template is exercised on each arm.
    const phases = new Set(aggregateDays(parsed.show.dates).map((d) => d.phase));
    premise("phases in the fixture", phases.size, 3);
  });

  it("pass model: a combined travel and load-in day reads 'Travel in, load in' with the load-in big time", () => {
    const parsed = parseFixture(EAST_COAST);
    const iso = parsed.show.dates.travelIn!;
    premiseHolds("travel in and load in share a date", parsed.show.dates.set === iso);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const day = dayOf(buildPassProps({ data, viewer, today: TODAY }), iso);
    const set = anchorsFor(data, viewer).set;
    premiseHolds("the fixture resolves a Set anchor", set !== undefined);

    expect(day.kind).toBe("travel_in_load_in");
    expect(day.label).toBe("Travel in, load in");
    expect(day.bigTime).toEqual({ label: "Load in", time: set });
    // The Set anchor is the big time here, so it is not repeated as a cell.
    expect(factLabels(day)).not.toContain("Load in");
  });

  it("pass model: big time per day kind is Show plus its anchor, Load in plus the Set anchor, none on travel days, and Strike at the last show day's right edge", () => {
    const parsed = parseFixture(WALDORF);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const props = buildPassProps({ data, viewer, today: TODAY });
    const anchors = anchorsFor(data, viewer);
    const d = parsed.show.dates;
    const lastShow = d.showDays[d.showDays.length - 1]!;
    premiseHolds("Set and Strike anchors resolve", anchors.set != null && anchors.strike != null);

    for (const iso of d.showDays) {
      const anchor = anchors.shows?.find((s) => s.date === iso);
      premiseHolds(`a Show anchor for ${iso}`, anchor !== undefined);
      const day = dayOf(props, iso);
      expect(day.bigTime, iso).toEqual({ label: "Show", time: anchor!.time });
      expect(day.strike, iso).toEqual(
        iso === lastShow ? { label: "Strike", time: anchors.strike } : null,
      );
    }
    expect(dayOf(props, d.set!).bigTime).toEqual({ label: "Load in", time: anchors.set });
    expect(dayOf(props, d.travelIn!).bigTime).toBeNull();
    expect(dayOf(props, d.travelOut!).bigTime).toBeNull();
    expect(dayOf(props, d.travelIn!).strike).toBeNull();
  });

  it("pass model: show days carry one progress segment per show day; other days carry none", () => {
    const parsed = parseFixture(WALDORF);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    const shows = aggregateDays(parsed.show.dates).filter((d) => d.phase === "Show");
    for (const day of props.days) {
      const n = shows.findIndex((s) => s.date === day.iso);
      expect(day.progress, day.iso).toEqual(n >= 0 ? { n: n + 1, total: shows.length } : null);
    }
  });

  it("pass model: an explicitly restricted viewer's days are only their own days", () => {
    const parsed = parseFixture(ASSET_MGMT);
    const member = parsed.crewMembers.find((c) => c.date_restriction.kind === "explicit")!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
    const restriction = data.crewMembers.find((c) => c.name === member.name)!.dateRestriction;
    premiseHolds("the projected restriction is explicit", restriction.kind === "explicit");
    const own = (restriction as { days: string[] }).days;
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    const expected = showDates(parsed).filter((iso) => own.includes(iso));
    premise("the restriction drops days", showDates(parsed).length - expected.length, 0);
    premise("the restriction keeps days", expected.length, 0);

    expect(props.days.map((d) => d.iso)).toEqual(expected);
    expect(props.dateRestriction).toEqual(restriction);
    expect(passDaySet(parsed.show.dates, restriction).map((d) => d.date)).toEqual(expected);
  });

  it("pass model: the day set is every aggregate day for an unrestricted viewer and empty for a suppressed one", () => {
    const parsed = parseFixture(WALDORF);
    expect(passDaySet(parsed.show.dates, { kind: "none" })).toEqual(
      aggregateDays(parsed.show.dates),
    );
    expect(passDaySet(parsed.show.dates, { kind: "unknown_asterisk", days: null })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Eyebrow (L177, L422, L470)
// ---------------------------------------------------------------------------

describe("pass model: eyebrow", () => {
  it("pass model: the eyebrow's right side is 'You, ' plus the viewer's role exactly as the sheet writes it", () => {
    const parsed = parseFixture(WALDORF);
    const member = parsed.crewMembers.find((c) => c.role.trim().length > 0)!;
    for (const kind of ["crew", "admin_preview"] as const) {
      const { data, viewer } = projectFixture(parsed, { kind, viewerName: member.name });
      const props = buildPassProps({ data, viewer, today: TODAY });
      expect(props.eyebrowRight, kind).toBe(`You, ${member.role.trim()}`);
    }
  });

  it("pass model: an absent or sentinel viewer role omits the eyebrow's right side", () => {
    const parsed = parseFixture(WALDORF);
    const member = parsed.crewMembers[1]!;
    for (const role of ["", "   ", "TBD", "N/A"]) {
      const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
      data.crewMembers.find((c) => c.name === member.name)!.role = role;
      expect(buildPassProps({ data, viewer, today: TODAY }).eyebrowRight, role).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Fact grid (L181, L468, L469)
// ---------------------------------------------------------------------------

describe("pass model: fact grid", () => {
  /** Waldorf with a dress code borrowed from another sheet, so all six candidates resolve. */
  function fullWaldorf(kind: ViewerKind = "crew") {
    const parsed = parseFixture(WALDORF);
    const dress = parseFixture(REDEFINING).show.event_details.dress_code;
    premiseHolds("the donor sheet has a dress code", typeof dress === "string" && dress !== "");
    parsed.show.event_details.dress_code = dress!;
    const lead = parsed.crewMembers.find((c) => c.role_flags.includes("LEAD"))!;
    const member = parsed.crewMembers.find(
      (c) => !c.role_flags.includes("LEAD") && parsed.hotelReservations[0]!.names.includes(c.name),
    )!;
    const projected = projectFixture(parsed, { kind, viewerName: member.name });
    return { parsed, lead, member, ...projected };
  }

  it("pass model: fact grid candidates in spec order on a travel-in day: Room, Your lead, Hotel tonight, Dress code, Strike, Load in", () => {
    const { parsed, lead, data, viewer } = fullWaldorf();
    const iso = parsed.show.dates.travelIn!;
    const anchors = anchorsFor(data, viewer);
    const gsRoom = data.rooms.filter((r) => r.kind === "gs").sort(compareRooms)[0]!;
    const hotel = parsed.hotelReservations[0]!;
    premiseHolds(
      "the hotel covers the travel-in night",
      hotel.check_in! <= iso && iso < hotel.check_out!,
    );

    expect(factsOf(dayOf(buildPassProps({ data, viewer, today: TODAY }), iso))).toEqual([
      ["Room", gsRoom.name],
      ["Your lead", lead.name],
      ["Hotel tonight", hotel.hotel_name],
      ["Dress code", parsed.show.event_details.dress_code],
      ["Strike", anchors.strike],
      ["Load in", anchors.set],
    ]);
  });

  // UI-gate re-run, critique N1: the cell showed the whole value, whose first
  // line is the set/strike attire, and its 2-line clamp hid the show attire on a
  // show day. A phased value now gives each day its phase's line, labelled.
  it("pass model: the Dress code cell is the day's phase line: Show on a show day, Set/Strike on the load-in day, the whole value on a travel day", () => {
    const { parsed, data, viewer } = fullWaldorf();
    const value = parsed.show.event_details.dress_code!;
    const phases = parseDressCodeLines(value);
    premiseHolds("the donor dress code is phased, Set/Strike then Show", phases?.length === 2);
    const [setStrike, show] = phases!;
    const props = buildPassProps({ data, viewer, today: TODAY });
    const dressOf = (iso: string) =>
      dayOf(props, iso).facts.find((f) => f.id === "dressCode")?.value;
    const d = parsed.show.dates;
    premiseHolds("the set day is its own load-in day", d.set !== null && d.set !== d.travelIn);
    for (const iso of d.showDays) {
      expect(dressOf(iso), iso).toBe(`${show!.phase}: ${show!.attire}`);
    }
    expect(dressOf(d.set!)).toBe(`${setStrike!.phase}: ${setStrike!.attire}`);
    expect(dressOf(d.travelIn!)).toBe(value);
  });

  it("pass model: Strike is a cell only when it is not already the big time", () => {
    const { parsed, data, viewer } = fullWaldorf();
    const props = buildPassProps({ data, viewer, today: TODAY });
    const d = parsed.show.dates;
    const lastShow = d.showDays[d.showDays.length - 1]!;
    expect(dayOf(props, lastShow).strike).not.toBeNull();
    expect(factLabels(dayOf(props, lastShow))).not.toContain("Strike");
    for (const iso of [d.travelIn!, d.set!, d.showDays[0]!, d.travelOut!]) {
      expect(factLabels(dayOf(props, iso)), iso).toContain("Strike");
    }
  });

  it("pass model: Load in is a cell only on a travel-in day with a Set anchor", () => {
    const { parsed, data, viewer } = fullWaldorf();
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    for (const day of props.days) {
      expect(factLabels(day).includes("Load in"), day.iso).toBe(
        day.iso === parsed.show.dates.travelIn,
      );
    }
    // A Strike-only crew member has no Set anchor (stage gate), so no Load in cell.
    const member = data.crewMembers.find(
      (c) => c.id === (viewer as { crewMemberId: string }).crewMemberId,
    )!;
    member.stageRestriction = { kind: "explicit", stages: ["Strike"] };
    premiseHolds("the stage gate drops the Set anchor", anchorsFor(data, viewer).set === undefined);
    const gated = dayOf(
      buildPassProps({ data, viewer, today: TODAY }),
      parsed.show.dates.travelIn!,
    );
    expect(factLabels(gated)).not.toContain("Load in");
  });

  it("pass model: Room is the general-session room by compareRooms, omitted for the parser's synthesized name and on a rooms fetch failure", () => {
    const { parsed, data, viewer } = fullWaldorf();
    const iso = parsed.show.dates.showDays[0]!;
    const gsRoom = data.rooms.filter((r) => r.kind === "gs").sort(compareRooms)[0]!;
    expect(dayOf(buildPassProps({ data, viewer, today: TODAY }), iso).facts[0]).toEqual({
      id: "room",
      label: "Room",
      value: gsRoom.name,
    });

    data.tileErrors = { rooms: "fetch failed" };
    expect(factLabels(dayOf(buildPassProps({ data, viewer, today: TODAY }), iso))).not.toContain(
      "Room",
    );

    // The synthesized fallback name comes from the real parser, not a literal here.
    const synth = parseFixture(REDEFINING);
    const synthGs = synth.rooms.filter((r) => r.kind === "gs");
    premiseHolds("the parser synthesized one GS room", synthGs.length === 1);
    const projected = projectFixture(synth, { kind: "admin" });
    const props = dated(buildPassProps({ ...projected, today: TODAY }));
    for (const day of props.days) expect(factLabels(day), day.iso).not.toContain("Room");
  });

  it("pass model: a fact cell whose value is absent or a sentinel is omitted", () => {
    const { parsed, lead, data, viewer } = fullWaldorf();
    const iso = parsed.show.dates.travelIn!;
    data.show.event_details.dress_code = "TBD";
    data.crewMembers.find((c) => c.name === lead.name)!.name = "N/A";
    const labels = factLabels(dayOf(buildPassProps({ data, viewer, today: TODAY }), iso));
    expect(labels).not.toContain("Dress code");
    expect(labels).not.toContain("Your lead");
    expect(labels).toContain("Room");
  });

  it("pass model: no grid cells at all when every candidate is absent", () => {
    const data = makeShowForViewer({
      show: {
        dates: {
          travelIn: "2026-11-01",
          set: "2026-11-02",
          showDays: ["2026-11-03", "2026-11-04"],
          travelOut: "2026-11-05",
        },
      },
      rooms: [],
    });
    const props = dated(
      buildPassProps({
        data,
        viewer: { kind: "crew", crewMemberId: data.crewMembers[0]!.id },
        today: TODAY,
      }),
    );
    premise("days built", props.days.length, 0);
    for (const day of props.days) expect(day.facts, day.iso).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Personal cells (L182, L183, L184, L418, L474)
// ---------------------------------------------------------------------------

describe("pass model: personal cells", () => {
  it("pass model: personal cells render only for crew and admin_preview viewers", () => {
    const parsed = parseFixture(WALDORF);
    const member = parsed.crewMembers.find(
      (c) => !c.role_flags.includes("LEAD") && parsed.hotelReservations[0]!.names.includes(c.name),
    )!;
    const iso = parsed.show.dates.travelIn!;
    for (const kind of ["crew", "admin_preview"] as const) {
      const { data, viewer } = projectFixture(parsed, { kind, viewerName: member.name });
      const props = buildPassProps({ data, viewer, today: TODAY });
      expect(props.eyebrowRight, kind).not.toBeNull();
      expect(factLabels(dayOf(props, iso)), kind).toEqual(
        expect.arrayContaining(["Your lead", "Hotel tonight"]),
      );
    }
    const admin = projectFixture(parsed, { kind: "admin" });
    premise("the admin viewer receives reservations", admin.data.hotelReservations.length, 0);
    const props = buildPassProps({ ...admin, today: TODAY });
    expect(props.eyebrowRight).toBeNull();
    for (const day of dated(props).days) {
      expect(factLabels(day), day.iso).not.toContain("Your lead");
      expect(factLabels(day), day.iso).not.toContain("Hotel tonight");
    }
  });

  it("pass model: 'Your lead' is the first LEAD in roster order and is omitted when that lead is the viewer", () => {
    const parsed = parseFixture(WALDORF);
    const iso = parsed.show.dates.showDays[0]!;
    const member = parsed.crewMembers.find((c) => !c.role_flags.includes("LEAD"))!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
    // A second LEAD later in the roster must not displace the first.
    data.crewMembers.push({ ...data.crewMembers[0]!, id: "crew-late-lead", name: "Late Lead" });
    data.crewMembers.at(-1)!.roleFlags = ["LEAD"];
    const lead = firstLead(data)!;
    premise(
      "leads on the roster",
      data.crewMembers.filter((c) => c.roleFlags.includes("LEAD")).length,
      1,
    );
    const cell = dayOf(buildPassProps({ data, viewer, today: TODAY }), iso).facts.find(
      (f) => f.id === "lead",
    );
    expect(cell).toEqual({ id: "lead", label: "Your lead", value: lead.name });

    const asLead = projectFixture(parsed, { kind: "crew", viewerName: lead.name });
    const own = dayOf(buildPassProps({ ...asLead, today: TODAY }), iso);
    expect(factLabels(own)).not.toContain("Your lead");
  });

  it("pass model: 'Hotel tonight' is the reservation covering that night, check-in night included and check-out night excluded", () => {
    const parsed = parseFixture(WALDORF);
    const hotel = parsed.hotelReservations[0]!;
    const member = parsed.crewMembers.find((c) => hotel.names.includes(c.name))!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    premiseHolds(
      "the check-in night is a pass day",
      props.days.some((d) => d.iso === hotel.check_in),
    );
    premiseHolds(
      "the check-out night is a pass day",
      props.days.some((d) => d.iso === hotel.check_out),
    );
    for (const day of props.days) {
      const covered = hotel.check_in! <= day.iso && day.iso < hotel.check_out!;
      expect(
        day.facts.find((f) => f.id === "hotel"),
        day.iso,
      ).toEqual(
        covered ? { id: "hotel", label: "Hotel tonight", value: hotel.hotel_name } : undefined,
      );
    }
  });

  it("pass model: no reservation covering the night omits 'Hotel tonight' rather than naming the first reservation", () => {
    const parsed = parseFixture(WALDORF);
    const hotel = parsed.hotelReservations[0]!;
    const member = parsed.crewMembers.find((c) => hotel.names.includes(c.name))!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
    const showDay = parsed.show.dates.showDays[0]!;
    const travelOut = parsed.show.dates.travelOut!;
    // reservations[0] covers nothing this tour; the second covers the first show night only.
    const decoy: HotelReservationRow = {
      ...hotel,
      ordinal: 1,
      hotel_name: `${hotel.hotel_name} (decoy)`,
      check_in: "2020-01-01",
      check_out: "2020-01-02",
    };
    const real: HotelReservationRow = {
      ...hotel,
      ordinal: 2,
      check_in: showDay,
      check_out: travelOut,
    };
    data.hotelReservations = [decoy, real];
    const props = buildPassProps({ data, viewer, today: TODAY });

    expect(dayOf(props, showDay).facts.find((f) => f.id === "hotel")?.value).toBe(real.hotel_name);
    for (const iso of [parsed.show.dates.travelIn!, parsed.show.dates.set!, travelOut]) {
      expect(factLabels(dayOf(props, iso)), iso).not.toContain("Hotel tonight");
    }
  });
});

// ---------------------------------------------------------------------------
// Status line and countdown (L178, L416, L431, L466)
// ---------------------------------------------------------------------------

describe("pass model: status line", () => {
  function firstShowDay() {
    const parsed = parseFixture(WALDORF);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    const iso = parsed.show.dates.showDays[0]!;
    const day = dayOf(props, iso);
    const time = day.bigTime!.time;
    const start = clockToMinutes(time);
    premiseHolds(`the fixture's show start "${time}" converts`, start !== null);
    const at = (offsetBefore: number) => instantAt(iso, start! - offsetBefore, props.timezone);
    return { props, day, time, at };
  }

  it("pass model: a show start within 3 hours counts down in minutes", () => {
    const { props, day, at } = firstShowDay();
    expect(passStatusLine(day, at(25), props.timezone)).toBe("Show starts in 25 min");
    expect(passStatusLine(day, at(1), props.timezone)).toBe("Show starts in 1 min");
  });

  it("pass model: a countdown of an hour or more reads hours and minutes", () => {
    const { props, day, at } = firstShowDay();
    expect(passStatusLine(day, at(80), props.timezone)).toBe("Show starts in 1 hr 20 min");
    expect(passStatusLine(day, at(60), props.timezone)).toBe("Show starts in 1 hr");
    expect(passStatusLine(day, at(PASS_COUNTDOWN_WINDOW_MINUTES), props.timezone)).toBe(
      `Show starts in ${PASS_COUNTDOWN_WINDOW_MINUTES / 60} hr`,
    );
  });

  it("pass model: a show start already past reads 'Show started at <time>.' with the time as written", () => {
    const { props, day, time, at } = firstShowDay();
    expect(passStatusLine(day, at(0), props.timezone)).toBe(`Show started at ${time}.`);
    expect(passStatusLine(day, at(-90), props.timezone)).toBe(`Show started at ${time}.`);
  });

  it("pass model: a show start beyond 3 hours has no status line", () => {
    const { props, day, at } = firstShowDay();
    expect(PASS_COUNTDOWN_WINDOW_MINUTES).toBe(180);
    expect(passStatusLine(day, at(PASS_COUNTDOWN_WINDOW_MINUTES + 1), props.timezone)).toBeNull();
  });

  it("pass model: only today's show day carries a status line", () => {
    const { props, day, at } = firstShowDay();
    const now = at(25);
    for (const other of props.days.filter((d) => d.iso !== day.iso)) {
      expect(passStatusLine(other, now, props.timezone), other.iso).toBeNull();
    }
    // The same show day read on another date (a day(iso) selection) has none either.
    const tomorrow = instantAt(props.days.at(-1)!.iso, 7 * 60, props.timezone);
    expect(passStatusLine(day, tomorrow, props.timezone)).toBeNull();
  });

  it("pass model: a show start clockToMinutes cannot convert renders as written with no countdown", () => {
    const parsed = parseFixture(WALDORF);
    const iso = parsed.show.dates.showDays[0]!;
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const unparseable = "after lunch";
    premiseHolds("the value does not convert", clockToMinutes(unparseable) === null);
    data.runOfShow![iso] = { ...data.runOfShow![iso]!, showStart: unparseable };
    const props = dated(buildPassProps({ data, viewer, today: TODAY }));
    const day = dayOf(props, iso);
    expect(day.bigTime).toEqual({ label: "Show", time: unparseable });
    for (let minute = 0; minute < 24 * 60; minute += 30) {
      expect(
        passStatusLine(day, instantAt(iso, minute, props.timezone), props.timezone),
      ).toBeNull();
    }
  });

  it("pass model: an absent showStart gives no big time and no status line", () => {
    const data = makeShowForViewer({
      show: {
        dates: {
          travelIn: "2026-11-01",
          set: null,
          showDays: ["2026-11-02"],
          travelOut: "2026-11-03",
        },
      },
      rooms: [],
    });
    const props = dated(buildPassProps({ data, viewer: { kind: "admin" }, today: TODAY }));
    const day = dayOf(props, "2026-11-02");
    expect(day.bigTime).toBeNull();
    expect(
      passStatusLine(day, instantAt(day.iso, 6 * 60, props.timezone), props.timezone),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Guards (spec §11 L465, L467) and times as written (L415)
// ---------------------------------------------------------------------------

describe("pass model: guards", () => {
  it("pass model: a day with no ScheduleDay still builds its anchor, fact grid and phase label (East Coast)", () => {
    const parsed = parseFixture(EAST_COAST);
    const member = parsed.crewMembers.find((c) => !c.role_flags.includes("LEAD"))!;
    const { data, viewer } = projectFixture(parsed, { kind: "crew", viewerName: member.name });
    const anchors = anchorsFor(data, viewer);
    const loadInDay = parsed.show.dates.set!;
    const firstShow = parsed.show.dates.showDays[0]!;
    for (const iso of [loadInDay, firstShow]) {
      premiseHolds(`${iso} has no ScheduleDay`, data.runOfShow?.[iso] === undefined);
    }
    premiseHolds("the load-in anchor resolves without a schedule row", anchors.set !== undefined);
    const props = buildPassProps({ data, viewer, today: TODAY });

    const loadIn = dayOf(props, loadInDay);
    expect(loadIn.label).toBe(expectedLabel(parsed, loadInDay));
    expect(loadIn.bigTime).toEqual({ label: "Load in", time: anchors.set });
    const lead = firstLead(data)!;
    expect(loadIn.facts.find((f) => f.id === "lead")?.value).toBe(lead.name);

    const show = dayOf(props, firstShow);
    expect(show.label).toBe(expectedLabel(parsed, firstShow));
    expect(show.bigTime).toEqual(
      anchors.shows?.some((s) => s.date === firstShow)
        ? { label: "Show", time: anchors.shows.find((s) => s.date === firstShow)!.time }
        : null,
    );
    expect(show.facts.find((f) => f.id === "lead")?.value).toBe(lead.name);
  });

  it("pass model: a TBD, N/A or TBA anchor is treated as absent", () => {
    for (const sentinel of ["TBD", "N/A", "TBA", "10/20 @ TBD"]) {
      const data = makeShowForViewer({
        show: {
          dates: {
            travelIn: "2026-11-01",
            set: "2026-11-02",
            showDays: ["2026-11-03"],
            travelOut: "2026-11-04",
            loadIn: sentinel,
          },
        },
        rooms: [
          {
            id: "r1",
            kind: "gs",
            name: "Ballroom",
            set_time: sentinel,
            show_time: sentinel,
            strike_time: sentinel,
          },
        ],
        runOfShow: {
          "2026-11-03": { entries: [], showStart: sentinel, showEnd: null, window: null },
        },
      });
      const props = dated(buildPassProps({ data, viewer: { kind: "admin" }, today: TODAY }));
      for (const day of props.days) {
        expect(day.bigTime, `${sentinel} ${day.iso}`).toBeNull();
        expect(day.strike, `${sentinel} ${day.iso}`).toBeNull();
        expect(factLabels(day), `${sentinel} ${day.iso}`).not.toContain("Strike");
        expect(factLabels(day), `${sentinel} ${day.iso}`).not.toContain("Load in");
      }
    }
  });

  it("pass model: anchors render as the sheet wrote them, and a strike already carrying its day stays as written", () => {
    const parsed = parseFixture(WALDORF);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const anchors = anchorsFor(data, viewer);
    premiseHolds(
      "the fixture's strike leads with its M/D",
      /^\d{1,2}\/\d{1,2}\b/.test(anchors.strike!),
    );
    const props = buildPassProps({ data, viewer, today: TODAY });
    const d = parsed.show.dates;
    expect(dayOf(props, d.showDays.at(-1)!).strike?.time).toBe(anchors.strike);
    expect(dayOf(props, d.set!).facts.find((f) => f.id === "strike")?.value).toBe(anchors.strike);
    expect(dayOf(props, d.set!).bigTime?.time).toBe(anchors.set);
  });

  it("pass model: a bare-clock strike carries the last show day's weekday", () => {
    const parsed = parseFixture(WALDORF);
    const { data, viewer } = projectFixture(parsed, { kind: "admin" });
    const gs = data.rooms.filter((r) => r.kind === "gs").sort(compareRooms)[0]!;
    const clock = gs.strike_time!.replace(/^\s*\d{1,2}\/\d{1,2}\s*@\s*/, "");
    premiseHolds("the bare clock carries no date", !/\//.test(clock));
    gs.strike_time = clock;
    const strike = anchorsFor(data, viewer).strike!;
    const lastShow = parsed.show.dates.showDays.at(-1)!;
    const expected = `${weekdayOf(lastShow)} ${strike}`;
    const props = buildPassProps({ data, viewer, today: TODAY });
    expect(dayOf(props, lastShow).strike?.time).toBe(expected);
    expect(dayOf(props, parsed.show.dates.set!).facts.find((f) => f.id === "strike")?.value).toBe(
      expected,
    );
  });
});

// ---------------------------------------------------------------------------
// Suppressed dates and degraded states (L185, L186)
// ---------------------------------------------------------------------------

describe("pass model: suppressed dates and degraded states", () => {
  const SUPPRESSED: DateRestriction = { kind: "unknown_asterisk", days: null };

  function suppressedAndOpen(name: string) {
    const parsed = parseFixture(name);
    const viewerName = parsed.crewMembers[0]!.name;
    const suppressed = projectFixture(parsed, {
      kind: "crew",
      viewerName,
      restriction: SUPPRESSED,
      allHotels: true,
    });
    const open = projectFixture(parsed, {
      kind: "crew",
      viewerName,
      restriction: { kind: "none" },
      allHotels: true,
    });
    return { parsed, suppressed, open };
  }

  it("pass model: a date-suppressed viewer's props carry no show or hotel date, for every raw fixture", () => {
    premise("raw fixtures", RAW_FIXTURES.length, 0);
    let hotelNeedles = 0;
    for (const name of RAW_FIXTURES) {
      const { parsed, suppressed } = suppressedAndOpen(name);
      const needles = withheldDates(parsed);
      premise(`${name} has dates to withhold`, needles.length, 0);
      hotelNeedles += hotelDates(parsed).length;
      const props = buildPassProps({ ...suppressed, today: TODAY });
      expect(props.mode, name).toBe("degraded");
      expect(foundIn(props, needles), name).toEqual([]);
    }
    premise("hotel dates among the needles", hotelNeedles, 0);
  });

  it("pass model: positive control: the same search finds the show dates, and the hotel dates on show days, in an unrestricted viewer's props", () => {
    let hotelFound = 0;
    for (const name of RAW_FIXTURES) {
      const { parsed, open } = suppressedAndOpen(name);
      const props = buildPassProps({ ...open, today: TODAY });
      const days = showDates(parsed);
      expect(foundIn(props, withheldDates(parsed)), name).toEqual(expect.arrayContaining(days));
      const onShowDays = hotelDates(parsed).filter((iso) => days.includes(iso));
      expect(foundIn(props, onShowDays), name).toEqual(onShowDays);
      hotelFound += onShowDays.length;
    }
    premise("hotel dates the control finds", hotelFound, 0);
  });

  it("pass model: the server-computed state kind equals selectRightNowState with the real dates, for every raw fixture and any clock", () => {
    for (const name of RAW_FIXTURES) {
      const { parsed, suppressed } = suppressedAndOpen(name);
      const tz = resolveShowTimezone(parsed.show.venue);
      const days = showDates(parsed);
      const clocks = [
        TODAY,
        noonOn(days[0]!, tz),
        noonOn(days.at(-1)!, tz),
        ...days.map((iso) => noonOn(iso, tz)),
      ];
      for (const today of clocks) {
        const props = buildPassProps({ ...suppressed, today });
        const expected = selectRightNowState(today, parsed.show.dates, SUPPRESSED, {
          timezone: tz,
        });
        expect(
          props.mode === "degraded" ? props.state : props.mode,
          `${name} ${today.toISOString()}`,
        ).toBe(expected.kind);
      }
    }
  });

  it("pass model: an unrestricted viewer's narrowed dates give the same live state as the full dates, for every raw fixture", () => {
    for (const name of RAW_FIXTURES) {
      const { parsed, open } = suppressedAndOpen(name);
      const props = dated(buildPassProps({ ...open, today: TODAY }));
      const tz = resolveShowTimezone(parsed.show.venue);
      expect(props.timezone, name).toBe(tz);
      const days = showDates(parsed);
      const span = [-2, -1, ...days.map((_, i) => i), days.length, days.length + 1];
      for (const i of span) {
        const iso = days[Math.min(Math.max(i, 0), days.length - 1)]!;
        const shift = i < 0 ? i : i >= days.length ? i - days.length + 1 : 0;
        const at = new Date(noonOn(iso, tz).getTime() + shift * 86_400_000);
        expect(
          selectRightNowState(at, props.dates, props.dateRestriction, { timezone: props.timezone }),
          `${name} ${at.toISOString()}`,
        ).toEqual(selectRightNowState(at, parsed.show.dates, { kind: "none" }, { timezone: tz }));
      }
    }
  });

  it("pass model: degraded states carry the state kind and no times, days or grid", () => {
    const cases: Array<[string, ShowForViewer["show"]["dates"], DateRestriction, string]> = [
      [
        "no dates",
        { travelIn: null, set: null, showDays: [], travelOut: null },
        { kind: "none" },
        "dateless",
      ],
      [
        "partial dates",
        { travelIn: "2026-11-01", set: null, showDays: [], travelOut: null },
        { kind: "none" },
        "unknown",
      ],
      [
        "suppressed viewer",
        {
          travelIn: "2026-11-01",
          set: "2026-11-02",
          showDays: ["2026-11-03"],
          travelOut: "2026-11-04",
        },
        SUPPRESSED,
        "viewer_unconfirmed",
      ],
    ];
    for (const [label, dates, restriction, kind] of cases) {
      const data = makeShowForViewer({
        show: { dates },
        rooms: [
          { id: "r1", kind: "gs", name: "Ballroom", set_time: "9:00 AM", strike_time: "5:00 PM" },
        ],
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "Hotel One",
            hotel_address: null,
            names: ["Test Crew"],
            confirmation_no: null,
            check_in: "2026-11-01",
            check_out: "2026-11-04",
            notes: null,
          },
        ],
      });
      data.crewMembers[0]!.dateRestriction = restriction;
      data.crewMembers[0]!.role = "A1";
      const props = buildPassProps({
        data,
        viewer: { kind: "crew", crewMemberId: data.crewMembers[0]!.id },
        today: TODAY,
      });
      const expected = selectRightNowState(TODAY, dates, restriction, {
        timezone: resolveShowTimezone(data.show.venue),
      }).kind;
      expect(expected, label).toBe(kind);
      expect(props, label).toEqual({
        mode: "degraded",
        state: kind,
        showTitle: data.show.title,
        eyebrowRight: `You, ${data.crewMembers[0]!.role}`,
      });
    }
  });
});
