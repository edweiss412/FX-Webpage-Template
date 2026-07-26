// @vitest-environment jsdom
/**
 * tests/components/shareTokenRotateSurface.test.tsx
 *
 * Load-bearing integration test for the ONE live crew-URL surface: the
 * `admin-current-share-link-url` block inside the ShareHub popover.
 *
 * It used to drive three consumers (a header chip, an "Open crew page" link and
 * a share-link card). The card was removed by the share-hub consolidation and
 * the other two were orphans deleted with this milestone, so the fan-out claim
 * is gone and only the hub remains.
 *
 * What survives unchanged, and is a FLOOR rather than a summary (spec §4):
 *   - the rotate is driven through the REAL two-tap confirm, not a stubbed one;
 *   - `router.refresh()` is a mocked no-op, so an instant update PROVES the
 *     client epoch-gated cache did it rather than a server re-render;
 *   - the exact OLD url, the exact NEW url, and the clipboard payload on both
 *     sides of the rotate;
 *   - the OLD token then appears NOWHERE in the DOM;
 *   - a rotation at a STRICTLY LOWER epoch is rejected.
 *
 * Absence-of-OLD alone would pass while the block rendered a WRONG token and
 * Copy wrote a stale one, which is why the exact-value assertions stay.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: vi.fn() }));
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: vi.fn() }));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShareHub } from "@/components/admin/showpage/ShareHub";
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

function hubProps() {
  return {
    slug: SLUG,
    showId: SHOW_ID,
    published: true,
    crewEmails: [],
    showTitle: "Sample Show",
    pickerCrew: [],
    archived: false,
    finalizeOwned: false,
    archiveAction: async () => ({ ok: true }) as const,
    unarchiveAction: async () => {},
  };
}

const urlFor = (token: string) => `${ORIGIN}/show/${SLUG}/${token}`;

/** Scoped to the popover on purpose: the correct assertion boundary regardless
 *  of how many surfaces exist. */
const cardCopyButton = () =>
  within(screen.getByTestId("share-hub-popover")).getByTestId(
    "admin-current-share-link-copy-button",
  );

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

describe("share-token rotate surface (the ShareHub crew-URL block)", () => {
  test("a rotate updates the URL instantly — OLD then vanishes everywhere", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      new_share_token: NEW,
      new_epoch: 6,
    });
    render(
      <ShareTokenProvider initialToken={OLD} initialEpoch={5}>
        <ShareHub {...hubProps()} />
      </ShareTokenProvider>,
    );
    fireEvent.click(screen.getByTestId("share-hub-primary"));

    // --- OLD first ---
    expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(OLD));
    fireEvent.click(cardCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(OLD));

    // --- drive the rotate through the real two-tap confirm ---
    await rotateThroughConfirm();
    await waitFor(() => expect(rotateShareToken).toHaveBeenCalledWith({ showId: SHOW_ID }));

    // the instant update came from the client cache — refresh is a mocked no-op
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // --- NEW everywhere, OLD nowhere ---
    await waitFor(() => {
      expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(NEW));
    });
    expect(document.body.innerHTML).not.toContain(OLD);

    fireEvent.click(cardCopyButton());
    expect(writeText).toHaveBeenLastCalledWith(urlFor(NEW));
  });

  test("a rotation at a STRICTLY LOWER epoch is rejected — the URL does not regress", async () => {
    // The gate is `epoch >= held` (ShareTokenContext.tsx:47), so an EQUAL epoch
    // carrying a new token is ACCEPTED. Only a strictly lower one is rejected,
    // which is what this drives. An earlier title said `epoch <= current`, which
    // overstated it.
    function Probe() {
      const { applyRotated } = useShareToken();
      return (
        <button data-testid="stale-apply" onClick={() => applyRotated("STALE", 4)} type="button" />
      );
    }
    render(
      <ShareTokenProvider initialToken={OLD} initialEpoch={5}>
        <ShareHub {...hubProps()} />
        <Probe />
      </ShareTokenProvider>,
    );
    fireEvent.click(screen.getByTestId("share-hub-primary"));
    expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(OLD));

    fireEvent.click(screen.getByTestId("stale-apply"));

    expect(screen.getByTestId("admin-current-share-link-url").textContent).toBe(urlFor(OLD));
    expect(document.body.innerHTML).not.toContain("STALE");
  });
});
