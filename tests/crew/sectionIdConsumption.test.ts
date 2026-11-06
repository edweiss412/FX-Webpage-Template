// @vitest-environment jsdom
/**
 * The crew section id source is read, not copied (crew page redesign PR B plan,
 * Task 3; plan "Shared body contract": single-source claims carry a
 * consumption proof).
 *
 * Each case changes the source and watches the reader follow. Equality with
 * today's values proves nothing, because a literal reintroduced at a reader
 * equals the source it replaced:
 *   - `canonicalSectionParam` mocked to map a probe value to `venue`: the
 *     redirect builder, the OAuth `next` validator and the controller's
 *     openable set all accept the probe and emit `venue`;
 *   - the page's own allow-list line, a server module no unit test can load,
 *     is pinned by its source: it calls `canonicalSectionParam` and spells no
 *     section id;
 *   - `CREW_SECTION_IDS` mocked to a reversed order: the search tie order, the
 *     search index and the membership list follow it;
 *   - the "always" table mocked: the loading skeleton's nav and list rows
 *     follow it.
 *
 * `resolveActiveSection` shares a module with `canonicalSectionParam`, so no
 * mock reaches its internal call; its alias cases are behavioral
 * (tests/crew/resolveActiveSection.test.ts).
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";
import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { CrewSections } from "@/components/crew/CrewSections";
import {
  CREW_SECTION_LABELS,
  CREW_TODAY_LABEL,
  type CrewSectionEntry,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import {
  CREW_SECTION_IDS,
  LEGACY_SECTION_ALIASES,
  type SectionId,
} from "@/lib/crew/resolveActiveSection";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import { makeShowForViewer } from "../fixtures/showForViewer";

/** A value no section id, alias or `today` can be. */
const PROBE = vi.hoisted(() => "probe-section-value");

vi.mock("@/lib/crew/resolveActiveSection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crew/resolveActiveSection")>();
  return {
    ...actual,
    canonicalSectionParam: (raw: string | null | undefined) =>
      raw === PROBE ? "venue" : actual.canonicalSectionParam(raw),
  };
});

const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

const PAGE = "app/show/[slug]/[shareToken]/page.tsx";
const SLUG = "rpas-central";
const TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
const SHOW = `/show/${SLUG}/${TOKEN}`;

describe("canonicalSectionParam is the one allow-list", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
  });

  it("consumption: buildShowReturnUrl accepts the probe and writes venue, keeping the gate", () => {
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: PROBE, gate: "skip" })).toBe(
      `${SHOW}?s=venue&gate=skip`,
    );
    expect(buildShowReturnUrl(SLUG, TOKEN, { s: PROBE })).toBe(`${SHOW}?s=venue`);
  });

  it("consumption: validateNextParam accepts the probe and re-attaches venue, keeping the gate", () => {
    expect(validateNextParamDetailed(`${SHOW}?s=${PROBE}&gate=skip`)).toEqual({
      ok: true,
      path: `${SHOW}?s=venue&gate=skip`,
    });
  });

  it("consumption: the page's redirect allow-list is canonicalSectionParam(s) and spells no section id", () => {
    const src = readFileSync(PAGE, "utf8");
    // Comments are not code: a commented-out call is not the live line, and a
    // comment naming a section is not an allow-list.
    const code = stripCommentsForFile(src, PAGE);
    premise("lines of code left after the comments go", code.split("\n").length, 100);
    expect(code).toMatch(/^\s*const allowlistedS = canonicalSectionParam\(s\);$/m);
    // A viewer kind is not a section id, though `crew` is spelled the same.
    const withoutViewerKinds = code.replace(/\bkind\s*:\s*"(?:crew|admin|admin_preview)"/g, "");
    const ids = ["today", ...CREW_SECTION_IDS, ...Object.keys(LEGACY_SECTION_ALIASES)];
    premise("section ids the page must not spell", ids.length, 1);
    for (const id of ids) {
      expect(withoutViewerKinds, id).not.toMatch(new RegExp(`["'\`]${id}["'\`]`));
    }
  });
});

describe("the controller's openable set reads canonicalSectionParam", () => {
  const PATH = nav.pathname;

  function body(id: string): ReactNode {
    return createElement("div", { "data-testid": `body-${id}` }, `body ${id}`);
  }

  function renderController(extra?: ReactNode) {
    const ids: CrewSectionId[] = [...CREW_SECTION_IDS];
    const sections: CrewSectionEntry[] = ids.map((id) => ({
      id,
      label: CREW_SECTION_LABELS[id],
      peek: null,
    }));
    const sectionNodes = Object.fromEntries(
      (["today", ...ids] as SectionId[]).map((id) => [id, body(id)]),
    ) as Partial<Record<SectionId, ReactNode>>;
    return render(
      createElement(CrewSections, { initialSection: "today", sections, sectionNodes }, extra),
    );
  }

  let pushSpy: ReturnType<typeof vi.spyOn>;
  let replaceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    History.prototype.replaceState.call(window.history, null, "", PATH);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    pushSpy = vi.spyOn(window.history, "pushState");
    replaceSpy = vi.spyOn(window.history, "replaceState");
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  function sheet(): HTMLElement | null {
    return screen.queryByRole("dialog");
  }

  it("consumption: popstate to an entry carrying the probe opens venue and keeps the entry's s", () => {
    renderController();
    replaceSpy.mockClear();
    History.prototype.replaceState.call(
      window.history,
      { crewSheet: true },
      "",
      `${PATH}?s=${PROBE}`,
    );
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { crewSheet: true } }));
    });
    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(replaceSpy, "a canonical value is not stripped").not.toHaveBeenCalled();
    expect(screen.getByTestId("crew-shell-sections")).toHaveAttribute(
      "data-active-section",
      "venue",
    );
  });

  it("consumption: a link carrying the probe opens venue in place and writes venue", () => {
    renderController(createElement("a", { href: `${PATH}?s=${PROBE}` }, "Probe link"));
    const notTaken = fireEvent.click(screen.getByRole("link", { name: "Probe link" }));
    expect(notTaken, "the controller took the click").toBe(false);
    expect(sheet()).toHaveAttribute("data-section", "venue");
    expect(pushSpy.mock.calls.at(-1)![2]).toBe(buildSectionHref(PATH, nav.searchParams, "venue"));
  });
});

