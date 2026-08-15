# Changes-Feed Modal Batch Flake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `tests/e2e/admin-changes-feed-layout.spec.ts` stable against transient CI gateway 502s and re-wire it into app-e2e batch 1 behind the five-green bar, closing `BL-CHANGES-FEED-MODAL-BATCH-FLAKE`.

**Architecture:** A shared Playwright wait helper opens `/admin?show=<slug>` and recovers exactly once from the admin route error boundary (the product's own Retry), surfacing every recovery as a test annotation that the executed-count oracle prints into the job log; a log-content fix makes the underlying gateway fault diagnosable; workflow + oracle + allowlist edits re-admit the spec.

**Tech Stack:** Playwright 1.59.1 (webkit + chromium), Vitest, Next 16 App Router error boundaries, GitHub Actions.

**Spec:** `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` (canonical; APPROVE at spec review R4). Root cause is measured there (§2): transient gateway 502 on the foreground `get_admin_show_review_snapshot` RPC → `readShowReviewSnapshot` returns `infra_error` (`lib/admin/readShowReviewSnapshot.ts:48-53`) → `ShowReviewModal` throws `show_review_snapshot_failed` (`app/admin/_showReviewModal.tsx:281-283`) → `/admin` error boundary (`app/admin/error.tsx:35`) → the spec's 30s modal wait starves. The filed cross-spec fixture-collision theory is DISPROVEN (spec §2.3) — do not re-derive it.

## Global Constraints

- Spec §1.1 resolved scope binds every task: loader fail-hard posture stays; `--retries=0` stays; recovery bound is exactly 1; the spec re-enters batch 1 in this arc.
- Invariant 1 (TDD): failing test → minimal implementation → passing test → commit, per task.
- Invariant 6: conventional commits (`fix`/`test`/`infra` scopes as fitting).
- Invariant 11/12: work stays in the `../FX-worktrees/changes-feed-batch-flake` worktree; the ledger `IN PROGRESS` marker comes off in the PR's last commit.
- Heavy phases (full playwright runs, builds, full vitest suites) run under `pnpm heavy`; scoped vitest runs with explicit file lists stay unwrapped (AGENTS.md semaphore).
- No UI surface is touched (spec §9) — see closeout marker in §12.

## Meta-test inventory (docs/agents/writing-plans.md)

- **EXTENDS** `tests/admin/readShowReviewSnapshot.test.ts` — the returned-error case gains assertions on all four pgrst fields; its NO-`code` pin stays true (spec §4.2).
- **EXTENDS (row removal)** `tests/ci/_metaE2eWorkflowCoverage.test.ts:119` — the `UNSEEN` allowlist row for the spec is deleted; the guard logic is unchanged.
- **No edit needed** `tests/cross-cutting/app-e2e-ci-wiring.test.ts` — it derives floors from live Playwright resolution vs `REQUIRED` vs the workflow command; Task 3's edits satisfy it without touching the test. It is Task 3's second red instrument.
<!-- spec-lint: ignore — file is created by this plan's tasks -->
- **Creates (unit, not structural):** `tests/e2e/helpers/openShowReviewModal.unit.test.ts`, `tests/ci/appE2eAnnotationPrint.test.ts`.
- No advisory-lock surface. No Supabase call-boundary registry change (the log edit keeps `readShowReviewSnapshot`'s destructure and return kinds). No mutation-registry enrolment — the helper is playwright-context code the source-mutation registry cannot express (the runner overlays only vitest-imported modules); the untested boundary branch is spec §7 limit 2 with its accepted survivor.

## e2e harness readiness (mandatory checklist)

- **Server boot:** `playwright.config.ts` `webServer[0]` — CI: `pnpm build && pnpm start -H 127.0.0.1 -p 3000` (inline test-auth env); local: `pnpm dev -H 127.0.0.1 -p 3000`, `reuseExistingServer` outside CI. The workflow sets `BASELINE_SERVER_ONLY=1` so only :3000 boots.
- **Readiness gate before first assertion:** the helper's modal-or-boundary wait IS the gate (spec §4.1 steps 3-7); never `networkidle`. Layout assertions start only on the returned visible modal locator.
- **Detach-safety:** the spec's measure step stays the atomic `expect.poll` + single `evaluate` (`tests/e2e/admin-changes-feed-layout.spec.ts:146-179`); the helper returns a `Locator` (re-resolved per use), never an element handle.

## Acceptance criteria (from spec §5 — every task marker's `ac=` resolves here)

- **AC-1:** the helper exists with the spec §4.1 contract; slug guard unit-tested; step-7 diagnostics e2e-tested; boundary-recovery branch is spec §7 limit 2.
- **AC-2:** the layout spec passes 8/8 locally in both projects using the helper.
- **AC-3:** the fatal snapshot log context carries `error`/`pgrstCode`/`pgrstDetails`/`pgrstHint` and still no `code` property.
- **AC-4:** workflow run list + oracle row + allowlist removal + comment refresh land in the same PR.
- **AC-5:** five consecutive green `pull_request` runs of `app-e2e.yml`, `--retries=0`, oracle floors enforced.
- **AC-6:** every `infra-recovery` annotation in those runs is reported in the PR from the job-log oracle print; the print seam is pinned end-to-end by a child-process vitest case.

---

## Tasks

<!-- tasks: depth=3 -->

### Task 1: Wait helper + adoption in the layout spec

<!-- spec-lint: ignore — file is created by this plan's tasks -->
<!-- task: red=`pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` ac=AC-1,AC-2 -->

**Files:**

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- Create: `tests/e2e/helpers/openShowReviewModal.ts`
<!-- spec-lint: ignore — file is created by this plan's tasks -->
- Create: `tests/e2e/helpers/openShowReviewModal.unit.test.ts`
- Modify: `tests/e2e/admin-changes-feed-layout.spec.ts` (delete local selector at lines 37-38; replace lines 133-135; add one diagnostic case)

**Interfaces:**

- Produces: `openShowReviewModal(page: Page, slug: string, opts?: { timeoutMs?: number }): Promise<Locator>` and `LOADED_REVIEW_MODAL: string` — Task 5's five-green loop and the future peer-adoption backlog item consume these.
- Import discipline: the helper VALUE-imports nothing from `@playwright/test` at module top level — `Page`/`Locator` are `import type` (erased at runtime) and `test.info()` is reached via a lazy `await import("@playwright/test")` inside the boundary branch only. This is what lets the unit test run under vitest: no repo precedent value-imports `@playwright/test` in a vitest-run module, and the guard throws before the lazy import is ever reached.

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 1: Write the failing unit test** — `tests/e2e/helpers/openShowReviewModal.unit.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Page } from "@playwright/test";

import { LOADED_REVIEW_MODAL, openShowReviewModal } from "./openShowReviewModal";

describe("openShowReviewModal (unit-testable surface)", () => {
  test("empty slug rejects before any page API is touched", async () => {
    // A bare object would explode on .goto; rejection proves the guard fires first.
    await expect(openShowReviewModal({} as Page, "")).rejects.toThrow(/db:seed/);
  });

  test("whitespace-only slug rejects the same way", async () => {
    await expect(openShowReviewModal({} as Page, "   ")).rejects.toThrow(/db:seed/);
  });

  test("LOADED_REVIEW_MODAL pins the skeleton-twin-scoped selector", () => {
    expect(LOADED_REVIEW_MODAL).toBe(
      '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])',
    );
  });
});
```

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 2: Create the guard-less stub so the RED names a production line, not a missing import** (an unresolved-import RED is invalid by construction — `docs/agents/writing-plans.md` RED-validity rule). Stub `tests/e2e/helpers/openShowReviewModal.ts`: export `LOADED_REVIEW_MODAL` (the exact selector) and an `openShowReviewModal` whose body goes STRAIGHT to `await page.goto(...)` then waits for the modal only — no slug guard, no boundary handling, no enriched errors. This is the pre-fix behavior transplanted; it is also Step 5's staged red.

- [ ] **Step 3: Run it — RED.** `pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` — the two guard cases fail for the stated production reason: the slug guard is ABSENT, so the stub calls `page.goto` on the `{}` stub page and rejects with a TypeError instead of the db:seed guard message. (The selector case passes already — the RED is the guard pair.)

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 4: Adopt in the layout spec (against the STUB — this is deliberate; the diagnostic case must be observed red).** In `tests/e2e/admin-changes-feed-layout.spec.ts`: delete the local `LOADED_REVIEW_MODAL` constant (lines 37-38) and its comment block (lines 33-36) — the helper carries both now; add `import { openShowReviewModal } from "./helpers/openShowReviewModal";`; replace lines 133-135 (`page.goto` + `const modal = page.locator(...)` + `toBeVisible`) with:

```ts
const modal = await openShowReviewModal(page, slug);
```

(keep the `emulateMedia`/`setViewportSize` lines above). Downstream — `getByRole("list")`, the atomic measure poll — unchanged. Then ADD the step-7 diagnostic case inside the same describe (after the band loop; it reuses the signed-in `beforeEach`):

```ts
test("helper surfaces enriched diagnostics when a show never mounts (dead slug)", async ({
  page,
}) => {
  // Deterministic neither-locator starve: a slug with no shows row makes the
  // loader redirect("/admin") (app/admin/_showReviewModal.tsx missing-show
  // gate), so neither the modal nor the error boundary ever appears.
  await expect(
    openShowReviewModal(page, "zz-e2e-no-such-show", { timeoutMs: 3_000 }),
  ).rejects.toThrow(
    /published-show-review-modal[\s\S]*admin-route-error-boundary[\s\S]*show_review_snapshot_failed/,
  );
});
```

The regex pins all three substrings (modal testid, boundary testid, server signature) in the order every helper failure message emits them, so an incidental REAL 502 during this navigation (boundary path → retry → still no modal) still passes.

- [ ] **Step 5: Diagnostic case — RED.** `pnpm heavy pnpm exec playwright test tests/e2e/admin-changes-feed-layout.spec.ts --grep "dead slug" --project=desktop-chromium` (non-interactive playwright: always under the semaphore) — fails: the stub's bare modal-only timeout message contains NONE of the three pinned substrings, so the regex cannot match. (The three band cases also still pass against the stub — its happy path is the pre-fix behavior.)

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 6: Implement the full helper** — replace the stub body of `tests/e2e/helpers/openShowReviewModal.ts` with the spec §4.1 contract, steps 1-7:

```ts
/**
 * tests/e2e/helpers/openShowReviewModal.ts
 *
 * Opens /admin?show=<slug> and waits for the LOADED review modal, recovering
 * EXACTLY ONCE from the admin route error boundary via the product's own
 * Retry (app/admin/error.tsx reset()). Rationale + measured root cause:
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §2.
 *
 * Every recovery is surfaced as a test annotation {type: "infra-recovery"};
 * scripts/check-app-e2e-executed.mjs prints them into the job log (green CI
 * runs upload no artifact, and the list reporter prints no annotations).
 *
 * Import discipline: NO top-level value import from @playwright/test; the
 * unit test runs this module under vitest. test.info() arrives via a lazy
 * dynamic import inside the boundary branch.
 */
import type { Locator, Page } from "@playwright/test";

export const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

const BOUNDARY_SELECTOR = '[data-testid="admin-route-error-boundary"]';
const RETRY_SELECTOR = '[data-testid="admin-route-error-retry"]';
const SERVER_SIGNATURE = "show_review_snapshot_failed";
const DEFAULT_TIMEOUT_MS = 30_000;

function starveError(slug: string, recoveryAttempted: boolean): Error {
  return new Error(
    `openShowReviewModal: neither the loaded modal nor the admin error boundary became visible ` +
      `(slug=${slug}, recovery ${recoveryAttempted ? "attempted" : "not attempted"}). ` +
      `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

export async function openShowReviewModal(
  page: Page,
  slug: string,
  opts?: { timeoutMs?: number },
): Promise<Locator> {
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error(
      "openShowReviewModal: empty slug. The caller's show resolution produced nothing; " +
        "run `pnpm db:seed` and check the spec's beforeAll seeding.",
    );
  }
  const timeoutMs =
    opts?.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  await page.goto(`/admin?show=${slug}`);
  const modal = page.locator(LOADED_REVIEW_MODAL);
  const boundary = page.locator(BOUNDARY_SELECTOR);

  try {
    await modal.or(boundary).first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw starveError(slug, false);
  }
  if (await modal.isVisible()) return modal;

  // Error boundary path: recover once via the product's own Retry.
  const { test } = await import("@playwright/test");
  test
    .info()
    .annotations.push({
      type: "infra-recovery",
      description: `slug=${slug}: admin error boundary on first wait; clicking retry`,
    });
  await page.locator(RETRY_SELECTOR).click();
  try {
    await modal.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    if (await boundary.isVisible()) {
      throw new Error(
        `openShowReviewModal: error boundary persisted after one retry (slug=${slug}). ` +
          `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
          `Grep the server log for ${SERVER_SIGNATURE}.`,
      );
    }
    throw starveError(slug, true);
  }
  return modal;
}
```

Every failure message carries BOTH the modal selector and the server signature — the diagnostic case in Step 5 asserts on substrings common to all three exits.

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 7: Run the unit test — GREEN.** `pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` (the enrolled command: observed red in Step 3, green now, same command).

- [ ] **Step 8: Diagnostic case — GREEN.** Re-run Step 5's exact scoped command (under `pnpm heavy`) — passes now that the helper emits the three-substring enriched error.

- [ ] **Step 9: Local e2e run — 8/8.** `pnpm heavy pnpm exec playwright test tests/e2e/admin-changes-feed-layout.spec.ts --project=mobile-safari --project=desktop-chromium` against a freshly seeded local DB (`pnpm db:seed` first; confirm no sibling arc is mid-e2e on the shared stack). Expected: 8 passed — (3 bands + 1 diagnostic) × 2 projects.

- [ ] **Step 10: Commit.** `test(infra): shared review-modal wait helper with one surfaced boundary recovery`

### Task 2: Snapshot log carries the PostgREST fields

<!-- task: red=`pnpm vitest run tests/admin/readShowReviewSnapshot.test.ts` ac=AC-3 -->

**Files:**

- Modify: `lib/admin/readShowReviewSnapshot.ts:49-52` (returned-error log call only)
- Modify: `tests/admin/readShowReviewSnapshot.test.ts:97-114` (extend the existing returned-error case)

**Interfaces:**

- Consumes: `LogFields` index signature (`lib/log/types.ts:4-14`) — arbitrary extra keys are legal; `code` stays absent (the §12.4 telemetry-code slot).
- Produces: log context keys `error` (message string), `pgrstCode`, `pgrstDetails`, `pgrstHint` — the next CI occurrence of the 502 is diagnosable from the fatal line itself.

- [ ] **Step 1: Extend the failing test.** In the existing case `"returned error → infra_error (never ok), logged with a source and NO code"` (`tests/admin/readShowReviewSnapshot.test.ts:97-114`): widen the fixture error and add four assertions —

```ts
const { client } = clientReturning({
  data: null,
  error: {
    message: "permission denied",
    code: "42501",
    details: "fixture details",
    hint: "fixture hint",
  },
});
```

and after the existing `fields.source` assertion:

```ts
expect(fields.error).toBe("permission denied");
expect(fields.pgrstCode).toBe("42501");
expect(fields.pgrstDetails).toBe("fixture details");
expect(fields.pgrstHint).toBe("fixture hint");
```

Keep `expect(fields).not.toHaveProperty("code")` — the telemetry-code pin is load-bearing.

- [ ] **Step 2: Run — RED.** `pnpm vitest run tests/admin/readShowReviewSnapshot.test.ts` — the extended case fails because `lib/admin/readShowReviewSnapshot.ts:51` passes the raw error object (`fields.error` is the object, not `"permission denied"`; the pgrst keys are absent).

- [ ] **Step 3: Implement.** In the returned-error branch of `lib/admin/readShowReviewSnapshot.ts` (the `if (error)` block at lines 48-54), replace the `error,` context line with:

```ts
error: error.message,
pgrstCode: error.code,
pgrstDetails: error.details,
pgrstHint: error.hint,
```

(the `pgrst*` keys deliberately avoid the `code` slot; the runtime object in CI was a plain non-`Error` object that `serializeError` stringified to `'[object Object]'` — `lib/log/serializeError.ts:8-10` via `lib/log/logger.ts:38`). The `catch` branch at lines 60-63 is unchanged.

- [ ] **Step 4: Run — GREEN.** `pnpm vitest run tests/admin/readShowReviewSnapshot.test.ts` — all cases pass, including the untouched thrown-error and R6-shape cases.

- [ ] **Step 5: Commit.** `fix(admin): snapshot read logs the PostgREST error fields instead of '[object Object]'`

### Task 3: Oracle annotation print + batch-1 re-wiring

<!-- spec-lint: ignore — file is created by this plan's tasks -->
<!-- task: red=`pnpm vitest run tests/ci/appE2eAnnotationPrint.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts` ac=AC-4,AC-6 -->

**Files:**

- Modify: `scripts/check-app-e2e-executed.mjs` (export `collectInfraRecoveries`; print rows + total in main; `REQUIRED` row; header comment at line 25)
<!-- spec-lint: ignore — file is created by this plan's tasks -->
- Create: `tests/ci/appE2eAnnotationPrint.test.ts`
- Modify: `.github/workflows/app-e2e.yml` (run-step file list at line 144; header paragraph at lines 5-14)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts:119` (delete the allowlist row)

**Interfaces:**

- Consumes: the JSON report shape `suites[].specs[].tests[].annotations` (verified against the real CI report `app-e2e-playwright-31335985584-1`). Playwright 1.59.1 serializes a runtime-pushed annotation at BOTH `tests[].annotations` and `results[].annotations` (the installed playwright 1.59.1 package's lib/reporters/json.js, lines 181 and 203 — node_modules, reviewer-verified, not repo-tracked) — the collector reads `tests[].annotations` ONLY (the merged exactly-once location).
- Produces: `export function collectInfraRecoveries(report): Array<{ title: string; description: string }>` and stdout lines `infra-recovery: <title> — <description>` plus `infra-recovery total: <n>`.

Two red instruments; the second goes red mid-task by design (red-then-green on the same command).

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 1: Write the failing print-seam test** — `tests/ci/appE2eAnnotationPrint.test.ts`. It pins the seam END-TO-END: runs the oracle as a child process on a synthetic report GENERATED from the live imported `REQUIRED` table (per row, that many first-attempt-passed tests with unique `file:line:title|projectId` identities, so the floor check passes without hardcoding counts — anti-tautology: the fixture derives from the authority the check reads). Shape:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { REQUIRED } from "../../scripts/check-app-e2e-executed.mjs";

type ReportTest = {
  timeout: number;
  annotations: Array<{ type: string; description?: string }>;
  expectedStatus: string;
  projectId: string;
  projectName: string;
  status: string;
  results: Array<{ status: string; annotations?: Array<{ type: string; description?: string }> }>;
};

function passingTest(projectId: string): ReportTest {
  return {
    timeout: 30000,
    annotations: [],
    expectedStatus: "passed",
    projectId,
    projectName: projectId,
    status: "expected",
    results: [{ status: "passed" }],
  };
}

function buildReport(): unknown {
  // Real describe-wrapped reports NEST specs under suite.suites (see the live
  // fixture tests/ci/fixtures/phantom-gap-diagrams-report.json); every spec
  // here is nested one level down, so a collector that drops the walk(suite.suites)
  // recursion finds ZERO specs and the count assertions fail.
  const suites = Object.entries(REQUIRED as Record<string, number>).map(([file, count]) => ({
    title: file,
    file: `tests/e2e/${file}`,
    specs: [],
    suites: [
      {
        title: "describe block",
        file: `tests/e2e/${file}`,
        specs: Array.from({ length: count }, (_, i) => ({
          title: `case ${i}`,
          file: `tests/e2e/${file}`,
          line: 10 + i,
          tests: [passingTest(`proj-${i % 2}`)],
        })),
      },
    ],
  }));
  // Annotation cases ride on the FIRST file's nested specs:
  const first = suites[0]!.suites[0]!;
  first.specs[0]!.tests[0]!.annotations = [
    { type: "infra-recovery", description: "recovery one" },
    { type: "infra-recovery", description: "recovery two" },
  ];
  // duplicated across tests[] and results[]; must print ONCE (merged location only)
  first.specs[1]!.tests[0]!.annotations = [{ type: "infra-recovery", description: "dup" }];
  first.specs[1]!.tests[0]!.results[0]!.annotations = [
    { type: "infra-recovery", description: "dup" },
  ];
  // specs[2] carries a DIFFERENT annotation type that must NOT print; deleting
  // the type filter makes the count assertion fail on this row.
  first.specs[2]!.tests[0]!.annotations = [{ type: "slow", description: "not a recovery" }];
  return { suites };
}

describe("check-app-e2e-executed annotation print seam", () => {
  test("prints one line per infra-recovery from tests[].annotations only, plus a total", () => {
    const dir = mkdtempSync(join(tmpdir(), "app-e2e-annot-"));
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(buildReport()));
    const stdout = execFileSync(
      "node",
      ["scripts/check-app-e2e-executed.mjs", "--report", reportPath],
      { encoding: "utf8" },
    );
    const lines = stdout.split("\n").filter((l) => l.startsWith("infra-recovery:"));
    expect(lines).toHaveLength(3); // two from spec[0], ONE from the duplicated spec[1]
    // Row format pins TITLE + description; a printer that drops the test
    // identity (which run recovered?) fails here, not just the description.
    expect(lines[0]).toContain("case 0");
    expect(lines[0]).toContain("recovery one");
    expect(stdout).toContain("recovery two");
    expect(stdout).not.toContain("not a recovery"); // the type filter is load-bearing
    expect(stdout).toContain("infra-recovery total: 3");
  });
});
```

(Adjust the identity fields to whatever the oracle's `walk` actually reads — `spec.file`, `spec.line`, `spec.title`, `test.projectId`, one `results[0].status === "passed"` — so every floor is met on first attempt. `execFileSync` throws on non-zero exit, which doubles as the exit-0 assertion.)

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 2: Run the ENROLLED command — RED a.** `pnpm heavy pnpm vitest run tests/ci/appE2eAnnotationPrint.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts` (wrapped by the TRANSITIVE-shape rule: the wiring test spawns non-interactive `playwright test --list`, `tests/cross-cutting/app-e2e-ci-wiring.test.ts:72`; the wrapper execvps into the command, so the marker's red-then-green is still observed on the same command) — the annotation test fails (the oracle prints no `infra-recovery` lines; its only stdout path today is the floor summary, `scripts/check-app-e2e-executed.mjs:152-157`) while the wiring test is still green. Always this exact two-file command — the task marker's red-then-green is observed on the SAME command.

- [ ] **Step 3: Implement the print duty.** In `scripts/check-app-e2e-executed.mjs`: add the exported collector next to `REQUIRED`:

```js
/**
 * Every runtime-pushed annotation is serialized at BOTH tests[].annotations and
 * results[].annotations by Playwright 1.59.1's JSON reporter; read the merged
 * tests[] location ONLY, or every recovery double-counts. Spec:
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §4.4.
 */
export function collectInfraRecoveries(report) {
  const rows = [];
  const walk = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          for (const a of test.annotations ?? []) {
            if (a.type === "infra-recovery") {
              rows.push({ title: `${spec.file}:${spec.line} ${spec.title}`, description: a.description ?? "" });
            }
          }
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);
  return rows;
}
```

and in the main block, AFTER the floor check passes (before the final success print or alongside it):

```js
const recoveries = collectInfraRecoveries(report);
for (const r of recoveries) {
  console.log(`infra-recovery: ${r.title} :: ${r.description}`);
}
console.log(`infra-recovery total: ${recoveries.length}`);
```

Informational only — never a gate (a recovered run is a green run by design).

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 4: Run the enrolled command — annotation half GREEN.** `pnpm heavy pnpm vitest run tests/ci/appE2eAnnotationPrint.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts` — both green (the wiring edits have not started yet).

- [ ] **Step 5: Re-wire, observing RED b on the same command.** Edit `.github/workflows/app-e2e.yml:144`: add `tests/e2e/admin-changes-feed-layout.spec.ts` to the run-step file list. Run the ENROLLED two-file command again (`pnpm heavy pnpm vitest run tests/ci/appE2eAnnotationPrint.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts`) — RED b: the wiring test fails because `REQUIRED` lacks the row the workflow now runs at live resolution. Then:
  - `scripts/check-app-e2e-executed.mjs` `REQUIRED`: add `"admin-changes-feed-layout.spec.ts": 8` — (3 bands + 1 diagnostic) × 2 projects (`playwright.config.ts` testMatch resolves the spec in BOTH mobile-safari and desktop-chromium). Registry reconciliation, run at plan time: `grep -c '\.spec\.ts":' scripts/check-app-e2e-executed.mjs` → 8 rows today; 9 after; delta exactly this row.
  - Reconcile EVERY count-bearing comment. Sweep authored AND run at plan time (2026-08-15): `grep -n "eight\|nine\|69\|77" .github/workflows/app-e2e.yml scripts/check-app-e2e-executed.mjs` hits exactly these sites — `.github/workflows/app-e2e.yml:2` ("eight specs" → nine), `.github/workflows/app-e2e.yml:11` ("taking the count to eight" — inside the paragraph rewritten below), `scripts/check-app-e2e-executed.mjs:23-27` header ("EIGHT wired specs, 69 executions" → NINE wired specs, 77 executions = 69 + this spec's 8; the AC-4-drop sentence at line 25 is superseded by the re-entry). Re-run the sweep after editing; zero stale hits.
  - Delete the allowlist row `tests/ci/_metaE2eWorkflowCoverage.test.ts:119` (`"tests/e2e/admin-changes-feed-layout.spec.ts": UNSEEN,`).
  - Rewrite the `.github/workflows/app-e2e.yml:5-14` header paragraph: the spec re-enters with the wait-helper repair; cite `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md`.

<!-- spec-lint: ignore — file is created by this plan's tasks -->
- [ ] **Step 6: Run — GREEN b.** The enrolled two-file command (under `pnpm heavy`, as in Step 2) passes; then also `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` (static file walk, unwrapped).

- [ ] **Step 7: Commit.** `infra: re-admit admin-changes-feed-layout to app-e2e batch 1; oracle prints infra recoveries`

<!-- tasks: end -->

### Task 4: Ledger + docs bookkeeping (outside the enrolled region; red instrument below)

**Files:**

- Modify: `BACKLOG.md` (graduate the entry; file two new entries per spec §8)
- Modify: `BACKLOG-archive.md` (receiving archive entry)
- Modify: `docs/superpowers/plans/ci/README.md` (index row for this plan — the spec's row landed with the spec commit)

Mid-PR steps (safe while work is in flight — the graduation itself is NOT here; it is Task 5's final commit, because the ledger marker must live for exactly as long as the work and the archive rejects in-flight entries):

- [ ] File `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` (deferral reason (c); member list derived by re-running the spec §8.1 greps at filing time; `**Reachability:** INFERRED, NOT PROBED` per-spec, with this arc's CI evidence as the class proof).
- [ ] File `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` (deferral reason (a): reverses the ratified fail-hard posture, `app/admin/_showReviewModal.tsx:25-30`; evidence = spec §2.1 log excerpts).
- [ ] Verify this plan's row in `docs/superpowers/plans/ci/README.md` (it landed with the plan commit at `docs/superpowers/plans/ci/README.md:15` — do NOT add a duplicate).
- [ ] Run `pnpm vitest run tests/docs` — GREEN (the two new filings satisfy the ledger filing bar; nothing graduated yet).
- [ ] Commit: `docs: file helper-adoption and read-posture peers`

### Task 5: Pre-push gates, PR, five-green loop (closeout)

- [ ] Full gates under the semaphore: `pnpm heavy pnpm test:fast`; then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` (unwrapped — scoped/light).
- [ ] Push; open the PR (merge-commit convention). Whole-diff codex cross-model review to APPROVE (split tight-scope per surface if the diff exceeds a handful of files).
- [ ] **AC-5:** five consecutive green `pull_request` runs of `app-e2e.yml` with the spec wired in (`--retries=0` pinned by the run step; the executed-count oracle enforces the 8-case floor each run). Any red restarts the count; a red whose server log shows a non-`show_review_snapshot_failed` cause is triaged on its own merits.
- [ ] **AC-6:** report every `infra-recovery` line from those five runs' job logs in the PR body (count may be zero — say so explicitly).
- [ ] **Final commit — graduation + marker removal (AFTER review APPROVE and the five-green loop; nothing lands after this commit except the merge):**
  - **RED first — enroll the graduation.** Add `{ id: "BL-CHANGES-FEED-MODAL-BATCH-FLAKE", provenance: "fix/changes-feed-batch-flake" }` to `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:95`) BEFORE moving the entry; run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — RED: the id is still in `BACKLOG.md`, absent from the archive ("every graduated id is archive-only", `tests/docs/_metaDeferralLedgerGraduation.test.ts:595`). An unenrolled graduation would let a deleted-but-never-archived entry pass silently.
  - Graduate the entry to `BACKLOG-archive.md`, recording the measured mechanism and explicitly correcting the filed fixture-collision theory (spec §2.3). In the SAME commit: remove the `**Status:** IN PROGRESS · **Branch:**` marker (invariant 12 — the marker comes off in the PR's last commit; archives reject in-flight entries, so graduation and marker removal are inseparable); amend the umbrella AC-4-drop paragraph at `BACKLOG.md:665` (it would otherwise keep asserting the disproven cross-spec-interaction theory) to point at the archive entry; prepend the `Last reconciled:` segment (`BACKLOG.md:7`), demoting the current segment behind `Prior:`; and update that line's verbatim exemption row in `tests/docs/_retiredIdentifiers.ts:188-193` — editing one without the other leaves an unexempted hit AND a stale exemption (`tests/docs/retiredIdentifierReferences.test.ts:235` and `tests/docs/retiredIdentifierReferences.test.ts:244`).
  - Re-run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` — GREEN on the same command; then `pnpm vitest run tests/docs` — GREEN (exemption parity, ledger shape, economy, closeout guards).
  - Commit: `docs: graduate BL-CHANGES-FEED-MODAL-BATCH-FLAKE; drop the in-flight marker`. This docs-only commit triggers one more `pull_request` run — it must also be green, and the five-green count (AC-5) is measured on the runs BEFORE it plus this one; a red here restarts nothing product-side (docs-only) but blocks merge until green.
- [ ] Merge (`gh pr merge --merge`), fast-forward local main, verify `git rev-list --left-right --count main...origin/main` → `0  0`.

## 12. Closeout

impeccable-gate: N/A — no UI surface
