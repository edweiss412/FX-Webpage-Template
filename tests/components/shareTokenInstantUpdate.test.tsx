// @vitest-environment jsdom
/**
 * tests/components/shareTokenInstantUpdate.test.tsx
 *
 * Load-bearing integration test (spec §6.2): the three token consumers — header
 * ShareChip (A), CrewPageLink (B), and the ShareLinkBody card (C) — share ONE
 * ShareTokenProvider. A rotate driven through the real RotateShareTokenButton
 * (inside ShareLinkBody) must update the URL on ALL THREE surfaces INSTANTLY,
 * with `router.refresh()` mocked to a no-op — proving the instant update comes
 * from the client epoch-gated cache, not a server re-render. The old token must
 * then appear NOWHERE (text, href, title, or clipboard payload).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: vi.fn() }));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShareChip } from "@/app/admin/show/[slug]/ShareChip";
import { CrewPageLink } from "@/app/admin/show/[slug]/CrewPageLink";
import { ShareLinkBody } from "@/app/admin/show/[slug]/ShareLinkBody";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

const ORIGIN = "https://crew.fxav.show";
const SLUG = "sample-show";
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OLD = "o".repeat(64);
const NEW = "n".repeat(64);

const originalOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;
const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_ORIGIN = ORIGIN;
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
  else process.env.NEXT_PUBLIC_SITE_ORIGIN = originalOrigin;
});

// All three consumers under ONE provider, mirroring the page composition.
function AllSurfaces() {
  return (
    <ShareTokenProvider initialToken={OLD} initialEpoch={5}>
      <ShareChip slug={SLUG} isEligible />
      <CrewPageLink slug={SLUG} isEligible />
      <ShareLinkBody
        slug={SLUG}
        showId={SHOW_ID}
        crewEmails={[]}
        isCrewLinkActive
        resetSlot={null}
      />
    </ShareTokenProvider>
  );
}

const urlFor = (token: string) => `${ORIGIN}/show/${SLUG}/${token}`;

// The chip and the card each render a copy button with the same testid; scope
// them by their surface container so each Copy is exercised independently.
const chipCopyButton = () =>
  within(screen.getByTestId("admin-show-share-chip")).getByTestId(
    "admin-current-share-link-copy-button",
  );
const cardCopyButton = () =>
  screen
    .getAllByTestId("admin-current-share-link-copy-button")
    .find((b) => b.closest("[data-testid='admin-show-share-chip']") === null)!;

async function rotateThroughConfirm() {
  vi.useFakeTimers();
  fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
  await act(async () => {
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    vi.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("share-token instant update across the real A/B/C consumers", () => {
  test("a rotate updates the chip, crew link, and card URL instantly — OLD then vanishes everywhere", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      new_share_token: NEW,
      new_epoch: 6,
    });
    render(<AllSurfaces />);

    // --- OLD everywhere first ---
    const chip = screen.getByTestId("admin-show-share-chip");
    expect(chip.getAttribute("title")).toBe(urlFor(OLD));
    expect(chip.querySelector("code")!.textContent).toBe(`/show/${SLUG}/${OLD}`);
    expect(screen.getByTestId("admin-show-open-crew").getAttribute("href")).toBe(urlFor(OLD));
    expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(OLD));

    // both Copy buttons write the OLD url
    fireEvent.click(chipCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(OLD));
    fireEvent.click(cardCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(OLD));

    // --- drive the rotate through the real two-tap confirm ---
    await rotateThroughConfirm();
    await waitFor(() => expect(rotateShareToken).toHaveBeenCalledWith({ showId: SHOW_ID }));

    // instant update came from the client cache — refresh is a mocked no-op
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // --- NEW everywhere, OLD nowhere ---
    await waitFor(() => {
      expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(NEW));
    });
    const chipAfter = screen.getByTestId("admin-show-share-chip");
    expect(chipAfter.getAttribute("title")).toBe(urlFor(NEW));
    expect(chipAfter.querySelector("code")!.textContent).toBe(`/show/${SLUG}/${NEW}`);
    expect(screen.getByTestId("admin-show-open-crew").getAttribute("href")).toBe(urlFor(NEW));

    // OLD token appears in NO rendered text/attribute anymore
    expect(document.body.innerHTML).not.toContain(OLD);

    // both Copy buttons now write the NEW url
    fireEvent.click(chipCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(NEW));
    fireEvent.click(cardCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(NEW));
  });

  test("a stale rotation (epoch <= current) is rejected — the URL surfaces do not regress", async () => {
    // Guards the monotonic gate end-to-end: a lower-epoch update must be ignored
    // even when it flows through onRotated (out-of-order refresh race).
    function Probe() {
      const { applyRotated } = useShareToken();
      return (
        <button data-testid="stale-apply" onClick={() => applyRotated("STALE", 4)} type="button" />
      );
    }
    render(
      <ShareTokenProvider initialToken={OLD} initialEpoch={5}>
        <ShareChip slug={SLUG} isEligible />
        <Probe />
      </ShareTokenProvider>,
    );
    fireEvent.click(screen.getByTestId("stale-apply"));
    expect(screen.getByTestId("admin-show-share-chip").getAttribute("title")).toBe(urlFor(OLD));
    expect(document.body.innerHTML).not.toContain("STALE");
  });
});
