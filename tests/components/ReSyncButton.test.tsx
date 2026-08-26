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
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { AdminAnnounceProvider } from "@/components/admin/AdminAnnounceProvider";

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

  // `inset-x-0` and `top-full` went with the migration (spec
  // 2026-08-25-review-modal-strip-dock §3.2a): the module writes `left`/`top`
  // from a measured trigger rect, so CSS anchoring would fight it, and `w-full`
  // takes over the width `inset-x-0` used to supply. `absolute` and
  // `overflow-y-auto` STAY deliberately — the overlay registry's recognizer
  // qualifies an element that is positioned AND scrolls internally, so dropping
  // either would take these three panels out of the registry they are being
  // re-dispositioned in.
  const OVERLAY_TOKENS = ["absolute", "w-full", "z-overlay", "overflow-y-auto"];

  /** Every overlay panel anchors to the BAND, caps its height and scrolls
   *  internally (§6.7). Asserted per branch — relocating two of three is the
   *  documented half-done failure mode. */
  function expectOverlayPanel(el: HTMLElement) {
    const tokens = el.className.split(/\s+/);
    for (const t of OVERLAY_TOKENS) expect(tokens, `overlay panel missing ${t}`).toContain(t);
    // z-overlay (50) vs the publish popover's z-banner (40, PublishedToggle.tsx) is a RULE: an
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
    //
    // SCOPED to the desktop label block (stacked-band spec §9.4): jsdom
    // computes no CSS, so the display:none-gated mobile "Sync" block cannot be
    // excluded from toHaveAccessibleName here — real-browser accName equality
    // ("Re-sync" @1280, "Sync" @390) is asserted by stackedBandLayout.spec.ts.
    // What jsdom CAN pin exactly: the sizer is aria-hidden AND invisible, and
    // the desktop block's non-sizer text is exactly one label per state.
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const { getByTestId } = render(<ReSyncButton slug="s" />);
    const button = getByTestId("admin-resync-button") as HTMLButtonElement;
    const desktopVisibleLabel = () => {
      const block = getByTestId("admin-resync-desktop-label");
      const spans = Array.from(block.querySelectorAll("span")).filter(
        (s) => s.childElementCount === 0,
      );
      const sizer = spans.find((s) => s.className.includes("invisible"));
      expect(sizer?.getAttribute("aria-hidden"), "sizer stays out of the name").toBe("true");
      return spans
        .filter((s) => !s.className.includes("invisible"))
        .map((s) => s.textContent)
        .join("");
    };
    expect(desktopVisibleLabel()).toBe("Re-sync");
    fireEvent.click(button);
    await waitFor(() => expect(desktopVisibleLabel()).toBe("Syncing…"));
    resolve({ json: async () => ({ ok: true }) } as unknown as Response);
  });

  test("T-RESYNC-SHRINK: the pending decision announces through the channel, and the panel is not a live region", async () => {
    // BL-ANNOUNCE-REGION-UNMOUNT-CLASS. Two defects in one element. The panel
    // was `role="status"` and INSERTED with its text, so it never announced —
    // and it holds the decision's buttons, so a screen reader that DID announce
    // it would read the controls as part of the announcement. Interactive
    // content inside a live region is its own anti-pattern.
    //
    // The fix is a move, not a toggle: the panel is interactive UI and must stay
    // conditional, so the arrival is announced on the branch-stable channel
    // instead.
    //
    // ANTI-TAUTOLOGY: the assertion reads the PROVIDER's region, which is
    // outside the panel — querying inside the panel passes on the broken shape.
    fetchMock.mockResolvedValue(shrinkHeld());
    const { getByTestId, findByTestId } = render(
      <AdminAnnounceProvider testId="admin-undo-status" label="Updates">
        <ReSyncButton slug="s" />
      </AdminAnnounceProvider>,
    );
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-shrink-confirm");
    expect(
      panel.getAttribute("role"),
      "a panel holding the decision's own buttons must not claim to be a live region",
    ).not.toBe("status");
    const region = getByTestId("admin-undo-status");
    expect(region.contains(panel), "the region must be outside the panel").toBe(false);
    await waitFor(() =>
      expect(
        region.textContent ?? "",
        "the pending decision must be announced on a region that already existed",
      ).not.toBe(""),
    );
  });

  test("the SUCCESS summary announces through the channel, and the card carries no dead status role", async () => {
    // BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS. The file's one announce covers
    // only the shrink_held pause branch (the case above); the success card was
    // never wired, and its `role="status"` announced nothing because the card is
    // inserted together with its summary. So the most common outcome of the most
    // common admin action was silent for AT.
    //
    // ANTI-TAUTOLOGY: the expectation is derived from the SAME fixture result
    // the component receives — the summary is scraped from the rendered card
    // rather than duplicated as a literal — and the region asserted on is the
    // PROVIDER's, outside the card that renders the same words.
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, result: { outcome: "applied" } }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(
      <AdminAnnounceProvider testId="admin-undo-status" label="Updates">
        <ReSyncButton slug="s" />
      </AdminAnnounceProvider>,
    );
    fireEvent.click(getByTestId("admin-resync-button"));
    const card = await findByTestId("admin-resync-success");
    const summary = card.querySelector("p")?.textContent ?? "";
    expect(summary.length).toBeGreaterThan(0);
    expect(card.querySelector('p[role="status"]')).toBeNull();

    const region = getByTestId("admin-undo-status");
    expect(region.contains(card), "the region must be outside the card").toBe(false);
    await waitFor(() => expect(region.textContent ?? "").toContain(summary));
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
  // ── Overlay placement (ReviewModalShell's `overflow-clip`) ────────────────
  //
  // The modal panel clips its children so its opaque bands stop painting over
  // its rounded corners, and each overlay has its own `overflow-y-auto`, so a
  // box cut at the panel's edge loses the TAIL OF ITS SCROLL RANGE — which is
  // where the shrink confirm's decision buttons sit. That consequence is
  // unchanged by the migration; what changed is who prevents it.
  //
  // It used to be useFitWithinClip, which walked up to the nearest clipping
  // ancestor and wrote a measured max-height. It is now the placement module,
  // which takes its bound from the host supplied through PopoverHostContext and
  // its anchor from a ref handed down by StatusStrip — no walk, and a side
  // choice the CSS version could not make.
  //
  // WHAT REPLACED "overlay is capped to the room left inside a clipping
  // ancestor". That test asserted a measured 203px (667 − 456 − 8) written by
  // useFitWithinClip, which found its bound by WALKING UP to the nearest
  // clipping ancestor. The overlays do not use that hook any more (spec
  // 2026-08-25-review-modal-strip-dock §3.2a) and the module does not walk: it
  // takes the host from PopoverHostContext and the trigger from a ref handed
  // down by StatusStrip. There is no clipping-ancestor walk left to assert.
  //
  // The cap claim moved to real layout, where it can actually be decided:
  // T-OVERLAY-BOUNDS in published-review-modal.interactions.spec.ts measures
  // all three branches against the real modal panel. jsdom computes no layout,
  // so the number this test used to assert came entirely from stubs.
  //
  // What jsdom still proves is the wiring, for all THREE overlays at once —
  // which matters here in a way it did not for the single-overlay case: three
  // independent nodes each get their own placement effect, and "two of three
  // migrated" is the documented half-done failure mode this file already warns
  // about for the skin tokens.
  // PER BRANCH, and the name is the reason. Diff review round 1 (P2) caught the
  // first version driving only SHOW_BUSY_RETRY while claiming "all three":
  // production has three INDEPENDENT `createPortal` sites and three independent
  // refs, so shrink-confirm or success could stay unported and a single-branch
  // case would pass. That is the same "relocating two of three is the documented
  // half-done failure mode" this file already warns about for the skin tokens,
  // and the browser backstop that would otherwise catch it was itself broken by
  // the stale-locator finding in the same round.
  const PORTAL_BRANCHES = [
    {
      name: "error",
      testid: "admin-resync-error",
      body: { ok: false, error: "SHOW_BUSY_RETRY" },
    },
    {
      name: "shrink confirm",
      testid: "admin-resync-shrink-confirm",
      body: {
        ok: true,
        result: { outcome: "shrink_held", detail: "crew 5→2", heldModifiedTime: "T1" },
      },
    },
    {
      name: "success",
      testid: "admin-resync-success",
      body: { ok: true, result: { outcome: "applied" } },
    },
  ] as const;

  for (const branch of PORTAL_BRANCHES) {
    test(`the ${branch.name} overlay portals into the popover host, not into the strip`, async () => {
      const hostEl = document.createElement("div");
      document.body.appendChild(hostEl);
      const anchor = document.createElement("div");
      document.body.appendChild(anchor);
      const hostRef = { current: hostEl };
      const anchorRef = { current: anchor };
      try {
        fetchMock.mockResolvedValue({
          json: async () => branch.body,
        } as unknown as Response);
        const { getByTestId, findByTestId } = render(
          <PopoverHostContext.Provider value={hostRef}>
            <ReSyncButton slug="my-show" anchorRef={anchorRef} />
          </PopoverHostContext.Provider>,
        );
        fireEvent.click(getByTestId("admin-resync-button"));
        const panel = await findByTestId(branch.testid);
        expect(panel.parentElement, `the ${branch.name} overlay is a child of the HOST`).toBe(
          hostEl,
        );
        // Degenerate measurement (jsdom): intercepted and left VISIBLE, never
        // hidden. A pending decision about the show's data must stay readable.
        expect(panel.style.visibility).not.toBe("hidden");
      } finally {
        hostEl.remove();
        anchor.remove();
      }
    });
  }

  test("overlay keeps the CSS cap when nothing clips it", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "SHOW_BUSY_RETRY" }),
    } as unknown as Response);
    const { getByTestId, findByTestId } = render(<ReSyncButton slug="my-show" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    const panel = await findByTestId("admin-resync-error");
    // No clipping ancestor: the inline cap must stay unset so the stylesheet's
    // min(50vh,20rem) governs, rather than a measured value that would shrink
    // the overlay on a surface that never needed it.
    expect(panel.style.maxHeight).toBe("");
  });
});

