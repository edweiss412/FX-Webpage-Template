// Crew-row alert banner: id-matched fan-out (spec
// docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md §6).
//
// Node-env unit coverage for:
//   - §6.2 derivation guards (deriveAlertRowFields.crewMatch)
//   - §6.2 passthrough (deriveAttentionItems carries crewMatch onto the item)
//   - §3.6 dev-gallery validator (optional crewMatch field)
//   - §6.3 resolver (crewRowIndexesForIds / buildCrewRowResolver) [Task 7]
//   - §6.3 placement (bucketAttention byRowIndex channel) [Task 7]
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { scenarioIdForCode } from "@/lib/dev/attentionScenarios/tier1";
import { T2_CREW_BEYOND_CAP } from "@/lib/dev/attentionScenarios/tier2";
import { describe, it, expect } from "vitest";
import { deriveAlertRowFields } from "@/lib/adminAlerts/deriveAlertRowFields";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";
import { crewRowIndexesForIds, buildCrewRowResolver } from "@/lib/admin/crewRowMatch";
import { bucketAttention, type BucketOpts } from "@/lib/admin/sectionAttention";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { CREW_CAP } from "@/components/admin/wizard/step3ReviewSections";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function alertRow(context: Record<string, unknown> | null, code = "AMBIGUOUS_EMAIL_BINDING") {
  return { code, context };
}

describe("deriveAlertRowFields crewMatch derivation (spec §6.2)", () => {
  it("valid two ids → crewMatch present, deep-equal shape", () => {
    const out = deriveAlertRowFields(
      alertRow({ email: "x@example.com", crew_member_ids: [A, B] }),
      undefined,
    );
    expect(out.crewMatch).toEqual({ crewMemberIds: [A, B], expectedCount: 2 });
  });

  it("duplicate context ids → deduped; expectedCount is post-dedup", () => {
    const out = deriveAlertRowFields(alertRow({ crew_member_ids: [A, B, A] }), undefined);
    expect(out.crewMatch).toEqual({ crewMemberIds: [A, B], expectedCount: 2 });
  });

  it("missing crew_member_ids → property ABSENT", () => {
    const out = deriveAlertRowFields(alertRow({ email: "x@example.com" }), undefined);
    expect(out).not.toHaveProperty("crewMatch");
  });

  it("empty array → property ABSENT", () => {
    const out = deriveAlertRowFields(alertRow({ crew_member_ids: [] }), undefined);
    expect(out).not.toHaveProperty("crewMatch");
  });

  it("non-UUID member → property ABSENT (whole match rejected)", () => {
    const out = deriveAlertRowFields(alertRow({ crew_member_ids: [A, "not-a-uuid"] }), undefined);
    expect(out).not.toHaveProperty("crewMatch");
  });

  it("non-array crew_member_ids → property ABSENT", () => {
    const out = deriveAlertRowFields(alertRow({ crew_member_ids: A }), undefined);
    expect(out).not.toHaveProperty("crewMatch");
  });

  it("null context → property ABSENT", () => {
    const out = deriveAlertRowFields(alertRow(null), undefined);
    expect(out).not.toHaveProperty("crewMatch");
  });

  it("other code carrying crew_member_ids → property ABSENT", () => {
    const out = deriveAlertRowFields(
      alertRow({ crew_member_ids: [A, B] }, "OAUTH_IDENTITY_CLAIMED"),
      undefined,
    );
    expect(out).not.toHaveProperty("crewMatch");
  });
});

describe("deriveAttentionItems crewMatch passthrough (spec §6.2)", () => {
  function input(overrides: Partial<AttentionAlertInput> = {}): AttentionAlertInput {
    return {
      id: "row-1",
      code: "AMBIGUOUS_EMAIL_BINDING",
      context: { crew_member_ids: [A, B] },
      raised_at: new Date().toISOString(),
      occurrence_count: 1,
      identityText: null,
      messageParams: {},
      crewName: null,
      ...overrides,
    };
  }

  it("carries crewMatch from input onto the derived item", () => {
    const items = deriveAttentionItems({
      alerts: [input({ crewMatch: { crewMemberIds: [A, B], expectedCount: 2 } })],
      feed: null,
      slug: "demo",
    });
    const item = items.find((i) => i.id === "alert:row-1");
    expect(item?.crewMatch).toEqual({ crewMemberIds: [A, B], expectedCount: 2 });
  });

  it("omits crewMatch when the input has none (property ABSENT)", () => {
    const items = deriveAttentionItems({
      alerts: [input()],
      feed: null,
      slug: "demo",
    });
    const item = items.find((i) => i.id === "alert:row-1");
    expect(item).not.toHaveProperty("crewMatch");
  });
});

