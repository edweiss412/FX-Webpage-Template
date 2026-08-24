/**
 * tests/cross-cutting/app-e2e-ci-wiring.test.ts
 *
 * Keeps .github/workflows/app-e2e.yml and its executed-count oracle from drifting apart.
 *
 * The batch-1 plan declared this guard deliberately NOT needed, on the reasoning that "the
 * coverage scan + oracle + five-green bar cover the same surface". Whole-diff review round 1
 * falsified that with three probes, and this file is the repair:
 *
 *   1. The oracle's REQUIRED table was checked against NOTHING. Adding a spec to the workflow's
 *      run step without adding a row left it with no floor, so every one of its cases could
 *      runtime-skip while the oracle exited 0. (Probed: sign-in-page covered by the scanner,
 *      absent from REQUIRED, missing-row mutant exit 0.)
 *   2. The floors were literals, trusted as written. A spec that GAINS cases keeps its stale
 *      floor, so partial execution passes. (Probed: two runtime-skipped cases added to me-page,
 *      floor still 14, exit 0.)
 *   3. Nothing pinned the run command's shape, so `--grep` / `--repeat-each` could narrow what
 *      actually runs while the scanner still reported all eight specs covered.
 *
 * The crew-e2e sibling (picker-flow-e2e-ci-wiring.test.ts) already closed exactly this class for
 * its own job — its R14 finding is finding 2 verbatim. This is that guard for app-e2e.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { activatedRunScalars } from "../_shared/workflowActivation";
import { stripYamlComments } from "../_shared/stripComments";

const WORKFLOW = "app-e2e.yml";
const ORACLE = "scripts/check-app-e2e-executed.mjs";

const read = (wf: string): string =>
  readFileSync(join(process.cwd(), ".github/workflows", wf), "utf8");

/**
 * Every ACTIVATED, un-chained `playwright test` invocation, as the argv that FOLLOWS the
 * `playwright` token — i.e. starting at `test`. Returning the post-`playwright` slice is what
 * makes a segment directly replayable as `pnpm exec playwright <argv> --list`.
 */
function playwrightTestSegments(yaml: string): string[][] {
  return (
    activatedRunScalars(yaml)
      .map((c) => stripYamlComments(c).trim())
      // A chained command can hide a second invocation behind a shell operator; this job has
      // exactly one run step in command position, so refuse chaining outright rather than model it.
      .filter((c) => !/&&|\|\||;|\|/.test(c))
      .map((c) => c.split(/\s+/))
      .filter((t) => t.includes("playwright") && t[t.indexOf("playwright") + 1] === "test")
      .map((t) => t.slice(t.indexOf("playwright") + 1))
  );
}

