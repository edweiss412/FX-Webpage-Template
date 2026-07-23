// tests/components/admin/wizard/pointerSentence.test.tsx
// @vitest-environment jsdom
/** Spec §3.5/§8.6: FULL sentence textContent equality pins punctuation.
 *  Catches: missing terminal period, wrong 2-name/3-name separators, cap and
 *  unified-overflow regressions, wrong callback ids, missing-callback fallback. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("cap boundary, extra split, unified miss count", () => {
    expect(POINTER_NAME_CAP).toBe(3);
    expect(pointerSentenceParts([T("crew", "Crew")], 1)).toEqual({
      named: [T("crew", "Crew")],
      extra: [],
      missCount: 0,
    });
    expect(pointerSentenceParts([T("crew", "Crew"), T("rooms", "Rooms & scope")], 3)).toEqual({
      named: [T("crew", "Crew"), T("rooms", "Rooms & scope")],
      extra: [],
      missCount: 1, // 1 unresolved section folds into the same clause (spec §3.5)
    });
    const five = [T("a", "A"), T("b", "B"), T("c", "C"), T("d", "D"), T("e", "E")];
    expect(pointerSentenceParts(five, 5)).toEqual({
      named: five.slice(0, POINTER_NAME_CAP),
      extra: five.slice(POINTER_NAME_CAP),
      missCount: 0,
    });
    expect(pointerSentenceParts(five.slice(0, 4), 5)).toEqual({
      named: five.slice(0, POINTER_NAME_CAP),
      extra: [five[POINTER_NAME_CAP]!],
      missCount: 1,
    });
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
  function renderElsewhere(labels: string[]) {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 0, elsewhereSections: labels })}
      />,
    );
  }

  function sentence(): string {
    return screen.getByTestId(/warnings-elsewhere/).textContent ?? "";
  }

  it("1 section: exact sentence, no comma, no and", () => {
    renderElsewhere(["Crew"]);
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew. Nothing else to note here.",
    );
  });

  it("2 sections: exact sentence with and", () => {
    renderElsewhere(["Crew", "Rooms & scope"]);
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew and Rooms & scope. Nothing else to note here.",
    );
  });

  it("3 sections: serial comma in REGISTRY order (not input order), no more-suffix", () => {
    // Input deliberately misordered: the sentence follows the section
    // registry's visual order (Crew, Contacts, Rooms & scope).
    renderElsewhere(["Rooms & scope", "Crew", "Contacts"]);
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew, Contacts, and Rooms & scope. Nothing else to note here.",
    );
  });

  it("4 sections: cap 3 + unified overflow clause (comma-separated names, no and between them)", () => {
    // Production overflow is CAP overflow: every elsewhere section is a
    // rendered registry section, so labels always resolve (label-miss is a
    // defensive guard pinned at the chrome level below).
    renderElsewhere(["Crew", "Contacts", "Hotels", "Rooms & scope"]);
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew, Contacts, Hotels, and 1 more. Nothing else to note here.",
    );
  });

  it("5 sections: plural overflow clause, full string", () => {
    renderElsewhere(["Crew", "Contacts", "Hotels", "Transport", "Rooms & scope"]);
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew, Contacts, Hotels, and 2 more. Nothing else to note here.",
    );
  });

  it("zero resolved labels with positive total: fallback sentence (chrome-level guard)", () => {
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [], totalSections: 2 },
    });
    expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
      "The warnings that need a look are in their own sections. Nothing else to note here.",
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
      "The warnings that need a look are in Crew. Nothing else to note here.",
    );
    expect(el.querySelector("strong")?.textContent).toBe("Crew");
  });

  it("miss-fold joiner grammar: 1 and 2 resolved names (polish spec §8.6 pinned strings)", () => {
    // 1 resolved + 1 miss: NO comma before the clause (WD2 P1).
    renderWarningsBreakdownWithChrome({
      pointerTargets: { targets: [T("crew", "Crew")], totalSections: 2 },
    });
    expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
      "The warnings that need a look are in Crew and 1 more. Nothing else to note here.",
    );
    cleanup();
    // 2 resolved + 1 miss: comma-separated names, serial comma before clause.
    renderWarningsBreakdownWithChrome({
      pointerTargets: {
        targets: [T("crew", "Crew"), T("rooms", "Rooms & scope")],
        totalSections: 3,
      },
    });
    expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
      "The warnings that need a look are in Crew, Rooms & scope, and 1 more. Nothing else to note here.",
    );
  });

  it("no pointer targets at all: today's exact fallback sentence", () => {
    renderWarningsBreakdownWithChrome({});
    expect(screen.getByTestId(/warnings-elsewhere/).textContent).toBe(
      "The warnings that need a look are in their own sections. Nothing else to note here.",
    );
  });
});

describe("overflow reveal (announcer spec 2026-07-22 §4.2-4.3)", () => {
  const T5 = [
    T("crew", "Crew"),
    T("contacts", "Contacts"),
    T("hotels", "Hotels"),
    T("transport", "Transport"),
    T("rooms", "Rooms & scope"),
  ];
  // Derived, never hardcoded (plan-review R1 F7).
  const EXTRA_N = T5.length - POINTER_NAME_CAP;
  const revealLabel = (n: number) => (n === 1 ? "Show 1 more section" : `Show ${n} more sections`);
  const FULL_SENTENCE =
    "The warnings that need a look are in Crew, Contacts, Hotels, Transport, and Rooms & scope. Nothing else to note here.";

  function chromeFor(extras: Partial<Step3SectionChrome>): Step3SectionChrome {
    const data = buildPublishedSurfaceProps({ gateOff: true }).data;
    const warningsDef = step3Sections(data).find((s) => s.id === "warnings")!;
    return {
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
      ...extras,
    } as Step3SectionChrome;
  }

  /** Rerender-capable chrome harness: same mounted tree position, so the
   *  reveal component's local state survives data swaps (spec §4.3 matrix). */
  function renderChrome(extras: Partial<Step3SectionChrome>) {
    const data = buildPublishedSurfaceProps({ gateOff: true }).data;
    const warningsDef = step3Sections(data).find((s) => s.id === "warnings")!;
    const view = render(
      <Step3SectionChromeContext.Provider value={chromeFor(extras)}>
        {warningsDef.render(data)}
      </Step3SectionChromeContext.Provider>,
    );
    const rerenderWith = (nextExtras: Partial<Step3SectionChrome>) =>
      view.rerender(
        <Step3SectionChromeContext.Provider value={chromeFor(nextExtras)}>
          {warningsDef.render(data)}
        </Step3SectionChromeContext.Provider>,
      );
    return { rerenderWith };
  }

  const sentence = () => screen.getByTestId(/warnings-elsewhere/).textContent ?? "";

  it("boundary matrix: reveal button only in the pure over-cap + callback case", () => {
    // extra>0, miss=0, callback: button with derived plural accessible name.
    renderChrome({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: vi.fn(),
    });
    const btn = screen.getByRole("button", { name: revealLabel(EXTRA_N) });
    expect(btn.textContent).toBe(`${EXTRA_N} more`);
    cleanup();
    // extra=1, miss=0, callback: SINGULAR accessible name (R2 F4 boundary).
    renderChrome({
      pointerTargets: {
        targets: T5.slice(0, POINTER_NAME_CAP + 1),
        totalSections: POINTER_NAME_CAP + 1,
      },
      onJumpToSection: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Show 1 more section" }).textContent).toBe("1 more");
    cleanup();
    // extra>0, miss=0, NO callback: plain clause, zero buttons.
    renderChrome({ pointerTargets: { targets: T5, totalSections: T5.length } });
    expect(screen.queryByRole("button")).toBeNull();
    expect(sentence()).toBe(
      `The warnings that need a look are in Crew, Contacts, Hotels, and ${EXTRA_N} more. Nothing else to note here.`,
    );
    cleanup();
    // extra=0, miss>0, callback: plain clause (R1 F9 dead-button boundary).
    renderChrome({
      pointerTargets: {
        targets: T5.slice(0, POINTER_NAME_CAP),
        totalSections: POINTER_NAME_CAP + 1,
      },
      onJumpToSection: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
    expect(sentence()).toContain("and 1 more.");
    cleanup();
    // extra>0 AND miss>0, callback: plain unified clause, no reveal button.
    renderChrome({
      pointerTargets: {
        targets: T5.slice(0, POINTER_NAME_CAP + 1),
        totalSections: POINTER_NAME_CAP + 2,
      },
      onJumpToSection: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
    expect(sentence()).toContain("and 2 more.");
  });

  it("tap reveals the full list, every revealed name fires the jump, focus moves once", async () => {
    const onJump = vi.fn();
    renderChrome({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: onJump,
    });
    fireEvent.click(screen.getByRole("button", { name: revealLabel(EXTRA_N) }));
    expect(sentence()).toBe(FULL_SENTENCE);
    const firstRevealed = screen.getByRole("button", { name: T5[POINTER_NAME_CAP]!.label });
    await waitFor(() => expect(document.activeElement).toBe(firstRevealed));
    // Every revealed name has a LIVE handler (plan-review R1 F6).
    for (const t of T5.slice(POINTER_NAME_CAP)) {
      fireEvent.click(screen.getByRole("button", { name: t.label }));
    }
    expect(onJump.mock.calls.map((c) => c[0])).toEqual(T5.slice(POINTER_NAME_CAP).map((t) => t.id));
  });

  it("expanded is a sticky preference derived against CURRENT data (R2 F2, R3 F3, R4 F3)", async () => {
    const onJump = vi.fn();
    const { rerenderWith } = renderChrome({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: onJump,
    });
    fireEvent.click(screen.getByRole("button", { name: revealLabel(EXTRA_N) }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: T5[POINTER_NAME_CAP]!.label }),
      ),
    );
    // (a) overflow removed: plain <=cap sentence even though expanded is set.
    rerenderWith({
      pointerTargets: { targets: T5.slice(0, 2), totalSections: 2 },
      onJumpToSection: onJump,
    });
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew and Contacts. Nothing else to note here.",
    );
    const afterCollapse = document.activeElement; // focused node unmounted -> body (accepted parity)
    // (b) overflow restored: full list WITHOUT another tap; no focus steal.
    rerenderWith({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: onJump,
    });
    expect(sentence()).toBe(FULL_SENTENCE);
    expect(document.activeElement).toBe(afterCollapse);
    // (c) a label miss introduced: plain folded clause wins over the preference.
    rerenderWith({
      pointerTargets: { targets: T5.slice(0, POINTER_NAME_CAP + 1), totalSections: T5.length },
      onJumpToSection: onJump,
    });
    expect(sentence()).toBe(
      `The warnings that need a look are in Crew, Contacts, Hotels, and ${T5.length - (POINTER_NAME_CAP + 1) + 1} more. Nothing else to note here.`,
    );
    expect(document.activeElement).toBe(afterCollapse);
    // (d) one extra section replaced while staying over-cap: list re-renders
    // with the new name, focus untouched (R3 F3).
    const T5swap = [...T5.slice(0, 3), T("schedule", "Schedule"), T5[4]!];
    rerenderWith({
      pointerTargets: { targets: T5swap, totalSections: T5swap.length },
      onJumpToSection: onJump,
    });
    expect(sentence()).toBe(
      "The warnings that need a look are in Crew, Contacts, Hotels, Schedule, and Rooms & scope. Nothing else to note here.",
    );
    expect(document.activeElement).toBe(afterCollapse);
    // (e) callback removed: plain collapsed clause even though expanded (R4 F3).
    rerenderWith({ pointerTargets: { targets: T5, totalSections: T5.length } });
    expect(screen.queryByRole("button")).toBeNull();
    expect(sentence()).toBe(
      `The warnings that need a look are in Crew, Contacts, Hotels, and ${EXTRA_N} more. Nothing else to note here.`,
    );
  });

  it("one-shot focus flag cannot be inherited by a later data-driven render (R4 F2)", async () => {
    const onJump = vi.fn();
    const { rerenderWith } = renderChrome({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: onJump,
    });
    // Activation immediately followed by an overflow-dropping data change: the
    // flag is consumed by the first post-tap commit (whether or not a revealed
    // button rendered in it), so the LATER restore below must not steal focus.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: revealLabel(EXTRA_N) }));
      rerenderWith({
        pointerTargets: { targets: T5.slice(0, 2), totalSections: 2 },
        onJumpToSection: onJump,
      });
    });
    await waitFor(() => expect(sentence()).toContain("Crew and Contacts"));
    const active = document.activeElement;
    rerenderWith({
      pointerTargets: { targets: T5, totalSections: T5.length },
      onJumpToSection: onJump,
    });
    expect(sentence()).toBe(FULL_SENTENCE);
    expect(document.activeElement).toBe(active);
  });
});
