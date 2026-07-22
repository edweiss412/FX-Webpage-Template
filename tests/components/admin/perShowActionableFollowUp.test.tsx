// tests/components/admin/perShowActionableFollowUp.test.tsx
// @vitest-environment jsdom
/** Spec §3.1/§8.1: follow-up renders as a second popover paragraph OUTSIDE the
 *  described element; staged-shaped callers (no followUpCopy) are byte-identical.
 *  Fixtures copy real emitter shapes: TYPO/DOUBLE_LOCATION have no sourceCell
 *  (lib/parser/personalization.ts:71-77, blocks/venue.ts:134-141); the
 *  followUp-bearing card uses an OPERATOR_ACTIONABLE_ANCHORED warn shape.
 *  UNKNOWN_ROLE_TOKEN carries catalog triggerContext (catalog.ts:1234), so its
 *  popover exists and the red phase fails on the JOINED text, not a missing
 *  popover. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const FOLLOW_UP =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.";

const warnWithCell: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "Unknown role token",
  rawSnippet: "FX Teck",
  sourceCell: { title: "INFO", gid: 0, a1: "B12" }, // SourceAnchor shape: buildSheetDeepLink.ts:3
};

function bodyFor(i: number) {
  const item = screen.getAllByTestId("per-show-actionable-item")[i]!;
  const trigger = item.querySelector("[data-testid$='-trigger']")!;
  const body = item.querySelector("[data-testid$='-body']")!;
  const describedEl = document.getElementById(trigger.getAttribute("aria-describedby") ?? "");
  return { trigger, body, describedEl };
}

describe("per-card follow-up placement (spec §3.1)", () => {
  it("followUp card: second paragraph outside the described element", () => {
    render(
      <PerShowActionableWarnings items={[warnWithCell]} driveFileId="d1" followUpCopy={FOLLOW_UP} />,
    );
    const { body, describedEl } = bodyFor(0);
    expect(describedEl?.textContent ?? "").not.toContain("Fixed it in the sheet?");
    const p = body.querySelector("p.mt-2");
    expect(p?.textContent).toBe(FOLLOW_UP);
  });

  it("staged-shaped caller (no followUpCopy): describedby spans whole body, no extra paragraph", () => {
    render(<PerShowActionableWarnings items={[warnWithCell]} driveFileId="d1" />);
    const { body, describedEl } = bodyFor(0);
    expect(describedEl).toBe(body);
    expect(body.querySelector("p.mt-2")).toBeNull();
  });

  it("context-null guard: non-catalog code with sourceCell renders followUp AS the described body", () => {
    // isMessageCode("NOT_A_CATALOG_CODE") is false -> entry null -> trigger
    // context null; the ratified guard makes the follow-up the body (spec
    // §3.1 boundary). Catches: guard omitted (no trigger at all) or inverted
    // (followUp in afterBodyText with an empty described body).
    const noContext: ParseWarning = {
      severity: "warn",
      code: "NOT_A_CATALOG_CODE",
      message: "A human message",
      rawSnippet: "row",
      sourceCell: { title: "INFO", gid: 0, a1: "C3" },
    };
    render(
      <PerShowActionableWarnings items={[noContext]} driveFileId="d1" followUpCopy={FOLLOW_UP} />,
    );
    const { body, describedEl } = bodyFor(0);
    expect(describedEl).toBe(body); // no afterBody -> describedby stays whole body
    expect(describedEl!.textContent).toBe(FOLLOW_UP);
    expect(body.querySelector("p.mt-2")).toBeNull();
  });

  it("no sourceCell: no follow-up paragraph even with followUpCopy (existing gate)", () => {
    const noCell: ParseWarning = {
      severity: "info",
      code: "TYPO_NORMALIZED",
      message: "Typo alias 'venu' normalized to canonical 'venue'",
      rawSnippet: "venu",
    };
    render(<PerShowActionableWarnings items={[noCell]} driveFileId="d1" followUpCopy={FOLLOW_UP} />);
    const item = screen.getAllByTestId("per-show-actionable-item")[0]!;
    expect(item.querySelector("p.mt-2")).toBeNull();
    // The sentence must be absent from the ENTIRE card, not just the extra
    // paragraph slot — catches a regression to the old joined-into-body form.
    expect(item.textContent ?? "").not.toContain("Fixed it in the sheet?");
  });
});
