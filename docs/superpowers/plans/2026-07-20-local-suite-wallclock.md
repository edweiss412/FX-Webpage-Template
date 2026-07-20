# Local Suite Wall-Clock Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three spec'd levers — `test:fast` project overlap, parallel-project `pool: "threads"`, and a content-hash pretest codegen cache — per `docs/superpowers/specs/2026-07-20-local-suite-wallclock.md`.

<!-- spec-lint: ignore — file created by this plan -->
**Architecture:** Two new node `.mjs` scripts (`scripts/test-fast.mjs` runner, `scripts/pretest-gen.mjs` cache wrapper), a shared `_temp-` corpus-prefix constant, an env-gated (`VITEST_TEST_FAST=1`) parallel-project exclude + cacheDir switch, a one-line pool change, and three structural meta-tests in `tests/cross-cutting/`.

**Tech Stack:** vitest 4.1.5, node 20 (`.mjs`, `allowJs: true` in tsconfig), tsx 4.22.3, pnpm.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-20-local-suite-wallclock.md` (R2 revision, APPROVE'd R3).
- Commit per task, `--no-verify`, conventional commits (`infra:` / `test(infra):` / `feat(infra):` style; this is tooling — bare `infra:` per AGENTS.md invariant 6).
- No UI files, no DB, no migrations, no advisory locks, no §12.4 codes, no Supabase client calls (invariants 8/9/10 N/A; declared in spec §5).
- Strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — snippets below already comply (non-null `!` on regex groups, object-spread instead of `key: undefined`).
<!-- spec-lint: ignore — file created by this plan -->
- Meta-test inventory (spec §5): CREATES `tests/cross-cutting/pretest-gen-manifest.test.ts`, `tests/cross-cutting/corpus-temp-prefix.test.ts`, `tests/cross-cutting/test-fast-deferred.test.ts`. New tests land in the SERIAL project automatically (`BASE_INCLUDE` `tests/**/*.test.ts`, not matched by `PARALLEL_TEST_GLOBS` — `tests/cross-cutting/` is a serial dir). No `testMatch`/workflow wiring needed: `unit-suite.yml:80` runs the whole suite via `--shard`.
- No `pg_advisory*` → advisory-lock holder topology N/A.

---

### Task 1: Corpus `_temp-` prefix contract

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/helpers/corpusTemp.ts`
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/cross-cutting/corpus-temp-prefix.test.ts`
- Modify: `tests/help/fixture-range-parser.test.ts:27-29` (filter)
- Modify: `tests/sync/dev-routing.test.ts` (three temp-name consts: `TEMP_FIXTURE_NAME` line 81, `TEMP_AMBIGUOUS_NAME` line 298, `FLIP_FIXTURE_NAME` line 354)
<!-- spec-lint: ignore — file created by this plan -->
- Test: `tests/cross-cutting/corpus-temp-prefix.test.ts`

**Interfaces:**
<!-- spec-lint: ignore — file created by this plan -->
- Produces: `CORPUS_TEMP_PREFIX = "_temp-"` from `tests/helpers/corpusTemp.ts` (consumed by reader, writer, meta-test).

- [ ] **Step 1: Create the shared constant**

```ts
// tests/helpers/corpusTemp.ts
// Synthetic fixtures written into fixtures/shows/raw/ by serial tests MUST carry
// this prefix; corpus readers filter it out. This is what makes the corpus safe
// under test:fast's serial/parallel overlap (spec §4.1.2). Pinned by
// tests/cross-cutting/corpus-temp-prefix.test.ts.
export const CORPUS_TEMP_PREFIX = "_temp-";
```

- [ ] **Step 2: Write the failing meta-test**

```ts
// tests/cross-cutting/corpus-temp-prefix.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";

// Contract (spec §4.1.2): every synthetic fixture the serial writer places in
// fixtures/shows/raw/ carries CORPUS_TEMP_PREFIX, and the parallel corpus reader
// filters that prefix. Both sides are asserted against the SHARED constant (not
// against each other's source), so neither can drift silently. Failure mode
// caught: a fourth corpus write site with an unprefixed name (reader would list
// it mid-overlap and fail its parse loop).
const reader = readFileSync("tests/help/fixture-range-parser.test.ts", "utf8");
const writer = readFileSync("tests/sync/dev-routing.test.ts", "utf8");