/**
 * Unique (case x project) identities the command resolves for `specBase`.
 *
 * Replays the workflow's OWN argv with `--list` appended, so every filter the command carries
 * applies exactly as it will in CI — that is what makes a `--grep` narrowing visible here instead
 * of only at runtime. `--list` starts no webServer, so this stays unit-speed.
 *
 * IDENTITY, not row: `(file, line, title, projectId)`. `spec.id` is NOT sufficient — review round
 * 1 measured `repeatEach: 2` over seven cases producing fourteen distinct ids, so an id-counting
 * oracle reads a halved, doubled-up run as full coverage. Skipped cases are excluded: a collected
 * case that never executes is not coverage.
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
  // The identity MUST match scripts/check-app-e2e-executed.mjs's, describe path
  // included. Whole-diff review round 2 (scope B) probed the mismatch that opened
  // when only the oracle was repaired: this walk counted two same-line, same-title
  // cases under different describes as ONE, so the floor it pins stayed at the old
  // value while resolution had grown, and the oracle then met that stale floor with
  // one of the two cases runtime-skipped. Two identity functions, one contract.
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

const PLAYWRIGHT_RESOLUTION_TIMEOUT_MS = 300_000;

describe("app-e2e.yml CI wiring", () => {
  it("has exactly one un-chained playwright test invocation", () => {
    expect(
      playwrightTestSegments(read(WORKFLOW)).length,
      "app-e2e.yml must carry exactly ONE playwright test run step. Each invocation cold-builds " +
        "and owns its webServer, and a second one also splits the json report the oracle reads.",
    ).toBe(1);
  });

  it("the run command carries no coverage-narrowing flag", () => {
    // Review round 1, finding 3: `--grep=sentinel --repeat-each=2` left the coverage scanner
    // reporting all eight specs covered with zero rejections while half the logical coverage was
    // dark. Fail CLOSED on an allowlist — a flag nobody has reasoned about is refused, rather
    // than a denylist that a newly-invented narrowing flag walks straight through.
    const [argv] = playwrightTestSegments(read(WORKFLOW));
    const flags = (argv ?? []).filter((w) => w.startsWith("-"));
    const ALLOWED = /^(--project=|--retries=0$|--reporter=)/;
    expect(
      flags.filter((f) => !ALLOWED.test(f)),
      "app-e2e.yml's playwright command carries a flag outside the reviewed set " +
        "(--project=, --retries=0, --reporter=). Narrowing flags such as --grep, -g, " +
        "--repeat-each, --shard, --last-failed and --only-changed each shrink what runs while " +
        "every static coverage assertion stays green.",
    ).toEqual([]);
  });

  it("pins the exact project set the floors are calibrated against", () => {
    // Diff review R11: the flag allowlist accepted ANY `--project=` value, and the floors are
    // derived from whatever the command resolves — so dropping `--project=desktop-chromium` and
    // recalibrating REQUIRED to the new live numbers satisfied every other assertion here
    // (positive resolutions 2/4/7/7/4/4/1, no disallowed flag, all seven specs still scanner-
    // covered) while silently deleting 25 desktop executions. Derivation cannot catch this on its
    // own: it faithfully re-derives the floors for the narrowed command. The project set is a
    // DECISION, so it is pinned as a literal.
    //
    // The converse — dropping mobile-safari — was already caught, but only by accident:
    // admin-phase2-surfaces resolves zero tests under desktop-chromium, so its floor goes to 0 and
    // the positive-premise assertion fires. Relying on one spec's testMatch for that is luck, not
    // a guard.
    const [argv] = playwrightTestSegments(read(WORKFLOW));
    const projects = (argv ?? [])
      .filter((w) => w.startsWith("--project="))
      .map((w) => w.slice("--project=".length))
      .sort();
    expect(
      projects,
      "app-e2e.yml must run BOTH projects. The executed-count floors are calibrated against this " +
        "exact set; narrowing it and recalibrating produces a green job that proves strictly less.",
    ).toEqual(["desktop-chromium", "mobile-safari"]);
  });

  it("pins --retries=0 and a json reporter", () => {
    const [argv] = playwrightTestSegments(read(WORKFLOW));
    expect(
      (argv ?? []).includes("--retries=0"),
      "playwright.config.ts sets `retries: CI ? 2 : 0`, so without --retries=0 a fail-then-pass " +
        "retry reads as green and AC-3's zero-retry bar is defeated silently.",
    ).toBe(true);
    expect(
      (argv ?? []).some((w) => w.startsWith("--reporter=") && w.includes("json")),
      "the command emits no json report, so the executed-count oracle has nothing to read.",
    ).toBe(true);
  });

  it("runs the executed-count oracle in command position", () => {
    // Command POSITION, not token-anywhere: `echo scripts/check-app-e2e-executed.mjs` exits 0
    // without reading the report, and a substring test accepts it.
    const runs = activatedRunScalars(read(WORKFLOW))
      .map((c) => stripYamlComments(c).trim())
      .filter((c) => !/&&|\|\||;|\|/.test(c));
    expect(
      runs.some((c) => {
        const t = c.split(/\s+/);
        return t[0] === "node" && t[1] === ORACLE;
      }),
      `app-e2e.yml runs no post-run executed-count check. Without it a runtime skip empties the ` +
        `whole job while every static assertion here stays green.`,
    ).toBe(true);
  });

  it("the pull_request trigger narrows on nothing at all", () => {
    // ANY key under pull_request voids coverage under the scanner's bare-only rule, and `types:`
    // in particular silences the job for open/synchronize/reopen while every other assertion here
    // stays green.
    const doc = parseYaml(read(WORKFLOW)) as { on?: { pull_request?: Record<string, unknown> } };
    const pr = doc.on?.pull_request;
    expect(pr === null || pr === undefined, "app-e2e.yml's pull_request trigger must be bare").toBe(
      true,
    );
  });

  it(
    "the oracle's REQUIRED table covers exactly the specs the workflow runs, at live resolution",
    async () => {
      const { REQUIRED } = (await import("../../scripts/check-app-e2e-executed.mjs")) as {
        REQUIRED: Record<string, number>;
      };
      const [argv] = playwrightTestSegments(read(WORKFLOW));
      const named = [
        ...new Set(
          (argv ?? []).filter((w) => w.endsWith(".spec.ts")).map((w) => w.split("/").pop()!),
        ),
      ].sort();

      // KEY SET parity, both directions (review round 1, finding 1): a missing row means that
      // spec can go dark unnoticed, an extra row means the oracle guards a spec this job never
      // runs — and a values-only loop sees neither.
      expect(
        Object.keys(REQUIRED).sort(),
        "the oracle's REQUIRED table does not cover exactly the specs app-e2e.yml runs.",
      ).toEqual(named);

      // VALUES pinned to live resolution (finding 2): a floor is not trusted as a literal. Each
      // must equal what Playwright actually resolves for that spec under this command, which also
      // keeps the floors correct as specs gain cases instead of quietly under-demanding.
      for (const [base, floor] of Object.entries(REQUIRED)) {
        const live = resolvedByCommand(argv ?? [], base);
        // PREMISE FIRST (diff review round 3): equality alone is satisfied by 0 === 0, so a spec
        // that resolves NOTHING — statically skipped, env-gated off, or unresolvable — passes key
        // parity, passes floor parity, and passes the runtime oracle too (`0 < 0` is false). The
        // probe promoted the env-gated published-review-modal.prefetch spec with REQUIRED = 0 and
        // every assertion here stayed green while the job executed none of it. Both sides must be
        // positive before their equality means anything.
        expect(
          live,
          `${base}: the workflow's own command resolves ZERO non-skipped (case x project) ` +
            "identities for this spec, so naming it in the run step buys no coverage at all. " +
            "A statically-skipped or env-gated spec must not be promoted into this job.",
        ).toBeGreaterThan(0);
        expect(
          floor,
          `${base}: a floor of ${floor} demands nothing. Every REQUIRED row must demand at least ` +
            "one execution, or the oracle passes on a spec that ran nothing.",
        ).toBeGreaterThan(0);
        expect(
          floor,
          `${base}: the oracle demands ${floor} executed, but the workflow's own command resolves ` +
            "a different number of unique non-skipped (case x project) identities. A floor below " +
            "the real count is an oracle calibrated to a partially dark run.",
        ).toBe(live);
      }
    },
    PLAYWRIGHT_RESOLUTION_TIMEOUT_MS,
  );
});
