/**
 * tests/app/admin/attentionModalGallery.serverProps.test.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 4)
 *
 * The server-side partition: which scenarios render in the switcher, which are
 * excluded and why. Two orthogonal axes — EXPRESSIBLE (the modal can reproduce
 * the placement) and VISIBLE (the modal shows something). Both the structural
 * and cut exclusion sets are PINNED to exact id lists so a catalog/derivation
 * drift fails loudly instead of silently adapting.
 */
import { describe, expect, test } from "vitest";
import {
  partitionScenarios,
  isModalExpressible,
  isModalVisible,
  resolveInitialScenario,
} from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import {
  T2_SECTION_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_CREW_ROW_ABSENT,
  T2_ANCHOR_ABSENT,
  T2_EMPTY,
  T2_DEGRADED,
  tier2Scenarios,
  T2_HOLD_ONLY,
  T2_MANY,
  T2_DEGRADED_WITH_HOLDS,
} from "@/lib/dev/attentionScenarios/tier2";
import { tier1AlertScenarios, tier1WarningScenarios } from "@/lib/dev/attentionScenarios/tier1";
import { T3_IDS, T3_CREW_COLLISION } from "@/lib/dev/attentionScenarios/tier3";
import { scenarioGroup } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { GROUP_ORDER } from "@/lib/dev/galleryModalTypes";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

const EXPECTED_STRUCTURAL = [T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT].sort();

// The exact cut set today (checked-in). A new/removed cut scenario must fail
// this pin, not silently adapt (cut-axis review finding 1).
const EXPECTED_CUT_IDS = [
  "alert-asset-recovery-drift-cooldown",
  "alert-asset-recovery-revision-drift",
  "alert-branch-protection-drift",
  "alert-branch-protection-monitor-auth-failed",
  "alert-callback-claim-threw",
  "alert-email-delivery-failed",
  "alert-email-not-configured",
  "alert-github-bot-login-missing",
  "alert-oauth-identity-claimed",
  "alert-pending-snapshot-delete-stuck",
  "alert-pending-snapshot-promote-stuck",
  "alert-pending-snapshot-rollback-stuck",
  "alert-picker-bootstrap-resolve-show-failed",
  "alert-picker-bootstrap-rpc-failed",
  "alert-picker-epoch-reset",
  "alert-picker-selection-race",
  "alert-report-duplicate-live-matches",
  "alert-report-lease-thrashing",
  "alert-report-lookup-inconclusive",
  "alert-report-open-orphan-label",
  "alert-report-orphaned-lost-lease",
  "alert-role-flags-notice",
  "alert-show-first-published",
  "alert-stale-orphan-report",
  "alert-tile-projection-fetch-failed",
  "alert-tile-server-render-failed",
  "alert-webhook-token-invalid",
  "alert-wizard-session-superseded-race",
].sort();

function minimal(id: string, over: Partial<AttentionScenario> = {}): AttentionScenario {
  return { id, tier: 1, label: id, alerts: [], holds: [], ...over };
}

describe("isModalExpressible (synthetic truth table)", () => {
  test("a sectionAvailable override is not expressible", () => {
    expect(isModalExpressible(minimal("x", { bucket: { sectionAvailable: () => false } }))).toBe(
      false,
    );
  });
  test("a crewKeyRendered override is not expressible", () => {
    expect(isModalExpressible(minimal("x", { bucket: { crewKeyRendered: () => false } }))).toBe(
      false,
    );
  });
  test("both overrides is not expressible", () => {
    expect(
      isModalExpressible(
        minimal("x", { bucket: { sectionAvailable: () => false, crewKeyRendered: () => true } }),
      ),
    ).toBe(false);
  });
  test("no override (or only anchorAvailable) is expressible", () => {
    expect(isModalExpressible(minimal("x"))).toBe(true);
    expect(isModalExpressible(minimal("x", { bucket: { anchorAvailable: () => false } }))).toBe(
      true,
    );
  });
});

