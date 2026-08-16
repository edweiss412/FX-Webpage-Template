import { describe, expect, it } from "vitest";

import { type PurviewFile, resolveOwnership } from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 5 — purview (spec §5.4).
 *
 * Ownership is DETECTED, not enforced. Nothing stops two orchestrators writing
 * the same paneId, so the classifier reads every registry and reports a
 * doubly-claimed pane as contested rather than driving it.
 */

const ME = "sess-a";
const THEM = "sess-b";

const files = (...fs: PurviewFile[]): PurviewFile[] => fs;

describe("resolveOwnership", () => {
  it("a pane in no registry is unowned", () => {
    const r = resolveOwnership("wM:p1", "feat/x", files({ sessionId: ME, rows: [] }), ME);
    expect(r.kind).toBe("unowned");
  });

  it("a pane in this orchestrator's registry is owned", () => {
    const r = resolveOwnership(
      "wM:p1",
      "feat/x",
      files({
        sessionId: ME,
        rows: [{ paneId: "wM:p1", agentName: "feat/x", branch: "feat/x", dispatchedAt: "" }],
      }),
      ME,
    );
    expect(r.kind).toBe("owned");
  });

  it("a pane claimed by two registries is contested, and neither drives it", () => {
    const row = { paneId: "wM:p1", agentName: "feat/x", branch: "feat/x", dispatchedAt: "" };
    const all = files({ sessionId: ME, rows: [row] }, { sessionId: THEM, rows: [row] });
    premiseHolds(
      "both registries really claim this pane",
      all.every((f) => f.rows.length === 1),
    );
    // Asserted from BOTH sides: contested is symmetric, or the loser drives.
    expect(resolveOwnership("wM:p1", "feat/x", all, ME).kind).toBe("contested");
    expect(resolveOwnership("wM:p1", "feat/x", all, THEM).kind).toBe("contested");
  });

  it("a pane owned by ANOTHER orchestrator is unowned to me, not owned", () => {
    const all = files({
      sessionId: THEM,
      rows: [{ paneId: "wM:p1", agentName: "feat/x", branch: "feat/x", dispatchedAt: "" }],
    });
    expect(resolveOwnership("wM:p1", "feat/x", all, ME).kind).toBe("unowned");
  });

  it("a row whose branch no longer matches the pane is STALE and confers nothing", () => {
    // Round 6's finding. Reusing one terminal pane for a different branch would
    // otherwise leave the previous orchestrator owning — and able to drive — an
    // arc it never dispatched. A fresh worktree has no marker, so the session
    // check no-ops and this is the only guard standing.
    const all = files({
      sessionId: ME,
      rows: [{ paneId: "wM:p1", agentName: "feat/old", branch: "feat/old", dispatchedAt: "" }],
    });
    const r = resolveOwnership("wM:p1", "feat/new", all, ME);
    premiseHolds("the row does claim this paneId", all[0]!.rows[0]!.paneId === "wM:p1");
    if (r.kind !== "unowned") throw new Error(`expected unowned, got ${r.kind}`);
    expect(r.reason).toContain("stale");
  });
});
