// @vitest-environment jsdom
/**
 * tests/components/RotateShareTokenButton.test.tsx (M11.5 §B Task F3)
 *
 * Pins the two-tap state machine + success URL render + copy
 * affordance. The action invocation is mocked; the typed return
 * shape (new_share_token + new_epoch) drives the success branch.
 */
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

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({
  rotateShareToken: vi.fn(),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "sample-show";
const NEW_TOKEN = "a".repeat(64);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

const idleBtn = () =>
  screen.getByTestId("admin-rotate-share-token-button") as HTMLButtonElement;
const confirmBtn = () =>
  screen.getByTestId(
    "admin-rotate-share-token-confirm-button",
  ) as HTMLButtonElement;
const cancelBtn = () =>
  screen.getByTestId(
    "admin-rotate-share-token-cancel-button",
  ) as HTMLButtonElement;

describe("RotateShareTokenButton — two-tap state machine", () => {
  test("idle: shows 'Rotate share-token' label", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    expect(idleBtn().textContent).toContain("Rotate share-token");
  });

  test("idle → confirm: tap reveals confirm + cancel + URL-will-change warning", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    const group = screen.getByTestId(
      "admin-rotate-share-token-confirm-row",
    );
    expect(group.getAttribute("role")).toBe("group");
    expect(group.textContent).toMatch(/existing show URL.*stop working/i);
    expect(confirmBtn()).toBeTruthy();
    expect(cancelBtn()).toBeTruthy();
  });

  test("confirm → cancel: returns to idle without invoking the action", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    fireEvent.click(cancelBtn());
    expect(idleBtn()).toBeTruthy();
    expect(rotateShareToken).not.toHaveBeenCalled();
  });

  test("confirm → 3s auto-revert: returns to idle without invoking the action", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    expect(confirmBtn()).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3_001);
    });
    expect(idleBtn()).toBeTruthy();
    expect(rotateShareToken).not.toHaveBeenCalled();
  });

  test("confirm-click → invokes rotateShareToken; renders new URL using window.location.origin", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: true, new_share_token: NEW_TOKEN, new_epoch: 4 },
    );
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(rotateShareToken).toHaveBeenCalledWith({ showId: SHOW_ID });
    await waitFor(() => {
      const urlEl = screen.getByTestId("admin-rotate-share-token-url");
      // jsdom sets location.origin to http://localhost:3000 by default;
      // assert the suffix is the path the user will copy.
      expect(urlEl.textContent).toContain(`/show/${SLUG}/${NEW_TOKEN}`);
      expect(urlEl.textContent).toMatch(/^https?:\/\//);
    });
    // Success path must trigger a server re-render so the sibling
    // <CurrentShareLinkPanel> reads the new token on the next render.
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  test("failure result: does NOT trigger router.refresh() (no token to display)", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" },
    );
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("admin-rotate-share-token-refused"),
      ).toBeTruthy(),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("copy button: clicking copies the URL to the clipboard + flips the label to 'Copied'", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: true, new_share_token: NEW_TOKEN, new_epoch: 4 },
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    const copyBtn = await waitFor(() =>
      screen.getByTestId(
        "admin-rotate-share-token-copy-button",
      ) as HTMLButtonElement,
    );
    expect(copyBtn.textContent).toBe("Copy");
    await act(async () => {
      fireEvent.click(copyBtn);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(`/show/${SLUG}/${NEW_TOKEN}`),
    );
    await waitFor(() => expect(copyBtn.textContent).toBe("Copied"));
  });

  test("failure result: refused banner renders with role=alert", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, code: "ROTATE_FORBIDDEN" },
    );
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      const refused = screen.getByTestId(
        "admin-rotate-share-token-refused",
      );
      expect(refused.getAttribute("role")).toBe("alert");
      expect(refused.textContent).toContain("Couldn't rotate");
    });
  });
});
