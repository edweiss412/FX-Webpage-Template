// Crew-row alert banner: id-matched fan-out (spec
// docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md §6).
//
// Node-env unit coverage for:
//   - §6.2 derivation guards (deriveAlertRowFields.crewMatch)
//   - §6.2 passthrough (deriveAttentionItems carries crewMatch onto the item)
//   - §3.6 dev-gallery validator (optional crewMatch field)
//   - §6.3 resolver (crewRowIndexesForIds / buildCrewRowResolver) [Task 7]
//   - §6.3 placement (bucketAttention byRowIndex channel) [Task 7]
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
  function scenario(alertOverrides: Record<string, unknown>): AttentionScenario {
    return {
      id: "crew-match-demo",
      tier: 1,
      label: "Crew match demo",
      alerts: [
        {
          code: "SYNC_STALLED",
          context: {},
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