describe("isModalVisible", () => {
  test("a surfacing alert scenario is visible", () => {
    const surfacing = tier1AlertScenarios().find((s) => deriveScenarioAttention(s).length > 0)!;
    expect(isModalVisible(surfacing)).toBe(true);
  });
  test("a cut alert scenario (declares an alert, derives nothing) is NOT visible", () => {
    const cut = tier1AlertScenarios().find(
      (s) => s.alerts.length > 0 && deriveScenarioAttention(s).length === 0,
    )!;
    expect(isModalVisible(cut)).toBe(false);
  });
  test("a warnings-only scenario is visible", () => {
    const warned = tier1WarningScenarios().find((s) => (s.warnings?.length ?? 0) > 0)!;
    expect(isModalVisible(warned)).toBe(true);
  });
  test("the intentional-empty baseline (declares no attention) is visible", () => {
    expect(isModalVisible(tier2Scenarios().find((s) => s.id === T2_EMPTY)!)).toBe(true);
  });
  test("a degraded scenario is visible", () => {
    expect(isModalVisible(tier2Scenarios().find((s) => s.id === T2_DEGRADED)!)).toBe(true);
  });
});

describe("partitionScenarios", () => {
  const { rendered, excluded } = partitionScenarios();

  test("structural excluded set is EXACTLY the three predicate-override ids, and all are visible", () => {
    const structural = excluded.filter((e) => e.reason === "structural");
    expect(structural.map((e) => e.id).sort()).toEqual(EXPECTED_STRUCTURAL);
    for (const id of EXPECTED_STRUCTURAL) {
      const s = tier2Scenarios().find((x) => x.id === id)!;
      expect(isModalVisible(s), `${id} should be structural-only (visible)`).toBe(true);
    }
  });

  test("cut excluded set is EXACTLY the checked-in id list (drift fails the pin)", () => {
    const cut = excluded.filter((e) => e.reason === "cut");
    expect(cut.map((e) => e.id).sort()).toEqual(EXPECTED_CUT_IDS);
  });

  test("tiers 1-3 all render; T2_ANCHOR_ABSENT and T2_EMPTY do render", () => {
    expect(rendered.every((s) => s.tier === 1 || s.tier === 2 || s.tier === 3)).toBe(true);
    expect(rendered.some((s) => s.id === T2_ANCHOR_ABSENT)).toBe(true);
    expect(rendered.some((s) => s.id === T2_EMPTY)).toBe(true);
  });

  test("renders every tier-3 composite", () => {
    for (const id of T3_IDS) {
      expect(
        rendered.some((s) => s.id === id),
        id,
      ).toBe(true);
      expect(
        excluded.some((e) => e.id === id),
        id,
      ).toBe(false);
    }
  });

  test("integration visibility: every rendered scenario shows something (no blank modal)", () => {
    for (const s of rendered) {
      const d = s.data;
      const hasItem = d.attentionItems.length > 0;
      const hasWarning = Object.keys(d.bySection ?? {}).length > 0;
      const isDegraded = d.alertsDegraded === true;
      const isCleanBaseline = d.attentionItems.length === 0; // T2_EMPTY-class clean modal
      expect(hasItem || hasWarning || isDegraded || isCleanBaseline, `${s.id} blank`).toBe(true);
    }
  });

  test("every rendered scenario's data is serializable", () => {
    for (const s of rendered) expect(() => structuredClone(s.data)).not.toThrow();
  });

  test("codes are carried server-side", () => {
    const withAlert = rendered.find((s) => s.codes.length > 0)!;
    expect(withAlert.codes.length).toBeGreaterThan(0);
  });

  test("groups derive from the real routers", () => {
    expect(scenarioGroup(scenarioById(T2_EMPTY)!)).toBe("baseline");
    expect(scenarioGroup(scenarioById(T2_DEGRADED)!)).toBe("baseline");
    expect(scenarioGroup(scenarioById(T2_HOLD_ONLY)!)).toBe("changes");
    expect(scenarioGroup(scenarioById(T2_DEGRADED_WITH_HOLDS)!)).toBe("changes");
    expect(scenarioGroup(scenarioById(T2_MANY)!)).toBe("mixed");
    expect(scenarioGroup(scenarioById("alert-sync-stalled")!)).toBe("overview");
    expect(scenarioGroup(scenarioById(T3_CREW_COLLISION)!)).toBe("mixed");
  });

  test("rendered list is group-sorted, stable within groups, every scenario stamped", () => {
    const orders = rendered.map((s) => GROUP_ORDER.indexOf(s.group));
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders.every((o) => o >= 0)).toBe(true);
  });
});

