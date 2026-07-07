// @vitest-environment jsdom
//
// Flow 3 (audit 3.1) — CorrectionLoopCallout. Failure modes:
//  (a) callout silently dropped / wrong verb per mode;
//  (b) the affordance slot (per-show <ReSyncButton>) not rendered inside the callout;
//  (c) copy drift breaking the single-source (verb-only) invariant (spec §5);
//  (d) an em dash sneaking into UI copy (DESIGN.md:318).
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";

afterEach(cleanup);

const RESYNC =
  "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-parse and clear this.";
const RESCAN =
  "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-parse and clear this.";

it("resync mode renders the exact re-sync copy and its affordance child", () => {
  render(
    <CorrectionLoopCallout mode="resync">
      <button data-testid="the-affordance">Re-sync from Drive</button>
    </CorrectionLoopCallout>,
  );
  const callout = screen.getByTestId("correction-loop-callout");
  expect(callout).toHaveTextContent(RESYNC);
  // affordance slot renders inside the callout
  expect(within(callout).getByTestId("the-affordance")).toBeInTheDocument();
});

it("rescan mode renders the exact re-scan copy; no affordance required", () => {
  render(<CorrectionLoopCallout mode="rescan" />);
  const callout = screen.getByTestId("correction-loop-callout");
  expect(callout).toHaveTextContent(RESCAN);
});

it("the two modes differ ONLY in the verb (single-source copy) and carry no em dash", () => {
  // Executable single-source invariant (spec §5): normalizing the verb must make
  // the two rendered strings identical. Two independently-authored literals would
  // fail this the moment their prefix/suffix drift.
  const { rerender } = render(<CorrectionLoopCallout mode="resync" />);
  const resyncText = screen.getByTestId("correction-loop-callout").textContent ?? "";
  rerender(<CorrectionLoopCallout mode="rescan" />);
  const rescanText = screen.getByTestId("correction-loop-callout").textContent ?? "";
  const norm = (s: string) => s.replace(/re-sync|re-scan/g, "VERB");
  expect(norm(resyncText)).toBe(norm(rescanText));
  expect(resyncText + rescanText).not.toMatch(/[—]|--/);
});
