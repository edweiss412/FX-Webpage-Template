// Spec-time lifecycle spike (wifi spec R13 F1): does layout-effect ownership
// registration close the commit-to-passive-microtask window? Ratified evidence
// for the spec's §4.1 active-owner design. EXECUTED 2026-08-10 on this worktree
// (copied under tests/components/ for the include-glob, 1 passed/1): the stale
// resolution's microtask observed owner B — the window is empty by construction.
// Run: copy under tests/components/ and pnpm vitest run <file>
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import React, { useEffect, useLayoutEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const ledger: { owner: string | null; ownerAtPassive: string | null } = {
  owner: null,
  ownerAtPassive: null,
};

function Island({ id }: { id: string }) {
  useLayoutEffect(() => {
    ledger.owner = id; // layout effect: synchronous with commit
    return () => {
      if (ledger.owner === id) ledger.owner = null;
    };
  }, [id]);
  useEffect(() => {
    ledger.ownerAtPassive = ledger.owner; // what a passive effect would have seen
  }, [id]);
  return React.createElement("span", null, id);
}

describe("layout-effect ownership closes the commit window", () => {
  it("a microtask resolving after commit already sees the new owner", async () => {
    const div = document.createElement("div");
    const root = createRoot(div);
    await act(async () => root.render(React.createElement(Island, { id: "A" })));
    expect(ledger.owner).toBe("A");

    // Pending write issued by A, resolution manually controlled.
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r));
    const seenOwner: string[] = [];
    const resolution = pending.then(() => {
      seenOwner.push(ledger.owner ?? "none");
    });

    // Remount as B. Layout effect registers B inside the commit.
    await act(async () => root.render(React.createElement(Island, { id: "B" })));
    expect(ledger.owner).toBe("B");

    // Release A's write OUTSIDE act; its microtask runs after B's commit.
    release();
    await resolution;
    expect(seenOwner).toEqual(["B"]); // the stale resolution can never observe a gap
    await act(async () => root.unmount());
  });
});
