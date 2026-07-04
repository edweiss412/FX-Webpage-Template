// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx
 * (Task 9 — spec 2026-07-02-step3-review-modal-redesign.md §11 Transition
 * inventory)
 *
 * Pins EVERY row of the §11 table for <Step3ReviewModal> plus compound C7.
 * T3-T5 (drag) and compounds C1/C2/C5/C6 already have a full suite in
 * Step3ReviewModal.test.tsx (Task 7) — this file re-asserts the §11-table
 * VALUES for T3-T5 (one assertion per row, not a duplicate suite) and adds
 * the rows Task 7 didn't cover: T1, T2, T6, T7, T7b, T8, T9, T10, C7.
 *
 * | # | Transition | Treatment |
 * |---|---|---|
 * | T1 | closed → open | CSS keyframes (sheet-rise/pop-in) + scrim fade (app/globals.css), reduced-motion collapse. |
 * | T2 | open → closed (any path) | Instant unmount — deliberate, no exit animation. |
 * | T3 | open → drag | `transition: none` + `animation: none`; transform tracks pointer. |
 * | T4 | drag → open (release below threshold) | Transform to 0, `--duration-fast`, transform-only. |
 * | T5 | drag → closed (release past threshold) | Transform to 100%, `--duration-normal` + `--ease-out-quart`. |
 * | T6 | activeSection change | Rail/chip background + indicator: `transition-colors duration-fast`; indicator position does NOT slide. |
 * | T7 | checked false ↔ true | Instant swap — deliberate. |
 * | T7b | publish idle → pending → (closed / error) | Instant label/disabled swaps + instant error note. |
 * | T8 | rescanPending false ↔ true | Existing RescanSheetButton label/aria-busy swap — instant. |
 * | T9 | pack-list `<details>` open/close | Chevron `transform` rotate `duration-fast`; row reveal instant. |
 * | T10 | warnings/props change while open | Instant re-render (server truth). |
 * | C7 | `checked` flips via card checkbox while open | Footer label updates instantly, no animation. |
 *
 * Source-marker audit: every ternary/`&&` JSX conditional in
 * Step3ReviewModal.tsx that mounts/unmounts an element is walked via a
 * curated regex scan; each site must carry EITHER an animation/transition
 * class or the `§11: instant — deliberate` marker comment on the line
 * immediately above it. The scan ALSO asserts the total conditional-render
 * count equals the curated list length (8), so a new conditional added later
 * without classification fails this test until marked.
 *
 * Anti-tautology: T10/C7 assertions read the rerendered DOM via the SAME
 * dfid-scoped testids the component itself defines (no sibling decoy can
 * satisfy them since only one modal instance is ever mounted per test); the
 * rail-count / warning-row counts are read directly off the fixture arrays,
 * never restated as literals.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

// RescanSheetButton (mounted in the modal footer) calls useRouter().refresh().
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import type { SectionData } from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MODAL_SRC = readFileSync(
  join(ROOT, "components/admin/wizard/Step3ReviewModal.tsx"),
  "utf8",
);
const GLOBALS_CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind } };
}

function sectionData(
  prOverrides: Partial<ParseResult> = {},
  dataOverrides: Partial<SectionData> = {},
): SectionData {
  const pr = buildParseResult(prOverrides);
  const row = stagedRow(pr);
  return {
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    ...dataOverrides,
  };
}

function tid(name: string): string {
  return `wizard-step3-card-${DFID}-review-${name}`;
}

function renderModal(
  opts: {
    d?: SectionData;
    checked?: boolean;
    isDirtyRescan?: boolean;
    onRequestSetChecked?: (next: boolean) => Promise<boolean>;
    onClose?: () => void;
  } = {},
) {
  const onClose = opts.onClose ?? vi.fn();
  const onRequestSetChecked = opts.onRequestSetChecked ?? vi.fn(async () => true);
  const d = opts.d ?? sectionData();
  const q = render(
    <Step3ReviewModal
      data={d}
      checked={opts.checked ?? false}
      isDirtyRescan={opts.isDirtyRescan ?? false}
      onRequestSetChecked={onRequestSetChecked}
      onClose={onClose}
    />,
  );
  return { q, d, onClose, onRequestSetChecked };
}

// ── T1: entrance (spec §11 T1) ──────────────────────────────────────────────