describe("validateScenario crewMatch field (spec §3.6 / §6.2)", () => {
  // A crewMatch is only legal on a fan-out-capable code, and must agree with
  // its own context.crew_member_ids — production DERIVES the match from that
  // array, so any other shape demos a state no producer can emit.
  function scenario(
    alertOverrides: Record<string, unknown>,
    code = "AMBIGUOUS_EMAIL_BINDING",
    context: Record<string, unknown> = { crew_member_ids: [A, B], email: "shared@example.test" },
  ): AttentionScenario {
    return {
      id: "crew-match-demo",
      tier: 1,
      label: "Crew match demo",
      alerts: [
        {
          code,
          context,
          raised_at: new Date().toISOString(),
          occurrence_count: 1,
          ...alertOverrides,
        },
      ],
      holds: [],
    } as AttentionScenario;
  }

  it("accepts a well-formed optional crewMatch", () => {
    expect(
      validateScenario(scenario({ crewMatch: { crewMemberIds: [A, B], expectedCount: 2 } })),
    ).toEqual([]);
  });

  it("accepts a scenario omitting crewMatch entirely", () => {
    expect(validateScenario(scenario({}))).toEqual([]);
    expect(validateScenario(scenario({}, "SYNC_STALLED", {}))).toEqual([]);
  });

  it("rejects a crewMatch on a code production cannot fan out", () => {
    // SYNC_STALLED has no crew placement at all; deriveCrewMatch returns
    // undefined for every code but AMBIGUOUS_EMAIL_BINDING
    // (lib/adminAlerts/deriveAlertRowFields.ts:59).
    expect(
      validateScenario(
        scenario({ crewMatch: { crewMemberIds: [A, B], expectedCount: 2 } }, "SYNC_STALLED", {}),
      ),
    ).not.toEqual([]);
  });

  it("rejects a crewMatch that disagrees with its own context.crew_member_ids", () => {
    expect(
      validateScenario(
        scenario(
          { crewMatch: { crewMemberIds: [A, C], expectedCount: 2 } },
          "AMBIGUOUS_EMAIL_BINDING",
          {
            crew_member_ids: [A, B],
            email: "shared@example.test",
          },
        ),
      ),
    ).not.toEqual([]);
  });

  it("rejects a non-UUID crewMatch member", () => {
    const errors = validateScenario(
      scenario({ crewMatch: { crewMemberIds: [A, "nope"], expectedCount: 2 } }),
    );
    expect(errors.some((e) => e.includes("crewMatch"))).toBe(true);
  });

  it("rejects a non-number expectedCount", () => {
    const errors = validateScenario(
      scenario({ crewMatch: { crewMemberIds: [A, B], expectedCount: "2" } }),
    );
    expect(errors.some((e) => e.includes("crewMatch"))).toBe(true);
  });

  it("rejects expectedCount inconsistent with the deduped id count", () => {
    const errors = validateScenario(
      scenario({ crewMatch: { crewMemberIds: [A, B], expectedCount: 3 } }),
    );
    expect(errors.some((e) => e.includes("crewMatch"))).toBe(true);
  });

  it("rejects an empty crewMatch id array", () => {
    const errors = validateScenario(
      scenario({ crewMatch: { crewMemberIds: [], expectedCount: 0 } }),
    );
    expect(errors.some((e) => e.includes("crewMatch"))).toBe(true);
  });
});

