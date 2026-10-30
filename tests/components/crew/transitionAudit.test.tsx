// @vitest-environment jsdom
/**
 * tests/components/crew/transitionAudit.test.tsx — crew-redesign §4.10 transition
 * audit (Phase 4 Task 2, "test 14"). The STRUCTURAL half of the audit: a static
 * source enumeration + a jsdom render-shape pass. jsdom computes no layout and
 * never advances framer's rAF-driven keyframes, so the real-browser half lives
 * in the crew e2e specs (crew page redesign PR A, Task 12).
 *
 * The §4.10 inventory this file pins (each row → a named test):
 *
 *   | section ↔ section          | ONE uniform CrewSectionTransition crossfade +   |
 *   |                            | 4px translateY, --duration-normal(220ms) /      |
 *   |                            | --ease-out-quart; initial={false} first paint;  |
 *   |                            | reduced-motion → 0ms (duration token only).     |
 *   | the pass: live-state swap  | AnimatePresence initial={false}, NOT            |
 *   | and day crossfade          | mode="wait": both bodies overlap mid-fade (crew |
 *   |                            | page redesign spec §7); reuses                  |
 *   |                            | transitionTreatment + the 66-pair table; under  |
 *   |                            | reduced motion the presence key holds still.    |
 *   | sheet closed ↔ open        | CrewSectionSheet: one AnimatePresence           |
 *   |                            | initial={false}; panel slides, scrim fades, the |
 *   |                            | same --duration-normal transition both ways;    |
 *   |                            | reduced motion → duration 0 (crew page redesign |
 *   |                            | spec §7; Task 12 owns the full §7 audit).       |
 *   | wide nav item inactive ↔   | CSS-only colour transition plus ONE accent bar  |
 *   | active                     | that moves by a CSS transition, --duration-fast |
 *   |                            | / --ease-out-quart. NO framer here.             |
 *   | Budget row appears↔absent  | INSTANT — server render, NO animation wrapper   |
 *   | KeyTimesStrip present↔omit | INSTANT — server render, NO animation wrapper   |
 *   | Gear emphasis              | INSTANT — static data-emphasis attribute        |
 *   | any × reduced-motion       | all motion via duration tokens → collapses 0ms  |
 *   | initial={false} EVERYWHERE | no animating-from-hidden SSR (M12.11 framer trap)|
 *
 * The retired tab-to-tab compound rows had a skipped real-browser block in
 * tests/e2e/crew-page.spec.ts; the crew page redesign removed the tabs and that
 * block with them, and its Task 12 owns the sheet's compound cases.
 */
import "@testing-library/jest-dom/vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { CrewWideNav } from "@/components/crew/CrewWideNav";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// The out-then-in crossfade: an AnimatePresence mode="wait" swapping one keyed body.
const CROSSFADE_COMPONENTS = ["components/crew/CrewSectionTransition.tsx"] as const;

// The pass (crew page redesign plan Task 9): an overlapping crossfade, not mode="wait".
const PASS = "components/crew/CrewPass.tsx";

// The run-of-show card (plan Task 10): its rows crossfade with the pass on a day
// switch (spec §7 "Day A selected → day B"), the same overlapping shape.
const RUN_CARD = "components/crew/CrewRunOfShowCard.tsx";

// The ONLY crew components that carry a client motion library: the crossfades
// plus the section sheet's slide. Everything else under components/crew/** must
// be motion-free (instant by design).
const MOTION_COMPONENTS = [
  ...CROSSFADE_COMPONENTS,
  PASS,
  RUN_CARD,
  "components/crew/CrewSectionSheet.tsx",
] as const;

// Instant-by-design surfaces (server-rendered or static-attribute): an
// AnimatePresence / <motion.*> here is a BUG (§4.10 "INSTANT" rows).
const INSTANT_BY_DESIGN = [
  "components/crew/CrewAllSections.tsx", // row presence (Budget included) is server-driven
  "components/crew/CrewWideNav.tsx", // item active↔inactive and the accent bar are CSS transitions
  "components/crew/primitives/KeyTimesStrip.tsx", // present↔omitted is server render
  "components/crew/sections/GearSection.tsx", // emphasis is a static data-emphasis attr
] as const;