describe("§11 T1: closed → open — CSS-owned entrance", () => {
  test("panel + scrim carry the entrance data hooks; keyframes/durations/reduced-motion live in app/globals.css", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("backdrop")).hasAttribute("data-step3-review-scrim")).toBe(true);
    expect(document.querySelector("[data-step3-review-panel]")).not.toBeNull();
    // The component itself does NOT declare the keyframes/animation shorthand —
    // that's CSS-owned (failure mode: JS reimplementing the entrance inline).
    expect(MODAL_SRC).not.toMatch(/@keyframes/);
    // CSS owns both hooks, the two keyframes, and the reduced-motion collapse.
    expect(GLOBALS_CSS).toMatch(/\[data-step3-review-scrim\]\s*\{/);
    expect(GLOBALS_CSS).toMatch(/\[data-step3-review-panel\]\s*\{/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-sheet-rise/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-pop-in/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-scrim-in/);
    expect(GLOBALS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-step3-review-scrim\],\s*\[data-step3-review-panel\] \{\s*animation: none;/,
    );
  });
});

// ── T2: instant unmount (spec §11 T2) ───────────────────────────────────────

/** Toggle host mirroring the real mount contract: the PARENT conditionally
 *  renders <Step3ReviewModal>, and onClose flips the parent's state to
 *  unmount it — there is no exit animation to wait for. */
function ToggleHost() {
  const [open, setOpen] = useState(true);
  return open ? (
    <Step3ReviewModal
      data={sectionData()}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={async () => true}
      onClose={() => setOpen(false)}
    />
  ) : null;
}

describe("§11 T2: open → closed — instant unmount, no exit animation", () => {
  test("close button unmounts the dialog synchronously; the component declares no exit/leave animation", () => {
    const q = render(<ToggleHost />);
    expect(q.getByTestId(tid("modal"))).not.toBeNull();
    fireEvent.click(q.getByTestId(tid("close")));
    // No waitFor: unmount is synchronous — a lingering exit-animation delay
    // would leave the node present here.
    expect(q.queryByTestId(tid("modal"))).toBeNull();
    expect(MODAL_SRC).not.toMatch(/AnimatePresence|framer-motion/);
  });

  test("scrim tap-out also unmounts instantly (any close path — Esc/scrim/close/publish all converge on the same onClose)", () => {
    const q = render(<ToggleHost />);
    fireEvent.click(q.getByTestId(tid("backdrop")));
    expect(q.queryByTestId(tid("modal"))).toBeNull();
  });
});

// ── T3-T5: drag states (Task 7 full suite; re-assert §11 table values) ──────

describe("§11 T3-T5: drag states — re-asserted table values (Task 7 owns the full suite)", () => {
  const START_Y = 100;

  function grabWithCaptureStubs(q: ReturnType<typeof renderModal>["q"]) {
    const grab = q.getByTestId(tid("grab"));
    Object.assign(grab, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    const panel = q.container.querySelector<HTMLElement>("[data-step3-review-panel]");
    if (!panel) throw new Error("panel not rendered");
    return { grab, panel };
  }

  test("T3: transition AND animation both 'none' during drag (transform-only tracking)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    expect(panel.style.transition).toBe("none");
    expect(panel.style.animation).toBe("none");
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 40 });
    expect(panel.style.transform).toBe("translateY(40px)");
  });

  test("T4: spring-back uses --duration-fast (release below threshold)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 20 }); // past slop, short of dismiss
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + 20 });
    expect(panel.style.transition).toBe("transform var(--duration-fast) var(--ease-out-quart)");
    expect(panel.style.transform).toBe("translateY(0px)");
  });

  test("T5: dismiss transition uses --duration-normal + --ease-out-quart (release past threshold)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 200 }); // past dismiss threshold
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + 200 });
    expect(panel.style.transition).toBe("transform var(--duration-normal) var(--ease-out-quart)");
    expect(panel.style.transform).toBe("translateY(100%)");
  });
});

// ── T6: activeSection change (spec §11 T6) ──────────────────────────────────