describe("crewRowIndexesForIds resolver (spec §6.3)", () => {
  const em = (ids: string[], expectedCount = ids.length) => ({ crewMemberIds: ids, expectedCount });

  it("expected [A,B] vs shown [A,B,C] → [0,1]", () => {
    expect(crewRowIndexesForIds(em([A, B]), [A, B, C])).toEqual([0, 1]);
  });

  it("returns ascending indexes regardless of expected order", () => {
    expect(crewRowIndexesForIds(em([B, A]), [A, B, C])).toEqual([0, 1]);
  });

  it("expected [A,B] vs shown [A,A,B] → null (hits(A)===2)", () => {
    expect(crewRowIndexesForIds(em([A, B]), [A, A, B])).toBeNull();
  });

  it("expected [A,B] vs shown [A,C] → null (hits(B)===0)", () => {
    expect(crewRowIndexesForIds(em([A, B]), [A, C])).toBeNull();
  });

  it("empty shown roster → null", () => {
    expect(crewRowIndexesForIds(em([A]), [])).toBeNull();
  });

  it("expectedCount mismatch (ids [A,B], expectedCount 3) → null", () => {
    expect(crewRowIndexesForIds({ crewMemberIds: [A, B], expectedCount: 3 }, [A, B])).toBeNull();
  });

  it("empty ids + expectedCount 0 → null (NOT [], no silent no-placement)", () => {
    expect(crewRowIndexesForIds({ crewMemberIds: [], expectedCount: 0 }, [A, B])).toBeNull();
  });

  it("duplicate ids IN EXPECTED ([A,A], expectedCount 2) → null", () => {
    expect(crewRowIndexesForIds({ crewMemberIds: [A, A], expectedCount: 2 }, [A, B])).toBeNull();
  });
});

