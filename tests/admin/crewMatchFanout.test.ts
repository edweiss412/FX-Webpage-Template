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
    const out = deriveAlertRowFields(
      alertRow({ crew_member_ids: [A, B, A] }),
      undefined,
    );
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
    expect(validateScenario(scenario({ crewMatch: { crewMemberIds: [A, B], expectedCount: 2 } }))).toEqual([]);
  });

  it("accepts a scenario omitting crewMatch entirely", () => {
    expect(validateScenario(scenario({}))).toEqual([]);
  });

  it("rejects a non-UUID crewMatch member", () => {
    const errors = validateScenario(scenario({ crewMatch: { crewMemberIds: [A, "nope"], expectedCount: 2 } }));
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
