// Spec-time lifecycle spike (R13 F1, R14 F2, claim corrected R15 F1): with
// layout-effect ownership registration, the ledger names the new owner FROM
// THE COMMIT ONWARD — so a pending write's resolution, whenever it lands
// (this environment flushes passive effects before the queued microtask, and
// that ordering is recorded, not fought), always observes the new owner. The
// claim is ledger-correctness-from-commit, not resolution-before-passive. EXECUTED 2026-08-10 on this worktree (copied under tests/components/
// for the include-glob): 1 passed. Run: copy under tests/components/, vitest run.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React, { useEffect, useLayoutEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const ledger: { owner: string | null } = { owner: null };
const observations: Array<{ phase: string; owner: string | null }> = [];
let releasePending: (() => void) | null = null;

function Island({ id }: { id: string }) {
  useLayoutEffect(() => {
    ledger.owner = id; // synchronous with commit
    observations.push({ phase: `layout:${id}`, owner: ledger.owner });
    if (id === "B" && releasePending) {
      // Queue the pending write's release as a microtask FROM the commit
      // phase. (Measured below: in this environment it runs AFTER passive
      // effects — the ordering is recorded, and truth never depends on it.)
      queueMicrotask(releasePending);
      releasePending = null;
    }
    return () => {
      if (ledger.owner === id) ledger.owner = null;
    };
  }, [id]);
  useEffect(() => {
    observations.push({ phase: `passive:${id}`, owner: ledger.owner });
  }, [id]);
  return React.createElement("span", null, id);
}

describe("layout-effect ownership closes the commit-to-passive window", () => {
  it("a resolution after a real remount sees the new owner, whenever it lands", async () => {
    const div = document.createElement("div");
    const root = createRoot(div);
    // keyed render → unmount A, mount B is a REAL remount
    await act(async () => root.render(React.createElement(Island, { id: "A", key: "A" })));
    expect(ledger.owner).toBe("A");

    const pending = new Promise<void>((r) => (releasePending = r));
    const resolution = pending.then(() => {
      observations.push({ phase: "resolution", owner: ledger.owner });
    });

    await act(async () => root.render(React.createElement(Island, { id: "B", key: "B" })));
    await resolution;

    const phases = observations.map((o) => o.phase);
    // The resolution ran, and it observed B — with A's cleanup + B's layout
    // registration already applied, before-or-after passive is irrelevant to
    // truth, but the ordering proves it landed no earlier than B's commit.
    const res = observations.find((o) => o.phase === "resolution");
    expect(res?.owner).toBe("B");
    expect(phases.indexOf("resolution")).toBeGreaterThan(phases.indexOf("layout:B"));
    // Recorded environment fact, ASSERTED (R15 F1/R16 F1): passive:B flushes
    // before the queued microtask here — environment-dependent, irrelevant to
    // truth, which layout-time registration fixes at commit.
    expect(phases.indexOf("resolution")).toBeGreaterThan(phases.indexOf("passive:B"));
    // Passive observation confirms no later flip.
    const passiveB = observations.filter((o) => o.phase === "passive:B").pop();
    expect(passiveB?.owner).toBe("B");
    await act(async () => root.unmount());
  });
});
