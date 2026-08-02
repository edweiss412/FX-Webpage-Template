# Agenda Fold Seeded E2E + WebKit A11y Leg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the per-viewer agenda day fold through the real crew page with seeded data, and run the fold's accessibility proof on WebKit — closing `BL-AGENDA-FOLD-NO-SEEDED-E2E` and `BL-AGENDA-A11Y-WEBKIT-COVERAGE`.

**Spec:** `docs/superpowers/specs/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit-design.md` (adversarial-review APPROVE at R5, 2026-08-02). The spec is canonical; §1.1 lists the ratified scope decisions — do not relitigate them here.

**Architecture:** Two independent units in one PR. U1: a new `describe` in `tests/e2e/stage-restricted-crew-schedule.spec.ts` (already claimed by the `mobile-safari` project) seeds a show with `agenda_links` + two complementary date-restricted crew members via an extended `seedShowWithCrew`, wired into `crew-e2e.yml` behind a wiring-guard red. U2: a grep-scoped `standalone-webkit-a11y` project in `tests/e2e/standalone.config.ts` behind a new `tests/ci/` wiring-guard red, plus webkit installs and a regenerated baseline.

**Tech Stack:** Playwright 1.59.1, vitest, local Supabase (service-role seed helpers), GitHub Actions.

## Global Constraints

- Diff class: tests + test-helper + CI config + BACKLOG docs only. NO UI code, NO DB migrations, NO advisory locks, NO error-code rows (spec header).
- Commit per task, conventional-commits (`test(...)`, `infra:`, `docs(...)`) — AGENTS.md invariant 6.
- TDD per task — AGENTS.md invariant 1; the red for each task is stated inline.
- All work in this worktree (`FX-worktrees/agenda-fold-seeded-e2e`) — invariant 11.
- Spec §3.2 fixture values are LOCKED (probe-verified): show days 2026-05-06/07, labels "Wednesday, May 6, 2026" / "Thursday, May 7, 2026", Fiona→row 0, Theo→row 1.
- `?s=schedule` on every crew/admin navigation (spec §3.3 — load-bearing; absent `s` renders only the Today section).

## Meta-test inventory (writing-plans mandatory declaration)

- **CREATES:** `tests/ci/standalone-webkit-a11y-wiring.test.ts` (Task 3) — pins the WebKit project's exactly-one-test resolution + webkit install lines.
- **EXTENDS:** `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (Task 2) — stage-restricted run-command + claiming-project assertions; `tests/docs/_metaDeferralLedgerGraduation.test.ts` `BACKLOG_GRADUATED` registry (Task 4) — two rows; `tests/ci/_metaE2eWorkflowCoverage.test.ts` registry row transition UNSEEN → PATH_GATED_BY_EXCLUSION (Task 2).
- Advisory-lock topology: N/A — no `pg_advisory*` surface touched.
- Invariant 9/10 registries: N/A per spec §5 (no new Supabase call site; no mutation surface).

## Mutation-family closure (writing-plans mandatory for guard work)

The two structural guards this plan ships (Task 2 wiring assertion + Task 3 wiring guard)
close these operator families up front — this enumeration is the convergence set; a
reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated
against the shipped guard (AGENTS.md round-economy contract):

- **MF1 — comment-disabled wiring:** full-line and trailing YAML comments (`… # webkit`),
  closed by quote-aware comment stripping before matching.
- **MF2 — non-executing shell position:** `echo playwright test …` / string payloads, closed
  by requiring a pnpm/npx/yarn/exec-prefixed `playwright` invocation per segment.
- **MF3 — token-prefix collision:** `--project=mobile-safari-shadow`, longer paths containing
  the spec path — closed by whole-token equality, never substring.
- **MF4 — cross-segment leakage:** spec file in one `&&`-segment, project flag in another —
  closed by splitting on shell operators (`&&`, `||`, `;`, `|`) and pairing WITHIN a segment.
- **MF5 — grep-scope regression (Task 3 only):** the WebKit project resolving zero tests
  (joined-title trap) or extra tests (dimensional leak), closed by the exactly-one-test pin
  against `--list --reporter=json`.
- **MF6 — non-executing Playwright modes (plan-review R2 live mutant):** `playwright test …
  --list` collects tests, executes none, exits 0 — closed by rejecting segments carrying
  `--list`/`--ui` tokens. (The crew-e2e count-measurement command that legitimately uses
  `--list` lives in a YAML comment, which MF1's stripping already removes — no false
  rejection.) Not applicable to Task 3's install assertions: `playwright install` has no
  collect-only mode.

- **MF7 — conditional-execution guarding (whole-diff review R1 live mutant):** `true || pnpm exec
  playwright test …` is wiring-shaped in a segment the shell skips whenever the left side
  succeeds, and `false && …` is the same hole with the other operator — static text cannot decide
  either. Closed by counting only the HEAD segment of each `run:` scalar (command position, the
  one position that always executes), in BOTH guards. Deliberately fail-closed: a legitimate
  `setup && playwright test …` reads as unwired, which surfaces as "give it its own step", never
  as green-while-dark.
- **MF8 — engine substitution (whole-diff review R1 live mutant):** swapping
  `devices["Desktop Safari"]` for `devices["Desktop Chrome"]` in the new project left the
  exactly-one-test pin green while Safari coverage went dark — the engine was the one thing the
  leg exists to prove and the only thing nothing asserted. Closed by reading
  `use.defaultBrowserType` off the RESOLVED config object (not the source text) in
  `tests/ci/standalone-webkit-a11y-wiring.test.ts`.

