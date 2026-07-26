# CI-dark coverage PR1 — live-entry toolchain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the e2e harness toolchain fetching itself over the network, fix the one dark spec that a per-call-site alias list can fix, and remove the one it cannot.

**Architecture:** A single helper module owns both toolchain invocations (`esbuild` for the browser bundle, the Tailwind CLI for harness CSS) and calls the **local** binaries instead of `pnpm dlx`. Aliases stay explicit per call site — the helper carries no resolver policy (that was descoped; see spec §10.1). A filesystem-walked meta-test then forbids any other file from naming a toolchain binary.

**Tech Stack:** TypeScript, Playwright (standalone config), vitest (serial project), esbuild 0.28.0, `@tailwindcss/cli` 4.2.4, pnpm.

**Spec:** `docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md` §3.

Files this plan CREATES are written unbackticked (tests/e2e/helpers/liveEntryToolchain.ts, its two unit tests, tests/e2e/\_metaLiveEntryToolchain.test.ts, tests/infra/tailwindVersionParity.test.ts) so they are not read as citations to existing code.

## Global Constraints

- **Worktree:** `/Users/ericweiss/FX-worktrees/ci-dark-coverage`, branch `feat/ci-dark-coverage`. Never work in the main checkout (`AGENTS.md` invariant 11).
- **TDD per task** — failing test, minimal implementation, passing test, commit (`AGENTS.md` invariant 1). No exceptions.
- **Commit style:** `<type>(<scope>): <summary>`, scope `e2e` or `infra` for this PR.
- **Never `git checkout -- <file>`** to undo work; it wipes uncommitted changes (memory: `feedback_backticks_in_commit_messages_execute`).
- **esbuild is pinned at exactly `0.28.0`** (`package.json:107`) and is already installed. `@tailwindcss/cli` must be pinned to exactly `4.2.4`.
- **The Tailwind CLI's binary is named `tailwindcss`**, not `@tailwindcss/cli`. The `tailwindcss` package declares no `bin` in v4, so there is no collision.
- **Do not ban `child_process`** anywhere in this PR: twelve files under `tests/e2e/**` legitimately spawn `tsx`, `psql`, or seeds.
- **Verified counts at plan time:** 8 esbuild call sites, 28 Tailwind call sites, **36 total across 29 files**. Re-derive before asserting a number in a test; `main` moves fast.

---

## File Structure

| File | Responsibility |
| --- | --- |
| tests/e2e/helpers/liveEntryToolchain.ts | **Create.** The only place that invokes a toolchain binary. Exports `bundleLiveEntry` and `buildEntryCss`. |
| tests/e2e/_metaLiveEntryToolchain.test.ts | **Create.** Filesystem-walked guard: no other file names a toolchain binary; only the helper imports `esbuild`. |
| tests/infra/tailwindVersionParity.test.ts | **Create.** Resolved `@tailwindcss/cli` and `tailwindcss` agree on major+minor. |
| `package.json` | **Modify.** Add `"@tailwindcss/cli": "4.2.4"` to `devDependencies`. |
| 8 esbuild spec files | **Modify.** Replace the `execFileSync("pnpm", ["dlx", "esbuild@0.28.0", …])` block with `bundleLiveEntry(…)`. |
| 28 Tailwind spec files | **Modify.** Replace the entry-CSS write + `execFileSync("pnpm", ["dlx", "@tailwindcss/cli@4.2.4", …])` block with `buildEntryCss(…)`. |
| `tests/e2e/resolve-label-layout.spec.ts` | **Modify.** Add the two aliases its sibling already passes. |
| `tests/e2e/standalone.config.ts` | **Modify.** Remove `packlist-rescan-recovery` from `testMatch`. |

---

### Task 1: The bundler half of the helper

**Files:**
- Create: tests/e2e/helpers/liveEntryToolchain.ts
- Test: tests/e2e/helpers/liveEntryToolchain.bundle.test.ts