describe("§11 T6: activeSection change — transition-colors duration-fast on both navs; indicator does not slide", () => {
  test("every rail item and chip item carries transition-colors duration-fast", () => {
    const { q } = renderModal();
    // Read the registry-order ids straight off the rendered rail (anti-tautology:
    // derived from the DOM the component actually produced, not a hardcoded list).
    const railItems = Array.from(
      q.getByTestId(tid("rail")).querySelectorAll<HTMLElement>('[data-testid*="-rail-item-"]'),
    );
    const chipItems = Array.from(
      q
        .getByTestId(tid("chiprail"))
        .querySelectorAll<HTMLElement>('[data-testid*="-chip-item-"]'),
    );
    expect(railItems.length).toBeGreaterThan(0);
    expect(chipItems.length).toBeGreaterThan(0);
    for (const el of [...railItems, ...chipItems]) {
      expect(el.className).toMatch(/\btransition-colors\b/);
      expect(el.className).toMatch(/\bduration-fast\b/);
    }
  });

  test("the active-item indicator mounts with the active rail item but never carries a position-slide transition (§11: 'position does not slide')", () => {
    const { q } = renderModal();
    const firstId = (() => {
      const rail = q.getByTestId(tid("rail"));
      const active = rail.querySelector('[aria-current="true"]');
      return active!.getAttribute("data-testid")!;
    })();
    const activeItem = q.getByTestId(firstId);
    const indicator = activeItem.querySelector(".bg-accent")!;
    expect(indicator).not.toBeNull();
    // No transform/left/transition classes — it appears with the item, it never slides.
    expect(indicator.className).not.toMatch(/transition|duration|translate/);
  });
});

// ── T7 / T7b: publish label + checked swaps (spec §11 T7/T7b) ──────────────

describe("§11 T7/T7b: checked + publish-state swaps are instant — no animation class on the publish button", () => {
  test("publish button carries no entrance/exit animation utility (transition-colors is a hover affordance, not a state-swap animation)", () => {
    const { q } = renderModal();
    const btn = q.getByTestId(tid("publish"));
    expect(btn.className).not.toMatch(/\banimate-|transition-\[|duration-normal\b/);
    cleanup();
    // The checked resting state has its own (demoted quiet-positive) class
    // string — the instant-swap contract holds for it too.
    const { q: q2 } = renderModal({ checked: true });
    expect(q2.getByTestId(tid("publish")).className).not.toMatch(
      /\banimate-|transition-\[|duration-normal\b/,
    );
  });

  test("T7: label swaps instantly between unchecked/checked across separate mounts (no animation)", () => {
    const { q } = renderModal({ checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
    cleanup();
    const { q: q2 } = renderModal({ checked: true });
    expect(q2.getByTestId(tid("publish")).textContent).toBe("Selected to publish");
  });

  test("T7b: pending → error note appears instantly, no animation on the note or button", async () => {
    const { q } = renderModal({ onRequestSetChecked: vi.fn(async () => false) });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() =>
      expect(
        within(q.getByTestId(tid("footer"))).getByText(
          "Couldn't update the publish selection. Try again.",
        ),
      ).toBeTruthy(),
    );
    const note = within(q.getByTestId(tid("footer"))).getByText(
      "Couldn't update the publish selection. Try again.",
    );
    expect(note.className).not.toMatch(/\banimate-|transition-\[/);
  });
});

// ── T8: rescanPending swap (spec §11 T8) ────────────────────────────────────

describe("§11 T8: rescanPending false ↔ true — existing RescanSheetButton label/aria-busy swap, unchanged, instant", () => {
  test("clicking re-scan flips aria-busy + label instantly (mid-flight), no animation class on the button", async () => {
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const { q } = renderModal();
    const btn = q.getByTestId(`rescan-sheet-button-${DFID}`) as HTMLButtonElement;
    expect(btn.getAttribute("aria-busy")).toBe("false");
    expect(btn.textContent).toBe("Re-scan this sheet");
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    expect(btn.textContent).toBe("Re-scanning…");
    expect(btn.className).not.toMatch(/\banimate-|transition-\[|duration-normal\b/);
    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({ ok: true, status: "updated", needsReview: false, changed: true }),
          { status: 200 },
        ),
      );
    });
  });
});

// ── T9: pack-list chevron rotate (spec §11 T9) ──────────────────────────────

describe("§11 T9: pack-list <details> open/close — chevron transform rotate duration-fast; row reveal instant", () => {
  test("the chevron carries transition-transform duration-fast group-open:rotate-90; details toggles open with no delay", () => {
    const d = sectionData(
      {},
      {
        pullSheet: [
          { caseLabel: "Case A", items: [{ qty: 1, cat: null, subCat: null, item: "Cable" }] },
        ],
      },
    );
    const { q } = renderModal({ d });
    const details = q.getByTestId(`wizard-step3-card-${DFID}-pack-case-0`) as HTMLDetailsElement;
    const chevron = details.querySelector("svg")!;
    expect(chevron.getAttribute("class")).toMatch(/transition-transform/);
    expect(chevron.getAttribute("class")).toMatch(/duration-fast/);
    expect(chevron.getAttribute("class")).toMatch(/group-open:rotate-90/);
    expect(details.open).toBe(false);
    // Row reveal is instant: toggling `open` immediately exposes the item list,
    // no animation frame to wait for.
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));
    expect(within(details).getByText(/Cable/)).toBeTruthy();
  });
});

