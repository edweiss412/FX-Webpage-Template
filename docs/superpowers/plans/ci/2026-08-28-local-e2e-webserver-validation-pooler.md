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
| every e2e workflow supplies `DATABASE_URL`, never `TEST_DATABASE_URL` | `rg DATABASE_URL .github/workflows/` | Task 1 CI safety |
| `x-audits.yml` sets the validation DSN and runs no Playwright | `rg -c playwright .github/workflows/x-audits.yml`, no matches | Task 1 CI safety |
| `.env.local` sets no `DATABASE_URL` | `grep -E '^(DATABASE_URL\|TEST_DATABASE_URL)=' .env.local` | Task 1 fallback |

## Task 1 — pin both DB keys on every webServer, in every Playwright config

<!-- spec-lint: ignore — tests/ci/webserverDatabasePin.test.ts is created by this task -->
**Red:** new `tests/ci/webserverDatabasePin.test.ts`. Fails on 4 of the 6 discovered entries.

```
red= pnpm vitest run tests/ci/webserverDatabasePin.test.ts
```

Body:

```ts
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

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
 * Derived cover on two axes: config FILES come from a directory listing and ENTRIES from
 * each config's own array, so neither a new file nor a new entry is silently exempt.
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
const CONFIG_FILES = readdirSync(ROOT)
  .filter((f) => /^playwright.*\.config\.ts$/.test(f))
  .sort();

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
    expect(CONFIG_FILES.length, "playwright*.config.ts at repo root").toBeGreaterThan(0);

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
  files: r.loadedEnvFiles.map((f) => f.path.replace(/.*\\//, "")),
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
  return JSON.parse(out) as { value: string | null; files: string[] };
}

const MODES = ["development", "production"] as const;

describe("@next/env precedence: an explicit value beats .env.local", () => {
  it("loads the loader Next runs, not the hoisted root one (premise)", () => {
    expect(NEXT_ENV).not.toBe(ROOT_ENV);
    expect(NEXT_ENV.startsWith(NEXT_DIR) || NEXT_ENV.includes("@next")).toBe(true);
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

1. Point `ENV_PKG` at `ROOT_ENV` and confirm the binding premise fails.
2. Invert one positive arm to expect `REMOTE` and confirm it fails.

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

Three assertions:

1. **Premise:** the warning fired at all, so a refactor that stops printing it cannot pass by absence.
2. The remedy names `TEST_DATABASE_URL=` as the variable to set.
3. The message no longer claims that nothing but the allowlist rows honours the variable.

`--no-db` is load-bearing: the deferred warnings flush from an `on("exit")` handler, so they print on
that early-exit path too. So the test opens no database connection, stays out of the connection
census, and is fast.

**Green:** replace the closing two sentences of the warning at `scripts/preflight-env.mjs:181-190`.
The replacement keeps the allowlist fact, which is true of *helpers*, stops generalising it to the
system, and gives the override that works:

```
WARN: TEST_DATABASE_URL is NON-LOOPBACK (<host>) — this is the VALIDATION deployment, and it
      is set that way on purpose for the schema-parity gates.
      Anything that honours this variable writes to validation, where the notify cron sends
      REAL email to Doug.
      Test helpers no longer honour it (only the two rows in
      tests/db/_validationEnvAllowlist.ts do) — but the APP SERVER does: route handlers
      resolve TEST_DATABASE_URL ?? DATABASE_URL, so a locally booted server reads validation.
      Playwright pins a loopback value on every webServer, so `pnpm test:e2e` is safe; a
      hand-started `pnpm dev` is not.
      To point a local run at local Postgres, override the variable itself:
        TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres <cmd>
      Exporting DATABASE_URL does NOT work — TEST_DATABASE_URL is the left `??` operand.
```

Check the final string against the repo's copy rules for script output (em dash and apostrophe
literals) before committing.

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
