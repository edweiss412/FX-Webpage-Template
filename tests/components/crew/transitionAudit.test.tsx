// @vitest-environment jsdom
/**
 * tests/components/crew/transitionAudit.test.tsx — crew-redesign §4.10 transition
 * audit (Phase 4 Task 2, "test 14"). The STRUCTURAL half of the audit: a static
 * source enumeration + a jsdom render-shape pass. The COMPOUND, real-browser half
 * (opacity sampling, theme-toggle-during-nav, hero re-mount) lives in
 * tests/e2e/crew-page.spec.ts (mobile-safari, `-g "transition"`), because jsdom
 * computes no layout and never advances framer's rAF-driven keyframes.
 *
 * The §4.10 inventory this file pins (each row → a named test):
 *
 *   | section ↔ section          | ONE uniform CrewSectionTransition crossfade +   |
 *   |                            | 4px translateY, --duration-normal(220ms) /      |
 *   |                            | --ease-out-quart; initial={false} first paint;  |
 *   |                            | reduced-motion → 0ms (duration token only).     |
 *   | RightNow hero 12-state swap| AnimatePresence mode="wait" initial={false};    |
 *   |                            | reuses transitionTreatment + the 66-pair table. |
 *   | tab active ↔ inactive      | CSS-only colour transition (desktop accent      |
 *   |                            | border / mobile accent fill), --duration-fast / |
 *   |                            | --ease-out-quart; 0ms under reduced-motion. NO  |
 *   |                            | framer here.                                    |
 *   | Budget tab appears↔absent  | INSTANT — server render, NO animation wrapper   |
 *   | KeyTimesStrip present↔omit | INSTANT — server render, NO animation wrapper   |
 *   | Gear emphasis              | INSTANT — static data-emphasis attribute        |
 *   | any × reduced-motion       | all motion via duration tokens → collapses 0ms  |
 *   | initial={false} EVERYWHERE | no animating-from-hidden SSR (M12.11 framer trap)|
 *
 * Compound rows (theme-toggle-during-nav; hero-state-change mid section-swap;
 * re-enter Today) are exercised in the real browser — see the e2e suite.
 */
import "@testing-library/jest-dom/vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// The ONLY two crew components that carry a client motion library. Everything
// else under components/crew/** must be motion-free (instant by design).
const MOTION_COMPONENTS = [
  "components/crew/CrewSectionTransition.tsx",
  "components/crew/RightNowHero.tsx",
] as const;

// Instant-by-design surfaces (server-rendered or static-attribute): an
// AnimatePresence / <motion.*> here is a BUG (§4.10 "INSTANT" rows).
const INSTANT_BY_DESIGN = [
  "components/crew/CrewSubNav.tsx", // tab active↔inactive is CSS-only; Budget tab presence is server-driven
  "components/crew/primitives/KeyTimesStrip.tsx", // present↔omitted is server render
  "components/crew/sections/GearSection.tsx", // emphasis is a static data-emphasis attr
] as const;

afterEach(cleanup);

describe("§4.10 transition audit — static enumeration", () => {
  it('inventory: section↔section + hero swap — every AnimatePresence carries mode="wait" AND initial={false}', () => {
    for (const rel of MOTION_COMPONENTS) {
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

  it("inventory: RightNow hero swap — the body motion.div has animate AND exit, keyed by renderState.kind, and reuses transitionTreatment", () => {
    const s = src("components/crew/RightNowHero.tsx");
    expect(s, "hero body is keyed by renderState.kind (12-state swap)").toMatch(
      /key=\{renderState\.kind\}/,
    );
    expect(s, "hero reuses the §8.2 transitionTreatment 66-pair table").toMatch(
      /transitionTreatment/,
    );
    // The crossfade branch (treatment === "crossfade-body") supplies animate + exit.
    expect(s, "hero crossfade branch supplies animate").toMatch(
      /animate:\s*\{\s*opacity:\s*1\s*\}/,
    );
    expect(s, "hero crossfade branch supplies exit").toMatch(/exit:\s*\{\s*opacity:\s*0\s*\}/);
  });

  it("inventory: any × reduced-motion — both motion surfaces collapse the duration to 0 via prefersReducedMotion (token, not a tree-shape branch)", () => {
    for (const rel of MOTION_COMPONENTS) {
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

  it("tab active↔inactive is a CSS-only colour transition (duration-fast / ease-out-quart token), no JS branch", () => {
    const s = src("components/crew/CrewSubNav.tsx");
    expect(s, "tab colour transition uses the --duration-fast token").toMatch(/duration-fast/);
    expect(s, "tab colour transition uses --ease-out-quart").toMatch(/ease-out-quart/);
    expect(s, "active tab carries the accent (desktop border / mobile fill)").toMatch(
      /border-accent|text-accent/,
    );
  });

  it("components/crew/** has motion ONLY in the two inventory surfaces (no stray animation crept into an instant section)", () => {
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
    expect(files, "exactly the two inventory surfaces may import a motion library").toEqual(
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
