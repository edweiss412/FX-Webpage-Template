/**
 * Help copy may not promise that a held member's prior DETAILS stay in effect.
 *
 * BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE changed what a hold preserves. It
 * freezes the member's IDENTITY -- their name and email -- while an admin
 * decides; everything else keeps following the sheet and the operator's own
 * edits. Two shipped pages promised the whole row, which is the freeze the arc
 * deliberately removed, so the copy became wrong in the direction that matters.
 *
 * WALKED, NOT LISTED, and modelled on `tests/help/sheetChangesCopy.test.ts`,
 * which is the same shape and the same failure mode: that guard was written
 * against two named pages and a THIRD page turned out to carry the stale
 * wording, so it now walks every `.mdx`. A new or renamed help page is covered
 * here by default rather than silently exempt.
 *
 * THE POSITIVE ASSERTION HAS ITS OWN ESCAPES, and both are closed. Wording that
 * survives only inside a comment is not live copy, so comments are stripped
 * before the positive match; and a correct opening clause followed by a
 * contradictory continuation would satisfy a prefix check, so the assertion
 * spans the complete sentence through its terminating punctuation.
 *
 * Spec: docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md §6
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

const HELP_ROOT = "app/help";

/** Every help page, walked. */
const helpPages: Array<[string, string]> = readdirSync(HELP_ROOT, { recursive: true })
  .map(String)
  .filter((p) => p.endsWith(".mdx"))
  .map((p) => [join(HELP_ROOT, p), readFileSync(join(HELP_ROOT, p), "utf8")]);

/** Bold markers removed, so `**prior details**` cannot dodge the phrase check. */
const unbold = (text: string) => text.replaceAll("**", "");

/**
 * Comments are removed through the shared module, which routes `.mdx` to its
 * MDX stripper. This file previously hand-rolled that, which the single-source
 * walker at tests/cross-cutting/_metaStripCommentsSingleSource.test.ts correctly
 * refused: the stripping here is incidental plumbing, not the subject of any
 * assertion, so it has no business being local.
 */
const stripped = (path: string, text: string) => stripCommentsForFile(text, path);

/** The complete replacement sentence, through its terminating punctuation. */
const IDENTITY_SENTENCE =
  "prior identity stays in effect; their other details keep following the sheet and your edits.";

const PRIMARY_PAGES = [
  "app/help/admin/review-queues/page.mdx",
  "app/help/admin/per-show-panel/page.mdx",
];

describe("help copy says a hold freezes identity, not the whole row", () => {
  it("finds the help pages it claims to walk", () => {
    // Guards the guard: a walk that matched nothing would make both assertions
    // below vacuously true.
    expect(helpPages.length).toBeGreaterThan(5);
    for (const page of PRIMARY_PAGES) {
      expect(
        helpPages.map(([path]) => path),
        `${page} must be among the walked pages`,
      ).toContain(page);
    }
  });

  it("keeps the corpus inside what the shared MDX stripper actually covers", () => {
    // stripMdxComments removes JSX block comments and DELIBERATELY keeps line
    // comments, because a bare `//` in MDX is a URL far more often than a
    // comment. It does not strip HTML `<!-- -->` either. Zero help pages use
    // that syntax today, and this pins it: if one ever did, a commented-out
    // identity sentence would satisfy the positive assertion below while
    // nobody could read it on the page.
    for (const [path, text] of helpPages) {
      expect(
        text,
        `${path} uses a comment syntax the shared stripper leaves in place`,
      ).not.toContain("<!" + "--");
    }
  });

  it("lets NO help page promise that a held member's prior DETAILS stay in effect", () => {
    for (const [path, text] of helpPages) {
      expect(unbold(text), `whole-row freeze promised in ${path}`).not.toMatch(
        /prior details stay in effect/i,
      );
    }
  });

  it("has both primary pages carry the identity wording, in live copy and in full", () => {
    for (const page of PRIMARY_PAGES) {
      const text = helpPages.find(([path]) => path === page)?.[1] ?? "";
      expect(
        unbold(stripped(page, text)),
        `${page} must carry the complete identity sentence in live copy`,
      ).toContain(IDENTITY_SENTENCE);
    }
  });
});
