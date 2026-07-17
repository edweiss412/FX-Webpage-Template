// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/packListBreakdownStates.test.tsx (Task 12 — spec §5.6/§6/§10/§11)
 *
 * Pins the four `PackListBreakdown` archived-tab states (spec §5.6):
 *  - S1 Empty:      no pull sheet, no archived tabs         → "No pack list parsed."
 *  - S2 Offer:      archived tab, not-changed, no override  → warning card + accept/keep buttons
 *  - S3 Included:   override active                          → pack list + "Included from archived tab" + Revoke
 *  - S4 Re-confirm: archived tab, content-changed, no override → "changed. Re-confirm" prefix (NOT generic S2)
 *
 * Anti-tautology: every assertion is scoped `within` the Pack-list section
 * (`[data-section="pack-list"]`), never the whole card, so a sibling can never
 * satisfy it. Button-body assertions parse the ACTUAL fetch payload (row-state
 * CAS transport, spec §5.4/10b) — a broken handler that omits wizardSessionId or
 * the expected snapshot fails. Copy carries NO em dashes (DESIGN.md §UI-copy);
 * the S4 assertion pins the period form, so an em dash reintroduced here fails.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { PullSheetCase } from "@/lib/parser/types";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { PackListBreakdown, Step3RunStateContext } from "@/components/admin/wizard/step3ReviewSections";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockClear();
  fetchSpy = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, status: "set" }),
  }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function packSection(container: HTMLElement): HTMLElement {
  const sec = container.querySelector('[data-section="pack-list"]');
  if (!(sec instanceof HTMLElement)) throw new Error("no pack-list section");
  return sec;
}

function tab(overrides: Partial<ArchivedPullSheetTab> = {}): ArchivedPullSheetTab {
  return {
    tabName: "OLD PULL SHEET",
    headerPreviews: ["RIA - CHICAGO, IL"],
    fingerprint: "ff",
    included: false,
    contentChangedSinceAccept: false,
    ...overrides,
  };
}

const FOH: PullSheetCase = {
  caseLabel: "FOH",
  items: [{ qty: 1, cat: null, subCat: null, item: "Current DI Box" }],
};

