// @vitest-environment jsdom
/**
 * The unsaved reading guard (warning-card-fixes spec §6.5, R15; plan Task 18b).
 *
 * A picked reading is a local draft until Save (§6.3). Every control that unmounts the
 * review or replaces its warnings (guard points G1 to G10) must stop and ask while a
 * draft is unsaved, and must behave exactly as today when none is.
 *
 * Each guard-point case makes ONE row dirty through the real UI, presses the point, and
 * asserts the prompt shows AND the point's own action did not run (its spy is the
 * subject), so an unguarded point fails its own case. Each passthrough case presses the
 * same point with no draft and asserts the action ran in the same event with no prompt,
 * so a guard that blocks with nothing to lose fails too.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefresh,
    push: routerPush,
    prefetch: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

type Held = { args: unknown[]; resolve: (v: unknown) => void };
const stagedUseRaw: Held[] = [];
const holder =
  (into: Held[]) =>
  (...args: unknown[]) =>
    new Promise((resolve) => {
      into.push({ args, resolve });
    });
vi.mock("@/app/admin/onboarding/_actions/useRawStaged", () => ({
  setStagedUseRawDecisionAction: (...a: unknown[]) => holder(stagedUseRaw)(...a),
}));
vi.mock("@/app/admin/show/[slug]/_actions/useRaw", () => ({
  setUseRawDecisionAction: () => new Promise(() => {}),
}));
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: () => new Promise(() => {}),
}));

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  buildParseResult,
  stagedRow,
  STEP3_FIXTURE_DFID as DFID,
  STEP3_FIXTURE_WSID as WSID,
} from "../wizard/_step3ReviewFixture";

const PROMPT = "unsaved-readings-prompt";
const fetchCalls: string[] = [];
let fetchBody: unknown = { ok: true };
/** When true, each fetch waits until the test calls the release it pushed here. */
let holdFetch = false;
const heldFetches: Array<() => void> = [];
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  stagedUseRaw.length = 0;
  fetchCalls.length = 0;
  fetchBody = { ok: true };
  holdFetch = false;
  heldFetches.length = 0;
  routerPush.mockClear();
  routerRefresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      fetchCalls.push(String(url));
      if (holdFetch) await new Promise<void>((release) => heldFetches.push(release));
      return new Response(JSON.stringify(fetchBody), { status: 200 });
    }),
  );
  // Reduced motion for the whole case (async steps included): every close is then the
  // synchronous `onClose()` of ReviewModalShell's reduced-motion branch.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
});

function room(snippet: string, hash: string): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "Room header could be read two ways",
    blockRef: { kind: "rooms" },
    rawSnippet: snippet,
    resolution: {
      resolvable: true,
      contentHash: hash,
      parsed: {
        kind: "rooms",
        name: snippet.split(" ")[0] ?? snippet,
        dimensions: null,
        floor: null,
      },
      replacement: { kind: "rooms", name: snippet, dimensions: null, floor: null },
    },
  };
}
const ROOM_A = room("Ballroom A / B", "hash-a");
const ROOM_B = room("Salon 1 / 2", "hash-b");

// ── wizard ─────────────────────────────────────────────────────────────────────
function wizardData(warnings: ParseWarning[]): StagedSectionData {
  const pr = buildParseResult({ warnings });
  return {
    ...buildStagedSectionData({
      pr,
      row: stagedRow(pr),
      dfid: DFID,
      wizardSessionId: WSID,
      crewMembers: pr.crewMembers,
      rooms: pr.rooms,
      hotels: pr.hotelReservations,
      pullSheet: [],
      archivedPullSheetTabs: [],
      pullSheetOverride: null,
      ros: {},
      warnings,
      agendaBaseline: [],
      useRawDecisions: [],
    }),
    dq: {
      target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
      model: {
        active: warnings.map((_, index) => ({ index, reportSurfaceId: `sid-${index}` })),
        ignored: [],
      },
    },
  };
}

