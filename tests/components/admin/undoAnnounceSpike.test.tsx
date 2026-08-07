// @vitest-environment jsdom
//
// Task 6 SPIKE — the empirical settlement of spec §3.5.2's UNRATIFIED vector.
//
// Six review rounds argued about whether an announcement survives the region's
// owner being replaced. `docs/agents/spec-self-review.md:22` says a
// design-correctness vector surviving three rounds gets a probe, not a fourth
// paragraph. This file is that probe.
//
// It records what ACTUALLY happens, including the case where the announcement is
// lost. A spike that only demonstrates the happy path would be the same mistake
// as the round-4 probes, which asserted final text and would have passed even
// while the region was destroyed and replaced.
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { useContext, useState } from "react";
import { describe, expect, it } from "vitest";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";
import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";

const MSG = 'Undone. "Crew member Alice Chen removed" no longer applies.';

/** Announces from inside an async continuation, exactly as the wrapped undo
 *  action does: the announce runs AFTER an await, so it can land after its own
 *  component has been unmounted. */
function AsyncAnnouncer({ onReady }: { onReady: (run: () => Promise<void>) => void }) {
  const { announce } = useContext(UndoAnnounceContext);
  onReady(async () => {
    await Promise.resolve();
    announce(MSG);
  });
  return null;
}

describe("SPIKE part 1 — announcement survives a branch swap under a stable provider", () => {
  it("keeps the region node and its entry when children change wholesale", async () => {
    let run!: () => Promise<void>;
    const { rerender } = render(
      <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
        <AsyncAnnouncer onReady={(r) => (run = r)} />
      </AdminAnnounceProvider>,
    );
    const before = screen.getByTestId("admin-undo-status");
    await act(async () => {
      await run();
    });
    rerender(
      <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
        <div data-testid="different-tree">the branch changed</div>
      </AdminAnnounceProvider>,
    );
    expect(screen.getByTestId("admin-undo-status")).toBe(before);
    expect(before).toHaveTextContent(MSG);
  });
});

describe("SPIKE part 2 — announcement resolving AFTER its own component unmounts", () => {
  it("still lands, because the continuation closes over the provider's announce", async () => {
    // This is the sequence the whole design rests on: UndoChangeButton unmounts
    // on success (canUndo flips), and its already-running continuation must
    // still reach a live region.
    let run!: () => Promise<void>;
    function Host() {
      const [showChild, setShowChild] = useState(true);
      return (
        <AdminAnnounceProvider testId="admin-undo-status" label="Status updates">
          {showChild ? <AsyncAnnouncer onReady={(r) => (run = r)} /> : null}
          <button type="button" onClick={() => setShowChild(false)}>
            unmount child
          </button>
        </AdminAnnounceProvider>
      );
    }
    render(<Host />);
    const before = screen.getByTestId("admin-undo-status");

    // Start the action, unmount the announcer mid-flight, then let it resolve.
    const pending = run();
    act(() => {
      screen.getByRole("button", { name: "unmount child" }).click();
    });
    await act(async () => {
      await pending;
    });

    expect(screen.getByTestId("admin-undo-status")).toBe(before);
    expect(before).toHaveTextContent(MSG);
  });
});

describe("SPIKE part 3 — the provider itself being REMOUNTED", () => {
  it("DOES lose the announcement, which is why the owner must sit above every branch", async () => {
    // Recorded as the negative result it is. This is what happens when the
    // provider is remounted (a `key` change, or a fallback-to-real swap that
    // destroys and recreates the shell): state and region both go.
    //
    // The design's answer is not that remounting is survivable — it is that no
    // announcement ORIGINATES before its provider is mounted and stays mounted.
    // The layout provider is never remounted by a data branch; the dialog
    // provider is created with its shell, and undo is only reachable in the
    // resolved shell, after any fallback swap has already happened.
    let run!: () => Promise<void>;
    const { rerender } = render(
      <AdminAnnounceProvider key="a" testId="admin-undo-status" label="Status updates">
        <AsyncAnnouncer onReady={(r) => (run = r)} />
      </AdminAnnounceProvider>,
    );
    const before = screen.getByTestId("admin-undo-status");
    await act(async () => {
      await run();
    });
    expect(before).toHaveTextContent(MSG);

    rerender(
      <AdminAnnounceProvider key="b" testId="admin-undo-status" label="Status updates">
        <div>remounted</div>
      </AdminAnnounceProvider>,
    );

    const after = screen.getByTestId("admin-undo-status");
    expect(after).not.toBe(before); // node really was replaced
    expect(after).toHaveTextContent(""); // and the announcement went with it
  });
});
