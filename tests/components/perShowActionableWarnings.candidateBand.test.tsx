// @vitest-environment jsdom
// The per-show candidate band, and the composed detail-band collapse.
//
// Spec §3.2 (the band) and §3.3 (the four-state collapse).
//
// THE THREE CASES DO NOT HAVE THE SAME STATUS against today's code, and that is deliberate:
//   case 1 FAILS today, because nothing renders the candidate. It is the red.
//   case 2 passes today trivially (nothing renders), and guards the absent case afterwards.
//   case 3 passes today, and is the only case that fails on the OBVIOUS wrong implementation:
//          composing the two bands into a fragment unconditionally, which `present()` sees as an
//          object and renders as an empty bordered band on every card with no detail content.
// Case 3 is therefore a regression guard rather than a red, and it is the reason this task is
// not just markup.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";
import { nearMissWarningPair } from "../_shared/nearMissWarning";

const DFID = "d1";

describe("PerShowActionableWarnings candidate band", () => {
  const { withCandidate, withoutCandidate } = nearMissWarningPair();

  it("names the matched candidate, alongside the sheet-row band", () => {
    render(<PerShowActionableWarnings items={[withCandidate]} driveFileId={DFID} />);
    // Derived from the warning itself, never a literal: a hardcoded "VENUE ADDRESS" would keep
    // passing if the §3.1 tie-break changed, asserting the test author's memory instead.
    expect(screen.getByTestId("per-show-actionable-candidate-value").textContent).toBe(
      withCandidate.candidate,
    );
    expect(screen.getByTestId("per-show-actionable-row-label-value").textContent).not.toBe("");
    // Grammar, not just the value: without this, rendering the bare guarded string satisfies
    // every other case and the settled band markup becomes optional.
    const band = screen.getByTestId("per-show-actionable-candidate");
    expect(band.textContent).toContain("Looks like");
    expect(
      band.querySelector('[data-testid="per-show-actionable-candidate-value"]'),
    ).not.toBeNull();
  });

  it("renders no candidate band when the key is absent, and keeps the sheet-row band", () => {
    render(<PerShowActionableWarnings items={[withoutCandidate]} driveFileId={DFID} />);
    // Premise: the warning DID reach the component and render a card. Without this the absence
    // assertion below would pass on a fixture that rendered nothing at all.
    expect(screen.getByTestId("per-show-actionable-item")).toBeTruthy();
    expect(screen.queryByTestId("per-show-actionable-candidate")).toBeNull();
    expect(screen.getByTestId("per-show-actionable-row-label-value").textContent).not.toBe("");
  });

  it("renders no candidate band when the persisted value is not a string", () => {
    // Round-2 finding 2, and the ONLY case tying task 1's guard to this call site. Every other
    // case here passes if the component renders `w.candidate` directly while candidateLabel sits
    // beside it as unused, fully-tested code. The jsonb boundary is unvalidated, so a persisted
    // number is reachable; direct rendering would put "42" in the DOM.
    const numeric = { ...withCandidate, candidate: 42 } as unknown as ParseWarning;
    render(<PerShowActionableWarnings items={[numeric]} driveFileId={DFID} />);
    expect(screen.getByTestId("per-show-actionable-item")).toBeTruthy();
    expect(screen.queryByTestId("per-show-actionable-candidate")).toBeNull();
  });

  it("renders the value TRIMMED when the persisted candidate carries padding", () => {
    // Round-3 finding 1. All ten committed candidates are already trimmed, so the `42` case above
    // still licenses a local `typeof w.candidate === "string" ? w.candidate : null` at this call
    // site: it passes every other case here and renders the padding straight into the DOM. A
    // padded input is the only one separating the guard's rule from the nearest wrong rule.
    const padded = { ...withCandidate, candidate: "  VENUE ADDRESS  " } as ParseWarning;
    render(<PerShowActionableWarnings items={[padded]} driveFileId={DFID} />);
    expect(screen.getByTestId("per-show-actionable-candidate-value").textContent).toBe(
      "VENUE ADDRESS",
    );
  });

  it("renders NO detail band at all when there is neither a row label nor a candidate", () => {
    // UNKNOWN_ROLE_TOKEN is OPERATOR_ACTIONABLE_ANCHORED (lib/parser/dataGaps.ts:406-431) but is
    // not UNKNOWN_FIELD, so the row-label band is gated off (PerShowActionableWarnings.tsx:200),
    // and it is not FIELD_UNREADABLE, so the field band is gated off too (:210). Both parts of
    // the composed slot are null.
    const bare: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: "an unrecognized role label",
      blockRef: { kind: "crew", name: "Jordan Ellis" },
    };
    render(<PerShowActionableWarnings items={[bare]} driveFileId={DFID} />);
    expect(screen.getByTestId("per-show-actionable-item")).toBeTruthy();
    expect(screen.queryByTestId("compact-alert-detail-band")).toBeNull();
  });
});
