# Plan — local e2e app servers resolve the validation pooler

Spec: `docs/superpowers/specs/ci/2026-08-28-local-e2e-webserver-validation-pooler.md` (APPROVED).
Row: `BL-LOCAL-E2E-APP-SERVER-QUERIES-VALIDATION`. Branch: `fix/local-e2e-validation-pooler`.

Four tasks, each TDD: failing test, minimal implementation, passing test, commit.

impeccable-gate: N/A — no UI surface

## Resolved scope — do not relitigate

- **Candidate 3, reworking the `TEST_DATABASE_URL ?? DATABASE_URL` idiom at its 40 sites, is out of
  scope** (spec §6). Its residue is a documented limit, spec §8.
- **Pinning, never scrubbing.** Spec §3 carries the probe and its negative control.
- **The inline `VAR=value` prefixes on the command strings stay put.** Spec §6.
- **`playwright.screenshots.config.ts` gets no new pin** (its one entry is already pinned) **but is
  inside T1's walk.** Spec §6.
- **T1's domain is derived on two axes** (discovered files x each config's own `webServer` array) and
  **T2's is the two load modes the configs boot.** Widening either past those sets is a documented
  limit with a re-file trigger, not a repair. Spec §7, §8.

## Pre-draft code verification

Every file, symbol, line and flag below was checked against this branch before this plan was
written. What each check established, and where it is used:

| claim | verified by | used in |
| --- | --- | --- |
| `config.webServer` is an array of 5, exactly one carrying `env` | static-import probe, spec §7 | Task 1 |
| 11 `*.config.ts` exist repo-wide; exactly 2 declare a `webServer` | source-derived discovery probe | Task 1 discovery |
| `tests/e2e/visual.config.ts` and `tests/e2e/standalone.config.ts` declare NO `webServer` | `grep -c webServer` on both | Task 1 discovery |
| the screenshots config declares 1 entry, already pinned | same probe | Task 1 |
| the array is `.filter(...)`ed by 5 env vars | `playwright.config.ts:425-467` | Task 1 premise 1 |
| dynamic import double-wraps the default export where static does not | probe, output in spec §7 | Task 1 unwrap + premise 2 |
| an explicit env value survives `loadEnvConfig` in BOTH modes | 4-arm probe, spec §3 | Task 2 |
| `NODE_ENV=test` loads no `.env.local` at all | 3-mode probe, spec §7 | Task 2 premise 2 |
| root `@next/env` is 16.2.4, `next`-resolved is 16.3.0, different bytes | binding probe, spec §3 | Task 2 binding + premise 1 |
| two arms in ONE process do not measure two loads | probe, both shapes in spec §7 | Task 2 shape |
| `--no-db` still prints the deferred warnings | live run; flush is `on("exit")` at `scripts/preflight-env.mjs:161-164`, flag read at `scripts/preflight-env.mjs:28` | Task 3 |
| nothing in `tests/` or `scripts/` pins the warning text | `rg` over both trees | Task 3 |
| preflight hard-requires env before reaching the warning | `tests/scripts/preflightClaims.test.ts:26-41` | Task 3 premise |
| `BASE_INCLUDE` picks up new `tests/ci` and `tests/scripts` files | `vitest.projects.ts:34` | Tasks 1-3 |
| neither directory is in `PARALLEL_TEST_GLOBS`, so both run serial | `vitest.projects.ts:104-131` | Tasks 1-3 |
| exactly 4 workflows boot a newly-pinned server AND set no DB key | derivation in Task 1's CI section | Task 1 CI safety |
| `x-audits.yml` sets the validation DSN and runs no Playwright | `rg -c playwright .github/workflows/x-audits.yml`, no matches | Task 1 CI safety |
| Playwright MERGES `webServer.env` over `process.env` rather than replacing it | its live source: `{...DEFAULT_ENVIRONMENT_VARIABLES, ...process.env, ...this._options.env}` | Task 1 green |
| `.env.local` sets no `DATABASE_URL` | `grep -E '^(DATABASE_URL\|TEST_DATABASE_URL)=' .env.local` | Task 1 fallback |

## Task 1 — pin both DB keys on every webServer, in every Playwright config

<!-- spec-lint: ignore — tests/ci/webserverDatabasePin.test.ts is created by this task -->
**Red:** new `tests/ci/webserverDatabasePin.test.ts`. Fails on 4 of the 6 discovered entries.

