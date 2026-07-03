import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * #248 structural guard — pins that EVERY production caller of `resolveKeyTimes`
 * and `buildRightNowContext` threads `stageRestriction`.
 *
 * Both params are OPTIONAL (default `{ kind: "none" }`): `resolveKeyTimes` has 28
 * existing 4-arg test callers, so a required param would be prohibitive churn. The
 * downside of an optional param is that a caller silently defaulting to "none"
 * re-opens the off-stage Set/Strike leak (spec §3.4) — and typecheck won't catch a
 * dropped thread. This source-scan pins each caller so a dropped thread fails CI,
 * not silently in production. (The gating LOGIC itself is unit-tested in
 * resolveKeyTimes.test.ts / buildRightNowContext.test.ts; the caller-render behavior
 * in ScheduleSection.test.tsx + TodaySection.test.tsx.)
 */

/** Strip block + line comments so a bare `fn(` mention in prose (e.g. TodaySection's
 *  JSDoc "`resolveKeyTimes(show, rooms)` resolver") is not mistaken for a real call. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Balanced-paren argument substrings of EVERY `${fn}(` occurrence in `src`. */
function allCallArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(`${fn}(`, from);
    if (start === -1) break;
    let depth = 0;
    let i = start + fn.length; // positioned at "("
    const open = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(open + 1, i));
    from = i + 1;
  }
  return out;
}

const CASES: Array<{ file: string; fn: string }> = [
  { file: "components/crew/sections/ScheduleSection.tsx", fn: "resolveKeyTimes" },
  { file: "components/crew/sections/TodaySection.tsx", fn: "resolveKeyTimes" },
  { file: "components/right-now/buildRightNowContext.ts", fn: "resolveKeyTimes" },
  { file: "components/crew/sections/TodaySection.tsx", fn: "buildRightNowContext" },
  { file: "app/show/[slug]/[shareToken]/_CrewShell.tsx", fn: "buildRightNowContext" },
];

describe("stage_restriction threading through resolveKeyTimes / buildRightNowContext callers (#248)", () => {
  for (const { file, fn } of CASES) {
    it(`${file}: EVERY ${fn}(...) call threads stageRestriction`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const argsList = allCallArgs(src, fn);
      expect(argsList.length, `no ${fn}( call found in ${file}`).toBeGreaterThan(0);
      // EVERY real call must thread it — a future second call that forgets re-opens the
      // off-stage Set/Strike leak (spec §3.4). "at least one" would let that slip through.
      for (const args of argsList) {
        expect(
          args.includes("stageRestriction"),
          `a ${fn}( call in ${file} does NOT thread stageRestriction (off-stage-leak guard, #248): ${fn}(${args.trim().slice(0, 80)}…)`,
        ).toBe(true);
      }
    });
  }
});
