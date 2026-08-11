import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Source-scan guard for the three inline-prose tap-target exemptions ratified
// 2026-08-10 (spec docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md
// §2, authority PRODUCT.md:59). These three controls are DELIBERATELY under the
// 44px floor: each is a link-styled <button> rendered inside a sentence, which
// is the WCAG 2.5.5 inline exception PRODUCT.md:59 carries forward.
//
// Why source-scan and not a browser assertion: an exempt site's contract is
// "unchanged source". A rendered box says nothing about whether the exemption
// is still the ratified decision or an accident nobody recorded. So the guard
// pins the two things a future edit could silently take away — the recorded
// decision (the comment) and the geometry input (the class string) — and it
// reads them from the source that states them.
//
// The failure modes this catches: (1) a corpus sweep re-flags one of these and
// somebody "repairs" it, changing the class string; (2) the exemption comment
// is deleted, so the next sweep re-litigates a settled product decision;
// (3) the comment is defeated in place — emptied, decorated with extra text,
// commented out, or parked next to a different control in the same file;
// (4) the enclosing element stops supplying an inline-prose context, by class
// OR by inline style, which ends the exemption without touching the control.
//
// WHAT THIS GUARD CAN AND CANNOT DECIDE. It reads source, so it can pin the
// source facts at these three positions: the recorded decision, the control's
// class, the enclosing element's class and style, and that the enclosing
// element is a NATIVE tag whose display those two attributes therefore
// determine. It cannot compute rendered display — that would mean resolving
// components, their props, and every ancestor, which is an open class where
// each new spelling reopens the last fix.
//
// So the boundary is drawn where it is decidable: anything that makes the
// premise unverifiable (a component in the enclosing position) FAILS the guard
// rather than passing it. DOCUMENTED LIMIT, accepted: an ancestor further up,
// or a stylesheet rule from outside, could still change `display` on a native
// parent. Out of the threat model — this codebase styles through Tailwind
// utilities on the element itself. The closing move for that residue is a
// real-browser computed-display assertion, which is a different instrument
// than a source scan and is not what spec §2 ratified for exempt sites.

const EXEMPTION_TOKEN = "tap-floor: inline-prose exemption, PRODUCT.md:59 — ratified 2026-08-10";

/** A live, standalone JSX comment line: `{/* … *\/}` and nothing else. */
const JSX_COMMENT_LINE = /^\s*\{\/\*\s*(.*?)\s*\*\/\}\s*$/;

/** How many lines above the control's opening tag the comment may sit. */
const ADJACENCY_LINES = 3;

type Site = {
  /** Label used in test names. */
  readonly name: string;
  readonly file: string;
  /**
   * Unique source text on the control's `data-testid` line. Matched as a raw
   * substring so a computed testid (`tid("…")`) anchors the same way a literal
   * one does.
   */
  readonly testidSource: string;
  /** Opening tag of the control, e.g. `<button`. */
  readonly tagOpen: string;
  /**
   * The control's className literal, copied byte-for-byte from the live tree on
   * 2026-08-10. Pinned, not derived: the point is that it does not move.
   */
  readonly pinnedClassName: string;
  /**
   * The enclosing element's className literal, byte-for-byte from the live tree
   * — the element that supplies the INLINE PROSE CONTEXT, i.e. the sentence the
   * control sits inside.
   *
   * Not redundant with `pinnedClassName`: the exemption is not a property of the
   * button, it is a property of the button being inline within running text.
   * Adding `flex flex-col` here makes the button a flex item, CSS blockifies it,
   * and it stops being an inline-prose target — so `PRODUCT.md:59` stops
   * applying and the 44px floor starts, with the control's own class string
   * untouched. That is exactly why pinning only the control is not enough
   * (whole-diff review r1, finding 1: three parent-class mutants, one per site,
   * all left the earlier version of this guard green).
   */
  readonly parentClassName: string;
};

/** How far above the control the parent's opening tag may sit. */
const PARENT_WINDOW_LINES = 12;

const SITES: readonly Site[] = [
  {
    name: 'RevokeRowButton "Refresh"',
    file: "app/admin/settings/admins/RevokeRowButton.tsx",
    testidSource: 'data-testid="admin-allowlist-couldnt-confirm-refresh"',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    parentClassName: "w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text",
  },
  {
    name: 'RoleRecognizeControl "Change what they see"',
    file: "components/admin/RoleRecognizeControl.tsx",
    testidSource: 'data-testid={tid("role-recognize-change")}',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    parentClassName: "text-xs text-text-subtle",
  },
  {
    name: 'ReportModal "Start a new report anyway"',
    file: "components/shared/ReportModal.tsx",
    testidSource: 'data-testid="report-modal-start-fresh"',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium text-accent-on-bg underline underline-offset-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken",
    parentClassName:
      "mx-4 mt-2 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm text-text-subtle sm:mx-6",
  },
];

