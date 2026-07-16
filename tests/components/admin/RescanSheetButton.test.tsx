// @vitest-environment jsdom
/**
 * tests/components/admin/RescanSheetButton.test.tsx (Task 6 — UI)
 *
 * Pins the contract of <RescanSheetButton> (spec §9):
 *   - idle label "Re-scan this sheet" → loading "Re-scanning…" (disabled) → result.
 *   - On click POSTs { driveFileId, wizardSessionId } to
 *     /api/admin/onboarding/rescan-sheet; router.refresh() on ok===true.
 *   - Each RescanResult branch renders its plain-English line (no em dashes, no raw
 *     §12.4 code); needs_attention/busy add the cataloged dougFacing + HelpAffordance.
 *
 * Anti-tautology: the posted body and the rendered branch copy are asserted
 * INDEPENDENTLY, and the result-copy scan is scoped to the result element (testid
 * `rescan-sheet-result-*`) so the idle button label can never satisfy the assertion.
 *
 * Plus mount coverage (spec §9 placement): the button mounts on the null-parse
 * (no-details) card, is ABSENT on the compact selectable card (Variant B §4.3 —
 * View/Review is the affordance there), is suppressed for a dirty re-scan row, and
 * on the final-publish blocker lists renders ONLY for STAGED_PARSE_OUTDATED_AT_PHASE_D rows.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { RunFinalCASButton } from "@/components/admin/RunFinalCASButton";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import type { ParseResult } from "@/lib/parser/types";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const fetchMock = vi.fn<typeof fetch>();

const DFID = "drive-rescan-btn-1";
const WSID = "11111111-1111-1111-1111-111111111111";
const OUTDATED = "STAGED_PARSE_OUTDATED_AT_PHASE_D";

function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => cleanup());

describe("RescanSheetButton — states + posted body", () => {
  test("renders the idle label", () => {
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    expect(getByTestId(`rescan-sheet-button-${DFID}`).textContent).toContain("Re-scan this sheet");
  });

  test("on click POSTs { driveFileId, wizardSessionId } to the rescan route (body asserted independently of the branch)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        ok: true,
        status: "updated",
        needsReview: false,
        changed: true,
        demoted: false,
      }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/admin/onboarding/rescan-sheet");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ driveFileId: DFID, wizardSessionId: WSID });
  });

  test("updated + clean + changed → 'Updated. Still ready to publish.' and router.refresh()", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        ok: true,
        status: "updated",
        needsReview: false,
        changed: true,
        demoted: false,
      }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    const result = getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "";
    expect(result).toContain("Updated. Still ready to publish.");
    expect(result).not.toContain("—");
  });

  test("updated + clean + NOT changed → 'No changes found. Still ready to publish.' (closes the loop: a role-mapping heal finds no sheet edits, yet publish now succeeds)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        ok: true,
        status: "updated",
        needsReview: false,
        changed: false,
        demoted: false,
      }),
    );
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        "No changes found. Still ready to publish.",
      ),
    );
  });

  // Spec §C3 copy truth table, rows 1-4 (needsReview: true). demoted || changed →
  // the byte-identical "changed" sentence; {demoted:false, changed:false} → S1 (the
  // fixed false positive: an unapproved sheet that did NOT change must not claim it did).
  const CHANGED_COPY = "Updated. This sheet changed and needs your review before publishing.";
  const S1_COPY = "No changes found. This sheet still needs your review before publishing.";
  test.each([
    { demoted: true, changed: true, copy: CHANGED_COPY },
    { demoted: true, changed: false, copy: CHANGED_COPY }, // content regressed; modifiedTime stable
    { demoted: false, changed: true, copy: CHANGED_COPY }, // edited while unapproved
    { demoted: false, changed: false, copy: S1_COPY }, // the reported false positive
  ])(
    "updated + needsReview {demoted:$demoted, changed:$changed} → '$copy'",
    async ({ demoted, changed, copy }) => {
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ ok: true, status: "updated", needsReview: true, changed, demoted }),
      );
      const { getByTestId } = render(
        <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
      );
      await act(async () => {
        fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
      });
      await waitFor(() =>
        expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(copy),
      );
      const result = getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "";
      if (copy === S1_COPY) {
        // The false positive itself: nothing changed, so no "changed" claim.
        expect(result).not.toContain(CHANGED_COPY);
        expect(result).not.toContain("Updated.");
      }
      expect(result).not.toContain("—");
      // It still refreshes so the server re-render shows the current card state.
      expect(refreshMock).toHaveBeenCalled();
    },
  );

  test("needs_attention → cataloged dougFacing + HelpAffordance, no raw code, no refresh", async () => {
    const code = "STAGED_PARSE_FAILED";
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ ok: false, status: "needs_attention", code }),
    );
    const { getByTestId, container } = render(
      <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        MESSAGE_CATALOG.STAGED_PARSE_FAILED.dougFacing!,
      ),
    );
    // HelpAffordance disclosure present for the code.
    expect(getByTestId(`rescan-sheet-result-${DFID}`).querySelector("details")).not.toBeNull();
    // No raw §12.4 code leaks (invariant 5).
    expect(container.textContent ?? "").not.toContain(code);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("busy → CONCURRENT_FINALIZE_IN_FLIGHT dougFacing", async () => {
    const code = "CONCURRENT_FINALIZE_IN_FLIGHT";
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: "busy", code }));
    const { getByTestId, container } = render(
      <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() =>
      expect(getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "").toContain(
        MESSAGE_CATALOG.CONCURRENT_FINALIZE_IN_FLIGHT.dougFacing!,
      ),
    );
    expect(container.textContent ?? "").not.toContain(code);
  });

  test("superseded → a short plain line, no raw code, no refresh", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: "superseded" }));
    const { getByTestId } = render(<RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} />);
    await act(async () => {
      fireEvent.click(getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => {
      const result = getByTestId(`rescan-sheet-result-${DFID}`).textContent ?? "";
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain("superseded");
      expect(result).not.toContain("—");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("RescanSheetButton — Step3 card mount (both render paths)", () => {
  const PARSE: ParseResult = {
    show: { title: "Mount Show", client_label: "Client" },
  } as unknown as ParseResult;

  function row(dfid: string, parseResult: ParseResult | null, code?: string): Step3Row {
    const base: Step3Row = {
      driveFileId: dfid,
      driveFileName: `${dfid}.gsheet`,
      status: "staged",
      parseResult,
    };
    return code ? { ...base, lastFinalizeFailureCode: code } : base;
  }

  test("does NOT mount on the compact selectable card (View/Review is the affordance)", () => {
    // Variant B (§4.3): re-scan is a RECOVERY affordance for the no-details and
    // demoted variants only. A clean, parseable card exposes the modal trigger
    // (View/Review), not a standalone re-scan button.
    const dfid = "drive-mount-normal";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[row(dfid, PARSE)]} />,
    );
    expect(queryByTestId(`rescan-sheet-button-${dfid}`)).toBeNull();
    expect(getByTestId(`wizard-step3-card-${dfid}-more`)).not.toBeNull();
  });

  test("mounts on the null-parse (no-details) card", () => {
    const dfid = "drive-mount-nodetails";
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={[row(dfid, null)]} />);
    expect(getByTestId(`rescan-sheet-button-${dfid}`)).not.toBeNull();
  });

  test("suppressed for a demoted dirty re-scan row (context banner; Review modal is the recovery)", () => {
    const dfid = "drive-mount-dirty";
    const { getByTestId, queryByTestId, container } = render(
      <Step3Review wizardSessionId={WSID} rows={[row(dfid, PARSE, RESCAN_REVIEW_REQUIRED)]} />,
    );
    // The demoted-dirty variant has no standalone Re-scan button…
    expect(queryByTestId(`rescan-sheet-button-${dfid}`)).toBeNull();
    // …and the context banner remains, but its old reapply LINK (→ the deleted
    // staged page) is gone (spec §4.4); recovery is the Review modal.
    expect(getByTestId(`wizard-step3-card-${dfid}-rescan-review`)).not.toBeNull();
    expect(queryByTestId(`wizard-step3-rescan-review-${dfid}`)).toBeNull();
    expect(container.querySelector('a[href^="/admin/onboarding/staged/"]')).toBeNull();
  });
});

describe("RescanSheetButton — resultPlacement (spec §G, Task 12)", () => {
  // Byte-parity pins: the two card call sites (Step3SheetCard.tsx L328/L536) pass NO
  // resultPlacement, so the DEFAULT must keep today's markup byte-identically. These
  // strings mirror RescanSheetButton.tsx's stacked tone classes verbatim — if they
  // drift, the card call sites drifted too.
  const STACKED_ROOT = "flex flex-col gap-2";
  const STACKED_CODED =
    "flex flex-col gap-1 rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text";
  const STACKED_INFO =
    "rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong";
  // Mobile-safe anchor (impeccable audit P1): left-anchored below sm (the
  // footer is the positioning context there — the root wrapper is sm:relative
  // only), wrapper-anchored right-0 at ≥sm.
  const OVERLAY_CLASSES = [
    "absolute",
    "bottom-full",
    "left-0",
    "sm:left-auto",
    "sm:right-0",
    "mb-2",
    "z-10",
    "w-max",
    "max-w-[min(20rem,80vw)]",
    "shadow-(--shadow-tile)",
  ];
  const INFO_BODY = {
    ok: true,
    status: "updated",
    needsReview: false,
    changed: true,
    demoted: false,
  };
  const CODED_BODY = { ok: false, status: "needs_attention", code: "STAGED_PARSE_FAILED" };

  async function driveResult(
    body: unknown,
    props: Partial<Parameters<typeof RescanSheetButton>[0]> = {},
  ) {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(body));
    const utils = render(
      <RescanSheetButton driveFileId={DFID} wizardSessionId={WSID} {...props} />,
    );
    await act(async () => {
      fireEvent.click(utils.getByTestId(`rescan-sheet-button-${DFID}`));
    });
    await waitFor(() => expect(utils.getByTestId(`rescan-sheet-result-${DFID}`)).not.toBeNull());
    return utils;
  }

  test("default (no prop): info result byte-equals today's stacked markup — no dismiss, root wrapper unchanged (card call-site parity)", async () => {
    const { getByTestId, container } = await driveResult(INFO_BODY);
    const result = getByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.className).toBe(STACKED_INFO);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(false);
    expect(container.querySelector('button[aria-label="Dismiss"]')).toBeNull();
    expect((container.firstElementChild as HTMLElement).className).toBe(STACKED_ROOT);
  });

  test("default (no prop): coded result byte-equals today's stacked markup — no dismiss", async () => {
    const { getByTestId, container } = await driveResult(CODED_BODY);
    const result = getByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.className).toBe(STACKED_CODED);
    expect(container.querySelector('button[aria-label="Dismiss"]')).toBeNull();
  });

  test("overlay: root wrapper is sm:relative (NOT relative — below sm the footer anchors the overlay); result keeps an INNER role=status aria-live=polite live region + tone classes AND the absolute out-of-flow classes + animation hook (catches: result back in flow → footer growth; 390px left-edge clip)", async () => {
    const { getByTestId, container } = await driveResult(INFO_BODY, {
      resultPlacement: "overlay",
    });
    const root = container.firstElementChild as HTMLElement;
    const rootClasses = root.className.split(/\s+/);
    expect(rootClasses).toContain("sm:relative");
    // A base `relative` would re-anchor the <sm overlay to the wrapper and
    // reintroduce the 390px viewport clip (impeccable audit P1).
    expect(rootClasses).not.toContain("relative");
    const result = getByTestId(`rescan-sheet-result-${DFID}`);
    // The live region is an INNER element (dual-gate P1: no interactive
    // content inside role="status"), not the positioned wrapper itself.
    expect(result.getAttribute("role")).toBeNull();
    const live = result.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    expect(live!.getAttribute("aria-live")).toBe("polite");
    const classes = result.className.split(/\s+/);
    for (const cls of STACKED_INFO.split(" ")) expect(classes).toContain(cls);
    for (const cls of OVERLAY_CLASSES) expect(classes).toContain(cls);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(true);
  });

  test("overlay: coded result keeps its tone classes + HelpAffordance (dougFacing rendered in both placements)", async () => {
    const { getByTestId } = await driveResult(CODED_BODY, { resultPlacement: "overlay" });
    const result = getByTestId(`rescan-sheet-result-${DFID}`);
    const classes = result.className.split(/\s+/);
    for (const cls of STACKED_CODED.split(" ")) expect(classes).toContain(cls);
    for (const cls of OVERLAY_CLASSES) expect(classes).toContain(cls);
    expect(result.querySelector("details")).not.toBeNull();
    expect(result.textContent ?? "").toContain(MESSAGE_CATALOG.STAGED_PARSE_FAILED.dougFacing!);
  });

  test("overlay: dismiss button (aria-label='Dismiss', ≥44px size-tap-min target) removes the result instantly", async () => {
    const { queryByTestId, container } = await driveResult(INFO_BODY, {
      resultPlacement: "overlay",
    });
    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    expect(dismiss).not.toBeNull();
    expect(dismiss.className.split(/\s+/)).toContain("size-tap-min");
    fireEvent.click(dismiss);
    expect(queryByTestId(`rescan-sheet-result-${DFID}`)).toBeNull();
  });

  test("overlay: dismiss returns focus to the Re-scan trigger — never dropped to body inside the focus-trapped dialog (WCAG 2.4.3, dual-gate P1)", async () => {
    const { getByTestId, queryByTestId, container } = await driveResult(INFO_BODY, {
      resultPlacement: "overlay",
    });
    const dismiss = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    // A keyboard user tabs to Dismiss (it holds focus) and activates it.
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);
    fireEvent.click(dismiss);
    expect(queryByTestId(`rescan-sheet-result-${DFID}`)).toBeNull();
    expect(document.activeElement).toBe(getByTestId(`rescan-sheet-button-${DFID}`));
  });

  test("overlay: live region contains ONLY the status copy — no button/link/details inside role=status; Dismiss + HelpAffordance are siblings in the wrapper (dual-gate P1)", async () => {
    const { getByTestId } = await driveResult(CODED_BODY, { resultPlacement: "overlay" });
    const result = getByTestId(`rescan-sheet-result-${DFID}`);
    const live = result.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    expect(live!.getAttribute("aria-live")).toBe("polite");
    // Announcement purity: no interactive content inside the live region.
    expect(live!.querySelector("button, a, details, summary")).toBeNull();
    expect(live!.textContent ?? "").toContain(MESSAGE_CATALOG.STAGED_PARSE_FAILED.dougFacing!);
    // The controls still exist — as SIBLINGS inside the overlay wrapper.
    expect(result.querySelector('button[aria-label="Dismiss"]')).not.toBeNull();
    expect(result.querySelector("details")).not.toBeNull();
  });

  test("globals.css wires the overlay animation hook: step3-details-pop-in at --duration-fast, reduced-motion → none (spec §G / §H N4)", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /\[data-rescan-overlay-result\]\s*\{\s*animation:\s*step3-details-pop-in\s+var\(--duration-fast\)\s+var\(--ease-out-quart\);/,
    );
    const reduced = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\[data-rescan-overlay-result\]\s*\{\s*animation:\s*none;/,
    );
    expect(reduced).not.toBeNull();
  });
});

describe("RescanSheetButton — final-publish blocker mount (OUTDATED rows only)", () => {
  const SESSION = "22222222-2222-2222-2222-222222222222";

  test("RunFinalCASButton: renders for an OUTDATED row, NOT for a corrupt row", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        {
          ok: false,
          code: OUTDATED,
          per_row: [
            { drive_file_id: "cas-outdated", code: OUTDATED },
            { drive_file_id: "cas-corrupt", code: "STAGED_PARSE_RESULT_CORRUPT" },
          ],
        },
        { status: 409 },
      ),
    );
    const { getByTestId, queryByTestId } = render(<RunFinalCASButton sessionId={SESSION} />);
    await act(async () => {
      fireEvent.click(getByTestId("run-final-cas-button"));
    });
    await waitFor(() => expect(queryByTestId("run-final-cas-per-row")).not.toBeNull());
    expect(getByTestId("rescan-sheet-button-cas-outdated")).not.toBeNull();
    expect(queryByTestId("rescan-sheet-button-cas-corrupt")).toBeNull();
  });

  test("FinalizeButton: renders for an OUTDATED row, NOT for a corrupt row", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: SESSION,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: OUTDATED,
            per_row: [
              { drive_file_id: "fin-outdated", code: OUTDATED },
              { drive_file_id: "fin-corrupt", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
            ],
          },
          { status: 409 },
        ),
      );
    const { getByTestId, queryByTestId } = render(<FinalizeButton wizardSessionId={SESSION} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(queryByTestId("wizard-finalize-cas-per-row")).not.toBeNull());
    expect(getByTestId("rescan-sheet-button-fin-outdated")).not.toBeNull();
    expect(queryByTestId("rescan-sheet-button-fin-corrupt")).toBeNull();
  });
});
