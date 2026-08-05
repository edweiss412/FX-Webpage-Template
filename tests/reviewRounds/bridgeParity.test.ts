import { describe, expect, it } from "vitest";

import { resolveArc as tsResolveArc } from "../../lib/reviewRounds/arc";
// The wrapper runs this copy. Vitest imports the .mjs directly; no build step.
import { resolveArc as jsResolveArc } from "../../scripts/reviewRoundEmit.mjs";
import { arcFixtureCases } from "./_arcFixtures";

/** Every arc-resolution case Task 3 defines, as (name, repo-builder) pairs:
 *  feature branch, subdirectory cwd, reused branch, plain dir, detached HEAD,
 *  on main, no merge base. */
const CASES = arcFixtureCases();

describe("bridge parity: scripts/reviewRoundEmit.mjs vs lib/reviewRounds/arc.ts", () => {
  // Failure caught: the bridge losing a branch of the contract while the
  // TypeScript suite stays green. `on_main` is the sharp case - a bridge that
  // dropped it would write a corpus directory for an arc that does not exist,
  // and no test in Task 3 would notice, because Task 3 never runs the bridge.
  it.each(CASES)("agrees on %s", (_name, build) => {
    const cwd = build();
    const ts = tsResolveArc(cwd);
    // The bridge is plain JS, so its return type is not the discriminated union
    // `ArcResolution`. Reading it as a bag of fields keeps the comparison honest
    // (a cast would assert the very shape under test) and keeps the file
    // typechecking under `strict`.
    const js: Record<string, unknown> = jsResolveArc(cwd);
    expect(js.ok).toBe(ts.ok);
    // Branching on `ts.ok` alone is sound because the line above already pinned
    // the two to agree on it.
    if (ts.ok) {
      expect(js.branch).toBe(ts.branch);
      expect(js.baseSha).toBe(ts.baseSha);
      expect(js.corpusFile).toBe(ts.corpusFile);
    } else {
      expect(js.kind).toBe(ts.kind);
    }
  });

  // Failure caught: a parity suite that passes because it exercises nothing.
  // Derived from the case list, never a literal.
  it("covers every refusal kind the contract defines", () => {
    const kinds = new Set(
      CASES.flatMap(([, build]) => {
        const r = tsResolveArc(build());
        return r.ok ? [] : [r.kind];
      }),
    );
    expect([...kinds].sort()).toEqual(
      ["detached_head", "no_merge_base", "not_a_repo", "on_main"].sort(),
    );
  });
});