```
red= pnpm vitest run tests/ci/webserverDatabasePin.test.ts
```

Body:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every Playwright webServer hands its app server a LOOPBACK database.
 *
 * `.env.local` points TEST_DATABASE_URL at the REMOTE validation pooler on purpose (the
 * schema-parity gates need that credential), `next dev` / `next start` load `.env.local`
 * INSIDE the server Playwright boots, and the route handlers resolve
 * `TEST_DATABASE_URL ?? DATABASE_URL ?? loopback`. So an entry with no pin hands the app
 * server a shared remote deployment whose notify cron mails Doug: nine real alerts on
 * 2026-08-26, and a local e2e run that returned ADMIN_ALERT_NOT_FOUND against a database
 * that never held the seeded show (BL-LOCAL-E2E-APP-SERVER-QUERIES-VALIDATION).
 *
 * Derived cover on two axes: config FILES are discovered anywhere in the repo by whether
 * they DECLARE a webServer, and ENTRIES come from each config's own array. So neither a new
 * config in a new directory nor a new entry in an existing one is silently exempt.
 */

// These shrink playwright.config.ts's webServer array via its own .filter(). With any set
// the walk is a subset; STEP3_LIVE_BUNDLE_ONLY empties it, and a per-entry assertion over
// an empty array passes while proving nothing.
const FILTER_VARS = [
  "HELP_DOCS_WALKER_ONLY",
  "CREW_E2E_ONLY",
  "BASELINE_SERVER_ONLY",
  "DEV_GATE_ONLY",
  "STEP3_LIVE_BUNDLE_ONLY",
] as const;

const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::|$)/;
const DB_KEYS = ["DATABASE_URL", "TEST_DATABASE_URL"] as const;

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "coverage"]);

/**
 * Discovery is by DECLARATION, not by filename or directory. Two Playwright configs live
 * outside the repo root (`tests/e2e/visual.config.ts`, `tests/e2e/standalone.config.ts`);
 * neither declares a webServer today, so a root-only or name-only filter would miss them
 * the day one does. Source-grep to decide WHICH files to import (cheap, and it avoids
 * importing ten unrelated configs for their side effects), then walk each one's real array.
 */
function configsDeclaringAWebServer(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".next")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) configsDeclaringAWebServer(full, out);
    else if (/\.config\.ts$/.test(entry) && /\bwebServer\s*:/.test(readFileSync(full, "utf8"))) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

const CONFIG_FILES = configsDeclaringAWebServer(ROOT).sort();

type WebServer = { url?: string; env?: Record<string, string | undefined> };

/**
 * Dynamic import, which disk discovery requires, can wrap the default export one level
 * deeper than a static import does: `mod.default.webServer` reads `undefined` while
 * `mod.default.default.webServer` holds the entries. Unwrapping a fixed number of levels
 * would walk zero entries and pass green, so descend until `webServer` appears, and let
 * the premise below make a wrong guess loud rather than silent.
 */
