import { describe, expect, test } from "vitest";

import {
  computeRescanDecision,
  DECISION_REQUIRING_INVARIANTS,
} from "@/lib/onboarding/rescanDecision";
import { FIELD_UNREADABLE } from "@/lib/parser/warnings";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import { mkDataGaps } from "../helpers/dataGapsFixture";

// Minimal valid v4 ParseResult fixture (mirrors tests/onboarding/finalizeCasReonboardBaseline).
// crew + warnings are the only fields the rescan decision diffs against.
function makeParse(
  crew: Array<{ name: string; email: string }>,
  warnings: ParseWarning[] = [],
): ParseResult {
  return {
    show: {
      title: "Decision Fixture",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crew.map(({ name, email }) => ({
      name,
      email,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings,
    hardErrors: [],
  } as unknown as ParseResult;
}

function unreadable(n: number): ParseWarning[] {
  return Array.from({ length: n }, (_, i) => ({
    severity: "warn" as const,
    code: FIELD_UNREADABLE,
    message: `unreadable ${i}`,
  }));
}

const PRIOR = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);

describe("computeRescanDecision", () => {
  // Failure mode: an existing crew member's email change being auto-kept (CRITICAL r1-2).
  test("email change → DIRTY, decisionItems carry an MI-11", () => {
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada-new@x.example" }]);
    const { dirty, decisionItems } = computeRescanDecision(PRIOR, refreshed, null);
    expect(dirty).toBe(true);
    expect(decisionItems.some((i) => i.invariant === "MI-11")).toBe(true);
  });

  // Failure mode: a crew rename being auto-kept. Same canonical email, changed name →
  // MI-12 "probable rename" (multi-action: {rename, reject}) — must drop to needs-review.
  test("crew rename (same email, new name) → DIRTY with a multi-action MI-12", () => {
    const refreshed = makeParse([{ name: "Ada L.", email: "ada@x.example" }]);
    const { dirty, decisionItems } = computeRescanDecision(PRIOR, refreshed, null);
    expect(dirty).toBe(true);
    expect(decisionItems.some((i) => i.invariant === "MI-12")).toBe(true);
    // every surfaced decision item is in the decision-requiring family
    expect(decisionItems.every((i) => DECISION_REQUIRING_INVARIANTS.has(i.invariant))).toBe(true);
  });

  test("identical parse → CLEAN, no decision items", () => {
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);
    const { dirty, decisionItems } = computeRescanDecision(PRIOR, refreshed, null);
    expect(dirty).toBe(false);
    expect(decisionItems).toEqual([]);
  });

  // Failure mode: a newly-degraded field count being auto-kept (finding 5: per-class count).
  test("data-gap count INCREASE (1 → 2 FIELD_UNREADABLE) → DIRTY", () => {
    const priorGaps = mkDataGaps({ FIELD_UNREADABLE: 1 });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], unreadable(2));
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(true);
  });

  // Role-vocab staging overlay (spec 2026-07-16 §3.3 / §7 item 7): the overlay only
  // REMOVES warnings + unions non-lead flags — recognizing a role between the prior
  // stage and a rescan must never demote an approved sheet. Failure mode caught:
  // consumption being classified as a gap regression (dirty) and forcing re-review.
  test("UNKNOWN_ROLE_TOKEN consumed by the overlay (1 → 0, flags unioned) → CLEAN", () => {
    const priorGaps = mkDataGaps({ UNKNOWN_ROLE_TOKEN: 1 });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);
    refreshed.crewMembers[0]!.role_flags = ["A1"]; // overlay-granted, non-lead
    refreshed.appliedRoleMappings = [{ token: "NEWROLE", grants: ["A1"] }];
    const { dirty, decisionItems } = computeRescanDecision(PRIOR, refreshed, priorGaps);
    expect(dirty).toBe(false);
    expect(decisionItems).toEqual([]);
  });

  // Negative control: a gap the operator FIXED (count drops) stays CLEAN.
  test("data-gap count DECREASE (2 → 1) → CLEAN", () => {
    const priorGaps = mkDataGaps({ FIELD_UNREADABLE: 2 });
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], unreadable(1));
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(false);
  });

  // Task 6 — the generalized `classes` Record must let the Object.keys comparison
  // catch a regression on a NEWLY-counted code (one absent from the pre-#289 3-key
  // shape). If `classes` were still 3 fixed keys, UNKNOWN_FIELD would not be a key,
  // the comparison would skip it, and this regression would be silently auto-kept.
  test("regression on a NEWLY-counted gap code (UNKNOWN_FIELD 0 → 1) → DIRTY", () => {
    const priorGaps = mkDataGaps({}); // no gaps at all
    const refreshed = makeParse(
      [{ name: "Ada Lovelace", email: "ada@x.example" }],
      [{ severity: "warn", code: "UNKNOWN_FIELD", message: "new unrecognized field" }],
    );
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(true);
  });

  test("priorParse === null (first-seen) → no decision items, CLEAN (caller adds the !priorReady guard)", () => {
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }]);
    const { dirty, decisionItems } = computeRescanDecision(null, refreshed, null);
    expect(decisionItems).toEqual([]);
    expect(dirty).toBe(false);
  });

  test("decision set is exactly the crew-change family", () => {
    expect([...DECISION_REQUIRING_INVARIANTS].sort()).toEqual(["MI-11", "MI-12", "MI-13", "MI-14"]);
  });

  // Task 10 (spec §3.4): an ambiguity-only gap increase is NOT a regression — a
  // judgment call never marks a re-scan dirty (ambiguity never blocks publish).
  const ambiguity = (n: number): ParseWarning[] =>
    Array.from({ length: n }, (_, i) => ({
      severity: "warn" as const,
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      message: `ambiguous room split ${i}`,
    }));

  test("ambiguity-only gap INCREASE (0 → 2 ROOM_HEADER_SPLIT_AMBIGUOUS) → CLEAN", () => {
    const priorGaps = mkDataGaps({});
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], ambiguity(2));
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(false);
  });

  test("mixed increase (ambiguity + a non-ambiguity gap) → DIRTY on the non-ambiguity class", () => {
    const priorGaps = mkDataGaps({});
    const refreshed = makeParse(
      [{ name: "Ada Lovelace", email: "ada@x.example" }],
      [...ambiguity(2), ...unreadable(1)],
    );
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(true);
  });

  test("ambiguity increase does NOT suppress an invariant-triggered dirty (MI-11 email change)", () => {
    const priorGaps = mkDataGaps({});
    const refreshed = makeParse(
      [{ name: "Ada Lovelace", email: "ada-new@x.example" }],
      ambiguity(2),
    );
    const { dirty, decisionItems } = computeRescanDecision(PRIOR, refreshed, priorGaps);
    expect(dirty).toBe(true);
    expect(decisionItems.length).toBeGreaterThan(0);
  });
});
