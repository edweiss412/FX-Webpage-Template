// tests/components/admin/perShowActionableCondensed.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §3: condensed moves CATALOG guidance
 *  into the popover BODY (described run - superset of full mode), instance lines
 *  stay inline, and the 8-row slot table is total. Failure modes caught: guidance
 *  demoted to afterBodyText (outside aria-describedby), catalog line still inline
 *  or leaking into any OTHER card element when condensed (anti-tautology: the card
 *  subtree is checked whole, spec §6), condensed={false} diverging from omission. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PerShowActionableWarnings,
  condensedPopoverSlots,
} from "@/components/admin/PerShowActionableWarnings";
import { messageFor } from "@/lib/messages/lookup";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

// FIELD_UNREADABLE carries BOTH helpfulContext and triggerContext in the catalog
// (registry rows in tests/messages/warningCardCopyRegistry.ts), so it exercises
// table row 2 (g + c, no f). Expected strings DERIVE from the catalog at runtime
// (anti-tautology: a copy edit moves the expectation with it).
const fieldWarn: ParseWarning = {
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: 'Crew phone for row 1 could not be read ("N/A")',
  rawSnippet: "N/A",
  blockRef: { kind: "crew", index: 0, name: "Alice Anders" },
};

// ROLE_TOKEN_AUTOCORRECTED with an autocorrect payload → INSTANCE guidance
// (resolveGuidance short-circuits; spec Resolved Decision 3).
const instanceWarn: ParseWarning = {
  severity: "warn",
  code: "ROLE_TOKEN_AUTOCORRECTED",
  message: "Role token autocorrected",
  rawSnippet: "A2 Audoi",
  // Producer shape per lib/parser/types.ts:93-96 (subject + corrections pairs).
  autocorrect: {
    subject: "Alice Anders",
    corrections: [{ detected: "Audoi", corrected: "Audio" }],
  },
};

const entry = messageFor("FIELD_UNREADABLE");
const guidance = (entry.helpfulContext ?? "").trim().replace(/[*_`]/g, "");
const trigger = (entry.triggerContext ?? "").trim().replace(/[*_`]/g, "");

function popoverFor(i: number) {
  const item = screen.getAllByTestId("per-show-actionable-item")[i]!;
  const btn = item.querySelector("[data-testid$='-trigger']")!;
  const describedEl = document.getElementById(btn.getAttribute("aria-describedby") ?? "");
  return { item, btn, describedEl };
}

describe("condensedPopoverSlots (8-row table, spec §3)", () => {
  const g = "G sentence.";
  const c = "C sentence.";
  const f = "F sentence.";
  it.each([
    [g, c, f, `${g} ${c}`, f],
    [g, c, null, `${g} ${c}`, null],
    [g, null, f, `${g} ${f}`, null],
    [g, null, null, g, null],
    [null, c, f, c, f],
    [null, c, null, c, null],
    [null, null, f, f, null],
    [null, null, null, null, null],
  ])("g=%s c=%s f=%s", (movedGuidance, context, followUp, body, after) => {
    expect(condensedPopoverSlots({ movedGuidance, context, followUp })).toEqual({
      popoverBody: body,
      afterBodyText: after,
    });
  });
});

describe("condensed rendering (spec §3)", () => {
  it("catalog guidance leaves the CARD subtree entirely and joins the DESCRIBED popover body", () => {
    render(<PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} condensed />);
    expect(screen.queryByTestId("per-show-actionable-guidance")).toBeNull();
    const { item, describedEl } = popoverFor(0);
    // Anti-tautology (spec §6): the popover body is PORTALED out of the card
    // (hoverhelp-smart-position #549), so the card subtree must not contain the
    // guidance in ANY element, tagged or not.
    expect(item.textContent ?? "").not.toContain(guidance);
    const text = describedEl?.textContent ?? "";
    expect(text).toContain(trigger);
    expect(text).toContain(guidance);
  });

  it("full mode is untouched: guidance inline, popover body = triggerContext only", () => {
    render(<PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} />);
    expect(screen.getByTestId("per-show-actionable-guidance").textContent).toContain(guidance);
    const { describedEl } = popoverFor(0);
    expect(describedEl?.textContent ?? "").not.toContain(guidance);
  });

  it("instance guidance stays inline under condensed (Resolved Decision 3)", () => {
    render(<PerShowActionableWarnings items={[instanceWarn]} driveFileId={null} condensed />);
    const inline = screen.getByTestId("per-show-actionable-guidance");
    expect(inline.textContent).toContain("Audio");
  });

  it("condensed={false} behaves as full mode (spec guard, R1-F6)", () => {
    // NOT a byte comparison: HoverHelp embeds useId() output, which differs across
    // React roots, so innerHTML equality is false-red (plan-R2 F1). Assert the
    // semantic contract instead - the same pair of observations that define full
    // mode above: guidance inline, and absent from the popover description.
    render(<PerShowActionableWarnings items={[fieldWarn]} driveFileId={null} condensed={false} />);
    expect(screen.getByTestId("per-show-actionable-guidance").textContent).toContain(guidance);
    const { describedEl } = popoverFor(0);
    expect(describedEl?.textContent ?? "").not.toContain(guidance);
  });
});
