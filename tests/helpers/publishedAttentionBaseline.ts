/**
 * tests/helpers/publishedAttentionBaseline.ts
 * (wizard-review-attention-menu spec §12.19a — Task 1)
 *
 * Paths of the committed published-modal byte baselines, relative to the repo
 * root. They are the published twins of `STEP3_BASELINE_FIXTURE_PATH`: captured
 * from the PRE-change tree so that "the attention pill and its menu are
 * byte-identical without the new warningIndex prop" is a fact on disk rather
 * than a claim in a commit message.
 */

/** The published modal's whole header: pill cluster, menu mount point, close
 *  button. Same grain as the Step 3 header baseline. */
export const PUBLISHED_ATTENTION_PILL_FIXTURE_PATH =
  "tests/components/admin/showpage/__fixtures__/published-attention-pill-baseline.html";

/** The open `AttentionMenu` panel, rendered standalone. */
export const PUBLISHED_ATTENTION_MENU_FIXTURE_PATH =
  "tests/components/admin/showpage/__fixtures__/published-attention-menu-baseline.html";