describe("corpus temp-prefix contract", () => {
  it("prefix constant is the ratified literal", () => {
    expect(CORPUS_TEMP_PREFIX).toBe("_temp-");
  });

  it("reader imports the shared constant and filters it", () => {
    expect(reader).toContain('from "../helpers/corpusTemp"');
    expect(reader).toContain("!file.startsWith(CORPUS_TEMP_PREFIX)");
  });

  it("every corpus write site uses a prefix-derived const; no literal filename bypass", () => {
    expect(writer).toContain('from "../helpers/corpusTemp"');
    const writeSites = [...writer.matchAll(/writeFile\(\s*join\(FIXTURE_DIR,\s*([A-Z_]+)\)/g)].map(
      (m) => m[1]!,
    );
    // 6 write calls across 3 const names today (dev-routing lines 94/301/380/404/447/470).
    expect(writeSites.length).toBeGreaterThanOrEqual(6);
    for (const name of new Set(writeSites)) {
      expect(
        writer,
        `${name} must be defined as \`\${CORPUS_TEMP_PREFIX}…\``,
      ).toMatch(new RegExp(`const ${name} = \`\\$\\{CORPUS_TEMP_PREFIX\\}[^\`]+\\.md\``));
    }
    // No writeFile(join(FIXTURE_DIR, "literal.md")) escape hatch.
    expect(writer).not.toMatch(/writeFile\(\s*join\(FIXTURE_DIR,\s*["'`]/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run tests/cross-cutting/corpus-temp-prefix.test.ts`
Expected: FAIL — reader lacks import/filter; writer consts are plain string literals.

- [ ] **Step 4: Edit the reader**

In `tests/help/fixture-range-parser.test.ts`, add the import and extend the filter at lines 27-29:

```ts
import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";
```

```ts
    const fixtureFiles = readdirSync(rawDir)
      .filter((file) => file.endsWith(".md") && !file.startsWith(CORPUS_TEMP_PREFIX))
      .sort();
```

(The `pdfOnlyDir` listing at line 50 targets a different directory — untouched.)

- [ ] **Step 5: Edit the writer**

In `tests/sync/dev-routing.test.ts`, add the import and re-derive the three consts (values unchanged byte-for-byte):

```ts
import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";
```

```ts
const TEMP_FIXTURE_NAME = `${CORPUS_TEMP_PREFIX}mi1-no-version.md`;
```

```ts
  const TEMP_AMBIGUOUS_NAME = `${CORPUS_TEMP_PREFIX}version-ambiguous.md`;
```

```ts
const FLIP_FIXTURE_NAME = `${CORPUS_TEMP_PREFIX}flip-test.md`;
```

Add above the first const: `// Names MUST derive from CORPUS_TEMP_PREFIX — corpus readers filter this prefix (spec §4.1.2; pinned by tests/cross-cutting/corpus-temp-prefix.test.ts).`

- [ ] **Step 6: Run meta-test to verify it passes**

Run: `pnpm exec vitest run tests/cross-cutting/corpus-temp-prefix.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Fail-by-default check (AC-5), then revert the probe**

Temporarily change the reader filter to drop `!file.startsWith(CORPUS_TEMP_PREFIX)` → meta-test FAILS. Restore. Run the two touched suites green:
`pnpm exec vitest run tests/help/fixture-range-parser.test.ts tests/sync/dev-routing.test.ts` (dev-routing needs the local Supabase up — `pnpm preflight` first).

- [ ] **Step 8: Commit**

```bash
git add tests/helpers/corpusTemp.ts tests/cross-cutting/corpus-temp-prefix.test.ts tests/help/fixture-range-parser.test.ts tests/sync/dev-routing.test.ts
git commit --no-verify -m "test(infra): corpus _temp- prefix contract (spec 4.1.2)"
```

---

### Task 2: `TEST_FAST_DEFERRED` + env-gated exclude + cacheDir switch

**Files:**
- Modify: `vitest.projects.ts` (new export)
- Modify: `vitest.config.ts` (parallel-project exclude, root cacheDir spread)
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/cross-cutting/test-fast-deferred.test.ts`
<!-- spec-lint: ignore — file created by this plan -->
- Test: `tests/cross-cutting/test-fast-deferred.test.ts`

**Interfaces:**
- Produces: `TEST_FAST_DEFERRED: string[]` (repo-relative paths) from `vitest.projects.ts` — consumed by `vitest.config.ts`, Task 3's runner (mirrored), and the meta-test.

- [ ] **Step 1: Write the failing meta-test (deferred-set arms only; runner arms land in Task 3)**

```ts
// tests/cross-cutting/test-fast-deferred.test.ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PARALLEL_TEST_GLOBS, TEST_FAST_DEFERRED } from "@/vitest.projects";

// Spec §4.1.3 + §5#3. TEST_FAST_DEFERRED = parallel-set files asserting on-disk
// state a serial test mutates mid-run; test:fast excludes them from the overlap
// and re-runs them in a post-serial epilogue. Failure modes caught: a deferred
// file renamed away (silently vanishing from the epilogue); a FUTURE parallel
// test real-importing the generated dev-panel flag without being deferred.

function matchesParallel(file: string): boolean {
  return PARALLEL_TEST_GLOBS.some((g) => {
    const starIdx = g.indexOf("/**");
    if (starIdx >= 0) return file.startsWith(g.slice(0, starIdx + 1));
    return file === g;
  });
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

describe("TEST_FAST_DEFERRED contract", () => {
  it("every entry is a repo-relative path that exists and is parallel-set", () => {
    expect(TEST_FAST_DEFERRED.length).toBeGreaterThanOrEqual(1);
    for (const p of TEST_FAST_DEFERRED) {
      expect(p, `${p} must be a repo-relative path, not a glob`).not.toMatch(/[*{]/);
      expect(existsSync(p), `${p} must exist on disk`).toBe(true);
      expect(matchesParallel(p), `${p} must be in the parallel set`).toBe(true);
    }
  });

  it("discovery arm: parallel files real-importing devPanelPresent are deferred or mock it", () => {
    const parallelFiles = listFiles("tests")
      .map((p) => p.replaceAll("\\", "/"))
      .filter((p) => /\.test\.(ts|tsx)$/.test(p))
      .filter(matchesParallel);
    expect(parallelFiles.length).toBeGreaterThan(300);
    for (const p of parallelFiles) {
      const src = readFileSync(p, "utf8");
      if (!src.includes("__generated__/devPanelPresent")) continue;
      const mocked = src.includes('vi.mock("@/lib/admin/__generated__/devPanelPresent');
      const deferred = TEST_FAST_DEFERRED.includes(p);
      expect(
        mocked || deferred,
        `${p} real-imports devPanelPresent - vi.mock it or add to TEST_FAST_DEFERRED`,
      ).toBe(true);
    }
  });

  it("config wires the deferred set into the parallel project only under VITEST_TEST_FAST=1", () => {
    // Comment-proof: strip line comments before matching, and require BOTH the
    // gated binding and its use in the parallel project's exclude.
    const config = readFileSync("vitest.config.ts", "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(config).toMatch(
      /const testFastExcludes =[^;]*VITEST_TEST_FAST[^;]*===\s*"1"[^;]*TEST_FAST_DEFERRED/s,
    );
    expect(config).toMatch(/exclude:\s*\[[^\]]*\.\.\.testFastExcludes/s);
    expect(config).toMatch(/VITEST_TEST_FAST[^;]*cacheDir:\s*"node_modules\/\.vite-testfast"/s);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/cross-cutting/test-fast-deferred.test.ts`
Expected: FAIL — `TEST_FAST_DEFERRED` not exported.

- [ ] **Step 3: Add the export to `vitest.projects.ts`** (after `NIGHTLY_ONLY_EXCLUDES`, line 48)

```ts
// Parallel-set files that assert ON-DISK state a SERIAL test mutates mid-run
// (today: lib/admin/__generated__/devPanelPresent.ts, rewritten by
// tests/admin/withAdminDevFlagDevPanelPresent.test.ts and asserted `false` by
// DevToolsRow.absent). test:fast excludes these from the overlapped parallel
// phase (VITEST_TEST_FAST=1) and re-runs them in a post-serial epilogue when the
// file is guaranteed restored. Repo-relative PATHS, not globs - triple use:
// vitest exclude pattern, epilogue CLI filter, meta-test existsSync
// (tests/cross-cutting/test-fast-deferred.test.ts pins all of it; spec §4.1.3).
export const TEST_FAST_DEFERRED = [
  "tests/components/admin/settings/DevToolsRow.absent.test.tsx",
];
```

- [ ] **Step 4: Wire `vitest.config.ts`**

Import: add `TEST_FAST_DEFERRED` to the existing `vitest.projects.ts` import list. Below `nightlyExcludes` (line ~28):

```ts
// test:fast (scripts/test-fast.mjs) overlaps the serial and parallel projects as
// two concurrent processes. Under VITEST_TEST_FAST=1 the parallel project
// excludes TEST_FAST_DEFERRED (re-run in the runner's post-serial epilogue), and
// the Vite cache moves aside so the two concurrent vitest processes never share
// a deps-optimizer dir. Spec: docs/superpowers/specs/2026-07-20-local-suite-wallclock.md §4.1.3.
const testFastExcludes = process.env.VITEST_TEST_FAST === "1" ? TEST_FAST_DEFERRED : [];
```

Parallel project block gains an exclude (keep `configDefaults.exclude` — setting `exclude` overrides the default set):

```ts
      {
        extends: true,
        test: {
          name: "parallel",
          include: PARALLEL_TEST_GLOBS,
          exclude: [...configDefaults.exclude, ...testFastExcludes],
          fileParallelism: true,
        },
      },
```

Root of `defineConfig` (sibling of `plugins`/`test`, object-spread for `exactOptionalPropertyTypes`):

```ts
  ...(process.env.VITEST_TEST_FAST === "1" ? { cacheDir: "node_modules/.vite-testfast" } : {}),
```

- [ ] **Step 5: Run meta-test + partition guard**

Run: `pnpm exec vitest run tests/cross-cutting/test-fast-deferred.test.ts tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS (partition unchanged — exclude is empty when env unset).

- [ ] **Step 6: Behavioral exclude check**

Run: `VITEST_TEST_FAST=1 pnpm exec vitest run --project parallel tests/components/admin/settings/`
Expected: `DevToolsRow.absent.test.tsx` NOT in the run; `DevToolsRow.test.tsx` runs. Then without the env var: both run.

- [ ] **Step 7: Commit**

```bash
git add vitest.projects.ts vitest.config.ts tests/cross-cutting/test-fast-deferred.test.ts
git commit --no-verify -m "infra: TEST_FAST_DEFERRED env-gated exclude + testfast cacheDir (spec 4.1.3)"
```

---

<!-- spec-lint: ignore — file created by this plan -->
### Task 3: `scripts/test-fast.mjs` runner + `test:fast` script

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `scripts/test-fast.mjs`
- Modify: `package.json` (add `test:fast` script)
<!-- spec-lint: ignore — file created by this plan -->
- Modify: `tests/cross-cutting/test-fast-deferred.test.ts` (runner arms)
<!-- spec-lint: ignore — file created by this plan -->
- Test: `tests/cross-cutting/test-fast-deferred.test.ts`

**Interfaces:**
- Consumes: `TEST_FAST_DEFERRED` (mirrored as a literal — node can't import TS; the meta-test pins the mirror equal to the `vitest.projects.ts` export).

- [ ] **Step 1: Extend the meta-test with the runner arms (failing)**

<!-- spec-lint: ignore — file created by this plan -->
Append to `tests/cross-cutting/test-fast-deferred.test.ts`:

```ts
import { spawnSync } from "node:child_process";

describe("test-fast runner", () => {
  const runner = readFileSync("scripts/test-fast.mjs", "utf8");

  it("package.json test:fast chains pretest then the runner", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:fast"]).toBe("pnpm pretest && node scripts/test-fast.mjs");
    expect(pkg.scripts["pretest:fast"]).toBeUndefined();
  });

  it("runner mirror of TEST_FAST_DEFERRED equals the vitest.projects.ts export", () => {
    const m = /const TEST_FAST_DEFERRED = \[([^\]]*)\]/.exec(runner);
    expect(m, "runner must declare its TEST_FAST_DEFERRED mirror").not.toBeNull();
    const mirror = [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    expect(mirror).toEqual(TEST_FAST_DEFERRED);
  });

  it("runner refuses RUN_BUILD_ARTIFACT_GATE_TEST=1 before spawning anything", () => {
    const res = spawnSync("node", ["scripts/test-fast.mjs"], {
      env: { ...process.env, RUN_BUILD_ARTIFACT_GATE_TEST: "1" },
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("RUN_BUILD_ARTIFACT_GATE_TEST=1 is not supported");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/cross-cutting/test-fast-deferred.test.ts`
<!-- spec-lint: ignore — file created by this plan -->
Expected: FAIL — `scripts/test-fast.mjs` missing.

- [ ] **Step 3: Write the runner**

```js
#!/usr/bin/env node
// scripts/test-fast.mjs - local full-suite overlap runner (spec §4.1).
// Phase 1: serial project streams live while the parallel project runs
// concurrently (buffered + teed to a crash-safe log). Phase 2 (epilogue):
// TEST_FAST_DEFERRED files re-run with default config. Coverage is identical to
// `pnpm test`; only phase timing changes. Exit code: serial's, else parallel's,
// else the epilogue's.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

// Mirror of vitest.projects.ts TEST_FAST_DEFERRED (node cannot import TS).
// tests/cross-cutting/test-fast-deferred.test.ts pins the two lists equal.
const TEST_FAST_DEFERRED = [
  "tests/components/admin/settings/DevToolsRow.absent.test.tsx",
];

if (process.env.RUN_BUILD_ARTIFACT_GATE_TEST === "1") {
  console.error(
    "[test:fast] RUN_BUILD_ARTIFACT_GATE_TEST=1 is not supported: the build-artifact " +
      "gate's `pnpm build` child rewrites lib/admin/__generated__/devPanelPresent.ts " +
      "mid-run, which the serial/parallel overlap cannot tolerate. Use `pnpm test`.",
  );
  process.exit(1);
}

const LOG_DIR = "node_modules/.cache/fxav-test-fast";
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = `${LOG_DIR}/parallel.log`;
writeFileSync(LOG_PATH, "");

const children = new Set();
let interrupted = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    interrupted = true;
    for (const child of children) child.kill(sig);
  });
}

function vitest(args, opts) {
  const child = spawn("pnpm", ["exec", "vitest", "run", ...args], opts);
  children.add(child);
  return child;
}

function done(child) {
  return new Promise((resolve) => {
    child.on("close", (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
}

// Parallel phase: VITEST_TEST_FAST=1 (deferred excluded, cacheDir moved aside).
let parallelBuf = "";
const parallel = vitest(["--project", "parallel"], {
  env: { ...process.env, VITEST_TEST_FAST: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [parallel.stdout, parallel.stderr]) {
  stream.on("data", (chunk) => {
    parallelBuf += chunk;
    appendFileSync(LOG_PATH, chunk);
  });
}
const parallelDone = done(parallel).then((code) => {
  if (code !== 0) {
    console.error(
      `\n[test:fast] parallel project FAILED (exit ${code}) - full output after the serial phase (also teed to ${LOG_PATH})\n`,
    );
  }
  return code;
});

// Serial phase: streams live (the long pole).
const serialDone = done(vitest(["--project", "serial"], { stdio: "inherit" }));

const [serialCode, parallelCode] = await Promise.all([serialDone, parallelDone]);

console.log("\n[test:fast] ── parallel project output ──\n");
process.stdout.write(parallelBuf);

// Epilogue: deferred files under DEFAULT config (no VITEST_TEST_FAST) - the
// serial writer has restored devPanelPresent.ts by now.
// A Ctrl-C during phase 1 must NOT spawn the epilogue (it would need a second
// interrupt to stop). Interrupted runs exit non-zero without the epilogue.
if (interrupted) {
  console.error("\n[test:fast] interrupted - skipping epilogue\n");
  process.exit(serialCode !== 0 ? serialCode : parallelCode !== 0 ? parallelCode : 130);
}

console.log("\n[test:fast] ── epilogue (deferred files) ──\n");
const epilogueCode = await done(
  vitest([...TEST_FAST_DEFERRED, "--project", "parallel"], { stdio: "inherit" }),
);

process.exit(serialCode !== 0 ? serialCode : parallelCode !== 0 ? parallelCode : epilogueCode);
```

- [ ] **Step 4: Add the package script** (in `package.json` scripts, near `"test"`)

```json
    "test:fast": "pnpm pretest && node scripts/test-fast.mjs",
```

- [ ] **Step 5: Run meta-test to verify it passes**

Run: `pnpm exec vitest run tests/cross-cutting/test-fast-deferred.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Epilogue smoke (cheap, no full suite)**

Run: `pnpm exec vitest run tests/components/admin/settings/DevToolsRow.absent.test.tsx --project parallel`
Expected: PASS, 1 file — proves the epilogue invocation shape (path filter + `--project parallel`) selects exactly the deferred file.

- [ ] **Step 7: Commit**

```bash
git add scripts/test-fast.mjs package.json tests/cross-cutting/test-fast-deferred.test.ts
git commit --no-verify -m "feat(infra): test:fast overlap runner with deferred epilogue (spec 4.1)"
```

---

### Task 4: Parallel project `pool: "threads"`

**Files:**
- Modify: `vitest.config.ts` (parallel project block)

- [ ] **Step 1: Edit the config**

In the parallel project block (after `include`):

```ts
          // pool "threads": measured 2.3× vs the forks default on this project
          // (74.2s vs 174.4s, 511 files green; spec §3.2). isolate:false was
          // spiked and is a DEAD lever - mass cross-file mock/DOM leakage
          // (spec §1.1). P2 (serial-set audit) rebases over this line.
          pool: "threads",
```

- [ ] **Step 2: Verify green**

Run: `pnpm exec vitest run --project parallel 2>&1 | tail -4`
Expected: all files pass (511+ files; count grew if main added parallel tests). Duration materially below a forks run.

- [ ] **Step 3: Partition meta-test still green**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit --no-verify -m "infra: parallel project pool=threads, measured 2.3x (spec 4.2)"
```

---

<!-- spec-lint: ignore — file created by this plan -->
### Task 5: `scripts/pretest-gen.mjs` cache wrapper + manifest guard

**Files:**
<!-- spec-lint: ignore — file created by this plan -->
- Create: `scripts/pretest-gen.mjs`
- Modify: `package.json` (the four `pre*` hooks, lines 28-32)
<!-- spec-lint: ignore — file created by this plan -->
- Create: `tests/cross-cutting/pretest-gen-manifest.test.ts`
<!-- spec-lint: ignore — file created by this plan -->
- Test: `tests/cross-cutting/pretest-gen-manifest.test.ts`

**Interfaces:**
<!-- spec-lint: ignore — file created by this plan -->
- Produces: `MANIFEST` export from `scripts/pretest-gen.mjs` (array of `{ name, script, inputs, inputDirs?, output }`) — consumed by the meta-test (allowJs import precedent: `tests/admin/withAdminDevFlagDevPanelPresent.test.ts:4` imports a `.mjs`).

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/cross-cutting/pretest-gen-manifest.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { MANIFEST } from "@/scripts/pretest-gen.mjs";

// Staleness guard (spec §4.3): the cache wrapper skips a generator when its
// manifest inputs are unchanged, so ANY read the generator performs outside its
// manifest row is a silent-staleness hole. Three arms: (a) transitive
// local-import closure ⊆ inputs; (b) every repo-path-shaped string literal in
// reached sources ∈ inputs ∪ output ∪ inputDirs; (c) no process.env reads.
// Plus: the four pre* hooks must invoke the wrapper. Failure modes caught: a
// generator gains a new input file/import/env dependency without a manifest row
// (stale committed artifacts); a hook silently reverts to the uncached chain.

const PATH_LITERAL =
  /["'`]((?:docs|lib|supabase|scripts|app|components|tests|fixtures|public|\.github)\/[^"'`\n]+)["'`]/g;
const STATIC_IMPORT = /(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g;
const DYNAMIC_IMPORT_LITERAL = /import\(\s*["'](\.[^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_NONLITERAL = /import\(\s*[^"')\s]/;

function resolveLocal(fromFile: string, spec: string): string {
  const base = normalize(join(dirname(fromFile), spec)).replaceAll("\\", "/");
  for (const candidate of [base, `${base}.ts`, `${base}.mts`, `${base}.mjs`, `${base}.js`]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(`cannot resolve import ${spec} from ${fromFile}`);
}

function importClosure(entry: string): string[] {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const src = readFileSync(file, "utf8");
    expect(DYNAMIC_IMPORT_NONLITERAL.test(src), `${file}: non-literal dynamic import`).toBe(false);
    for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT_LITERAL]) {
      for (const m of src.matchAll(re)) {
        const resolved = resolveLocal(file, m[1]!);
        if (!seen.has(resolved)) {
          seen.add(resolved);
          queue.push(resolved);
        }
      }
    }
  }
  return [...seen];
}

describe("pretest-gen manifest staleness guard", () => {
  it("covers all four generators", () => {
    expect(MANIFEST.map((t: { name: string }) => t.name).sort()).toEqual([
      "gen:admin-tables",
      "gen:email-boundaries",
      "gen:traceability",
      "gen:watermark-symbols",
    ]);
  });

  it.each(MANIFEST.map((t: { name: string }) => [t.name] as const))(
    "%s: import closure + path literals + env reads are manifest-covered",
    (name) => {
      const t = MANIFEST.find((x: { name: string }) => x.name === name)! as {
        script: string;
        inputs: string[];
        inputDirs?: { dir: string; pattern: string }[];
        output: string;
      };
      const closure = importClosure(t.script);
      for (const file of closure) {
        expect(t.inputs, `${file} reached by import walk - add to inputs`).toContain(file);
        const src = readFileSync(file, "utf8");
        expect(/process\.env/.test(src), `${file} reads process.env - extend manifest schema first`).toBe(
          false,
        );
        for (const m of src.matchAll(PATH_LITERAL)) {
          const lit = m[1]!;
          const covered =
            t.inputs.includes(lit) ||
            t.output === lit ||
            (t.inputDirs ?? []).some((d) => lit.startsWith(d.dir));
          expect(covered, `${file}: path literal "${lit}" not in manifest`).toBe(true);
        }
      }
    },
  );

  it("inputDirs enumerate with the generator's own filter", () => {
    const trace = MANIFEST.find((t: { name: string }) => t.name === "gen:traceability")! as {
      inputDirs?: { dir: string; pattern: string }[];
    };
    const dirs = trace.inputDirs ?? [];
    expect(dirs.length).toBe(1);
    const d = dirs[0]!;
    expect(d.pattern).toBe("^\\d{2}-.+\\.md$");
    expect(readdirSync(d.dir).filter((e) => new RegExp(d.pattern).test(e)).length).toBeGreaterThan(3);
  });

  it("all four pre* hooks invoke the wrapper", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const hook of ["pretypecheck", "prelint", "pretest", "prebuild"]) {
      expect(pkg.scripts[hook], `${hook} must use the cache wrapper`).toBe(
        "node scripts/pretest-gen.mjs",
      );
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/cross-cutting/pretest-gen-manifest.test.ts`
<!-- spec-lint: ignore — file created by this plan -->
Expected: FAIL — `scripts/pretest-gen.mjs` missing.

- [ ] **Step 3: Write the wrapper**

```js
#!/usr/bin/env node
// scripts/pretest-gen.mjs - content-hash cache for the four pre*-hook generators
// (spec §4.3). Skips a generator when sha256(inputs + current output) matches the
// stamp; PRETEST_GEN_FORCE=1 bypasses. Output content is part of the hash, so a
// hand-edited or clobbered generated file always regenerates. Manifest coverage
// is pinned by tests/cross-cutting/pretest-gen-manifest.test.ts (import-closure +
// path-literal + env-read arms) - extend the manifest BEFORE adding an input to
// any generator.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST = [
  {
    name: "gen:admin-tables",
    script: "scripts/generate-admin-tables.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "scripts/generate-admin-tables.ts",
    ],
    output: "lib/audit/admin-tables.generated.ts",
  },
  {
    name: "gen:watermark-symbols",
    script: "scripts/extract-watermark-symbols.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "scripts/extract-watermark-symbols.ts",
    ],
    output: "lib/audit/watermark-symbols.generated.ts",
  },
  {
    name: "gen:email-boundaries",
    script: "scripts/extract-email-boundaries.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md",
      "scripts/extract-email-boundaries.ts",
    ],
    output: "lib/audit/email-boundaries.generated.ts",
  },
  {
    name: "gen:traceability",
    script: "scripts/generate-traceability.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      ".github/workflows/x-audits.yml",
      "scripts/generate-traceability.ts",
      "scripts/extract-watermark-symbols.ts",
    ],
    inputDirs: [
      { dir: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1", pattern: "^\\d{2}-.+\\.md$" },
    ],
    output: "docs/superpowers/plans/coverage.md",
  },
];

const STAMP_DIR = "node_modules/.cache/fxav-pretest-gen";
const STAMP_PATH = join(STAMP_DIR, "stamps.json");

function hashTarget(target) {
  const hash = createHash("sha256");
  const files = [...target.inputs];
  for (const d of target.inputDirs ?? []) {
    const re = new RegExp(d.pattern);
    for (const entry of readdirSync(d.dir)
      .filter((e) => re.test(e))
      .sort()) {
      files.push(join(d.dir, entry));
    }
  }
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  hash.update(existsSync(target.output) ? readFileSync(target.output) : "OUTPUT-MISSING");
  return hash.digest("hex");
}

function main() {
  mkdirSync(STAMP_DIR, { recursive: true });
  let stamps = {};
  try {
    stamps = JSON.parse(readFileSync(STAMP_PATH, "utf8"));
  } catch {
    stamps = {};
  }
  const force = process.env.PRETEST_GEN_FORCE === "1";
  let dirty = false;
  for (const target of MANIFEST) {
    if (!force && stamps[target.name] === hashTarget(target)) continue;
    console.log(`[pretest-gen] ${target.name}: regenerating`);
    execFileSync("pnpm", ["exec", "tsx", target.script], { stdio: "inherit" });
    stamps[target.name] = hashTarget(target);
    dirty = true;
  }
  if (dirty || !existsSync(STAMP_PATH)) {
    writeFileSync(STAMP_PATH, JSON.stringify(stamps, null, 2));
  }
}

// Import-safe (the meta-test imports MANIFEST): run only when invoked directly.
// Guard shape mirrors scripts/with-admin-dev-flag.mjs:281.
const invokedDirectly = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (invokedDirectly) main();
```

- [ ] **Step 4: Rewire the four hooks** (`package.json`, each of `pretypecheck`/`prelint`/`pretest`/`prebuild`)

```json
    "pretypecheck": "node scripts/pretest-gen.mjs",
    "prelint": "node scripts/pretest-gen.mjs",
    "pretest": "node scripts/pretest-gen.mjs",
    "prebuild": "node scripts/pretest-gen.mjs",
```

- [ ] **Step 5: Run meta-test — arm (b) is a READ-CALL guard, not a literal guard**

Sweep run at plan time (`rg -n 'readFileSync\(|readdirSync\(|existsSync\(|createReadStream\(' scripts/generate-admin-tables.ts scripts/extract-watermark-symbols.ts scripts/extract-email-boundaries.ts scripts/generate-traceability.ts`) — complete output, every hit dispositioned:

| Read call | Disposition |
| --- | --- |
| `generate-admin-tables.ts:57` `readFileSync(SPEC_PATH)` | const resolves to spec literal — manifest input ✓ |
| `extract-watermark-symbols.ts:165` `readFileSync(SPEC_PATH)` | same ✓ |
| `extract-email-boundaries.ts:251-252` `readFileSync(SPEC_PATH)` / `readFileSync(PLAN_PATH)` | both manifest inputs ✓ |
| `generate-traceability.ts` lines 175 and 178 `readdirSync(dir)` / `readFileSync(join(dir, entry))` | `readPlanCorpus` — covered by the `inputDirs` row; `COMPUTED_READS` pin |
| `generate-traceability.ts` lines 217 and 367 `readFileSync(specPath)` | parameter; sole call sites pass `SPEC_PATH` — `COMPUTED_READS` pin |
| `generate-traceability.ts:369` `existsSync/readFileSync(workflowPath)` | parameter; call site passes `WORKFLOW_PATH` — manifest input, `COMPUTED_READS` pin |

Why arm (b) guards read CALLS and not all path-shaped literals: `extract-email-boundaries.ts` lines 45-53 and 141-207 holds ~24 repo-path literals that are canonicalization DATA (boundary-table keys such as a boundary-table path key such as the discard-route entry), never read from disk. An all-literals arm would demand a ~25-row allowlist that churns with every boundary-table edit while proving nothing. (Spec §4.3 arm (b), R4 refinement.)

The meta-test's arm (b) therefore scans each reached source for read-call arguments and requires each to be an inline covered literal, an UPPER_SNAKE const resolving in-file to a covered literal, or a `COMPUTED_READS` entry:

```ts
// Reads whose argument is a parameter or computed path; each pinned to the
// manifest row that covers it. A new computed read fails until dispositioned.
const COMPUTED_READS: Record<string, string[]> = {
  "scripts/generate-traceability.ts": ["specPath", "workflowPath", "join(dir, entry)"],
};
```

Also add `lib/audit/watermark-symbols.generated.ts` awareness: `extract-watermark-symbols.ts` is in `gen:traceability`'s import closure, and its `OUT_PATH` write target is that generator's OWN output, not traceability's — arm (b) covers reads only, so no manifest row is needed there.

Run: `pnpm exec vitest run tests/cross-cutting/pretest-gen-manifest.test.ts`
Expected: PASS.

- [ ] **Step 6: Behavioral cache checks (AC-3 shape)**

```bash
pnpm pretest                      # cold: all four regenerate
time pnpm pretest                 # warm: zero regenerations, target <2s
git status --porcelain            # empty — outputs byte-identical
touch docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md  # mtime only — content hash unchanged
time pnpm pretest                 # still warm (<2s) — content-hash, not mtime
printf '\n' >> docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md
pnpm pretest                      # exactly gen:email-boundaries + gen:traceability regenerate
git checkout -- docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md
PRETEST_GEN_FORCE=1 pnpm pretest  # all four regenerate
git status --porcelain            # empty
```

- [ ] **Step 7: Fail-by-default check (AC-5), then revert the probe**

Temporarily remove `scripts/extract-watermark-symbols.ts` from `gen:traceability`'s inputs → meta-test arm (a) FAILS (`reached by import walk`). Restore.

- [ ] **Step 8: Commit**

```bash
git add scripts/pretest-gen.mjs package.json tests/cross-cutting/pretest-gen-manifest.test.ts
git commit --no-verify -m "feat(infra): content-hash pretest codegen cache + manifest staleness guard (spec 4.3)"
```

---

### Task 6: Full-suite verification + quiet-box measurements (AC-1, AC-4)

**Files:** none created — verification + PR-body data.

- [ ] **Step 1: Check box contention.** `uptime; pgrep -fl 'vitest.mjs run' | grep -v $$`. If sibling worktree runs are still executing vitest, serial-phase runs collide on the shared local Supabase DB — wait or coordinate; do NOT interleave.
- [ ] **Step 2: Baseline.** `time pnpm test` (records file/test totals + wall).
- [ ] **Step 3: Overlap run.** `time pnpm test:fast`. Assert: exit 0; file/test totals across overlap + epilogue equal the baseline totals; wall < baseline by roughly the parallel-phase wall.
- [ ] **Step 4: AC-1 negative probes.** Add a temporarily failing test in a serial dir (`tests/cross-cutting/`), run `pnpm test:fast` → non-zero exit. Delete. Repeat with a failing test in a parallel dir (`tests/components/`) → non-zero, plus the immediate `[test:fast] parallel project FAILED` stderr line. Delete.
- [ ] **Step 4b: AC-5 third probe (deferred-set fail-by-default).** Temporarily rename `tests/components/admin/settings/DevToolsRow.absent.test.tsx` to a temporary `absent2` name; run `pnpm exec vitest run tests/cross-cutting/test-fast-deferred.test.ts` → FAILS (`must exist on disk`). Rename back; re-run → PASS.
- [ ] **Step 4c: AC-2 CI arm (explicit).** After the PR is open, confirm all 8 `unit-suite` legs are green on the real GitHub Actions run under `pool: "threads"` (`gh pr checks <PR#> --watch`, then `gh pr view <PR#> --json mergeStateStatus` = CLEAN). Local green is NOT sufficient for this AC.
- [ ] **Step 5: Pre-push gates** (memory: scoped green ≠ green): `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.
- [ ] **Step 6: Record numbers** for the PR body: baseline `pnpm test` wall, `test:fast` wall, warm/cold pretest timings, box load context. If the box never quiets, record best-available numbers WITH the load caveat — honesty over theater.
- [ ] **Step 7: Commit** any stray formatting only if gates required it; otherwise nothing to commit.

---

## Self-Review Notes

- Spec coverage: §4.1 → T3, §4.1.2 → T1, §4.1.3 → T2, §4.2 → T4, §4.3 → T5, §6 ACs → T1 S7 / T2 S6 / T3 S5-6 / T4 S2 / T5 S6-7 / T6. No gaps.
- Type consistency: `TEST_FAST_DEFERRED` (string[] paths) same name/type in projects/config/runner/meta-test; `MANIFEST` entry shape `{ name, script, inputs, inputDirs?, output }` consistent between wrapper and meta-test casts.
- Snippet typecheck notes: non-null `!` on all regex-group indexing (`noUncheckedIndexedAccess`); cacheDir via conditional spread (`exactOptionalPropertyTypes`); `.mjs` import relies on `allowJs: true` (tsconfig line 5, precedent `withAdminDevFlagDevPanelPresent.test.ts`). Run `pnpm typecheck` at each task's test step — it is cheap after T5 (cached hooks).
- Reconciliation sweeps: T5 S5 carries the exact reconcile procedure for path-literal findings (grep-driven at implementation time — the arm (b) run IS the sweep).
