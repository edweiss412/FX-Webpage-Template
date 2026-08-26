/**
 * tests/cross-cutting/lifecycle-layout-e2e-ci-wiring.test.ts
 *
 * Keeps .github/workflows/lifecycle-layout-e2e.yml's tap-target step and its executed-count
 * oracle from drifting apart.
 *
 * This is the app-e2e guard's sibling, and it exists for the same three closures that guard
 * documents at tests/cross-cutting/app-e2e-ci-wiring.test.ts:6 — each one probed there, each one
 * live here the moment this job gained an oracle:
 *
 *   1. MISSING REQUIRED ROW. Naming a spec in the run step without adding a row leaves it with no
 *      floor, so every one of its cases can runtime-skip while the oracle exits 0.
 *   2. STALE FLOOR. A floor written as a literal and trusted as written goes stale the moment the
 *      spec gains a case, so partial execution passes.
 *   3. NARROWING FLAG. Nothing pins the run command's shape, so `--grep` / `--repeat-each` can
 *      shrink what actually runs while every static coverage assertion stays green.
 *
 * A SEPARATE FILE rather than a parameterized shared one: the app guard is workflow-specific by
 * construction (single un-chained invocation, both projects, one report). This job runs FOUR
 * playwright steps and only the tap-target step carries an oracle, so the assertions below are
 * scoped to that step — which is a different shape, not a different constant.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { stripYamlComments } from "../_shared/stripComments";

const WORKFLOW = ".github/workflows/lifecycle-layout-e2e.yml";
const ORACLE = "scripts/check-lifecycle-layout-executed.mjs";
const TAP_SPEC = "tests/e2e/tap-target-inline-controls.layout.spec.ts";
const PLAYWRIGHT_RESOLUTION_TIMEOUT_MS = 300_000;

type Step = {
  name?: string;
  run?: string;
  if?: unknown;
  env?: Record<string, string>;
  "continue-on-error"?: unknown;
};

/**
 * Shell text that can turn a non-zero exit into a green step.
 *
 * Two mechanisms, and review r2 (finding 2) showed the first version caught
 * only one of them:
 *   - OPERATORS: `|| true`, a trailing `; exit 0`, a pipeline whose last stage
 *     succeeds, or any chaining that lets a later command supply the status.
 *   - A SECOND LINE. A `run: |` block exits with its LAST command's status, so
 *     an ordinary diagnostic `echo oracle-complete` underneath the oracle is
 *     enough to discard the failure. Probed: the mutant exits 0 while the
 *     oracle prints `no report at …`.
 *
 * Refused outright rather than modelled — this job's guarded steps are single
 * commands by contract, so anything else is a change that should be read.
 */
function swallowsStatus(run: string): boolean {
  const text = stripYamlComments(run).trim();
  // DERIVED, not enumerated. The first version listed combinations (`&&`, `||`,
  // `;`, `|`) and review r3 walked straight through the gap: a single trailing
  // `&` backgrounds the oracle, so the step exits 0 while the checker prints its
  // failure asynchronously into the void. Listing combinations invites exactly
  // that. The closed set is the shell metacharacters that can detach a command's
  // exit status from the step's — `&`, `|`, `;` (which covers `&&` and `||` as
  // doubled forms) — plus a newline, since a `run: |` block exits with its LAST
  // command's status.
  return /[&|;\n]/.test(text);
}

function steps(): Step[] {
  const doc = parseYaml(readFileSync(join(process.cwd(), WORKFLOW), "utf8")) as {
    jobs?: Record<string, { steps?: Step[] }>;
  };
  return Object.values(doc.jobs ?? {}).flatMap((j) => j.steps ?? []);
}

function trigger(): unknown {
  const doc = parseYaml(readFileSync(join(process.cwd(), WORKFLOW), "utf8")) as {
    on?: { pull_request?: unknown };
  };
  return doc.on?.pull_request;
}

