/**
 * tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
 *
 * Keeps the picker-flow e2e suite from going dark again.
 *
 * Un-skipping the three stubs was not enough on its own: `testMatch` membership in
 * playwright.config.ts is not workflow wiring, and before this change the only
 * mobile-safari CI step named exactly one spec file — so "real CI green" could pass
 * without ever executing these regressions. Two independent gaps also existed:
 * `PICKER_COOKIE_SIGNING_KEY` was set in no workflow at all (so the suite would
 * have crashed at setup rather than failing cleanly), and the trigger's path
 * allow-list was incomplete.
 *
 * Coverage status, stated precisely. The trigger is now `paths-ignore`, so the job
 * runs unless a change touches ONLY prose that no script reads — root-level
 * markdown, issue templates, the licence. Note that `docs/` is deliberately not in
 * that set, because prebuild's manifest reads the master spec and plan files.
 * Broader than the old allow-list, but still NOT every PR. An earlier revision of this branch claimed the specs became
 * "genuinely PR-covered" because the scanner stopped classifying them as
 * path-gated; that was an artifact, not a fact: `_workflowCoverageScan.ts` matched
 * only `paths:`. The scanner now recognises `paths-ignore` as a filter (with its
 * own self-test), and every crew spec this job runs — including
 * stage-restricted-crew-schedule.spec, wired here for the seeded agenda fold —
 * carries a `PATH_GATED_BY_EXCLUSION` allowlist row that says what it actually is.
 * BL-RESURRECT-MOBILE-SAFARI-E2E closed 2026-08-09: crew-page.spec (mobile-safari
 * only) and the rewritten theme-toggle.spec are now wired here too, nine specs
 * were deleted as superseded, and right-now-transitions stays UNSEEN and
 * statically skipped under its own valve. What remains dark is the NON-mobile-safari
 * residual of BL-E2E-APP-DEPENDENT-SPECS-CI-DARK.
 */
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import ts from "typescript";

import { stripCommentsSafely, stripYamlComments } from "../_shared/stripComments";
import { activatedRunScalars } from "../_shared/workflowActivation";
import { readFileSync } from "node:fs";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = "tests/e2e/picker-flow.spec.ts";

const readRaw = (wf: string): string =>
  readFileSync(join(process.cwd(), ".github/workflows", wf), "utf8");

const read = (wf: string): string => stripYamlComments(readRaw(wf));

/**
 * Shell segments of every `run:` scalar that actually INVOKE `playwright test` — split on
 * shell operators so an `echo …` payload after `&&` cannot satisfy wiring assertions, and
 * required to start with a runner prefix (pnpm/npx/yarn/exec chain) so a non-executing
 * position (`echo playwright test …`) cannot either. Comments are stripped first
 * (agenda-fold plan-review R1 mutation families MF1/MF2/MF4; idempotent over `read`'s
 * stripping).
 *
 * Only the HEAD segment of each `run:` scalar counts (MF7, whole-diff review R1 escaping
 * mutant): `true || pnpm exec playwright test …` is wiring-shaped in a segment that the shell
 * skips whenever the left side succeeds, and the static text cannot say whether ANY
 * operator-guarded segment runs — `false && …` is the same hole with the other operator. Command
 * position is the one position that always executes, so requiring it closes the whole
 * conditional-execution family at once. Deliberately FAIL-CLOSED: a legitimate
 * `setup && playwright test …` reads as unwired and fails the guard, which surfaces as "move the
 * invocation to its own step", never as green-while-dark.
 */
function playwrightTestSegments(yaml: string): string[][] {
  const RUNNER_PREFIX = new Set(["pnpm", "npx", "yarn", "exec"]);
  // Non-executing Playwright modes (MF6, agenda-fold plan-review R2 live mutant; extended by
  // whole-diff review R2's `--help` mutant): each of these exits 0 having executed nothing.
  // `--list` collects only, `--ui` is the interactive mode, and `--help`/`-h` print usage — a
  // segment carrying any of them is wiring-shaped and proves zero execution.
  const NON_EXECUTING = new Set(["--list", "--ui", "--help", "-h"]);
  return (
    activatedRunScalars(yaml)
      .map((c) => stripYamlComments(c))
      // The scalar must be ONE un-chained command. Taking the head segment closed MF7's
      // `true || playwright test …`, but R9 came back through the other end: `playwright test … ||
      // true` keeps the head intact and swallows every failure, so CI reports success on a red
      // suite. A shell operator anywhere in a scalar whose head is our invocation is therefore
      // disqualifying, not something to parse around — fail-closed, and neither workflow chains.
      .filter((c) => !/&&|\|\||;|\|/.test(c))
      .map((c) => c.trim())
      .map((seg) => seg.trim().split(/\s+/))
      .filter((t) => {
        const i = t.indexOf("playwright");
        return (
          i !== -1 &&
          t[i + 1] === "test" &&
          t.slice(0, i).every((w) => RUNNER_PREFIX.has(w)) &&
          !t.some((w) => NON_EXECUTING.has(w))
        );
      })
  );
}

/** Token-exact containment — `--project=mobile-safari-shadow` must NOT satisfy a
 *  `--project=mobile-safari` requirement, nor a longer path a file requirement (MF3). */
const hasToken = (tokens: string[], token: string): boolean => tokens.includes(token);