function webServersOf(mod: unknown): WebServer[] {
  let node: unknown = mod;
  for (let i = 0; i < 8; i++) {
    if (node === null || typeof node !== "object") break;
    if ("webServer" in node) break;
    if (!("default" in node)) break;
    node = (node as { default: unknown }).default;
  }
  const raw = (node as { webServer?: WebServer | WebServer[] } | null)?.webServer;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

const load = (file: string) => import(resolve(ROOT, file)).then(webServersOf);

describe("every Playwright webServer pins a loopback database", () => {
  it("discovers configs and reads a non-empty entry set from each (premise)", async () => {
    for (const v of FILTER_VARS) {
      expect(process.env[v], `${v} is set, so webServer arrays are subsets`).toBeFalsy();
    }
    expect(CONFIG_FILES.length, "configs declaring a webServer").toBeGreaterThan(0);

    let total = 0;
    for (const file of CONFIG_FILES) {
      const entries = await load(file);
      // A config found but read as EMPTY is the discovery-specific failure mode.
      expect(entries.length, `${file} yielded no webServer entries`).toBeGreaterThan(0);
      total += entries.length;
    }
    expect(total, "webServer entries across all configs").toBeGreaterThan(1);
  });

  it.each(CONFIG_FILES)("%s pins both DB keys on every entry", async (file) => {
    const entries = await load(file);
    expect(entries.length, `${file} yielded no webServer entries`).toBeGreaterThan(0);

    for (const [i, server] of entries.entries()) {
      const label = `${file} ${server.url ?? `entry ${i}`}`;
      for (const key of DB_KEYS) {
        const value = server.env?.[key];
        expect(
          value,
          `${label}: ${key} unset, so .env.local's validation pooler wins inside the server`,
        ).toBeTruthy();
        expect(new URL(String(value)).host, `${label}: ${key}`).toMatch(LOOPBACK_HOST);
      }
    }
  });
});
```

At red time, note in the commit message how many `default` levels the dynamic import actually
produced under vitest. The loop handles 0 through 8 and premise 2 fails loud on a miss, but the
observed depth is worth recording rather than leaving to the next reader to rediscover.

**Green:** add an `env` block to each of the four unpinned entries in `playwright.config.ts`,
copying the pinned entry's form:

```ts
env: {
  // NEVER the ambient TEST_DATABASE_URL. `.env.local` points it at the REMOTE validation
  // project for the schema-parity gates, and `next dev` / `next start` load `.env.local`
  // inside this server. Pinned rather than dropped because an absent key lets the remote
  // value back in. Rationale and probes: the 2026-08-28 spec of the same name.
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  TEST_DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
},
```

Both names resolve from `DATABASE_URL`, never from the ambient `TEST_DATABASE_URL`.

**Failure mode caught:** a new or edited webServer entry with no pin, in either config, handing the
app server a shared remote database.

**Verify beyond the new test:** `pnpm vitest run tests/help/playwright-config.test.ts`. That file
asserts `not.toContain("process.env.TEST_DATABASE_URL")` over the whole config, so a pin written the
wrong way round reds it. A real interaction, not a formality.

### What this does to CI, derived rather than assumed

The spec's CI-safety argument was stated as "every e2e workflow supplies `DATABASE_URL`". That is
false, and it was reached the wrong way: by grepping for workflows that MENTION the variable and
generalising from the ones that turned up. The set that matters is workflows that boot a server this
change touches, which is derived from three things a grep of one variable cannot see -- the
`webServer` filter env var each job sets, which config it passes to Playwright, and whether the
config it uses declares a `webServer` at all.

Playwright merges `webServer.env` over `process.env` (`{...DEFAULT_ENVIRONMENT_VARIABLES,
...process.env, ...this._options.env}`), so the new `env` blocks do not disturb the inline
`VAR=value` prefixes already on those command strings, and a job's own `DATABASE_URL` still reaches
the server. Four groups:

- **Resolves from the job's own DSN, byte-identical (3):** `app-e2e.yml`,
  `lifecycle-layout-e2e.yml`, `published-modal-e2e.yml` set `DATABASE_URL` to loopback, so
  `process.env.DATABASE_URL ?? <literal>` yields exactly the value the resolver reaches today.
- **Boots only an already-pinned server, or none (4):** `help-affordances.yml`
  (`HELP_DOCS_WALKER_ONLY`, so only the already-pinned :3004), `screenshots-drift.yml` and
  `screenshots-regen.yml` (the screenshots config, whose one entry is already pinned),
  `step3-live-bundle.yml` (`STEP3_LIVE_BUNDLE_ONLY`, which boots zero servers).
- **Boots no Playwright `webServer` at all (5+):** `unit-suite.yml`, `mutation-harness.yml` and
  `mutation-browser.yml` run vitest; `section-header-visual{,-regen}.yml` use
  `tests/e2e/visual.config.ts` and `standalone-e2e.yml` uses `tests/e2e/standalone.config.ts`, and
  neither of those configs declares a `webServer` (`grep -c webServer` returns 0 for both).
- **Genuinely changed (4):** `admin-layout-e2e.yml` and `phantom-gap-e2e.yml`
  (`BASELINE_SERVER_ONLY`, so :3000), `crew-e2e.yml` (`CREW_E2E_ONLY`, so :3000), and
  `dev-gate-e2e.yml` (`DEV_GATE_ONLY`, so :3001-:3003). None sets a DB key and none starts a local
  Supabase. Today a route reaching a raw-`postgres` path in those jobs THROWS, because CI selects
  production posture and the resolver throws when both variables are absent. After the pin it
  instead attempts loopback, where nothing is listening.

**On that last group, stated as the inference it is.** Neither shape works; the pin trades a clean
throw for a refused connection. It is unreachable in all four, and the evidence is that they are
green: under production posture any spec reaching such a route would already be failing on the
throw. That is an inference from CI's current state rather than from a local probe, and it is the one
claim in this plan resting on it. If any of those four ever adds a spec that reaches a raw-`postgres`
route, the correct fix is the `DATABASE_URL` line `app-e2e.yml:187` already carries, not removing the
pin.

The one workflow that sets the validation DSN, `x-audits.yml`, runs no Playwright at all, so no job
both wants that DSN and boots a server this change touches.

**Commits:** `test(ci): ...`, then `fix(infra): ...`.

## Task 2 — pin the precedence the repair depends on

<!-- spec-lint: ignore — tests/ci/nextEnvPrecedence.test.ts is created by this task -->
**Red:** new `tests/ci/nextEnvPrecedence.test.ts`, four arms, each in its own child process.

```
red= pnpm vitest run tests/ci/nextEnvPrecedence.test.ts
```

There is no product change in this task. Task 1's pin is correct only while an explicit environment
value beats `.env.local`, in the load mode the server runs, in the `@next/env` copy `next` executes.
If any of those three inverts, every pinned entry silently resolves the validation pooler again while
the config still looks right, and nothing else in the repo would notice.

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Each arm runs in a FRESH CHILD PROCESS, and that is load-bearing rather than tidiness:
 * @next/env snapshots the environment on its first call and a reload restores that
 * snapshot, so two arms in one process measure one load, not two. The second arm reads
 * the fixture's value back and the test fails on correct code. A fresh process is also
 * what a booting Next server is.
 *
 * NODE_ENV is set explicitly per arm and never inherited. Vitest runs with NODE_ENV=test,
 * and in test mode @next/env does not read `.env.local` AT ALL, so an inheriting child
 * loads nothing and the negative control has no remote value to beat.
 */
const REMOTE = "postgresql://u:p@remote.sentinel.invalid:5432/postgres";
const LOOPBACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Resolve the loader the way Next does. The hoisted root @next/env is a DIFFERENT package
// from the one `next` ships (16.2.4 vs 16.3.0, different loader bytes), and only the
// second ever runs inside the server.
const NEXT_DIR = dirname(require.resolve("next/package.json"));
const NEXT_ENV = require.resolve("@next/env", { paths: [NEXT_DIR] });
const ROOT_ENV = require.resolve("@next/env");

const ARM = `
const { loadEnvConfig } = require(process.env.ENV_PKG);
const r = loadEnvConfig(process.env.FIXTURE_DIR, process.env.LOAD_MODE === "development",
  { info() {}, error() {} });
process.stdout.write(JSON.stringify({
  value: process.env.TEST_DATABASE_URL ?? null,
  files: r.loadedEnvFiles.map((f) => f.path.slice(f.path.lastIndexOf("/") + 1)),
  // The child reports which loader it actually required. Comparing two constants in the
  // parent cannot observe this: ENV_PKG could point anywhere and the comparison would
  // still hold. This is the only value that witnesses the binding.
  pkg: require.resolve(process.env.ENV_PKG),
}));`;

const fixture = mkdtempSync(join(tmpdir(), "fx-next-env-precedence-"));
writeFileSync(join(fixture, ".env.local"), `TEST_DATABASE_URL=${REMOTE}\n`);
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function loadInChild(mode: "development" | "production", preset: string | undefined) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FIXTURE_DIR: fixture,
    ENV_PKG: NEXT_ENV,
    LOAD_MODE: mode,
    NODE_ENV: mode,
  };
  if (preset === undefined) delete env.TEST_DATABASE_URL;
  else env.TEST_DATABASE_URL = preset;
  const out = execFileSync(process.execPath, ["-e", ARM], { env, encoding: "utf8" });
  return JSON.parse(out) as { value: string | null; files: string[]; pkg: string };
}

const MODES = ["development", "production"] as const;

describe("@next/env precedence: an explicit value beats .env.local", () => {
  // PREMISE: asserted on what the CHILD loaded, per mode. Comparing NEXT_ENV to ROOT_ENV in
  // the parent is not this assertion: those are constants, so the comparison holds no matter
  // what ENV_PKG the child was handed, and the plan's own ENV_PKG sabotage would leave every
  // arm green while measuring a package no server runs.
  it.each(MODES)("%s: the child loaded the loader Next runs, not the hoisted root one", (mode) => {
    expect(NEXT_ENV, "the two resolutions are indistinguishable").not.toBe(ROOT_ENV);
    expect(loadInChild(mode, undefined).pkg, `${mode}: child loaded the wrong @next/env`).toBe(
      NEXT_ENV,
    );
  });

  it.each(MODES)("%s: reads the fixture's .env.local at all (premise)", (mode) => {
    expect(loadInChild(mode, undefined).files, `${mode}: no .env.local loaded`).toContain(
      ".env.local",
    );
  });

  // NEGATIVE CONTROL per mode: proves the positive arm below could have failed.
  it.each(MODES)("%s: lets .env.local win when nothing is pre-set", (mode) => {
    expect(loadInChild(mode, undefined).value).toBe(REMOTE);
  });

  it.each(MODES)("%s: keeps an explicitly pinned value through the load", (mode) => {
    expect(loadInChild(mode, LOOPBACK).value).toBe(LOOPBACK);
  });
});
```

**Establishing the red without an implementation step.** There is nothing to implement, so the red
is established by **sabotage**, and both sabotages are run and recorded in the commit message:

1. Point `ENV_PKG` at `ROOT_ENV` and confirm the binding premise fails **on the child's
   reported `pkg`**. This is the sabotage that the first draft's premise could not detect, so
   record the observed failure message, not just that it failed.
2. Invert one positive arm to expect `REMOTE` and confirm it fails.
3. Set `NODE_ENV=test` on one arm and confirm the `.env.local`-loaded premise fails.

Then restore. A test that has never been observed failing is not a test.

**Failure mode caught:** a Next upgrade flipping `.env.local` precedence, in either load mode, in the
package the server actually runs.

**Commit:** `test(ci): ...`.

## Task 3 — make the preflight remedy executable advice

<!-- spec-lint: ignore — tests/scripts/preflightAdvice.test.ts is created by this task -->
**Red:** new `tests/scripts/preflightAdvice.test.ts`, spawning `scripts/preflight-env.mjs --no-db`
with a non-loopback `TEST_DATABASE_URL` and the `REQUIRED_ENV` map from
`tests/scripts/preflightClaims.test.ts:26-41`. Without that map a checkout with no `.env.local` exits
during preflight's env checks and never reaches the warning.

```
red= pnpm vitest run tests/scripts/preflightAdvice.test.ts
```

**The warning is on STDERR, not stdout.** It is flushed by `console.warn` from an `on("exit")`
handler, so a test reading stdout finds `preflight: env ok (DB probe skipped)` and nothing else, and
would stay red after a correct copy change. Probed:

```
in stdout: 0
in stderr: 1
```

**Asserting the new remedy is present is NOT sufficient.** A substring check for
`TEST_DATABASE_URL=` plus "the old allowlist-only claim is gone" both pass while the message still
prints `Export DATABASE_URL`, because a message can carry the new token and the broken instruction at
once. The absence of the broken remedy is a separate assertion and it is the one that closes this.

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The preflight warning must give advice that WORKS.
 *
 * `TEST_DATABASE_URL` is the LEFT operand of the `??` at every site that resolves a database
 * from it, so exporting `DATABASE_URL` -- what the message used to say -- changes nothing a
 * route handler reads. A reader who follows it gets the same wrong-database failure and no
 * signal that they did anything wrong. The adjacent claim that nothing but the allowlist
 * rows honours the variable is what makes a reader stop reading, and it is false: the app
 * server honours it.
 *
 * `--no-db` keeps this hermetic and fast. The deferred warnings flush from an `on("exit")`
 * handler, so they print on that early-exit path too, and the test opens no connection.
 */
const ROOT = join(__dirname, "..", "..");
const REMOTE = "postgresql://u:p@remote.sentinel.invalid:5432/postgres";

// Every var preflight hard-requires, with values its validators accept. CI has no tracked
// `.env.local`, so without these preflight exits during its env checks -- which run BEFORE
// the warning -- and the assertions below would be measuring an empty string.
const REQUIRED_ENV: Record<string, string> = {
  HASH_FOR_LOG_PEPPER: "x".repeat(48),
  PICKER_COOKIE_SIGNING_KEY: "test-signing-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SUPABASE_ANON_KEY: "test-anon",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x@y.z", private_key: "k" }),
};