// ── T10: props change while open (spec §11 T10) ─────────────────────────────

describe("§11 T10: warnings/props change while open — instant re-render (server truth)", () => {
  test("adding a warning via rerender shows the new row immediately; the header chip flips instantly; no animation class on the warnings panel", () => {
    const d0 = sectionData({ warnings: [] });
    const { q } = renderModal({ d: d0 });
    expect(q.getByTestId(tid("chip")).textContent).toBe("All clean");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warning-0`)).toBeNull();

    const d1 = sectionData({ warnings: [warning("crew")] });
    q.rerender(
      <Step3ReviewModal
        data={d1}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );

    // Instant: no waitFor — the new row is present the moment rerender returns.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-warning-0`)).toBeTruthy();
    expect(q.getByTestId(tid("chip")).textContent).toBe("1 needs a look");
    const warningsPanel = q.getByTestId(tid("section-warnings"));
    expect(warningsPanel.className).not.toMatch(/\banimate-|transition-\[height\]|motion\b/);
  });
});

// ── C7: checked flips via the card while the modal is open ──────────────────

describe("§11 C7: checked flips via the card checkbox while the modal is open — footer label updates instantly, no animation", () => {
  test("rerendering with checked=true (simulating the card's shared state flip) updates the footer label with no wait, no animation class", () => {
    const d = sectionData();
    const { q } = renderModal({ d, checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");

    q.rerender(
      <Step3ReviewModal
        data={d}
        checked={true}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );

    expect(q.getByTestId(tid("publish")).textContent).toBe("Selected to publish");
    expect(q.getByTestId(tid("publish")).className).not.toMatch(/\banimate-|transition-\[/);
  });
});

// ── Source-marker audit ──────────────────────────────────────────────────────

/** Every JSX ternary/`&&` conditional in Step3ReviewModal.tsx that mounts or
 *  unmounts an element. Matches BOTH the multi-line style this file currently
 *  uses (`{cond ? (` on its own line, JSX branch on following lines) and a
 *  one-line style (`{cond ? <X` / `{cond && <X`), so a future conditional
 *  written either way is still caught by the count assertion below. */
function findConditionalLines(src: string): number[] {
  const lines = src.split("\n");
  const hits: number[] = [];
  const multiLine = /^\s*\{.*\?\s*\(\s*$/;
  const oneLineTernary = /\{[a-zA-Z][^{}]*\?\s*<[A-Za-z]/;
  const oneLineAnd = /\{[a-zA-Z][^{}]*&&\s*<[A-Za-z]/;
  lines.forEach((line, i) => {
    if (multiLine.test(line) || oneLineTernary.test(line) || oneLineAnd.test(line)) {
      hits.push(i); // 0-indexed
    }
  });
  return hits;
}

/** True if the line immediately preceding `lineIndex` (skipping nothing — the
 *  marker/animation annotation must sit directly above the conditional) either
 *  declares the deliberate-instant marker or documents an animation treatment. */
function isClassified(lines: string[], lineIndex: number): { classified: boolean; instant: boolean } {
  const prev = lines[lineIndex - 1] ?? "";
  const instant = prev.includes("§11") && prev.includes("instant — deliberate");
  const animated = /animate-|transition-\[|duration-(fast|normal)\b|ease-out-quart\b/.test(prev);
  return { classified: instant || animated, instant };
}

describe("§11 source-marker audit — every conditional-render site in Step3ReviewModal.tsx is classified", () => {
  test("exactly 8 conditional-render sites exist (curated list length) — a new one added later must be classified or this count fails", () => {
    const hits = findConditionalLines(MODAL_SRC);
    expect(hits.length).toBe(8);
  });

  test("every conditional-render site carries either the §11 instant marker or an animation/transition class on the line above it", () => {
    const lines = MODAL_SRC.split("\n");
    const hits = findConditionalLines(MODAL_SRC);
    const unclassified: string[] = [];
    for (const idx of hits) {
      const { classified } = isClassified(lines, idx);
      if (!classified) unclassified.push(`line ${idx + 1}: ${(lines[idx] ?? "").trim()}`);
    }
    expect(unclassified).toEqual([]);
  });

  test("all 8 currently-known sites classify as INSTANT (none are animated) — pins the §11 table's 'deliberate instant' rows", () => {
    const lines = MODAL_SRC.split("\n");
    const hits = findConditionalLines(MODAL_SRC);
    for (const idx of hits) {
      const { instant } = isClassified(lines, idx);
      expect(instant).toBe(true);
    }
  });
});
