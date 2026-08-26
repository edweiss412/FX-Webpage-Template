/**
 * Non-interactive chrome that shares a frame with a control.
 *
 * WHY THIS EXISTS. The 2026-08-16 swap moved 21 CONTROLS to `border-text-faint`
 * and DESIGN §1.2a keeps `--color-border-strong` for non-interactive chrome, so
 * two elements that shared a recipe with a swapped control correctly stayed
 * put — and became the quieter half of a pair a reader sees in one glance. The
 * lightbox's demote chip sits in the same frame as its Reset chip; the
 * staged-preview banner's `aria-current` chip sits in a row of picker links
 * that moved. `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` filed it.
 *
 * IT IS HIERARCHY, NOT ACCESSIBILITY. Neither element is interactive, so SC
 * 1.4.11 does not reach either one and there is no contrast failure here to
 * argue about (`BACKLOG.md`, the row's own text). What was wrong is that the
 * chip a reader is meant to read as the CURRENT state read lighter than the
 * control beside it, which inverts the hierarchy the swap was making.
 *
 * The rule this arc added to §1.2a (design doc
 * 2026-08-25-ui-polish-class-sweep-design.md, D3): chrome rendered in-frame
 * with a control of the same recipe takes that control's outline weight. A RULE
 * rather than two judgments, because a per-site call closes neither site and
 * says nothing about the third one.
 *
 * WHAT THIS GUARD ACTUALLY PINS, which is the pair and not the token. The
 * chrome side is a literal; the CONTROL side is read out of the live tree. So
 * if the twin control's outline moves again — to a plate token, back to
 * border-strong, anywhere — this reds, and it reds naming a pair rather than a
 * colour. Asserting a hardcoded token on both sides would pass happily on a
 * pair that had drifted apart in some other direction.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

import { premiseHolds } from "../_shared/premise";

const ROOT = process.cwd();

type Pair = {
  /** The non-interactive chrome. */
  readonly chrome: { readonly file: string; readonly anchor: string; readonly window: number };
  /** The control it renders WITH, whose weight it now takes. */
  readonly control: { readonly file: string; readonly anchor: string; readonly window: number };
  /** What makes them one frame to a reader. Never blank. */
  readonly sharedFrame: string;
};

const PAIRS: readonly Pair[] = [
  {
    chrome: {
      file: "components/diagrams/GalleryLightbox.tsx",
      anchor: 'data-testid="lightbox-demote-chip"',
      // Wide enough to clear the source comment between the testid and the
      // className; the comment is stripped, its LINES still have to be spanned.
      window: 12,
    },
    control: {
      file: "components/diagrams/GalleryLightbox.tsx",
      anchor: 'aria-label="Reset zoom"',
      window: 3,
    },
    sharedFrame:
      "same rounded-pill bg-surface-raised recipe, absolutely positioned in the same viewport — Reset owns top-2, the demote chip owns bottom-2, and both can be up at once because a demote leaves the gesture alone",
  },
  {
    chrome: {
      file: "components/admin/StagedPreviewBanner.tsx",
      anchor: 'data-testid="staged-preview-picker-current"',
      window: 12,
    },
    control: {
      file: "components/admin/StagedPreviewBanner.tsx",
      anchor: 'data-testid="staged-preview-picker-link"',
      window: 4,
    },
    sharedFrame:
      "the same TARGET_BASE recipe, rendered side by side in one picker row — the current entry and the entries you can switch to",
  },
];

/**
 * Every `border-<token>` an element PAINTS in its window, minus the bare
 * `border` width utility.
 *
 * Comments are stripped first, and that is load-bearing rather than tidy: the
 * source comment beside each of these elements explains which token it moved
 * FROM, so a reader-facing sentence would otherwise be read as a second painted
 * outline and the pair would look mismatched. A comment is not a class.
 */
function outlineTokens(file: string, anchor: string, window: number): string[] {
  // ONE line-space. The anchor is found in the STRIPPED text and the window is
  // sliced from it, so there is no assumption that stripping preserves line
  // numbering — and an anchor that only appears inside a comment correctly
  // fails the premise instead of pointing the window at prose.
  const stripped = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file).split("\n");
  const at = stripped.findIndex((l) => l.includes(anchor));
  premiseHolds(`the anchor ${anchor} is still in ${file} (outside comments)`, at >= 0);
  // Comments come off through the shared single source, which parses the file
  // with the TypeScript scanner rather than matching markers. The hand-rolled
  // version this replaces had to strip line comments PER LINE before the join,
  // because stripping after it deleted everything past the first `//` in the
  // whole window — including the className two lines below. Parsing does not
  // have that failure mode, and `tests/cross-cutting/_metaStripCommentsSingleSource`
  // requires the single source anyway.
  const text = stripped.slice(at, at + window).join(" ");
  return [...new Set([...text.matchAll(/\bborder-([a-z][a-z0-9-]*)\b/g)].map((m) => m[1]!))].sort();
}

describe("chrome in a frame with a control takes that control's outline weight", () => {
  it.each(PAIRS.map((p) => [p.chrome.anchor, p] as const))(
    "%s matches the control it renders with",
    (_label, pair) => {
      const chrome = outlineTokens(pair.chrome.file, pair.chrome.anchor, pair.chrome.window);
      const control = outlineTokens(pair.control.file, pair.control.anchor, pair.control.window);
      // Both sides must actually HAVE an outline, or "they match" is a claim
      // about two empty lists.
      premiseHolds(`the chrome at ${pair.chrome.anchor} paints an outline`, chrome.length > 0);
      premiseHolds(`the control at ${pair.control.anchor} paints an outline`, control.length > 0);
      expect(chrome).toEqual(control);
    },
  );

  it("gives every pair a stated reason the two read as one frame", () => {
    expect(PAIRS.filter((p) => p.sharedFrame.trim().length < 40)).toEqual([]);
  });

  /**
   * The rule, not just its two instances.
   *
   * A guard over two literals stays green when someone adds a third pair, and a
   * rule nobody can find is a rule nobody applies. `DESIGN.md` is where a
   * contributor looks, so the clause has to be there.
   */
  it("states the pairing clause in DESIGN.md §1.2a", () => {
    // Whitespace-collapsed: prettier reflows DESIGN.md at ~80 columns, so where
    // the sentence wraps is a property of the formatter, not of the rule.
    const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(design).toContain("chrome rendered in-frame with a control of the same recipe");
  });
});
