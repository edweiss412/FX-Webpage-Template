// @vitest-environment jsdom
/**
 * tests/components/ReSyncButton.test.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Pins the public contract of <ReSyncButton>: the per-show "Re-sync" CTA
 * mounted at the top of `/admin/show/[slug]`. POSTs to §A's manual-sync
 * route (Pin-stop 2 extension @ ddafda3):
 *
 *   POST /api/admin/sync/[slug]
 *
 * Errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog (invariant 5).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { ReSyncButton } from "@/components/admin/ReSyncButton";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

// Shared rendered assertion (destructive-confirm plan): the C1 recipe signature.
function expectDestructiveRecipe(el: HTMLElement) {
  const tokens = el.className.split(/\s+/);
  for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
    expect(tokens).toContain(t);
  }
  for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
    expect(tokens).not.toContain(t);
  }
  expect(
    tokens
      .filter((t) => t.split(":").slice(0, -1).includes("hover"))
      .filter((t) => t.split(":").at(-1)!.startsWith("bg-")),
  ).toEqual([]);
}

describe("ReSyncButton", () => {
  test("clicking POSTs to /api/admin/sync/<slug>", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/sync/my-show");
    expect(init.method).toBe("POST");
  });

  test("encodes slug with special characters", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="show with/slash" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe(`/api/admin/sync/${encodeURIComponent("show with/slash")}`);
  });

  test("success → router.refresh", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true }) } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("error response → ErrorExplainer renders catalog dougFacing", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "FINALIZE_OWNED_SHOW" }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.FINALIZE_OWNED_SHOW.dougFacing!,
      );
    });
  });

  test("network throw → SYNC_INFRA_ERROR copy", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-error").textContent ?? "").toContain(
        MESSAGE_CATALOG.SYNC_INFRA_ERROR.dougFacing!,
      );
    });
  });

  test("button disabled while a sync is in flight", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    const button = getByTestId("admin-resync-button") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    resolve({ json: async () => ({ ok: true }) } as unknown as Response);
  });

  test("success result renders a friendly summary line", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "skipped", reason: "watermark" } }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-success").textContent ?? "").toContain(
        "Nothing new from Drive",
      );
    });
  });

  test("shrink_held result renders counts + Apply-reduced-version confirm, NOT a plain success", async () => {
    // Failure mode (audit #3 / R9): a generic one-click re-sync must NOT clobber. The server holds
    // and returns shrink_held; the button must render a CONFIRM (counts + accept), not a success
    // line, and must not router.refresh (nothing was applied — last-good is retained).
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByText, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    expect(await findByText(/crew 5→2/)).not.toBeNull();
    expect(queryByTestId("admin-resync-accept")).not.toBeNull();
    expect(queryByTestId("admin-resync-success")).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("clicking Apply reduced version re-POSTs version-bound acceptShrink + expectedModifiedTime", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const accept = await findByTestId("admin-resync-accept");
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: { outcome: "applied" } }),
    } as unknown as Response);
    fireEvent.click(accept);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      acceptShrink: true,
      expectedModifiedTime: "T1",
    });
  });

  test("'Keep current version' dismisses the confirm WITHOUT a second POST (safe path; last-good retained)", async () => {
    // Impeccable MEDIUM (accidental-accept): the destructive accept must not be the ONLY control.
    // A safe dismiss hides the confirm and issues no request — the server already retained last-good.
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByTestId, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const keep = await findByTestId("admin-resync-keep-current");
    fireEvent.click(keep);
    await waitFor(() => expect(queryByTestId("admin-resync-shrink-confirm")).toBeNull());
    expect(queryByTestId("admin-resync-accept")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no accept POST
  });

  test("focus lands on the SAFE 'Keep current version' control when the hold appears (a11y; not the destructive accept)", async () => {
    // Impeccable LOW (focus management): the appearing confirm must move focus so keyboard users
    // reach it — and to the SAFE action, so an accidental Enter keeps last-good rather than clobbers.
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const keep = await findByTestId("admin-resync-keep-current");
    await waitFor(() => expect(document.activeElement).toBe(keep));
  });

  test("success summary covers the 'stage' outcome in plain language (no pipeline jargon)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { outcome: "stage", stagedId: "00000000-0000-4000-8000-000000000000" },
      }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => {
      expect(getByTestId("admin-resync-success").textContent ?? "").toContain(
        "waiting for your review",
      );
    });
    // Doug-facing voice contract: sync outcome toasts speak plain language,
    // never parser/pipeline vocabulary ("staged", "parse", "invariant").
    expect(getByTestId("admin-resync-success").textContent ?? "").not.toMatch(
      /\bstaged\b|\bparse\b|\binvariant\b/i,
    );
  });

  test("the 'hard_fail' outcome explains the problem without parser jargon", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "hard_fail" } }),
    } as unknown as Response);
    const { getByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => getByTestId("admin-resync-success"));
    const text = getByTestId("admin-resync-success").textContent ?? "";
    // Concrete failure mode: "Synced, but the parse failed an invariant."
    // shipped to Doug. The toast must say what to do in plain words.
    expect(text).toContain("couldn't be applied");
    expect(text).not.toMatch(/\bstaged\b|\bparse\b|\binvariant\b/i);
  });

  // ---- Destructive-confirm pass (spec 2026-07-16-destructive-confirm-pass R8) ----

  test("shrink-accept carries the destructive recipe with NO AccentButton signature; keep-current rejects both recipe tokens (C1/C2)", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const accept = await findByTestId("admin-resync-accept");
    expectDestructiveRecipe(accept);
    const tokens = accept.className.split(/\s+/);
    // The observable AccentButton signature — the swap is proven by class
    // absence, not element type.
    for (const t of ["bg-accent", "hover:bg-accent-hover", "disabled:hover:bg-accent"]) {
      expect(tokens).not.toContain(t);
    }
    const keepTokens = getByTestId("admin-resync-keep-current").className.split(/\s+/);
    expect(keepTokens).not.toContain("bg-warning-text");
    expect(keepTokens).not.toContain("text-warning-bg");
  });

  test("close focus (C5, single-phase): 'Keep current version' moves focus to the re-sync trigger", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    } as unknown as Response);
    const { getByTestId, findByTestId, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const keep = await findByTestId("admin-resync-keep-current");
    fireEvent.click(keep);
    await waitFor(() => expect(queryByTestId("admin-resync-shrink-confirm")).toBeNull());
    await waitFor(() => expect(getByTestId("admin-resync-button")).toHaveFocus());
  });

  test("INVARIANT 5: no raw error codes leak into the DOM after an error response", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "SHOW_BUSY_RETRY" }),
    } as unknown as Response);
    const { getByTestId, container } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() => getByTestId("admin-resync-error"));
    const stripped = container.innerHTML.replace(/data-testid="[^"]*"/g, "");
    for (const code of Object.keys(MESSAGE_CATALOG)) {
      const re = new RegExp(`\\b${code}\\b`);
      expect(re.test(stripped), `raw code '${code}' must not appear in DOM`).toBe(false);
    }
  });
});