/** Releases for the wizard's held Publish / Approve / Ignore requests (`hold: true`). */
const heldActions: Array<(ok: boolean) => void> = [];
function renderWizard(
  opts: { resolution?: boolean; warnings?: ParseWarning[]; hold?: boolean } = {},
) {
  heldActions.length = 0;
  const answer = () =>
    opts.hold === true
      ? new Promise<boolean>((resolve) => heldActions.push(resolve))
      : Promise.resolve(true);
  const onClose = vi.fn();
  const onRequestSetChecked = vi.fn(answer);
  const onApplyResolve = vi.fn(answer);
  const onIgnore = vi.fn(answer);
  const d = wizardData(opts.warnings ?? [ROOM_A, ROOM_B]);
  const element = (data: StagedSectionData) => (
    <Step3ReviewModal
      data={data}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={onRequestSetChecked}
      onClose={onClose}
      {...(opts.resolution
        ? {
            resolution: {
              triggeredReviewItems: [],
              reviewItemsCorrupt: false,
              stagedId: "staged-1",
              isPublishRunActive: false,
              onApplyResolve,
              onRescan: vi.fn(),
              onIgnore,
            },
          }
        : {})}
    />
  );
  const view = render(element(d));
  const rerenderWith = (warnings: ParseWarning[]) => view.rerender(element(wizardData(warnings)));
  return { onClose, onRequestSetChecked, onApplyResolve, onIgnore, rerenderWith };
}

