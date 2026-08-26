// @vitest-environment jsdom
// The wizard step-3 candidate line.
//
// Renders WarningsBreakdown directly, the way
// tests/components/admin/wizard/warningsBreakdownControls.test.tsx:95-108 does. That is the
// component holding the per-warning <li>, so it is the smallest surface that exercises the line.
//
// Case status against today's code, stated for the same reason task 2 states it:
//   case 1 FAILS today (nothing renders the candidate). It is the red.
//   cases 2 and 3 pass today, and guard the absent and bare cases afterwards.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The per-row control boundaries import BOTH surfaces' server actions at MODULE level, so
// without these jsdom touches server-only deps at import time and the file fails to collect.
// Same preamble as warningsBreakdownControls.test.tsx, the existing suite that renders this.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
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

import { WarningsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ParseWarning } from "@/lib/parser/types";
import { nearMissWarningPair } from "../../../_shared/nearMissWarning";

const DFID = "drive-abc-123";
const tid = (i: number, suffix: string) => `wizard-step3-card-${DFID}-warning-${i}-${suffix}`;

const renderRows = (warnings: ParseWarning[]) =>
  render(<WarningsBreakdown dfid={DFID} warnings={warnings} mode="rescan" />);

describe("wizard step-3 candidate line", () => {
  const { withCandidate, withoutCandidate } = nearMissWarningPair();

  it("names the matched candidate on the row", () => {
    renderRows([withCandidate]);
    const line = screen.getByTestId(tid(0, "candidate"));
    expect(line.textContent).toContain(withCandidate.candidate);
    // Grammar: this surface's flatter rendering of the same information grammar (spec §4.1).
    expect(line.textContent).toMatch(/^Closest match /);
    expect(line.textContent).toContain(withCandidate.candidate);
  });

  it("renders no candidate line when the key is absent", () => {
    renderRows([withoutCandidate]);
    // Premise: the row rendered at all. Without this the absence below passes on an empty list.
    expect(screen.getByTestId(tid(0, "label"))).toBeTruthy();
    expect(screen.queryByTestId(tid(0, "candidate"))).toBeNull();
  });

  it("renders no candidate line when the persisted value is not a string", () => {
    // Round-2 finding 2 named BOTH surfaces. Repairing one would leave the class open on the
    // other, which is the drip this project's round economy exists to prevent.
    const numeric = { ...withCandidate, candidate: 42 } as unknown as ParseWarning;
    renderRows([numeric]);
    expect(screen.getByTestId(tid(0, "label"))).toBeTruthy();
    expect(screen.queryByTestId(tid(0, "candidate"))).toBeNull();
  });

  it("renders the value TRIMMED when the persisted candidate carries padding", () => {
    // Round-3 finding 1. All ten committed candidates are already trimmed, so the `42` case above
    // still licenses a local `typeof w.candidate === "string" ? w.candidate : null` at this call
    // site: it passes every other case here and renders the padding straight into the DOM. A
    // padded input is the only one separating the guard's rule from the nearest wrong rule.
    const padded = { ...withCandidate, candidate: "  VENUE ADDRESS  " } as ParseWarning;
    renderRows([padded]);
    expect(screen.getByTestId(tid(0, "candidate")).textContent).toContain("VENUE ADDRESS");
    expect(screen.getByTestId(tid(0, "candidate")).textContent).not.toContain("  VENUE");
  });

  it("renders no candidate line for a code that never carries one", () => {
    const other: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: "an unrecognized role label",
      rawSnippet: "Role | Jordan Ellis",
    };
    renderRows([other]);
    expect(screen.queryByTestId(tid(0, "candidate"))).toBeNull();
  });
});
