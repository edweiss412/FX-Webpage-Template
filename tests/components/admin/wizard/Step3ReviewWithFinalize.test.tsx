// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewWithFinalize.test.tsx
 *
 * Pins the optimistic-count contract for the wizard step-3 publish surface.
 *
 * BUG (publish-count lag): the checkboxes inside <Step3Review> flip instantly
 * from an optimistic client overlay, but the "Publish N shows & finish setup"
 * count on <FinalizeButton> used to be derived purely from server truth
 * (Step3Container's `result.rows[].status === "applied"`), which only updated
 * after the approve POST landed AND router.refresh() re-ran the Server
 * Component. The button therefore lagged the boxes — caught mid-flight as
 * checked boxes alongside "Publish 0 shows".
 *
 * <Step3ReviewWithFinalize> lifts the live optimistic counts out of
 * <Step3Review> (via onCountsChange) and feeds them straight to
 * <FinalizeButton>, so the label tracks the boxes with zero delay — no server
 * round-trip required.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { controllableNdjson } from "../_finalizeStreamHarness";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

const fetchMock = vi.fn<typeof fetch>();

const WIZARD_SESSION_ID = "22222222-2222-2222-2222-222222222222";

function mockJsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

// A clean, selectable, UNCHECKED row (status 'staged' + a reviewable preview).
function stagedSelectable(driveFileId: string, title: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${title}.gsheet`,
    status: "staged",
    parseResult: { show: { title } } as unknown as ParseResult,
  };
}
// A selectable row at a given status (applied → checked, staged → unchecked).
function selectable(driveFileId: string, status: "staged" | "applied"): Step3Row {
  return { ...stagedSelectable(driveFileId, driveFileId), status };
}
// A clean 'staged' row with NO reviewable preview → not selectable (no checkbox).
function noDetailsRow(driveFileId: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${driveFileId}.gsheet`,
    status: "staged",
    parseResult: null,
  };
}
// A blocking hard-fail row (finishable=false).
function hardFailRow(driveFileId: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${driveFileId}.gsheet`,
    status: "hard_failed",
    pendingIngestionId: `pi-${driveFileId}`,
    errorCode: "MI_PARSE_FAILED",
  };
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(mockJsonResponse({ status: "approved" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Step3ReviewWithFinalize — optimistic publish count", () => {
  test("button label seeds from the server initial counts", () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );
    expect(getByTestId("wizard-finalize-button").textContent).toContain(
      "Publish 0 shows & finish setup",
    );
  });

  test("checking a box updates the button count immediately (no server refresh)", async () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );

    const box = getByTestId("wizard-step3-checkbox-dfid-a") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(box);
    });

    // The label reflects the optimistic overlay the instant the box flips —
    // BEFORE (and independent of) any router.refresh re-deriving server truth.
    await waitFor(() =>
      expect(getByTestId("wizard-finalize-button").textContent).toContain(
        "Publish 1 show & finish setup",
      ),
    );
  });

  test("checking every box drives the count to the full clean total", async () => {
    const rows = [stagedSelectable("dfid-a", "Alpha"), stagedSelectable("dfid-b", "Bravo")];
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={rows}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={2}
      />,
    );

    await act(async () => {
      fireEvent.click(getByTestId("wizard-step3-select-all"));
    });

    await waitFor(() =>
      expect(getByTestId("wizard-finalize-button").textContent).toContain(
        "Publish 2 shows & finish setup",
      ),
    );
  });
});

describe("WizardFooter — step-3 publish footer (tracking-in-center redesign 2026-07-05)", () => {
  test("footer center shows the idle finish hint (not a 'N of M selected' count) + Back + Publish", () => {
    const { getByTestId, queryByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied"), selectable("b", "staged")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={1}
      />,
    );
    // The "N of M selected" count is GONE from the footer.
    expect(queryByTestId("wizard-step3-publish-count")).toBeNull();
    // The center now carries the calm idle hint while nothing is publishing.
    expect(getByTestId("wizard-step3-finish-hint").textContent).toContain(
      "You can finish setup whenever you are ready.",
    );
    expect(getByTestId("wizard-step3-back").getAttribute("href")).toBe("/admin?step=2");
    expect(getByTestId("wizard-finalize-button")).toBeTruthy();
    // The finish hint lives in the footer (center slot), not the scroll body.
    expect(
      getByTestId("wizard-step3-finish-hint").closest('[data-testid="wizard-footer"]'),
    ).not.toBeNull();
  });

  test("selectableTotal===0 (only a no-details clean row) but finishable → Publish stays ENABLED", () => {
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[noDetailsRow("a")]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={1}
      />,
    );
    expect(getByTestId("wizard-step3-finish-hint")).toBeTruthy();
    // Existing finishable gate, NOT any selectable count — finish-with-nothing is reachable.
    expect((getByTestId("wizard-finalize-button") as HTMLButtonElement).disabled).toBe(false);
  });

  test("empty rows → NO footer (guard at Step3ReviewWithFinalize)", () => {
    // Spec §4.4/§7: with zero rows the wrapper renders no footer at all (no hint,
    // no Back, no Publish) — gated on `rows.length > 0`, so an empty Step 3 never
    // shows a spurious footer over the empty state.
    const { queryByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={0}
      />,
    );
    expect(queryByTestId("wizard-footer")).toBeNull();
    expect(queryByTestId("wizard-step3-finish-hint")).toBeNull();
    expect(queryByTestId("wizard-finalize-button")).toBeNull();
    expect(queryByTestId("wizard-step3-back")).toBeNull();
  });

  test("a blocking row → finishable=false → Publish DISABLED (unchanged finishable gate)", () => {
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[hardFailRow("a")]}
        finishable={false}
        initialPublishCount={0}
        initialUncheckedCleanCount={0}
      />,
    );
    expect(getByTestId("wizard-step3-finish-hint")).toBeTruthy();
    expect((getByTestId("wizard-finalize-button") as HTMLButtonElement).disabled).toBe(true);
  });

  test("clicking Publish keeps the button MOUNTED in a disabled 'Setting up…' state (no vanish)", async () => {
    // Hang the finalize request so the run stays in flight (never resolves).
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    const btn = () => getByTestId("wizard-finalize-button") as HTMLButtonElement;
    // Idle: an enabled Publish trigger.
    expect(btn().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(btn());
    });
    // Owner decision 2026-07-06: the button does NOT unmount on click — it steps
    // into a disabled, aria-busy intermediary (was: removed). The label reads
    // "Setting up…" as of 2026-08-29: the batch phase creates every show Held and
    // the Live flip belongs to /finalize-cas, so the old "Publishing…" was false.
    // Retargeted, not weakened — this still pins a disabled, aria-busy button
    // carrying a specific label, and still fails if that label goes missing.
    const b = btn();
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    // Exact, not a case-insensitive substring: /Setting up/i also passes on an appended
    // suffix or a contradictory sentence containing the phrase (whole-diff R1 finding 6).
    expect((b.textContent ?? "").trim()).toBe("Setting up…");
    // The detailed per-sheet tracking still renders alongside it in the center.
    expect(getByTestId("wizard-step3-tracking")).toBeTruthy();
  });
});

describe("Step3PublishCounts — selectable totals (Task 1)", () => {
  test("onCountsChange reports selectableTotal excluding demoted/no-details clean rows", () => {
    const onCounts = vi.fn();
    // 2 clean+selectable (1 applied → checked), 1 clean-but-demoted
    // (lastFinalizeFailureCode set → excluded from selectable, kept in publishRows).
    const rows: Step3Row[] = [
      { ...stagedSelectable("a", "Alpha"), status: "applied" },
      stagedSelectable("b", "Bravo"),
      { ...stagedSelectable("c", "Charlie"), lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" },
    ];
    render(
      <Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={rows} onCountsChange={onCounts} />,
    );
    const last = onCounts.mock.calls.at(-1)![0];
    expect(last.selectableTotal).toBe(2); // demoted 'c' excluded
    expect(last.selectedCount).toBe(1); // only 'a' applied/checked
    expect(last.publishCount).toBe(1); // unchanged (over publishRows)
    expect(last.uncheckedCleanCount).toBe(2); // unchanged: 'b' + demoted 'c'
  });
  // ---------------------------------------------------------------------------
  // Task 2 (spec 2026-08-29-step3-finalize-progress-scope): the SAME batch-phase
  // claim on the second renderer. Not a duplicate of the FinalizeButton suite —
  // these are two components that independently render the same sentence, which
  // is exactly how one surface gets fixed and the other silently keeps the old
  // copy. Feeding real row events needs the extracted harness: this suite's other
  // running-state test hangs fetch forever and so receives NO row events, which
  // would make a subline assertion pass against an element that never renders.
  // ---------------------------------------------------------------------------
  async function runningCompactTracking({ done = 1, total = 2 } = {}) {
    const batch = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response);
    const view = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total });
      batch.push({ type: "row", done, total, name: "East Coast", driveFileId: "f1" });
    });
    return { ...view, batch };
  }

  test("compact tracking reports setup, and the publish verb is gone from the batch phase", async () => {
    const { getByTestId } = await runningCompactTracking();
    const tracking = getByTestId("wizard-step3-tracking");
    expect(getByTestId("wizard-step3-tracking-heading").textContent).toBe("Setting up your shows…");
    expect(tracking.textContent ?? "").not.toContain("Publishing your shows");
    expect(tracking.textContent ?? "").not.toContain("Publishing: ");
  });

  test.each([
    { done: 1, total: 2, expected: "1 of 2 shows" },
    { done: 1, total: 1, expected: "1 of 1 show" },
  ])("the compact count names what it counts ($expected)", async ({ done, total, expected }) => {
    // This suite used to pin the count BARE, and that was right at the time: the plan
    // recorded the bare form as deliberate, because the compact readout lives in a
    // sticky bar whose height is load-bearing and the spec's dimensional proof assumed
    // the only changing text sat inside a truncated node, which this count did not.
    // The measurement that would have settled it could not be taken in that worktree.
    //
    // It has been taken. At 375px against the real footer the heading holds ONE line at
    // every rung through 99999 of 99999 with the noun appended, footer flat at 54.6px;
    // it wraps only at six digits. And the heading now carries `min-w-0 truncate`, so
    // the one-line guarantee is structural rather than a property of the counts anyone
    // happened to sample — which matters because state.total is unbounded. The bare
    // form is no longer the correct state, and the reason it WAS is recorded here
    // rather than deleted.
    //
    // BOTH totals, because a suite testing only the plural lets "1 of 1 shows" regress
    // silently.
    const { getByTestId } = await runningCompactTracking({ done, total });
    expect(getByTestId("wizard-step3-tracking").textContent ?? "").toContain(expected);
  });

  test("compact subline names the completed row and makes no claim about its outcome", async () => {
    const { getByTestId } = await runningCompactTracking();
    // Premise: the row event actually populated lastName. Without it this suite
    // renders no subline at all and the assertion below would prove nothing.
    const line = getByTestId("wizard-step3-tracking-current");
    expect(line.textContent).toBe("East Coast");
  });

  test("every accessible name in the compact batch phase reads Show setup progress", async () => {
    const { getByTestId } = await runningCompactTracking();
    const group = getByTestId("wizard-step3-tracking");
    // querySelectorAll is DESCENDANT-only and the aria-label sits on the SAME
    // element as the testid, so the group's own label must be added explicitly.
    const labelled = [group, ...Array.from(group.querySelectorAll("[aria-label]"))].filter((el) =>
      el.hasAttribute("aria-label"),
    );
    expect(labelled.length).toBeGreaterThanOrEqual(2);
    expect(new Set(labelled.map((el) => el.getAttribute("aria-label")))).toEqual(
      new Set(["Show setup progress"]),
    );
    // The RAW attribute is not the accessible name. `aria-labelledby` WINS over
    // `aria-label`, so a labelledby pointing at stale copy leaves this set reading
    // "Show setup progress" while a screen reader announces something else — probed
    // and confirmed in whole-diff R2 finding 6. Two assertions, because each catches
    // what the other cannot: the set pins the attribute VALUE, and this pins that the
    // attribute is what the name is actually computed FROM.
    const overridden = labelled.filter((el) => el.hasAttribute("aria-labelledby"));
    expect(
      overridden.map((el) => el.getAttribute("data-testid") ?? el.tagName),
      "aria-labelledby would override the aria-label these assertions pin",
    ).toEqual([]);
  });
});

describe("Step3 compact tracking — the settled batch receipt in the CAS phase", () => {
  async function runToCas(rows: number) {
    const batch = controllableNdjson();
    const cas = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(cas.response);
    const view = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: rows });
      for (let i = 1; i <= rows; i++) {
        batch.push({ type: "row", done: i, total: rows, name: `Show ${i}`, driveFileId: `f${i}` });
      }
    });
    await act(async () => {
      batch.push({
        type: "result",
        body: {
          status: "all_batches_complete",
          wizard_session_id: WIZARD_SESSION_ID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        },
      });
      batch.close();
    });
    return view;
  }

  test.each([
    { rows: 2, expected: "2 of 2 shows set up" },
    { rows: 1, expected: "1 of 1 show set up" },
  ])("the compact CAS phase carries the settled count ($expected)", async ({ rows, expected }) => {
    // The receipt carries the NOUN here as well as on the panel. A bare "2 of 2 set up"
    // beside the panel's "2 of 2 shows set up" would recreate the exact divergence
    // FINALIZE-COMPACT-COUNT-NOUN-1 is about, on the surface that row is about.
    const view = await runToCas(rows);
    // PREMISE: in the CAS phase on this case's own inputs. The batch phase renders a
    // live count containing the same digits, so without this the assertion could match
    // a run that never left it.
    expect(view.getByTestId("wizard-step3-tracking").textContent).toContain("Finishing setup");
    expect(view.getByTestId("wizard-step3-tracking-settled").textContent).toContain(expected);
  });

  test("an INDETERMINATE progress bar renders during CAS", async () => {
    const view = await runToCas(2);
    const bar = view.getByTestId("wizard-finalize-progressbar") as unknown as HTMLProgressElement;
    // PREMISE: in the CAS phase. The batch phase also renders a bar with this testid,
    // so without this the assertion could be reading the determinate one.
    expect(view.getByTestId("wizard-step3-tracking").textContent).toContain("Finishing setup");
    expect(bar.getAttribute("value"), "the CAS bar must be INDETERMINATE").toBeNull();
    expect(bar.getAttribute("aria-label")).toBe("Show setup progress");
  });

  test("no receipt when this session ran no batch (checkpoint resume)", async () => {
    // checkpointStatus "all_batches_complete" maps to mode "finish"
    // (Step3ReviewWithFinalize.tsx:100-104), which skips the batch loop entirely and
    // reaches CAS with completedRef and grandTotalRef both reset to zero. There is no
    // batch in THIS session to report, so a receipt would be counting work this run did
    // not do.
    //
    // This is the flow an operator lands in after reloading mid-finalize, which is
    // exactly the outcome FINALIZE-CAS-PROGRESS-AFFORDANCE-1 exists to prevent — so the
    // state it produces is deliberate rather than an accident of two refs being zero.
    // An implementation seeding the receipt from the checkpoint would pass every other
    // case and print a count for work this run never did.
    const cas = controllableNdjson();
    fetchMock.mockResolvedValueOnce(cas.response);
    const view = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
        checkpointStatus="all_batches_complete"
      />,
    );
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    // PREMISE: the run actually entered the CAS phase. Without it a run still idle
    // renders no receipt either, and the assertion below would pass vacuously.
    expect(view.getByTestId("wizard-step3-tracking")).toBeTruthy();
    expect(view.queryByTestId("wizard-step3-tracking-settled")).toBeNull();
  });
});

describe("Step3 compact tracking — the focused group answers 'is it still working?'", () => {
  // Whole-diff review R1 finding 6, and the class the panel's own P3 fix left half
  // repaired. Both renderers put focus on a named role="group" whose every visible
  // string is aria-hidden; the panel gained aria-busy and the compact footer did not,
  // so a virtual-cursor operator re-reading THIS group between announcements still
  // found a named group with no perceivable state. Asserted in both phases because the
  // group is one element spanning them and the CAS bar carries no value either.
  test.each([
    { phase: "batch", cas: false },
    { phase: "cas", cas: true },
  ])("the compact group reports busy in the $phase phase", async ({ cas: intoCas }) => {
    const batch = controllableNdjson();
    const casStream = controllableNdjson();
    fetchMock.mockResolvedValueOnce(batch.response).mockResolvedValueOnce(casStream.response);
    const view = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WIZARD_SESSION_ID}
        rows={[selectable("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    await act(async () => {
      fireEvent.click(view.getByTestId("wizard-finalize-button"));
    });
    await act(async () => {
      batch.push({ type: "listed", total: 1 });
      batch.push({ type: "row", done: 1, total: 1, name: "Show 1", driveFileId: "f1" });
    });
    if (intoCas) {
      await act(async () => {
        batch.push({
          type: "result",
          body: {
            status: "all_batches_complete",
            wizard_session_id: WIZARD_SESSION_ID,
            remaining_count: 0,
            unresolved_manifest_count: 0,
            per_row: [],
          },
        });
        batch.close();
      });
    }
    const group = view.getByTestId("wizard-step3-tracking");
    // PREMISE: this case is reading the phase it names. Both phases render the same
    // group element, so without this the cas row could assert against the batch phase
    // and pass while proving nothing about the phase it is named for.
    expect(
      (group.textContent ?? "").includes("Finishing setup"),
      "premise: the case must be reading the phase it names",
    ).toBe(intoCas);
    expect(group.getAttribute("aria-busy")).toBe("true");
  });
});
