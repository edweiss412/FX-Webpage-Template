// @vitest-environment jsdom
//
// Flow-4 T5 — AcceptChangeButton form-action submit-safety AND typed-failure
// surfacing. A near-copy of UndoChangeButton, but renders one hidden <input>
// per `hiddenFields` entry so callers can carry either single-row
// ({ showId, changeLogId }) or Accept-all ({ showId, ids }) payloads.
// Failure modes it guards:
//  - submit-safety: the button must NOT self-disable synchronously in its own
//    onClick, which cancels the React 19 form-action dispatch (0 POSTs) —
//    feedback_react_form_action_synchronous_disable_cancels_submit.
//  - typed failure: the accept action returns {ok:false, code} but the
//    component must SURFACE it via ErrorExplainer (catalog copy, no raw code —
//    invariant 5), not discard it.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AcceptChangeButton } from "@/components/admin/AcceptChangeButton";

afterEach(cleanup);

it("submits inside a <form action={...}>, is not pre-disabled, and renders one hidden input per hiddenFields entry", () => {
  const action = vi.fn();
  render(
    <AcceptChangeButton acceptAction={action} hiddenFields={{ showId: "s1", changeLogId: "c1" }} />,
  );
  const btn = screen.getByRole("button", { name: /accept/i });
  expect(btn.closest("form")).not.toBeNull();
  expect(btn).not.toBeDisabled(); // not pre-disabled at rest
  // one hidden input per entry, carrying name + value verbatim.
  const showIdInput = screen.getByDisplayValue("s1");
  expect(showIdInput).toHaveAttribute("type", "hidden");
  expect(showIdInput).toHaveAttribute("name", "showId");
  const changeLogInput = screen.getByDisplayValue("c1");
  expect(changeLogInput).toHaveAttribute("type", "hidden");
  expect(changeLogInput).toHaveAttribute("name", "changeLogId");
});

it('defaults the button label to "Accept" and honors a custom label', () => {
  const action = vi.fn();
  const { rerender } = render(<AcceptChangeButton acceptAction={action} hiddenFields={{}} />);
  expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  rerender(<AcceptChangeButton acceptAction={action} hiddenFields={{}} label="Accept all" />);
  expect(screen.getByRole("button", { name: "Accept all" })).toBeInTheDocument();
});

it("surfaces a typed failure ({ok:false, code}) via ErrorExplainer (catalog copy, no raw code)", async () => {
  const acceptAction = vi.fn().mockResolvedValue({ ok: false, code: "SYNC_INFRA_ERROR" });
  render(<AcceptChangeButton acceptAction={acceptAction} hiddenFields={{ showId: "s1" }} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
  });
  await waitFor(() => {
    expect(screen.getByTestId("change-feed-accept-result")).toBeInTheDocument();
  });
  // catalog copy renders; the raw code NEVER appears in the DOM (invariant 5).
  expect(screen.getByText(/sync infrastructure step failed/i)).toBeInTheDocument();
  expect(screen.queryByText("SYNC_INFRA_ERROR")).toBeNull();
});

it("renders NO error panel on a successful accept ({ok:true})", async () => {
  const acceptAction = vi.fn().mockResolvedValue({ ok: true });
  render(<AcceptChangeButton acceptAction={acceptAction} hiddenFields={{ showId: "s1" }} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
  });
  await waitFor(() => {
    expect(acceptAction).toHaveBeenCalled();
  });
  expect(screen.queryByTestId("change-feed-accept-result")).toBeNull();
});
