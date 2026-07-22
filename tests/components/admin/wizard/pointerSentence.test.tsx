// tests/components/admin/wizard/pointerSentence.test.tsx
// @vitest-environment jsdom
/** Spec §3.5/§8.6: FULL sentence textContent equality pins punctuation.
 *  Catches: missing terminal period, wrong 2-name/3-name separators, cap and
 *  unified-overflow regressions, wrong callback ids, missing-callback fallback. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import {
  POINTER_NAME_CAP,
  Step3SectionChromeContext,
  pointerSentenceParts,
  step3Sections,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

afterEach(cleanup);

const T = (id: string, label: string) => ({ id: id as SectionId, label });

describe("pointerSentenceParts (pure, spec §3.5)", () => {
  it("cap boundary and unified overflow", () => {
    expect(POINTER_NAME_CAP).toBe(3);
    expect(pointerSentenceParts([T("crew", "Crew")], 1)).toEqual({
      named: [T("crew", "Crew")],
      moreCount: 0,
    });
    expect(pointerSentenceParts([T("crew", "Crew"), T("rooms", "Rooms & scope")], 3)).toEqual({
      named: [T("crew", "Crew"), T("rooms", "Rooms & scope")],
      moreCount: 1, // 1 unresolved section folds into the same clause (spec §3.5)
    });
    const four = [T("a", "A"), T("b", "B"), T("c", "C"), T("d", "D")];
    expect(pointerSentenceParts(four, 4)).toEqual({ named: four.slice(0, 3), moreCount: 1 });
  });
});

/** Direct chrome render — the Provider carries the fields; catches a wrong id
 *  or a dead handler wire at the chrome contract level. handleNavClick wiring
 *  is the e2e spec's browser test. Pattern: routedWarningsGate.test.tsx
 *  direct-Provider probes. */
function renderWarningsBreakdownWithChrome(chromeExtras: Partial<Step3SectionChrome>): void {
  const data = buildPublishedSurfaceProps({ gateOff: true }).data;
  const warningsDef = step3Sections(data).find((s) => s.id === "warnings")!;
  const chrome = {
    Icon: warningsDef.Icon,
    label: warningsDef.label,
    flagged: true,
    judgment: false,
    getActiveSection: () => null,
    dfid: "DRIVE_POLISH",
    sectionId: "warnings",
    sourceAnchors: {},
    routedWarningsRenderElsewhere: true,
    routedWarnings: { here: 0, elsewhere: 1, activeWarningsBySection: {} },
    ...chromeExtras,
  } as Step3SectionChrome;
  render(
    <Step3SectionChromeContext.Provider value={chrome}>
      {warningsDef.render(data)}
    </Step3SectionChromeContext.Provider>,
  );
}

describe("pointer sentence render (spec §8.6)", () => {
  function renderElsewhere(labels: string[], opts: { totalSections?: number } = {}) {
    const props = buildPublishedSurfaceProps({
      listed: 0,
      here: 0,
      elsewhereSections: labels,
      ...(opts.totalSections !== undefined ? { elsewhereTotalSections: opts.totalSections } : {}),
    });
    render(<ShowReviewSurface {...props} />);
  }

  function sentence(): string {
    return screen.getByTestId(/warnings-elsewhere/).textContent ?? "";
  }

  it("1 section: exact sentence, no comma, no and", () => {
    renderElsewhere(["Crew"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew.",
    );
  });

  it("2 sections: exact sentence with and", () => {
    renderElsewhere(["Crew", "Rooms & scope"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew and Rooms & scope.",
    );
  });

  it("3 sections: serial comma in REGISTRY order (not input order), no more-suffix", () => {
    // Input deliberately misordered: the sentence follows the section
    // registry's visual order (Crew, Contacts, Rooms & scope).
    renderElsewhere(["Rooms & scope", "Crew", "Contacts"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew, Contacts, and Rooms & scope.",
    );
  });

  it("4 sections: cap 3 + unified overflow clause (comma-separated names, no and between them)", () => {
    // Production overflow is CAP overflow: every elsewhere section is a
    // rendered registry section, so labels always resolve (label-miss is a
    // defensive guard pinned at the chrome level below).
    renderElsewhere(["Crew", "Contacts", "Hotels", "Rooms & scope"]);
    expect(sentence()).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew, Contacts, Hotels, and 1 more.",
    );
  });

  it("tap fires onJumpToSection with the section id (chrome-level contract)", () => {
    const onJump = vi.fn();
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [{ id: "crew" as SectionId, label: "Crew" }], totalSections: 1 },
      onJumpToSection: onJump,
    });
    fireEvent.click(screen.getByRole("button", { name: "Crew" }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith("crew");
  });

  it("no callback: bold text, no buttons (direct chrome harness)", () => {
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [{ id: "crew" as SectionId, label: "Crew" }], totalSections: 1 },
      // onJumpToSection deliberately OMITTED
    });
    expect(screen.queryByRole("button", { name: "Crew" })).toBeNull();
    const el = screen.getByTestId(/warnings-elsewhere/);
    expect(el.textContent).toBe(
      "Nothing else to note here. The warnings that need a look are in Crew.",
    );
    expect(el.querySelector("strong")?.textContent).toBe("Crew");
  });

  it("no pointer targets at all: today's exact fallback sentence", () => {
    renderWarningsBreakdownWithChrome({});
    expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
      "Nothing else to note here. The warnings that need a look are in their own sections.",
    );
  });
});
