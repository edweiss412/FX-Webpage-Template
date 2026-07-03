// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3PublishSettlement.test.tsx (Task 8 —
 * spec §9.2/§9.3)
 *
 * Pins the RESULT-BEARING publish settlement contract: `Step3Review`'s
 * `toggleOne(driveFileId, next, serverApplied): Promise<boolean>` resolves at
 * the ROW's settlement point (the flush loop finishes the row's LAST coalesced
 * write with no newer desired intent, or the overlay entry is dropped without
 * a POST), resolving EVERY queued waiter with `settledValue ===
 * waiter.requestedValue` (§9.2.1–3). Lifecycle (§9.2.6): unmount resolves all
 * outstanding waiters `false`; a refresh that removes the row resolves its
 * waiters `false` via a COMMITTED effect (never during render).
 *
 * Harness: the REAL `Step3SheetCard` renders (checkbox, "More", the modal);
 * a passthrough module wrapper additionally records each row's
 * `onToggleChecked` prop so the ordering cases hold EXACT promise handles —
 * something the fire-and-forget checkbox click path deliberately hides.
 *
 * Concrete failure modes caught:
 *  (a) settlement reporting success when the server refused ({ok:false}) —
 *      the modal would close-and-announce over an unselected row (§9.2.5);
 *  (b) a second overlapping waiter being overwritten/orphaned (single-slot
 *      storage instead of a list) — its promise would never resolve;
 *  (c)/(d) value-agnostic resolution (resolving every waiter `true` because
 *      "the flush succeeded") — the superseded waiter must resolve `false`;
 *  (e)/(f) waiters leaking past unmount/row-removal — the modal's await would
 *      hang forever;
 *  (g) an idempotent no-op POSTing anyway, or resolving `false` because no
 *      POST happened (the already-checked modal publish button path).
 *
 * Card-level (§9.1/§9.3, real card + real modal): publish success closes the
 * modal + announces via the sr-only live region; refusal keeps it open with
 * the inline error note; the checkbox click path stays fire-and-forget (no
 * pending UI on the box).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Passthrough wrapper: render the REAL card, but record the result-bearing
// onToggleChecked per row so the settlement cases can invoke it directly and
// hold the returned promise.
const capturedToggles = new Map<string, (next: boolean) => Promise<boolean>>();
vi.mock("@/components/admin/wizard/Step3SheetCard", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/components/admin/wizard/Step3SheetCard")>();
  const RealCard = mod.Step3SheetCard;
  function RecordingCard(props: Parameters<typeof RealCard>[0]) {
    if (props.onToggleChecked) {
      capturedToggles.set(props.row.driveFileId, props.onToggleChecked);
    }
    return <RealCard {...props} />;
  }
  return { ...mod, Step3SheetCard: RecordingCard };
});

import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const WSID = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
const DFID_A = "df-settle-a";
const DFID_B = "df-settle-b";

const APPROVE_URL = (dfid: string) => `/api/admin/onboarding/staged/${WSID}/${dfid}/approve`;
const UNAPPROVE_URL = (dfid: string) => `/api/admin/onboarding/staged/${WSID}/${dfid}/unapprove`;

function rowA(overrides: Partial<Step3Row> = {}): Step3Row {
  return stagedRow(buildParseResult(), { driveFileId: DFID_A, ...overrides });
}
function rowB(overrides: Partial<Step3Row> = {}): Step3Row {
  return stagedRow(buildParseResult(), { driveFileId: DFID_B, ...overrides });
}

/** Invoke the captured result-bearing toggle for a row (latest render's prop). */
function toggle(dfid: string, next: boolean): Promise<boolean> {
  const fn = capturedToggles.get(dfid);
  if (!fn) throw new Error(`no captured onToggleChecked for ${dfid}`);
  return fn(next);
}

const okResponse = () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });
const refusedResponse = () =>
  new Response(JSON.stringify({ ok: false, code: "RESCAN_REVIEW_REQUIRED" }), { status: 200 });