function lastBody() {
  const call = fetchSpy.mock.calls.at(-1);
  if (!call) throw new Error("fetch not called");
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("PackListBreakdown archived-tab states (§5.6)", () => {
  test("S1 Empty: no pull sheet + no archived tabs => 'No pack list parsed.'", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[]}
        pullSheetOverride={null}
      />,
    );
    expect(packSection(container).textContent).toContain("No pack list parsed.");
  });

  test("S2 Offer: archived tab (not changed), no override => card lists tabName + every headerPreview + accept posts full body (expectedOverrideSnapshot null)", async () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[
          tab({ headerPreviews: ["RIA - CHICAGO", "MIAMI"], fingerprint: "ff" }),
        ]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toContain("OLD PULL SHEET");
    expect(sec.textContent).toContain("RIA - CHICAGO"); // every case preview shown (I2)
    expect(sec.textContent).toContain("MIAMI");
    expect(sec.textContent).not.toContain("No pack list parsed."); // S1 suppressed by the offer

    const accept = within(sec).getByRole("button", { name: /use this show.s gear/i });
    fireEvent.click(accept);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/pull-sheet-override"),
      expect.anything(),
    );
    expect(lastBody()).toEqual({
      driveFileId: DFID,
      wizardSessionId: WSID,
      tabName: "OLD PULL SHEET",
      expectedFingerprint: "ff",
      expectedOverrideSnapshot: null,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  test("S3 Included: override active + populated cases => pack list + 'Included from archived tab' note + Revoke posts tabName:null with snapshot CAS", async () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[FOH]}
        archivedPullSheetTabs={[tab({ included: true, fingerprint: "ff" })]}
        pullSheetOverride={{ tabName: "OLD PULL SHEET", fingerprint: "ff" }}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toContain("Current DI Box"); // the folded-in pack list renders
    expect(sec.textContent).toMatch(/included from archived tab/i);

    fireEvent.click(within(sec).getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(lastBody()).toEqual({
      driveFileId: DFID,
      wizardSessionId: WSID,
      tabName: null,
      expectedOverrideSnapshot: { tabName: "OLD PULL SHEET", fingerprint: "ff" },
    });
  });

  test("S4 Re-confirm: content-changed + no override + empty cases => 'changed. Re-confirm' prefix, NOT generic S2 copy", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ contentChangedSinceAccept: true, fingerprint: "ee" })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toMatch(/changed\.\s*re-confirm/i);
    // no em dash reintroduced (DESIGN.md §UI-copy)
    expect(sec.textContent).not.toContain("—");
  });

  test("S4 mixed workbook: current non-OLD pack list PRESENT + changed OLD tab => current pack list AND the re-confirm card (S4 not suppressed by non-empty cases)", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[FOH]}
        archivedPullSheetTabs={[tab({ contentChangedSinceAccept: true, fingerprint: "ee" })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toContain("Current DI Box"); // current gear still rendered
    expect(sec.textContent).toMatch(/changed\.\s*re-confirm/i); // AND the changed-tab card
  });

  test("multiple OLD tabs => one accept button per tab (render all, no truncation)", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[
          tab({ tabName: "OLD PULL SHEET", fingerprint: "a1" }),
          tab({ tabName: "OLD PULL SHEET 2", fingerprint: "b2" }),
        ]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(within(sec).getAllByRole("button", { name: /use this show.s gear/i })).toHaveLength(2);
    expect(sec.textContent).toContain("OLD PULL SHEET 2");
  });

  test("'Keep skipped' dismisses the offer AND moves focus to the section (never strands focus on body — WCAG 2.4.3)", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ fingerprint: "ff" })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    fireEvent.click(within(sec).getByRole("button", { name: /keep skipped/i }));
    // Card gone…
    expect(within(sec).queryByRole("button", { name: /use this show.s gear/i })).toBeNull();
    // …and focus did NOT fall to <body>.
    expect(document.activeElement).toBe(sec);
  });

  test("empty headerPreviews string => '(no header text)' but the card still renders + accept still works", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ headerPreviews: [""], fingerprint: "ff" })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toContain("(no header text)");
    expect(within(sec).getByRole("button", { name: /use this show.s gear/i })).toBeTruthy();
  });

  test("S5 accept-stale: durable set + tab present-but-not-included => recovery block, NO S2 offer", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
        pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
      />,
    );
    const sec = packSection(container);
    expect(within(sec).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
    expect(within(sec).queryByRole("button", { name: /use this show.s gear/i })).toBeNull(); // S2 suppressed
  });

  test("S5 revoke-stale: durable null + tab still included => recovery block, NO S3 revoke note", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[FOH]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: true })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(within(sec).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
    expect(within(sec).queryByRole("button", { name: /revoke/i })).toBeNull(); // S3 suppressed
  });

  test("S5 tab-swap: durable B + preview included A => recovery block (snapshot mismatch)", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: true })]}
        pullSheetOverride={{ tabName: "OLD B", fingerprint: "fp2" }}
      />,
    );
    expect(within(packSection(container)).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
  });

  test("S4 non-collision: durable null + not-included content-changed tab => S4, NOT S5", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp2", included: false, contentChangedSinceAccept: true })]}
        pullSheetOverride={null}
      />,
    );
    const sec = packSection(container);
    expect(sec.textContent).toMatch(/changed\.\s*re-confirm/i);
    expect(within(sec).queryByTestId(`pack-list-rescan-needed-${DFID}`)).toBeNull(); // S5 did NOT steal S4
  });

  test("published mode (no wizardSessionId): no affordance, no S5 even if a durable snapshot is passed", () => {
    const { container } = render(
      <PackListBreakdown
        dfid={DFID}
        cases={[FOH]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
        pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
      />,
    );
    const sec = packSection(container);
    expect(within(sec).queryByTestId(`pack-list-rescan-needed-${DFID}`)).toBeNull();
    expect(within(sec).queryByRole("button", { name: /use this show.s gear/i })).toBeNull();
  });

  test("S5 Re-scan freezes when the context flag is true (context consumption)", () => {
    const { container } = render(
      <Step3RunStateContext.Provider value={{ isPublishRunActive: true }}>
        <PackListBreakdown dfid={DFID} wizardSessionId={WSID} cases={[]}
          archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
          pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }} />
      </Step3RunStateContext.Provider>,
    );
    expect(within(packSection(container)).getByRole("button", { name: /re-scan/i })).toBeDisabled();
  });

  test("S5 Re-scan enabled with no publish run (default context)", () => {
    const { container } = render(
      <PackListBreakdown dfid={DFID} wizardSessionId={WSID} cases={[]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
        pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }} />,
    );
    expect(within(packSection(container)).getByRole("button", { name: /re-scan/i })).not.toBeDisabled();
  });
});
