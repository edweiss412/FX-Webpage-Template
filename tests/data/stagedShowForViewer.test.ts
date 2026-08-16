/**
 * Task 1 — `buildStagedShowForViewer`: the pure `parse_result → ShowForViewer`
 * adapter behind the staged crew preview.
 *
 * Spec: docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.2
 * Plan: docs/superpowers/plans/step3-onboarding/2026-08-15-step3-crew-preview.md Task 1
 *
 * Every expectation is DERIVED from the in-test fixture (never a hardcoded
 * literal), and every viewer-dependent transform is compared against the REAL
 * helper the live projection uses (right-answer-wrong-mechanism guard).
 */
import { describe, expect, test } from "vitest";

import {
  buildStagedShowForViewer,
  type StagedShowForViewerResult,
} from "@/lib/data/stagedShowForViewer";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { effectiveViewerDateRestriction } from "@/lib/crew/stageSchedule";
import { hotelVisibleToViewer, type ShowForViewer } from "@/lib/data/getShowForViewer";
import { normalizeDateRestriction } from "@/lib/data/normalizeDateRestriction";
import { resolveTransportOwners } from "@/lib/data/transportOwnerResolve";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import type { DateRestriction, ParseResult } from "@/lib/parser/types";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const FINANCIAL_STRINGS = {
  po: "PO-77421",
  proposal: "PROP-9930",
  invoice: "INV-55012",
  invoice_notes: "Net 30 via ACH",
} as const;

/**
 * A hand-built `ParseResult`, rebuilt per call so mutation cases never leak.
 *
 * Non-vacuousness premise (plan Task 1, coverage closure): EVERY optional nested
 * family is populated, because the generative sweep below only visits paths the
 * fixture actually carries. The sentinel-path assertion pins that premise.
 */
