import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { premiseHolds } from "../../_shared/premise";
import { MutantRunInfraError } from "../source/runner";
import type { BoundedRun } from "../source/spawnBounded";
import { classifyChild } from "./mutate";
import type { DecidingSuite } from "./registry";

/**
 * The browser gate's child lifetime bound, proven by RUNNING children.
 *
 * The seam that matters is `runChild`'s `timeoutMs` parameter: production call
 * sites keep today's arity and ship `BROWSER_MUTANT_TIMEOUT_MS`, while a case
 * here passes a small value and constructs a genuine timeout in seconds. A test
 * that injected a `{kind: "timeout"}` outcome into a fake spawn seam could pass
 * while the real caller generated no `ETIMEDOUT` and killed nothing — a
 * fail-open proof of exactly the property this suite exists to establish.
 */

const ROOT = resolve(__dirname, "..", "..", "..");

/** Small enough that the sleeping child cannot reach its own completion. */
const SMALL_CEILING_MS = 2_000;

/** Generous enough that a healthy child is never converted into a timeout. */
const GENEROUS_CEILING_MS = 120_000;

/**
 * Headroom for the ASYNC parts of a case — and explicitly NOT a backstop for the
 * child.
 *
 * `spawnBounded` uses `spawnSync`, which blocks the test thread, so vitest cannot
 * fire a per-case timeout while a child is running: the timer only gets a turn
 * once the call returns. A layered-defence reading of this value would be false —
 * the outer layer is unreachable exactly when the inner one is stuck. The only
 * thing bounding a child here is the ceiling passed to `runChild`.
 */
const CASE_TIMEOUT = { timeout: 60_000 } as const;

const SLEEPING_SUITE: DecidingSuite = {
  kind: "vitest",
  path: "tests/mutation/browser/fixtures/sleep.fixture.ts",
};

const HEALTHY_SUITE: DecidingSuite = {
  kind: "vitest",
  path: "tests/mutation/browser/fixtures/fast.fixture.ts",
};

/**
 * A pass-through mock, overridden per case and ONLY for the arm a real child
 * cannot produce.
 *
 * The timeout arm is NEVER overridden — AC-3 requires the supervisor, the
 * ceiling and the kill to actually execute. The `infra` arm is: the child is
 * `pnpm exec vitest`, and a signal delivered inside it kills a worker and
 * surfaces as a non-zero EXIT at the top level, so no real invocation of this
 * command reaches a signal death on demand. AC-5 re-asserts existing behavior
 * that the swap must not drop, and this is the only way to exercise it without
 * adversarial process manipulation — which the design's threat fence (spec
 * §1.2) puts out of scope.
 */
const seam = vi.hoisted(() => ({
  override: null as null | (() => BoundedRun),
  calls: [] as Array<{ timeoutMs: number | undefined }>,
}));

vi.mock("../source/spawnBounded", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../source/spawnBounded")>();
  return {
    ...actual,
    spawnBounded: (...args: Parameters<typeof actual.spawnBounded>): BoundedRun => {
      seam.calls.push({ timeoutMs: args[1].timeoutMs });
      return seam.override ? seam.override() : actual.spawnBounded(...args);
    },
  };
});

/** Imported AFTER the mock declaration so the module graph sees the seam. */
const { runChild, BROWSER_MUTANT_TIMEOUT_MS } = await import("./runner");

function withSeam<T>(outcome: BoundedRun, run: () => T): T {
  seam.override = () => outcome;
  try {
    return run();
  } finally {
    seam.override = null;
  }
}

/** The message a call throws, or a marker that names the absence of a throw. */
function causeOf(run: () => unknown): string {
  try {
    run();
  } catch (e) {
    if (e instanceof MutantRunInfraError) return e.message;
    return `NON-INFRA THROW: ${String(e)}`;
  }
  return "DID NOT THROW";
}

