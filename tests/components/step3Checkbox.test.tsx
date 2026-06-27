// @vitest-environment jsdom
/**
 * tests/components/step3Checkbox.test.tsx (Task D3 — spec §4.1/§4.5/§4.6/§7.2)
 *
 * The publish checkbox is the durable publish-intent control. Checked state =
 * row.status === 'applied'. On toggle it POSTs to the LIGHTWEIGHT approve /
 * un-approve pair (NOT the heavy apply route), optimistically updates, then
 * router.refresh(). It is disabled while its own request is in flight (§4.6).
 *
 * Anti-tautology: URLs are derived from the fixture's driveFileId +
 * wizardSessionId, not hardcoded literals; the count is derived from how many
 * fixture rows have status 'applied'.
 *
 * jsdom — render + interaction only; the durable write contract is the real-DB
 * route test (tests/api/wizard-approve-route.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";

const WSID = "11111111-2222-4333-8444-555555555555";

function parseResult(title: string): ParseResult {
  // Minimal but structurally-valid ParseResult: the card's §4.6 guard requires
  // a `.show`. Other arrays are absent → coerced to [] (count 0) by the card.
  return { show: { title } } as unknown as ParseResult;
}

function stagedRow(dfid: string, title: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${title}.gsheet`,
    status: "staged",
    parseResult: parseResult(title),
  };
}

function appliedRow(dfid: string, title: string): Step3Row {
  return { ...stagedRow(dfid, title), status: "applied" };
}

const APPROVE_URL = (dfid: string) => `/api/admin/onboarding/staged/${WSID}/${dfid}/approve`;
const UNAPPROVE_URL = (dfid: string) => `/api/admin/onboarding/staged/${WSID}/${dfid}/unapprove`;

function okFetch() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Step3SheetCard publish checkbox (Task D3)", () => {
  it("an unchecked (staged) card renders an unchecked checkbox; checking it POSTs to the approve URL", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "df-check-1";
    const { getByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Alpha")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.checked).toBe(false);

    fireEvent.click(box);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(APPROVE_URL(dfid));
    expect(init?.method).toBe("POST");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("a checked (applied) card renders a checked checkbox; unchecking it POSTs to the un-approve URL", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "df-uncheck-1";
    const { getByTestId } = render(
      <Step3SheetCard row={appliedRow(dfid, "Beta")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(UNAPPROVE_URL(dfid));
    expect(init?.method).toBe("POST");
  });

  it("re-syncs to the server status after a refresh (so 'Select all' flips this box too)", () => {
    // The reported bug: Select-all approves every row server-side and router.refresh()es,
    // but the individual boxes held a stale `useState(initialChecked)` and ignored the
    // updated prop. Now the box follows the server prop (status) on re-render.
    const dfid = "df-resync-1";
    const { getByTestId, rerender } = render(
      <Step3SheetCard row={stagedRow(dfid, "Delta")} wizardSessionId={WSID} />,
    );
    const box = () => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box().checked).toBe(false);
    // Simulate the post-Select-all refresh: SAME card, now status 'applied' (the
    // status-keyed checkbox re-seeds, so re-query the element).
    rerender(<Step3SheetCard row={appliedRow(dfid, "Delta")} wizardSessionId={WSID} />);
    expect(box().checked).toBe(true);
    // ...and the reverse (Select-all clear → status back to 'staged').
    rerender(<Step3SheetCard row={stagedRow(dfid, "Delta")} wizardSessionId={WSID} />);
    expect(box().checked).toBe(false);
  });

  it("the checkbox is disabled while a request is in flight (prevents double-toggle, §4.6)", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => pending);
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "df-inflight-1";
    const { getByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Gamma")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;

    fireEvent.click(box);

    // While the (still-pending) request is in flight, the checkbox is disabled.
    await waitFor(() => expect(box.disabled).toBe(true));
    // A second click while disabled does not fire another request.
    fireEvent.click(box);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify({ status: "approved" }), { status: 200 }));
    await waitFor(() => expect(box.disabled).toBe(false));
  });

  it("a corrupt (parseResult null) row shows NO checkbox (§4.6)", () => {
    const dfid = "df-corrupt-1";
    const { queryByTestId } = render(
      <Step3SheetCard
        row={{ driveFileId: dfid, status: "staged", parseResult: null }}
        wizardSessionId={WSID}
      />,
    );
    expect(queryByTestId(`wizard-step3-checkbox-${dfid}`)).toBeNull();
  });
});

describe("Step3Review select-all + live count (Task D3)", () => {
  it("the count line reflects the number of 'applied' rows out of the clean total", () => {
    const rows: Step3Row[] = [
      appliedRow("a", "A"),
      stagedRow("b", "B"),
      appliedRow("c", "C"),
      // a non-clean row is NOT part of the M (clean) denominator
      { driveFileId: "x", status: "hard_failed", driveFileName: "X" },
    ];
    const appliedCount = rows.filter((r) => r.status === "applied").length; // 2
    const cleanCount = rows.filter((r) => r.status === "applied" || r.status === "staged").length; // 3
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const count = getByTestId("wizard-step3-publish-count");
    expect(count.textContent).toContain(String(appliedCount));
    expect(count.textContent).toContain(String(cleanCount));
    expect(count.textContent).toMatch(/2 of 3/);
  });

  it("Select all POSTs approve for each unchecked clean row (only the staged ones)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [
      stagedRow("s1", "S1"),
      appliedRow("a1", "A1"), // already checked → not re-approved
      stagedRow("s2", "S2"),
    ];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const selectAll = getByTestId("wizard-step3-select-all") as HTMLInputElement;
    expect(selectAll.checked).toBe(false); // not all clean rows checked

    fireEvent.click(selectAll);

    // Exactly the two unchecked staged rows are approved.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain(APPROVE_URL("s1"));
    expect(urls).toContain(APPROVE_URL("s2"));
    expect(urls).not.toContain(APPROVE_URL("a1"));
    expect(urls.every((u) => String(u).endsWith("/approve"))).toBe(true);
  });

  it("Select all, when every clean row is already applied, unchecks all (POSTs un-approve each)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [appliedRow("a1", "A1"), appliedRow("a2", "A2")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const selectAll = getByTestId("wizard-step3-select-all") as HTMLInputElement;
    expect(selectAll.checked).toBe(true); // all clean rows checked

    fireEvent.click(selectAll);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(UNAPPROVE_URL("a1"));
    expect(urls).toContain(UNAPPROVE_URL("a2"));
    expect(urls.every((u) => u.endsWith("/unapprove"))).toBe(true);
  });

  it("the checkbox has an accessible label and a real <input type=checkbox>", () => {
    const dfid = "df-a11y-1";
    const { getByTestId } = render(
      <Step3SheetCard row={stagedRow(dfid, "Label")} wizardSessionId={WSID} />,
    );
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.tagName).toBe("INPUT");
    expect(box.getAttribute("type")).toBe("checkbox");
    // Labeled either via aria-label or an associated <label>.
    const hasAriaLabel = (box.getAttribute("aria-label") ?? "").length > 0;
    const card = getByTestId(`wizard-step3-card-${dfid}`);
    const hasLabelEl = within(card).queryAllByText(/publish/i).length > 0;
    expect(hasAriaLabel || hasLabelEl).toBe(true);
  });

  // The reported bug: hitting "Select all" did not check the individual cards
  // until you manually toggled one. Root cause: the per-card checkbox held its own
  // useState seeded from the row status and only re-checked when router.refresh()
  // delivered new props that re-keyed it — which raced/failed in the real app. The
  // fix lifts the publish-intent into Step3Review as one shared optimistic overlay,
  // so Select all flips every box immediately, with NO dependence on a refresh.
  // `refresh` is a no-op here (props never change), reproducing the failure mode.
  it("Select all checks EVERY per-card box immediately, without a refresh delivering new props", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [stagedRow("s1", "S1"), stagedRow("s2", "S2"), stagedRow("s3", "S3")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = (dfid: string) => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box("s1").checked).toBe(false);
    expect(box("s2").checked).toBe(false);
    expect(box("s3").checked).toBe(false);

    fireEvent.click(getByTestId("wizard-step3-select-all"));

    // Every card box reflects the optimistic select-all instantly — no rerender,
    // no refresh-delivered prop change. `refresh` stays a no-op the whole time.
    await waitFor(() => {
      expect(box("s1").checked).toBe(true);
      expect(box("s2").checked).toBe(true);
      expect(box("s3").checked).toBe(true);
    });
    expect((getByTestId("wizard-step3-select-all") as HTMLInputElement).checked).toBe(true);
    expect(getByTestId("wizard-step3-publish-count").textContent).toMatch(/3 of 3/);
  });

  it("toggling one card box checks only that box immediately (lifted optimistic state, no refresh needed)", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [stagedRow("s1", "S1"), stagedRow("s2", "S2")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = (dfid: string) => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;

    fireEvent.click(box("s1"));

    await waitFor(() => expect(box("s1").checked).toBe(true));
    expect(box("s2").checked).toBe(false); // unaffected
    expect(getByTestId("wizard-step3-publish-count").textContent).toMatch(/1 of 2/);
  });

  it("Select all CLEAR unchecks every box optimistically (no refresh needed) and shows 0 of N", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [appliedRow("a1", "A1"), appliedRow("a2", "A2")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = (dfid: string) => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box("a1").checked).toBe(true);
    expect(box("a2").checked).toBe(true);

    fireEvent.click(getByTestId("wizard-step3-select-all"));

    // Mirror of the check-all optimism: every box flips UNchecked instantly with
    // refresh stubbed to a no-op (the clear path runs the same shared overlay flip).
    await waitFor(() => {
      expect(box("a1").checked).toBe(false);
      expect(box("a2").checked).toBe(false);
    });
    expect(getByTestId("wizard-step3-publish-count").textContent).toMatch(/0 of 2/);
  });

  it("a failed approve reverts the optimistic check (toggleOne revert path)", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [stagedRow("s1", "S1")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = () => getByTestId("wizard-step3-checkbox-s1") as HTMLInputElement;

    fireEvent.click(box());

    // Optimistically checks, then reverts to unchecked when the POST returns !ok.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(box().checked).toBe(false));
    expect(getByTestId("wizard-step3-publish-count").textContent).toMatch(/0 of 1/);
  });

  it("Select all reverts ONLY the row whose approve failed (partial-failure revert)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/s2/")
        ? new Response("nope", { status: 500 })
        : new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [stagedRow("s1", "S1"), stagedRow("s2", "S2"), stagedRow("s3", "S3")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = (dfid: string) => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;

    fireEvent.click(getByTestId("wizard-step3-select-all"));

    await waitFor(() => {
      expect(box("s1").checked).toBe(true);
      expect(box("s3").checked).toBe(true);
      expect(box("s2").checked).toBe(false); // its approve failed → only it reverts
    });
    expect(getByTestId("wizard-step3-publish-count").textContent).toMatch(/2 of 3/);
  });

  it("during a Select-all batch the per-card boxes are disabled, so an individual click can't race the batch", async () => {
    // Keep the batch in flight (fetch never resolves) so selectAllPending stays true.
    let resolveAll: (r: Response) => void = () => {};
    const pendingResp = new Promise<Response>((res) => {
      resolveAll = res;
    });
    const fetchMock = vi.fn(() => pendingResp);
    vi.stubGlobal("fetch", fetchMock);
    const rows: Step3Row[] = [stagedRow("s1", "S1"), stagedRow("s2", "S2")];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const box = (dfid: string) => getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;

    fireEvent.click(getByTestId("wizard-step3-select-all"));

    // While the batch is in flight every per-card box is disabled...
    await waitFor(() => expect(box("s1").disabled).toBe(true));
    expect(box("s2").disabled).toBe(true);
    const callsDuringBatch = fetchMock.mock.calls.length; // the 2 approve POSTs (still pending)

    // ...so an individual click during the batch fires NO competing POST (the exact
    // race that could otherwise leave a published show stuck displayed as unchecked).
    fireEvent.click(box("s1"));
    expect(fetchMock.mock.calls.length).toBe(callsDuringBatch);

    resolveAll(new Response(JSON.stringify({ status: "approved" }), { status: 200 }));
  });

  it("reconciles the optimistic overlay against refreshed props (a stale overlay can't mask a later server change)", async () => {
    // This pins the subtlest part of the fix: the render-time reconcile that DROPS
    // overlay entries once the server status matches. If reconcile regressed to a
    // no-op, the optimistic value would stick forever and the final assertion fails.
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId, rerender } = render(
      <Step3Review wizardSessionId={WSID} rows={[stagedRow("s1", "S1")]} />,
    );
    const box = () => getByTestId("wizard-step3-checkbox-s1") as HTMLInputElement;

    // Toggle on → optimistic overlay s1=true.
    fireEvent.click(box());
    await waitFor(() => expect(box().checked).toBe(true));

    // Refresh delivers s1 now 'applied' (server caught up; overlay matches → dropped).
    rerender(<Step3Review wizardSessionId={WSID} rows={[appliedRow("s1", "S1")]} />);
    expect(box().checked).toBe(true);

    // A LATER refresh reverts s1 to 'staged' server-side. Because the stale overlay
    // was dropped at reconcile, the box now FOLLOWS the server and unchecks — it does
    // not stay stuck checked.
    rerender(<Step3Review wizardSessionId={WSID} rows={[stagedRow("s1", "S1")]} />);
    expect(box().checked).toBe(false);
  });
});