**Interfaces:**
- Produces: `bundleLiveEntry(opts: BundleOptions): void` where
  `BundleOptions = { entry: string; outFile: string; aliases?: Record<string, string>; externals?: string[] }`.
  All paths absolute. `aliases` maps an import specifier to an absolute stub path. `externals` defaults to `["node:fs"]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/helpers/liveEntryToolchain.bundle.test.ts
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleLiveEntry } from "./liveEntryToolchain";

const ROOT = process.cwd();

describe("bundleLiveEntry", () => {
  it("bundles a live entry with explicit aliases and no network fetch", () => {
    const work = mkdtempSync(join(tmpdir(), "bundle-helper-"));
    const outFile = join(work, "bundle.js");
    bundleLiveEntry({
      entry: join(ROOT, "tests/e2e/_compactAlertCardLiveEntry.tsx"),
      outFile,
      aliases: {
        "node:crypto": join(ROOT, "tests/e2e/_nodeCryptoStub.ts"),
        "next/navigation": join(ROOT, "tests/e2e/_nextNavigationStub.ts"),
      },
    });
    expect(existsSync(outFile)).toBe(true);
    // A real bundle of this tree is ~900kb; a stub or an empty file is not.
    expect(statSync(outFile).size).toBeGreaterThan(100_000);
  });

  it("throws a named error when the entry does not exist", () => {
    expect(() =>
      bundleLiveEntry({ entry: join(ROOT, "tests/e2e/_nope.tsx"), outFile: join(tmpdir(), "x.js") }),
    ).toThrow(/entry does not exist/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/e2e/helpers/liveEntryToolchain.bundle.test.ts --project serial`
Expected: FAIL — cannot resolve `./liveEntryToolchain`.

- [ ] **Step 3: Write minimal implementation**

```ts
// tests/e2e/helpers/liveEntryToolchain.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const REPO_ROOT = process.cwd();

export interface BundleOptions {
  /** Absolute path to the harness entry .tsx */
  entry: string;
  /** Absolute path of the bundle to write */
  outFile: string;
  /** Import specifier -> absolute stub path. Explicit per call site by design. */
  aliases?: Record<string, string>;
  /** Extra externals; `node:fs` is always included. */
  externals?: string[];
}

/**
 * Bundle a harness entry for the browser using the LOCAL esbuild binary.
 *
 * Local, not `pnpm dlx`: esbuild is already a devDependency at the exact pin
 * the call sites used to fetch, so `dlx` bought a network round-trip and a
 * second copy. See spec §2.4.
 */
export function bundleLiveEntry({ entry, outFile, aliases = {}, externals = [] }: BundleOptions): void {
  if (!existsSync(entry)) throw new Error(`bundleLiveEntry: entry does not exist: ${entry}`);
  if (!existsSync(dirname(outFile))) {
    throw new Error(`bundleLiveEntry: output directory does not exist: ${dirname(outFile)}`);
  }
  execFileSync(
    "pnpm",
    [
      "exec",
      "esbuild",
      entry,
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      ...["node:fs", ...externals].map((e) => `--external:${e}`),
      ...Object.entries(aliases).map(([spec, target]) => `--alias:${spec}=${target}`),
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${outFile}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/e2e/helpers/liveEntryToolchain.bundle.test.ts --project serial`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/liveEntryToolchain.ts tests/e2e/helpers/liveEntryToolchain.bundle.test.ts
git commit -m "feat(e2e): bundle harness entries with the local esbuild, not pnpm dlx"
```

---

### Task 2: Pin the Tailwind CLI and prove the versions agree

**Files:**
- Modify: `package.json` (devDependencies)
- Create: tests/infra/tailwindVersionParity.test.ts

**Interfaces:**
- Consumes: nothing.
- Produces: a resolvable `tailwindcss` binary via `pnpm exec`, used by Task 3.

- [ ] **Step 1: Write the failing test**

```ts
// tests/infra/tailwindVersionParity.test.ts
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const minor = (v: string): string => v.split(".").slice(0, 2).join(".");

