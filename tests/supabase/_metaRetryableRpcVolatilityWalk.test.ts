/**
 * The product-tree walker's exclusion guards, split out of `_metaRetryableRpcVolatility.test.ts`.
 *
 * These cases need NO database. Their siblings do: that suite imports `postgres`, asserts a local
 * DB url at module scope, and its catalog arms FAIL rather than skip when the catalog is
 * unreachable — a ratified choice, because a skip would leave the retry set unverified while the
 * suite reported pass.
 *
 * Splitting them is what makes both designs hold at once. `_metaScratchRootCleanup` derives its
 * subject set from "registry suite paths that call mkdtemp" and runs each subject STANDALONE,
 * inheriting the ambient environment. On the `unit-suite-nodb` shard there is no database, so the
 * DB-bearing suite exited 1 before creating a single root, and the guard failed on its PREMISES —
 * "the subject suites ran and passed (exit 1)" and "scratch roots created before the failure. Got
 * 0" — not on a leak. It said so itself: "this is not a claim that the code under test is wrong."
 *
 * So the scratch subject is now a file that can pass anywhere, and the DB-bearing file no longer
 * calls mkdtemp and drops out of the subject set by the derivation's own predicate. No change to
 * the cleanup harness, which belongs to another arc, and no weakening of the fail-not-skip rule.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { premise } from "../_shared/premise";
import { literalsInProductTree } from "./retryableRpcVolatilityScan";

describe("the product-tree walk skips what it claims to skip", () => {
  /**
   * Written because the mutation gate found BOTH of this walker's guards deletable with every
   * test green: flipping `node_modules || dot-dir` to `&&` skips nothing, and removing the
   * `continue` after recursing falls through to the extension test. Neither changed a result,
   * because the real roots (`app`, `lib`, `components` — 262 directories) happen to contain no
   * node_modules, no dot-directory, and no directory named `*.ts`.
   *
   * "Happens to contain none today" is a fact about the tree, not a property of the walker, and
   * an `equivalent` row resting on it would expire the first time someone nests a dependency.
   * A fixture makes the guards observable, so the walker is pinned by construction instead.
   */
  test("node_modules and dot-directories are not descended into", () => {
    const root = mkdtempSync(join(tmpdir(), "walk-fixture-"));
    try {
      // INSIDE the try, not between mkdtemp and it. `premise` throws when its own condition fails,
      // and a throw there left the root created and never removed — the scratch-root guard's
      // "even when a case fails" arm caught exactly that, on this file, in CI.
      premise("fixture directories the walk can descend into", 3, 0);
      mkdirSync(join(root, "node_modules"), { recursive: true });
      mkdirSync(join(root, ".hidden"), { recursive: true });
      writeFileSync(join(root, "kept.ts"), 'const a = "KEPT_LITERAL";\n');
      writeFileSync(join(root, "node_modules", "dep.ts"), 'const b = "NODE_MODULES_LITERAL";\n');
      writeFileSync(join(root, ".hidden", "h.ts"), 'const c = "HIDDEN_LITERAL";\n');

      const found = literalsInProductTree([root]);

      // The premise: the walk reached the fixture at all. Without it, a walker that returned an
      // empty set would satisfy both exclusions vacuously.
      expect(found.has("KEPT_LITERAL")).toBe(true);
      expect(found.has("NODE_MODULES_LITERAL")).toBe(false);
      expect(found.has("HIDDEN_LITERAL")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an .mdx file is walked, because next.config compiles MDX under the product roots", () => {
    // Round 5 probed this: an MDX call to an immutable function returned no literals and no
    // violations while the MDX compiler emitted the call happily. `app/` holds 13 MDX files.
    const root = mkdtempSync(join(tmpdir(), "walk-mdx-"));
    try {
      premise("a fixture root to walk", 1, 0);
      writeFileSync(join(root, "page.mdx"), 'export const x = "MDX_LITERAL";\n');

      expect(literalsInProductTree([root]).has("MDX_LITERAL")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a DIRECTORY whose name ends in .ts is recursed, never read as a file", () => {
    // The `continue` after `walk(full)` is what stops a directory from reaching readFileSync.
    // Remove it and a directory named `x.ts` passes the extension test and throws EISDIR.
    const root = mkdtempSync(join(tmpdir(), "walk-dirts-"));
    try {
      // Same shape as above: anything that can throw after the root exists belongs inside the try.
      premise("a nested .ts-named directory to recurse into", 1, 0);
      mkdirSync(join(root, "nested.ts"), { recursive: true });
      writeFileSync(join(root, "nested.ts", "inner.ts"), 'const d = "INNER_LITERAL";\n');

      const found = literalsInProductTree([root]);

      expect(found.has("INNER_LITERAL")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
