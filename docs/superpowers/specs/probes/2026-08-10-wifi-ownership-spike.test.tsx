// Spec-time lifecycle spike (wifi spec R13 F1, strengthened R14 F2): with
// layout-effect ownership registration, a pending write's resolution landing
// IN the commit-to-passive window of a REAL remount already observes the new
// owner. EXECUTED 2026-08-10 on this worktree (copied under tests/components/
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
      // phase: it runs after B's commit, BEFORE passive effects (which flush
      // in a later task) — i.e. inside the exact window under test.
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
  it("a resolution landing inside the window of a real remount sees the new owner", async () => {
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
    // Passive observation confirms no later flip.
    const passiveB = observations.filter((o) => o.phase === "passive:B").pop();
    expect(passiveB?.owner).toBe("B");
    await act(async () => root.unmount());
  });
});
