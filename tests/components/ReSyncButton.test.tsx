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
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
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

  // ---- modal-header-reconciliation §6.7 (Task 7): strip mount + overlay results ----

  const shrinkHeld = () =>
    ({
      json: async () => ({
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      }),
    }) as unknown as Response;

  const OVERLAY_TOKENS = ["absolute", "inset-x-0", "top-full", "z-50", "overflow-y-auto"];

  /** Every overlay panel anchors to the BAND, caps its height and scrolls
   *  internally (§6.7). Asserted per branch — relocating two of three is the
   *  documented half-done failure mode. */
  function expectOverlayPanel(el: HTMLElement) {
    const tokens = el.className.split(/\s+/);
    for (const t of OVERLAY_TOKENS) expect(tokens, `overlay panel missing ${t}`).toContain(t);
    // z-50 vs the publish popover's z-40 (PublishedToggle.tsx) is a RULE: an
    // unspecified z can leave the focused shrink confirm obscured.
    expect(tokens).not.toContain("z-40");
    // The height cap is what keeps "reserves no layout space" from becoming an
    // obscured-content bug. Arbitrary-value class, so match by prefix.
    expect(
      tokens.some((t) => t.startsWith("max-h-[")),
      `overlay panel missing a max-h cap (had: ${el.className})`,
    ).toBe(true);
  }

  test("T-RESYNC-NO-WRAPPER: the root is a FRAGMENT — the trigger is the mount point's direct child", () => {
    // Failure mode: a surviving `<div className="flex flex-col gap-3">` becomes
    // the strip's flex item, so `items-center` and the row gap apply to the
    // wrapper rather than the button, and the absolute panels anchor to an
    // unintended subtree — while every focus and ORDER test still passes.
    const { container } = render(<ReSyncButton slug="s" />);
    const trigger = container.querySelector('[data-testid="admin-resync-button"]')!;
    expect(trigger.parentElement, "no intervening wrapper between mount point and trigger").toBe(
      container,
    );
    expect(container.firstElementChild).toBe(trigger);
  });

  test("ghost trigger: keeps aria-busy / disabled / testid, carries the tap floor and the band-resolved ring, and is NOT an AccentButton", async () => {
    // The accent→ghost swap is NOT style-only: AccentButton supplied these
    // through props, and a raw <button> drops each one silently. Dropping
    // `disabled` leaves a pending Re-sync clickable and able to double-POST.
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { getByTestId } = render(<ReSyncButton slug="s" />);
    const button = getByTestId("admin-resync-button") as HTMLButtonElement;

    const tokens = button.className.split(/\s+/);
    expect(tokens).toContain("min-h-tap-min");
    expect(tokens).toContain("min-w-tap-min");
    // ringOffset="bg" is REPLACED: the trigger now sits on the band's surface.
    expect(tokens).toContain("focus-visible:ring-offset-surface");
    expect(tokens).not.toContain("focus-visible:ring-offset-bg");
    // `selfStart` was correct for Overview's flex-col, wrong in a centered row.
    expect(tokens).not.toContain("self-start");
    // The observable AccentButton signature is gone (delta 4's orange budget).
    for (const t of ["bg-accent", "hover:bg-accent-hover", "text-accent-text"]) {
      expect(tokens, `ghost trigger must not carry ${t}`).not.toContain(t);
    }

    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
    expect(button.disabled).toBe(true);
    resolve({ json: async () => ({ ok: true }) } as unknown as Response);
  });

  test("trigger label shortens to 'Re-sync' / 'Syncing…' and the width sizer never leaks into the accessible name", async () => {
    // §6.7 label change (D2: the help registry pinned "Re-sync from Drive").
    // The width reservation renders the inactive label as a hidden sizer, so
    // the accessible name must still be exactly one label — a sizer that leaks
    // announces "Re-syncSyncing…" to a screen reader.
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { getByTestId } = render(<ReSyncButton slug="s" />);
    const button = getByTestId("admin-resync-button") as HTMLButtonElement;
    expect(button).toHaveAccessibleName("Re-sync");
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAccessibleName("Syncing…"));
    resolve({ json: async () => ({ ok: true }) } as unknown as Response);
  });

  test("T-RESYNC-SHRINK: the confirm renders in the OVERLAY, still focuses the safe control, and has NO neutral dismiss", async () => {
    fetchMock.mockResolvedValue(shrinkHeld());
    const { getByTestId, findByTestId, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-shrink-confirm");
    expectOverlayPanel(panel);
    await waitFor(() =>
      expect(document.activeElement).toBe(getByTestId("admin-resync-keep-current")),
    );
    // Watchpoint 9: "Keep current version" IS the safe exit. A neutral X would
    // create a third, ambiguous outcome on a destructive-adjacent confirm.
    expect(queryByTestId("admin-resync-shrink-dismiss")).toBeNull();
    expect(within(panel).queryByLabelText(/dismiss/i)).toBeNull();
  });

  test("T-RESYNC-ERROR: renders in the OVERLAY with catalog copy (CONTAINMENT, not equality), and dismisses without re-running the mutation", async () => {
    // Containment, deliberately: the branch legitimately renders <ErrorExplainer>
    // PLUS <HelpAffordance>, so an equality assertion is false-red and the
    // likely "fix" is deleting the help affordance.
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "FINALIZE_OWNED_SHOW" }),
    } as unknown as Response);
    const { getByTestId, findByTestId, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-error");
    expectOverlayPanel(panel);
    expect(panel.textContent ?? "").toContain(MESSAGE_CATALOG.FINALIZE_OWNED_SHOW.dougFacing!);
    expect(panel.textContent ?? "").not.toContain("FINALIZE_OWNED_SHOW");

    // The live-region role MOVED to the message node: a focusable dismiss
    // button inside a live region would be announced as part of the alert.
    expect(panel.getAttribute("role")).toBe("group");
    const labelledBy = panel.getAttribute("aria-labelledby");
    expect(labelledBy, "role=group is named by the message node").toBeTruthy();
    const msg = panel.querySelector(`#${CSS.escape(labelledBy!)}`)!;
    expect(msg.getAttribute("role")).toBe("alert");
    expect(msg.querySelector("button"), "no focusable control inside the live region").toBeNull();

    const dismiss = getByTestId("admin-resync-error-dismiss");
    expect(dismiss).toHaveAccessibleName("Dismiss sync error");
    expect(dismiss.className.split(/\s+/)).toContain("min-h-tap-min");
    fireEvent.click(dismiss);
    await waitFor(() => expect(queryByTestId("admin-resync-error")).toBeNull());
    expect(fetchMock, "dismiss clears the overlay without re-POSTing").toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByTestId("admin-resync-button")).toHaveFocus());
  });

  test("T-RESYNC-SUCCESS: renders summarizeResult copy in the OVERLAY and dismisses back to the trigger", async () => {
    // A separate branch from BOTH error and shrink: T-RESYNC-SHRINK and
    // T-OVERLAY both pass while this one is still rendering in flow.
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "revision_race" } }),
    } as unknown as Response);
    const { getByTestId, findByTestId, queryByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-success");
    expectOverlayPanel(panel);
    expect(panel.textContent ?? "").toContain("the sheet changed mid-sync");
    // Never the raw outcome token.
    expect(panel.textContent ?? "").not.toContain("revision_race");

    const dismiss = getByTestId("admin-resync-success-dismiss");
    expect(dismiss).toHaveAccessibleName("Dismiss sync result");
    expect(dismiss.className.split(/\s+/)).toContain("min-h-tap-min");
    fireEvent.click(dismiss);
    await waitFor(() => expect(queryByTestId("admin-resync-success")).toBeNull());
    await waitFor(() => expect(getByTestId("admin-resync-button")).toHaveFocus());
  });

  test("an UNKNOWN outcome falls back to 'Sync complete.' rather than echoing a raw token", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "asset_recovery_v2_unknown" } }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(<ReSyncButton slug="s" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-success");
    expect(panel.textContent ?? "").toContain("Sync complete.");
    expect(panel.textContent ?? "").not.toContain("asset_recovery");
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
