/**
 * Non-interactive chrome that shares a frame with a control.
 *
 * WHY THIS EXISTS. The 2026-08-16 swap moved 21 CONTROLS to `border-text-faint`
 * while DESIGN §1.2a kept `--color-border-strong` for non-interactive chrome, so
 * two elements that shared a recipe with a swapped control stayed put and became
 * the quieter half of a pair a reader sees in one glance. The lightbox's demote
 * chip sits in the same frame as its Reset chip; the staged-preview banner's
 * `aria-current` chip sits in a row of picker links that moved.
 * `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` filed it, and that row is CLOSED:
 * archived at `BACKLOG-archive.md:1288` on 2026-08-25, resolved by the pairing
 * clause this file pins, with both chips moved in `e6408222c`. The paragraph
 * above is the state this guard was BUILT for, not the state of the tree.
 *
 * IT IS HIERARCHY, NOT ACCESSIBILITY. Neither element is interactive, so SC
 * 1.4.11 does not reach either one and there was never a contrast failure here
 * to argue about (`BACKLOG-archive.md`, the row's own text). What was wrong is that the
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

  /**
   * The predicate and the tree must agree, and for six days they did not.
   *
   * The clause shipped 2026-08-25 and both chips moved with it, while §1.2a kept
   * a paragraph in the PRESENT TENSE saying they had stayed put and now read
   * lighter. A reader who trusted the section was told the opposite of what the
   * tree does, four lines above the clause that had already settled it.
   *
   * The load-bearing half of this assertion is the POSITIVE one. A negative
   * phrase check goes quiet the moment someone rephrases the stale claim, so
   * what is pinned is that the section RECORDS THE CLOSURE, with the archive
   * anchor that makes it checkable. The negative half catches a straight revert.
   */
  it("records the closure rather than restating the pre-2026-08-25 state", () => {
    const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8").replace(/\s+/g, " ").toLowerCase();
    // Premise: the section this asserts about is actually present. Without it a
    // renamed or deleted §1.2a would satisfy every `not.toContain` below by
    // containing nothing at all.
    premiseHolds(
      "DESIGN.md still carries the did-not-move record the closure attaches to",
      design.includes("what did not move with the 21"),
    );

    expect(
      design,
      "the closure is recorded with its archive anchor, so the record cannot read as open",
    ).toContain("backlog-archive.md:1288");

    for (const stale of ["and now reads lighter beside it", "is now the quieter half"]) {
      expect(design, `§1.2a still asserts the pre-2026-08-25 state: "${stale}"`).not.toContain(
        stale,
      );
    }
  });
});
