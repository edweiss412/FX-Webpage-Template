// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/warningsPanelTransitions.test.tsx
 * (plan Task 8; spec §7 Transition Inventory, §12 test 10)
 *
 * Two jobs.
 *
 * 1. THE AUDIT. The published panel body has four states, and every conditional
 *    block that selects among them is enumerated in the plan as an expected
 *    inventory. The audit asserts the DISCOVERED set equals that table, because
 *    totality over a discovered domain cannot detect a DELETED branch: the
 *    branch simply leaves the domain and the assertion still passes.
 *
 * 2. THE TRANSITIONS. All six unordered pairs are exercised as real rerenders,
 *    asserting the SOURCE state, rerendering, then asserting the DESTINATION.
 *    Destination-only assertions let an invalid or behaviourally equivalent
 *    source fixture collapse six transitions into six repeats of one render.
 *
 * Every pair is instant by design (each is reached only through a server round
 * trip that re-renders the panel wholesale from new props), so the audit's job
 * is to prove nothing animates rather than to prove an animation is correct.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ParseWarning } from "@/lib/parser/types";
import {
  FIXTURE_DRIVE_FILE_ID,
  FIXTURE_SLUG,
  INFO_WARNINGS,
  MAPPED_WARNINGS,
  UNMAPPED_WARNINGS,
  fixtureSnapshot,
} from "@/tests/helpers/warningSurfaceFixture";

afterEach(cleanup);

const PANEL = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-breakdown-warnings`;
const ELSEWHERE = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-elsewhere`;
const CLEAN = `wizard-step3-card-${FIXTURE_DRIVE_FILE_ID}-warnings-clean`;

/* ─────────────────────────── 1. The audit ─────────────────────────── */