function makeParse(): ParseResult {
  return {
    show: {
      title: "Summit 2026",
      client_label: "Northwind",
      client_contact: {
        name: "Ann Client",
        email: "ann@northwind.example",
        phone: "555-0100",
        officePhone: "555-0101",
        secondary: {
          name: "Bo Second",
          email: "bo@northwind.example",
          phone: "555-0102",
          officePhone: "555-0103",
        },
      },
      template_version: "v4",
      venue: {
        name: "Grand Hall",
        address: "1 Main St, Springfield",
        loadingDock: "Dock C",
        googleLink: "https://maps.example/grand-hall",
        notes: "Freight elevator is slow",
        city: "Springfield",
        timezone: "America/New_York",
      },
      dates: {
        travelIn: "2026-06-22",
        set: "2026-06-23",
        showDays: ["2026-06-24", "2026-06-25"],
        travelOut: "2026-06-26",
        loadIn: "8:00 AM",
        setupTime: "10:00 PM",
      },
      schedule_phases: {
        "2026-06-23": ["Set", "Load In"],
        "2026-06-24": ["Show"],
        "2026-06-25": ["Show", "Strike"],
      },
      event_details: { attendance: "400", dress: "Business casual" },
      agenda_links: [
        {
          label: "Run of Show",
          fileId: "drive-agenda-1",
          extracted: {
            confidence: "high",
            corrections: 0,
            days: [{ dayLabel: "Day 1", date: "2026-06-24", sessions: [] }],
            extractorVersion: 3,
          },
        },
        { label: "Client Deck", url: "https://example.com/deck" },
      ],
      coi_status: "Received",
      ...FINANCIAL_STRINGS,
    },
    crewMembers: [
      {
        // 0 — LEAD with an explicit M/D date restriction.
        name: "Dana Lead",
        email: "dana@fxav.example",
        phone: "555-0200",
        role: "Technical Director",
        role_flags: ["LEAD"],
        date_restriction: { kind: "explicit", days: ["6/24"] },
        stage_restriction: { kind: "none" },
        flight_info: "DL 123 arrives 4:10 PM",
      },
      {
        // 1 — stage-restricted (`ONLY***` shape), no explicit days.
        name: "Ravi Stage",
        email: "ravi@fxav.example",
        phone: "555-0201",
        role: "A1 Show Only",
        role_flags: ["A1", "ONLY"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "explicit", stages: ["Show"] },
        flight_info: null,
      },
      {
        // 2 — unrestricted, neither entitlement flag.
        name: "Mika Plain",
        email: "mika@fxav.example",
        phone: "555-0202",
        role: "V1",
        role_flags: ["V1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
      {
        // 3 — FINANCIALS is the ONLY capability flag.
        name: "Fin Watcher",
        email: "fin@fxav.example",
        phone: "555-0203",
        role: "Producer",
        role_flags: ["FINANCIALS"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Harborview Suites",
        hotel_address: "9 Pier Rd",
        names: ["Dana Lead"],
        confirmation_no: "HV-1001",
        check_in: "2026-06-22",
        check_out: "2026-06-26",
        notes: "Late checkout requested",
      },
      {
        ordinal: 2,
        hotel_name: "Riverside Inn",
        hotel_address: "44 River St",
        names: ["Ravi Stage"],
        confirmation_no: "RI-2002",
        check_in: "2026-06-23",
        check_out: "2026-06-26",
        notes: null,
      },
    ],
    rooms: [
      {
        kind: "gs",
        name: "MABEL 1",
        dimensions: "40x60",
        floor: "2",
        setup: "Theater",
        set_time: "6/23 @ 9:00 AM",
        show_time: "6/24 @ 8:00 AM",
        strike_time: "6/25 @ 6:00 PM",
        audio: "L/R PA",
        video: "2x LED",
        lighting: "Wash",
        scenic: "Stage skirt",
        power: "2x 20A",
        digital_signage: "None",
        other: null,
        notes: "Main room",
      },
      {
        // Duplicate NAME on purpose: surrogate ids must stay collision-free.
        kind: "breakout",
        name: "MABEL 1",
        dimensions: "20x30",
        floor: "3",
        setup: "Classroom",
        set_time: "6/23 @ 1:00 PM",
        show_time: "6/24 @ 10:00 AM",
        strike_time: "6/25 @ 4:00 PM",
        audio: "Single speaker",
        video: "1x LED",
        lighting: null,
        scenic: null,
        power: "1x 20A",
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: {
      driver_name: "Mika Plain",
      driver_phone: "555-0300",
      driver_email: "mika@fxav.example",
      loadout_name: "Ravi Stage",
      loadout_phone: "555-0301",
      loadout_email: "ravi@fxav.example",
      vehicle: "Sprinter",
      license_plate: "FXAV-1",
      color: "White",
      parking: "Dock C",
      schedule: [
        {
          stage: "Load In",
          date: "2026-06-23",
          time: "8:00 AM",
          assigned_names: ["Dana Lead"],
        },
      ],
      notes: "Van returns 6/26",
    },
    contacts: [
      {
        kind: "venue",
        name: "Vera Venue",
        email: "vera@grandhall.example",
        phone: "555-0400",
        notes: "Text first",
      },
      {
        kind: "in_house_av",
        name: "Ivan House",
        email: "ivan@grandhall.example",
        phone: "555-0401",
        notes: null,
      },
    ],
    pullSheet: [
      {
        caseLabel: "Case A",
        items: [
          { qty: 2, cat: "Audio", subCat: "Mics", item: "SM58" },
          { qty: 1, cat: "Video", subCat: "Switcher", item: "TriCaster" },
        ],
      },
    ],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    runOfShow: {
      "2026-06-24": {
        entries: [
          { start: "8:00 AM", finish: "9:00 AM", trt: "1h", title: "Doors", room: "MABEL 1" },
        ],
        showStart: "8:00 AM",
        showEnd: "6:00 PM",
        window: { start: "8:00 AM", end: "6:00 PM" },
      },
      "2026-06-25": {
        entries: [{ start: "9:00 AM", title: "General Session" }],
        showStart: "9:00 AM",
        showEnd: null,
        window: null,
      },
      // A key OUTSIDE the aggregate-day domain: proves the source ∩ aggregate leg.
      "2026-06-30": {
        entries: [{ start: "10:00 AM", title: "Ghost day" }],
        showStart: null,
        showEnd: null,
        window: null,
      },
    },
    hardErrors: [],
  };
}

type Opts = Parameters<typeof buildStagedShowForViewer>[1];

const BASE_OPTS: Opts = {
  driveFileId: "drive-file-1",
  sourceAnchors: { schedule: { title: "SCHEDULE", gid: 12 } },
  stagedModifiedTime: "2026-06-20T10:00:00.000Z",
  checkedAt: "2026-06-21T09:00:00.000Z",
  requestedViewerId: null,
};

function build(parse: ParseResult, overrides: Partial<Opts> = {}): StagedShowForViewerResult {
  return buildStagedShowForViewer(parse, { ...BASE_OPTS, ...overrides });
}

function ok(result: StagedShowForViewerResult): Extract<StagedShowForViewerResult, { kind: "ok" }> {
  expect(result.kind).toBe("ok");
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return result;
}

// ---------------------------------------------------------------------------
// Grain walker — the reusable closure assertion (plan Task 1, coverage closure)
// ---------------------------------------------------------------------------

const NULLABLE_STRING = (v: unknown): boolean => v === null || typeof v === "string";
const ROOM_KINDS = new Set(["gs", "breakout", "additional"]);
const CONTACT_KINDS = new Set(["venue", "in_house_av"]);
const RESTRICTION_KINDS = new Set(["explicit", "unknown_asterisk", "none"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Walks the projection asserting every field matches the ShowForViewer runtime grain. */
function assertShowForViewerGrain(data: ShowForViewer): void {
  // --- show -----------------------------------------------------------------
  expect(isPlainObject(data.show)).toBe(true);
  expect(typeof data.show.title).toBe("string");
  expect(typeof data.show.client_label).toBe("string");
  expect(typeof data.show.template_version).toBe("string");
  expect(NULLABLE_STRING(data.show.coi_status)).toBe(true);
  for (const field of ["po", "proposal", "invoice", "invoice_notes"] as const) {
    expect(data.show[field]).toBeNull();
  }

  const dates = data.show.dates;
  expect(isPlainObject(dates)).toBe(true);
  expect(Array.isArray(dates.showDays)).toBe(true);
  for (const d of dates.showDays) expect(typeof d).toBe("string");
  for (const field of ["travelIn", "set", "travelOut"] as const) {
    expect(NULLABLE_STRING(dates[field])).toBe(true);
  }

  expect(isPlainObject(data.show.schedule_phases)).toBe(true);
  for (const phases of Object.values(data.show.schedule_phases)) {
    expect(Array.isArray(phases)).toBe(true);
    for (const p of phases) expect(typeof p).toBe("string");
  }

  expect(isPlainObject(data.show.event_details)).toBe(true);
  for (const v of Object.values(data.show.event_details)) expect(typeof v).toBe("string");

  expect(Array.isArray(data.show.agenda_links)).toBe(true);
  for (const link of data.show.agenda_links) {
    expect(isPlainObject(link)).toBe(true);
    expect(typeof link.label).toBe("string");
    // The §2.2 strip is part of the grain: no proxy-authorizing keys survive.
    expect(Object.hasOwn(link, "fileId")).toBe(false);
    expect(Object.hasOwn(link, "extracted")).toBe(false);
    if (Object.hasOwn(link, "url")) expect(typeof link.url).toBe("string");
  }

  const contact = data.show.client_contact;
  if (contact !== null) {
    expect(typeof contact.name).toBe("string");
    expect(NULLABLE_STRING(contact.email)).toBe(true);
    expect(NULLABLE_STRING(contact.phone)).toBe(true);
    const secondary = contact.secondary;
    if (secondary !== null && secondary !== undefined) {
      expect(typeof secondary.name).toBe("string");
      expect(NULLABLE_STRING(secondary.email)).toBe(true);
      expect(NULLABLE_STRING(secondary.phone)).toBe(true);
    }
  }

  const venue = data.show.venue;
  if (venue !== null) {
    expect(typeof venue.name).toBe("string");
    expect(typeof venue.address).toBe("string");
    for (const field of ["loadingDock", "googleLink", "notes", "city", "timezone"] as const) {
      const value = venue[field];
      if (value !== undefined) expect(NULLABLE_STRING(value)).toBe(true);
    }
  }

  // --- crew -----------------------------------------------------------------
  expect(Array.isArray(data.crewMembers)).toBe(true);
  for (const c of data.crewMembers) {
    expect(typeof c.id).toBe("string");
    expect(typeof c.name).toBe("string");
    expect(typeof c.role).toBe("string");
    expect(NULLABLE_STRING(c.email)).toBe(true);
    expect(NULLABLE_STRING(c.phone)).toBe(true);
    expect(Array.isArray(c.roleFlags)).toBe(true);
    for (const f of c.roleFlags) expect(typeof f).toBe("string");
    expect(RESTRICTION_KINDS.has(c.dateRestriction.kind)).toBe(true);
    if (c.dateRestriction.kind === "explicit") {
      expect(Array.isArray(c.dateRestriction.days)).toBe(true);
      for (const d of c.dateRestriction.days) expect(typeof d).toBe("string");
    }
    expect(["explicit", "none"]).toContain(c.stageRestriction.kind);
    if (c.stageRestriction.kind === "explicit") {
      expect(Array.isArray(c.stageRestriction.stages)).toBe(true);
      for (const s of c.stageRestriction.stages) expect(typeof s).toBe("string");
    }
  }

  // --- hotels ---------------------------------------------------------------
  expect(Array.isArray(data.hotelReservations)).toBe(true);
  for (const h of data.hotelReservations) {
    expect(typeof h.ordinal).toBe("number");
    expect(Array.isArray(h.names)).toBe(true);
    for (const n of h.names) expect(typeof n).toBe("string");
    for (const field of [
      "hotel_name",
      "hotel_address",
      "confirmation_no",
      "check_in",
      "check_out",
      "notes",
    ] as const) {
      expect(NULLABLE_STRING(h[field])).toBe(true);
    }
  }

  // --- rooms ----------------------------------------------------------------
  expect(Array.isArray(data.rooms)).toBe(true);
  for (const r of data.rooms) {
    expect(typeof r.id).toBe("string");
    expect(typeof r.name).toBe("string");
    expect(ROOM_KINDS.has(r.kind)).toBe(true);
    for (const field of [
      "dimensions",
      "floor",
      "setup",
      "set_time",
      "show_time",
      "strike_time",
      "audio",
      "video",
      "lighting",
      "scenic",
      "power",
      "digital_signage",
      "other",
      "notes",
    ] as const) {
      expect(NULLABLE_STRING(r[field])).toBe(true);
    }
  }

  // --- transportation -------------------------------------------------------
  const t = data.transportation;
  if (t !== null) {
    for (const field of [
      "driver_name",
      "driver_phone",
      "driver_email",
      "loadout_name",
      "loadout_phone",
      "loadout_email",
      "vehicle",
      "license_plate",
      "color",
      "parking",
      "notes",
    ] as const) {
      expect(NULLABLE_STRING(t[field])).toBe(true);
    }
    expect(Array.isArray(t.schedule)).toBe(true);
    for (const leg of t.schedule) {
      expect(typeof leg.stage).toBe("string");
      expect(NULLABLE_STRING(leg.date)).toBe(true);
      expect(NULLABLE_STRING(leg.time)).toBe(true);
      expect(Array.isArray(leg.assigned_names)).toBe(true);
      for (const n of leg.assigned_names) expect(typeof n).toBe("string");
    }
  }

  // --- contacts / pull sheet -------------------------------------------------
  expect(Array.isArray(data.contacts)).toBe(true);
  for (const c of data.contacts) {
    expect(CONTACT_KINDS.has(c.kind)).toBe(true);
    for (const field of ["name", "email", "phone", "notes"] as const) {
      expect(NULLABLE_STRING(c[field])).toBe(true);
    }
  }

  if (data.pullSheet !== null) {
    expect(Array.isArray(data.pullSheet)).toBe(true);
    for (const kase of data.pullSheet) {
      expect(typeof kase.caseLabel).toBe("string");
      expect(Array.isArray(kase.items)).toBe(true);
      for (const item of kase.items) {
        expect(typeof item.item).toBe("string");
        expect(item.qty === null || typeof item.qty === "number").toBe(true);
        expect(NULLABLE_STRING(item.cat)).toBe(true);
        expect(NULLABLE_STRING(item.subCat)).toBe(true);
      }
    }
  }

  // --- run of show ----------------------------------------------------------
  if (data.runOfShow !== null) {
    expect(isPlainObject(data.runOfShow)).toBe(true);
    for (const day of Object.values(data.runOfShow)) {
      expect(Array.isArray(day.entries)).toBe(true);
      for (const e of day.entries) {
        expect(typeof e.start).toBe("string");
        expect(typeof e.title).toBe("string");
        for (const field of ["finish", "trt", "room", "av", "kind"] as const) {
          if (e[field] !== undefined) expect(typeof e[field]).toBe("string");
        }
      }
      expect(NULLABLE_STRING(day.showStart)).toBe(true);
      expect(NULLABLE_STRING(day.showEnd)).toBe(true);
      if (day.window !== null) {
        expect(typeof day.window.start).toBe("string");
        expect(typeof day.window.end).toBe("string");
      }
    }
  }

  // --- scalars / viewer-derived ---------------------------------------------
  expect(data.diagrams).toBeNull();
  expect(typeof data.openingReelHasVideo).toBe("boolean");
  expect(isPlainObject(data.tileErrors)).toBe(true);
  expect(NULLABLE_STRING(data.lastSyncedAt)).toBe(true);
  expect(NULLABLE_STRING(data.lastCheckedAt)).toBe(true);
  expect(NULLABLE_STRING(data.lastSyncStatus)).toBe(true);
  expect(typeof data.viewerVersionToken).toBe("string");
  expect(NULLABLE_STRING(data.viewerName)).toBe(true);
  expect(NULLABLE_STRING(data.viewerId)).toBe(true);
  expect(NULLABLE_STRING(data.viewerFlightInfo)).toBe(true);
  expect(Array.isArray(data.viewerNameAliases)).toBe(true);
  for (const a of data.viewerNameAliases) expect(typeof a).toBe("string");
  expect(Array.isArray(data.transportationOwnerIds)).toBe(true);
  for (const id of data.transportationOwnerIds) expect(typeof id).toBe("string");
  expect(NULLABLE_STRING(data.driveFileId)).toBe(true);
  expect(isPlainObject(data.sourceAnchors)).toBe(true);
  if (data.financials !== undefined) {
    for (const field of ["po", "proposal", "invoice", "invoice_notes"] as const) {
      expect(NULLABLE_STRING(data.financials[field])).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// Leaf-path enumeration + mutation (generative malformation sweep)
// ---------------------------------------------------------------------------

/** Every LEAF path of a value: objects recurse into every key, arrays into EVERY index. */
function enumerateLeafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    value.forEach((el, i) => {
      out.push(...enumerateLeafPaths(el, prefix === "" ? String(i) : `${prefix}.${i}`));
    });
    return out;
  }
  if (isPlainObject(value)) {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      out.push(...enumerateLeafPaths(v, prefix === "" ? k : `${prefix}.${k}`));
    }
    return out;
  }
  return prefix === "" ? [] : [prefix];
}

function readAtPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const seg of path.split(".")) {
    if (Array.isArray(cursor)) cursor = cursor[Number(seg)];
    else if (isPlainObject(cursor)) cursor = cursor[seg];
    else return undefined;
  }
  return cursor;
}

function writeAtPath(root: unknown, path: string, value: unknown): void {
  const segs = path.split(".");
  const last = segs.pop()!;
  let cursor: unknown = root;
  for (const seg of segs) {
    if (Array.isArray(cursor)) cursor = cursor[Number(seg)];
    else if (isPlainObject(cursor)) cursor = cursor[seg];
    else throw new Error(`unreachable path segment ${seg} in ${path}`);
  }
  if (Array.isArray(cursor)) (cursor as unknown[])[Number(last)] = value;
  else if (isPlainObject(cursor)) cursor[last] = value;
  else throw new Error(`cannot write ${path}`);
}

// ---------------------------------------------------------------------------
// Derivation helpers (expectations come from the fixture, never literals)
// ---------------------------------------------------------------------------

function effectiveRestrictionFor(parse: ParseResult, index: number): DateRestriction {
  const member = parse.crewMembers[index]!;
  return effectiveViewerDateRestriction(
    parse.show.dates,
    parse.show.schedule_phases,
    normalizeDateRestriction(member.date_restriction, parse.show.dates),
    member.stage_restriction,
  );
}

/** The projection's own three-way intersection, re-derived in-test. */
function expectedRunOfShowKeys(parse: ParseResult, index: number): string[] {
  const aggregate = new Set(aggregateDays(parse.show.dates).map((d) => d.date));
  const restriction = effectiveRestrictionFor(parse, index);
  const sourceKeys = Object.keys(parse.runOfShow ?? {});
  return sourceKeys
    .filter((key) => {
      if (!aggregate.has(key)) return false;
      if (restriction.kind === "unknown_asterisk") return false;
      if (restriction.kind === "explicit") return restriction.days.includes(key);
      return true;
    })
    .sort();
}

const VIEWER_IDS = ["staged-crew-0", "staged-crew-1", "staged-crew-2", "staged-crew-3"] as const;

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe("buildStagedShowForViewer", () => {
  test("mints deterministic surrogate ids that resolveViewerContext accepts", () => {
    const parse = makeParse();
    const result = ok(build(parse));

    expect(result.roster.map((r) => r.id)).toEqual([...VIEWER_IDS]);
    expect(result.roster.map((r) => r.name)).toEqual(parse.crewMembers.map((c) => c.name));
    expect(result.roster.map((r) => r.role)).toEqual(parse.crewMembers.map((c) => c.role));
    expect(result.data.rooms.map((r) => r.id)).toEqual(["staged-room-0", "staged-room-1"]);
    // Duplicate room NAMES must not collide on id.
    expect(new Set(result.data.rooms.map((r) => r.id)).size).toBe(result.data.rooms.length);
    expect(new Set(result.data.rooms.map((r) => r.name)).size).toBe(1);

    for (const entry of result.roster) {
      expect(() =>
        resolveViewerContext({ kind: "admin_preview", crewMemberId: entry.id }, result.data),
      ).not.toThrow();
    }
  });

  test("filters hotel reservations to the selected viewer, mirroring the projection", () => {
    const parse = makeParse();
    const result = ok(build(parse, { requestedViewerId: "staged-crew-0" }));

    const expected = parse.hotelReservations.filter((res) =>
      hotelVisibleToViewer(res, [parse.crewMembers[0]!.name]),
    );
    // Premise: the filter is discriminating on this fixture.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(parse.hotelReservations.length);

    expect(result.data.hotelReservations.map((h) => h.hotel_name)).toEqual(
      expected.map((h) => h.hotel_name),
    );

    const other = ok(build(parse, { requestedViewerId: "staged-crew-1" }));
    expect(other.data.hotelReservations.map((h) => h.hotel_name)).not.toEqual(
      expected.map((h) => h.hotel_name),
    );
  });

  test("normalizes an explicit M/D date restriction to ISO through the real helper", () => {
    const parse = makeParse();
    const result = ok(build(parse));

    const expected = normalizeDateRestriction(
      parse.crewMembers[0]!.date_restriction,
      parse.show.dates,
    );
    expect(expected.kind).toBe("explicit");
    expect(expected.kind === "explicit" ? expected.days.length : 0).toBeGreaterThan(0);

    expect(result.data.crewMembers[0]!.dateRestriction).toEqual(expected);
  });

  test("folds a stage restriction exactly as effectiveViewerDateRestriction does", () => {
    const parse = makeParse();
    const result = ok(build(parse));

    const expected = effectiveRestrictionFor(parse, 1);
    expect(expected.kind).toBe("explicit");
    expect(expected.kind === "explicit" ? expected.days.length : 0).toBeGreaterThan(0);

    expect(result.data.crewMembers[1]!.dateRestriction).toEqual(expected);
    expect(result.data.crewMembers[1]!.stageRestriction).toEqual(
      parse.crewMembers[1]!.stage_restriction,
    );
  });

  test("gates runOfShow to the three-way intersection for every viewer", () => {
    const parse = makeParse();

    // Premise: the fixture carries a source key OUTSIDE the aggregate domain, so
    // "all aggregate days" and "all source keys" both fail this assertion.
    const aggregate = new Set(aggregateDays(parse.show.dates).map((d) => d.date));
    expect(Object.keys(parse.runOfShow ?? {}).some((k) => !aggregate.has(k))).toBe(true);

    for (const [index, viewerId] of VIEWER_IDS.entries()) {
      const result = ok(build(parse, { requestedViewerId: viewerId }));
      const expected = expectedRunOfShowKeys(parse, index);
      expect(expected.length).toBeGreaterThan(0);
      expect(Object.keys(result.data.runOfShow ?? {}).sort()).toEqual(expected);
    }

    // The restricted viewer sees strictly fewer days than the unrestricted one.
    expect(expectedRunOfShowKeys(parse, 0).length).toBeLessThan(
      expectedRunOfShowKeys(parse, 2).length,
    );
  });

  test("returns financials only to entitled viewers and nulls the show scalars for all", () => {
    const parse = makeParse();
    const expectedFinancials = {
      po: parse.show.po,
      proposal: parse.show.proposal,
      invoice: parse.show.invoice,
      invoice_notes: parse.show.invoice_notes,
    };

    for (const [index, viewerId] of VIEWER_IDS.entries()) {
      const result = ok(build(parse, { requestedViewerId: viewerId }));
      const entitled = financialsVisible(parse.crewMembers[index]!.role_flags, false);

      if (entitled) {
        expect(result.data.financials).toEqual(expectedFinancials);
      } else {
        expect(result.data.financials).toBeUndefined();
      }

      for (const field of ["po", "proposal", "invoice", "invoice_notes"] as const) {
        expect(result.data.show[field]).toBeNull();
      }
    }

    // Premise: the fixture exercises BOTH entitlement branches and the negative.
    expect(financialsVisible(parse.crewMembers[0]!.role_flags, false)).toBe(true); // LEAD
    expect(financialsVisible(parse.crewMembers[3]!.role_flags, false)).toBe(true); // FINANCIALS
    expect(financialsVisible(parse.crewMembers[2]!.role_flags, false)).toBe(false);

    // No financial string survives ANYWHERE in a non-entitled viewer's projection.
    const plain = ok(build(parse, { requestedViewerId: "staged-crew-2" }));
    const serialized = JSON.stringify(plain.data);
    for (const value of Object.values(FINANCIAL_STRINGS)) {
      expect(serialized).not.toContain(value);
    }
  });

  test("strips fileId and extracted from every agenda link", () => {
    const parse = makeParse();
    // Premise: the fixture carries both a fileId-bearing and a url-only entry.
    expect(parse.show.agenda_links.some((l) => typeof l.fileId === "string")).toBe(true);
    expect(parse.show.agenda_links.some((l) => typeof l.url === "string")).toBe(true);

    const result = ok(build(parse));
    expect(result.data.show.agenda_links).toHaveLength(parse.show.agenda_links.length);
    for (const link of result.data.show.agenda_links) {
      expect(Object.hasOwn(link, "fileId")).toBe(false);
      expect(Object.hasOwn(link, "extracted")).toBe(false);
    }
    expect(result.data.show.agenda_links.map((l) => l.label)).toEqual(
      parse.show.agenda_links.map((l) => l.label),
    );
    expect(result.data.show.agenda_links[1]!.url).toBe(parse.show.agenda_links[1]!.url);
  });

  test("applies the defaulted fields from opts and constants", () => {
    const parse = makeParse();
    const result = ok(build(parse));

    expect(result.data.tileErrors).toEqual({});
    expect(result.data.diagrams).toBeNull();
    expect(result.data.openingReelHasVideo).toBe(false);
    expect(result.data.lastCheckedAt).toBe(BASE_OPTS.checkedAt);
    expect(result.data.lastSyncedAt).toBe(BASE_OPTS.stagedModifiedTime);
    expect(result.data.lastSyncStatus).toBeNull();
    expect(result.data.viewerVersionToken).toBe("staged-preview");
    expect(result.data.driveFileId).toBe(BASE_OPTS.driveFileId);
    expect(result.data.sourceAnchors).toEqual(BASE_OPTS.sourceAnchors);

    const bare = ok(
      build(parse, { driveFileId: null, sourceAnchors: {}, stagedModifiedTime: null }),
    );
    expect(bare.data.driveFileId).toBeNull();
    expect(bare.data.sourceAnchors).toEqual({});
    expect(bare.data.lastSyncedAt).toBeNull();
    expect(bare.data.lastCheckedAt).toBe(BASE_OPTS.checkedAt);
  });

  test("selects the requested viewer and falls back to roster index 0", () => {
    const parse = makeParse();

    const chosen = ok(build(parse, { requestedViewerId: "staged-crew-1" }));
    expect(chosen.selectedId).toBe("staged-crew-1");
    expect(chosen.data.viewerId).toBe("staged-crew-1");
    expect(chosen.data.viewerName).toBe(parse.crewMembers[1]!.name);
    expect(chosen.data.viewerNameAliases).toEqual([parse.crewMembers[1]!.name]);
    expect(chosen.data.viewerFlightInfo).toBe(parse.crewMembers[1]!.flight_info);

    for (const requested of [null, "", "staged-crew-99", "not-a-surrogate"]) {
      const fallback = ok(build(parse, { requestedViewerId: requested }));
      expect(fallback.selectedId).toBe("staged-crew-0");
      expect(fallback.data.viewerName).toBe(parse.crewMembers[0]!.name);
      expect(fallback.data.viewerFlightInfo).toBe(parse.crewMembers[0]!.flight_info);
    }
  });

  test("returns empty_roster when the staged parse has no crew members", () => {
    const parse = makeParse();
    parse.crewMembers = [];
    expect(build(parse).kind).toBe("empty_roster");
  });

  test("resolves transportationOwnerIds through the real resolver", () => {
    const parse = makeParse();
    const result = ok(build(parse));

    const expected = resolveTransportOwners(parse.transportation, result.roster);
    expect(expected.length).toBeGreaterThan(0);
    expect(result.data.transportationOwnerIds).toEqual(expected);
  });

  describe("normalizers (one case per table row)", () => {
    const okData = (parse: ParseResult): ShowForViewer => {
      const result = ok(build(parse));
      assertShowForViewerGrain(result.data);
      return result.data;
    };

    test("drops a non-object crew entry and one lacking a string name", () => {
      const parse = makeParse();
      (parse.crewMembers as unknown[])[1] = null;
      (parse.crewMembers as unknown[])[2] = { ...parse.crewMembers[3]!, name: 7 };
      const data = okData(parse);
      expect(data.crewMembers.map((c) => c.name)).toEqual([
        makeParse().crewMembers[0]!.name,
        makeParse().crewMembers[3]!.name,
      ]);
      // Surrogate ids follow ROSTER order after drops.
      expect(data.crewMembers.map((c) => c.id)).toEqual(["staged-crew-0", "staged-crew-1"]);
    });

    test("coerces role_flags: non-array to [] and drops non-string elements", () => {
      const parse = makeParse();
      (parse.crewMembers[2] as unknown as Record<string, unknown>).role_flags = null;
      (parse.crewMembers[3] as unknown as Record<string, unknown>).role_flags = [null, "LEAD"];
      const data = okData(parse);
      expect(data.crewMembers[2]!.roleFlags).toEqual([]);
      expect(data.crewMembers[3]!.roleFlags).toEqual(["LEAD"]);
      // The element-drop arm keeps the LEAD entitlement.
      const entitled = ok(build(parse, { requestedViewerId: "staged-crew-3" }));
      expect(entitled.data.financials).not.toBeUndefined();
    });

    test("falls back to kind none on a malformed restriction", () => {
      const parse = makeParse();
      (parse.crewMembers[0] as unknown as Record<string, unknown>).date_restriction = "garbage";
      (parse.crewMembers[1] as unknown as Record<string, unknown>).stage_restriction = 42;
      const data = okData(parse);
      expect(data.crewMembers[0]!.dateRestriction).toEqual({ kind: "none" });
      expect(data.crewMembers[1]!.stageRestriction).toEqual({ kind: "none" });
    });

    test("nulls non-string crew scalars and empties a non-string role", () => {
      const parse = makeParse();
      const member = parse.crewMembers[0] as unknown as Record<string, unknown>;
      member.email = 1;
      member.phone = {};
      member.role = 5;
      member.flight_info = [];
      const data = okData(parse);
      expect(data.crewMembers[0]!.email).toBeNull();
      expect(data.crewMembers[0]!.phone).toBeNull();
      expect(data.crewMembers[0]!.role).toBe("");
      expect(data.viewerFlightInfo).toBeNull();
    });

    test("drops a room without a string name and nulls non-string room times", () => {
      const parse = makeParse();
      (parse.rooms[0] as unknown as Record<string, unknown>).name = null;
      (parse.rooms[1] as unknown as Record<string, unknown>).set_time = 42;
      const data = okData(parse);
      expect(data.rooms).toHaveLength(1);
      expect(data.rooms[0]!.set_time).toBeNull();
      expect(data.rooms[0]!.id).toBe("staged-room-0");
    });

    test("drops a non-object hotel entry, keeps one with non-string nullable fields", () => {
      const parse = makeParse();
      (parse.hotelReservations as unknown[])[1] = "nope";
      const hotel = parse.hotelReservations[0] as unknown as Record<string, unknown>;
      hotel.confirmation_no = 12;
      hotel.notes = {};
      const data = okData(parse);
      expect(data.hotelReservations).toHaveLength(1);
      expect(data.hotelReservations[0]!.confirmation_no).toBeNull();
      expect(data.hotelReservations[0]!.notes).toBeNull();
    });

    test("coerces hotel names: non-array to [] and drops non-string elements", () => {
      const parse = makeParse();
      (parse.hotelReservations[0] as unknown as Record<string, unknown>).names = [
        null,
        parse.crewMembers[0]!.name,
      ];
      (parse.hotelReservations[1] as unknown as Record<string, unknown>).names = null;
      const data = okData(parse);
      expect(data.hotelReservations).toHaveLength(1);
      expect(data.hotelReservations[0]!.names).toEqual([makeParse().crewMembers[0]!.name]);
    });

    test("drops a hotel entry whose ordinal is not a number", () => {
      const parse = makeParse();
      (parse.hotelReservations[0] as unknown as Record<string, unknown>).ordinal = "1";
      const data = okData(parse);
      expect(data.hotelReservations).toHaveLength(0);
    });

    test("drops a non-object contact entry", () => {
      const parse = makeParse();
      (parse.contacts as unknown[])[0] = 9;
      const data = okData(parse);
      expect(data.contacts).toHaveLength(1);
    });

    test("drops a non-object pull-sheet case", () => {
      const parse = makeParse();
      (parse.pullSheet as unknown[])!.push(null);
      const data = okData(parse);
      expect(data.pullSheet).toHaveLength(1);
    });

    test("nulls transportation entirely when it is not an object", () => {
      const parse = makeParse();
      (parse as unknown as Record<string, unknown>).transportation = "van";
      const data = okData(parse);
      expect(data.transportation).toBeNull();
      expect(data.transportationOwnerIds).toEqual([]);
    });

    test("drops a non-object runOfShow day and coerces its nested fields", () => {
      const parse = makeParse();
      (parse.runOfShow as unknown as Record<string, unknown>)["2026-06-24"] = 5;
      const day = parse.runOfShow!["2026-06-25"] as unknown as Record<string, unknown>;
      day.entries = null;
      day.showStart = 7;
      day.window = { start: "9:00 AM", end: 3 };
      // Viewer 2 is unrestricted, so day gating cannot mask the drop under test.
      const result = ok(build(parse, { requestedViewerId: "staged-crew-2" }));
      assertShowForViewerGrain(result.data);
      const data = result.data;
      expect(Object.keys(data.runOfShow ?? {})).toEqual(["2026-06-25"]);
      expect(data.runOfShow!["2026-06-25"]!.entries).toEqual([]);
      expect(data.runOfShow!["2026-06-25"]!.showStart).toBeNull();
      expect(data.runOfShow!["2026-06-25"]!.window).toBeNull();
    });

    test("drops a non-object runOfShow entry element", () => {
      const parse = makeParse();
      (parse.runOfShow!["2026-06-24"]!.entries as unknown[]).unshift(42);
      const data = okData(parse);
      expect(data.runOfShow!["2026-06-24"]!.entries).toHaveLength(1);
    });

    test("coerces agenda_links: non-array to [] and drops non-object entries", () => {
      const parse = makeParse();
      (parse.show.agenda_links as unknown[])[0] = 3;
      const dropped = okData(parse);
      expect(dropped.show.agenda_links).toHaveLength(1);

      const parse2 = makeParse();
      (parse2.show as unknown as Record<string, unknown>).agenda_links = "links";
      const emptied = okData(parse2);
      expect(emptied.show.agenda_links).toEqual([]);
    });

    test("coerces schedule_phases and event_details to their grain", () => {
      const parse = makeParse();
      (parse.show.schedule_phases as unknown as Record<string, unknown>)["2026-06-24"] = "Show";
      (parse.show.schedule_phases as unknown as Record<string, unknown>)["2026-06-25"] = [
        null,
        "Show",
      ];
      (parse.show.event_details as unknown as Record<string, unknown>).attendance = 400;
      const data = okData(parse);
      expect(data.show.schedule_phases["2026-06-24"]).toEqual([]);
      expect(data.show.schedule_phases["2026-06-25"]).toEqual(["Show"]);
      expect(data.show.event_details.attendance).toBeUndefined();
    });

    test("returns decode_error when show.dates fails its union shape", () => {
      const parse = makeParse();
      (parse.show as unknown as Record<string, unknown>).dates = { showDays: "nope" };
      expect(build(parse).kind).toBe("decode_error");

      const parse2 = makeParse();
      (parse2.show.dates as unknown as Record<string, unknown>).showDays = [42];
      expect(build(parse2).kind).toBe("decode_error");

      const parse3 = makeParse();
      (parse3.show as unknown as Record<string, unknown>).dates = null;
      expect(build(parse3).kind).toBe("decode_error");
    });
  });

  describe("generative malformation sweep", () => {
    const SENTINEL_PATHS = [
      "show.dates.showDays.0",
      "show.schedule_phases.2026-06-24.0",
      "show.client_contact.secondary.name",
      "show.agenda_links.1.url",
      // The plan's shorthand `transportation.assigned_names.0` names this leaf:
      // assigned_names lives on each schedule leg (TransportScheduleEntry).
      "transportation.schedule.0.stage",
      "transportation.schedule.0.assigned_names.0",
      "pullSheet.0.items.0.cat",
      "crewMembers.0.date_restriction.days.0",
      "crewMembers.1.stage_restriction.stages.0",
    ];

    test("the recursive walk reaches every sentinel leaf (non-vacuousness premise)", () => {
      const paths = new Set(enumerateLeafPaths(makeParse()));
      for (const sentinel of SENTINEL_PATHS) {
        expect(Array.from(paths)).toContain(sentinel);
      }
      expect(paths.size).toBeGreaterThan(100);
    });

    test("every wrong-typed leaf yields a grain-valid projection or a dates decode_error", () => {
      const paths = enumerateLeafPaths(makeParse());
      for (const path of paths) {
        const parse = makeParse();
        const current = readAtPath(parse, path);
        // Always a WRONG-typed scalar for the leaf under test.
        writeAtPath(parse, path, typeof current === "number" ? "x" : 42);

        const result = build(parse);
        if (result.kind === "decode_error") {
          expect(path.startsWith("show.dates")).toBe(true);
          continue;
        }
        expect(result.kind, `path ${path} produced ${result.kind}`).toBe("ok");
        if (result.kind !== "ok") continue;
        assertShowForViewerGrain(result.data);
      }
    });
  });
});
