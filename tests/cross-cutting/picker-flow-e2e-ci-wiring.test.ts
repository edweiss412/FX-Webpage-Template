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
 * The rest of the mobile-safari project stays dark under
 * BL-RESURRECT-MOBILE-SAFARI-E2E.
 */
import { execFileSync } from "node:child_process";
import ts from "typescript";

import { stripCommentsSafely } from "../_shared/stripComments";
import { activatedRunScalars } from "../_shared/workflowActivation";
import { readFileSync } from "node:fs";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = "tests/e2e/picker-flow.spec.ts";

const readRaw = (wf: string): string =>
  readFileSync(join(process.cwd(), ".github/workflows", wf), "utf8");

/**
 * Strip YAML comments — WHOLE-LINE and TRAILING.
 *
 * Review found all three assertions passing against commented-out wiring, twice.
 * Removing only full-line comments still accepted
 * `run: echo ok # playwright test …picker-flow.spec.ts`,
 * `FOO: bar # PICKER_COOKIE_SIGNING_KEY: "<64hex>"` and
 * `- "other" # - "app/auth/**"`. A guard that greens on disabled wiring is worse
 * than no guard, so the trailing form is stripped too — quote-aware, since a `#`
 * inside a quoted scalar is data, not a comment.
 */
function stripYamlComments(yaml: string): string {
  return yaml
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!;
        if (quote !== null) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

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
  return activatedRunScalars(yaml)
    .map((c) => stripYamlComments(c))
    .map((c) => c.split(/&&|\|\||;|\|/)[0]!)
    .map((seg) => seg.trim().split(/\s+/))
    .filter((t) => {
      const i = t.indexOf("playwright");
      return (
        i !== -1 &&
        t[i + 1] === "test" &&
        t.slice(0, i).every((w) => RUNNER_PREFIX.has(w)) &&
        !t.some((w) => NON_EXECUTING.has(w))
      );
    });
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

function countTests(json: string, spec: string): number {
  const parsed = JSON.parse(json.slice(json.indexOf("{"))) as { suites?: unknown[] };
  const base = spec.split("/").pop()!;
  let n = 0;
  const walk = (suites: unknown[]): void => {
    for (const suite of suites) {
      const s = suite as {
        suites?: unknown[];
        specs?: { file?: string; tests?: { expectedStatus?: string }[] }[];
      };
      for (const sp of s.specs ?? []) {
        if (!(sp.file ?? "").endsWith(base)) continue;
        // A `skip`ped case is collected but never executed, so it is not coverage. R5 (HIGH)
        // escaping mutant: `test.describe.skip(...)` moved BOTH sides of the count comparison
        // together — six defined, six "collected", zero executed — and both guards stayed green.
        // Counting only non-skipped tests makes that mutant drive the count to 0, which the
        // `> 0` assertion rejects. `--forbid-only` on both resolutions closes the `test.only`
        // twin: Playwright errors instead of silently narrowing the run.
        n += (sp.tests ?? []).filter((t) => t.expectedStatus !== "skipped").length;
      }
      if (s.suites) walk(s.suites);
    }
  };
  walk(parsed.suites ?? []);
  return n;
}

/**
 * No spec guarded here may carry a project-name guard clause.
 *
 * Whole-diff review R4 (HIGH): the file used to open every hook and case with
 * `if (testInfo.project.name !== "desktop-chromium") return;`. An earlier version of this guard
 * read that literal and required collection under it, which the reviewer defeated by respelling
 * ONE of the nine sites (`if (!["mobile-safari"].includes(testInfo.project.name)) return;`) —
 * eight literals still answered "desktop-chromium", all six tests still collected, and two cases
 * silently asserted nothing. Parsing gate SPELLINGS is unwinnable; banning the property access is
 * not, because every project-based gate must read `project.name` to exist. These files are matched
 * by exactly one project, so the clause has no purpose here beyond creating that silent-pass class.
 */
function expectNoProjectGate(spec: string): void {
  // Shared stripper, not a local idiom (tests/cross-cutting/_metaStripCommentsSingleSource):
  // the header comment below the ban DISCUSSES `project.name`, so comments must come out before
  // the scan or the guard fails on its own documentation.
  const code = stripCommentsSafely(
    readFileSync(join(process.cwd(), spec), "utf8"),
    ts.ScriptKind.TS,
  );
  // The IDENTIFIERS, not a spelling. R5 (HIGH) defeated a `/project\.name/` scan with
  // `test.info().project["name"]`, and destructuring (`const { project } = testInfo`) or aliasing
  // would defeat any bracket-aware successor. Every project-based gate must name `project` or
  // reach it through `testInfo`/`test.info()`, and neither spec uses either identifier for
  // anything else (verified 2026-08-02: zero occurrences in code, comments excluded).
  const banned = [/\bproject\b/, /\btestInfo\b/, /test\.info\s*\(/].filter((re) => re.test(code));
  expect(
    banned.map(String),
    `${spec} names project/testInfo in code. A project guard clause makes every case a silent ` +
      "assertion-free PASS under any other project, so a one-word testMatch move turns the suite " +
      "into a no-op that still reports green. Let it run and fail loudly instead.",
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

  expectNoProjectGate(spec);

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
  it("crew-e2e.yml's own command collects the picker-flow spec", () => {
    // From `run:` lines only: a step `name:` mentioning the spec must not satisfy this, which an
    // earlier version accepted. Naming is then not enough either — the command's own filters
    // decide what it collects, so expectWired replays it (see resolvedByCommand).
    expectWired(playwrightTestSegments(read("crew-e2e.yml")), SPEC, "Un-skipped cases");
  });

  it("crew-e2e.yml's own command collects the stage-restricted crew spec", () => {
    // BL-AGENDA-FOLD-NO-SEEDED-E2E wiring red (spec §6 T3). The coverage registry cannot provide
    // this red: its PATH_GATED_BY_EXCLUSION row EXEMPTS the file whether or not any workflow
    // actually names it, so only a run-command assertion makes an unwired file fail. This file
    // also gates every case on its own project, which expectWired pins (R3 HIGH).
    expectWired(
      playwrightTestSegments(read("crew-e2e.yml")),
      "tests/e2e/stage-restricted-crew-schedule.spec.ts",
      "The seeded agenda-fold cases",
    );
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
