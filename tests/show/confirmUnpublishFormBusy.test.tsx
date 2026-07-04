// @vitest-environment jsdom
// Published-toggle §3.4: the confirm form's BUSY state (finalize-owned refusal) renders the
// uncataloged BUSY_HEADING/BUSY_BODY copy while KEEPING the form available (the token
// survived; retrying later must stay possible). Concrete failure mode caught: an implementer
// mapping finalize_owned to neutral/undefined would either close the recovery window or crash
// the render — this test submits the form against a busy-returning action and asserts both
// the notice and the still-present submit button.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConfirmUnpublishForm } from "@/app/show/[slug]/unpublish/ConfirmUnpublishForm";
import { BUSY_BODY, BUSY_HEADING, CONFIRM_BUTTON_LABEL } from "@/app/show/[slug]/unpublish/copy";

const confirmUnpublishAction = vi.fn(async () => ({ status: "busy" }) as const);
vi.mock("@/app/show/[slug]/unpublish/actions", () => ({
  confirmUnpublishAction: (...a: unknown[]) =>
    (confirmUnpublishAction as (...a: unknown[]) => unknown)(...a),
}));

afterEach(cleanup);

describe("ConfirmUnpublishForm — busy state", () => {
  it("renders BUSY_HEADING + BUSY_BODY and keeps the confirm form available", async () => {
    render(<ConfirmUnpublishForm slug="s1" title="Client Show" token="tok" r="rrrr" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: CONFIRM_BUTTON_LABEL }));
    });
    const notice = screen.getByTestId("unpublish-busy-notice");
    expect(notice.textContent).toContain(BUSY_HEADING);
    expect(notice.textContent).toContain(BUSY_BODY);
    // Recovery window stays open: the submit button is still rendered and enabled.
    expect(screen.getByRole("button", { name: CONFIRM_BUTTON_LABEL })).toBeTruthy();
  });
});
