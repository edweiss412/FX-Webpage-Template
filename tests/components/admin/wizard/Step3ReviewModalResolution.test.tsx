// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx
 * (Phase 2 — spec §4.4)
 *
 * Pins the folded re-apply resolution behavior in Step3ReviewModal: tiered body
 * (tier-3 radios force a choice; single-action items auto-bind), the corrupt
 * guard (Approve suppressed, Ignore kept), and the behavioral apply/ignore
 * payloads. These are the load-bearing resolution paths — render-only assertions
 * would pass a no-op impl, so we assert the exact ReviewerChoice[] the modal
 * hands its callbacks (item_id shape, rename_value), not just that a callback
 * fired.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TriggeredReviewItem } from "@/lib/parser/types";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  Step3ReviewModal,
  type Step3ReviewResolution,
} from "@/components/admin/wizard/Step3ReviewModal";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sectionData(): StagedSectionData {
  const pr = buildParseResult({});
  const row = stagedRow(pr);
  return buildStagedSectionData({
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

const mi13Item = {
  id: "mi13-1",
  invariant: "MI-13",
  removed_name: "Old Name",
  added_name: "New Name",
} as unknown as TriggeredReviewItem;
const mi6Item = {
  id: "mi6-1",
  invariant: "MI-6",
  section: "schedule",
} as unknown as TriggeredReviewItem;

function resWith(
  items: TriggeredReviewItem[],
  over: Partial<Step3ReviewResolution> = {},
): Step3ReviewResolution {
  return {
    triggeredReviewItems: items,
    reviewItemsCorrupt: false,
    stagedId: "st1",
    isPublishRunActive: false,
    onApplyResolve: vi.fn(async () => true),
    onRescan: vi.fn(),
    onIgnore: vi.fn(async () => true),
    ...over,
  };
}

function renderModal(resolution: Step3ReviewResolution, onClose = vi.fn()) {
  return render(
    <Step3ReviewModal
      data={sectionData()}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={vi.fn(async () => true)}
      onClose={onClose}
      resolution={resolution}
    />,
  );
}

// ── Archived-tab offer in the Resolve box (spec §4.3/§4.5b) ──────────────────
const archivedTab: ArchivedPullSheetTab = {
  tabName: "OLD gear",
  headerPreviews: ["CASE A"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
};

// sectionData() variant that injects archived tabs + a durable override snapshot.
// data.driveFileId === DFID, data.wizardSessionId === WSID. Default override null
// (no divergence → pending offers surface); PSAT-1 SectionData field.
function sectionDataWith(
  archivedPullSheetTabs: ArchivedPullSheetTab[],
  pullSheetOverride: import("@/lib/sync/pullSheetOverride").OverrideSnapshot = null,
): StagedSectionData {
  const pr = buildParseResult({});
  const row = stagedRow(pr);
  return buildStagedSectionData({
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs,
    pullSheetOverride,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

// Render helper allowing resolution === undefined (archived-only rows) and
// threading archivedPullSheetTabs + the top-level isPublishRunActive prop.
function renderModalWith(opts: {
  resolution?: Step3ReviewResolution | undefined;
  archivedPullSheetTabs?: ArchivedPullSheetTab[];
  pullSheetOverride?: import("@/lib/sync/pullSheetOverride").OverrideSnapshot;
  isPublishRunActive?: boolean;
  onClose?: () => void;
}) {
  return render(
    <Step3ReviewModal
      data={sectionDataWith(opts.archivedPullSheetTabs ?? [], opts.pullSheetOverride ?? null)}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={vi.fn(async () => true)}
      onClose={opts.onClose ?? vi.fn()}
      {...(opts.resolution ? { resolution: opts.resolution } : {})}
      isPublishRunActive={opts.isPublishRunActive ?? false}
    />,
  );
}

describe("Step3ReviewModal archived-tab offer in the Resolve box (spec §4.3/§4.5b)", () => {
  // 1. Box appears on a clean staged row (no resolution) when an offer is pending.
  test("renders the Resolve box with the accept offer on a clean row with a pending archived tab", () => {
    renderModalWith({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
    const box = screen.getByLabelText("Resolve before publishing");
    expect(within(box).getByRole("button", { name: "Use this show’s gear" })).toBeInTheDocument();
  });

  // 2. Box offer has NO "Keep skipped" (showDismiss=false → no empty-box path).
  test("box offer omits the 'Keep skipped' dismiss", () => {
    renderModalWith({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
    const box = screen.getByLabelText("Resolve before publishing");
    expect(within(box).queryByRole("button", { name: "Keep skipped" })).toBeNull();
  });

  // 3. Re-apply footer ABSENT but NORMAL footer PRESENT on an archived-only row (§4.4).
  test("shows the normal footer, not the re-apply footer, on an archived-only row", () => {
    renderModalWith({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
    expect(screen.queryByTestId(`wizard-step3-card-${DFID}-review-resolution-note`)).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve & apply|Ignore/ })).toBeNull();
    expect(screen.getByTestId(`wizard-step3-card-${DFID}-review-footer`)).toBeInTheDocument();
  });

  // 4. No box offer when the durable override is already accepted (S3): the
  //    override snapshot MATCHES the included-tab preview → overrideActive, not
  //    divergent → offers empty. (Threading pullSheetOverride proves the true S3
  //    suppression path, not S5.)
  test("shows no box offer when the archived override is already accepted (S3)", () => {
    renderModalWith({
      resolution: undefined,
      archivedPullSheetTabs: [{ ...archivedTab, included: true }],
      pullSheetOverride: { tabName: archivedTab.tabName, fingerprint: archivedTab.fingerprint },
    });
    expect(screen.queryByLabelText("Resolve before publishing")).toBeNull();
  });

  // 4b. No box offer on an S5-divergent row: an included-tab preview with NO
  //     durable override is divergent → offers empty → the box shows no archived
  //     offer (the S5 recovery lives in the Pack-list section, not the box).
  test("shows no box offer on an S5-divergent row (included preview, null override)", () => {
    renderModalWith({
      resolution: undefined,
      archivedPullSheetTabs: [{ ...archivedTab, included: true }],
      pullSheetOverride: null,
    });
    expect(screen.queryByLabelText("Resolve before publishing")).toBeNull();
  });

  // 5. Accept POSTs the FULL CAS body incl. driveFileId===DFID + wizardSessionId===WSID.
  test("box accept POSTs the full override body with the correct driveFileId + session", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, status: "override_set" }), { status: 200 }),
      );
    renderModalWith({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
    const box = screen.getByLabelText("Resolve before publishing");
    fireEvent.click(within(box).getByRole("button", { name: "Use this show’s gear" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/onboarding/pull-sheet-override",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({
      driveFileId: DFID,
      wizardSessionId: WSID,
      tabName: archivedTab.tabName,
      expectedFingerprint: archivedTab.fingerprint,
      expectedOverrideSnapshot: null,
    });
  });

  // 6. Publish-run parity (§4.5): box accept stays ENABLED during a publish run.
  test("does not freeze the box accept during an active publish run", () => {
    renderModalWith({
      resolution: undefined,
      archivedPullSheetTabs: [archivedTab],
      isPublishRunActive: true,
    });
    const box = screen.getByLabelText("Resolve before publishing");
    expect(within(box).getByRole("button", { name: "Use this show’s gear" })).toBeEnabled();
  });

  // 7. Combined mode (§5 row 2): re-apply items AND the archived offer both render.
  test("renders both the re-apply items and the archived offer when resolution + offer coexist", () => {
    const sentinel = {
      id: "i1",
      invariant: "ONBOARDING_SCAN_REVIEW",
    } as unknown as TriggeredReviewItem;
    renderModalWith({
      resolution: resWith([sentinel]),
      archivedPullSheetTabs: [archivedTab],
    });
    const box = screen.getByLabelText("Resolve before publishing");
    expect(
      within(box).getByText("Onboarding scan staged this sheet for review."),
    ).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Use this show’s gear" })).toBeInTheDocument();
  });

  // 8. reviewItemsCorrupt + offer (§6): corrupt copy AND the archived offer both render.
  test("renders the corrupt-review copy and the archived offer together", () => {
    renderModalWith({
      resolution: resWith([], { reviewItemsCorrupt: true }),
      archivedPullSheetTabs: [archivedTab],
    });
    const box = screen.getByLabelText("Resolve before publishing");
    expect(
      within(box).getByTestId(`wizard-step3-card-${DFID}-review-resolution-corrupt`),
    ).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Use this show’s gear" })).toBeInTheDocument();
  });

  // 9. Coexistence (REQUIRED, spec §9.6): offer renders in BOTH box and Pack-list.
  test("renders the accept offer in BOTH the Resolve box and the Pack-list section", () => {
    renderModalWith({ resolution: undefined, archivedPullSheetTabs: [archivedTab] });
    expect(
      screen.getByTestId(
        `wizard-step3-card-${DFID}-review-resolution-archived-${archivedTab.tabName}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`pack-list-archived-offer-${DFID}-${archivedTab.tabName}`),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use this show’s gear" })).toHaveLength(2);
  });
});

describe("Step3ReviewModal resolution body (spec §4.4)", () => {
  test("tier-3 (MI-13) forces a choice before Approve enables", () => {
    renderModal(resWith([mi13Item]));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });

  test("single-action item (MI-6) renders no radio", () => {
    renderModal(resWith([mi6Item]));
    expect(screen.queryByRole("radio")).toBeNull();
    // auto-bound → Approve immediately enabled
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });

  test("corrupt items suppress Approve, keep Ignore", () => {
    renderModal(resWith([], { reviewItemsCorrupt: true }));
    expect(screen.queryByRole("button", { name: /approve & apply/i })).toBeNull();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeInTheDocument();
  });

  test("footer renders Approve & apply / Re-scan this sheet / Ignore this sheet", () => {
    renderModal(resWith([mi6Item]));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-scan this sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeInTheDocument();
  });

  test("resolution choices re-derive when items change on a still-open modal (Codex R5 MEDIUM)", () => {
    // In-modal Re-scan → router.refresh delivers NEW triggeredReviewItems while
    // the modal stays mounted. `useState(initialMemo)` ignores the memo after
    // first mount, so without a sync the choices go stale: a fresh single-action
    // item never auto-binds and Approve is stuck disabled until reopen.
    const { rerender } = renderModal(resWith([mi13Item])); // tier-3 → no auto-bind, Approve disabled
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    rerender(
      <Step3ReviewModal
        data={sectionData()}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
        resolution={resWith([mi6Item])} // single-action → must auto-bind after the swap
      />,
    );
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });
});

describe("Step3ReviewModal resolution behavioral payloads (HIGH plan-R2/R3)", () => {
  test("Approve & apply sends ReviewerChoice[] with item_id + rename_value for the tier-3 choice", async () => {
    const onApplyResolve = vi.fn(async () => true);
    renderModal(resWith([mi13Item], { onApplyResolve }));
    fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() =>
      expect(onApplyResolve).toHaveBeenCalledWith([
        expect.objectContaining({
          item_id: mi13Item.id,
          action: "rename",
          rename_value: "New Name",
        }),
      ]),
    );
  });

  test("single-action item auto-bound into the Approve payload (no radio, still a choice)", async () => {
    const onApplyResolve = vi.fn(async () => true);
    renderModal(resWith([mi6Item], { onApplyResolve }));
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() =>
      expect(onApplyResolve).toHaveBeenCalledWith([
        expect.objectContaining({ item_id: mi6Item.id, action: "apply" }),
      ]),
    );
  });

  test("Ignore this sheet calls onIgnore once", async () => {
    const onIgnore = vi.fn(async () => true);
    renderModal(resWith([mi6Item], { onIgnore }));
    fireEvent.click(screen.getByRole("button", { name: /ignore this sheet/i }));
    await waitFor(() => expect(onIgnore).toHaveBeenCalledTimes(1));
  });

  test("Approve closes the modal on success", async () => {
    const onClose = vi.fn();
    renderModal(resWith([mi6Item], { onApplyResolve: vi.fn(async () => true) }), onClose);
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("isPublishRunActive freezes Approve / Re-scan / Ignore", () => {
    renderModal(resWith([mi6Item], { isPublishRunActive: true }));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /re-scan this sheet/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeDisabled();
  });
});
