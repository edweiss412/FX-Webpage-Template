// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(() => cleanup());

let mountSeq = 0;
// A child whose per-MOUNT sequence is fixed at mount time; if it remounts, the number changes.
function MountProbe({ label }: { label: string }) {
  const [seq] = useState(() => ++mountSeq);
  return <span data-testid={`probe-${label}`}>{seq}</span>;
}
// SAME code, different content → the subtle "reconcile-in-place" index bug (B inherits A's fiber).
const A: ParseWarning = { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Alpha" };
const B: ParseWarning = { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Bravo" };
const controls = (w: ParseWarning) => <MountProbe label={w.rawSnippet!} />;

describe("PerShowActionableWarnings key stability (compound-transition guarantee)", () => {
  test("removing an earlier sibling does NOT remount the later card's child", () => {
    const { rerender } = render(
      <PerShowActionableWarnings items={[A, B]} driveFileId="df" renderItemControls={controls} />,
    );
    const bSeqBefore = screen.getByTestId("probe-Bravo").textContent; // e.g. "2"
    rerender(<PerShowActionableWarnings items={[B]} driveFileId="df" renderItemControls={controls} />); // A ignored
    // With index keys, B is reconciled into A's slot and shows A's mount seq → would FAIL.
    // With stableWarningKeys, B's fiber persists → same seq → PASSES.
    expect(screen.getByTestId("probe-Bravo").textContent).toBe(bSeqBefore);
  });
});