const wtid = (name: string) => `wizard-step3-card-${DFID}-review-${name}`;
const wizardRow = (i: number) => screen.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`);
function dirtyWizardRow(i: number) {
  fireEvent.click(within(wizardRow(i)).getByTestId("use-raw-toggle-on-list"));
  // Premise: the pick is a draft (the row's main button reads Save), not a write.
  premiseHolds(
    "the pick made the row dirty",
    within(wizardRow(i)).getByTestId(`dq-ignore-sid-${i}`).textContent === "Save",
  );
}
const prompt = () => screen.queryByTestId(PROMPT);

// ── published ──────────────────────────────────────────────────────────────────
const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "guard-fixture-show";

function snapshot(warnings: ParseWarning[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Guard Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: "DRIVE_GUARD",
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  } as ShowReviewSnapshot;
}

function renderPublished() {
  const data = buildPublishedSectionData(snapshot([ROOM_A]), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: new Set(step3Sections(data).map((s) => s.id)) as Set<SectionId>,
  });
  const props: PublishedReviewModalProps = {
    data,
    bySection,
    slug: SLUG,
    showId: SHOW_ID,
    title: "Guard Fixture Show",
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: "2026-07-16T11:48:00.000Z",
    lastCheckedAt: "2026-07-16T11:58:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-07-16T12:00:00.000Z"),
    attentionItems: [],
    alertsDegraded: false,
    openSheetHref: null,
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    crewEmails: [],
    pickerCrew: [],
    feed: { entries: [], truncated: false },
    undoAction: vi.fn(),
    acceptAction: vi.fn(),
    acceptAllAction: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    alertId: null,
  };
  render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <PublishedReviewModal {...props} />
    </ShareTokenProvider>,
  );
}
const ptid = (name: string) => `published-show-review-${name}`;
function dirtyPublishedCard() {
  fireEvent.click(screen.getByTestId("use-raw-toggle-on-showpage"));
  premiseHolds(
    "the published pick made the card dirty",
    screen.queryByRole("button", { name: "Save" }) !== null,
  );
}
const syncPosts = () => fetchCalls.filter((u) => u.startsWith("/api/admin/sync/"));
const rescanPosts = () => fetchCalls.filter((u) => u.includes("rescan-sheet"));

// ── G1-G5 on the wizard modal, G1-G3 on the published modal ─────────────────
describe("§6.5 guard points: each one stops while a reading is unsaved", () => {
  const wizardClose: Array<[string, () => void]> = [
    ["G1 close button", () => fireEvent.click(screen.getByTestId(wtid("close")))],
    ["G2 Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["G3 backdrop", () => fireEvent.click(screen.getByTestId(wtid("backdrop")))],
    ["G4 grab strip tap", () => fireEvent.click(screen.getByTestId(wtid("grab")))],
    [
      "G5 grab strip drag past the threshold",
      () => {
        const grab = screen.getByTestId(wtid("grab"));
        Object.assign(grab, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
        fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
        fireEvent.pointerMove(grab, { pointerId: 1, clientY: 300 });
        fireEvent.pointerUp(grab, { pointerId: 1, clientY: 300 });
      },
    ],
  ];

  for (const [name, press] of wizardClose) {
    it(`wizard ${name}: prompt, and onClose not called`, async () => {
      const { onClose } = renderWizard();
      dirtyWizardRow(0);
      press();
      expect(prompt()).toBeInTheDocument();
      await act(async () => new Promise((r) => setTimeout(r, 400))); // past every exit fallback
      expect(onClose).not.toHaveBeenCalled();
    });
    it(`wizard ${name}: with no draft, onClose runs and no prompt`, async () => {
      const { onClose } = renderWizard();
      press();
      await act(async () => new Promise((r) => setTimeout(r, 400)));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(prompt()).toBeNull();
    });
  }

  it("G6 Publish: prompt, and the publish request not sent; passthrough sends it", () => {
    const { onRequestSetChecked } = renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("publish")));
    expect(prompt()).toBeInTheDocument();
    expect(onRequestSetChecked).not.toHaveBeenCalled();
    cleanup();
    const clean = renderWizard();
    fireEvent.click(screen.getByTestId(wtid("publish")));
    expect(clean.onRequestSetChecked).toHaveBeenCalledWith(true);
    expect(prompt()).toBeNull();
  });

  it("G7 Approve & apply: prompt, and onApplyResolve not called; passthrough calls it", () => {
    const { onApplyResolve } = renderWizard({ resolution: true });
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-approve`));
    expect(prompt()).toBeInTheDocument();
    expect(onApplyResolve).not.toHaveBeenCalled();
    cleanup();
    const clean = renderWizard({ resolution: true });
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-approve`));
    expect(clean.onApplyResolve).toHaveBeenCalledTimes(1);
    expect(prompt()).toBeNull();
  });

  it("G8 Ignore this sheet: prompt, and onIgnore not called; passthrough calls it", () => {
    const { onIgnore } = renderWizard({ resolution: true });
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-ignore`));
    expect(prompt()).toBeInTheDocument();
    expect(onIgnore).not.toHaveBeenCalled();
    cleanup();
    const clean = renderWizard({ resolution: true });
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-ignore`));
    expect(clean.onIgnore).toHaveBeenCalledTimes(1);
    expect(prompt()).toBeNull();
  });

  it("G9 Re-scan: prompt, and no rescan POST; passthrough posts", () => {
    renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(`rescan-sheet-button-${DFID}`));
    expect(prompt()).toBeInTheDocument();
    expect(rescanPosts()).toHaveLength(0);
    cleanup();
    renderWizard();
    fireEvent.click(screen.getByTestId(`rescan-sheet-button-${DFID}`));
    expect(rescanPosts()).toHaveLength(1);
    expect(prompt()).toBeNull();
  });

  const publishedClose: Array<[string, () => void]> = [
    ["G1 close button", () => fireEvent.click(screen.getByTestId(ptid("close")))],
    ["G2 Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["G3 backdrop", () => fireEvent.click(screen.getByTestId(ptid("backdrop")))],
  ];
  for (const [name, press] of publishedClose) {
    it(`published ${name}: prompt, and the close navigation not started`, () => {
      renderPublished();
      dirtyPublishedCard();
      press();
      expect(prompt()).toBeInTheDocument();
      expect(routerPush).not.toHaveBeenCalled();
    });
    it(`published ${name}: with no draft, the close navigation starts`, () => {
      renderPublished();
      press();
      expect(routerPush).toHaveBeenCalledWith("/admin", { scroll: false });
      expect(prompt()).toBeNull();
    });
  }

  it("G10 Re-sync: prompt, and no sync POST; passthrough posts", () => {
    renderPublished();
    dirtyPublishedCard();
    fireEvent.click(screen.getByTestId("admin-resync-button"));
    expect(prompt()).toBeInTheDocument();
    expect(syncPosts()).toHaveLength(0);
    cleanup();
    renderPublished();
    fireEvent.click(screen.getByTestId("admin-resync-button"));
    expect(syncPosts()).toHaveLength(1);
    expect(prompt()).toBeNull();
  });

  it("G10 Apply reduced version: prompt, and no accept POST", async () => {
    renderPublished();
    fetchBody = {
      ok: true,
      result: { outcome: "shrink_held", detail: "2 crew removed", heldModifiedTime: "t-1" },
    };
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-resync-button"));
    });
    premiseHolds(
      "the shrink confirm is shown",
      screen.queryByTestId("admin-resync-accept") !== null,
    );
    dirtyPublishedCard();
    fireEvent.click(screen.getByTestId("admin-resync-accept"));
    expect(prompt()).toBeInTheDocument();
    expect(syncPosts()).toHaveLength(1); // only the first, unguarded Re-sync
  });
});

// ── The count, both buttons, N reaching 0 ─────────────────────────────────────
describe("§6.5 the prompt", () => {
  const title = () => screen.getByTestId(`${PROMPT}-title`).textContent;

  it("titles one and two unsaved changes; a Save in flight stays counted; only a saved reading leaves the count", async () => {
    renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(title()).toBe("You have 1 unsaved reading change");
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    dirtyWizardRow(1);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(title()).toBe("You have 2 unsaved reading changes");
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    // Save on row 1, held: the reading is in flight and could still fail and come back
    // as a draft, so it stays counted (§6.5 E1).
    fireEvent.click(within(wizardRow(1)).getByTestId("dq-ignore-sid-1"));
    expect(stagedUseRaw).toHaveLength(1);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(title()).toBe("You have 2 unsaved reading changes");
    // The held Save fails while the prompt is open: rule 3 restores the draft, still 2.
    await act(async () => {
      stagedUseRaw[0]!.resolve({ ok: false, code: "STALE" });
    });
    expect(title()).toBe("You have 2 unsaved reading changes");
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    // Save again and let the reading land: that row leaves the count.
    fireEvent.click(within(wizardRow(1)).getByTestId("dq-ignore-sid-1"));
    await act(async () => {
      stagedUseRaw[1]!.resolve({ ok: true });
    });
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(title()).toBe("You have 1 unsaved reading change");
  });

  it("Go back has initial focus, keeps the draft, runs nothing and returns focus to the trigger", () => {
    const { onClose } = renderWizard();
    dirtyWizardRow(0);
    const close = screen.getByTestId(wtid("close"));
    close.focus();
    fireEvent.click(close);
    const goBack = screen.getByTestId(`${PROMPT}-go-back`);
    expect(document.activeElement).toBe(goBack);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
      "You have 1 unsaved reading change",
    );
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "Your pick is not saved until you press Save.",
    );
    fireEvent.click(goBack);
    expect(prompt()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(close);
    expect(within(wizardRow(0)).getByTestId("dq-ignore-sid-0").textContent).toBe("Save");
  });

  // UI gate P2 (WCAG 2.4.3): a click that does not move focus (Safari never focuses a
  // clicked button) leaves focus where it was, here on the reading toggle. Go back must
  // still land on the trigger, not on whatever held focus when the prompt opened.
  it("Go back returns focus to Publish when the click did not move focus there", () => {
    renderWizard();
    dirtyWizardRow(0);
    const toggle = within(wizardRow(0)).getByTestId("use-raw-toggle-on-list");
    toggle.focus();
    premiseHolds("focus sits on the reading toggle", document.activeElement === toggle);
    const publish = screen.getByTestId(wtid("publish"));
    fireEvent.click(publish); // fireEvent moves no focus, as a Safari click
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    expect(prompt()).toBeNull();
    expect(document.activeElement).toBe(publish);
  });

  it("Go back from a backdrop tap returns focus to the close button (§6.5 G3)", () => {
    renderWizard();
    dirtyWizardRow(0);
    const toggle = within(wizardRow(0)).getByTestId("use-raw-toggle-on-list");
    toggle.focus();
    premiseHolds("focus sits on the reading toggle", document.activeElement === toggle);
    fireEvent.click(screen.getByTestId(wtid("backdrop")));
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    expect(prompt()).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(wtid("close")));
  });

  // UI gate P3: the body follows N like the title does.
  it("the body is singular for one unsaved change and plural for two", () => {
    renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "Your pick is not saved until you press Save.",
    );
    fireEvent.click(screen.getByTestId(`${PROMPT}-go-back`));
    dirtyWizardRow(1);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "Your picks are not saved until you press Save.",
    );
  });

  it("Escape is Go back: the review's own Escape never fires", () => {
    const { onClose } = renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("close")));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(prompt()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(within(wizardRow(0)).getByTestId("dq-ignore-sid-0").textContent).toBe("Save");
  });

  it("Discard and continue clears the draft, then runs the action exactly once", () => {
    const { onRequestSetChecked } = renderWizard();
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("publish")));
    fireEvent.click(screen.getByTestId(`${PROMPT}-discard`));
    expect(prompt()).toBeNull();
    expect(onRequestSetChecked).toHaveBeenCalledTimes(1);
    expect(within(wizardRow(0)).getByTestId("dq-ignore-sid-0").textContent).toBe("Accept");
  });

  it("N reaching 0 while open closes the prompt as Go back and runs nothing", () => {
    const { onClose, rerenderWith } = renderWizard({ warnings: [ROOM_A, ROOM_B] });
    dirtyWizardRow(0);
    fireEvent.click(screen.getByTestId(wtid("close")));
    expect(prompt()).toBeInTheDocument();
    rerenderWith([ROOM_B]); // the dirty row's warning is gone (a refresh landed)
    expect(prompt()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── beforeunload (G11) ────────────────────────────────────────────────────────
describe("§6.5 beforeunload", () => {
  const unloadPrevented = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("no listener at N = 0; prevents unload at N > 0; removed on clean and on unmount", () => {
    renderWizard();
    expect(unloadPrevented()).toBe(false);
    dirtyWizardRow(0);
    expect(unloadPrevented()).toBe(true);
    fireEvent.click(within(wizardRow(0)).getByRole("button", { name: "Cancel" }));
    expect(unloadPrevented()).toBe(false);
    dirtyWizardRow(0);
    expect(unloadPrevented()).toBe(true);
    cleanup();
    expect(unloadPrevented()).toBe(false);
  });
});

// ── E1: a guarded action protects drafts through its whole pending period ─────
// Whole-diff review R1 E1 (BLOCKING): the guard looked once, when the request
// started. A pick made while the request was pending, or a Save that failed during
// it and restored its draft, was then lost silently when the request completed.
describe("§6.5 a guarded action protects drafts through its pending period", () => {
  const mainButton = (i: number) =>
    within(wizardRow(i)).getByTestId(`dq-ignore-sid-${i}`).textContent;
  const wizardActions: Array<{
    name: string;
    resolution: boolean;
    press: () => void;
    spy: (r: ReturnType<typeof renderWizard>) => ReturnType<typeof vi.fn>;
  }> = [
    {
      name: "Publish",
      resolution: false,
      press: () => fireEvent.click(screen.getByTestId(wtid("publish"))),
      spy: (r) => r.onRequestSetChecked,
    },
    {
      name: "Approve & apply",
      resolution: true,
      press: () =>
        fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-approve`)),
      spy: (r) => r.onApplyResolve,
    },
    {
      name: "Ignore this sheet",
      resolution: true,
      press: () =>
        fireEvent.click(screen.getByTestId(`wizard-step3-card-${DFID}-review-resolution-ignore`)),
      spy: (r) => r.onIgnore,
    },
  ];

  for (const a of wizardActions) {
    it(`FAILED_SAVE ${a.name}: a Save in flight stops the action; Discard neutralizes its later failure`, async () => {
      const r = renderWizard({ resolution: a.resolution, hold: true });
      dirtyWizardRow(0);
      fireEvent.click(within(wizardRow(0)).getByTestId("dq-ignore-sid-0")); // Save, held
      expect(stagedUseRaw).toHaveLength(1);
      a.press();
      expect(prompt()).toBeInTheDocument();
      expect(a.spy(r)).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId(`${PROMPT}-discard`));
      expect(a.spy(r)).toHaveBeenCalledTimes(1);
      // The Save fails after the operator discarded: its draft must not come back.
      await act(async () => {
        stagedUseRaw[0]!.resolve({ ok: false, code: "STALE" });
      });
      expect(mainButton(0)).toBe("Accept");
      expect(screen.queryByText(/didn.t save/)).toBeNull();
      expect(r.onClose).not.toHaveBeenCalled(); // the action is still pending
    });

    it(`NEW_PICK ${a.name}: no reading can be picked while the request is pending`, async () => {
      const r = renderWizard({ resolution: a.resolution, hold: true });
      a.press();
      expect(a.spy(r)).toHaveBeenCalledTimes(1);
      const toggle = within(wizardRow(0)).getByTestId("use-raw-toggle-on-list");
      expect(toggle).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(toggle);
      expect(mainButton(0)).toBe("Accept"); // no draft
      await act(async () => {
        heldActions[0]!(true);
      });
      expect(r.onClose).toHaveBeenCalledTimes(1);
    });
  }

  it("RESCAN_AFTER_REFRESH: no pick lands while Re-scan is pending; the controls unlock after", async () => {
    const r = renderWizard();
    holdFetch = true;
    fireEvent.click(screen.getByTestId(`rescan-sheet-button-${DFID}`));
    expect(rescanPosts()).toHaveLength(1);
    const toggle = within(wizardRow(0)).getByTestId("use-raw-toggle-on-list");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);
    expect(mainButton(0)).toBe("Accept");
    await act(async () => {
      heldFetches[0]!();
    });
    expect(routerRefresh).toHaveBeenCalled();
    // The refresh lands with an edited warning (a new content hash): no draft existed
    // to lose, and the controls are live again.
    r.rerenderWith([room("Ballroom A / B / C", "hash-a2"), ROOM_B]);
    expect(within(wizardRow(0)).getByTestId("use-raw-toggle-on-list")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("SYNC_AFTER_REFRESH sync: no pick lands while Re-sync is pending", async () => {
    renderPublished();
    holdFetch = true;
    fireEvent.click(screen.getByTestId("admin-resync-button"));
    expect(syncPosts()).toHaveLength(1);
    const toggle = screen.getByTestId("use-raw-toggle-on-showpage");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await act(async () => {
      heldFetches[0]!();
    });
    expect(screen.getByTestId("use-raw-toggle-on-showpage")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("SYNC_AFTER_REFRESH accept: no pick lands while Apply reduced version is pending", async () => {
    renderPublished();
    fetchBody = {
      ok: true,
      result: { outcome: "shrink_held", detail: "2 crew removed", heldModifiedTime: "t-1" },
    };
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-resync-button"));
    });
    premiseHolds(
      "the shrink confirm is shown",
      screen.queryByTestId("admin-resync-accept") !== null,
    );
    holdFetch = true;
    fireEvent.click(screen.getByTestId("admin-resync-accept"));
    expect(syncPosts()).toHaveLength(2);
    const toggle = screen.getByTestId("use-raw-toggle-on-showpage");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await act(async () => {
      heldFetches[0]!();
    });
  });
});