afterEach(cleanup);

describe("§4.10 transition audit — static enumeration", () => {
  it('inventory: section↔section — every AnimatePresence carries mode="wait" AND initial={false}', () => {
    for (const rel of CROSSFADE_COMPONENTS) {
      const s = src(rel);
      // Match each AnimatePresence opening tag (up to its first `>`), tolerant of
      // attribute order / whitespace / newlines.
      const opens = s.match(/<AnimatePresence\b[^>]*>/g) ?? [];
      expect(
        opens.length,
        `${rel} must use AnimatePresence (the inventory says it animates)`,
      ).toBeGreaterThan(0);
      for (const tag of opens) {
        const flat = tag.replace(/\s+/g, " ");
        expect(
          flat,
          `${rel}: AnimatePresence must be mode="wait" (crossfade out-then-in): ${flat}`,
        ).toMatch(/mode="wait"/);
        expect(
          flat,
          `${rel}: AnimatePresence must carry initial={false} (no animate-from-hidden first paint; M12.11): ${flat}`,
        ).toMatch(/initial=\{false\}/);
      }
    }
  });

  it("inventory: initial={false} first-paint guard — every object `initial={{…}}` on a motion.* sits under an AnimatePresence initial={false}", () => {
    // The M12.11 framer trap: a `motion.*` whose `initial={{opacity:0,…}}` is NOT
    // suppressed by a parent `AnimatePresence initial={false}` ships an
    // SSR-invisible first paint (opacity:0 with JS disabled / before hydration).
    // Both crew motion surfaces wrap their motion.div in exactly one such
    // AnimatePresence — so every object-initial is guarded. Assert the structural
    // pairing: each file with an object initial has a sibling `initial={false}`.
    for (const rel of MOTION_COMPONENTS) {
      const s = src(rel);
      const objectInitials = s.match(/initial=\{\{[^}]*\}\}/g) ?? [];
      if (objectInitials.length === 0) continue; // no object initial → nothing to guard
      expect(
        s,
        `${rel}: an object initial={{…}} exists but no AnimatePresence initial={false} guards it (SSR-invisible first paint; M12.11)`,
      ).toMatch(/<AnimatePresence\b[^>]*initial=\{false\}/);
    }
  });

  it("inventory: section↔section — CrewSectionTransition's motion.div has BOTH animate AND exit (crossfade needs the exit half)", () => {
    const s = src("components/crew/CrewSectionTransition.tsx");
    // Isolate the single motion.div element block.
    const block = s.match(/<motion\.div[\s\S]*?>/);
    expect(block, "CrewSectionTransition must render a motion.div").not.toBeNull();
    const flat = block![0].replace(/\s+/g, " ");
    expect(flat, "section crossfade requires animate=").toMatch(/animate=\{/);
    expect(
      flat,
      'section crossfade requires exit= (mode="wait" plays the exit before the next enter)',
    ).toMatch(/exit=\{/);
    // The crossfade's translateY + token duration/ease are part of the inventory.
    expect(flat, "section crossfade is keyed by sectionId (re-mounts the body on swap)").toMatch(
      /key=\{sectionId\}/,
    );
    expect(s, "section crossfade uses the --duration-normal 0.22s token value").toMatch(/0\.22/);
    expect(s, "section crossfade uses --ease-out-quart cubic-bezier(0.25,1,0.5,1)").toMatch(
      /\[0\.25,\s*1,\s*0\.5,\s*1\]/,
    );
    expect(s, "section crossfade rises 4px (translateY y:4)").toMatch(/y:\s*4/);
  });

  it('inventory: the pass — AnimatePresence initial={false} and NOT mode="wait", so a crossfade overlaps the two bodies', () => {
    const s = src(PASS);
    const opens = s.match(/<AnimatePresence\b[^>]*>/g) ?? [];
    expect(opens, "exactly one AnimatePresence owns the pass body").toHaveLength(1);
    expect(opens[0], "a server-rendered pass never fades in on hydration").toMatch(
      /initial=\{false\}/,
    );
    expect(opens[0], 'mode="wait" would never mount both bodies mid-fade').not.toMatch(/mode=/);
  });

  it("inventory: the pass swap — keyed by the selection (live state kind or the day), reusing transitionTreatment, with an exit", () => {
    const s = src(PASS);
    expect(s, "the live body is keyed by the rendered state kind").toMatch(
      /`live:\$\{renderState\.kind\}`/,
    );
    expect(s, "a selected day has its own key").toMatch(/`day:\$\{selectedDay\.iso\}`/);
    expect(s, "the presence child is keyed by that body key").toMatch(
      /key=\{reduced \? "pass" : bodyKey\}/,
    );
    expect(s, "the pass reuses the §8.2 transitionTreatment 66-pair table").toMatch(
      /transitionTreatment/,
    );
    expect(s, "a live-state swap fades only when the table says crossfade").toMatch(
      /treatment === "crossfade-body"/,
    );
    expect(s, "the body variants carry an exit to opacity 0").toMatch(
      /gone: \(fade: boolean\) => \(\{\s*opacity: 0/,
    );
  });

  it("inventory: the pass × reduced-motion — the presence key holds still and no swap fades, in one tree shape", () => {
    const s = src(PASS);
    expect(s).toMatch(/usePrefersReducedMotion/);
    expect(s, "reduced motion: no swap fades").toMatch(/reduced \? false : fade/);
    expect(s, "and the presence key never changes, so one body swaps in place").toMatch(
      /key=\{reduced \? "pass" : bodyKey\}/,
    );
    expect(s.match(/<AnimatePresence\b/g) ?? [], "no reduced-motion fork of the tree").toHaveLength(
      1,
    );
  });

  it('inventory: the run card — one AnimatePresence initial={false}, NOT mode="wait", keyed by the day, with an exit', () => {
    const s = src(RUN_CARD);
    const opens = s.match(/<AnimatePresence\b[^>]*>/g) ?? [];
    expect(opens, "exactly one AnimatePresence owns the run card's rows").toHaveLength(1);
    expect(opens[0], "a server-rendered card never fades in on hydration").toMatch(
      /initial=\{false\}/,
    );
    expect(opens[0], 'mode="wait" would never mount both days mid-fade').not.toMatch(/mode=/);
    expect(s, "the presence child is keyed by the shown day").toMatch(
      /key=\{reduced \? "run" : day\.iso\}/,
    );
    expect(s, "the body variants carry an exit to opacity 0").toMatch(
      /gone: \(fade: boolean\) => \(\{\s*opacity: 0/,
    );
  });

  it("inventory: the run card × reduced-motion — the presence key holds still and no swap fades", () => {
    const s = src(RUN_CARD);
    expect(s).toMatch(/usePrefersReducedMotion/);
    expect(s, "reduced motion: no swap fades").toMatch(/reduced \? false : fade/);
    expect(s.match(/<AnimatePresence\b/g) ?? [], "no reduced-motion fork of the tree").toHaveLength(
      1,
    );
  });

  it("inventory: any × reduced-motion — the section crossfade collapses the duration to 0 via prefersReducedMotion (token, not a tree-shape branch)", () => {
    for (const rel of CROSSFADE_COMPONENTS) {
      const s = src(rel);
      expect(s, `${rel} must consume the shared usePrefersReducedMotion hook`).toMatch(
        /usePrefersReducedMotion/,
      );
      // The reduced-motion path collapses DURATION (a ternary on the preference),
      // never forks the returned JSX shape (M12.11 SSR↔client remount hazard).
      expect(
        s,
        `${rel}: reduced motion must collapse duration to 0 (prefersReducedMotion ? 0 : …)`,
      ).toMatch(/prefersReducedMotion\s*(?:===\s*true\s*)?\?\s*0/);
    }
  });
});

describe("§4.10 transition audit — section sheet (crew page redesign spec §7)", () => {
  it("sheet closed↔open: one AnimatePresence initial={false}; the panel slides and the scrim fades, with an exit on both", () => {
    const s = src("components/crew/CrewSectionSheet.tsx");
    const opens = s.match(/<AnimatePresence\b[^>]*>/g) ?? [];
    expect(opens, "exactly one AnimatePresence owns the sheet's presence").toHaveLength(1);
    expect(opens[0], "a server-rendered open sheet never slides in on hydration").toMatch(
      /initial=\{false\}/,
    );
    expect(s, "the panel slides up from the bottom edge").toMatch(
      /initial=\{\{\s*y:\s*"100%"\s*\}\}/,
    );
    expect(s, "every close runs the same exit, back down").toMatch(
      /exit=\{\{\s*y:\s*"100%"\s*\}\}/,
    );
    expect(s, "the scrim fades in").toMatch(/initial=\{\{\s*opacity:\s*0\s*\}\}/);
    expect(s, "and back out").toMatch(/exit=\{\{\s*opacity:\s*0\s*\}\}/);
  });

  it("sheet: --duration-normal on --ease-out-quart, instant under reduced motion; the spring-back reads --duration-fast", () => {
    const s = src("components/crew/CrewSectionSheet.tsx");
    expect(s, "slide at the --duration-normal 0.22s token value").toMatch(
      /SHEET_SLIDE = \{ duration: 0\.22, ease: \[0\.25, 1, 0\.5, 1\] \}/,
    );
    expect(s, "reduced motion: a 0 duration, not a different tree").toMatch(
      /SHEET_INSTANT = \{ duration: 0 \}/,
    );
    expect(s).toMatch(/reduced \? SHEET_INSTANT : SHEET_SLIDE/);
    expect(s, "spring-back uses the --duration-fast token").toMatch(
      /transform var\(--duration-fast\) var\(--ease-out-quart\)/,
    );
  });
});

describe("§4.10 transition audit — instant-by-design rows", () => {
  it("tab active↔inactive / Budget-tab presence / KeyTimesStrip presence / Gear emphasis carry NO framer (server render or CSS-only)", () => {
    for (const rel of INSTANT_BY_DESIGN) {
      const s = src(rel);
      expect(s, `${rel} must NOT import a client motion library (instant by design)`).not.toMatch(
        /framer-motion|motion\/react/,
      );
      expect(s, `${rel} must NOT use AnimatePresence (instant by design)`).not.toMatch(
        /AnimatePresence/,
      );
      // Catch a JSX <motion.*> element specifically (not the word "motion" in prose).
      expect(s, `${rel} must NOT render a <motion.*> element (instant by design)`).not.toMatch(
        /<motion\./,
      );
    }
  });

  it("wide nav item active↔inactive is a CSS-only colour transition, and the accent bar is ONE element that moves (duration-fast / ease-out-quart)", () => {
    const s = src("components/crew/CrewWideNav.tsx");
    expect(s, "item colour transition uses the --duration-fast token").toMatch(/duration-fast/);
    expect(s, "and --ease-out-quart").toMatch(/ease-out-quart/);
    expect(s, "the accent bar is the accent colour").toMatch(/bg-accent/);
    // One indicator rendered outside the item map, so it moves rather than
    // teleporting with a per-item conditional render.
    expect(s.match(/data-testid="crew-wide-nav-indicator"/g) ?? []).toHaveLength(1);
    expect(s, "the bar slides by transform").toMatch(/transition-\[transform,height\]/);
  });

  it("wide nav: the accent bar turns its transition on after its first measure, even when effects run twice", () => {
    // Placement is instant and every later move slides. React runs a mount
    // effect twice in development (StrictMode), and a hydrated page reaches the
    // nav that way; a transition switch that only the FIRST run can schedule is
    // cancelled by the second run's cleanup and never turns on (crew page
    // redesign plan Task 8: a seeded crew clock made the page hydrate cleanly,
    // which is how the wide-nav e2e case found it).
    const frames = new Map<number, FrameRequestCallback>();
    let next = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.set(++next, cb);
      return next;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 10,
      bottom: 54,
      height: 44,
      left: 0,
      right: 240,
      width: 240,
      x: 0,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect);
    render(
      <StrictMode>
        <CrewWideNav
          items={[
            { id: "today", label: "Today" },
            { id: "venue", label: "Venue" },
          ]}
          active="today"
          hrefFor={() => "#"}
        />
      </StrictMode>,
    );
    try {
      const indicator = () => screen.getByTestId("crew-wide-nav-indicator");
      // PREMISE: the bar mounts placed, without its transition.
      expect(indicator().className).not.toMatch(/duration-fast/);
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        for (const frame of pending) frame(0);
      });
      expect(indicator().className).toMatch(/duration-fast/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("components/crew/** has motion ONLY in the inventory surfaces (no stray animation crept into an instant section)", () => {
    // Class-sweep: walk the whole crew subtree and assert the ONLY files importing
    // framer-motion are the two inventory surfaces. A new <motion.*> in any section
    // primitive would be an undocumented animation (a §4.10 violation).
    const out = execSync("grep -rlE 'framer-motion|motion/react' components/crew/ || true", {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    const files = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    expect(files, "exactly the inventory surfaces may import a motion library").toEqual(
      [...MOTION_COMPONENTS].sort(),
    );
  });
});

// ── Render-shape (jsdom): the M12.11 never-branch-the-tree-shape contract. ──
//
// We mock the shared hook so we can drive both preference values WITHOUT a real
// matchMedia. The wrapper element must render in BOTH cases (shape is invariant);
// only the duration the motion.div carries changes.
describe("§4.10 transition audit — CrewSectionTransition render shape (jsdom)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/a11y/usePrefersReducedMotion");
  });

  async function renderWith(reduced: boolean | null) {
    vi.resetModules();
    vi.doMock("@/lib/a11y/usePrefersReducedMotion", () => ({
      usePrefersReducedMotion: () => reduced,
    }));
    const { CrewSectionTransition } = await import("@/components/crew/CrewSectionTransition");
    return render(
      <CrewSectionTransition sectionId="today">
        <div data-testid="child-body">body</div>
      </CrewSectionTransition>,
    );
  }

  it("reduced-motion=true: the wrapper is STILL rendered (never branch tree SHAPE on the preference; M12.11)", async () => {
    await renderWith(true);
    const wrapper = screen.getByTestId("crew-section-transition");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("data-reduced-motion", "true");
    // The child still mounts inside the wrapper (no fragment fork).
    expect(screen.getByTestId("child-body")).toBeInTheDocument();
  });

  it("reduced-motion=false: the wrapper renders and reports motion-enabled (data-reduced-motion=false)", async () => {
    await renderWith(false);
    const wrapper = screen.getByTestId("crew-section-transition");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveAttribute("data-reduced-motion", "false");
    expect(screen.getByTestId("child-body")).toBeInTheDocument();
  });

  it("reduced-motion=null (SSR / first client render): wrapper STILL renders (shape invariant), treated as motion-enabled", async () => {
    await renderWith(null);
    const wrapper = screen.getByTestId("crew-section-transition");
    expect(wrapper).toBeInTheDocument();
    // null is the pre-mount "unknown" → animate at full duration; the data hook
    // mirrors a falsy preference here ("false") per the component's ternary.
    expect(wrapper).toHaveAttribute("data-reduced-motion", "false");
  });
});

// ── CrewSectionTransition smoke (moved from the retired sub-nav suite): the
// wrapper and its children render, and a new sectionId swaps the keyed body. ──
describe("§4.10 transition audit — CrewSectionTransition swaps the keyed body", () => {
  it("renders the keyed wrapper + children and swaps to the new section body", async () => {
    vi.resetModules();
    vi.doUnmock("@/components/crew/CrewSectionTransition");
    const { CrewSectionTransition } = await import("@/components/crew/CrewSectionTransition");
    const { rerender } = render(
      <CrewSectionTransition sectionId="schedule">
        <h2>Schedule body</h2>
      </CrewSectionTransition>,
    );
    expect(screen.getByTestId("crew-section-transition")).toBeInTheDocument();
    expect(screen.getByText("Schedule body")).toBeInTheDocument();
    // AnimatePresence mode="wait": the old body exits, the new keyed body enters.
    rerender(
      <CrewSectionTransition sectionId="venue">
        <h2>Venue body</h2>
      </CrewSectionTransition>,
    );
    expect(await screen.findByText("Venue body")).toBeInTheDocument();
    expect(screen.queryByText("Schedule body")).toBeNull();
  });
});

// ── Compound: the sheet body's crossfade key is the OPEN section. The §7
// compound row: a `router.refresh()`-style re-render (same open section, new
// sectionNodes) must NOT re-key, so the body updates in place WITHOUT a
// spurious crossfade. We mock CrewSectionTransition to a passthrough that
// surfaces `sectionId` as data-section-id (the value that drives its key), and
// mock next/navigation for the controller's client hooks (no matchMedia in
// jsdom: the controller runs compact). ──
describe("§4.10 transition audit — CrewSections drives the sheet's crossfade key (compound)", () => {
  const nav = vi.hoisted(() => ({
    pathname: "/show/x/tok",
    searchParams: new URLSearchParams(),
  }));

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
      usePathname: () => nav.pathname,
      useSearchParams: () => nav.searchParams,
    }));
    History.prototype.replaceState.call(window.history, null, "", nav.pathname);
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.doMock("@/components/crew/CrewSectionTransition", () => ({
      CrewSectionTransition: ({
        sectionId,
        children,
      }: {
        sectionId: string;
        children: React.ReactNode;
      }) => (
        // data-section-id mirrors the value the real component feeds to its
        // motion.div `key={sectionId}`. If this changes, the body re-mounts
        // (re-animates); if it stays the same, the body updates in place.
        <div data-testid="crew-section-transition" data-section-id={sectionId}>
          {children}
        </div>
      ),
    }));
  });

  afterEach(() => {
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/components/crew/CrewSectionTransition");
    vi.restoreAllMocks();
  });

  const SECTIONS = [{ id: "venue" as const, label: "Venue", peek: null }];

  function nodes(venueLabel: string) {
    return {
      today: <div data-testid="body-today">today</div>,
      venue: <div data-testid="body-venue">{venueLabel}</div>,
    };
  }

  it("opening a section mounts its body under that section's crossfade key", async () => {
    const { CrewSections } = await import("@/components/crew/CrewSections");
    render(<CrewSections initialSection="today" sections={SECTIONS} sectionNodes={nodes("v1")} />);
    // The home's Today block is not a crossfade surface; nothing is keyed yet.
    expect(screen.queryByTestId("crew-section-transition")).toBeNull();

    screen
      .getByTestId("crew-all-sections")
      .querySelector<HTMLElement>('[data-section="venue"]')!
      .click();
    expect(await screen.findByTestId("body-venue")).toBeInTheDocument();
    expect(screen.getByTestId("crew-section-transition")).toHaveAttribute(
      "data-section-id",
      "venue",
    );
  });

  it("compound: a freshness re-render (same open section, new sectionNodes) does NOT re-key (no spurious crossfade)", async () => {
    const { CrewSections } = await import("@/components/crew/CrewSections");
    const { rerender } = render(
      <CrewSections initialSection="venue" sections={SECTIONS} sectionNodes={nodes("venue v1")} />,
    );
    expect(screen.getByTestId("crew-section-transition")).toHaveAttribute(
      "data-section-id",
      "venue",
    );
    expect(screen.getByText("venue v1")).toBeInTheDocument();

    // router.refresh()-style: same open section, the server re-rendered the body fresh.
    rerender(
      <CrewSections initialSection="venue" sections={SECTIONS} sectionNodes={nodes("venue v2")} />,
    );
    // The key is UNCHANGED (no re-animate) AND the fresh content is shown.
    expect(screen.getByTestId("crew-section-transition")).toHaveAttribute(
      "data-section-id",
      "venue",
    );
    expect(screen.getByText("venue v2")).toBeInTheDocument();
  });
});