/**
 * Resolve the workflow's OWN command through Playwright and return, per (file, project), the
 * tests it would actually collect.
 *
 * Two escaping mutants forced this shape, both filed against weaker versions of the same idea:
 *
 *   - R2 (HIGH): the guards parsed `testMatch` out of playwright.config.ts, so a `testIgnore` on
 *     the very project the command selects collected ZERO tests with the guards green. `grep`,
 *     `grepInvert` and `testDir` are the same hole spelled differently.
 *   - R3 (HIGH): resolving a SYNTHESISED `--project=X <spec>` command ignored the real command's
 *     own selection flags, so appending `--grep-invert=. --pass-with-no-tests` to the workflow
 *     collected nothing, exited 0, and both guards stayed green.
 *
 * So neither the config nor a reconstruction is consulted: the segment's exact argv is replayed
 * with `--list --reporter=json` appended, and every filter it carries applies exactly as it will
 * in CI. `--list` starts no webServer, so this stays a unit-speed check. Fail-closed — a command
 * that cannot be loaded or collects nothing yields an empty map, which fails the callers.
 */
/**
 * Vitest budget for the cases that REPLAY a Playwright command.
 *
 * `resolvedByCommand` shells out to `playwright --list`, which grows with the
 * number of specs the workflow names. Vitest's 5s default was already tight and
 * went over when crew-e2e gained its fifth spec (font-binding, 2026-08-03) —
 * three cases timed out locally and one in CI, on a tree whose CONTRACT was
 * correct. The subprocess itself already allows 300s (`resolvedByCommand`), so
 * the 5s default was the binding constraint, not a real signal. Raised, not
 * removed: a hang still fails, it just is not confused with a slow-but-correct
 * resolution.
 */
const PLAYWRIGHT_RESOLUTION_TIMEOUT_MS = 120_000;

