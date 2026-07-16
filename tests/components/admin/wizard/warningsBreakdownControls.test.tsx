// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/warningsBreakdownControls.test.tsx
 *
 * Spec 2026-07-16-use-raw-wizard-full-list-toggle: use-raw + recognize-role
 * controls on every in-scope warning in the uncapped WarningsBreakdown list,
 * reorder-stable keys at both actionable render sites, and the §4.6
 * stale-sibling contract for duplicate role controls.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The boundaries import BOTH surfaces' server actions at module level; mock all
// of them so jsdom never touches server-only deps and interaction tests can
// control outcomes. Success shapes mirror the real actions:
//   setStagedUseRawDecisionAction → { ok: true, state: "saved" }   (useRawStaged.ts:45)
//   mapRoleTokenStaged            → { ok: true, state: "apply_pending" } (roleTokenStaged.ts:177)
vi.mock("@/app/admin/onboarding/_actions/useRawStaged", () => ({
  setStagedUseRawDecisionAction: vi.fn(async () => ({ ok: true, state: "saved" })),
}));
vi.mock("@/app/admin/show/[slug]/_actions/useRaw", () => ({
  setUseRawDecisionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/admin/onboarding/_actions/roleTokenStaged", () => ({
  mapRoleTokenStaged: vi.fn(async () => ({ ok: true, state: "apply_pending" })),
}));
vi.mock("@/app/admin/show/[slug]/_actions/roleToken", () => ({
  mapRoleToken: vi.fn(async () => ({ ok: true, state: "applied" })),
}));
vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({
  updateRoleTokenMapping: vi.fn(async () => ({ ok: true })),
}));

import { findUseRawDecision } from "@/components/admin/wizard/step3ReviewSections";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DFID = "drive-abc-123";

/** In-scope resolvable room-split warning; contentHash + name derive from n. */
function roomSplitWarning(n: number): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: `Read a room header as name + dimensions (${n})`,
    blockRef: { kind: "rooms", index: n, field: "dims" },
    rawSnippet: `ROOM ${n} | 20x30`,
    resolution: {
      resolvable: true,
      contentHash: `hash-${n}`,
      parsed: { kind: "rooms", name: `Room ${n}`, dimensions: "20x30", floor: null },
      replacement: { kind: "rooms", name: `Room ${n} 20x30`, dimensions: null, floor: null },
    },
  };
}

function roleWarning(token: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unknown role token: '${token}' in role cell: '${token}'`,
    rawSnippet: token,
    roleToken: token,
  };
}

function decisionFor(w: ParseWarning, preference: "raw" | "transform" = "raw"): UseRawDecision {
  if (!w.resolution || w.resolution.resolvable !== true) throw new Error("fixture misuse");
  return {
    code: w.code as UseRawDecision["code"],
    contentHash: w.resolution.contentHash,
    target: { kind: "rooms" },
    preference,
    applied: false,
    decidedAt: "2026-07-16T00:00:00.000Z",
    decidedBy: "admin@example.com",
  };
}

describe("findUseRawDecision (spec §4.4 shared matcher)", () => {
  test("matches on (code, resolution.contentHash); never on code alone", () => {
    const w1 = roomSplitWarning(1);
    const w2 = roomSplitWarning(2); // same code, different contentHash
    const d1 = decisionFor(w1);
    expect(findUseRawDecision(w1, [d1])).toBe(d1);
    expect(findUseRawDecision(w2, [d1])).toBeUndefined();
  });

  test("unresolvable / resolution-less warnings never match", () => {
    const legacy: ParseWarning = { ...roleWarning("SLED DRIVER") };
    const unresolvable: ParseWarning = {
      ...roomSplitWarning(3),
      resolution: { resolvable: false, reason: "empty-raw" },
    };
    const d = decisionFor(roomSplitWarning(3));
    expect(findUseRawDecision(legacy, [d])).toBeUndefined();
    expect(findUseRawDecision(unresolvable, [d])).toBeUndefined();
  });

  test("undefined / empty decision lists return undefined", () => {
    const w = roomSplitWarning(1);
    expect(findUseRawDecision(w, undefined)).toBeUndefined();
    expect(findUseRawDecision(w, [])).toBeUndefined();
  });
});