/** The steps whose `run` names the tap-target spec. Exactly one is the contract. */
function tapSteps(): Step[] {
  return steps().filter((s) => stripYamlComments(String(s.run ?? "")).includes(TAP_SPEC));
}

/** The tap-target step's argv, starting at the `test` token that follows `playwright`. */
function tapArgv(): string[] {
  const run = stripYamlComments(String(tapSteps()[0]?.run ?? "")).trim();
  const tokens = run.split(/\s+/);
  const i = tokens.indexOf("playwright");
  return i === -1 ? [] : tokens.slice(i + 1);
}

/**
 * Unique (case x project) identities the command resolves for `specBase`.
 *
 * Replays the workflow's OWN argv with `--list` appended, so every filter the command carries
 * applies exactly as it will in CI — that is what makes a `--grep` narrowing visible here instead
 * of only at runtime. `--list` starts no webServer, so this stays unit-speed.
 *
 * IDENTITY, not row: `(describe path, file, line, title, projectId)`. `spec.id` is not sufficient — the app-e2e
 * guard measured `repeatEach: 2` over seven cases producing fourteen distinct ids, so an
 * id-counting oracle reads a halved, doubled-up run as full coverage. Skipped cases are excluded:
 * a collected case that never executes is not coverage.
 */
function resolvedByCommand(argv: string[], specBase: string): number {
  let out: string;
  try {
    out = execFileSync(
      "pnpm",
      ["exec", "playwright", ...argv, "--list", "--forbid-only", "--reporter=json"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    // Fail closed: an unresolvable command resolves nothing, which reds the parity assertion
    // rather than silently agreeing with a zero floor.
    return 0;
  }
  const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: unknown[] };
  const identities = new Set<string>();
  const walk = (suites: unknown[], suitePath: string[] = []): void => {
    for (const suite of suites) {
      const s = suite as {
        title?: string;
        suites?: unknown[];
        specs?: {
          file?: string;
          line?: number;
          title?: string;
          tests?: { expectedStatus?: string; projectId?: string }[];
        }[];
      };
      // The enclosing describe titles are part of the identity, matching the app
      // sibling. Without them, two cases sharing a file, a line and a leaf title
      // under DIFFERENT describes collapse into one key here AND in the oracle,
      // so the floor this parity check certifies is one lower than the suite
      // really resolves and one case may run dark. Whole-diff review round 3
      // demonstrated the collapse on the oracle side; both walkers carry the
      // nesting now, because a floor and its verifier that share a blind spot
      // agree with each other and with nothing else.
      const here = s.title ? [...suitePath, String(s.title)] : suitePath;
      for (const sp of s.specs ?? []) {
        if (!(sp.file ?? "").endsWith(specBase)) continue;
        for (const t of sp.tests ?? []) {
          if (t.expectedStatus === "skipped") continue;
          identities.add(
            `${here.join(" > ")}::${sp.file}:${sp.line}:${sp.title}|${t.projectId ?? "?"}`,
          );
        }
      }
      walk(s.suites ?? [], here);
    }
  };
  walk(parsed.suites ?? []);
  return identities.size;
}

describe("lifecycle-layout-e2e.yml tap-target step wiring", () => {
  it("runs the tap-target spec from exactly one unconditional, un-chained step", () => {
    const found = tapSteps();
    expect(
      found.length,
      `${WORKFLOW} must name ${TAP_SPEC} in exactly ONE run step. Two steps would split the json ` +
        "report the oracle reads, so one of them would go unchecked.",
    ).toBe(1);
    expect(
      found[0]?.if,
      "the tap-target step must carry no `if:` — a conditional step is dark on every run whose " +
        "condition is false while every other assertion here stays green.",
    ).toBeUndefined();
    expect(
      swallowsStatus(String(found[0]?.run ?? "")),
      "the tap-target step must be ONE command: a chained invocation or a second line can hide " +
        "another playwright run whose output overwrites the report this step's oracle reads, and " +
        "either `|| true` or a trailing `echo` turns a failing suite into a green step.",
    ).toBe(false);
    expect(
      found[0]?.["continue-on-error"],
      "the tap-target step must not set `continue-on-error` — it converts a red suite into a " +
        "green job while every other assertion here stays satisfied.",
    ).toBeUndefined();
  });

  it("the run command carries no coverage-narrowing flag", () => {
    // Fail CLOSED on an allowlist — a flag nobody has reasoned about is refused, rather than a
    // denylist that a newly-invented narrowing flag walks straight through.
    const flags = tapArgv().filter((w) => w.startsWith("-"));
    const ALLOWED = /^(--project=|--retries=0$|--reporter=)/;
    expect(
      flags.filter((f) => !ALLOWED.test(f)),
      "the tap-target command carries a flag outside the reviewed set (--project=, --retries=0, " +
        "--reporter=). Narrowing flags such as --grep, -g, --repeat-each, --shard, --last-failed " +
        "and --only-changed each shrink what runs while every static coverage assertion stays " +
        "green.",
    ).toEqual([]);
  });

  it("pins the exact project set the floor is calibrated against", () => {
    // The floor is derived from whatever the command resolves, so narrowing the project set and
    // recalibrating REQUIRED satisfies derivation while silently deleting executions. The project
    // set is a DECISION, so it is pinned as a literal. mobile-safari is also the ONLY project
    // whose testMatch claims this spec (playwright.config.ts) — naming another resolves nothing.
    const projects = tapArgv()
      .filter((w) => w.startsWith("--project="))
      .map((w) => w.slice("--project=".length))
      .sort();
    expect(
      projects,
      "the tap-target step must run mobile-safari, and only it: the floors are calibrated " +
        "against that exact set.",
    ).toEqual(["mobile-safari"]);
  });

  it("pins --retries=0 and a json reporter", () => {
    const argv = tapArgv();
    expect(
      argv.includes("--retries=0"),
      "playwright.config.ts sets `retries: CI ? 2 : 0`, so without --retries=0 a fail-then-pass " +
        "retry reads as green and the oracle's first-attempt bar is defeated silently.",
    ).toBe(true);
    expect(
      argv.some((w) => w.startsWith("--reporter=") && w.includes("json")),
      "the command emits no json report, so the executed-count oracle has nothing to read.",
    ).toBe(true);
  });

  it("registers the report path the oracle reads, on the step itself", async () => {
    // The reporter env is STEP-scoped, and the oracle's zero-arg default is the same constant.
    // A mismatch is the quietest possible failure: playwright writes report A, the oracle reads
    // (missing) report B and exits 1 — or worse, reads a STALE B from an earlier job step and
    // passes on a run that never happened.
    const { REPORT_PATH } = (await import("../../scripts/check-lifecycle-layout-executed.mjs")) as {
      REPORT_PATH: string;
    };
    expect(
      tapSteps()[0]?.env?.["PLAYWRIGHT_JSON_OUTPUT_NAME"],
      `the tap-target step must register PLAYWRIGHT_JSON_OUTPUT_NAME=${REPORT_PATH} — the same ` +
        "path the oracle reads with no arguments.",
    ).toBe(REPORT_PATH);
  });

  it("runs the executed-count oracle unconditionally, in command position, with its exit status intact", () => {
    // Command POSITION, not token-anywhere: `echo scripts/check-lifecycle-layout-executed.mjs`
    // exits 0 without reading the report, and a substring test accepts it.
    const oracleSteps = steps().filter((s) => {
      const t = stripYamlComments(String(s.run ?? ""))
        .trim()
        .split(/\s+/);
      return t[0] === "node" && t[1] === ORACLE;
    });
    expect(
      oracleSteps.length,
      `${WORKFLOW} runs no post-run executed-count check. Without it a runtime skip empties the ` +
        "tap-target step while every static assertion here stays green.",
    ).toBe(1);
    expect(
      oracleSteps[0]?.if,
      "the oracle step must carry no `if:`. It has to run on the SUCCESS path — that is the only " +
        "path where a vacuously-green run is dangerous.",
    ).toBeUndefined();

    // An oracle exists ONLY to fail. Every way of keeping it in command position
    // while discarding the status it produces is refused here, because each one
    // leaves the step green, the coverage scanner satisfied, and all seventeen
    // governance pairs intact while the spec runs dark (whole-diff review r1,
    // finding 3 — probed: `node scripts/check-lifecycle-layout-executed.mjs
    // --report /definitely-missing-report.json || true` exits 0).
    expect(
      swallowsStatus(String(oracleSteps[0]?.run ?? "")),
      "the oracle step must be ONE command: `|| true`, `; exit 0`, a pipeline, and a second line " +
        "(a `run: |` block exits with its LAST command's status, so even `echo done` is enough) " +
        "all discard the non-zero exit that IS this step's entire output.",
    ).toBe(false);
    expect(
      oracleSteps[0]?.["continue-on-error"],
      "the oracle step must not set `continue-on-error` — it discards the oracle's verdict as " +
        "surely as `|| true` does, and is easier to add without noticing.",
    ).toBeUndefined();
  });

  it("the pull_request trigger narrows on nothing at all", () => {
    // ANY key under pull_request voids coverage under the scanner's bare-only rule, and `types:`
    // in particular silences the job for open/synchronize/reopen while every other assertion here
    // stays green.
    const pr = trigger();
    expect(pr === null || pr === undefined, `${WORKFLOW}'s pull_request trigger must be bare`).toBe(
      true,
    );
  });

  it(
    "the oracle's REQUIRED table covers exactly the specs the step runs, at live resolution",
    async () => {
      const { REQUIRED } = (await import("../../scripts/check-lifecycle-layout-executed.mjs")) as {
        REQUIRED: Record<string, number>;
      };
      const argv = tapArgv();
      const named = [
        ...new Set(argv.filter((w) => w.endsWith(".spec.ts")).map((w) => w.split("/").pop()!)),
      ].sort();

      // KEY SET parity, BOTH directions: a missing row means that spec can go dark unnoticed, an
      // extra row means the oracle guards a spec this step never runs — and a values-only loop
      // sees neither.
      expect(
        Object.keys(REQUIRED).sort(),
        "the oracle's REQUIRED table does not cover exactly the specs the tap-target step runs.",
      ).toEqual(named);

      // VALUES pinned to live resolution: a floor is not trusted as a literal. Each must equal
      // what Playwright actually resolves for that spec under this command, which keeps the floor
      // correct as the spec gains cases instead of quietly under-demanding.
      for (const [base, floor] of Object.entries(REQUIRED)) {
        const live = resolvedByCommand(argv, base);
        // PREMISE FIRST: equality alone is satisfied by 0 === 0, so a spec that resolves NOTHING —
        // statically skipped, env-gated off, or unresolvable — would pass key parity, floor
        // parity, and the runtime oracle too (`0 < 0` is false). Both sides must be positive
        // before their equality means anything.
        expect(
          live,
          `${base}: the step's own command resolves ZERO non-skipped (case x project) identities ` +
            "for this spec, so naming it buys no coverage at all. A statically-skipped or " +
            "env-gated spec must not be promoted into this job.",
        ).toBeGreaterThan(0);
        expect(
          floor,
          `${base}: a floor of ${floor} demands nothing. Every REQUIRED row must demand at least ` +
            "one execution, or the oracle passes on a spec that ran nothing.",
        ).toBeGreaterThan(0);
        expect(
          floor,
          `${base}: the oracle demands ${floor} executed, but the step's own command resolves a ` +
            "different number of unique non-skipped (case x project) identities. A floor below " +
            "the real count is an oracle calibrated to a partially dark run.",
        ).toBe(live);
      }
    },
    PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
  );
});
