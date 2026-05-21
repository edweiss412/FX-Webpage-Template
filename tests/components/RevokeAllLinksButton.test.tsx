// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("@/app/admin/show/[slug]/actions", () => ({
  revokeAllLinksAction: vi.fn(),
}));
vi.mock("@/lib/messages/lookup", () => ({
  getDougFacing: (code: string) => {
    if (code === "ADMIN_LINK_REVOKED_OK") return "All links revoked.";
    if (code === "ADMIN_LINK_NO_LIVE_LINK") return "No live link to revoke.";
    if (code === "ADMIN_LINK_CREW_NOT_FOUND") return "Crew member not found.";
    return code;
  },
}));

import { RevokeAllLinksButton } from "@/app/admin/show/[slug]/RevokeAllLinksButton";
import { revokeAllLinksAction } from "@/app/admin/show/[slug]/actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function getIdleButton(): HTMLButtonElement {
  return screen.getByTestId("per-show-crew-revoke-button") as HTMLButtonElement;
}
function getConfirmButton(): HTMLButtonElement {
  return screen.getByTestId(
    "per-show-crew-revoke-confirm-button",
  ) as HTMLButtonElement;
}
function getCancelButton(): HTMLButtonElement {
  return screen.getByTestId(
    "per-show-crew-revoke-cancel-button",
  ) as HTMLButtonElement;
}
function queryConfirmButton(): HTMLButtonElement | null {
  return screen.queryByTestId(
    "per-show-crew-revoke-confirm-button",
  ) as HTMLButtonElement | null;
}

describe("RevokeAllLinksButton — two-tap state machine", () => {
  test("idle: shows 'Revoke all links' label", () => {
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    expect(getIdleButton().textContent?.trim()).toBe("Revoke all links");
  });

  test("disabled prop disables the idle button", () => {
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={true} />,
    );
    expect(getIdleButton().disabled).toBe(true);
  });

  test("idle → click → confirm row appears with Confirm + Cancel siblings + role=group + aria-label (impeccable audit L-3)", () => {
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    expect(getConfirmButton().textContent?.trim()).toBe("Confirm revoke");
    expect(getCancelButton().textContent?.trim()).toBe("Cancel");
    const group = screen.getByTestId("per-show-crew-revoke-confirm-row");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toContain("Confirm revoking");
  });

  test("confirm → Cancel reverts to idle", () => {
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    fireEvent.click(getCancelButton());
    expect(queryConfirmButton()).toBeNull();
    expect(getIdleButton().textContent?.trim()).toBe("Revoke all links");
  });

  test("confirm → click confirm → submits + shows pending label/aria-busy → ok message", async () => {
    let resolveAction: (v: {
      kind: "ok";
      code: "ADMIN_LINK_REVOKED_OK";
    }) => void = () => {};
    const actionPromise = new Promise<{
      kind: "ok";
      code: "ADMIN_LINK_REVOKED_OK";
    }>((res) => {
      resolveAction = res;
    });
    vi.mocked(revokeAllLinksAction).mockReturnValue(actionPromise as never);

    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    fireEvent.click(getConfirmButton());

    await waitFor(() => {
      const btn = getConfirmButton();
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.textContent?.trim()).toMatch(/revoking/i);
    });

    resolveAction({ kind: "ok", code: "ADMIN_LINK_REVOKED_OK" });
    await waitFor(() => {
      const ok = screen.getByTestId("per-show-crew-revoke-ok");
      // Impeccable critique HIGH-1 + M-2 + M-3: banner carries
      // "Last attempt:" prefix + ✓ glyph + the catalog copy. This
      // visually links the banner to the destructive action that
      // snapped back to idle.
      expect(ok.textContent).toContain("All links revoked.");
      expect(ok.textContent).toContain("Last attempt:");
      expect(ok.textContent).toContain("✓");
      expect(ok.getAttribute("role")).toBe("status");
      expect(ok.getAttribute("aria-live")).toBe("polite");
    });
  });

  test("refused (no_live_link) surfaces dougFacing copy + clears pending", async () => {
    vi.mocked(revokeAllLinksAction).mockResolvedValue({
      kind: "refused",
      code: "ADMIN_LINK_NO_LIVE_LINK",
    });
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    fireEvent.click(getConfirmButton());
    await waitFor(() => {
      const refused = screen.getByTestId("per-show-crew-revoke-refused");
      expect(refused.textContent).toContain("No live link to revoke.");
      expect(refused.textContent).toContain("Last attempt:");
      expect(refused.getAttribute("role")).toBe("alert");
    });
    // R8 snap-to-idle: after refused result, ui returns to idle so the
    // user can retry from a clean state.
    expect(getIdleButton().textContent?.trim()).toBe("Revoke all links");
  });

  test("3s auto-revert: confirm reverts to idle after timeout if no click", async () => {
    vi.useFakeTimers();
    render(
      <RevokeAllLinksButton showId="show-uuid" crewName="Alice" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    expect(getConfirmButton().textContent?.trim()).toBe("Confirm revoke");

    await act(async () => {
      vi.advanceTimersByTime(3_100);
    });
    expect(queryConfirmButton()).toBeNull();
    expect(getIdleButton().textContent?.trim()).toBe("Revoke all links");
  });

  // The M9-D-C4-1 isPending-clears-controls regression is covered by
  // the "refused (no_live_link)" test above: useActionState owns
  // pending state, the refused outcome triggers snap-to-idle, and the
  // idle button is re-enabled (verified by re-reading its text).
  // Action-throws is NOT in scope here — React 19 useActionState
  // propagates a thrown action to the nearest error boundary, not
  // back as a result the component can read. The throw-path is
  // covered at the action layer in tests/admin/show-actions.test.ts
  // (SignedLinksInfraError propagation).
});

describe("RevokeAllLinksButton — form data carriage", () => {
  beforeEach(() => {
    vi.mocked(revokeAllLinksAction).mockResolvedValue({
      kind: "ok",
      code: "ADMIN_LINK_REVOKED_OK",
    });
  });

  test("form submits with showId + crewName hidden inputs on confirm-click", async () => {
    render(
      <RevokeAllLinksButton showId="show-uuid-9" crewName="Sam" disabled={false} />,
    );
    fireEvent.click(getIdleButton());
    fireEvent.click(getConfirmButton());

    await waitFor(() => {
      expect(revokeAllLinksAction).toHaveBeenCalledTimes(1);
    });
    const formData = vi.mocked(revokeAllLinksAction).mock.calls[0]?.[1] as
      | FormData
      | undefined;
    expect(formData?.get("showId")).toBe("show-uuid-9");
    expect(formData?.get("crewName")).toBe("Sam");
  });
});