describe("transition audit: nothing in the four-state path animates", () => {
  const FILES = [
    "components/admin/wizard/step3ReviewSections.tsx",
    "components/admin/showpage/sectionWarningExtras.tsx",
    "components/admin/PerShowActionableWarnings.tsx",
  ];

  it("no file in the inventory adds an AnimatePresence to this path", () => {
    for (const rel of FILES) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, `${rel} must not introduce AnimatePresence`).not.toContain("AnimatePresence");
    }
  });

  it("the body-empty branch carries no transition or animation utility", () => {
    const src = readFileSync(resolve(process.cwd(), FILES[0]!), "utf8");
    // The four-state region: from the gate read to the end of the empty branch.
    const start = src.indexOf("const routedWarningsRenderElsewhere = chrome?.");
    const end = src.indexOf("No parse warnings for this sheet.");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const region = src.slice(start, end);
    // Whole-diff review B10: the first draft matched only the hyphenated
    // utility prefixes, which misses the bare `transition` class, Tailwind's
    // arbitrary-property form (`transition-[opacity]`, caught by the prefix but
    // worth naming), a `motion.*` element, an inline `style={{ transition }}` /
    // `animation`, and a CSS custom property driving either. Each alternative
    // below is a way this region could animate while the previous assertion
    // still passed.
    const ANIMATION_TELLS: { name: string; pattern: RegExp }[] = [
      { name: "transition utility", pattern: /\btransition(-|\b)/ },
      { name: "animate utility", pattern: /\banimate-/ },
      { name: "duration utility", pattern: /\bduration-\[?\d/ },
      { name: "framer motion element", pattern: /\bmotion\./ },
      { name: "AnimatePresence", pattern: /AnimatePresence/ },
      { name: "inline transition style", pattern: /transition\s*:/ },
      { name: "inline animation style", pattern: /animation\s*:/ },
      // Round 2: the camelCase style-object forms, which neither the utility
      // prefixes nor the CSS-property patterns above would match.
      { name: "transitionProperty style", pattern: /transitionProperty/ },
      { name: "transitionDuration style", pattern: /transitionDuration/ },
      { name: "animationName style", pattern: /animation[A-Z]/ },
    ];
    for (const { name, pattern } of ANIMATION_TELLS) {
      expect(region, `the four-state region must carry no ${name}`).not.toMatch(pattern);
    }
  });

  it("the branch set in the four-state region is EXACTLY the expected inventory", () => {
    // Whole-diff review B10: the first draft was named "discovered set equals
    // expected" but only checked that three substrings were still present, so an
    // ADDED conditional — a fourth state, an early return, a nested ternary —
    // passed silently. This discovers the region's conditionals and compares the
    // whole set, which is what the name claimed.
    const EXPECTED = [
      "rows.length === 0", // List vs the three body-empty states
      "here > 0", // Silent
      "elsewhere > 0", // Elsewhere
      // The parse-notice banner. NOT part of the four-state selection, but it
      // renders inside this region and is the EXCLUSIVE site for
      // PARSE_ERROR_LAST_GOOD / RESYNC_QUALITY_REGRESSED, which is why the
      // card-suppression predicate has to account for it. The discovery pass
      // surfaced it on its first run; the previous substring version of this
      // test could not have.
      "parseNotes.length > 0",
    ];
    const src = readFileSync(resolve(process.cwd(), FILES[0]!), "utf8");
    const start = src.indexOf("const routedWarningsRenderElsewhere = chrome?.");
    const region = src.slice(start, src.indexOf("No parse warnings for this sheet."));

    const code = region.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    // Every expected condition is still present...
    for (const expr of EXPECTED) {
      expect(code, `branch \`${expr}\` must still exist`).toContain(expr);
    }

    // ...and the region contains NO OTHER branch. Round 2: a presence-only check
    // cannot see an ADDED conditional, and a regex is not a JS parser — pattern
    // matching condition text mis-handles optional chaining and nested
    // ternaries. Counting BRANCH POSITIONS is the honest structural signal: any
    // added ternary, `if`, or `&&` guard moves the total, whether or not its
    // condition is a comparison.
    // `(?<!\?)\?(?![.?])` is a TERNARY `?` specifically: not the second half of
    // `??`, not the first half of `??`, and not `?.`. Without the discrimination
    // the two `?? 0` count reads inflated this to 9.
    const ternaries = (code.match(/(?<!\?)\?(?![.?])/g) ?? []).length;
    const ifs = (code.match(/\bif\s*\(/g) ?? []).length;
    const guards = (code.match(/&&/g) ?? []).length;

    // 5 original ternaries (the gate read, the parse-notes guard,
    // List-vs-empty, Silent, Elsewhere). The polish-era pointer-sentence
    // builder's 5 ternaries + 3 ifs moved OUT of this region when the
    // announcer spec §4 extracted `ElsewherePointerSentence` (its branch
    // behavior — collapsed/expanded/miss/no-callback — is pinned by
    // pointerSentence.test.tsx and the spec §4.3 matrix tests; its render is
    // still instant, §11 precedent). 1 `&&`: the parse-notes null check.
    expect({ ternaries, ifs, guards }, "the region's branch positions").toEqual({
      ternaries: 5,
      ifs: 0,
      guards: 1,
    });

    // And the two lines those branches select, so a branch that survives while
    // its outcome is deleted also fails.
    expect(region).toContain("warnings-elsewhere");
    expect(region).toContain("warnings-clean");
  });

  it("the disclosure's only animated property is its chevron rotation", () => {
    const src = readFileSync(resolve(process.cwd(), FILES[1]!), "utf8");
    const transitions = src.match(/transition-[a-z-]+/g) ?? [];
    // Exactly one animated property in the extras subtree, and it is the
    // chevron transform. The disclosure BODY is instant by design.
    expect(new Set(transitions)).toEqual(new Set(["transition-transform"]));
  });
});

/* ──────────────────── 2. The six transition pairs ──────────────────── */

function buildData(warnings: readonly ParseWarning[]): PublishedSectionData {
  return buildPublishedSectionData(fixtureSnapshot(warnings) as never, { slug: FIXTURE_SLUG });
}

function fingerprintsOf(warnings: readonly ParseWarning[]): Set<string> {
  const fps = warnings.map((w) => warningFingerprint(w)).filter((fp): fp is string => fp !== null);
  expect(fps.length).toBe(warnings.length);
  return new Set(fps);
}

