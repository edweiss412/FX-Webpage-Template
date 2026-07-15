// @vitest-environment jsdom
/**
 * tests/components/ShareLinkBody.test.tsx
 *
 * Card body (surface C) consumes ShareTokenProvider: URL + Copy + email when a
 * token is present; unavailable notice when null; always renders the rotate row +
 * the reset slot.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShareLinkBody } from "@/app/admin/show/[slug]/ShareLinkBody";

function wrap(
  initialToken: string | null,
  props?: Partial<React.ComponentProps<typeof ShareLinkBody>>,
) {
  return render(
    <ShareTokenProvider initialToken={initialToken} initialEpoch={5}>
      <ShareLinkBody
        slug="2024-05-x"
        showId="11111111-1111-1111-1111-111111111111"
        isCrewLinkActive
        resetSlot={<div data-testid="reset-slot-sentinel" />}
        {...props}
      />
    </ShareTokenProvider>,
  );
}

afterEach(cleanup);

describe("ShareLinkBody", () => {
  test("token present → URL, Copy, and the rotate row + reset slot", () => {
    wrap("TOK", { crewEmails: ["a@example.com", "b@example.com"], showTitle: "RPAS" });
    expect(screen.getByTestId("admin-current-share-link-url").textContent).toContain(
      "/show/2024-05-x/TOK",
    );
    expect(screen.getByTestId("admin-current-share-link-copy-button")).toBeTruthy();
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    expect(screen.getByTestId("reset-slot-sentinel")).toBeTruthy();
  });

  test("token null → unavailable notice; rotate + reset still reachable", () => {
    wrap(null);
    expect(screen.getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    expect(screen.getByTestId("reset-slot-sentinel")).toBeTruthy();
  });

  test("empty crewEmails → no email buttons", () => {
    wrap("TOK", { crewEmails: [] });
    expect(screen.queryByTestId("admin-current-share-link-email-button")).toBeNull();
  });

  test("multiple crewEmails → email buttons present", () => {
    wrap("TOK", { crewEmails: ["a@example.com"], showTitle: "RPAS" });
    expect(screen.getAllByTestId("admin-current-share-link-email-button").length).toBeGreaterThan(
      0,
    );
  });
});