/** Deferred fetch: every call is held until the test resolves it explicitly. */
function deferredFetch() {
  const pending: Array<{ url: string; resolve: (r: Response) => void }> = [];
  const mock = vi.fn(
    (url: string | URL | Request) =>
      new Promise<Response>((resolve) => {
        pending.push({ url: String(url), resolve });
      }),
  );
  return { mock, pending };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedToggles.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Step3Review — result-bearing publish settlement (spec §9.2 cases a–g)", () => {
  it("(a) single true request resolves true on a 200 success", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);

    let p!: Promise<boolean>;
    act(() => {
      p = toggle(DFID_A, true);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));
    expect(d.pending[0]!.url).toBe(APPROVE_URL(DFID_A));

    await act(async () => {
      d.pending[0]!.resolve(okResponse());
    });
    await expect(p).resolves.toBe(true);
  });

  it("(a) single true request resolves false on a 200 {ok:false} refusal, and the overlay reverts", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);
    const box = () => getByTestId(`wizard-step3-checkbox-${DFID_A}`) as HTMLInputElement;

    let p!: Promise<boolean>;
    act(() => {
      p = toggle(DFID_A, true);
    });
    // Optimistic while pending…
    await waitFor(() => expect(box().checked).toBe(true));
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));

    await act(async () => {
      d.pending[0]!.resolve(refusedResponse());
    });
    await expect(p).resolves.toBe(false);
    // …reverted to server truth (staged = unchecked) after the refusal.
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it("(b) two overlapping true requests coalesce to ONE POST and BOTH resolve with the same outcome", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);

    let p1!: Promise<boolean>;
    let p2!: Promise<boolean>;
    act(() => {
      p1 = toggle(DFID_A, true);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));
    act(() => {
      p2 = toggle(DFID_A, true); // overlapping — the first POST is still in flight
    });

    await act(async () => {
      d.pending[0]!.resolve(okResponse());
    });
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);
    // Coalesced: the second request never issued a competing POST.
    expect(d.mock).toHaveBeenCalledTimes(1);
  });

  it("(c) true then false before settlement: true-waiter resolves false, false-waiter true; final POST is unapprove", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);

    let pTrue!: Promise<boolean>;
    let pFalse!: Promise<boolean>;
    act(() => {
      pTrue = toggle(DFID_A, true);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));
    act(() => {
      pFalse = toggle(DFID_A, false); // flips before the approve settles (§11 C7)
    });

    // Release the approve → the flush loop sees the newer intent and sends the
    // correcting unapprove.
    await act(async () => {
      d.pending[0]!.resolve(okResponse());
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(2));
    expect(d.pending[1]!.url).toBe(UNAPPROVE_URL(DFID_A));
    await act(async () => {
      d.pending[1]!.resolve(okResponse());
    });

    await expect(pTrue).resolves.toBe(false); // superseded — settled unchecked
    await expect(pFalse).resolves.toBe(true); // the final write succeeded as unchecked
    const urls = d.mock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([APPROVE_URL(DFID_A), UNAPPROVE_URL(DFID_A)]);
  });

  it("(d) false then true (applied row): false-waiter resolves false, true-waiter true; final POST is approve", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    render(
      <Step3Review wizardSessionId={WSID} rows={[rowA({ status: "applied" }), rowB()]} />,
    );

    let pFalse!: Promise<boolean>;
    let pTrue!: Promise<boolean>;
    act(() => {
      pFalse = toggle(DFID_A, false);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));
    expect(d.pending[0]!.url).toBe(UNAPPROVE_URL(DFID_A));
    act(() => {
      pTrue = toggle(DFID_A, true);
    });

    await act(async () => {
      d.pending[0]!.resolve(okResponse());
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(2));
    expect(d.pending[1]!.url).toBe(APPROVE_URL(DFID_A));
    await act(async () => {
      d.pending[1]!.resolve(okResponse());
    });

    await expect(pFalse).resolves.toBe(false);
    await expect(pTrue).resolves.toBe(true);
  });

  it("(e) unmounting Step3Review with a pending waiter resolves it false (no leaked promise, no act warnings)", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    const { unmount } = render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);

    let p!: Promise<boolean>;
    act(() => {
      p = toggle(DFID_A, true);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));

    unmount(); // the POST never resolves — the cleanup effect must settle the waiter
    await expect(p).resolves.toBe(false);
    const actWarnings = errorSpy.mock.calls.filter((c) =>
      String(c[0]).includes("not wrapped in act"),
    );
    expect(actWarnings).toEqual([]);
  });

  it("(f) a refresh that removes the row resolves its pending waiter false via the committed effect", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    const view = render(<Step3Review wizardSessionId={WSID} rows={[rowA(), rowB()]} />);

    let p!: Promise<boolean>;
    act(() => {
      p = toggle(DFID_A, true);
    });
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));

    // A refresh delivers rows WITHOUT df-settle-a (e.g. a re-scan demoted it).
    view.rerender(<Step3Review wizardSessionId={WSID} rows={[rowB()]} />);
    await expect(p).resolves.toBe(false);
  });

  it("(g) idempotent no-op: an already-applied row requested true sends NO POST and still resolves true", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    render(
      <Step3Review wizardSessionId={WSID} rows={[rowA({ status: "applied" }), rowB()]} />,
    );

    let p!: Promise<boolean>;
    await act(async () => {
      p = toggle(DFID_A, true);
    });
    await expect(p).resolves.toBe(true);
    // Settlement point "overlay entry dropped without a POST" (§9.2.2): the
    // server already matches — the fetch mock is never called.
    expect(d.mock).not.toHaveBeenCalled();
  });
});

