// @vitest-environment jsdom
/**
 * tests/components/CurrentShareLinkPanel.test.tsx
 *
 * Pins the (now thin) server shell: card chrome + heading + description, delegating
 * the token-dependent body to <ShareLinkBody>, which reads the token from
 * ShareTokenProvider. The URL/Copy/email/unavailable behaviours are covered in
 * ShareLinkBody.test.tsx + ShareTokenContext.test.tsx; here we pin that the panel
 * wires the body + reset slot correctly and no longer self-reads the token.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { CurrentShareLinkPanel } from "@/app/admin/show/[slug]/CurrentShareLinkPanel";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "sample-show";
const TOKEN = "a".repeat(64);

const originalOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.show";
});

afterEach(() => {
  cleanup();
  if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
  else process.env.NEXT_PUBLIC_SITE_ORIGIN = originalOrigin;
});

function renderPanel(initialToken: string | null, extra?: { resetSentinel?: boolean }) {
  return render(
    <ShareTokenProvider initialToken={initialToken} initialEpoch={5}>
      <CurrentShareLinkPanel
        showId={SHOW_ID}
        slug={SLUG}
        isCrewLinkActive
        resetSlot={extra?.resetSentinel ? <div data-testid="reset-slot-sentinel" /> : undefined}
      />
    </ShareTokenProvider>,
  );
}

describe("<CurrentShareLinkPanel>", () => {
  test("renders the card chrome + share-link heading/description", () => {
    const { getByTestId } = renderPanel(TOKEN);
    const root = getByTestId("admin-current-share-link-panel");
    expect(root.textContent).toMatch(/share[- ]link/i);
    expect(root.textContent).toMatch(/Send this URL to the crew/i);
  });

  test("token present (via provider) → the body renders the canonical URL + Copy", () => {
    const { getByTestId } = renderPanel(TOKEN);
    expect(getByTestId("admin-current-share-link-url").textContent).toBe(
      `https://crew.fxav.show/show/${SLUG}/${TOKEN}`,
    );
    expect(getByTestId("admin-current-share-link-copy-button")).toBeTruthy();
  });

  test("token null (via provider) → unavailable state, no URL, rotate still reachable", () => {
    const { getByTestId, queryByTestId } = renderPanel(null);
    expect(getByTestId("admin-current-share-link-unavailable")).toBeTruthy();
    expect(queryByTestId("admin-current-share-link-url")).toBeNull();
    expect(getByTestId("admin-rotate-share-token-button")).toBeTruthy();
  });

  test("never renders a '/show/<slug>/null' URL when the token is absent", () => {
    const { container } = renderPanel(null);
    expect(container.textContent ?? "").not.toContain(`/show/${SLUG}/null`);
  });

  test("renders the reset slot INSIDE the card", () => {
    const { getByTestId } = renderPanel(TOKEN, { resetSentinel: true });
    const card = getByTestId("admin-current-share-link-panel");
    expect(card.contains(getByTestId("reset-slot-sentinel"))).toBe(true);
  });

  test("URL <code> has NO title attribute (token-in-hover-tooltip guard)", () => {
    const { getByTestId } = renderPanel(TOKEN);
    expect(getByTestId("admin-current-share-link-url").getAttribute("title")).toBeNull();
  });
});