describe("CREW_SECTION_IDS and the always table are read where they are used", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/crew/resolveActiveSection");
    vi.doUnmock("@/lib/crew/crewSections");
    vi.doUnmock("@/lib/search/sections");
    vi.resetModules();
  });

  /** Fresh module graph whose `CREW_SECTION_IDS` is the real list reversed. */
  async function withReversedIds() {
    vi.resetModules();
    vi.doMock("@/lib/crew/resolveActiveSection", async () => {
      const actual = await vi.importActual<typeof import("@/lib/crew/resolveActiveSection")>(
        "@/lib/crew/resolveActiveSection",
      );
      return { ...actual, CREW_SECTION_IDS: [...actual.CREW_SECTION_IDS].reverse() };
    });
    const mocked = await import("@/lib/crew/resolveActiveSection");
    const reversed = [...mocked.CREW_SECTION_IDS] as CrewSectionId[];
    premiseHolds(
      "the reversed order differs from the real one",
      reversed.join() !== CREW_SECTION_IDS.join() && reversed.length === CREW_SECTION_IDS.length,
    );
    return reversed;
  }

  function entry(section: SectionId, value: string): SearchEntry {
    return { id: `${section}:x`, section, group: "", label: null, value, context: [], copy: null };
  }

  it("consumption: the search tie order follows a reversed CREW_SECTION_IDS", async () => {
    const reversed = await withReversedIds();
    const { prepareIndex, searchIndex } = await import("@/lib/search/match");
    // One line per section, given in the real order, each matching the query the
    // same way: every section ties. Values differ, or Today's line would be
    // dropped as a repeat of another section's.
    const entries = (["today", ...CREW_SECTION_IDS] as SectionId[]).map((s, i) =>
      entry(s, `Dock ${i}`),
    );
    const result = searchIndex(prepareIndex({ entries }), "dock");
    expect(result.sections.map((s) => s.section)).toEqual(["today", ...reversed]);
  });

  it("consumption: the search index follows a reversed CREW_SECTION_IDS over the member list", async () => {
    const reversed = await withReversedIds();
    vi.doMock("@/lib/search/sections", () => ({
      SECTION_BUILDERS: Object.fromEntries(
        (["today", ...reversed] as SectionId[]).map((id) => [id, () => [entry(id, id)]]),
      ),
    }));
    const { buildSearchIndex } = await import("@/lib/search/buildSearchIndex");
    // The member list in the real order, one id left out: the index must take
    // the order from CREW_SECTION_IDS and the membership from the list.
    const left = CREW_SECTION_IDS[0];
    const members = CREW_SECTION_IDS.filter((id) => id !== left);
    const index = buildSearchIndex({
      data: makeShowForViewer(),
      viewer: { kind: "admin" },
      today: new Date("2026-05-14T16:00:00Z"),
      billingVisible: true,
      staticPreview: false,
      sections: members,
    });
    expect(index.entries.map((e) => e.section)).toEqual([
      "today",
      ...reversed.filter((id) => id !== left),
    ]);
  });

  it("consumption: the membership list follows a reversed CREW_SECTION_IDS", async () => {
    const reversed = await withReversedIds();
    const { crewSectionsFor } = await import("@/lib/crew/crewSections");
    // An agenda file and a pack-list phase today, so the admin is listed every section
    // (PR B Task 10: Agenda's content rule; PR C Task 6: Pack list's gate).
    const today = new Date("2026-05-14T15:00:00Z");
    const data: ShowForViewer = makeShowForViewer({
      show: {
        agenda_links: [{ label: "AGENDA", fileId: "agenda-file" }],
        schedule_phases: { "2026-05-14": ["Set"] },
      },
    });
    const ids = crewSectionsFor(data, {
      viewerFlags: [],
      isAdmin: true,
      dateRestriction: { kind: "none" },
      stageRestriction: { kind: "none" },
      today,
    }).map((s) => s.id);
    expect(ids).toEqual(reversed);
  });

  it("consumption: the loading skeleton's nav and list rows follow the always table", async () => {
    vi.resetModules();
    const probe: CrewSectionId[] = ["gear", "crew"];
    vi.doMock("@/lib/crew/crewSections", async () => {
      const actual =
        await vi.importActual<typeof import("@/lib/crew/crewSections")>("@/lib/crew/crewSections");
      premiseHolds(
        "the probe table differs from the real one",
        probe.join() !== actual.CREW_ALWAYS_SECTION_IDS.join(),
      );
      return { ...actual, CREW_ALWAYS_SECTION_IDS: probe };
    });
    const { CrewLoadingSkeleton } = await import("@/components/crew/CrewLoadingSkeleton");
    const react = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(react.createElement(CrewLoadingSkeleton));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const texts = (testId: string) =>
      [...doc.querySelectorAll(`[data-testid="${testId}"]`)].map((el) => el.textContent);

    expect(texts("crew-loading-nav-item")).toEqual([
      CREW_TODAY_LABEL,
      ...probe.map((id) => CREW_SECTION_LABELS[id]),
    ]);
    expect(texts("crew-loading-list-row")).toEqual(probe.map((id) => CREW_SECTION_LABELS[id]));
  });
});
