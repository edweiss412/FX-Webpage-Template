// @vitest-environment jsdom
// M12.2 Phase A Task 10 (spec §6 / R27/R28) — RotateShareTokenButton.
//
// share-link-instant-rotate-dedup: the ACTIVE success banner is now
// CONFIRMATION-ONLY — it no longer renders the crew URL / Copy (that duplicated
// the always-visible share-link card). Instead the rotate hands the new
// token+epoch to the shared ShareTokenProvider via onRotated, and every crew-URL
// surface updates instantly. The R28 canonical-origin guarantee therefore now
// lives on the CARD surfaces (ShareChip / CrewPageLink / ShareLinkBody, all via
// resolveOrigin), pinned in tests/components/shareTokenInstantUpdate.test.tsx.
// Here we pin (test 1) that the active banner is confirmation-only and drives
// onRotated with the fresh token+epoch, and (test 2, R27) the inactive gating.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({ rotateShareToken: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "sample-show";
const NEW_TOKEN = "a".repeat(64);
const CANONICAL_ORIGIN = "https://crew.fxav.example";

const prevOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.NEXT_PUBLIC_SITE_ORIGIN = CANONICAL_ORIGIN;
  (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    new_share_token: NEW_TOKEN,
    new_epoch: 4,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env.NEXT_PUBLIC_SITE_ORIGIN = prevOrigin;
});

async function rotate() {
  fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
  await act(async () => {
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-confirm-button"));
    vi.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("RotateShareTokenButton — canonical origin + inactive gating", () => {
  test("active success banner is confirmation-only (NO URL/copy) and drives onRotated(token, epoch)", async () => {
    const onRotated = vi.fn();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        isCrewLinkActive={true}
        onRotated={onRotated}
      />,
    );
    await rotate();
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok"));
    // dedup: the banner no longer duplicates the URL / Copy the card shows.
    expect(screen.queryByTestId("admin-rotate-share-token-url")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-copy-button")).toBeNull();
    // the fresh token+epoch flow to the shared cache → the card/chip/link update
    // instantly (the canonical-origin URL is pinned on those surfaces in
    // tests/components/shareTokenInstantUpdate.test.tsx).
    expect(onRotated).toHaveBeenCalledWith(NEW_TOKEN, 4);
  });

  test("isCrewLinkActive=false → non-link 'crew link inactive' success, no URL/copy (R27)", async () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} isCrewLinkActive={false} />);
    await rotate();
    await waitFor(() => {
      expect(screen.getByTestId("admin-rotate-share-token-ok-inactive").textContent ?? "").toMatch(
        /inactive/i,
      );
    });
    expect(screen.queryByTestId("admin-rotate-share-token-url")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-copy-button")).toBeNull();
  });
});