describe("resolveInitialScenario", () => {
  const { rendered } = partitionScenarios();
  const validId = rendered[0]!.id;

  test("valid scalar resolves; unknown/excluded/tier3/empty/undefined -> null", () => {
    expect(resolveInitialScenario(validId, rendered)).toBe(validId);
    expect(resolveInitialScenario("nope", rendered)).toBeNull();
    expect(resolveInitialScenario(T2_SECTION_ABSENT, rendered)).toBeNull(); // structural excluded
    expect(resolveInitialScenario("alert-email-delivery-failed", rendered)).toBeNull(); // cut excluded
    expect(resolveInitialScenario("", rendered)).toBeNull();
    expect(resolveInitialScenario(undefined, rendered)).toBeNull();
  });

  test("array normalization: first wins; unknown-first does NOT fall through; empty -> null", () => {
    expect(resolveInitialScenario([validId, "x"], rendered)).toBe(validId);
    expect(resolveInitialScenario(["nope", validId], rendered)).toBeNull();
    expect(resolveInitialScenario([], rendered)).toBeNull();
  });
});

// ── Modal-state-coverage: visibility carriers, grouping fallbacks, shareToken ──
// (plan Task 5)

describe("isModalVisible - modal-state carriers", () => {
  const cutAlert = {
    code: "PICKER_EPOCH_RESET",
    context: {},
    raised_at: "2026-07-01T11:00:00.000Z",
    occurrence_count: 1,
  };
  test("a cut-only alert alone stays excluded", () => {
    expect(isModalVisible(minimal("t2-msc-cut", { tier: 2, alerts: [cutAlert] }))).toBe(false);
  });
  test("feedNull, non-empty changeLog, and an effective fixture each make it visible", () => {
    expect(
      isModalVisible(minimal("t2-msc-v1", { tier: 2, alerts: [cutAlert], feedNull: true })),
    ).toBe(true);
    expect(
      isModalVisible(
        minimal("t2-msc-v2", {
          tier: 2,
          alerts: [cutAlert],
          changeLog: [
            {
              occurred_at: "2026-07-01T10:00:00.000Z",
              status: "applied",
              summary: "x",
              entity_ref: null,
              change_kind: "field_changed",
              individually_undoable: false,
              source: "auto_apply",
              acknowledged_at: null,
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isModalVisible(
        minimal("t2-msc-v3", { tier: 2, alerts: [cutAlert], fixture: { archived: true, published: false } }),
      ),
    ).toBe(true);
  });
});

describe("scenarioGroup - landing and rendered-section fallbacks", () => {
  test("fixture-only scenario with landing groups there; landing loses to real sections", () => {
    expect(
      scenarioGroup(minimal("t2-msc-g1", { tier: 2, fixture: { archived: true, published: false }, landing: "overview" })),
    ).toBe("overview");
    const withHold = scenarioById("t2-hold-only");
    expect(withHold).toBeDefined();
    expect(scenarioGroup({ ...withHold!, landing: "overview" })).toBe("changes");
  });
  test("agenda-routed warning + empty agenda groups under warnings (rendered-section fallback)", () => {
    const s = minimal("t2-msc-g2", {
      tier: 2,
      warnings: [
        {
          severity: "warn",
          code: "AGENDA_SCHEDULE_LOW_CONFIDENCE",
          message: "Synthetic warning for gallery review.",
          blockRef: { kind: "agenda" },
        },
      ],
      fixture: { empty: ["agenda"] },
    });
    expect(scenarioGroup(s)).toBe("warnings");
  });
  test("anchor-absent alert groups under overview (modal redirect parity)", () => {
    const anchorAbsent = scenarioById(T2_ANCHOR_ABSENT);
    expect(anchorAbsent).toBeDefined();
    expect(scenarioGroup(anchorAbsent!)).toBe("overview");
  });
});

describe("partitionScenarios - shareToken stamping", () => {
  test("share scenarios carry a token; others null", () => {
    const { rendered } = partitionScenarios();
    for (const sc of rendered) {
      const source = scenarioById(sc.id);
      const wantsShare = source?.fixture?.share?.linkActive === true;
      if (wantsShare) expect(sc.shareToken, sc.id).toEqual(expect.any(String));
      else expect(sc.shareToken, sc.id).toBeNull();
    }
  });
});
