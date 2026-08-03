// @vitest-environment jsdom
/**
 * tests/components/admin/parsePanelComposition.test.tsx
 * (warning-trim-undefer plan Task 1; spec §5 — wizard-unchanged proof)
 *
 * Pins the <WarningsBreakdown> WIZARD branch (gate off — no chrome provider):
 * the full list + the UNCONDITIONAL correction-loop callout + the per-row
 * use-raw / recognize-role controls, and the ABSENCE of the published surface's
 * cards / group eyebrow / bulk chip. It landed FIRST and must keep passing
 * UNMODIFIED after Tasks 4-5 rebuild the PUBLISHED warnings panel.
 *
 * The filename is historical. This file also held a <ParsePanel> composition
 * test until 2026-08-02, when that component was deleted as dead code
 * (BL-ADMIN-PARSEPANEL-ORPHANED — nothing under app/, components/, or lib/ had
 * imported it since the show-page-to-modal pivot). The StagedReviewCard chrome
 * that test snapshotted is independently pinned by
 * tests/components/admin/stagedCardBaseline.test.tsx, so no coverage was lost.
 * The name is kept because DEFERRED-archive.md cites it.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";

// Covers BOTH surfaces' hooks: StagedReviewCard (useSearchParams, useRouter) and
// the wizard control boundaries mounted by WarningsBreakdown (useRouter).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { WarningsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { triggerAriaLabel } from "@/components/admin/roleRecognizeCopy";

afterEach(() => cleanup());

// ── Test B: wizard WarningsBreakdown branch (gate off) ──────────────────────

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const warnPanelId = `wizard-step3-card-${DFID}-breakdown-warnings`;
const rowId = (i: number) => `wizard-step3-card-${DFID}-warning-${i}`;

/** Info-severity row: never in scope for either control (severity + code). */
const INFO_ROW: ParseWarning = {
  severity: "info",
  code: "AGENDA_PDF_UNREADABLE",
  message: "An info-level note about the sheet",
};
/** UNKNOWN_ROLE_TOKEN carrying a non-blank roleToken → recognize-role control. */
const ROLE_ROW: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "unknown role for A2",
  roleToken: "A2",
  blockRef: { kind: "crew", name: "A2" },
};
/** In-scope, resolvable structural code → an ENABLED use-raw control
 *  (transform-active: no persisted decision, not in-flight). */
const STRUCTURAL_ROW: ParseWarning = {
  severity: "warn",
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  message: "ambiguous room header",
  blockRef: { kind: "rooms", name: "Salon B" },
  resolution: {
    resolvable: true,
    contentHash: "hash-room-1",
    parsed: { kind: "rooms", name: "Salon B", dimensions: null, floor: null },
    replacement: { kind: "rooms", name: "SALON B RAW", dimensions: null, floor: null },
  },
};

function renderWizardWarnings(warnings: ParseWarning[]) {
  // NO Step3SectionChromeContext.Provider → chrome === null → gate OFF (the
  // staged/wizard branch). `wizardSessionId` + `dfid` present so the per-row
  // controls mount (live-page parity).
  return render(
    <WarningsBreakdown
      dfid={DFID}
      warnings={warnings}
      mode="rescan"
      useRawDecisions={[]}
      wizardSessionId={WSID}
    />,
  );
}

describe("wizard WarningsBreakdown branch — gate off (spec §5)", () => {
  test("lists every row (both severities), unconditional callout + non-blocking note, per-row controls, NO published-surface chrome", () => {
    const warnings = [INFO_ROW, ROLE_ROW, STRUCTURAL_ROW];
    const q = renderWizardWarnings(warnings);
    const panel = q.getByTestId(warnPanelId);
    const scoped = within(panel);

    // Every fixture row renders a list row; no phantom fourth row.
    const li0 = scoped.getByTestId(rowId(0));
    const li1 = scoped.getByTestId(rowId(1));
    const li2 = scoped.getByTestId(rowId(2));
    expect(scoped.queryByTestId(rowId(warnings.length))).toBeNull();
    // Severity labels (scoped per row so a sibling can't satisfy it).
    expect(li0.textContent).toContain("info");
    expect(li1.textContent).toContain("warn");
    expect(li2.textContent).toContain("warn");

    // Wizard renders the correction-loop callout + the non-blocking note.
    expect(scoped.getByTestId("correction-loop-callout")).toBeTruthy();
    expect(scoped.getByTestId(`wizard-step3-card-${DFID}-warnings-nonblocking`)).toBeTruthy();

    // Per-row controls self-hide out of scope: recognize-role only on the role
    // row, use-raw only on the structural row.
    expect(within(li0).queryByTestId("role-recognize-control-list")).toBeNull();
    expect(within(li0).queryByTestId("use-raw-control-list")).toBeNull();

    const roleControl = within(li1).getByTestId("role-recognize-control-list");
    expect(within(roleControl).getByLabelText(triggerAriaLabel("A2"))).toBeTruthy();
    expect(within(li1).queryByTestId("use-raw-control-list")).toBeNull();

    const useRaw = within(li2).getByTestId("use-raw-control-list");
    expect(useRaw.getAttribute("data-state")).toBe("transform-active");
    // Enabled: the radiogroup renders both readings and the toggles are not
    // soft-disabled (busy=false in transform-active).
    expect(within(useRaw).getByRole("radiogroup")).toBeTruthy();
    const toggleOn = within(useRaw).getByTestId("use-raw-toggle-on-list");
    expect(toggleOn.getAttribute("aria-disabled")).toBeNull();
    expect(within(li2).queryByTestId("role-recognize-control-list")).toBeNull();

    // No published-surface chrome anywhere in the wizard tree (anti-tautology:
    // these testids are rendered by no sub-element here, so a scoped null is
    // conclusive).
    expect(scoped.queryAllByTestId("per-show-actionable-item")).toHaveLength(0);
    expect(panel.querySelector('[data-testid^="section-warning-controls-"]')).toBeNull();
    expect(panel.querySelector('[data-testid^="dq-bulk-ignore-"]')).toBeNull();
  });

  test("unconditional callout: warn-only rows (zero info, zero correction-inviting) still render correction-loop-callout", () => {
    // In the PUBLISHED branch the callout is gated on an info row inviting a
    // correction; the wizard branch renders it unconditionally. A warn-only
    // fixture (no info rows at all) would drop the callout under the published
    // gate, so this pins "wizard unconditional".
    const warnOnly: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "unrecognized row 1",
        rawSnippet: "Mystery | 1",
      },
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "unrecognized row 2",
        rawSnippet: "Mystery | 2",
      },
    ];
    const q = renderWizardWarnings(warnOnly);
    const panel = q.getByTestId(warnPanelId);
    expect(within(panel).getByTestId("correction-loop-callout")).toBeTruthy();
  });
});