describe("mobile Sync skin (spec 2026-07-24-strip-mobile-stacked-band §3 R2)", () => {
  test("one trigger; two breakpoint-gated label blocks; real 44px box; mobile paddings", () => {
    const { getByTestId, getAllByTestId } = render(<ReSyncButton slug="s1" />);
    expect(getAllByTestId("admin-resync-button")).toHaveLength(1);
    const btn = getByTestId("admin-resync-button");
    for (const cls of ["min-h-tap-min", "min-w-tap-min", "max-sm:px-0", "max-sm:ml-auto"]) {
      expect(btn.className).toContain(cls);
    }
    expect(getByTestId("admin-resync-desktop-label").className).toContain("max-sm:hidden");
    const mobile = getByTestId("admin-resync-mobile-label");
    for (const cls of [
      "hidden",
      "max-sm:inline-flex",
      "h-8",
      "px-3",
      "rounded-sm",
      "border",
      "border-border",
    ]) {
      expect(mobile.className).toContain(cls);
    }
    expect(mobile).toHaveTextContent("Sync");
  });

  test("pending: icon spins with motion-reduce escape; aria-busy on, then clears", async () => {
    let release!: () => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((r) => {
          release = () =>
            r({
              json: async () => ({ ok: true, result: { outcome: "skipped" } }),
            } as unknown as Response);
        }),
    );
    const { getByTestId } = render(<ReSyncButton slug="s1" />);
    fireEvent.click(getByTestId("admin-resync-button"));
    await waitFor(() =>
      expect(getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("true"),
    );
    const icon = getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("animate-spin");
    expect(icon?.getAttribute("class") ?? "").toContain("motion-reduce:animate-none");
    release();
    // Spin STOP (spec §8 S idle<->pending both directions): busy clears and
    // the spin class is removed once the POST settles.
    await waitFor(() =>
      expect(getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("false"),
    );
    const settled = getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(settled?.getAttribute("class") ?? "").not.toContain("animate-spin");
  });
});