function readLines(file: string): string[] {
  return readFileSync(join(process.cwd(), file), "utf8").split("\n");
}

/** Line index (0-based) of the control's `data-testid`; exactly one must exist. */
function testidLine(lines: string[], site: Site): number {
  const hits = lines.flatMap((line, i) => (line.includes(site.testidSource) ? [i] : []));
  expect(
    hits,
    `${site.file}: expected exactly one \`${site.testidSource}\` (the control this exemption is recorded against)`,
  ).toHaveLength(1);
  return hits[0]!;
}

/** Line index of the control's opening tag, walking back from its testid. */
function tagOpenLine(lines: string[], site: Site, fromLine: number): number {
  for (let i = fromLine; i >= 0; i--) {
    if (lines[i]!.includes(site.tagOpen)) return i;
  }
  throw new Error(`${site.file}: no \`${site.tagOpen}\` above line ${fromLine + 1}`);
}

/**
 * Every LIVE exemption-token line in the file. A line qualifies only if it is a
 * standalone JSX comment whose inner text EQUALS the token — so an emptied
 * token, a token with an appended suffix, and a token commented out with `//`
 * all fail to qualify.
 */
function liveTokenLines(lines: string[]): number[] {
  return lines.flatMap((line, i) => {
    const m = JSX_COMMENT_LINE.exec(line);
    return m && m[1] === EXEMPTION_TOKEN ? [i] : [];
  });
}

/**
 * Line index of the element that ENCLOSES the control — the nearest opening tag
 * above it that is not self-contained.
 *
 * Derived, not named: an earlier revision took a text anchor per site, and one
 * of the three anchors (`<span className="text-xs text-text-subtle">`) occurs
 * TWICE in its file, so the guard reported an ambiguity instead of checking
 * anything. A structural walk cannot go stale that way, and it keeps working
 * when the element gains an attribute.
 */
function enclosingOpenTagLine(lines: string[], fromLine: number): number {
  for (let i = fromLine - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!/^\s*<[a-zA-Z]/.test(line)) continue;
    // A tag that also closes on its own line is a SIBLING, not an ancestor.
    if (line.includes("</") || line.includes("/>")) continue;
    return i;
  }
  throw new Error(`no enclosing opening tag above line ${fromLine + 1}`);
}

/** A NATIVE DOM element opening tag (`<p`, `<span`), not a component (`<Foo`). */
function isNativeElement(line: string): boolean {
  return /^\s*<[a-z]/.test(line);
}

/** The `style` prop's source text on/after `from`, if the element carries one. */
function styleAttrIn(lines: string[], from: number, span: number): string | undefined {
  for (let i = from; i < Math.min(from + span, lines.length); i++) {
    const line = lines[i]!;
    // Stop at the end of this element's opening tag so a LATER sibling's style
    // prop is not attributed to it.
    const m = /\sstyle=\{/.exec(line);
    if (m) return line.trim();
    if (/^\s*>\s*$|[^-=!<>]>\s*$/.test(line)) return undefined;
  }
  return undefined;
}

/** The className literal on `anchorLine`, or within the few lines after it. */
function classNameAt(lines: string[], anchorLine: number, span: number): string | undefined {
  for (let i = anchorLine; i < Math.min(anchorLine + span, lines.length); i++) {
    const m = /className="([^"]*)"/.exec(lines[i]!);
    if (m) return m[1];
  }
  return undefined;
}

