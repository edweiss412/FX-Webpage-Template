// @vitest-environment jsdom
/**
 * The archived pull sheet warning card (warning-card-fixes spec §7.3, §14.1; plan Task 13).
 *
 * One include button (`ArchivedTabIncludeButton`) shared by the card, Pack list and the
 * Resolve box, one label on every placement including the published offer, and a row lock
 * on the card: include and Ignore lock each other, Report never. Failure modes: an include
 * on an already-overridden tab, a second POST shape, the extraction splitting
 * ArchivedTabOffer's single pending flag, Ignore racing include (or the reverse), the button
 * holding its own flag again, a surface keeping an old label, the wrapper dropping the
 * row's focus hand-off, and Report locked during a write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// The refresh spy records where focus sat when it was called (§14.1 compound 2).
const refreshFocus: Array<string | null> = [];
const refresh = vi.fn(() => {
  refreshFocus.push(document.activeElement?.getAttribute("data-testid") ?? null);
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

type IgnoreArgs = { action: "ignore" | "unignore"; code: string; rawSnippet: string };
type Held<T> = { resolve: (v: T) => void; reject: (e: unknown) => void };
const ignoreCalls: IgnoreArgs[] = [];
const ignoreHeld: Array<Held<unknown>> = [];
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: (args: IgnoreArgs) =>
    new Promise((resolve, reject) => {
      ignoreCalls.push(args);
      ignoreHeld.push({ resolve, reject });
    }),
}));

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
import {
  ARCHIVED_TAB_ERROR,
  ARCHIVED_TAB_INCLUDE_LABEL,
  ARCHIVED_TAB_INCLUDE_PENDING,
  ArchivedTabIncludeButton,
  ArchivedTabOffer,
  deriveArchivedOffers,
} from "@/components/admin/wizard/archivedTabOffer";
import { PublishedArchivedTabOffer } from "@/components/admin/review/PublishedArchivedTabOffer";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import {
  WarningsBreakdown,
  step3Sections,
  type Step3SectionDef,
} from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  buildParseResult,
  stagedRow,
  STEP3_FIXTURE_DFID as DFID,
  STEP3_FIXTURE_WSID as WSID,
} from "./_step3ReviewFixture";

// ── fetch spy: every POST is held in a controlled promise and recorded ──────────
type Post = { url: string; body: unknown } & Held<Response>;
const posts: Post[] = [];
const fetchSpy = vi.fn(
  (url: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const raw = init?.body;
      posts.push({
        url: String(url),
        body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : undefined,
        resolve,
        reject,
      });
    }),
);
const STAGED_ROUTE = "/api/admin/onboarding/pull-sheet-override";
const PUBLISHED_ROUTE = "/api/admin/show/pull-sheet-override";
const okResponse = () =>
  new Response(JSON.stringify({ ok: true, status: "override_set" }), { status: 200 });

beforeEach(() => {
  posts.length = 0;
  ignoreCalls.length = 0;
  ignoreHeld.length = 0;
  refreshFocus.length = 0;
  refresh.mockClear();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TAB: ArchivedPullSheetTab = {
  tabName: "OLD GEAR",
  headerPreviews: ["AUDIO 1", "VIDEO RACK", "", "LX 4"],
  fingerprint: "fp-old-gear",
  included: false,
  contentChangedSinceAccept: false,
};

function archivedWarning(overrides: Partial<ParseWarning> = {}): ParseWarning {
  return {
    severity: "warn",
    code: "PULL_SHEET_ON_ARCHIVED_TAB",
    message: 'Pull sheet found on archived tab "OLD GEAR"; left out of the parse.',
    blockRef: { kind: "pull_sheet_archived_tab", name: "OLD GEAR" },
    rawSnippet: TAB.headerPreviews.join(" | "),
    ...overrides,
  };
}

function cardData(
  opts: {
    warning?: ParseWarning;
    tabs?: ArchivedPullSheetTab[];
    override?: OverrideSnapshot;
    ignored?: boolean;
  } = {},
): StagedSectionData {
  const warnings = [opts.warning ?? archivedWarning()];
  const pr = buildParseResult({ warnings });
  const item = { index: 0, reportSurfaceId: "sid-0" };
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
      archivedPullSheetTabs: opts.tabs ?? [TAB],
      pullSheetOverride: opts.override ?? null,
      ros: {},
      warnings,
      agendaBaseline: [],
      useRawDecisions: [],
    }),
    dq: {
      target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
      model: opts.ignored ? { active: [], ignored: [item] } : { active: [item], ignored: [] },
    },
  };
}

function warningsDef(d: StagedSectionData): Step3SectionDef {
  const def = step3Sections(d).find((s) => s.id === "warnings");
  if (!def) throw new Error("registry has no warnings section");
  return def;
}
const renderCard = (d: StagedSectionData) => render(<>{warningsDef(d).render(d)}</>);

const ROW = `wizard-step3-card-${DFID}-warning-0`;
const tid = (suffix: string) => `${ROW}-${suffix}`;
const INCLUDE_NAME = "Use this pull sheet from tab OLD GEAR";
const row = () => screen.getByTestId(ROW);
const ignoreButton = () => screen.getByTestId("dq-ignore-sid-0");

premiseHolds(
  "the fixture tab is offered with no override",
  deriveArchivedOffers([TAB], true, null).offers.some((t) => t.tabName === TAB.tabName),
);

describe("1. card lines (B-CASES, B-PRESENCE, B-CHARS)", () => {
  it("Tab and Cases come from the matched tab, cut at three with a count of the rest", () => {
    renderCard(cardData());
    expect(screen.getByTestId(tid("archived-tab")).textContent).toBe("Tab OLD GEAR");
    expect(screen.getByTestId(tid("archived-cases")).textContent).toBe(
      "Cases ‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’ and 1 more",
    );
  });

  it("a three-preview tab shows all three with no count", () => {
    const tab = { ...TAB, headerPreviews: ["AUDIO 1", "VIDEO RACK", ""] };
    renderCard(cardData({ tabs: [tab] }));
    expect(screen.getByTestId(tid("archived-cases")).textContent).toBe(
      "Cases ‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’",
    );
  });

  it("no previews and an empty rawSnippet: no Cases line", () => {
    const tab = { ...TAB, headerPreviews: [] };
    renderCard(cardData({ tabs: [tab], warning: archivedWarning({ rawSnippet: "" }) }));
    expect(screen.getByTestId(tid("archived-tab"))).toBeTruthy();
    expect(screen.queryByTestId(tid("archived-cases"))).toBeNull();
  });

  it("a preview longer than forty characters is cut with an ellipsis", () => {
    const tab = { ...TAB, headerPreviews: ["a".repeat(40) + "b"] };
    renderCard(cardData({ tabs: [tab] }));
    expect(screen.getByTestId(tid("archived-cases")).textContent).toBe(
      "Cases ‘" + "a".repeat(40) + "…’",
    );
  });

  it("with no matching tab, previews come from rawSnippet (L7)", () => {
    renderCard(
      cardData({ tabs: [], warning: archivedWarning({ rawSnippet: "AUDIO 1 | VIDEO RACK" }) }),
    );
    expect(screen.getByTestId(tid("archived-cases")).textContent).toBe(
      "Cases ‘AUDIO 1’, ‘VIDEO RACK’",
    );
  });
});

describe("2. include presence", () => {
  const reportAndIgnoreRender = () => {
    const controls = within(row()).getByTestId("dq-controls");
    expect(within(controls).getByTestId("report-button-trigger")).toBeTruthy();
    expect(within(controls).getByTestId("dq-ignore-sid-0")).toBeTruthy();
  };

  it("present when the tab is offered (threaded through the registry's staged spread)", () => {
    renderCard(cardData());
    expect(screen.getByTestId(tid("archived-include"))).toBeTruthy();
    reportAndIgnoreRender();
  });

  it("absent when an override is already active", () => {
    renderCard(cardData({ override: { tabName: "OTHER", fingerprint: "x" } }));
    expect(screen.queryByTestId(tid("archived-include"))).toBeNull();
    reportAndIgnoreRender();
  });

  it("absent without a wizard session", () => {
    const d = cardData();
    render(
      <WarningsBreakdown
        dfid={DFID}
        warnings={d.warnings}
        mode="rescan"
        archivedPullSheetTabs={[TAB]}
        pullSheetOverride={null}
        {...(d.dq ? { dq: d.dq } : {})}
      />,
    );
    expect(screen.queryByTestId(tid("archived-include"))).toBeNull();
    reportAndIgnoreRender();
  });

  it.each([
    ["no blockRef name", { blockRef: { kind: "pull_sheet_archived_tab" } }],
    ["a blank blockRef name", { blockRef: { kind: "pull_sheet_archived_tab", name: "  " } }],
  ] as const)("%s: no Tab line and no include", (_label, overrides) => {
    renderCard(cardData({ warning: archivedWarning(overrides) }));
    expect(screen.queryByTestId(tid("archived-tab"))).toBeNull();
    expect(screen.queryByTestId(tid("archived-include"))).toBeNull();
    reportAndIgnoreRender();
  });
});

describe("3. one label on every placement (R13)", () => {
  it("pins the two constants to spec §11", () => {
    expect(ARCHIVED_TAB_INCLUDE_LABEL).toBe("Use this pull sheet");
    expect(ARCHIVED_TAB_INCLUDE_PENDING).toBe("Including…");
  });

  async function pressAndHold(name: string) {
    const btn = screen.getByRole("button", { name });
    expect(btn.textContent).toContain(ARCHIVED_TAB_INCLUDE_LABEL);
    fireEvent.click(btn);
    expect(
      await screen.findByRole("button", { name: ARCHIVED_TAB_INCLUDE_PENDING }),
    ).toBeDisabled();
  }

  it("the card", async () => {
    renderCard(cardData());
    await pressAndHold(INCLUDE_NAME);
    expect(posts.map((p) => p.url)).toEqual([STAGED_ROUTE]);
  });

  it("Pack list (ArchivedTabOffer)", async () => {
    render(
      <ArchivedTabOffer dfid={DFID} wizardSessionId={WSID} tab={TAB} onDismissFocus={() => {}} />,
    );
    await pressAndHold(INCLUDE_NAME);
    expect(posts.map((p) => p.url)).toEqual([STAGED_ROUTE]);
  });

  it("the Resolve box (ArchivedTabOffer showDismiss={false})", async () => {
    render(<ArchivedTabOffer dfid={DFID} wizardSessionId={WSID} tab={TAB} showDismiss={false} />);
    await pressAndHold(INCLUDE_NAME);
    expect(posts.map((p) => p.url)).toEqual([STAGED_ROUTE]);
  });

  it("the published Pack list (PublishedArchivedTabOffer)", async () => {
    render(
      <PublishedArchivedTabOffer
        slug="s1"
        driveFileId={DFID}
        wire={null}
        canMutate
        tabName={TAB.tabName}
      />,
    );
    await pressAndHold(INCLUDE_NAME);
    expect(posts.map((p) => p.url)).toEqual([PUBLISHED_ROUTE]);
  });

  it("a blank tab name drops the suffix on the shared button and the published offer", () => {
    render(
      <ArchivedTabIncludeButton
        dfid={DFID}
        wizardSessionId={WSID}
        tab={{ ...TAB, tabName: "  " }}
        plate="surface"
        pending={false}
        onPendingChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: ARCHIVED_TAB_INCLUDE_LABEL })).toBeTruthy();
    cleanup();
    render(
      <PublishedArchivedTabOffer slug="s1" driveFileId={DFID} wire={null} canMutate tabName="" />,
    );
    expect(screen.getByRole("button", { name: ARCHIVED_TAB_INCLUDE_LABEL })).toBeTruthy();
  });
});

describe("4. POST body", () => {
  it("the card's include body deep-equals ArchivedTabOffer's for the same tab", () => {
    renderCard(cardData());
    fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
    cleanup();
    render(
      <ArchivedTabOffer dfid={DFID} wizardSessionId={WSID} tab={TAB} onDismissFocus={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
    expect(posts).toHaveLength(2);
    expect(posts[0]?.url).toBe(STAGED_ROUTE);
    expect(posts[1]?.url).toBe(STAGED_ROUTE);
    expect(posts[0]?.body).toEqual(posts[1]?.body);
    expect(posts[0]?.body).toEqual({
      driveFileId: DFID,
      wizardSessionId: WSID,
      tabName: TAB.tabName,
      expectedFingerprint: TAB.fingerprint,
      expectedOverrideSnapshot: null,
    });
  });
});

describe("5. ArchivedTabOffer keeps ONE pending flag (round-2 regression guard)", () => {
  it("Keep skipped is disabled for the whole include, and both re-enable on failure", async () => {
    render(
      <ArchivedTabOffer dfid={DFID} wizardSessionId={WSID} tab={TAB} onDismissFocus={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
    const keep = screen.getByRole("button", { name: "Keep skipped" });
    expect(keep).toBeDisabled();
    fireEvent.click(keep);
    expect(screen.getByRole("button", { name: "Keep skipped" })).toBeTruthy();
    await act(async () => {
      posts[0]?.reject(new Error("network"));
    });
    expect(screen.getByRole("button", { name: INCLUDE_NAME })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep skipped" })).toBeEnabled();
    expect(screen.getByText(ARCHIVED_TAB_ERROR)).toBeTruthy();
  });
});

describe("6. the card's row lock", () => {
  it("§14.1 row lock: include and Ignore lock each other", async () => {
    renderCard(cardData());
    // I: both enabled before any press.
    expect(screen.getByRole("button", { name: INCLUDE_NAME })).toBeEnabled();
    expect(ignoreButton()).toBeEnabled();

    // N: include held -> Ignore disabled, Report enabled, an Ignore click sends nothing.
    fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
    expect(screen.getByRole("button", { name: ARCHIVED_TAB_INCLUDE_PENDING })).toBeDisabled();
    expect(ignoreButton()).toBeDisabled();
    expect(within(row()).getByTestId("report-button-trigger")).toBeEnabled();
    fireEvent.click(ignoreButton());
    expect(ignoreCalls).toHaveLength(0);
    expect(posts).toHaveLength(1);

    // N -> I on success (the flag clears in finally; the refresh has not landed).
    await act(async () => {
      posts[0]?.resolve(okResponse());
    });
    expect(screen.getByRole("button", { name: INCLUDE_NAME })).toBeEnabled();
    expect(ignoreButton()).toBeEnabled();

    // G: Ignore held -> include disabled with its idle label; an include click sends nothing.
    fireEvent.click(ignoreButton());
    expect(ignoreCalls).toHaveLength(1);
    const include = screen.getByRole("button", { name: INCLUDE_NAME });
    expect(include).toBeDisabled();
    expect(include.textContent).toContain(ARCHIVED_TAB_INCLUDE_LABEL);
    expect(within(row()).getByTestId("report-button-trigger")).toBeEnabled();
    fireEvent.click(include);
    expect(posts).toHaveLength(1);

    // G -> I on failure.
    await act(async () => {
      ignoreHeld[0]?.resolve({ ok: false, code: "X" });
    });
    expect(screen.getByRole("button", { name: INCLUDE_NAME })).toBeEnabled();
    expect(ignoreButton()).toBeEnabled();
  });
});

describe("7. ArchivedTabIncludeButton holds no pending flag of its own", () => {
  const base = { dfid: DFID, wizardSessionId: WSID, tab: TAB, plate: "surface" as const };

  it("pending: disabled, Including…, a click is a no-op", () => {
    render(<ArchivedTabIncludeButton {...base} pending onPendingChange={() => {}} />);
    const btn = screen.getByRole("button", { name: ARCHIVED_TAB_INCLUDE_PENDING });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(posts).toHaveLength(0);
  });

  it("blocked and not pending: disabled with the idle label, a click is a no-op", () => {
    render(
      <ArchivedTabIncludeButton {...base} pending={false} blocked onPendingChange={() => {}} />,
    );
    const btn = screen.getByRole("button", { name: INCLUDE_NAME });
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain(ARCHIVED_TAB_INCLUDE_LABEL);
    fireEvent.click(btn);
    expect(posts).toHaveLength(0);
  });

  it.each([
    ["success", () => posts[0]?.resolve(okResponse())],
    ["failure", () => posts[0]?.reject(new Error("network"))],
  ] as const)(
    "onPendingChange true then false on %s; the prop alone decides disabled",
    async (_l, settle) => {
      const onPendingChange = vi.fn();
      const { rerender } = render(
        <ArchivedTabIncludeButton {...base} pending={false} onPendingChange={onPendingChange} />,
      );
      fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
      expect(onPendingChange.mock.calls).toEqual([[true]]);
      rerender(<ArchivedTabIncludeButton {...base} pending onPendingChange={onPendingChange} />);
      expect(screen.getByRole("button", { name: ARCHIVED_TAB_INCLUDE_PENDING })).toBeDisabled();
      // Mid-request, the parent clears the flag: the button re-enables (it holds none).
      rerender(
        <ArchivedTabIncludeButton {...base} pending={false} onPendingChange={onPendingChange} />,
      );
      expect(screen.getByRole("button", { name: INCLUDE_NAME })).toBeEnabled();
      await act(async () => {
        settle();
      });
      expect(onPendingChange.mock.calls).toEqual([[true], [false]]);
    },
  );
});

describe("8. DataQualityWarningControls lock props", () => {
  const w = archivedWarning();
  const props = {
    target: { kind: "staged" as const, wizardSessionId: WSID, driveFileId: DFID },
    warning: w,
    driveFileId: DFID,
    mode: "active" as const,
    reportSurfaceId: "sid-dq",
  };

  it("blocked disables the main button only; Report stays enabled", () => {
    render(<DataQualityWarningControls {...props} blocked />);
    expect(screen.getByTestId("dq-ignore-sid-dq")).toBeDisabled();
    expect(screen.getByTestId("report-button-trigger")).toBeEnabled();
    fireEvent.click(screen.getByTestId("dq-ignore-sid-dq"));
    expect(ignoreCalls).toHaveLength(0);
  });

  it.each([
    ["success", { ok: true, state: "ignored" }],
    ["failure", { ok: false, code: "X" }],
  ] as const)("onRunningChange is true at start and false at the end on %s", async (_l, result) => {
    const onRunningChange = vi.fn();
    render(<DataQualityWarningControls {...props} onRunningChange={onRunningChange} />);
    fireEvent.click(screen.getByTestId("dq-ignore-sid-dq"));
    expect(onRunningChange.mock.calls).toEqual([[true]]);
    await act(async () => {
      ignoreHeld[0]?.resolve(result);
    });
    expect(onRunningChange.mock.calls).toEqual([[true], [false]]);
  });

  it("absent lock props change nothing: the button is enabled and runs", () => {
    render(<DataQualityWarningControls {...props} />);
    expect(screen.getByTestId("dq-ignore-sid-dq")).toBeEnabled();
    fireEvent.click(screen.getByTestId("dq-ignore-sid-dq"));
    expect(ignoreCalls).toHaveLength(1);
  });
});

describe("9. §14.1 compound 2", () => {
  it("§14.1 c2: an archived Ignore success hands focus to the panel before the refresh", async () => {
    const { rerender } = renderCard(cardData());
    fireEvent.click(ignoreButton());
    await act(async () => {
      ignoreHeld[0]?.resolve({ ok: true, state: "ignored" });
    });
    const anchor = `wizard-step3-card-${DFID}-warnings-focus-anchor`;
    expect(refreshFocus).toEqual([anchor]);
    const ignored = cardData({ ignored: true });
    rerender(<>{warningsDef(ignored).render(ignored)}</>);
    expect(screen.queryByTestId(ROW)).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe(anchor);
  });
});

describe("10. §14.1 compound 4", () => {
  it("§14.1 c4: Report stays usable during N and G and unmounts with the row", async () => {
    const errors = vi.spyOn(console, "error");

    // N: include held, Report opens.
    const first = renderCard(cardData());
    fireEvent.click(screen.getByRole("button", { name: INCLUDE_NAME }));
    fireEvent.click(within(row()).getByTestId("report-button-trigger"));
    expect(screen.getByTestId("report-modal-textarea")).toBeTruthy();
    await act(async () => {
      posts[0]?.resolve(okResponse());
    });
    // The refresh lands without the warning (the include succeeded, so it is gone).
    const base = cardData();
    const gone: StagedSectionData = {
      ...base,
      warnings: [],
      dq: {
        target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
        model: { active: [], ignored: [] },
      },
    };
    first.rerender(<>{warningsDef(gone).render(gone)}</>);
    expect(screen.queryByTestId(ROW)).toBeNull();
    expect(screen.queryByTestId("report-modal-textarea")).toBeNull();
    first.unmount();

    // G: Ignore held, Report opens.
    const second = renderCard(cardData());
    fireEvent.click(ignoreButton());
    fireEvent.click(within(row()).getByTestId("report-button-trigger"));
    expect(screen.getByTestId("report-modal-textarea")).toBeTruthy();
    await act(async () => {
      ignoreHeld[0]?.resolve({ ok: true, state: "ignored" });
    });
    const ignored = cardData({ ignored: true });
    second.rerender(<>{warningsDef(ignored).render(ignored)}</>);
    expect(screen.queryByTestId(ROW)).toBeNull();
    expect(screen.queryByTestId("report-modal-textarea")).toBeNull();

    expect(errors).not.toHaveBeenCalled();
  });
});
