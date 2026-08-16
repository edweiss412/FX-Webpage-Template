// @vitest-environment jsdom
//
// Phase 6 T6.3 + P6-F1 — UndoChangeButton submit-safety AND typed-failure
// surfacing. Failure modes:
//  - submit-safety: the button self-disables synchronously in its own onClick,
//    cancelling the React 19 form-action dispatch (0 POSTs, strands on "Undoing…")
//    — the feedback_react_form_action_synchronous_disable_cancels_submit trap.
//  - P6-F1: the undo action returns a typed {ok:false, code} (UNDO_SUPERSEDED /
//    UNDO_EMAIL_CLAIMED / UNDO_NOT_FOUND) but the component DISCARDS it — no
//    ErrorExplainer, no catalog copy, no indication why nothing changed. The
//    component must surface the typed failure via lib/messages (invariant 5).
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UndoChangeButton, type UndoButtonResult } from "@/components/admin/UndoChangeButton";
import { UndoAnnounceContext } from "@/components/admin/undoAnnounceContext";

afterEach(cleanup);

it("submits inside a <form action={...}> and disables on isPending only", () => {
  const action = vi.fn();
  render(<UndoChangeButton changeLogId="cl-1" undoAction={action} />);
  const btn = screen.getByRole("button", { name: /undo this change/i });
  // the button lives inside a form whose action is the server action,
  // and has NO onClick that calls setState/disabled synchronously
  expect(btn.closest("form")).not.toBeNull();
  expect(btn).not.toBeDisabled(); // not pre-disabled at rest
  // the changeLogId is carried as a hidden form field so the bound action
  // targets the right log row.
  expect(screen.getByDisplayValue("cl-1")).toBeInTheDocument();
});

it("surfaces UNDO_SUPERSEDED post-submit via ErrorExplainer (catalog copy, no raw code) — P6-F1", async () => {
  const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_SUPERSEDED" });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  // Scoped INSIDE the result node: with the region always mounted, a global
  // getByText could be satisfied by copy another element renders.
  expect(
    within(await screen.findByTestId("change-feed-undo-result")).getByTestId(
      "error-explainer-message",
    ),
  ).toHaveTextContent(/nothing to undo/i);
  expect(screen.queryByText("UNDO_SUPERSEDED")).toBeNull();
});

it("surfaces UNDO_EMAIL_CLAIMED post-submit via ErrorExplainer — P6-F1", async () => {
  const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_EMAIL_CLAIMED" });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  expect(
    within(await screen.findByTestId("change-feed-undo-result")).getByTestId(
      "error-explainer-message",
    ),
  ).toHaveTextContent(/belongs to someone else/i);
  expect(screen.queryByText("UNDO_EMAIL_CLAIMED")).toBeNull();
});

it("renders NO error panel on a successful undo ({ok:true}) — P6-F1", async () => {
  const undoAction = vi.fn().mockResolvedValue({ ok: true });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  // Always-mounted live region: present but EMPTY is the no-failure state.
  expect(screen.getByTestId("change-feed-undo-result")).toHaveTextContent("");
});

it("stretch=false (default) → button not w-full; stretch → form + button w-full", () => {
  const action = vi.fn().mockResolvedValue({ ok: true });
  const { rerender } = render(<UndoChangeButton changeLogId="c" undoAction={action} />);
  const btn = screen.getByTestId("change-feed-undo");
  expect(btn.className).not.toMatch(/\bw-full\b/);
  rerender(<UndoChangeButton changeLogId="c" undoAction={action} stretch />);
  const stretched = screen.getByTestId("change-feed-undo");
  expect(stretched.className).toMatch(/\bw-full\b/);
  expect(stretched.closest("form")!.className).toMatch(/\bw-full\b/);
});

it("quiet=false (default) → bordered; quiet → borderless transparent (recessive secondary)", () => {
  const action = vi.fn().mockResolvedValue({ ok: true });
  const { rerender } = render(<UndoChangeButton changeLogId="c" undoAction={action} />);
  expect(screen.getByTestId("change-feed-undo").className).toMatch(/border-text-faint/);
  rerender(<UndoChangeButton changeLogId="c" undoAction={action} quiet />);
  const q = screen.getByTestId("change-feed-undo");
  expect(q.className).toMatch(/border-transparent/);
  expect(q.className).toMatch(/bg-transparent/);
  expect(q.className).not.toMatch(/border-text-faint/);
});

// ---- Task 4: success announcement (spec §3.3a) ----

function renderWithSpy(
  undoAction: (p: UndoButtonResult | null, f: FormData) => Promise<UndoButtonResult>,
  announceLabel?: string,
) {
  const announce = vi.fn();
  const ui = render(
    <UndoAnnounceContext.Provider value={{ announce }}>
      <UndoChangeButton
        changeLogId="cl-1"
        undoAction={undoAction}
        {...(announceLabel === undefined ? {} : { announceLabel })}
      />
    </UndoAnnounceContext.Provider>,
  );
  return { announce, ...ui };
}

const clickUndo = async () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });

it("announces the row's summary exactly once on {ok:true}", async () => {
  // Catches: the feature silently not firing, and double-announcing one submit.
  // The literal is the real generator shape, not an invented one.
  const { announce } = renderWithSpy(
    vi.fn().mockResolvedValue({ ok: true }),
    "Crew member Alice Chen removed",
  );
  await clickUndo();
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith(
    'Undone. "Crew member Alice Chen removed" no longer applies.',
  );
});

it("announces NOTHING on a typed failure", async () => {
  // Catches: announcing a success that did not happen.
  const { announce } = renderWithSpy(
    vi.fn().mockResolvedValue({ ok: false, code: "UNDO_SUPERSEDED" }),
    "Crew member Alice Chen removed",
  );
  await clickUndo();
  expect(announce).not.toHaveBeenCalled();
});

it("announces NOTHING when the action throws", async () => {
  const { announce } = renderWithSpy(vi.fn().mockRejectedValue(new Error("boom")), "X");
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
    });
  } catch {
    // The rejection propagating is today's behavior and not what this test pins;
    // what matters is that nothing was announced for a failed undo.
  }
  expect(announce).not.toHaveBeenCalled();
});

it("falls back to the bare sentence when no announceLabel is given", async () => {
  const { announce } = renderWithSpy(vi.fn().mockResolvedValue({ ok: true }));
  await clickUndo();
  expect(announce).toHaveBeenCalledWith("Change undone.");
});

it("does not throw or announce when mounted with NO provider", async () => {
  // Catches: the no-op default failing to hold. Silence here is correct;
  // the structural guard is what stops it becoming silence in production.
  const undoAction = vi.fn().mockResolvedValue({ ok: true });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} announceLabel="X" />);
  await clickUndo();
  expect(undoAction).toHaveBeenCalledTimes(1);
  // The "or announce" half, which was previously unasserted: with no provider
  // the no-op default runs, so nothing reaches any region on the page.
  expect(document.querySelector('[role="log"]')).toBeNull();
});

it("keeps the SAME result node across a failure (never a node insertion)", async () => {
  // The whole reason the wrapper is always mounted: a live region inserted at
  // announce time is the classic not-announced pitfall (DESIGN.md:479). Text
  // equality alone would pass even if the node had been destroyed and replaced.
  const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_SUPERSEDED" });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  const before = screen.getByTestId("change-feed-undo-result");
  expect(before).toHaveTextContent("");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  expect(screen.getByTestId("change-feed-undo-result")).toBe(before);
  expect(before).not.toHaveTextContent("");
});