- **MF9 — non-`testMatch` selection controls (whole-diff review R2 live mutant):** a
  `testIgnore: /(picker-flow|stage-restricted-crew-schedule)\.spec\.ts/` on the very project the
  command selects made both suites collect ZERO tests while both guards, which parsed only
  `testMatch`, stayed green. `grep`, `grepInvert`, `testDir` and every future control are the same
  hole with different spellings, so the guards no longer parse ANY single control: they ask
  Playwright to resolve the real command (`--list --reporter=json`) and require > 0 tests. Closes
  the class rather than the instance.
- **MF10 — non-acting subcommand modes (whole-diff review R2 live mutants):** `playwright test
  --help` prints usage and exits 0 (test-run guards), and `playwright install --dry-run` /
  `install-deps --dry-run` print what they would do and install nothing (install guards) — all
  wiring-shaped, all zero-effect. Closed by denylisting `--help`/`-h` in the test-run segments and
  `--dry-run`/`--help`/`-h` in the install segments, alongside MF6's `--list`/`--ui`.

Out of scope by declaration: YAML anchors/aliases and multi-line `run: |` blocks — crew-e2e.yml
and standalone-e2e.yml use neither today; the guards read the live files, so introducing one
that hides wiring would surface as a guard FAILURE (fail-closed direction), not a silent pass.

## e2e harness-readiness (writing-plans mandatory checklist)

- **Server boot:** the default `playwright.config.ts` `:3000` webServer (dev server, `127.0.0.1`), exactly as the template file already uses; CI boots it inside `crew-e2e.yml`'s single playwright invocation. No new server.
- **Readiness gate:** `crew-shell` then `section-schedule` visibility before any agenda assertion (template pattern, `stage-restricted-crew-schedule.spec.ts:150-151`); never `networkidle`.
- **Detach-safety:** no `locator.evaluate` in the new tests — only auto-retrying `expect(locator)` matchers (`toHaveJSProperty`, `toBeVisible`, `toHaveText`, `toHaveCount`), which cannot hang on unmounted nodes.

## Snippet provenance

Every TS snippet below was pasted into the live worktree and passed `pnpm typecheck` (strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) on 2026-08-02, with exactly one expected error in the red state (`agendaLinks` not in `SeedShowWithCrewOptions`) and zero after the Task-1 option lands. The matcher derivation was probe-run: `visibleAgendaDaysForViewer` returns `{kind:"subset",rows:[0]}` for Fiona and `{kind:"subset",rows:[1]}` for Theo against the exact fixture below. The Task-2/Task-3 guard snippets (post plan-review-R1 hardening) were additionally probe-RUN against the current tree: the three new assertions fail exactly as their red steps predict (stage-restricted segment absent; `Project(s) "standalone-webkit-a11y" not found`; chromium-only installs) while all five pre-existing wiring tests stay green.

---

### Task 1: Seeded fold describe + `agendaLinks` helper option (U1 core)

**Files:**
- Modify: `tests/e2e/stage-restricted-crew-schedule.spec.ts` (append a second top-level `describe`)
- Modify: `tests/e2e/helpers/seedShowWithCrew.ts` (option type + insert write)

**Interfaces:**
- Consumes: everything already imported at the top of the spec file (`test`, `expect`, `ADMIN_FIXTURE`, `signInAs`, `seedShowWithCrew`, `deleteSeededShow`, `SeededShow`, `seedPickerCookie`, `TEST_AUTH_SECRET`, plus the file-level `BASE_URL` and `FROZEN_NOW` constants). NO new imports.
- Produces: `SeedShowWithCrewOptions.agendaLinks?: ShowRow["agenda_links"]` — later tasks and future specs rely on this exact name.

