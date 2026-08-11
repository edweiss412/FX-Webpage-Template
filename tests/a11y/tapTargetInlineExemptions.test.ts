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
// commented out, or parked next to a different control in the same file.

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
};

const SITES: readonly Site[] = [
  {
    name: 'RevokeRowButton "Refresh"',
    file: "app/admin/settings/admins/RevokeRowButton.tsx",
    testidSource: 'data-testid="admin-allowlist-couldnt-confirm-refresh"',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  },
  {
    name: 'RoleRecognizeControl "Change what they see"',
    file: "components/admin/RoleRecognizeControl.tsx",
    testidSource: 'data-testid={tid("role-recognize-change")}',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
  },
  {
    name: 'ReportModal "Start a new report anyway"',
    file: "components/shared/ReportModal.tsx",
    testidSource: 'data-testid="report-modal-start-fresh"',
    tagOpen: "<button",
    pinnedClassName:
      "font-medium text-accent-on-bg underline underline-offset-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken",
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
});