describe("AC-1 — the module's only spawn route", () => {
  const source = readFileSync(resolve(ROOT, "tests/mutation/browser/runner.ts"), "utf8");

  // Asserted on the SPECIFIER, never on an identifier. `import { execFileSync as
  // legacyRun }` plus a live `legacyRun(file, args)` passes an `execFileSync(`
  // absence check while the unbounded call is still there; no alias evades a
  // check on what the module is imported FROM. A specifier assembled at runtime
  // would evade this, and that is adversarial obfuscation — out of scope per the
  // design's threat fence (spec §1.2), not a gap in the assertion.
  it("imports nothing from node:child_process", () => {
    const bindings = [
      ...source.matchAll(/(?:from|require\s*\(|import\s*\()\s*["']((?:node:)?child_process)["']/g),
    ].map((m) => m[1]);
    expect(bindings).toEqual([]);
  });

  // The binding assertion above is closed by EXECUTION, not by this line: a
  // module that still spawns unbounded cannot time out AC-3's hanging child.
  it("routes through the bounded spawn", () => {
    expect(source).toContain("spawnBounded(");
  });
});

describe("AC-3 — a constructed hanging child", () => {
  it("throws MutantRunInfraError when the child outlives the ceiling", CASE_TIMEOUT, () => {
    expect(() => runChild(ROOT, SLEEPING_SUITE, null, SMALL_CEILING_MS)).toThrow(
      MutantRunInfraError,
    );
  });

  // Without this negative case the proof above is satisfied by a runner that
  // throws for EVERY child — one that scores nothing at all.
  it("returns a numeric exit status for a healthy child inside the ceiling", CASE_TIMEOUT, () => {
    const { exitStatus } = runChild(ROOT, HEALTHY_SUITE, null, GENEROUS_CEILING_MS);
    expect(exitStatus).toBe(0);
  });
});

describe("AC-2 — the PRODUCTION default is the measured ceiling", () => {
  // Diff review round 3, P1, and it was a genuine miss against the ratified
  // plan rather than a reviewer stretch. The plan's own weaker-implementation
  // pass named this exact case: "the constant is exported and correct but the
  // call site passes `MUTANT_TIMEOUT_MS` — every AC-2 assertion passes and the
  // shipped ceiling is 180 s", and its neutralization pass added that AC-3 can
  // never exercise the default because every AC-3 case passes an EXPLICIT
  // ceiling. Both production call sites omit the argument; every other case
  // here supplies it. So `timeoutMs: number = 0` was invisible to all of them,
  // and a `0` timeout does not bound a child at all — the reviewer probed it:
  // a 200 ms child under `timeout: 0` ran to completion, status 0.
  //
  // The assertion is on what `spawnBounded` RECEIVED, never on the constant:
  // asserting the constant's value cannot prove the call site uses it.
  it("forwards BROWSER_MUTANT_TIMEOUT_MS when the caller names no ceiling", () => {
    seam.calls.length = 0;
    withSeam({ outcome: { kind: "exit", code: 0 }, ownGroup: true }, () =>
      // THREE arguments — today's production arity, exactly as
      // `runMutant` and `runBrowserSurface` call it.
      runChild(ROOT, HEALTHY_SUITE, null),
    );
    premiseHolds("the spawn seam recorded the call", seam.calls.length === 1);
    expect(seam.calls[0]!.timeoutMs).toBe(BROWSER_MUTANT_TIMEOUT_MS);
    // A ceiling of 0 or undefined bounds nothing; neither may reach the spawn.
    expect(seam.calls[0]!.timeoutMs).toBeGreaterThan(0);
  });
});

describe("AC-4 — the throw is attributed, not merely observed", () => {
  it("produces three distinguishable causes", CASE_TIMEOUT, () => {
    // PRODUCED by the constructed hang, not written down here.
    const timeoutCause = causeOf(() => runChild(ROOT, SLEEPING_SUITE, null, SMALL_CEILING_MS));

    // PRODUCED by a non-numeric death reaching the infra arm.
    const signalCause = causeOf(() =>
      withSeam(
        { outcome: { kind: "infra", signal: "SIGKILL", code: undefined }, ownGroup: true },
        () => runChild(ROOT, HEALTHY_SUITE, null, GENEROUS_CEILING_MS),
      ),
    );

    // PRODUCED by a sentinel-absent child, through the function that classifies
    // one. This file throws its own `MutantRunInfraError` on that path
    // (`runMutant`), so "it threw" proves nothing about which arm fired.
    const sentinel = classifyChild({ kind: "vitest", sentinelPresent: false, exitStatus: 0 });
    premiseHolds(
      "classifyChild returns an infra cause for a sentinel-absent child",
      typeof sentinel === "object",
    );
    const sentinelCause = typeof sentinel === "object" ? sentinel.infra : "";

    // Inequality of PRODUCED messages, never a literal match on any one of them:
    // re-wording a message cannot silently make two paths identical, and a
    // literal would red on every copy edit.
    //
    // The two shapes are deliberate. Timeout and signal are BOTH `runChild`
    // messages, so an implementation that collapses the arms makes them equal
    // and `toBe` fires. The sentinel cause is a CLAUSE that this file embeds in
    // a wider message (`runMutant`), so comparing it with `toBe` could never
    // fail — a whole error message is never equal to one of its own clauses,
    // which would be an assertion that cannot fail rather than one that passes.
    // Containment is the collapse that IS reachable there.
    expect(timeoutCause).not.toBe(signalCause);
    expect(timeoutCause).not.toContain(sentinelCause);
    expect(signalCause).not.toContain(sentinelCause);

    // Each cause is the one its own arm produced, not a fallthrough.
    expect(timeoutCause).not.toBe("DID NOT THROW");
    expect(signalCause).not.toBe("DID NOT THROW");
  });
});

describe("AC-5 — a signal death carries its signal and code", () => {
  // Two cases with DIFFERENT pairs, each asserted to carry its OWN values: a
  // single-case fixture is satisfied by hardcoding one pair into the message.
  const cases: ReadonlyArray<{ signal: NodeJS.Signals; code: string | undefined }> = [
    { signal: "SIGKILL", code: "ETIMEDOUT_REAPED" },
    { signal: "SIGSEGV", code: undefined },
  ];

  for (const { signal, code } of cases) {
    it(`preserves ${signal}/${String(code)}`, CASE_TIMEOUT, () => {
      const message = causeOf(() =>
        withSeam({ outcome: { kind: "infra", signal, code }, ownGroup: true }, () =>
          runChild(ROOT, HEALTHY_SUITE, null, GENEROUS_CEILING_MS),
        ),
      );
      expect(message).toContain(signal);
      if (code !== undefined) expect(message).toContain(code);

      // The OTHER case's signal must not appear, so a message that names every
      // signal it knows about cannot pass both cases.
      const other = cases.find((c) => c.signal !== signal);
      premiseHolds("the AC-5 table carries a second, different pair", other !== undefined);
      if (other) expect(message).not.toContain(other.signal);
    });
  }
});