function Harness({
  warnings,
  ignored,
}: {
  warnings: readonly ParseWarning[];
  ignored: readonly ParseWarning[];
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const data = buildData(warnings);
  const bySection = buildSectionWarningModel({
    slug: FIXTURE_SLUG,
    warnings,
    ignoredFingerprints: ignored.length > 0 ? fingerprintsOf(ignored) : new Set<string>(),
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  return (
    <div ref={scrollerRef}>
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        renderSectionExtras={buildSectionWarningExtras({ bySection })}
        routedWarnings={deriveRoutedWarnings(bySection)}
      />
    </div>
  );
}

type StateName = "List" | "Silent" | "Elsewhere" | "Clean";

/** The §3.4 fixture table: which warnings produce which state. */
const FIXTURES: Record<StateName, { warnings: ParseWarning[]; ignored: ParseWarning[] }> = {
  List: {
    warnings: [...INFO_WARNINGS, ...MAPPED_WARNINGS, ...UNMAPPED_WARNINGS],
    ignored: [],
  },
  Silent: { warnings: [...UNMAPPED_WARNINGS], ignored: [] },
  Elsewhere: { warnings: [...MAPPED_WARNINGS], ignored: [] },
  Clean: { warnings: [], ignored: [] },
};

function assertState(name: StateName) {
  const panel = screen.getByTestId(PANEL);
  const rows = within(panel).queryAllByTestId(/warning-\d+$/).length;
  const elsewhere = within(panel).queryByTestId(ELSEWHERE);
  const clean = within(panel).queryByTestId(CLEAN);

  if (name === "List") {
    expect(rows, "List renders the info rows").toBe(INFO_WARNINGS.length);
    expect(elsewhere).toBeNull();
    expect(clean).toBeNull();
  } else if (name === "Silent") {
    expect(rows).toBe(0);
    expect(elsewhere, "Silent renders no line").toBeNull();
    expect(clean).toBeNull();
  } else if (name === "Elsewhere") {
    expect(rows).toBe(0);
    expect(elsewhere).not.toBeNull();
    expect(clean).toBeNull();
  } else {
    expect(rows).toBe(0);
    expect(elsewhere).toBeNull();
    expect(clean).not.toBeNull();
  }
}

const PAIRS: [StateName, StateName][] = [
  ["List", "Silent"],
  ["List", "Elsewhere"],
  ["List", "Clean"],
  ["Silent", "Elsewhere"],
  ["Silent", "Clean"],
  ["Elsewhere", "Clean"],
];

describe("all six transition pairs, source asserted before destination", () => {
  it("covers every unordered pair of the four states", () => {
    // 4 states yield 6 unordered pairs; a dropped row here would silently
    // shrink the matrix.
    expect(PAIRS.length).toBe((4 * 3) / 2);
  });

  it.each(PAIRS)("%s to %s is instant and lands in the destination state", (from, to) => {
    const a = FIXTURES[from];
    const b = FIXTURES[to];

    const { rerender } = render(<Harness warnings={a.warnings} ignored={a.ignored} />);
    // SOURCE first: without this an invalid source fixture makes the pair a
    // repeat of the destination render.
    assertState(from);

    rerender(<Harness warnings={b.warnings} ignored={b.ignored} />);
    assertState(to);
  });
});

/* ─────────────────── 3. The compound transition ─────────────────── */

describe("compound: ignoring the last active warn row with the disclosure open", () => {
  it("keeps the SAME details node, open, when the last active row is ignored", () => {
    // Seed: one already-ignored row (so the disclosure exists) plus one active
    // row (so the body is Silent).
    const active = UNMAPPED_WARNINGS[0]!;
    const alreadyIgnored = UNMAPPED_WARNINGS[1]!;
    const all = [active, alreadyIgnored];

    const { rerender } = render(<Harness warnings={all} ignored={[alreadyIgnored]} />);
    assertState("Silent");

    const details = screen.getByTestId("section-ignored-warnings-warnings") as HTMLDetailsElement;
    details.open = true;
    const beforeCount = within(details).queryAllByTestId("per-show-actionable-item").length;
    expect(beforeCount).toBe(1);

    // Ignore the remaining active row.
    rerender(<Harness warnings={all} ignored={all} />);

    assertState("Clean");
    const after = screen.getByTestId("section-ignored-warnings-warnings") as HTMLDetailsElement;
    // NODE IDENTITY, not just presence: a replacement `<details open>` would
    // satisfy every state assertion above while having destroyed and rebuilt the
    // element the operator was interacting with.
    expect(after, "the disclosure must be the same DOM node").toBe(details);
    expect(after.isConnected).toBe(true);
    expect(after.open, "and must still be open").toBe(true);
    expect(within(after).queryAllByTestId("per-show-actionable-item").length).toBe(beforeCount + 1);
  });
});
