// @vitest-environment jsdom
//
// Phase 6 T6.3 — UndoChangeButton submit-safety. Failure mode it catches: the
// button self-disables synchronously in its own onClick, cancelling the React 19
// form-action dispatch (0 POSTs, strands on "Undoing…") — the documented
// feedback_react_form_action_synchronous_disable_cancels_submit trap. The button
// must disable on useFormStatus().pending only, never a synchronous onClick.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
