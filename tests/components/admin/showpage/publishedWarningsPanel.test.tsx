// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedWarningsPanel.test.tsx
 * (plan Task 3 Steps 0b, 1, 2, 2b; spec §3.3, §3.4, §12 tests 2, 4, 5, 9)
 *
 * The trim itself: on the published surface the Parse warnings panel body lists
 * INFO-severity rows only, its rail count follows the rows it renders, and its
 * body-empty state distinguishes four situations that an operator would read
 * very differently.
 *
 * THREE EXTRACTION MODES, always all three (spec §12 preamble). Identity
 * equality answers "are the right rows here"; a row-ELEMENT count answers "are
 * there any extra rows"; a textContent scan for warn titles, codes, and
 * messages answers "did anything warn-shaped leak in unmarked". Any one alone is
 * blind to a leak that avoids its signature.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/warning-surface-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ParseWarning } from "@/lib/parser/types";
import {
  ALL_WARNINGS,
  FIXTURE_DRIVE_FILE_ID,
  FIXTURE_SLUG,
  IGNORED_WARNINGS,
  INFO_WARNINGS,
  MAPPED_WARNINGS,
  UNMAPPED_WARNINGS,
  WARN_WARNINGS,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";

afterEach(cleanup);

const PANEL_TESTID = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-breakdown-warnings`;
const EMPTY_TESTID = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-empty`;
const ELSEWHERE_TESTID = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-elsewhere`;
const CLEAN_TESTID = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-clean`;

/** Spec §3.4 authored copy, FROZEN here so a wrong edit to the component fails
 *  rather than being mirrored by an assertion that reads the component.
 *  2026-07-22-warning-panel-polish §3.5: the elsewhere line now NAMES the
 *  sections holding the routed cards (this fixture routes to crew + rooms);
 *  full-string punctuation is pinned in pointerSentence.test.tsx. */
const ELSEWHERE_COPY =
  "Nothing else to note here. The warnings that need a look are in Crew and Rooms & scope.";
const CLEAN_COPY = "Nothing needs a look on this sheet.";

/** Silent-producing warnings, hoisted for the no-drop case below. */
const SILENT_ONLY: readonly ParseWarning[] = [...UNMAPPED_WARNINGS];

function buildData(warnings: readonly ParseWarning[]): PublishedSectionData {
  return buildPublishedSectionData(fixtureSnapshot(warnings) as never, { slug: FIXTURE_SLUG });
}

function fingerprintsOf(warnings: readonly ParseWarning[]): Set<string> {
  const fps = warnings.map((w) => warningFingerprint(w)).filter((fp): fp is string => fp !== null);
  expect(fps.length).toBe(warnings.length);
  return new Set(fps);
}

/** Mounts the published surface. `gate` false omits BOTH gate inputs, which is
 *  the staged/ungated configuration. */
function Harness({
  warnings,
  ignored = IGNORED_WARNINGS,
  gate = true,
}: {
  warnings: readonly ParseWarning[];
  ignored?: readonly ParseWarning[];
  gate?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const data = buildData(warnings);
  const bySection = buildSectionWarningModel({
    slug: FIXTURE_SLUG,
    warnings,
    ignoredFingerprints: ignored.length > 0 ? fingerprintsOf(ignored) : new Set<string>(),
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  const extras = buildSectionWarningExtras({ bySection });
  return (
    <div ref={scrollerRef}>
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        {...(gate
          ? { renderSectionExtras: extras, routedWarnings: deriveRoutedWarnings(bySection) }
          : {})}
      />
    </div>
  );
}

/** The panel body: the breakdown container MINUS the extras subtree, which is a
 *  sibling and independently renders warning titles. */
function panelBody(): HTMLElement {
  return screen.getByTestId(PANEL_TESTID);
}

function bodyRowCount(): number {
  return within(panelBody()).queryAllByTestId(/warning-\d+$/).length;
}

function titleOf(w: ParseWarning): string {
  return isMessageCode(w.code) ? (messageFor(w.code as MessageCode).title ?? w.code) : w.code;
}

describe("published panel body lists exactly the info rows", () => {
  it("renders the info identities, no more rows than that, and no warn-shaped text", () => {
    render(<Harness warnings={ALL_WARNINGS} />);
    const body = panelBody();

    // Mode 1: identity. Every info title present.
    for (const w of INFO_WARNINGS) {
      expect(within(body).queryAllByText(new RegExp(titleOf(w), "i")).length).toBeGreaterThan(0);
    }
    // Mode 2: row-element count equals the info count, derived from the fixture.
    expect(bodyRowCount()).toBe(INFO_WARNINGS.length);
    // Mode 3: no warn row's title, code, or message appears anywhere in the body.
    const text = body.textContent ?? "";
    for (const w of WARN_WARNINGS) {
      expect(text).not.toContain(titleOf(w));
      expect(text).not.toContain(w.code);
      if (w.message) expect(text).not.toContain(w.message);
    }
  });

  it("leaves the ungated (wizard) body listing every row", () => {
    render(<Harness warnings={ALL_WARNINGS} gate={false} />);
    expect(bodyRowCount()).toBe(ALL_WARNINGS.length);
  });

  it("keeps every warn identity reachable in the extras after the trim (no loss, no duplicate)", () => {
    render(<Harness warnings={ALL_WARNINGS} />);
    const body = panelBody();
    // Step 2b: the assertion that is FALSE before this task and TRUE after.
    // Each warn row appears in the extras and NOT in the body, so the union is
    // exact and nothing is rendered twice.
    for (const w of WARN_WARNINGS) {
      expect(body.textContent ?? "").not.toContain(titleOf(w));
      expect(screen.queryAllByText(new RegExp(titleOf(w), "i")).length).toBeGreaterThan(0);
    }
  });
});

describe("rail count follows the rows the body renders", () => {
  function railCountFor(warnings: readonly ParseWarning[], gate: boolean): number {
    const data = buildData(warnings);
    const def = step3Sections(data).find((s) => s.id === "warnings");
    expect(def?.railCount).toBeTruthy();
    return def!.railCount!(data, { routedWarningsRenderElsewhere: gate });
  }

  it("published counts the info rows; staged counts every row", () => {
    // Oracles derived from the FIXTURE definition, never by calling
    // visibleWarningRows, or the production predicate becomes its own oracle.
    expect(railCountFor(ALL_WARNINGS, true)).toBe(INFO_WARNINGS.length);
    expect(railCountFor(ALL_WARNINGS, false)).toBe(ALL_WARNINGS.length);
    // The two oracles must differ, or the assertion cannot distinguish them.
    expect(INFO_WARNINGS.length).not.toBe(ALL_WARNINGS.length);
  });

  it("equals the rendered row count in both modes", () => {
    render(<Harness warnings={ALL_WARNINGS} />);
    expect(bodyRowCount()).toBe(railCountFor(ALL_WARNINGS, true));
    cleanup();
    render(<Harness warnings={ALL_WARNINGS} gate={false} />);
    expect(bodyRowCount()).toBe(railCountFor(ALL_WARNINGS, false));
  });
});

describe("the four body-empty states", () => {
  // Spec §3.4 fixture table. `here` and `elsewhere` are the ACTIVE counts.
  const LIST = [...INFO_WARNINGS, ...MAPPED_WARNINGS, ...UNMAPPED_WARNINGS];
  const SILENT = [...UNMAPPED_WARNINGS];
  const ELSEWHERE = [...MAPPED_WARNINGS];
  const SILENT_PRECEDENCE = [...UNMAPPED_WARNINGS, ...MAPPED_WARNINGS];

  /**
   * Whole-diff review B5: rejecting the OTHER state's node is not exclusivity.
   * Elsewhere and Clean each allowed arbitrary extra copy to sit beside them,
   * and every state allowed the legacy "No parse warnings for this sheet." line
   * to coexist. This asserts the body's paragraph set, so a survivor from any
   * previous version of this branch fails wherever it appears.
   */
  function expectNoStrayBodyCopy(allowed: string[]) {
    // EVERY leaf element, not just `<p>` (round 2): a stray legacy line rendered
    // in a `<div>` or `<span>` left a paragraph-only inventory unchanged and
    // passed with incorrect copy visible.
    const body = panelBody();
    const heading = body.querySelector("h3, h4");
    const headingRow = heading?.parentElement ?? null;

    // TEXT NODES, not leaf elements (round 3): a direct text node inside an
    // element that also has element children belongs to no leaf, so
    // `<div>Legacy guidance<span aria-hidden /></div>` escaped a leaf-element
    // enumeration entirely while displaying stray copy.
    const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const paragraphs: string[] = [];
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      const text = (n.textContent ?? "").trim();
      if (text.length === 0) continue;
      const parent = n.parentElement;
      if (parent === null) continue;
      // The heading ROW (icon, title, count, pill, "In sheet" link) is chrome,
      // not body copy, and has its own tests. Located from the heading element
      // rather than by a testid, because the row carries none.
      if (headingRow !== null && headingRow.contains(parent)) continue;
      // Each listed row renders its own guidance inside its `<li>`; that is the
      // row's content, not stray panel copy, and including it would make the
      // List case unassertable.
      if (parent.closest("li[data-warning-index]") !== null) continue;
      // warning-panel-polish §3.5: the elsewhere sentence is a MIXED paragraph
      // (text nodes interleaved with bolded section buttons), so its internal
      // text nodes are fragments. Its FULL textContent is pinned by the exact
      // ELSEWHERE_COPY equality in expectOnly("elsewhere"); skipping the
      // fragments here keeps this stray-copy scan honest without double-pinning.
      if (parent.closest(`[data-testid="${ELSEWHERE_TESTID}"]`) !== null) continue;
      paragraphs.push(text);
    }

    for (const text of paragraphs) {
      expect(allowed, `unexpected body paragraph: ${JSON.stringify(text)}`).toContain(text);
    }
    // The legacy line belongs to the UNGATED branch only, in every state.
    expect(within(panelBody()).queryByTestId(EMPTY_TESTID)).toBeNull();
  }

  function expectOnly(which: "list" | "silent" | "elsewhere" | "clean") {
    const body = panelBody();
    const elsewhere = within(body).queryByTestId(ELSEWHERE_TESTID);
    const clean = within(body).queryByTestId(CLEAN_TESTID);
    if (which === "elsewhere") {
      expect(elsewhere).not.toBeNull();
      expect(clean).toBeNull();
      expect((elsewhere!.textContent ?? "").trim()).toBe(ELSEWHERE_COPY);
      expect(elsewhere!.tagName).toBe("P");
      expect(elsewhere!.className).toContain("text-sm");
      expect(elsewhere!.className).toContain("text-text-subtle");
      expect(elsewhere!.hasAttribute("hidden")).toBe(false);
      expect(elsewhere!.getAttribute("style") ?? "").not.toContain("display:none");
    } else if (which === "clean") {
      expect(clean).not.toBeNull();
      expect(elsewhere).toBeNull();
      expect((clean!.textContent ?? "").trim()).toBe(CLEAN_COPY);
      expect(clean!.tagName).toBe("P");
      expect(clean!.className).toContain("text-sm");
      expect(clean!.className).toContain("text-text-subtle");
      expect(clean!.hasAttribute("hidden")).toBe(false);
    } else {
      // list and silent render NEITHER line.
      expect(elsewhere).toBeNull();
      expect(clean).toBeNull();
    }

    // And nothing ELSE. `list` carries the correction-loop callout, which is
    // panel copy the trim deliberately keeps whenever the panel still lists rows
    // of its own (whole-diff review C1); every other state's body is exactly one
    // line or nothing.
    const allowed =
      which === "elsewhere"
        ? [ELSEWHERE_COPY]
        : which === "clean"
          ? [CLEAN_COPY]
          : which === "list"
            ? [
                "Fixed it in the sheet? Edit the cell, save, then re-sync. We'll re-read the sheet and clear this.",
              ]
            : [];
    expectNoStrayBodyCopy(allowed);
  }

  it("(a) List: rows present, and neither empty line, even with warnings here AND elsewhere", () => {
    render(<Harness warnings={LIST} ignored={[]} />);
    expect(bodyRowCount()).toBe(INFO_WARNINGS.length);
    expectOnly("list");
  });

  it("(b) Silent: no body content at all, while the extras below are non-empty", () => {
    render(<Harness warnings={SILENT} ignored={[]} />);
    expect(bodyRowCount()).toBe(0);
    expectOnly("silent");
    // The cards ARE below: a line above them would be noise or a lie.
    expect(screen.queryByTestId("section-warning-controls-warnings")).not.toBeNull();
  });

  it("(c) Elsewhere: the authored line, exactly", () => {
    render(<Harness warnings={ELSEWHERE} ignored={[]} />);
    expect(bodyRowCount()).toBe(0);
    expectOnly("elsewhere");
  });

  it("(d) Clean with no warnings at all", () => {
    render(<Harness warnings={[]} ignored={[]} />);
    expect(bodyRowCount()).toBe(0);
    expectOnly("clean");
  });

  it("(e) Clean when every warn row is ALREADY IGNORED", () => {
    // The pair a wrong active/ignored predicate confuses: warnings exist, but
    // none of them needs a look.
    const allIgnored = [...MAPPED_WARNINGS, ...UNMAPPED_WARNINGS];
    render(<Harness warnings={allIgnored} ignored={allIgnored} />);
    expect(bodyRowCount()).toBe(0);
    expectOnly("clean");
  });

  it("(f) Silent outranks Elsewhere when BOTH counts are positive", () => {
    render(<Harness warnings={SILENT_PRECEDENCE} ignored={[]} />);
    expect(bodyRowCount()).toBe(0);
    expectOnly("silent");
  });

  it("(b) Silent renders NO panel card at all, not an empty bordered tile", () => {
    // impeccable critique P0a: the body is null while the actionable cards
    // render just below, OUTSIDE this wrapper. Keeping the card chrome around
    // zero children shipped an empty bordered, shadowed tile between an amber
    // heading and the real cards, which reads as a failed fetch.
    render(<Harness warnings={SILENT} ignored={[]} />);
    // The <section> survives (it carries the heading); the CARD wrapper inside it
    // must not, or an empty bordered tile renders above the real cards.
    const section = screen.getByTestId(PANEL_TESTID);
    expect(section.querySelectorAll("div.rounded-md.border.bg-surface").length).toBe(0);
    // ...while the cards it was sitting above are present.
    expect(screen.queryByTestId("section-warning-controls-warnings")).not.toBeNull();
  });

  it("List still renders its panel card, so the guard is not simply always-off", () => {
    render(<Harness warnings={LIST} ignored={[]} />);
    const section = screen.getByTestId(PANEL_TESTID);
    expect(section.querySelectorAll("div.rounded-md.border.bg-surface").length).toBe(1);
  });

  it("the legacy binary empty line never renders on the gated surface", () => {
    render(<Harness warnings={[]} ignored={[]} />);
    expect(within(panelBody()).queryByTestId(EMPTY_TESTID)).toBeNull();
  });

  it("the ungated (wizard) surface keeps its original empty line verbatim", () => {
    render(<Harness warnings={[]} ignored={[]} gate={false} />);
    const legacy = within(panelBody()).getByTestId(EMPTY_TESTID);
    expect((legacy.textContent ?? "").trim()).toBe("No parse warnings for this sheet.");
    expect(within(panelBody()).queryByTestId(CLEAN_TESTID)).toBeNull();
  });
});

describe("the panel card is never suppressed while it still holds content", () => {
  it("keeps the card when a parse notice is the body's only content", () => {
    // The two parse codes route EXCLUSIVELY to the notes bucket
    // (lib/admin/sectionAttention.ts:105-110 uses `continue`, so they never
    // become cards). Suppressing the card in Silent would therefore delete the
    // only render site for "your latest changes didn't go through" — a
    // structural no-drop violation, and exactly what the first version of the
    // P0a guard shipped.
    const note = {
      id: "note-1",
      alert: { code: "PARSE_ERROR_LAST_GOOD" },
      lead: "Your latest changes did not go through.",
      rest: "Crew are still seeing the last good version.",
    };
    const sectionAttention = new Map([["warnings", { notes: [note] }]]);

    const data = buildData(SILENT_ONLY);
    const bySection = buildSectionWarningModel({
      slug: FIXTURE_SLUG,
      warnings: SILENT_ONLY,
      ignoredFingerprints: new Set<string>(),
      renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
    });

    function NoteHarness() {
      const scrollerRef = useRef<HTMLDivElement | null>(null);
      return (
        <div ref={scrollerRef}>
          <ShowReviewSurface
            data={data}
            scrollerRef={scrollerRef}
            layout="modal"
            renderSectionExtras={buildSectionWarningExtras({ bySection })}
            routedWarnings={deriveRoutedWarnings(bySection)}
            sectionAttention={sectionAttention as never}
          />
        </div>
      );
    }

    render(<NoteHarness />);
    const section = screen.getByTestId(PANEL_TESTID);
    // The card survives...
    expect(section.querySelectorAll("div.rounded-md.border.bg-surface").length).toBe(1);
    // ...and the notice is actually rendered, not merely wrapped.
    const notes = screen.queryByTestId("parse-attention-notes");
    expect(notes).not.toBeNull();
    // Text comes from the CATALOG via composeParseNote, not from the fixture, so
    // assert it is non-empty rather than pinning copy this test does not own.
    expect((notes!.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(notes!.textContent ?? "").toContain("last good version");
  });
});

describe("the heading's pill agrees with the rows it shows", () => {
  it("all-ignored wears NO amber pill above 'Nothing needs a look on this sheet.'", () => {
    // impeccable critique P0b: the count and the pill render in ONE text run, so
    // "(0) Needs a look" contradicted itself, and an all-ignored sheet wore the
    // pill directly above the reassurance line.
    const allIgnored = [...MAPPED_WARNINGS, ...UNMAPPED_WARNINGS];
    render(<Harness warnings={allIgnored} ignored={allIgnored} />);
    const section = screen.getByTestId(PANEL_TESTID);
    expect(within(section).queryByTestId(CLEAN_TESTID)).not.toBeNull();
    expect(section.textContent ?? "").not.toContain("Needs a look");
  });

  it("still wears the pill when active rows really are routed here", () => {
    // The inverse, so the fix cannot be "never flag the section".
    render(<Harness warnings={[...UNMAPPED_WARNINGS]} ignored={[]} />);
    const section = screen.getByTestId(PANEL_TESTID);
    expect(section.textContent ?? "").toContain("Needs a look");
  });
});

describe("the warnings rail row describes its OWN content", () => {
  it("Elsewhere state does not mark the warnings row as needing review", () => {
    // impeccable audit P1: the dot and its sr-only " — needs review" describe
    // the warnings row. Counting `elsewhere` made AT announce "needs review"
    // immediately before the body says "Nothing else to note here"; those
    // warnings light their own sections' dots instead.
    render(<Harness warnings={[...MAPPED_WARNINGS]} ignored={[]} />);
    // Two rails render (the <lg chip rail and the >=lg pane); assert across all
    // of them, so a fix that only corrects one is still caught.
    const rows = screen
      .getAllByRole("button")
      .filter((b) => (b.textContent ?? "").includes("Parse warnings"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent ?? "").not.toContain("needs review");
    }
  });
});