function resolvedByCommand(segment: string[], spec: string): number {
  const i = segment.indexOf("playwright");
  const argv = segment.slice(i + 1);
  let out: string;
  try {
    out = execFileSync(
      "pnpm",
      ["exec", "playwright", ...argv, "--list", "--forbid-only", "--reporter=json"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return 0;
  }
  return countTests(out, spec);
}

/**
 * Cases these specs deliberately keep skipped, by exact title.
 *
 * Whole-diff review R5 (HIGH) escaping mutant: excluding skipped tests from BOTH sides of the
 * count comparison made `test.describe.skip(...)` on the agenda-fold block invisible — three
 * defined, three collected, three executed, and the three cases the branch exists for silently
 * gone. Counting cannot tell a deliberate skip from a regressed one; only an explicit list can.
 * A new skip therefore fails here until someone writes down why, and deleting a row that still
 * has a `.skip` fails too.
 */
const EXPECTED_SKIPS: Record<string, string[]> = {
  // picker-flow.spec.ts:354 — "non-deterministic on a shared single-host local run. The DB
  // rotation …": pre-existing, documented at the skip site, unrelated to this branch.
  "tests/e2e/picker-flow.spec.ts": [
    "Admin Reset + Rotate flow: changing the share-token invalidates the old URL and the new URL works",
  ],
  "tests/e2e/stage-restricted-crew-schedule.spec.ts": [],
  // Wired 2026-08-09 (BL-RESURRECT-MOBILE-SAFARI-E2E). Rows are EXPLICIT — an
  // empty array is a claim ("this spec skips nothing"), and the ENROLLED
  // membership assertion below refuses a missing row rather than defaulting it.
  //
  // crew-page's four are the §4.10 transition-audit block: statically skipped for
  // a documented webkit technique limit (a frozen clock plus controlled rAF
  // stalls the very AnimatePresence transition under test), with its three live
  // coverage surfaces named in the block's own header. Kept, not revived.
  "tests/e2e/crew-page.spec.ts": [
    "transition (a): today→venue crossfade — wrapper opacity animates mid-transition then settles to a rendered Venue",
    "transition (b): theme-toggle during a section nav flips data-theme instantly and the crossfade still settles (compound)",
    "transition (c): re-enter Today re-mounts the hero at rest (no animate-from-hidden; compound)",
    "transition (d): hero state-change while leaving Today unmounts the hero cleanly (no concurrent animation; compound)",
  ],
  "tests/e2e/theme-toggle.spec.ts": [],
};

/**
 * RUNTIME project gates — cases a DECLARED `test.skip(...)` keeps from EXECUTING
 * under some of the projects that still COLLECT them.
 *
 * EXPECTED_SKIPS above cannot express this and must not be stretched to: it
 * registers STATIC skips, which `--list` reports as `expectedStatus: "skipped"`
 * and which therefore drop out of both sides of the count comparison on their
 * own. A `test.skip(<condition>, <reason>)` in a test BODY is invisible to
 * `--list` — measured on this tree: theme-toggle collects 10 across the two
 * projects and can only ever pass 9 — so without a declaration the oracle's
 * threshold would demand an execution that can never happen, and pinning the
 * threshold to collection would make CI permanently red on a correct tree.
 *
 * This is the theme-toggle MATRIX (plan 2026-08-09-quick-wins-2, "e2e harness
 * readiness"): arm (a) runs under both projects, arm (b) under desktop-chromium
 * alone, because the picker identity it drives cannot exist under WebKit over
 * plain http (the `__Host-`-prefixed Secure envelope is never stored — the same
 * measured limit that puts picker-flow.spec.ts on desktop-chromium).
 *
 * The registry is an EXCEPTION LIST, not the cover. The count itself stays
 * derived: the parity case below resolves each project separately through
 * Playwright and subtracts only the (title, project) pairs registered here, then
 * requires every row to have actually subtracted something — so a stale row
 * fails as loudly as a missing one, and a NEW gate with no row fails twice over
 * (parity, and the declared-gate scan in expectNoUndeclaredProjectGate).
 */
const PROJECT_GATED: Record<string, { title: string; runsUnder: string[] }[]> = {
  "tests/e2e/theme-toggle.spec.ts": [
    {
      title: "opens the menu, flips the theme, and every target clears the tap floor at 390px",
      runsUnder: ["desktop-chromium"],
    },
  ],
};

/**
 * Specs the crew-e2e.yml run command names that are ENROLLED in expectWired, and
 * the pre-contract specs deliberately exempt from it.
 *
 * Why this exists (plan review R2 F1): expectWired is opt-in — a spec added to
 * the workflow with no matching `it(...)` block is simply never checked, so the
 * guard would stay green while the new spec's project honesty and skip inventory
 * went unpinned. The parity assertion below makes enrollment FAIL-BY-DEFAULT:
 * every file in the run command is either ENROLLED or carries an EXEMPT reason.
 */
const ENROLLED = [
  "tests/e2e/picker-flow.spec.ts",
  "tests/e2e/stage-restricted-crew-schedule.spec.ts",
  "tests/e2e/crew-page.spec.ts",
  "tests/e2e/theme-toggle.spec.ts",
] as const;

const EXEMPT: Record<string, string> = {
  // Pre-contract specs: wired before expectWired existed, each already covered by
  // its own bespoke assertion in this file or by the executed-count oracle.
  "tests/e2e/crew-section-toggle.spec.ts": "pre-contract; pinned by the executed-count oracle row",
  "tests/e2e/alert-action-links.spec.ts": "pre-contract; pinned by the executed-count oracle row",
  "tests/e2e/font-binding.spec.ts": "pre-contract; pinned by the executed-count oracle row",
  "tests/e2e/font-rendering-census.spec.ts":
    "pre-contract; pinned by the executed-count oracle row (both projects, real assertions under each)",
};

/**
 * Every test the spec file defines, resolved WITHOUT the workflow's own filters — the baseline the
 * workflow command is measured against.
 *
 * Whole-diff review R4 (HIGH) escaping mutant: requiring "at least one test from the file" let
 * `--grep-invert=BL-AGENDA-FOLD-NO-SEEDED-E2E` collect the file's other 3 cases and ZERO
 * agenda-fold cases with both guards green — the primary backlog item dark behind its own wiring
 * guard. `--grep=admin` was the same hole from the other side (1/7 and 2/6 collected). Counting is
 * the fix and it maintains itself: adding a case to the spec raises both sides together, while any
 * filter that drops one fails the comparison.
 */
function definedResolution(spec: string, projects: string[]): { count: number; skips: string[] } {
  const projectFlags = projects.map((p) => `--project=${p}`);
  let out: string;
  try {
    out = execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        ...projectFlags,
        spec,
        "--list",
        "--forbid-only",
        "--reporter=json",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return { count: 0, skips: [] };
  }
  return { count: countTests(out, spec), skips: skippedTitles(out, spec) };
}

function skippedTitles(json: string, spec: string): string[] {
  const parsed = JSON.parse(json.slice(json.indexOf("{"))) as { suites?: unknown[] };
  const base = spec.split("/").pop()!;
  const titles: string[] = [];
  const walk = (suites: unknown[]): void => {
    for (const suite of suites) {
      const s = suite as {
        suites?: unknown[];
        specs?: { file?: string; title?: string; tests?: { expectedStatus?: string }[] }[];
      };
      for (const sp of s.specs ?? []) {
        if (!(sp.file ?? "").endsWith(base)) continue;
        if ((sp.tests ?? []).some((t) => t.expectedStatus === "skipped")) {
          titles.push(sp.title ?? "");
        }
      }
      if (s.suites) walk(s.suites);
    }
  };
  walk(parsed.suites ?? []);
  return [...new Set(titles)].sort();
}

/**
 * UNIQUE, non-skipped test identities for `spec` — not result rows.
 *
 * R13 (HIGH): `repeatEach: 2` with a `grep` selecting half the cases preserved every count while
 * half the unique coverage went dark. `spec.id` carries repeat identity, so counting ids makes a
 * repeat a repeat.
 */
function countTests(json: string, spec: string): number {
  const parsed = JSON.parse(json.slice(json.indexOf("{"))) as { suites?: unknown[] };
  const base = spec.split("/").pop()!;
  const ids = new Set<string>();
  const walk = (suites: unknown[]): void => {
    for (const suite of suites) {
      const s = suite as {
        suites?: unknown[];
        specs?: {
          file?: string;
          id?: string;
          line?: number;
          title?: string;
          tests?: { expectedStatus?: string }[];
        }[];
      };
      for (const sp of s.specs ?? []) {
        if (!(sp.file ?? "").endsWith(base)) continue;
        // A `skip`ped case is collected but never executed, so it is not coverage. R5 (HIGH)
        // escaping mutant: `test.describe.skip(...)` moved BOTH sides of the count comparison
        // together — six defined, six "collected", zero executed — and both guards stayed green.
        // Counting only non-skipped tests makes that mutant drive the count to 0, which the
        // `> 0` assertion rejects. `--forbid-only` on both resolutions closes the `test.only`
        // twin: Playwright errors instead of silently narrowing the run.
        // IDENTITIES, not rows (R13 HIGH): `repeatEach: 2` with a `grep` selecting half the
        // cases preserved every count while half the unique coverage went dark. `spec.id` carries
        // repeat identity, so a repeat counts once.
        if ((sp.tests ?? []).some((t) => t.expectedStatus !== "skipped")) {
          ids.add(sp.id ?? `${sp.file}:${sp.line}:${sp.title}`);
        }
      }
      if (s.suites) walk(s.suites);
    }
  };
  walk(parsed.suites ?? []);
  return ids.size;
}

/**
 * Non-skipped test identities per spec BASENAME, resolved under ONE project.
 *
 * The parity case needs a per-project view because a runtime project gate is invisible to a
 * combined resolution: `--project=a --project=b <spec> --list` reports one flat set and cannot
 * say which project would actually execute which case. Resolving each project separately is
 * what makes the matrix derivable — the registry then only has to name the exceptions, never
 * the counts.
 *
 * ONE invocation per project for the WHOLE named spec set, not one per (spec, project): the
 * previous shape paid a `--list` boot per REQUIRED row, which is what pushed this case toward
 * its timeout as the job grew specs. Fail-closed — an unloadable command yields an empty map,
 * which drives every count to 0 and fails the callers.
 */
function listByProject(specs: string[], project: string): Map<string, [Set<string>, Set<string>]> {
  const byFile = new Map<string, [Set<string>, Set<string>]>();
  let out: string;
  try {
    out = execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        `--project=${project}`,
        ...specs,
        "--list",
        "--forbid-only",
        "--reporter=json",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return byFile;
  }
  const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: unknown[] };
  // [ids, titles-of-those-ids] per file, kept in step so a gate row can be matched by TITLE
  // while the count stays keyed on `spec.id` (R13: `repeatEach` must not inflate it).
  const walk = (suites: unknown[]): void => {
    for (const suite of suites) {
      const s = suite as {
        suites?: unknown[];
        specs?: {
          file?: string;
          id?: string;
          line?: number;
          title?: string;
          tests?: { expectedStatus?: string }[];
        }[];
      };
      for (const sp of s.specs ?? []) {
        const base = String(sp.file ?? "")
          .split("/")
          .pop();
        if (base === undefined) continue;
        if (!(sp.tests ?? []).some((t) => t.expectedStatus !== "skipped")) continue;
        if (!byFile.has(base)) byFile.set(base, [new Set<string>(), new Set<string>()]);
        const [ids, titles] = byFile.get(base)!;
        const id = sp.id ?? `${sp.file}:${sp.line}:${sp.title}`;
        if (!ids.has(id)) {
          ids.add(id);
          titles.add(sp.title ?? "");
        }
      }
      if (s.suites) walk(s.suites);
    }
  };
  walk(parsed.suites ?? []);
  return byFile;
}

/**
 * A project gate may exist only where it is DECLARED, and only as a `test.skip(...)`.
 *
 * Whole-diff review R4 (HIGH): the file used to open every hook and case with
 * `if (testInfo.project.name !== "desktop-chromium") return;`. An earlier version of this guard
 * read that literal and required collection under it, which the reviewer defeated by respelling
 * ONE of the nine sites (`if (!["mobile-safari"].includes(testInfo.project.name)) return;`) —
 * eight literals still answered "desktop-chromium", all six tests still collected, and two cases
 * silently asserted nothing. Parsing gate SPELLINGS is unwinnable, so this does not parse them.
 *
 * The rule is POSITION plus DECLARATION, and it splits the two forms by what they report:
 *   - `if (<project condition>) return;` reports PASSED having asserted nothing — the R4/R5
 *     defect, which the executed-count oracle then credits as real coverage;
 *   - `test.skip(<project condition>, <reason>)` reports SKIPPED, which the oracle (PASSED only)
 *     refuses to credit, and which the PROJECT_GATED registry accounts for exactly.
 * So a spec with no registry row keeps the flat identifier ban, and a spec with one may read the
 * project ONLY inside a `test.skip(...)` condition. Both directions fail loudly.
 */
function expectNoUndeclaredProjectGate(spec: string): void {
  const source = readFileSync(join(process.cwd(), spec), "utf8");
  // Shared stripper, not a local idiom (tests/cross-cutting/_metaStripCommentsSingleSource):
  // the header comment below the ban DISCUSSES `project.name`, so comments must come out before
  // the scan or the guard fails on its own documentation.
  const code = stripCommentsSafely(source, ts.ScriptKind.TS);

  // `.fail(` is banned OUTRIGHT, in every spec, gated or not (R11 HIGH). Resolution cannot catch
  // it: MEASURED 2026-08-02, `--list --reporter=json` reports expectedStatus "passed" even for a
  // `test.fail(...)` declaration — the expectation is applied at RUN time. The executed-count
  // oracle catches it in CI (it counts only PASSED results); this ban is the cheap local twin.
  expect(
    /\.fail\s*\(/.test(code) ? [".fail("] : [],
    `${spec} quarantines a case with test.fail(): it runs, fails before its real assertions, and ` +
      "still reports `expected`, so a suite that proves nothing exits green.",
  ).toEqual([]);

  const gated = PROJECT_GATED[spec] ?? [];
  if (gated.length === 0) {
    // The IDENTIFIERS, not a spelling. R5 (HIGH) defeated a `/project\.name/` scan with
    // `test.info().project["name"]`, and destructuring (`const { project } = testInfo`) or
    // aliasing would defeat any bracket-aware successor. Every project-based gate must name
    // `project` or reach it through `testInfo`/`test.info()`, so banning the access closes the
    // class for any spec that has declared no gate at all.
    const banned = [/\bproject\b/, /\btestInfo\b/, /test\.info\s*\(/].filter((re) => re.test(code));
    expect(
      banned.map(String),
      `${spec} names project/testInfo in code but registers no PROJECT_GATED row. A project ` +
        "guard clause makes every case a silent assertion-free PASS under any other project. " +
        "Either remove it, or DECLARE it: a `test.skip(<project condition>, <reason>)` plus a " +
        "PROJECT_GATED row, which the executed-count parity case then subtracts and verifies.",
    ).toEqual([]);
    return;
  }

  // A spec WITH a declared gate keeps the class closed by POSITION rather than by spelling —
  // the same move the run-scalar helpers above make with command position. `test.skip(...)`
  // reports the case as SKIPPED, which the oracle (PASSED only) refuses to credit; an
  // `if (…) return;` reports it as PASSED having asserted nothing, which is the R4/R5 defect.
  // So every read of `project` / `testInfo` / `test.info()` must sit inside the FIRST ARGUMENT
  // of a `test.skip(...)` call. Parameter declarations are exempt (binding the fixture is not a
  // gate); every other position — early return, ternary, a `const { project } = testInfo`
  // destructure — lands outside those ranges and fails.
  const sf = ts.createSourceFile(spec, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const skipArgRanges: [number, number][] = [];
  const collectSkipArgs = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "test" &&
      node.expression.name.text === "skip" &&
      node.arguments.length > 0
    ) {
      skipArgRanges.push([node.arguments[0]!.getStart(sf), node.arguments[0]!.getEnd()]);
    }
    ts.forEachChild(node, collectSkipArgs);
  };
  collectSkipArgs(sf);
  const insideSkipArg = (node: ts.Node): boolean =>
    skipArgRanges.some(([s, e]) => node.getStart(sf) >= s && node.getEnd() <= e);

  const offenders: string[] = [];
  const record = (node: ts.Node, what: string): void => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    offenders.push(`${what} at ${spec}:${line + 1}`);
  };
  const scan = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && (node.text === "project" || node.text === "testInfo")) {
      const isParamName = ts.isParameter(node.parent) && node.parent.name === node;
      if (!isParamName && !insideSkipArg(node)) record(node, node.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "test" &&
      node.expression.name.text === "info" &&
      !insideSkipArg(node)
    ) {
      record(node, "test.info()");
    }
    ts.forEachChild(node, scan);
  };
  scan(sf);
  expect(
    offenders.sort(),
    `${spec} reads the project outside a declared \`test.skip(...)\` condition. A gate that ` +
      "early-returns leaves the case PASSING with nothing asserted, which the executed-count " +
      "oracle then credits as coverage; only a declared skip reports the case as skipped. Move " +
      "the condition into test.skip(), or delete the gate.",
  ).toEqual([]);
}