describe("buildCrewRowResolver CREW_CAP slice (spec §6.3)", () => {
  it("matches within the cap", () => {
    const resolve = buildCrewRowResolver([A, B, C]);
    expect(resolve({ crewMemberIds: [A, C], expectedCount: 2 })).toEqual([0, 2]);
  });

  it("an involved row rendered BEYOND CREW_CAP → null (section-top)", () => {
    // Roster of CREW_CAP filler ids + the involved id at index CREW_CAP (just past
    // the cap): the resolver only sees the shown slice, so it cannot match it.
    const filler = Array.from(
      { length: CREW_CAP },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const resolve = buildCrewRowResolver([...filler, A]);
    expect(resolve({ crewMemberIds: [A], expectedCount: 1 })).toBeNull();
  });
});

describe("bucketAttention byRowIndex placement (spec §6.3)", () => {
  function crewAlertItem(
    id: string,
    crewMatch?: { crewMemberIds: string[]; expectedCount: number },
  ): AttentionItem {
    return {
      id: `alert:${id}`,
      kind: "alert",
      tone: "notice",
      sectionId: "crew",
      crewKey: null,
      actionable: true,
      menuTitle: "t",
      menuSubtitle: null,
      ...(crewMatch ? { crewMatch } : {}),
      alert: {
        alertId: id,
        code: "AMBIGUOUS_EMAIL_BINDING",
        template: null,
        params: {},
        action: null,
        helpHref: null,
        raisedAt: "",
        occurrenceCount: 1,
        autoClearNote: null,
        failedKeys: null,
        dataGaps: null,
        errorCode: null,
      },
    };
  }

  const baseOpts = (roster: string[]): BucketOpts => ({
    renderCard: (item) => item.id,
    sectionAvailable: () => true,
    anchorAvailable: () => false,
    crewRowIndexesForIds: buildCrewRowResolver(roster),
  });

  it("fan-out → byRowIndex has one node per matched index; sectionTop gained nothing", () => {
    const map = bucketAttention(
      [crewAlertItem("x", { crewMemberIds: [A, B], expectedCount: 2 })],
      baseOpts([A, B, C]),
    );
    const crew = map.get("crew")!;
    expect(crew.byRowIndex?.get(0)).toEqual(["alert:x"]);
    expect(crew.byRowIndex?.get(1)).toEqual(["alert:x"]);
    expect(crew.sectionTop).toEqual([]);
  });

  it("null result → section-top only, no byRowIndex", () => {
    const map = bucketAttention(
      [crewAlertItem("x", { crewMemberIds: [A, C], expectedCount: 2 })],
      baseOpts([A, B]), // C absent → hits(C)===0 → null
    );
    const crew = map.get("crew")!;
    expect(crew.sectionTop).toEqual(["alert:x"]);
    expect(crew.byRowIndex).toBeUndefined();
  });

  it("resolver absent (staged) → section-top", () => {
    const map = bucketAttention([crewAlertItem("x", { crewMemberIds: [A], expectedCount: 1 })], {
      renderCard: (item) => item.id,
      sectionAvailable: () => true,
      anchorAvailable: () => false,
      // no crewRowIndexesForIds
    });
    const crew = map.get("crew")!;
    expect(crew.sectionTop).toEqual(["alert:x"]);
    expect(crew.byRowIndex).toBeUndefined();
  });

  it("conservation: never both channels; node count == matched count", () => {
    const map = bucketAttention(
      [crewAlertItem("x", { crewMemberIds: [A, B], expectedCount: 2 })],
      baseOpts([A, B, C]),
    );
    const crew = map.get("crew")!;
    const fanned = [...(crew.byRowIndex?.values() ?? [])].flat();
    expect(fanned).toHaveLength(2);
    expect(crew.sectionTop).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gallery placement coverage (spec §8)
//
// Pinned BY SCENARIO ID, not existentially. An assertion that the catalog
// "contains at least one of each placement" can be satisfied by an unrelated
// scenario after the intended one regresses, which would let the very state
// this bundle restored go dark again unnoticed.
// ---------------------------------------------------------------------------
describe("gallery covers BOTH crew-banner placements (spec §8)", () => {
  const rosterFor = (crew?: number): string[] => {
    const ids = [
      "cccccccc-0000-4000-8000-000000000001",
      "cccccccc-0000-4000-8000-000000000002",
      "cccccccc-0000-4000-8000-000000000003",
      "cccccccc-0000-4000-8000-000000000004",
      "cccccccc-0000-4000-8000-000000000005",
      "cccccccc-0000-4000-8000-000000000006",
    ];
    for (let i = 7; i <= (crew ?? 0); i++) {
      ids.push(`cccccccc-0000-4000-8000-${String(i).padStart(3, "0")}000000000`.slice(0, 36));
    }
    return ids;
  };

  function placementOf(scenarioId: string): { fannedOut: boolean; sectionTop: boolean } {
    const scenario = ALL_SCENARIOS.find((s) => s.id === scenarioId);
    expect(scenario, `scenario ${scenarioId} must exist`).toBeDefined();
    const items = deriveScenarioAttention(scenario!).filter((i) => i.sectionId === "crew");
    expect(items.length, `${scenarioId} must derive a crew item`).toBeGreaterThan(0);
    const roster = rosterFor(
      (scenario as { fixture?: { volumes?: { crew?: number } } }).fixture?.volumes?.crew,
    );
    const map = bucketAttention(items, {
      renderCard: (item) => item.id,
      sectionAvailable: () => true,
      anchorAvailable: () => false,
      crewRowIndexesForIds: buildCrewRowResolver(roster),
    });
    const crew = map.get("crew");
    const byRow = crew?.byRowIndex;
    return {
      fannedOut: byRow !== undefined && byRow.size > 0,
      sectionTop: (crew?.sectionTop.length ?? 0) > 0,
    };
  }

  it("the per-code duplicate-email scenario FANS OUT into matched rows", () => {
    const placement = placementOf(scenarioIdForCode("alert", "AMBIGUOUS_EMAIL_BINDING"));
    expect(placement.fannedOut, "expected an in-row banner per matched crew row").toBe(true);
    expect(placement.sectionTop, "fan-out and section-top are exclusive").toBe(false);
  });

  it("the beyond-cap scenario falls back to ONE section-top banner", () => {
    // Real production fallback: an involved row rendered past CREW_CAP cannot
    // be matched, so the whole item goes section-top rather than partially
    // fanning out.
    const placement = placementOf(T2_CREW_BEYOND_CAP);
    expect(placement.sectionTop, "expected a section-top banner").toBe(true);
    expect(placement.fannedOut, "must not partially fan out").toBe(false);
  });
});