- [ ] **Step 1: Append the failing describe block** to the END of `tests/e2e/stage-restricted-crew-schedule.spec.ts` (after the existing describe's closing `});`):

```ts
// ── BL-AGENDA-FOLD-NO-SEEDED-E2E: the per-viewer agenda day fold through the REAL crew page ──
//
// Spec docs/superpowers/specs/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit-design.md §3.
// Two date-restricted viewers with COMPLEMENTARY day assignments (Fiona → row 0, Theo →
// row 1) over one two-day extraction: a seam regression that returns a constant subset for
// every explicit viewer fails one of the two tests, so the suite pins the
// viewerDates/restrictionDays → row composition, not just "some row folded" (spec §3.4).
// The admin control proves the fold is a narrowing (admins bypass the matcher entirely).
// `?s=schedule` is LOAD-BEARING (spec §3.3): absent `s` resolves to "today"
// (lib/crew/resolveActiveSection.ts) and CrewSections mounts ONLY the active section.

const FOLD_DATES = {
  travelIn: "2026-05-04",
  set: "2026-05-05",
  showDays: ["2026-05-06", "2026-05-07"],
  travelOut: "2026-05-08",
} as const;

// Shape per lib/agenda/normalizeAgendaExtraction.ts: confidence high|low, numeric
// corrections + extractorVersion, days[].dayLabel string, date string|null, sessions with
// non-empty time and string|null title/room/drift, tracks array. Labels parse to exactly one
// date each (weekday-accurate: 2026-05-06 IS a Wednesday), so the matcher's completeness,
// ambiguity, and every-row-parses gates all pass (probe: rows [0] / rows [1]).
const FOLD_AGENDA_LINKS = [
  {
    label: "AGENDA",
    // Fake fileId: AgendaEmbed renders buttons only; the PDF proxy is fetched solely on
    // click (components/agenda/AgendaEmbed.tsx), which these tests never perform.
    fileId: "agenda-fold-e2e-fileid",
    extracted: {
      confidence: "high" as const,
      corrections: 0,
      extractorVersion: 1,
      days: [
        {
          dayLabel: "Wednesday, May 6, 2026",
          date: null,
          sessions: [{ time: "9:00 AM", title: "Keynote", room: null, tracks: [], drift: null }],
        },
        {
          dayLabel: "Thursday, May 7, 2026",
          date: null,
          sessions: [{ time: "10:00 AM", title: "Breakouts", room: null, tracks: [], drift: null }],
        },
      ],
    },
  },
];

test.describe("date-restricted agenda fold (BL-AGENDA-FOLD-NO-SEEDED-E2E)", () => {
  let show: SeededShow;
  let fionaId: string;
  let theoId: string;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return; // single-writer, template convention
    show = await seedShowWithCrew({
      title: "Agenda Fold E2E Show",
      dates: { ...FOLD_DATES, showDays: [...FOLD_DATES.showDays] },
      agendaLinks: FOLD_AGENDA_LINKS,
      crew: [
        {
          name: "Fold Fiona",
          role: "- Video",
          dateRestriction: { kind: "explicit", days: ["2026-05-06"] },
        },
        {
          name: "Thursday Theo",
          role: "- Audio",
          dateRestriction: { kind: "explicit", days: ["2026-05-07"] },
        },
      ],
    });
    fionaId = show.crew[0]!.id;
    theoId = show.crew[1]!.id;
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    if (show) await deleteSeededShow(show.driveFileId);
  });

  for (const viewer of [
    { label: "Fiona (day 1)", crewIdRef: () => fionaId, own: 0, other: 1 },
    { label: "Theo (day 2)", crewIdRef: () => theoId, own: 1, other: 0 },
  ]) {
    test(`${viewer.label}: own agenda day open+marked, other day folded`, async ({
      browser,
    }, testInfo) => {
      if (testInfo.project.name !== "mobile-safari") return;
      const ctx = await browser.newContext({ baseURL: BASE_URL });
      try {
        await seedPickerCookie(
          ctx,
          [{ showId: show.showId, crewMemberId: viewer.crewIdRef(), epoch: show.pickerEpoch }],
          { url: BASE_URL },
        );
        const page = await ctx.newPage();
        await page.setExtraHTTPHeaders({
          "X-Screenshot-Frozen-Now": FROZEN_NOW,
          Authorization: `Bearer ${TEST_AUTH_SECRET}`,
        });
        const res = await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
          waitUntil: "domcontentloaded",
        });
        expect(res?.status(), "crew route must render (picker cookie)").toBe(200);
        await expect(page.getByTestId("crew-shell")).toBeVisible();
        await expect(page.getByTestId("section-schedule")).toBeVisible();

        // Spec §3.3 assertions 1-5. `open` is asserted as the DOM property (toHaveJSProperty),
        // not attribute string-matching — <details>.open is the live boolean either way.
        await expect(page.getByTestId("agenda-schedule")).toBeVisible();
        await expect(page.getByTestId(`agenda-day-${viewer.own}`)).toHaveJSProperty("open", true);
        const marker = page.getByTestId(`agenda-day-marker-${viewer.own}`);
        await expect(marker).toBeVisible();
        await expect(marker).toHaveText("Your day");
        await expect(page.getByTestId(`agenda-day-${viewer.other}`)).toHaveJSProperty(
          "open",
          false,
        );
        // Folded ≠ hidden: the summary stays visible (fold is de-emphasis, not the day-card
        // privacy boundary).
        await expect(page.getByTestId(`agenda-day-summary-${viewer.other}`)).toBeVisible();
        await expect(page.getByTestId(`agenda-day-marker-${viewer.other}`)).toHaveCount(0);
      } finally {
        await ctx.close();
      }
    });
  }

  test("admin (unrestricted) sees both days open, no markers", async ({ browser }, testInfo) => {
    if (testInfo.project.name !== "mobile-safari") return;
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await ctx.newPage();
      await signInAs(page, ADMIN_FIXTURE, { baseUrl: BASE_URL });
      await page.setExtraHTTPHeaders({
        "X-Screenshot-Frozen-Now": FROZEN_NOW,
        Authorization: `Bearer ${TEST_AUTH_SECRET}`,
      });
      const res = await page.goto(`/show/${show.slug}/${show.shareToken}?s=schedule`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), "admin resolves the same show").toBe(200);
      // Admin resolves {kind:'none'} → viewerDays {kind:'all'} → nothing folds, nothing marks
      // (marker renders only when it DISTINGUISHES — spec §3.4).
      await expect(page.getByTestId("agenda-schedule")).toBeVisible();
      await expect(page.getByTestId("agenda-day-0")).toHaveJSProperty("open", true);
      await expect(page.getByTestId("agenda-day-1")).toHaveJSProperty("open", true);
      await expect(page.locator('[data-testid^="agenda-day-marker-"]')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
```

- [ ] **Step 2: Typecheck red.** Run: `pnpm typecheck`
Expected: exactly ONE error — `tests/e2e/stage-restricted-crew-schedule.spec.ts: 'agendaLinks' does not exist in type 'SeedShowWithCrewOptions'` (verified 2026-08-02).

- [ ] **Step 3: Add the option TYPE only** (not the insert write) in `tests/e2e/helpers/seedShowWithCrew.ts`, between the `dates` and `crew` members of `SeedShowWithCrewOptions`:

```ts
  /** shows.agenda_links jsonb. Omit → column left NULL (getShowForViewer decodes to []). */
  agendaLinks?: ShowRow["agenda_links"];
```

- [ ] **Step 4: Typecheck green, behavioral red.** Run: `pnpm typecheck` → zero errors. Then run:
`pnpm exec playwright test --project=mobile-safari tests/e2e/stage-restricted-crew-schedule.spec.ts`
Expected: the 3 pre-existing tests PASS; the 3 NEW tests FAIL on `agenda-schedule` visibility (the option is accepted but never written, so `shows.agenda_links` is NULL → `hasAgenda` false → no agenda area). This is the spec §6 T2 red — the fold assertions fail for the RIGHT reason (missing data, page otherwise healthy). Requires the local stack: `supabase start` state as for any crew e2e run (preflight already green in this worktree).

- [ ] **Step 5: Write the insert.** In `seedShowWithCrew`, extend the `shows` insert object (directly under the `dates:` line):

```ts
    // JSONB agenda_links — same encoding note as `dates` above. Omitted → NULL →
    // getShowForViewer decodes to [] and the crew page renders no agenda area.
    agenda_links: options.agendaLinks ?? null,
```

- [ ] **Step 6: Run to green.**
`pnpm exec playwright test --project=mobile-safari tests/e2e/stage-restricted-crew-schedule.spec.ts`
Expected: all 6 tests PASS.

- [ ] **Step 7: Commit.**

```bash
git add tests/e2e/stage-restricted-crew-schedule.spec.ts tests/e2e/helpers/seedShowWithCrew.ts
git commit --no-verify -m "test(crew-page): seeded e2e for the per-viewer agenda day fold (BL-AGENDA-FOLD-NO-SEEDED-E2E)"
```

---

### Task 2: CI wiring for the stage-restricted file (U1 CI)

**Files:**
- Modify: `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (new assertion — the RED)
- Modify: `.github/workflows/crew-e2e.yml` (run command, header, step name, count comment)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts:109` (row transition)
- Modify: `playwright.config.ts:393-396` (webServer-filter comment)

**Interfaces:**
- Consumes: the file's existing helpers `read`, `stripCommentsSafely`, `ts` import (all top-of-file).
- Produces: nothing consumed later; the guard itself is the deliverable.

- [ ] **Step 1: Write the failing wiring assertion.** In `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`:

First add two file-level helpers (below `stripYamlComments`), used by the new assertion AND by
the hardened existing one (Step 1b):

```ts
/**
 * Shell segments of every `run:` scalar that actually INVOKE `playwright test` — split on
 * shell operators so an `echo …` payload after `&&` cannot satisfy wiring assertions, and
 * required to start with a runner prefix (pnpm/npx/yarn/exec chain) so a non-executing
 * position (`echo playwright test …`) cannot either. Comments are stripped first
 * (plan-review R1 mutation families MF1/MF2/MF4).
 */
function playwrightTestSegments(yaml: string): string[][] {
  const RUNNER_PREFIX = new Set(["pnpm", "npx", "yarn", "exec"]);
  // Non-executing Playwright modes (MF6, plan-review R2 live mutant): `playwright test
  // --list …` collects and exits 0 without running anything, so a segment carrying it is
  // wiring-shaped but proves zero execution. `--ui` is the trivially adjacent interactive
  // mode. Segments with either token are not wiring.
  const NON_EXECUTING = new Set(["--list", "--ui"]);
  return [...stripYamlComments(yaml).matchAll(/\n\s*(?:-\s*)?run:\s*([^\n]*)/g)]
    .map((m) => m[1]!)
    .flatMap((c) => c.split(/&&|\|\||;|\|/))
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
```

Then add the new assertion after the first `it` (the picker-flow claiming test):

```ts
  it("crew-e2e.yml runs the stage-restricted crew spec under a project whose testMatch claims it", () => {
    // BL-AGENDA-FOLD-NO-SEEDED-E2E wiring red (spec §6 T3). The coverage registry cannot
    // provide this red: its PATH_GATED_BY_EXCLUSION row EXEMPTS the file whether or not any
    // workflow actually names it, so only a run-command assertion makes an unwired file fail.
    const STAGE_SPEC = "tests/e2e/stage-restricted-crew-schedule.spec.ts";
    const naming = playwrightTestSegments(read("crew-e2e.yml")).filter((t) =>
      hasToken(t, STAGE_SPEC),
    );
    expect(
      naming.length,
      `no executing \`playwright test\` segment in crew-e2e.yml names ${STAGE_SPEC} as a whole ` +
        "token — the seeded agenda-fold suite would be dark",
    ).toBeGreaterThan(0);

    const config = stripCommentsSafely(
      readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8"),
      ts.ScriptKind.TS,
    );
    const claiming = config
      .split(/\n\s*name:\s*"/)
      .slice(1)
      .map((block) => {
        const project = block.slice(0, block.indexOf('"'));
        const match = /testMatch:\s*\n?\s*\/\(([^/]+)\)/.exec(block);
        return match !== null && match[1]!.split("|").includes("stage-restricted-crew-schedule")
          ? project
          : null;
      })
      .filter((p): p is string => p !== null);
    expect(
      claiming.length,
      "no playwright.config.ts project's testMatch includes stage-restricted-crew-schedule",
    ).toBeGreaterThan(0);
    expect(
      naming.some((t) => claiming.some((project) => hasToken(t, `--project=${project}`))),
      `the segment naming ${STAGE_SPEC} selects no project whose testMatch claims it (claiming: ` +
        `${claiming.join(", ")}). It would collect zero tests and still report green.`,
    ).toBe(true);
  });
```

- [ ] **Step 1b: Class-sweep the pre-existing twin.** The original picker-flow `it` ("crew-e2e.yml
runs the spec under a project whose testMatch claims it") has the same substring laxity
(pre-existing, surfaced by plan-review R1). Rewrite its `commands`/`naming` computation to the
same helpers — `const naming = playwrightTestSegments(read("crew-e2e.yml")).filter((t) =>
hasToken(t, SPEC));` and the final expectation to
`naming.some((t) => claiming.some((project) => hasToken(t, \`--project=${project}\`)))` —
keeping its messages and the claiming block otherwise unchanged. Same commit: leaving the lax
twin beside the hardened copy re-opens the class.

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts`
Expected: FAIL — "no \`playwright test\` run: line in crew-e2e.yml names tests/e2e/stage-restricted-crew-schedule.spec.ts".

- [ ] **Step 3: Wire the workflow.** In `.github/workflows/crew-e2e.yml`:
  - Append ` tests/e2e/stage-restricted-crew-schedule.spec.ts` to the run command at line 143.
  - Step name (line 142): `Run crew section-toggle + picker-flow + alert-action-links + stage-restricted e2e (:3000 only)`.
  - Header comment (lines 2-4): extend the spec inventory to name `stage-restricted-crew-schedule.spec.ts` under mobile-safari.
  - Count comment (lines 132-136): re-measure with
    `pnpm exec playwright test --project=mobile-safari --project=desktop-chromium tests/e2e/crew-section-toggle.spec.ts tests/e2e/picker-flow.spec.ts tests/e2e/alert-action-links.spec.ts tests/e2e/stage-restricted-crew-schedule.spec.ts --list`
    and write the MEASURED numbers (pre-change measurement 2026-08-02 was 6 + 7 + 4 + 3 in 4 files after Task 1 adds 3 tests it becomes 6 + 7 + 4 + 6; write what `--list` actually prints, do not copy this prediction). Note: the live comment's "picker-flow 6" was already stale (7) — the refresh fixes that too.

- [ ] **Step 4: Registry row + comment sweep (same commit).**
  - `tests/ci/_metaE2eWorkflowCoverage.test.ts:109`: change the row value from `UNSEEN` to `PATH_GATED_BY_EXCLUSION` and replace the preceding "Landed on main via the sibling…" comment with one sentence noting the file is named in crew-e2e.yml as of this branch (paths-ignore-gated like its three siblings).
  - `playwright.config.ts:393-396`: extend the webServer-filter comment's inventory to the four specs ("…plus picker-flow.spec and alert-action-links.spec under desktop-chromium, and stage-restricted-crew-schedule.spec under mobile-safari; every project points at :3000, so one server serves all four").
  - `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:22-24` header: change "both specs carry `PATH_GATED_BY_EXCLUSION` allowlist rows" wording to cover the third crew spec now rowed, and qualify "The REST of the mobile-safari project stays dark" to exclude stage-restricted (now wired).

- [ ] **Step 5: Run to green.**
Run: `pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts`
Expected: both PASS.

- [ ] **Step 6: Commit.**

```bash
git add tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts .github/workflows/crew-e2e.yml tests/ci/_metaE2eWorkflowCoverage.test.ts playwright.config.ts
git commit --no-verify -m "infra: wire stage-restricted crew spec into crew-e2e.yml behind a run-command wiring guard"
```

---

### Task 3: WebKit a11y leg (U2)

**Files:**
- Create: `tests/ci/standalone-webkit-a11y-wiring.test.ts` (the RED)
- Modify: `tests/e2e/standalone.config.ts` (new project)
- Modify: `.github/workflows/standalone-e2e.yml:68-69` (webkit installs)
- Modify: `tests/e2e/standalone-baseline.json` (regenerate)
- Modify: `tests/e2e/agendaScheduleLayout.spec.ts:463-466` (stale comment)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `standalone-webkit-a11y` project name (referenced by the guard and the baseline).

- [ ] **Step 1: Write the failing wiring guard** at `tests/ci/standalone-webkit-a11y-wiring.test.ts`:

```ts
/**
 * tests/ci/standalone-webkit-a11y-wiring.test.ts
 *
 * BL-AGENDA-A11Y-WEBKIT-COVERAGE (spec docs/superpowers/specs/schedule/
 * 2026-08-02-agenda-fold-seeded-e2e-webkit-design.md §4/§6 T4): the fold's accessibility
 * proof must run on WebKit, and the project selecting it must resolve EXACTLY one test.
 *
 * The exact-one pin is the joined-title grep trap made structural: Playwright applies a
 * project's `grep` to "<project> <file> <title>", so an anchored /^a11y:/ silently selects
 * ZERO tests (review R1 probe), and a loosened pattern could select the dimensional tests
 * too — both regress THIS assertion, not just coverage intent.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PROJECT = "standalone-webkit-a11y";

describe("standalone WebKit a11y leg wiring", () => {
  it(`the standalone config resolves ${PROJECT} to exactly the one a11y test`, () => {
    const out = execFileSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "tests/e2e/standalone.config.ts",
        `--project=${PROJECT}`,
        "--list",
        "--reporter=json",
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out.slice(out.indexOf("{"))) as { suites?: unknown[] };
    const tests: { file: string; title: string }[] = [];
    const walk = (suites: unknown[]): void => {
      for (const suite of suites) {
        const s = suite as {
          file?: string;
          suites?: unknown[];
          specs?: { title: string; file: string }[];
        };
        for (const spec of s.specs ?? []) tests.push({ file: spec.file, title: spec.title });
        if (s.suites) walk(s.suites);
      }
    };
    walk(parsed.suites ?? []);
    expect(
      tests,
      `${PROJECT} must resolve exactly ONE test: the a11y disclosure/heading proof in ` +
        "agendaScheduleLayout.spec.ts. Zero = the grep regressed to non-matching (joined-title " +
        "trap); more = the dimensional suite leaked onto WebKit.",
    ).toHaveLength(1);
    expect(tests[0]!.file).toContain("agendaScheduleLayout.spec.ts");
    expect(tests[0]!.title).toContain("a11y:");
  });

  it("standalone-e2e.yml installs webkit alongside chromium", () => {
    // Executing-position, token-exact matching (plan-review R1 families MF1-MF4): YAML
    // comments are stripped (quote-aware, trailing `# webkit` is a disabled token, not an
    // install), run scalars split on shell operators, each segment must be a
    // pnpm/npx-prefixed playwright invocation (an `echo playwright install webkit` payload
    // is non-executing), and `webkit` must appear as a WHOLE token of that segment.
    const stripYaml = (yaml: string): string =>
      yaml
        .split("\n")
        .map((line) => {
          let quote: string | null = null;
          for (let i = 0; i < line.length; i += 1) {
            const ch = line[i]!;
            if (quote !== null) {
              if (ch === quote) quote = null;
              continue;
            }
            if (ch === '"' || ch === "'") quote = ch;
            else if (ch === "#") return line.slice(0, i);
          }
          return line;
        })
        .join("\n");
    const RUNNER_PREFIX = new Set(["pnpm", "npx", "yarn", "exec"]);
    const installSegments = (subcommand: "install" | "install-deps"): string[][] =>
      [...stripYaml(readFileSync(join(ROOT, ".github/workflows/standalone-e2e.yml"), "utf8"))
        .matchAll(/\n\s*(?:-\s*)?run:\s*([^\n]*)/g)]
        .map((m) => m[1]!)
        .flatMap((c) => c.split(/&&|\|\||;|\|/))
        .map((seg) => seg.trim().split(/\s+/))
        .filter((t) => {
          const i = t.indexOf("playwright");
          return (
            i !== -1 && t[i + 1] === subcommand && t.slice(0, i).every((w) => RUNNER_PREFIX.has(w))
          );
        });
    expect(
      installSegments("install-deps").some((t) => t.includes("webkit")),
      "no executing playwright install-deps segment carries webkit as a whole token — the " +
        "WebKit project would fail on a cold CI runner",
    ).toBe(true);
    expect(
      installSegments("install").some((t) => t.includes("webkit")),
      "no executing playwright install segment carries webkit as a whole token — the WebKit " +
        "project would fail on a cold CI runner",
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run tests/ci/standalone-webkit-a11y-wiring.test.ts`
Expected: FAIL twice — the `--list` probe errors (unknown project `standalone-webkit-a11y`), and the install assertion finds chromium-only lines.

- [ ] **Step 3: Add the project.** In `tests/e2e/standalone.config.ts`, `projects` array after `standalone-chromium`:

```ts
    {
      // BL-AGENDA-A11Y-WEBKIT-COVERAGE: the fold's a11y proof (h3-inside-summary exposure)
      // is an empirical per-engine claim and Safari is an explicit crew target. Desktop
      // Safari matches the hand-run probe measured during #610 (green in 5.0s).
      //
      // grep is UNANCHORED on purpose: Playwright matches it against
      // "<project name> <file name> <test title>", so /^a11y:/ selects ZERO tests. The
      // colon-suffixed token cannot false-positive on this project's own name in the joined
      // string ("…-a11y " has a space after it, never a colon), and
      // tests/ci/standalone-webkit-a11y-wiring.test.ts pins exactly-one-test resolution.
      // Dimensional tests stay chromium-only by design (engine layout noise).
      name: "standalone-webkit-a11y",
      testMatch: /agendaScheduleLayout\.spec\.ts/,
      grep: /a11y:/,
      use: { ...devices["Desktop Safari"] },
    },
```

- [ ] **Step 4: Update installs.** `.github/workflows/standalone-e2e.yml:68-69` →

```yaml
      - run: pnpm exec playwright install-deps chromium webkit
      - run: pnpm exec playwright install chromium webkit
```

- [ ] **Step 5: Guard green, baseline red.**
Run: `pnpm vitest run tests/ci/standalone-webkit-a11y-wiring.test.ts` → PASS (both assertions).
Run: `node scripts/check-standalone-baseline.mjs --list-check`
Expected: FAIL — baseline lacks the new project's test identity (comparator lockstep red; NOT the task's TDD red, which was Step 2).

- [ ] **Step 6: Regenerate baseline + verify.**
Run: `node scripts/check-standalone-baseline.mjs --write` then `node scripts/check-standalone-baseline.mjs --list-check` → PASS.
Diff check: `git diff tests/e2e/standalone-baseline.json` must show ONLY additions for the `standalone-webkit-a11y` project identity (one test) — any other identity change means the config edit leaked wider; stop and investigate.

- [ ] **Step 7: Run the leg live.**
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts --project=standalone-webkit-a11y`
Expected: 1 test, PASS, order-of-seconds runtime (webkit binary already installed locally; if a fresh machine lacks it: `pnpm exec playwright install webkit`).

- [ ] **Step 8: Refresh the stale a11y comment.** In `tests/e2e/agendaScheduleLayout.spec.ts:463-466`, replace the "runs Chromium only … filed as BL-AGENDA-A11Y-WEBKIT-COVERAGE" sentences with: the test now ALSO runs under the `standalone-webkit-a11y` project (Desktop Safari) in the same config, and the backlog item is closed on this branch. Keep the surrounding measured-behavior notes untouched.

- [ ] **Step 9: Full standalone-config regression.**
Run: `pnpm vitest run tests/ci/_metaStandaloneConfigBranches.test.ts tests/ci/_metaStandaloneConfigEnv.test.ts tests/ci/_metaSpecRegistration.test.ts`
Expected: PASS (spec §5 predicted no action needed; this is the verification).

- [ ] **Step 10: Commit.**

```bash
git add tests/ci/standalone-webkit-a11y-wiring.test.ts tests/e2e/standalone.config.ts .github/workflows/standalone-e2e.yml tests/e2e/standalone-baseline.json tests/e2e/agendaScheduleLayout.spec.ts
git commit --no-verify -m "infra: WebKit a11y leg for the agenda fold proof (BL-AGENDA-A11Y-WEBKIT-COVERAGE)"
```

---

### Task 4: BACKLOG graduation

**Files:**
- Modify: `BACKLOG.md` (remove both entries; update "Last reconciled" header line)
- Modify: `BACKLOG-archive.md` (append both entries with provenance)
- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` rows)

**Interfaces:** none.

- [ ] **Step 1: Registry rows first (the red).** Add to `BACKLOG_GRADUATED` (top of the array, matching the existing per-entry comment style):

```ts
  // test/agenda-fold-seeded-e2e (2026-08-02): the per-viewer agenda day fold exercised
  // through the REAL crew page — seeded agenda_links + two complementary date-restricted
  // picker-cookie viewers in stage-restricted-crew-schedule.spec.ts, wired into crew-e2e.yml
  // behind a run-command wiring guard.
  { id: "BL-AGENDA-FOLD-NO-SEEDED-E2E", provenance: "test/agenda-fold-seeded-e2e" },
  // test/agenda-fold-seeded-e2e (2026-08-02): the fold's a11y proof on WebKit — grep-scoped
  // standalone-webkit-a11y project (exactly one test, structurally pinned) + webkit installs.
  { id: "BL-AGENDA-A11Y-WEBKIT-COVERAGE", provenance: "test/agenda-fold-seeded-e2e" },
```

- [ ] **Step 2: Run to verify it fails.**
Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`
Expected: FAIL — the "every graduated id is archive-only" assertion (`_metaDeferralLedgerGraduation.test.ts:288-293`) requires each registry id to be present in `BACKLOG-archive.md` AND absent from `BACKLOG.md`; with rows added but entries unmoved, both ids fail "missing from BACKLOG-archive.md". (The per-id provenance assertion at `:309-314` then also requires the archived section to contain `test/agenda-fold-seeded-e2e`.)

- [ ] **Step 3: Move the entries.** Cut both full entry bodies (`### BL-AGENDA-FOLD-NO-SEEDED-E2E …` at BACKLOG.md:409-434 and `### BL-AGENDA-A11Y-WEBKIT-COVERAGE …` at BACKLOG.md:456-474) into `BACKLOG-archive.md` following the archive's existing graduated-entry format (status line gains `GRADUATED — test/agenda-fold-seeded-e2e, 2026-08-02`); fix the now-dangling cross-references: the `BL-AGENDA-FOLD` entry's "Related:" line names the a11y item and the admin-wrapper item — keep the text, it references IDs not sections. Update BACKLOG.md's `Last reconciled:` header line (prepend this branch's graduation in the established prose style). Check no other BACKLOG entry links to the two graduated headings (`grep -n "BL-AGENDA-FOLD-NO-SEEDED-E2E\|BL-AGENDA-A11Y-WEBKIT-COVERAGE" BACKLOG.md` after the cut → only the header-line mention added above).

- [ ] **Step 4: Run to green.**
Run: `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaInvariant8Closeout.test.ts tests/docs/_ledgerMdast.test.ts 2>/dev/null || pnpm vitest run tests/docs/`
Expected: the whole `tests/docs/` suite PASS (ledger walkers are strict about entry shapes; running the directory catches all of them).

- [ ] **Step 5: Commit.**

```bash
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit --no-verify -m "docs: graduate BL-AGENDA-FOLD-NO-SEEDED-E2E + BL-AGENDA-A11Y-WEBKIT-COVERAGE"
```

---

### Task 5: Full gates, PR, merge

**Files:** none new (closeout marker is §12 of this plan).

- [ ] **Step 1: Full local gates.**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec playwright test --project=mobile-safari tests/e2e/stage-restricted-crew-schedule.spec.ts
pnpm exec playwright test --config tests/e2e/standalone.config.ts
```

Expected: all green. (`pnpm test` excludes env-bound/e2e per repo convention; the two playwright runs cover the touched suites — the whole standalone config runs to prove the new project doesn't disturb `standalone-chromium`.)

- [ ] **Step 2: Push + PR.**

```bash
git push -u origin test/agenda-fold-seeded-e2e
gh pr create --title "Agenda fold seeded e2e + WebKit a11y leg" --body "$(cat <<'BODY'
Closes BL-AGENDA-FOLD-NO-SEEDED-E2E (primary) + BL-AGENDA-A11Y-WEBKIT-COVERAGE (rider).

Spec: docs/superpowers/specs/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit-design.md
(cross-model adversarial review APPROVE at R5). Plan:
docs/superpowers/plans/schedule/2026-08-02-agenda-fold-seeded-e2e-webkit.md.

- Seeded crew-page e2e: agendaLinks option on seedShowWithCrew; two complementary
  date-restricted picker-cookie viewers + admin control in
  stage-restricted-crew-schedule.spec.ts; wired into crew-e2e.yml behind a run-command
  wiring-guard red (registry row UNSEEN to PATH_GATED_BY_EXCLUSION, stale-comment sweep).
- WebKit a11y leg: grep-scoped standalone-webkit-a11y project (exactly-one-test pinned by
  tests/ci/standalone-webkit-a11y-wiring.test.ts), webkit installs, regenerated baseline.
- BACKLOG graduation with _metaDeferralLedgerGraduation registry rows.

Test-only diff (tests + workflows + config comments + BACKLOG docs). impeccable-gate: N/A -
no UI surface.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019fpq68ixbb6u4orTRcjQpd
BODY
)"
```

- [ ] **Step 3: Whole-diff cross-model review** (codex-guard, fresh-eyes posture, tight file list — this diff is ~10 files, single scoped review is fine) to APPROVE; repair rounds land as additional commits.

- [ ] **Step 4: Real CI green** — watch `gh pr checks`; crew-e2e.yml and standalone-e2e.yml must both fire and pass (paths-ignore does not exclude this diff: it touches tests + workflows).

- [ ] **Step 5: Merge + sync.**

```bash
gh pr merge --merge
cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only
git rev-list --left-right --count main...origin/main   # must print: 0  0
```

Then Stage 4.4 cleanup: CronDelete the nudge job, clear the herdr pane + agent labels, set ship-state stage to "done".

---

## 11. Post-plan amendment — the fold suite runs on desktop-chromium, not mobile-safari

Ratified by measurement on 2026-08-02, after Task 2 wired the spec in and the FIRST real crew-e2e
run (30754740917) failed. **The canonical record of this change is spec §1.2** — the plan does not
supersede the spec (AGENTS.md invariant 7); the spec was amended first and this section restates
its consequences for the task bodies above, which still spell `mobile-safari` and the picker-cookie
staging they were written against.

**What the run measured.** Four cases failed, all of them the non-admin viewers — including the two
pre-existing SFS-1 cases that had never run in CI before this branch wired the file in. Every
`signInAs` (admin) case in the same file passed. The trace screencast shows the first-contact
Welcome gate, not the crew shell: Linux WebKit dropped the injected `__Host-fxav_picker` cookie.
The prefix requires Secure, and that build does not extend the localhost/127.0.0.1 secure-context
exemption to it; macOS WebKit does, which is why the mechanism passed locally for months. Nothing
about the fold itself was wrong.

**What changed.**

- Staging moved from an injected picker cookie to an **email-matched Google session**: the seeded
  crew row carries `NON_ADMIN_CREW_FIXTURE.email`, so `validateGoogleSession` resolves the generic
  fixture TO the restricted row (the `sign-in-page.spec.ts` pattern; an unclaimed row is fine).
- The fold describe seeds **one show per viewer** — the single fixture email can identify only one
  row per show — differing ONLY in which row carries it. The anti-tautology property is preserved:
  the same fixture sees row 0 open in one show and row 1 in the other.
- Navigation is **two-step**: bootstrap on the BARE show URL, then re-navigate with `?s=schedule`.
  `/api/auth/picker-bootstrap` rejects a `next` carrying a query string and renders "Sign-in
  unavailable" (measured on both engines) — filed as `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`.
- The spec's `testMatch` membership moved **mobile-safari → desktop-chromium**, joining
  picker-flow.spec for the same cookie reason, and every project claim in the workflow header, the
  count comment, the webServer comment and the guard header was reconciled to match.

## 12. Closeout

impeccable-gate: N/A — no UI surface

(Test/config/docs-only diff: `tests/**`, `.github/workflows/**`, `playwright.config.ts` comment, `BACKLOG*.md`, spec/plan docs. No `app/**` outside api, no `components/**`, no theme tokens, no DESIGN.md.)