/**
 * Every executing segment must collect the spec, and must collect ALL of it. Shared by both
 * guarded specs so a fix to one is a fix to both (class-sweep).
 */
function expectWired(segments: string[][], spec: string, what: string): void {
  const naming = segments.filter((t) => hasToken(t, spec));
  expect(
    naming.length,
    `no executing \`playwright test\` segment in crew-e2e.yml names ${spec} as a whole token. ` +
      `${what} that no workflow runs are dark: CI would report green without executing them.`,
  ).toBeGreaterThan(0);

  expectNoUndeclaredProjectGate(spec);

  for (const segment of naming) {
    const projects = segment
      .filter((w) => w.startsWith("--project="))
      .map((w) => w.slice("--project=".length));
    const defined = definedResolution(spec, projects);
    const expected = defined.count;
    expect(
      defined.skips,
      `${spec} has skipped cases that are not in EXPECTED_SKIPS. A skip is invisible to the count ` +
        "comparison below — both sides drop together — so every one is written down with a reason " +
        "or it is a coverage regression.",
    ).toEqual([...(EXPECTED_SKIPS[spec] ?? [])].sort());
    expect(
      expected,
      `no project the segment selects (${projects.join(", ")}) resolves any test in ${spec}`,
    ).toBeGreaterThan(0);
    expect(
      resolvedByCommand(segment, spec),
      `replaying crew-e2e.yml's own \`playwright test\` command with --list collects a DIFFERENT ` +
        `number of tests from ${spec} than the file defines. Its filters (--grep/--grep-invert/` +
        "--shard/a project testIgnore) select part or all of the file away, so the job would exit " +
        "0 having executed less of it than the guard claims.",
    ).toBe(expected);
  }
}