describe("inline-prose tap-target exemptions (spec §2, PRODUCT.md:59)", () => {
  test.each(SITES.map((s) => [s.name, s] as const))(
    "%s — records the exemption at the control",
    (_name, site) => {
      const lines = readLines(site.file);
      const tagLine = tagOpenLine(lines, site, testidLine(lines, site));
      const tokens = liveTokenLines(lines);

      // Exactly one live token in the file: spraying the token everywhere must
      // not satisfy the adjacency check below.
      expect(
        tokens.map((i) => i + 1),
        `${site.file}: expected exactly one live \`{/* ${EXEMPTION_TOKEN} */}\` comment line`,
      ).toHaveLength(1);

      // …and it must sit immediately above THIS control, not some other
      // interactive element in the same file.
      const distance = tagLine - tokens[0]!;
      expect(
        distance,
        `${site.file}: the exemption comment (line ${tokens[0]! + 1}) must sit within ${ADJACENCY_LINES} lines above the control's \`${site.tagOpen}\` (line ${tagLine + 1})`,
      ).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(ADJACENCY_LINES);
    },
  );

  test.each(SITES.map((s) => [s.name, s] as const))(
    "%s — className is byte-identical to the pinned exempt string",
    (_name, site) => {
      const lines = readLines(site.file);
      const tagLine = tagOpenLine(lines, site, testidLine(lines, site));

      // The opening tag runs from `<button` to the line that closes it.
      const closeAt = lines.findIndex((line, i) => i >= tagLine && /^\s*>?\s*$|>\s*$/.test(line));
      const attrs = lines.slice(tagLine, (closeAt === -1 ? tagLine + 12 : closeAt) + 1);
      const classNameLine = attrs.find((line) => /className="/.test(line));
      expect(classNameLine, `${site.file}: no literal className on the control`).toBeDefined();

      const actual = /className="([^"]*)"/.exec(classNameLine!)?.[1];
      expect(
        actual,
        `${site.file}: this control is an EXEMPT inline-prose target — its class string is pinned. Do not add \`min-h-tap-min\` or any sizing class here; see spec §2.`,
      ).toBe(site.pinnedClassName);
    },
  );

  test.each(SITES.map((s) => [s.name, s] as const))(
    "%s — the enclosing prose context is pinned too",
    (_name, site) => {
      // The exemption is not a property of the button. It is a property of the
      // button being INLINE WITHIN RUNNING TEXT, and that is decided by the
      // element around it. `flex flex-col` on the parent makes the button a flex
      // item, CSS blockifies it, and the inline exception stops applying — with
      // the button's own class string untouched. Pinning the parent is what
      // makes this guard's claim true (whole-diff review r1, finding 1).
      const lines = readLines(site.file);
      const tagLine = tagOpenLine(lines, site, testidLine(lines, site));
      const parentLine = enclosingOpenTagLine(lines, tagLine);

      // FAIL CLOSED when the premise stops being checkable. This guard reasons
      // about a NATIVE element whose class and style it can read; a component
      // (`<InlineProseFlex …>`) can add `flex flex-col` internally while the
      // call-site class stays pinned, and no source scan at this position can
      // see that (review r3, finding 1 — probed at all three sites).
      //
      // The answer is not a bigger recogniser. Chasing it would mean resolving
      // the component, then its props, then ITS parent — an open class, and the
      // next spelling reopens it. Instead the guard refuses the indirection: if
      // the enclosing element is not native, its rendered display is not
      // decidable here, so the guard fails loudly and a human decides. Extract a
      // wrapper and you must come and say so.
      expect(
        isNativeElement(lines[parentLine]!),
        `${site.file}: the element enclosing this exempt control is not a native DOM tag (line ${parentLine + 1}: ${lines[parentLine]!.trim()}). A component can set \`display\` internally while the call-site class stays pinned, so its inline-prose status is not decidable from source here — the PRODUCT.md:59 exemption cannot be verified. Keep a native element, or re-settle the exemption.`,
      ).toBe(true);

      expect(
        tagLine - parentLine,
        `${site.file}: the enclosing element (line ${parentLine + 1}) is further than ${PARENT_WINDOW_LINES} lines above the control (line ${tagLine + 1}) — the structural walk found the wrong ancestor`,
      ).toBeLessThanOrEqual(PARENT_WINDOW_LINES);

      expect(
        classNameAt(lines, parentLine, 4),
        `${site.file}: the enclosing element's class string is pinned. Making it a flex/grid container turns this control into non-inline chrome, which the PRODUCT.md:59 exemption does NOT cover — the 44px floor would then apply.`,
      ).toBe(site.parentClassName);

      // className is not the only way to set `display`. `style={{ display:
      // "flex", flexDirection: "column" }}` blockifies the button exactly the
      // same way, with the pinned class string untouched — review r2, finding 1
      // probed all three sites and the class-only guard stayed green. JSX gives
      // an ordinary author exactly two mechanisms here, and this closes the
      // second: these elements carry NO inline style today, so "none" is the
      // pin. Checked on the CONTROL too, which has the same exposure.
      for (const [what, from] of [
        ["enclosing element", parentLine],
        ["control", tagLine],
      ] as const) {
        expect(
          styleAttrIn(lines, from, 6),
          `${site.file}: the ${what} must carry no inline \`style\` prop — it can set \`display\` without touching the pinned class string, which is the same exemption-breaking edit by another route.`,
        ).toBeUndefined();
      }
    },
  );
});
