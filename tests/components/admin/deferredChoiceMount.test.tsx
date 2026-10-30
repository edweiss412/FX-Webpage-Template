// @vitest-environment jsdom
/**
 * The deferred reading choice, mounted on both production surfaces (warning-card-fixes
 * spec §6.3 "Mounts", §14 sequence 11, §16.1; plan Task 15).
 *
 * Wizard: the staged row wraps its controls in the reading provider when the row offers
 * the choice. Published: SectionWarningItemControls does the same and, for those rows
 * only, renders the choice control BEFORE the action bar. Failure modes: production rows
 * still saving on tap; the provider wrapping rows that offer no choice; the published
 * order left as action bar first; a bulk accept persisting an unsaved draft, or the
 * draft surviving into the Accepted list (L8); a Save on an already-accepted row running
 * an ignore backend; a published card calling the staged action.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

type Held = { args: unknown[]; resolve: (v: unknown) => void };
const stagedUseRaw: Held[] = [];
const showUseRaw: Held[] = [];
const stagedIgnore: Held[] = [];
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
  setUseRawDecisionAction: (...a: unknown[]) => holder(showUseRaw)(...a),
}));
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: (...a: unknown[]) => holder(stagedIgnore)(...a),
}));

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  isPublished,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import {
  buildSectionWarningModel,
  type SectionWarningItem,
  type SectionWarningModel,
} from "@/lib/admin/sectionWarningModel";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  buildParseResult,
  stagedRow,
  STEP3_FIXTURE_DFID as DFID,
  STEP3_FIXTURE_WSID as WSID,
} from "./wizard/_step3ReviewFixture";

type Post = { url: string; resolve: (r: Response) => void };
const posts: Post[] = [];
const announce = vi.fn();

beforeEach(() => {
  stagedUseRaw.length = 0;
  showUseRaw.length = 0;
  stagedIgnore.length = 0;
  posts.length = 0;
  announce.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          posts.push({ url: String(url), resolve });
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
const FIELD: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Parking | validated onsite",
};

// ── wizard ─────────────────────────────────────────────────────────────────────
function wizard(warnings: ParseWarning[]) {
  const pr = buildParseResult({ warnings });
  const d: StagedSectionData = {
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
  const def = step3Sections(d).find((s) => s.id === "warnings");
  if (!def) throw new Error("no warnings section");
  return render(<>{def.render(d)}</>);
}
const wizardRow = (i: number) => screen.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`);

describe("wizard mount", () => {
  it("a reading-choice row drafts the reading and its action bar reads Save", () => {
    wizard([ROOM_A, FIELD]);
    fireEvent.click(within(wizardRow(0)).getByTestId("use-raw-toggle-on-list"));
    expect(stagedUseRaw).toHaveLength(0);
    expect(within(wizardRow(0)).getByTestId("dq-ignore-sid-0").textContent).toBe("Save");
    expect(within(wizardRow(0)).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("a row without the choice is unchanged: no provider, today's controls", () => {
    wizard([ROOM_A, FIELD]);
    const row = wizardRow(1);
    expect(within(row).queryByTestId("use-raw-control-list")).toBeNull();
    expect(within(row).getByTestId("dq-ignore-sid-1").textContent).toBe("Ignore");
    expect(within(row).queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

// ── published ──────────────────────────────────────────────────────────────────
const SLUG = "polish-fixture-show";
function publishedData() {
  const data = buildPublishedSurfaceProps({}).data;
  if (!isPublished(data)) throw new Error("expected published SectionData");
  return data;
}
const item = (warning: ParseWarning, id: string): SectionWarningItem => ({
  warning,
  reportSurfaceId: id,
});
function handModel(
  active: SectionWarningItem[],
  ignored: SectionWarningItem[],
): SectionWarningModel {
  return {
    active,
    ignored,
    bulkGroups: [],
    activeGroups: active.map((it) => ({
      code: it.warning.code,
      label: null,
      bulk: null,
      items: [it],
    })),
    warningsByCrewKey: {},
  };
}
function renderPublished(model: SectionWarningModel) {
  const tree = (m: SectionWarningModel) => (
    <WarningAnnounceContext.Provider value={{ announce }}>
      {buildSectionWarningExtras({ bySection: { rooms: m } })("rooms", publishedData())}
    </WarningAnnounceContext.Provider>
  );
  const r = render(tree(model));
  return { ...r, rerenderWith: (m: SectionWarningModel) => r.rerender(tree(m)) };
}
const cardFor = (container: HTMLElement, snippet: string) => {
  const card = within(container)
    .getAllByTestId("per-show-actionable-item")
    .find((el) => (el.textContent ?? "").includes(snippet));
  if (!card) throw new Error(`no card for ${snippet}`);
  return card;
};
const precedes = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("published mount", () => {
  it("the choice control precedes the action bar on an active and an Accepted use-raw card", () => {
    renderPublished(handModel([item(ROOM_A, "rs-a"), item(FIELD, "rs-f")], [item(ROOM_B, "rs-b")]));
    const active = screen.getByTestId("section-warning-active-rooms");
    const accepted = screen.getByTestId("section-accepted-list-rooms");
    for (const card of [
      cardFor(active, ROOM_A.rawSnippet!),
      cardFor(accepted, ROOM_B.rawSnippet!),
    ]) {
      const choice = within(card).getByTestId("use-raw-control-showpage");
      const bar = within(card).getByTestId("dq-controls");
      expect(precedes(choice, bar)).toBe(true);
    }
    // Every other code renders no choice control at all.
    const field = cardFor(active, "Parking");
    expect(within(field).queryByTestId("use-raw-control-showpage")).toBeNull();
    expect(within(field).getByTestId("dq-controls")).toBeTruthy();
  });

  it("selecting a reading on a published card writes nothing and offers Save", () => {
    renderPublished(handModel([item(ROOM_A, "rs-a")], []));
    const card = cardFor(screen.getByTestId("section-warning-active-rooms"), ROOM_A.rawSnippet!);
    fireEvent.click(within(card).getByTestId("use-raw-toggle-on-showpage"));
    expect(showUseRaw).toHaveLength(0);
    expect(within(card).getByTestId("dq-ignore-rs-a").textContent).toBe("Save");
  });

  it("§14 seq 11: a published bulk accept during D drops the unsaved draft", async () => {
    const warnings = [ROOM_A, ROOM_B];
    const rendered = new Set<"rooms" | "warnings">(["rooms", "warnings"]);
    const before = buildSectionWarningModel({
      slug: SLUG,
      warnings,
      ignoredFingerprints: new Set(),
      renderedSectionIds: rendered,
    });
    const rooms = before.rooms;
    if (!rooms) throw new Error("no rooms model");
    premiseHolds(
      "the two cards form one bulk group of 2",
      rooms.activeGroups.length === 1 && rooms.activeGroups[0]?.bulk?.items.length === 2,
    );
    const r = renderPublished(rooms);
    const cardA = () =>
      cardFor(screen.getByTestId("section-warning-controls-rooms"), ROOM_A.rawSnippet!);
    fireEvent.click(within(cardA()).getByTestId("use-raw-toggle-on-showpage"));
    const idA = rooms.active.find((it) => it.warning === ROOM_A)?.reportSurfaceId ?? "";
    expect(within(cardA()).getByTestId(`dq-ignore-${idA}`).textContent).toBe("Save");

    fireEvent.click(screen.getByRole("button", { name: /^Accept 2\b/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Are you sure\? Accept 2\b/ }));
    expect(posts.map((p) => p.url)).toEqual([
      `/api/admin/show/${SLUG}/data-quality/ignore`,
      `/api/admin/show/${SLUG}/data-quality/ignore`,
    ]);
    await act(async () => {
      for (const p of posts) p.resolve(new Response("{}", { status: 200 }));
    });

    // The refresh lands: both records now in the ignored partition, so under Accepted.
    const fps = new Set(
      warnings.map((w) => warningFingerprint(w)).filter((f): f is string => f !== null),
    );
    const after = buildSectionWarningModel({
      slug: SLUG,
      warnings,
      ignoredFingerprints: fps,
      renderedSectionIds: rendered,
    }).rooms;
    if (!after) throw new Error("no rooms model after");
    r.rerenderWith(after);
    const moved = cardFor(screen.getByTestId("section-accepted-list-rooms"), ROOM_A.rawSnippet!);
    expect(
      within(moved).getByTestId("use-raw-toggle-off-showpage").getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(moved).getByTestId(`dq-unignore-${idA}`).textContent).toBe("Undo accept");
    expect(within(moved).queryByText("Not saved yet")).toBeNull();
    expect(showUseRaw).toHaveLength(0);
  });

  it("Save on an Accepted-list card saves the reading only", async () => {
    renderPublished(handModel([], [item(ROOM_B, "rs-b")]));
    const card = cardFor(screen.getByTestId("section-accepted-list-rooms"), ROOM_B.rawSnippet!);
    fireEvent.click(within(card).getByTestId("use-raw-toggle-on-showpage"));
    const main = within(card).getByTestId("dq-unignore-rs-b");
    expect(main.textContent).toBe("Save");
    fireEvent.click(main);
    expect(showUseRaw).toHaveLength(1);
    await act(async () => {
      showUseRaw[0]?.resolve({ ok: true });
    });
    expect(announce).toHaveBeenCalledWith("Reading saved.");
    expect(posts.filter((p) => p.url.includes("/data-quality/"))).toHaveLength(0);
    expect(stagedIgnore).toHaveLength(0);
    expect(stagedUseRaw).toHaveLength(0);
  });
});