/** The `pull_request.paths-ignore` block only, so an entry elsewhere cannot count. */
function pathsIgnoreBlock(wf: string): string {
  const yaml = read(wf);
  const start = yaml.indexOf("paths-ignore:");
  if (start === -1) return "";
  const rest = yaml.slice(start);
  const end = rest.slice(1).search(/\n {0,2}\S/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/**
 * The trigger is INVERTED: `paths-ignore`, not `paths`.
 *
 * Six review rounds each found another missing entry in an allow-list — leaf files,
 * then whole trees, then build inputs like next.config.ts, tsconfig.json,
 * instrumentation.ts and the pretest generators. An allow-list of "everything that
 * can affect this job" cannot be completed by inspection: the job builds the app
 * and these specs drive whole rendered routes.
 *
 * `paths-ignore` cannot be incomplete in the dangerous direction — anything not
 * listed triggers the job — so the contract pinned here is narrow and checkable:
 * the workflow must use `paths-ignore`, and every entry must be a DOCS pattern,
 * since prose cannot change what the app does.
 */
// Prose LOCATIONS, not "anything .md". Review found `**/*.md` also ignoring
// fixtures/shows/raw/*.md, which supabase/seed.ts reads and crew-section-toggle
// depends on — so a fixture-only change would have skipped the workflow while
// breaking the suite. Root-level `*.md` (README, AGENTS, the ledgers) and docs/
// are prose; a recursive markdown glob is not.
// `docs/` is NOT here on purpose: prebuild's manifest reads the master spec and
// plan files (scripts/pretest-gen.mjs), so a docs change can alter generated
// artifacts or fail the cold build. Reintroducing it to the ignore list must fail
// this guard, which the previous pattern allowed.
const DOCS_ONLY = /^(\.github\/ISSUE_TEMPLATE\/|LICENSE$|[^/]+\.md$)/;

/** Bare-runner workflows whose webServer inherits runner-level env. */
const KEYED_WORKFLOWS = ["crew-e2e.yml", "dev-gate-e2e.yml"] as const;

describe("picker-flow e2e CI wiring", () => {
  it(
    "crew-e2e.yml's own command collects the picker-flow spec",
    () => {
      // From `run:` lines only: a step `name:` mentioning the spec must not satisfy this, which an
      // earlier version accepted. Naming is then not enough either — the command's own filters
      // decide what it collects, so expectWired replays it (see resolvedByCommand).
      expectWired(playwrightTestSegments(read("crew-e2e.yml")), SPEC, "Un-skipped cases");
    },
    PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
  );

  it(
    "crew-e2e.yml's own command collects the stage-restricted crew spec",
    () => {
      // BL-AGENDA-FOLD-NO-SEEDED-E2E wiring red (spec §6 T3). The coverage registry cannot provide
      // this red: its PATH_GATED_BY_EXCLUSION row EXEMPTS the file whether or not any workflow
      // actually names it, so only a run-command assertion makes an unwired file fail. This file
      // also gates every case on its own project, which expectWired pins (R3 HIGH).
      expectWired(
        playwrightTestSegments(read("crew-e2e.yml")),
        "tests/e2e/stage-restricted-crew-schedule.spec.ts",
        "The seeded agenda-fold cases",
      );
    },
    PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
  );

  for (const spec of ENROLLED.filter(
    (f) => f !== SPEC && f !== "tests/e2e/stage-restricted-crew-schedule.spec.ts",
  )) {
    it(
      `crew-e2e.yml's own command collects ${spec}`,
      () => {
        expectWired(playwrightTestSegments(read("crew-e2e.yml")), spec, "Its cases");
      },
      PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
    );
  }

  it("every spec the crew-e2e.yml command names is ENROLLED or explicitly EXEMPT", () => {
    // Fail-by-default enrollment. Adding a spec to the workflow without enrolling
    // it here fails HERE, rather than shipping an unpinned spec whose project
    // honesty and skip inventory nothing checks.
    const named = new Set<string>();
    for (const segment of playwrightTestSegments(read("crew-e2e.yml"))) {
      for (const word of segment) {
        if (word.startsWith("tests/e2e/") && word.endsWith(".spec.ts")) named.add(word);
      }
    }
    expect(named.size, "crew-e2e.yml names no spec files — the parser is wrong").toBeGreaterThan(0);
    const accounted = new Set<string>([...ENROLLED, ...Object.keys(EXEMPT)]);
    expect(
      [...named].filter((f) => !accounted.has(f)).sort(),
      "these specs are in the crew-e2e.yml run command but are neither ENROLLED in expectWired " +
        "nor given an EXEMPT reason. Enroll it (preferred) or record why it is exempt.",
    ).toEqual([]);
    expect(
      [...accounted].filter((f) => !named.has(f)).sort(),
      "these specs are ENROLLED/EXEMPT here but the crew-e2e.yml run command no longer names " +
        "them. A stale row lets a spec drop out of CI without this guard noticing.",
    ).toEqual([]);
  });

  it("every ENROLLED spec has an EXPLICIT EXPECTED_SKIPS row", () => {
    // expectWired reads `EXPECTED_SKIPS[spec] ?? []`, so a MISSING row and a row
    // that says "skips nothing" are indistinguishable. For enrolled specs the row
    // must exist, making "no skips" an assertion someone wrote rather than a
    // default nobody chose.
    expect(
      ENROLLED.filter((spec) => !Object.prototype.hasOwnProperty.call(EXPECTED_SKIPS, spec)).sort(),
      "these ENROLLED specs have no EXPECTED_SKIPS row. Add one — `[]` is a valid, explicit claim.",
    ).toEqual([]);
  });

  it("crew-e2e.yml asserts the guarded specs actually EXECUTED", () => {
    // Static wiring proves collection, never execution. R10 (HIGH) escaping mutant: a `beforeEach`
    // calling test.skip() skips every case at runtime while --list still counts them, so the count
    // comparison, EXPECTED_SKIPS and the job's exit code all stay green on a suite that ran
    // nothing. Only a post-run oracle closes that, so the workflow must carry one — and it must be
    // an ACTIVATED, un-chained step like any other wiring (same helpers).
    const runs = activatedRunScalars(read("crew-e2e.yml"))
      .map((c) => stripYamlComments(c).trim())
      .filter((c) => !/&&|\|\||;|\|/.test(c));
    // COMMAND POSITION, like every other guarded invocation (R13 HIGH): `echo
    // scripts/check-crew-e2e-executed.mjs` exits 0 without reading the report, and a
    // token-anywhere test accepted it.
    expect(
      runs.some((c) => {
        const t = c.split(/\s+/);
        return t[0] === "node" && t[1] === "scripts/check-crew-e2e-executed.mjs";
      }),
      "crew-e2e.yml runs no post-run executed-count check. Without it a runtime skip empties the " +
        "whole job while every static assertion here stays green.",
    ).toBe(true);
    // The oracle needs the run's own json report: a `list`-only reporter writes none, and the
    // checker then fails closed rather than passing vacuously — but pin the producer anyway so
    // the pair cannot drift apart silently.
    const testRun = playwrightTestSegments(read("crew-e2e.yml"));
    expect(
      testRun.some((t) => t.some((w) => w.startsWith("--reporter=") && w.includes("json"))),
      "the crew-e2e playwright command emits no json report, so the executed-count check has " +
        "nothing to read.",
    ).toBe(true);
  });

  it(
    "the executed-count oracle's thresholds match live Playwright resolution",
    async () => {
      // R14 (HIGH), a genuinely new class: the guard pinned that the checker RUNS, never what it
      // demands. Lowering `stage-restricted-crew-schedule.spec.ts` from 6 to 3 let the three SFS-1
      // cases pass while all three agenda-fold cases runtime-skipped, and CI stayed green — the
      // oracle calibrated to the degradation it exists to catch. So the thresholds are not trusted
      // as literals: each one must equal what Playwright ACTUALLY resolves for that spec under the
      // workflow's own projects, which also keeps them correct as specs gain cases.
      const { REQUIRED } = (await import("../../scripts/check-crew-e2e-executed.mjs")) as {
        REQUIRED: Record<string, number>;
      };
      const segments = playwrightTestSegments(read("crew-e2e.yml"));
      const projects = [
        ...new Set(
          segments.flatMap((t) =>
            t.filter((w) => w.startsWith("--project=")).map((w) => w.slice("--project=".length)),
          ),
        ),
      ];
      // The KEY SET is pinned to the workflow's own file list, not just the values: deleting a row
      // outright escaped a values-only parity loop (measured while closing R14). Every spec the job
      // runs must have a threshold, and no threshold may name a spec the job does not run.
      const named = [
        ...new Set(
          segments.flatMap((t) =>
            t.filter((w) => w.endsWith(".spec.ts")).map((w) => w.split("/").pop()!),
          ),
        ),
      ].sort();
      expect(
        Object.keys(REQUIRED).sort(),
        "the oracle's REQUIRED table does not cover exactly the specs crew-e2e.yml runs. A missing " +
          "row means that spec may go dark unnoticed; an extra row means the oracle guards a spec " +
          "this job never runs.",
      ).toEqual(named);

      // The EXECUTABLE count, per project, minus the declared runtime gates. Collection alone is
      // the wrong baseline once any case carries a `test.skip(<project condition>)`: `--list`
      // still collects it under every matching project, so a collection-pinned threshold would
      // demand an execution that cannot happen and hold CI red on a correct tree. Subtracting
      // ONLY registered (title, project) pairs keeps the number derived — the registry names
      // exceptions, Playwright supplies every count.
      const specPaths = named.map((b) => `tests/e2e/${b}`);
      const perProject = new Map(projects.map((p) => [p, listByProject(specPaths, p)]));
      for (const p of projects) {
        expect(
          perProject.get(p)!.size,
          `--list resolved NO specs under --project=${p}; the resolution is broken, so every ` +
            "count below would be vacuously 0",
        ).toBeGreaterThan(0);
      }
      // Every registry row must actually bite. A stale row silently lowers a threshold, which is
      // R14's defect wearing the registry's clothes, so it fails exactly like a missing one.
      const subtracted = new Set<string>();
      for (const [base, threshold] of Object.entries(REQUIRED)) {
        const spec = `tests/e2e/${base}`;
        const gated = PROJECT_GATED[spec] ?? [];
        let executable = 0;
        for (const p of projects) {
          const entry = perProject.get(p)!.get(base);
          if (entry === undefined) continue;
          const [ids, titles] = entry;
          const gatedAwayHere = gated.filter(
            (g) => titles.has(g.title) && !g.runsUnder.includes(p),
          );
          for (const g of gatedAwayHere) subtracted.add(`${spec} :: ${g.title} :: ${p}`);
          executable += ids.size - gatedAwayHere.length;
        }
        expect(
          threshold,
          `${base}: the oracle demands ${threshold} executed, but Playwright resolves ${executable} ` +
            "executable tests for it across the job's projects (unique non-skipped cases, minus " +
            "the PROJECT_GATED rows). A threshold below the real count is an oracle calibrated to " +
            "a partially dark run; one above it can never be met.",
        ).toBe(executable);
      }
      const rows = Object.entries(PROJECT_GATED).flatMap(([spec, gs]) =>
        gs.flatMap((g) =>
          projects
            .filter((p) => !g.runsUnder.includes(p))
            .map((p) => `${spec} :: ${g.title} :: ${p}`),
        ),
      );
      expect(
        rows.filter((r) => !subtracted.has(r)).sort(),
        "these PROJECT_GATED rows subtracted nothing — the title no longer resolves under the " +
          "project they exclude (renamed, deleted, or the project stopped matching the file). A " +
          "stale row lowers a threshold for a case that is not really gated.",
      ).toEqual([]);
    },
    PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
  );

  it("crew-e2e.yml's pull_request trigger narrows on NOTHING but paths-ignore", () => {
    // R8 (HIGH) escaping mutant: `types: [closed]` left every other trigger predicate green while
    // the job stopped running on open/synchronize/reopen — i.e. on every PR event that matters.
    // `branches:`/`branches-ignore:` are the same hole by a different key. The contract this file
    // pins is "this job runs on essentially every PR", so the trigger may carry the docs-only
    // exclusion and nothing else; any other narrowing key fails, fail-closed.
    const trigger = parseYaml(read("crew-e2e.yml")) as {
      on?: { pull_request?: Record<string, unknown> };
    };
    const keys = Object.keys(trigger.on?.pull_request ?? {}).sort();
    expect(
      keys,
      "crew-e2e.yml's pull_request trigger carries a narrowing key beyond paths-ignore. `types`, " +
        "`branches` and `branches-ignore` each silence the job for real PR events while every " +
        "other assertion here stays green.",
    ).toEqual(["paths-ignore"]);
  });

  it("crew-e2e.yml uses paths-ignore, so a new code path cannot silently skip it", () => {
    const yaml = read("crew-e2e.yml");
    const trigger = yaml.slice(0, yaml.indexOf("jobs:"));
    expect(
      /\n\s+paths-ignore:/.test(trigger),
      "crew-e2e.yml must filter with paths-ignore rather than paths: an allow-list of affecting " +
        "paths was found incomplete in six consecutive review rounds, while paths-ignore cannot " +
        "be incomplete in the direction that matters.",
    ).toBe(true);
    expect(
      /\n\s+paths:/.test(trigger),
      "a paths: allow-list re-opens the incompleteness class",
    ).toBe(false);
  });

  it("every paths-ignore entry is a docs pattern", () => {
    // Quotes optional: `- app/**` and `- 'app/**'` were invisible to a
    // double-quote-only parser, so a code pattern could hide there while the
    // quoted docs entries kept the list non-empty and the test green.
    const entries = [...pathsIgnoreBlock("crew-e2e.yml").matchAll(/^\s*-\s*(.+?)\s*$/gm)].map((m) =>
      m[1]!.replace(/^['"]|['"]$/g, ""),
    );
    expect(entries.length, "paths-ignore is empty").toBeGreaterThan(0);
    expect(
      entries.filter((e) => !DOCS_ONLY.test(e)),
      "paths-ignore may only skip documentation. A code or config pattern here means a change to " +
        "it would NOT run the picker-flow suite, which is the failure this guard exists for.",
    ).toEqual([]);
  });

  it.each(KEYED_WORKFLOWS)(
    "%s sets a 64-hex PICKER_COOKIE_SIGNING_KEY where the run sees it",
    (wf) => {
      const yaml = read(wf);
      // Locality and validity are read from the SAME line. Checking them separately
      // let a valid key in an unrelated earlier env: block satisfy the value
      // assertion while a malformed key overrode it in the block the run actually
      // inherits — the suite crashes, the guard stays green.
      //
      // crew-e2e keeps its secrets at JOB level (six-space indent); dev-gate keeps
      // them in the Playwright run STEP's env: block (ten spaces).
      const expectedIndent = wf === "crew-e2e.yml" ? 6 : 10;
      // Capture the WHOLE value to end-of-line, not a hex prefix: `<64hex>zz` and
      // `"<64hex>zz"` both satisfied a prefix capture while
      // pickerCookieSigningKey() rejects them, so a malformed value could green the
      // guard and crash e2e setup.
      const located = new RegExp(
        `\\n {${expectedIndent}}PICKER_COOKIE_SIGNING_KEY:[ \\t]*(\\S*)[ \\t]*$`,
        "m",
      ).exec(yaml);
      expect(
        located,
        `${wf} does not set PICKER_COOKIE_SIGNING_KEY at the ${expectedIndent}-space indent that ` +
          "puts it in the env: block the Playwright run inherits. A key in an unrelated job or " +
          "step reaches no process.",
      ).not.toBeNull();
      expect(
        located![1],
        `${wf}'s PICKER_COOKIE_SIGNING_KEY must be 64 hex chars AT THAT LOCATION — ` +
          "pickerCookieSigningKey() throws on a malformed value, turning the guest case into a " +
          "setup crash rather than a clean failure.",
      ).toMatch(/^"?[0-9a-f]{64}"?$/);
    },
  );
});
