// @vitest-environment jsdom
// M12.2 Phase A Task 10 (spec §6 / R27/R28) — RotateShareTokenButton:
//   R28: the ACTIVE rotate-success crew URL uses the canonical
//        NEXT_PUBLIC_SITE_ORIGIN (resolveOrigin), NOT window.location.origin.
//   R27: when isCrewLinkActive=false, the success state shows a NON-LINK
//        "crew link inactive" message — no URL, no copy button.
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
  test("active success URL uses NEXT_PUBLIC_SITE_ORIGIN, not window.location.origin (R28)", async () => {
    // jsdom window.location.origin is http://localhost:3000 — distinct from CANONICAL_ORIGIN.
    expect(window.location.origin).not.toBe(CANONICAL_ORIGIN);
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} isCrewLinkActive={true} />);
    await rotate();
    await waitFor(() => {
      const url = screen.getByTestId("admin-rotate-share-token-url").textContent ?? "";
      expect(url).toBe(`${CANONICAL_ORIGIN}/show/${SLUG}/${NEW_TOKEN}`);
      expect(url).not.toContain(window.location.origin);
    });
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
