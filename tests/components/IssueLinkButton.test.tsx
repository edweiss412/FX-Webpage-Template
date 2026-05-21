// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("@/app/admin/show/[slug]/actions", () => ({
  issueNewLinkAction: vi.fn(),
}));
vi.mock("@/lib/messages/lookup", () => ({
  getDougFacing: (code: string) => {
    if (code === "ADMIN_LINK_ISSUED_OK") return "New link issued.";
    if (code === "ADMIN_LINK_SHOW_NOT_FOUND") return "Show not found.";
    if (code === "ADMIN_LINK_CREW_NOT_FOUND") return "Crew member not found.";
    return code;
  },
}));

import { IssueLinkButton } from "@/app/admin/show/[slug]/IssueLinkButton";
import { issueNewLinkAction } from "@/app/admin/show/[slug]/actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function getIssueButton(): HTMLButtonElement {
  return screen.getByTestId("per-show-crew-issue-button") as HTMLButtonElement;
}

describe("IssueLinkButton", () => {
  test("renders 'Issue new link' label when isFresh=false", () => {
    render(
      <IssueLinkButton showId="show-uuid" crewName="Alice" isFresh={false} />,
    );
    expect(getIssueButton().textContent?.trim()).toBe("Issue new link");
  });

  test("renders 'Issue first link' label when isFresh=true", () => {
    render(
      <IssueLinkButton showId="show-uuid" crewName="Alice" isFresh={true} />,
    );
    expect(getIssueButton().textContent?.trim()).toBe("Issue first link");
  });

  test("disabled prop disables the button", () => {
    render(
      <IssueLinkButton
        showId="show-uuid"
        crewName="Alice"
        isFresh={false}
        disabled
      />,
    );
    expect(getIssueButton().disabled).toBe(true);
  });

  test("click submits form, shows pending label + aria-busy, then ok message", async () => {
    let resolveAction: (v: {
      kind: "ok";
      code: "ADMIN_LINK_ISSUED_OK";
    }) => void = () => {};
    const actionPromise = new Promise<{
      kind: "ok";
      code: "ADMIN_LINK_ISSUED_OK";
    }>((res) => {
      resolveAction = res;
    });
    vi.mocked(issueNewLinkAction).mockReturnValue(actionPromise as never);

    render(
      <IssueLinkButton showId="show-uuid" crewName="Alice" isFresh={false} />,
    );
    fireEvent.click(getIssueButton());

    await waitFor(() => {
      const btn = getIssueButton();
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.textContent?.trim()).toMatch(/issuing/i);
    });

    resolveAction({ kind: "ok", code: "ADMIN_LINK_ISSUED_OK" });
    await waitFor(() => {
      const ok = screen.getByTestId("per-show-crew-issue-ok");
      // ok banner carries the catalog copy + a leading ✓ glyph
      // (impeccable critique M-3 — distinguishes success from a
      // neutral hint of identical chrome).
      expect(ok.textContent?.trim()).toContain("New link issued.");
      expect(ok.textContent?.trim()).toMatch(/^✓/);
      expect(ok.getAttribute("role")).toBe("status");
      expect(ok.getAttribute("aria-live")).toBe("polite");
    });
  });

  test("refused outcome surfaces dougFacing copy via role=alert", async () => {
    vi.mocked(issueNewLinkAction).mockResolvedValue({
      kind: "refused",
      code: "ADMIN_LINK_SHOW_NOT_FOUND",
    });
    render(
      <IssueLinkButton showId="missing" crewName="Alice" isFresh={false} />,
    );
    fireEvent.click(getIssueButton());
    await waitFor(() => {
      const refused = screen.getByTestId("per-show-crew-issue-refused");
      expect(refused.textContent?.trim()).toBe("Show not found.");
      expect(refused.getAttribute("role")).toBe("alert");
    });
  });

  test("form submits with showId + crewName values", async () => {
    vi.mocked(issueNewLinkAction).mockResolvedValue({
      kind: "ok",
      code: "ADMIN_LINK_ISSUED_OK",
    });
    render(
      <IssueLinkButton showId="show-uuid-7" crewName="Dana" isFresh={true} />,
    );
    fireEvent.click(getIssueButton());
    await waitFor(() => {
      expect(issueNewLinkAction).toHaveBeenCalledTimes(1);
    });
    const formData = vi.mocked(issueNewLinkAction).mock.calls[0]?.[1] as
      | FormData
      | undefined;
    expect(formData?.get("showId")).toBe("show-uuid-7");
    expect(formData?.get("crewName")).toBe("Dana");
  });
});
