// @vitest-environment jsdom
// The wizard step-3 row-label gate: the half of audit idx46/#217 that never landed here.
//
// The per-show surface gates its row label on UNKNOWN_FIELD
// (components/admin/PerShowActionableWarnings.tsx:200), a defense ratified by audit idx46/#217
// against other anchored codes writing a raw markdown row into that band. The wizard never got
// the same gate: components/admin/wizard/step3ReviewSections.tsx:3103 calls labelFromRawSnippet
// unconditionally.
//
// It is reachable, not hypothetical. lib/parser/pull-sheet.ts:252 and :343 both set rawSnippet to
// a RAW pipe-delimited row, and lib/admin/visibleWarningRows.ts:18-22 passes every warning
// through on the wizard, where routedWarningsRenderElsewhere is false.
//
// Both cases are in ONE render on purpose. The first alone would pass on a gate that suppressed
// every label; the second is what makes the pair discriminating.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

const DFID = "drive-abc-123";
const tid = (i: number, suffix: string) => `wizard-step3-card-${DFID}-warning-${i}-${suffix}`;

/** BOTH producers, because round 2 caught that one fixture licenses a gate excluding only that
 *  one code. lib/parser/pull-sheet.ts:343 sets `rawSnippet: row`; :252 sets
 *  `rawSnippet: nonFiveColumnRow`. Both are raw table rows. */
const pullSheetPartial: ParseWarning = {
  severity: "warn",
  code: "PULL_SHEET_PARSE_PARTIAL",
  message: 'Pull sheet case "Case 3" has a row with unparseable qty.',
  blockRef: { kind: "pull_sheet" },
  rawSnippet: "| 2x | Shure SM58 | wireless | Case 3 |",
};

const pullSheetAmbiguous: ParseWarning = {
  severity: "warn",
  code: "PULL_SHEET_AMBIGUOUS_FORMAT",
  message: 'Pull sheet case "Case 4" has rows with unexpected column count (expected 5).',
  blockRef: { kind: "pull_sheet" },
  rawSnippet: "| 1x | Yamaha CL5 | Case 4 |",
};

/** In NEITHER family. Two PULL codes plus one UNKNOWN_FIELD cannot separate the stated gate
 *  from its negative twin `!w.code.startsWith("PULL_SHEET_")`: those agree on all three. This
 *  one separates them, because the negative gate renders a label for it and the stated gate
 *  does not. An accept-set fails CLOSED on the unknown case; a deny-set fails OPEN. */
const neitherFamily: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "an unrecognized role label",
  blockRef: { kind: "crew", name: "Jordan Ellis" },
  rawSnippet: "Role | Jordan Ellis",
};

const unknownField: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized client row label: 'Address:'",
  blockRef: { kind: "client", name: "Address:" },
  rawSnippet: "Address: | 1270 AVENUE OF THE AMERICAS",
};

describe("wizard step-3 row-label gate", () => {
  it("renders no row label for a code whose rawSnippet is a raw table row, and keeps it for UNKNOWN_FIELD", () => {
    render(
      <WarningsBreakdown
        dfid={DFID}
        warnings={[pullSheetPartial, pullSheetAmbiguous, neitherFamily, unknownField]}
        mode="rescan"
      />,
    );

    // Premise: BOTH rows rendered. Without this, an empty list satisfies the absence assertion.
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-warning-0`)).toBeTruthy();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-warning-1`)).toBeTruthy();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-warning-2`)).toBeTruthy();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-warning-3`)).toBeTruthy();

    // FAILS today: labelFromRawSnippet returns "" for the leading empty cell, or the first cell
    // of the row, and renders it as a field label that does not exist in the sheet.
    expect(screen.queryByTestId(tid(0, "label"))).toBeNull();
    expect(screen.queryByTestId(tid(1, "label"))).toBeNull();
    // The discriminator against a negative PULL-only gate.
    expect(screen.queryByTestId(tid(2, "label"))).toBeNull();

    // The control. A gate that suppressed every label would pass the assertion above.
    expect(screen.getByTestId(tid(3, "label")).textContent).toContain("Address:");
  });
});
