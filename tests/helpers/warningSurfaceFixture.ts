// tests/helpers/warningSurfaceFixture.ts
//
// The shared published fixture for the warning-surface-trim suites (plan
// docs/superpowers/plans/2026-07-20-warning-surface-trim/plan.md; spec §12).
//
// A PLAIN MODULE, not a test file: several suites import it, and importing a
// test file would re-register its tests in each consumer.
//
// Composition is deliberate and every count is asymmetric, so no wrong filter
// can produce a right-looking cardinality:
//
//   3 info rows            — the panel's only residents after the trim
//   2 active warn, MAPPED  — to two DIFFERENT sections (crew, rooms), so a
//                            single-fallback-container implementation fails
//                            placement assertions
//   2 active warn, UNMAPPED— routed to the fallback `warnings` bucket, whose
//                            cards render directly BELOW the panel body
//   1 ignored warn, mapped
//   1 ignored warn, unmapped
//
// One mapped row is UNKNOWN_ROLE_TOKEN so a recognize-role control is in scope,
// and one is a use-raw-eligible structural code, so no control assertion can
// pass vacuously (plan review R3a finding 3).
//
// Every warning carries a `rawSnippet`: `warningFingerprint` returns null
// without one, so a snippet-less fixture silently makes "ignored" assertions
// ignore nothing.
import type { ParseWarning } from "@/lib/parser/types";

export const FIXTURE_SLUG = "warning-surface-fixture-show";
export const FIXTURE_SHOW_ID = "44444444-4444-4444-4444-444444444444";
export const FIXTURE_DRIVE_FILE_ID = "DRIVE_WARNING_FIXTURE";

/** Info-severity: never routed to a section, so the panel is its only home. */
function infoWarning(code: string, n: number): ParseWarning {
  return {
    severity: "info",
    code,
    message: `${code} note ${n}`,
    rawSnippet: `Info Row ${n} | value ${n}`,
  } as ParseWarning;
}

/** Warn routed to `crew` via its blockRef. */
function crewWarning(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `unknown role for ${name}`,
    rawSnippet: `Role | ${name}`,
    blockRef: { kind: "crew", name },
  } as ParseWarning;
}

/** Warn routed to `rooms` via its blockRef.
 *
 *  The kind is `rooms`, NOT `room`: `KIND_TO_SECTION`
 *  (lib/admin/step3SectionStatus.ts:22) keys on the plural, and the singular
 *  falls through to the fallback bucket. An earlier draft of this fixture used
 *  the singular, which silently made the "Elsewhere" state unreachable and the
 *  two mapped sections one. */
function roomWarning(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: `ambiguous room header ${name}`,
    rawSnippet: `Room | ${name}`,
    blockRef: { kind: "rooms", name },
  } as ParseWarning;
}

/** Warn with no routable blockRef, so it lands in the fallback bucket. */
function unmappedWarning(n: number): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: `unrecognized row ${n}`,
    rawSnippet: `Mystery Row ${n} | value ${n}`,
  } as ParseWarning;
}

export const INFO_WARNINGS: readonly ParseWarning[] = [
  infoWarning("AGENDA_PDF_UNREADABLE", 1),
  infoWarning("AGENDA_SCHEDULE_LOW_CONFIDENCE", 2),
  infoWarning("HOTEL_GUEST_SPLIT_AMBIGUOUS", 3),
];

export const MAPPED_WARNINGS: readonly ParseWarning[] = [
  crewWarning("Alex Kim"),
  roomWarning("Salon B"),
];

export const UNMAPPED_WARNINGS: readonly ParseWarning[] = [unmappedWarning(1), unmappedWarning(2)];

/** The two rows the fixture marks ignored (one mapped, one unmapped). */
export const IGNORED_WARNINGS: readonly ParseWarning[] = [
  crewWarning("Jordan Vale"),
  unmappedWarning(3),
];

/** Every warning, in a deliberately interleaved order so no assertion can
 *  accidentally depend on severity-grouped input. */
export const ALL_WARNINGS: readonly ParseWarning[] = [
  MAPPED_WARNINGS[0]!,
  INFO_WARNINGS[0]!,
  UNMAPPED_WARNINGS[0]!,
  IGNORED_WARNINGS[0]!,
  INFO_WARNINGS[1]!,
  MAPPED_WARNINGS[1]!,
  UNMAPPED_WARNINGS[1]!,
  INFO_WARNINGS[2]!,
  IGNORED_WARNINGS[1]!,
];

export const WARN_WARNINGS: readonly ParseWarning[] = ALL_WARNINGS.filter(
  (w) => w.severity === "warn",
);

/** A published `ShowReviewSnapshot`-shaped object. Typed loosely at the call
 *  site (`as never`) because the adapter owns the real shape; every field the
 *  adapter reads is present. */
export function fixtureSnapshot(warnings: readonly ParseWarning[] = ALL_WARNINGS) {
  return {
    show: {
      id: FIXTURE_SHOW_ID,
      title: "Warning Surface Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: FIXTURE_DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: FIXTURE_SHOW_ID,
    },
    crew_members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alex Kim", role: "PM" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Jordan Vale", role: "A2" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}
