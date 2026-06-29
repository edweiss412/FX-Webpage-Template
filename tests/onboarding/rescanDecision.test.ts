import { describe, expect, test } from "vitest";

import {
  computeRescanDecision,
  DECISION_REQUIRING_INVARIANTS,
} from "@/lib/onboarding/rescanDecision";
import { FIELD_UNREADABLE } from "@/lib/parser/warnings";
import type { DataGapsSummary } from "@/lib/parser/dataGaps";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

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
    const priorGaps: DataGapsSummary = {
      total: 1,
      classes: { FIELD_UNREADABLE: 1, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 },
    };
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], unreadable(2));
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(true);
  });

  // Negative control: a gap the operator FIXED (count drops) stays CLEAN.
  test("data-gap count DECREASE (2 → 1) → CLEAN", () => {
    const priorGaps: DataGapsSummary = {
      total: 2,
      classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 },
    };
    const refreshed = makeParse([{ name: "Ada Lovelace", email: "ada@x.example" }], unreadable(1));
    expect(computeRescanDecision(PRIOR, refreshed, priorGaps).dirty).toBe(false);
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
});