describe("tailwind toolchain version parity", () => {
  it("resolves @tailwindcss/cli and tailwindcss to the same major.minor", () => {
    // RESOLVED versions, not package.json text: `tailwindcss` is a range, so the
    // manifest can agree while the installed tree does not.
    const cli = require_("@tailwindcss/cli/package.json") as { version: string };
    const core = require_("tailwindcss/package.json") as { version: string };
    expect(minor(cli.version)).toBe(minor(core.version));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/infra/tailwindVersionParity.test.ts --project serial`
Expected: FAIL — `Cannot find module '@tailwindcss/cli/package.json'`.

- [ ] **Step 3: Add the dependency**

```bash
pnpm add -D -E @tailwindcss/cli@4.2.4
```

Verify the manifest gained an exact pin (no `^`):

```bash
node -e "console.log(require('./package.json').devDependencies['@tailwindcss/cli'])"   # -> 4.2.4
pnpm exec tailwindcss --help >/dev/null && echo "binary resolves"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/infra/tailwindVersionParity.test.ts --project serial`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tests/infra/tailwindVersionParity.test.ts
git commit -m "infra: pin @tailwindcss/cli 4.2.4 locally and gate version parity"
```

---

### Task 3: The CSS half of the helper

**Files:**
- Modify: tests/e2e/helpers/liveEntryToolchain.ts
- Test: tests/e2e/helpers/liveEntryToolchain.css.test.ts

**Interfaces:**
- Produces: `buildEntryCss(opts: CssOptions): void` where
  `CssOptions = { sources: string[]; outFile: string; workDir: string }`. `sources` are absolute paths fed to `@source`; the helper appends `app/globals.css` itself and writes the intermediate entry CSS into `workDir`.

**Superseded during execution — read this before following the snippet below.** The test as drafted here asserts on the CLI's emitted stylesheet, and that assertion is **vacuous**: measured, building this entry with and without its `@source` lines yields byte-identical output (161016 bytes both ways, zero classes unique to either), because `app/globals.css:1` is `@import "tailwindcss"` with automatic content detection. Deleting the helper's `@source` mapping left the drafted assertion green.

The shipped test therefore asserts the helper's own output — the intermediate entry stylesheet it writes — which two mutations (drop the mapping; reorder sources after globals) both turn red. See commit `4684b5d89`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/helpers/liveEntryToolchain.css.test.ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEntryCss } from "./liveEntryToolchain";

const ROOT = process.cwd();

describe("buildEntryCss", () => {
  it("emits CSS containing a utility used only by the named source", () => {
    const work = mkdtempSync(join(tmpdir(), "css-helper-"));
    const outFile = join(work, "out.css");
    buildEntryCss({
      sources: [join(ROOT, "tests/e2e/_compactAlertCardLiveEntry.tsx")],
      outFile,
      workDir: work,
    });
    const css = readFileSync(outFile, "utf8");
    // Proves Tailwind actually scanned the source rather than emitting a shell:
    // globals.css alone does not define utility classes.
    expect(css.length).toBeGreaterThan(1_000);
    expect(css).toMatch(/--color-|:root|\.flex\b/);
  });

  it("rejects an empty source list rather than emitting an unstyled sheet", () => {
    const work = mkdtempSync(join(tmpdir(), "css-helper-"));
    expect(() => buildEntryCss({ sources: [], outFile: join(work, "o.css"), workDir: work })).toThrow(
      /at least one source/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/e2e/helpers/liveEntryToolchain.css.test.ts --project serial`
Expected: FAIL — `buildEntryCss` is not exported.

- [ ] **Step 3: Add the implementation**

Append to tests/e2e/helpers/liveEntryToolchain.ts:

```ts
import { readFileSync, writeFileSync } from "node:fs";

export interface CssOptions {
  /** Absolute paths listed as `@source` entries. */
  sources: string[];
  /** Absolute path of the stylesheet to write. */
  outFile: string;
  /** Directory for the intermediate entry CSS. */
  workDir: string;
}

/**
 * Build harness CSS with the LOCAL Tailwind CLI.
 *
 * The helper reads `app/globals.css` itself: all 28 call sites did so
 * identically, so the path lives here once instead of 28 times.
 * The binary is `tailwindcss` (the package is `@tailwindcss/cli`).
 */
export function buildEntryCss({ sources, outFile, workDir }: CssOptions): void {
  if (sources.length === 0) throw new Error("buildEntryCss: needs at least one source");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  const entryCss = join(workDir, "entry.css");
  writeFileSync(entryCss, [...sources.map((s) => `@source "${s}";`), globals].join("\n"));
  execFileSync("pnpm", ["exec", "tailwindcss", "-i", entryCss, "-o", outFile], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    timeout: 120_000,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/e2e/helpers/liveEntryToolchain.css.test.ts --project serial`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/liveEntryToolchain.ts tests/e2e/helpers/liveEntryToolchain.css.test.ts
git commit -m "feat(e2e): build harness CSS with the local tailwindcss binary"
```

---

### Task 4: The toolchain guard — RED against the unmigrated tree

**Files:**
- Create: tests/e2e/\_metaLiveEntryToolchain.test.ts

**Why this task is here and not at the end.** Spec §3.4 orders the guard FIRST: it must be red against the unmigrated tree (36 violating call sites) and go green *because* the migrations land. An earlier draft of this plan put it last, where it could only ever be written already-green — which is not TDD, and which the plan then papered over with a mutation probe. The migrations in Tasks 5 and 6 are this task's implementation step.

**What it must NOT flag** — verified against the live tree, each of these is legitimate and must stay green:

| site | why it is not a violation |
| --- | --- |
| `tests/e2e/help-docs-setup.ts:42` | `pnpm dlx tsx` — `dlx` is fine; `tsx` is not a toolchain binary |
| `tests/e2e/step3-schedule-bookend-layout.spec.ts:103` | the words `@import "tailwindcss"` inside a **comment** |
| the guard's own file | its detector fixture necessarily contains the forbidden strings |
| tests/e2e/helpers/liveEntryToolchain.ts | the one permitted invocation point |

So the detector matches an **invocation**, not a word: `esbuild` or `tailwindcss`/`@tailwindcss/cli` appearing as a command argument next to `dlx` or `exec`. A bare `dlx` is not enough, and a match inside a `//` or `/* */` comment does not count.

- [ ] **Step 1: Write the guard**

```ts
// tests/e2e/_metaLiveEntryToolchain.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const E2E = join(ROOT, "tests/e2e");
/** Permitted invocation point + this guard itself (its fixture holds the strings). */
const EXEMPT = new Set(["helpers/liveEntryToolchain.ts", "_metaLiveEntryToolchain.test.ts"]);
const TOOLCHAIN = ["esbuild", "tailwindcss", "@tailwindcss/cli"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A toolchain binary used as a COMMAND argument (next to dlx/exec), comments ignored. */
export function toolchainInvocations(src: string): string[] {
  const code = stripComments(src);
  return TOOLCHAIN.filter((bin) => {
    const b = bin.replace(/[/@]/g, "\\$&");
    return new RegExp(`["'\`](?:dlx|exec)["'\`]\\s*,\\s*["'\`]${b}(@[\\d.]+)?["'\`]`).test(code);
  });
}

function walk(dir = E2E): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? walk(join(dir, d.name))
      : /\.tsx?$/.test(d.name)
        ? [relative(E2E, join(dir, d.name))]
        : [],
  );
}

describe("live-entry toolchain is invoked from exactly one place", () => {
  it("the detector fires on a real invocation and ignores look-alikes", () => {
    expect(toolchainInvocations('execFileSync("pnpm", ["dlx", "esbuild@0.28.0"])')).toEqual(["esbuild"]);
    expect(toolchainInvocations('execFileSync("pnpm", ["exec", "tailwindcss", "-i"])')).toEqual(["tailwindcss"]);
    // legitimate: dlx with a non-toolchain binary
    expect(toolchainInvocations('spawnSync("pnpm", ["dlx", "tsx", "seed.ts"])')).toEqual([]);
    // legitimate: the word inside a comment
    expect(toolchainInvocations('// app/globals.css is `@import "tailwindcss"` + tokens')).toEqual([]);
  });

  it("no file but the helper invokes a toolchain binary", () => {
    const offenders = walk()
      .filter((f) => !EXEMPT.has(f))
      .filter((f) => toolchainInvocations(readFileSync(join(E2E, f), "utf8")).length > 0);
    expect(offenders, "route these through tests/e2e/helpers/liveEntryToolchain.ts").toEqual([]);
  });

  it("only the helper imports esbuild directly", () => {
    const offenders = walk()
      .filter((f) => !EXEMPT.has(f))
      .filter((f) => /from\s+["']esbuild["']|require\(["']esbuild["']\)/.test(readFileSync(join(E2E, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no package script reachable from tests/e2e invokes a toolchain binary", () => {
    // Spec §3.3 clause 3: moving the invocation into a package script would
    // otherwise satisfy a filesystem-only scan.
    const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }).scripts;
    const referenced = Object.keys(scripts).filter((name) =>
      walk().some((f) => readFileSync(join(E2E, f), "utf8").includes(`pnpm ${name}`)),
    );
    const offenders = referenced.filter((name) =>
      TOOLCHAIN.some((bin) => new RegExp(`\\b${bin.replace(/[/@]/g, "\\$&")}\\b`).test(scripts[name] ?? "")),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — it MUST be red**

Run: `pnpm exec vitest run tests/e2e/_metaLiveEntryToolchain.test.ts --project serial`
Expected: FAIL. The offender list names the unmigrated call sites (29 files at plan time). Record the count in the commit body; it is the red state Tasks 5 and 6 clear.

Also confirm the detector cases pass — if clause 1 fails, the detector is wrong, not the tree.

- [ ] **Step 3: Commit the red guard**

```bash
git add tests/e2e/_metaLiveEntryToolchain.test.ts
git commit -m "test(e2e): forbid any file but the helper from invoking the toolchain (red)"
```

Committing a red test is deliberate here and is confined to this branch: it is the failing half of the TDD cycle whose implementation is Tasks 5 and 6. The PR does not merge red — Task 9 gates that.

---

### Task 5: Migrate the 8 esbuild call sites

**Files (verified line of the `"dlx"` literal at plan time):**
- `tests/e2e/blocked-row-resolver-transitions.spec.ts:81`
- `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:63`
- `tests/e2e/collapse-panel-morph.spec.ts:62`
- `tests/e2e/compact-alert-card-layout.spec.ts:66`
- `tests/e2e/hoverhelp-geometry.spec.ts:57`
- `tests/e2e/packlist-rescan-recovery.spec.ts:57`
- `tests/e2e/resolve-label-layout.spec.ts:66`
- `tests/e2e/wizard-blocker-modal.layout.spec.ts:60`

**Interfaces:**
- Consumes: `bundleLiveEntry` from Task 1.

- [ ] **Step 1: Record the pre-migration baseline**

```bash
cd /Users/ericweiss/FX-worktrees/ci-dark-coverage
pnpm exec playwright test --config tests/e2e/standalone.config.ts 2>&1 | tail -5
```

Write the passed/failed counts into the commit body. Expect 2 failures (`resolve-label-layout`, `packlist-rescan-recovery`) — both are addressed in Tasks 6 and 7, not here.

- [ ] **Step 2: Replace each block**

For each file, replace the `execFileSync("pnpm", ["dlx", "esbuild@0.28.0", …], …)` call with a `bundleLiveEntry` call, preserving that site's **existing** aliases and externals exactly. Example — `compact-alert-card-layout.spec.ts`:

```ts
import { bundleLiveEntry } from "./helpers/liveEntryToolchain";

bundleLiveEntry({
  entry: join(REPO_ROOT, "tests", "e2e", "_compactAlertCardLiveEntry.tsx"),
  outFile: join(workDir, "bundle.js"),
  aliases: {
    "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts"),
    "next/navigation": join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts"),
  },
});
```

**Do not add aliases a site did not already have** — that is Task 6's job, and conflating them hides which change fixed what.

- [ ] **Step 3: Run the affected specs**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts \
  tests/e2e/blocked-row-resolver-transitions.spec.ts tests/e2e/bulk-ignore-eyebrow.layout.spec.ts \
  tests/e2e/collapse-panel-morph.spec.ts tests/e2e/compact-alert-card-layout.spec.ts \
  tests/e2e/hoverhelp-geometry.spec.ts tests/e2e/wizard-blocker-modal.layout.spec.ts 2>&1 | tail -5
```

Expected: all pass. (`resolve-label-layout` and `packlist-rescan-recovery` are still red — unchanged from the baseline.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/*.spec.ts
git commit -m "refactor(e2e): route the 8 esbuild call sites through the helper"
```

---

### Task 6: Migrate the 28 Tailwind call sites

**Files:** every spec matching `grep -l '@tailwindcss/cli@4.2.4' tests/e2e/*.spec.ts` — 28 at plan time. **Re-run that grep**; the list grows as specs land.

**Interfaces:**
- Consumes: `buildEntryCss` from Task 3.

**Inspect every site before editing it — they are not uniform.** Two known shapes:

| shape | sites | migration |
| --- | --- | --- |
| `sources` holds **bare absolute paths** | most | pass the array straight to `buildEntryCss` |
| `sources` holds **complete `@source "…";` directives** | `tests/e2e/pusher-alignment.layout.spec.ts:87` (`sources.push(\`@source "${file}";\`)`) | push the **bare path** instead; the helper adds the directive. Passing them through unchanged emits nested `@source "@source "…";";` and breaks a currently-green spec. |

Check each site with `grep -n 'sources' <file>` before replacing. `section-header-layout.layout.spec.ts` builds its list the same way — confirm both.

**Timeouts:** `pusher-alignment.layout.spec.ts:98` and `section-header-layout.layout.spec.ts:103` deliberately allow **180s**, where most sites use 120s. The helper now uses 180s uniformly — the maximum any site uses — so migration cannot shorten anyone's budget. Do not reintroduce a per-site timeout.

- [ ] **Step 1: Replace each block**

Replace the `const entryCss = …` / `readFileSync(globals)` / `writeFileSync(entryCss, …)` / `execFileSync("pnpm", ["dlx", "@tailwindcss/cli@4.2.4", …])` sequence with:

```ts
import { buildEntryCss } from "./helpers/liveEntryToolchain";

buildEntryCss({
  sources: [
    join(REPO_ROOT, "components", "admin", "CompactAlertCard.tsx"),
    // …that site's existing @source list, unchanged, minus the globals line
  ],
  outFile: join(workDir, "out.css"),
  workDir,
});
```

Delete the now-unused `globals` local and any `readFileSync` import that becomes unused — a new ESLint warning is signal, not baseline (memory: `feedback_new_eslint_warning_is_signal_not_baseline`).

- [ ] **Step 2: Run the whole standalone config**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts 2>&1 | tail -5
```

Expected: same pass count as Task 4's baseline, still exactly 2 failures.

- [ ] **Step 3: Lint and format**

```bash
pnpm exec eslint tests/e2e --max-warnings=0
pnpm format:check
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "refactor(e2e): route the 28 CSS call sites through the helper"
```

---

### Task 7: Fix `resolve-label-layout`

**Files:**
- Modify: `tests/e2e/resolve-label-layout.spec.ts`

**Why this works, and why it is one line of evidence:** `resolve-label-layout` and `compact-alert-card-layout` bundle the **same entry** (`_compactAlertCardLiveEntry.tsx`) with the same flags; the latter additionally passes `node:crypto` and `next/navigation` aliases. That is the entire difference between red and green.

- [ ] **Step 1: Confirm it is still red for the expected reason**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/resolve-label-layout.spec.ts 2>&1 | grep -A3 "Could not resolve"
```

Expected: `Could not resolve "node:crypto"` via `lib/parser/useRawContentHash.ts:1`.

- [ ] **Step 2: Add the two aliases**

In the `bundleLiveEntry` call added by Task 4, add the same `aliases` map `compact-alert-card-layout.spec.ts` uses.

- [ ] **Step 3: Run it**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/resolve-label-layout.spec.ts 2>&1 | tail -4
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/resolve-label-layout.spec.ts
git commit -m "fix(e2e): give resolve-label-layout the stub aliases its sibling already had"
```

---

### Task 8: Remove `packlist-rescan-recovery` from the config

**Files:**
- Modify: `tests/e2e/standalone.config.ts` (the `testMatch` alternation)

**Why removal rather than repair:** its entry reaches the whole server tree — `step3ReviewSections` → `UseRawControlBoundary` → a `"use server"` module → `runScheduledCronSync` → googleapis (913 graph inputs), with `lib/sync/lockedShowTx.ts` reaching `postgres` by a parallel edge. Ten distinct `lib/sync` modules still pull `postgres` even after stubbing that boundary; a per-module alias list leaves 78 errors. It is dark today, so nothing that runs is lost, and PR2 makes this config a merge-visible gate that cannot carry a red spec. Filed as `BL-HARNESS-PACKLIST-SERVER-GRAPH`.

- [ ] **Step 1: Remove the branch**

Delete `packlist-rescan-recovery|` from the `testMatch` regex.

- [ ] **Step 2: Verify the config no longer selects it**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/packlist-rescan-recovery.spec.ts 2>&1 | tail -3
```

Expected: `No tests found` — the spec file still exists but the config no longer matches it.

- [ ] **Step 3: Run the whole config**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts 2>&1 | tail -5
```

Expected: **zero failures, zero did-not-run.** This is PR1's acceptance invariant (spec §3.4 step 4) — a property, not a fixed count, because the count moves with `main`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/standalone.config.ts
git commit -m "test(e2e): drop packlist-rescan-recovery from the config (BL-HARNESS-PACKLIST-SERVER-GRAPH)"
```

---

### Task 9: Whole-PR verification

- [ ] **Step 1: Full standalone config**

```bash
pnpm exec playwright test --config tests/e2e/standalone.config.ts 2>&1 | tail -5
```
Expected: zero failures, zero did-not-run.

- [ ] **Step 2: Offline proof — the point of the PR**

```bash
pnpm store prune >/dev/null 2>&1 || true
# Re-run one bundling and one CSS spec with the network-fetch path removed.
pnpm exec playwright test --config tests/e2e/standalone.config.ts \
  tests/e2e/compact-alert-card-layout.spec.ts 2>&1 | tail -4
```
Expected: PASS. Previously this required a `dlx` fetch of two packages.

- [ ] **Step 3: Repo gates**

```bash
pnpm typecheck
pnpm exec eslint tests/e2e --max-warnings=0
pnpm format:check
pnpm exec vitest run tests/e2e/helpers tests/e2e/_metaLiveEntryToolchain.test.ts tests/infra/tailwindVersionParity.test.ts --project serial
```
Check `$?` after vitest explicitly — it can exit 1 on an uncaught error while every test line reports pass (memory: `feedback_vitest_exits_1_on_uncaught_errors_all_tests_pass`).

- [ ] **Step 4: Commit any fixes, then hand off to the whole-diff review**

---

## Self-Review

**1. Spec coverage.** §3.1 red specs → Tasks 7, 8. §3.2 helper + devDependency + parity → Tasks 1, 2, 3. §3.3 guard → Task 4, and it implements **all three** clauses: no file but the helper invokes a toolchain binary, only the helper imports `esbuild`, and no package script reachable from `tests/e2e/**` invokes one. An earlier draft implemented two and claimed three. §3.4 TDD order → the guard is now Task 4, red against the unmigrated tree, exactly as §3.4 specifies.

**2. Placeholder scan.** No TBD/TODO. Every code step carries real code. Task 5 names a grep rather than 28 literal paths **deliberately** — the list grows with `main`, and a frozen list would be stale before execution; the grep is exact and its plan-time result (28) is recorded.

**3. Type consistency.** `bundleLiveEntry(BundleOptions)` and `buildEntryCss(CssOptions)` are defined in Tasks 1 and 3 and consumed with those exact names and shapes in Tasks 4, 5, and 6. `REPO_ROOT` is module-private to the helper; call sites keep their own.

**Known gap, stated rather than hidden:** Task 8's guard proves no file *names* a binary. A spec could still invoke the toolchain through an indirection the regex cannot see. That is the bounded claim, and it matches spec §3.3 — the guard closes the idiom every current site uses, not the class.