describe("Step3SheetCard — modal publish + live region (spec §9.1/§9.3)", () => {
  const liveRegion = (q: ReturnType<typeof render>) =>
    q.getByTestId(`wizard-step3-card-${DFID_A}-publish-live`);

  it("modal publish success: modal closes and the sr-only live region announces 'Selected to publish'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );
    const q = render(<Step3SheetCard row={rowA()} wizardSessionId={WSID} />);

    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID_A}-more`));
    const modal = () => q.queryByTestId(`wizard-step3-card-${DFID_A}-review-modal`);
    expect(modal()).not.toBeNull();

    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID_A}-review-publish`));
    await waitFor(() => expect(modal()).toBeNull()); // closes ONLY on success
    // The card checkbox reflects the settled checked state.
    expect(
      (q.getByTestId(`wizard-step3-checkbox-${DFID_A}`) as HTMLInputElement).checked,
    ).toBe(true);
    // Persistent polite live region (FinalizeButton pattern) announces success.
    const region = liveRegion(q);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toContain("sr-only");
    expect(region.textContent).toBe("Selected to publish");
  });

  it("modal publish refusal: modal STAYS open with the inline error note; live region announces the failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => refusedResponse()),
    );
    const q = render(<Step3SheetCard row={rowA()} wizardSessionId={WSID} />);

    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID_A}-more`));
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID_A}-review-publish`));

    // The footer error note renders inside the still-open modal (static human
    // copy — never a raw §12.4 code).
    const modal = q.getByTestId(`wizard-step3-card-${DFID_A}-review-modal`);
    await waitFor(() =>
      expect(
        within(modal).getByText("Couldn't update the publish selection. Try again."),
      ).toBeTruthy(),
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID_A}-review-modal`)).not.toBeNull();
    expect(liveRegion(q).textContent).toBe("Couldn't update the publish selection.");
    // The checkbox reverted to server truth (staged = unchecked).
    expect(
      (q.getByTestId(`wizard-step3-checkbox-${DFID_A}`) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("checkbox click stays fire-and-forget: optimistic flip, NO pending UI on the box while the POST is in flight", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.mock);
    const q = render(<Step3SheetCard row={rowA()} wizardSessionId={WSID} />);
    const box = () => q.getByTestId(`wizard-step3-checkbox-${DFID_A}`) as HTMLInputElement;

    fireEvent.click(box());
    // Optimistic + never disabled/greyed while its own POST is pending.
    await waitFor(() => expect(box().checked).toBe(true));
    expect(box().disabled).toBe(false);
    await waitFor(() => expect(d.mock).toHaveBeenCalledTimes(1));
    expect(d.pending[0]!.url).toBe(APPROVE_URL(DFID_A));

    await act(async () => {
      d.pending[0]!.resolve(okResponse());
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(box().checked).toBe(true);
  });

  it("checkbox fire-and-forget failure announces through the same live region", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => refusedResponse()),
    );
    const q = render(<Step3SheetCard row={rowA()} wizardSessionId={WSID} />);
    const box = () => q.getByTestId(`wizard-step3-checkbox-${DFID_A}`) as HTMLInputElement;

    fireEvent.click(box());
    await waitFor(() =>
      expect(liveRegion(q).textContent).toBe("Couldn't update the publish selection."),
    );
    // Reverted to server truth.
    expect(box().checked).toBe(false);
  });
});