function runPreflight() {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "preflight-env.mjs"), "--no-db"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...REQUIRED_ENV, TEST_DATABASE_URL: REMOTE },
  });
  // The warning is written by console.warn, i.e. STDERR. Keep the streams separate so the
  // stream itself is part of what this test pins.
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("preflight's non-loopback TEST_DATABASE_URL warning", () => {
  it("fires at all, on stderr (premise)", () => {
    const { stderr, stdout } = runPreflight();
    expect(stderr, "the warning did not fire").toContain("TEST_DATABASE_URL is NON-LOOPBACK");
    expect(stdout, "the warning moved to stdout").not.toContain("NON-LOOPBACK");
  });

  it("names TEST_DATABASE_URL as the variable to override", () => {
    expect(runPreflight().stderr).toContain(
      "TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
  });

  it("no longer prints the remedy that cannot work", () => {
    // The defect this row was filed against. A message can carry the new assignment AND the
    // old instruction, so presence of the first does not establish absence of the second.
    expect(runPreflight().stderr).not.toMatch(/Export DATABASE_URL/i);
  });

  it("no longer claims that nothing but the allowlist honours the variable", () => {
    const { stderr } = runPreflight();
    expect(stderr).not.toContain("no test helper or suite honours it");
    expect(stderr).not.toContain("so this line is");
  });
});
```

**Four pre-dispatch mutants, per `docs/agents/writing-plans.md`, run and recorded in the commit.**
This is a string-presence guard, so all four are obligatory rather than optional:

(a) **Value emptied** — delete the remedy line from the warning; assertions 2 fails.
(b) **Expected content plus a suffix** — append text after the DSN on the remedy line; confirm
    assertion 2 still passes, so the guard is not accidentally pinned to end-of-line.
(c) **Present but not live** — put the new remedy inside a `//` comment in
    `preflight-env.mjs` rather than in the emitted string, and put `Export DATABASE_URL` back in
    the emitted string; assertions 2 and 3 must BOTH fail. This is the mutant that catches a guard
    reading source rather than output.
(d) **Discriminating parameter varied** — run with a LOOPBACK `TEST_DATABASE_URL`; the warning must
    not fire at all and the premise must fail. This proves the test is measuring the non-loopback
    branch rather than something printed unconditionally.

**Green:** replace the closing two sentences of the warning at `scripts/preflight-env.mjs:181-190`.
The replacement keeps the allowlist fact, which is true of *helpers*, stops generalising it to the
system, and gives the override that works:

```
WARN: TEST_DATABASE_URL is NON-LOOPBACK (<host>). This is the VALIDATION deployment, and it
      is set that way on purpose for the schema-parity gates.
      Anything that honours this variable writes to validation, where the notify cron sends
      REAL email to Doug.
      Test helpers no longer honour it (only the two rows in
      tests/db/_validationEnvAllowlist.ts do), but the APP SERVER does: route handlers
      resolve TEST_DATABASE_URL ?? DATABASE_URL, so a locally booted server reads validation.
      Playwright pins a loopback value on every webServer, so `pnpm test:e2e` is safe; a
      hand-started `pnpm dev` is not.
      To point a local run at local Postgres, override the variable itself:
        TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres <cmd>
      Setting DATABASE_URL does not work, because TEST_DATABASE_URL is the left `??` operand.
```

Copy rules: no em dashes and no straight apostrophes in emitted copy. `pnpm spec:lint` flags them in
this plan; the same rules govern the string itself.

**Failure mode caught:** the message drifting back to advice that cannot work, which is the state the
row was filed against.

**Commits:** `test(scripts): ...`, then `fix(infra): ...`.

## Task 4 — close out

Update the row (marker off in this PR's last commit, per invariant 12), and confirm the spec's §8
documented limits still read true against what shipped.

Remove each `<!-- spec-lint: ignore -->` waiver above as its target file lands: they exist only
because the plan cites three files it has not created yet, and a waiver left behind after the file is
tracked suppresses a real citation check from then on.

## Anti-tautology notes

- Task 1 asserts against each config's own `webServer` array, never a substring of the file. A pin in
  a comment, or in one entry standing for all of them, cannot satisfy it — which is exactly the hole
  in `tests/help/playwright-config.test.ts:33-54`, green over four unpinned servers since it was
  written.
- Task 2's negative control runs per mode and precedes the positive arm, and each arm is a separate
  process so none can contaminate another. Its binding premise fails if someone simplifies the
  `require` back to the root package.
- Task 3 asserts on the child's real stdout, never on the script's source text.
- Nothing is hardcoded where it could be derived: the loopback DSN is asserted by host SHAPE, so a
  developer on a different local port still passes, and the config and mode sets are read off the
  artifacts rather than listed.
- Every new test's header comment names the concrete defect it catches. None of the three passes by
  merely proving a function was called.
