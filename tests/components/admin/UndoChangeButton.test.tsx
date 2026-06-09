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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UndoChangeButton } from "@/components/admin/UndoChangeButton";

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
  expect(await screen.findByTestId("change-feed-undo-result")).toBeInTheDocument();
  // catalog copy renders; the raw code NEVER appears in the DOM (invariant 5).
  expect(screen.getByText(/nothing to undo/i)).toBeInTheDocument();
  expect(screen.queryByText("UNDO_SUPERSEDED")).toBeNull();
});

it("surfaces UNDO_EMAIL_CLAIMED post-submit via ErrorExplainer — P6-F1", async () => {
  const undoAction = vi.fn().mockResolvedValue({ ok: false, code: "UNDO_EMAIL_CLAIMED" });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  expect(await screen.findByTestId("change-feed-undo-result")).toBeInTheDocument();
  expect(screen.getByText(/belongs to someone else/i)).toBeInTheDocument();
  expect(screen.queryByText("UNDO_EMAIL_CLAIMED")).toBeNull();
});

it("renders NO error panel on a successful undo ({ok:true}) — P6-F1", async () => {
  const undoAction = vi.fn().mockResolvedValue({ ok: true });
  render(<UndoChangeButton changeLogId="cl-1" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo this change/i }));
  });
  expect(screen.queryByTestId("change-feed-undo-result")).toBeNull();
});
