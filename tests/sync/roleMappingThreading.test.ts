import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");

// Static threading walker (spec §10 point 3 + §13 "prior-warnings threading walker";
// plan Task 8 + plan-R1 F2/F3, plan-R2 F6). Every site that ASSEMBLES a `Phase2Args`
// object literal (the only object carrying BOTH `binding:` and `parseResult:`) must
// thread BOTH `roleTokenMappings` and `priorParseWarnings` into that literal, or the
// file must carry an inline `// first-publish-only:` exemption (genuine first publish,
// no prior exists — emit-everything-new is correct there).
//
// NOTE ON THE ANCHOR (deviation from the plan's literal `grep "runPhase2("`): the real
// callers dispatch through `runPhase2_unlocked(` (runScheduledCronSync.ts:3419) and
// `(deps.runPhase2 ?? defaultRunPhase2)(` (applyStagedCore.ts:569) /
// `(deps.runPhase2 ?? runPhase2)(` (runManualStageForFirstSeen.ts:97) — `runPhase2(`
// matches ONLY the definition in phase2.ts. Anchoring on the Phase2Args LITERAL
// (brace-balanced object containing both `binding:` and `parseResult:`) is what proves
// the fields are IN the args, and it fails-by-default on a NEW arg-assembly site.

// Every runPhase2-dispatch call: the passthrough wrapper `runPhase2_unlocked(` (its call site,
// NOT its `function` definition) and the DI dispatch `(deps.runPhase2 ?? [default]runPhase2)(`.
// Anchoring on the CALL — not on a `binding:`/`parseResult:` shape — is what distinguishes a
// Phase2Args literal from a Phase1Args literal (both carry those two keys; only Phase2Args is a
// runPhase2 argument). `runPhase1_unlocked(` is deliberately NOT matched.
const DISPATCH_PATTERNS: RegExp[] = [
  /(?<![.\w])runPhase2_unlocked\s*\(/g,
  /\(\s*deps\.runPhase2\s*\?\?\s*(?:default)?[rR]unPhase2\s*\)\s*\(/g,
];

/** The object literal passed as the SECOND argument of a call whose `(` is at `parenIdx`. */
function secondArgObject(src: string, parenIdx: number): string | null {
  let i = parenIdx + 1;
  let depth = 0;
  // skip arg1 (the tx), balanced, up to the top-level comma
  while (i < src.length) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      i++;
      break;
    }
    i++;
  }
  while (i < src.length && /\s/.test(src[i]!)) i++;
  if (src[i] !== "{") return null; // 2nd arg is an identifier (e.g. the passthrough `args`) — skip
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") {
      d--;
      if (d === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

/** Every Phase2Args object literal that is an argument to a runPhase2 dispatch. */
function phase2ArgRegions(src: string): string[] {
  const regions: string[] = [];
  for (const pat of DISPATCH_PATTERNS) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(src)) !== null) {
      // Exclude the wrapper's own `function runPhase2_unlocked(` definition.
      if (src.slice(Math.max(0, m.index - 9), m.index).endsWith("function ")) continue;
      const parenIdx = m.index + m[0].length - 1;
      const region = secondArgObject(src, parenIdx);
      if (region && !regions.includes(region)) regions.push(region);
    }
  }
  return regions;
}

describe("role-mapping threading walker (spec §10 point 3 / §13)", () => {
  test("every Phase2Args-assembly site threads roleTokenMappings + priorParseWarnings (or is first-publish-only)", () => {
    const files = execSync(`grep -rln "runPhase2" lib --include='*.ts'`, {
      cwd: REPO,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((f) => f && f !== "lib/sync/phase2.ts");

    let checkedRegions = 0;
    for (const rel of files) {
      const src = readFileSync(path.join(REPO, rel), "utf8");
      const firstPublishOnly = src.includes("// first-publish-only:");
      const regions = phase2ArgRegions(src);
      if (regions.length === 0) continue;

      for (const region of regions) {
        if (firstPublishOnly) continue;
        checkedRegions++;
        expect(
          region.includes("roleTokenMappings"),
          `${rel}: roleTokenMappings missing from a Phase2Args literal`,
        ).toBe(true);
        expect(
          region.includes("priorParseWarnings"),
          `${rel}: priorParseWarnings missing from a Phase2Args literal`,
        ).toBe(true);
      }

      // Emission clause (spec §10 point 5, plan-R2 F6): a file that BUILDS a Phase2Args and
      // reaches a committed apply must emit ROLE_TOKEN_MAPPED post-commit, OR carry an inline
      // `// no-telemetry:` note pointing at where it happens (the arg-build and the post-commit
      // emit legitimately live in different functions — runScheduledCronSync emits in its
      // processOneFile wrapper; applyStagedCore's emit is in the applyStaged tail).
      if (!firstPublishOnly) {
        const emits = src.includes("emitRoleTokenMapped(") || src.includes("// no-telemetry:");
        expect(emits, `${rel}: a Phase2Args-building apply surface is telemetry-dark`).toBe(true);
      }
    }

    expect(checkedRegions).toBeGreaterThan(0);
  });
});
