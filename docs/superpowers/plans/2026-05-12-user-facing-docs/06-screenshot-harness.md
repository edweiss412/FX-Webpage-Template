# Phase F — Screenshot harness

**Scope:** Build the deterministic screenshot capture pipeline. Manifest of `(key, route, fixture, viewport, frozenClockInstant)` entries; fixture-INFO-tab date-range parser; Playwright capture script using `signInAs` + `context.clock.install` + `X-Screenshot-Frozen-Now` header; `sharp` encoder with pinned settings; CI drift gate; structural meta-tests (#8, #9, #10, #14); E2E clock-pipeline proof (#18); real screenshot captures committed.

**Prereqs:** Phase E complete (strict sequential per 00-overview.md — implies A + B + C + D also complete). Phase E may have left `<ScreenshotPlaceholder>` references in some pages — Task F.10 converts those to `<Screenshot key>` references in lockstep with capturing the WebPs.

**Tasks:** F.1 → F.11 (11 tasks). F.1 → F.2 → F.3 are linear (manifest defines the contract; parser validates entries; capture script consumes both). F.4 + F.5 run after F.3. F.6 – F.9 are tests that can interleave. F.10 (E2E proof) requires F.5 (the screenshot:help script). F.11 (capture real WebPs) is the deliverable that ships the final bytes.

---

### Task F.1: Manifest definition (`scripts/help-screenshots.manifest.ts`)

**Files:**
- Create: `scripts/help-screenshots.manifest.ts`

Per spec §3.6.1 — the manifest is the single source of truth. `<Screenshot key="...">` references look up here; `_metaScreenshotManifest.test.ts` validates the manifest matches filesystem + fixture corpus.

**Required fields per entry:** `key`, `route`, `fixture`, `frozenClockInstant`, `viewport`. Optional: `theme` ("light" / "dark" / "both"; default "both"), `waitFor`, `captureSelector`, `expectStableMs`.

- [ ] Step 1: Write failing test `tests/help/manifest-shape.test.ts` asserting `MANIFEST` is non-empty, every entry has required fields, every key unique, every `frozenClockInstant` is a valid ISO 8601 date.
- [ ] Step 2: Run test → FAIL.
- [ ] Step 3: Implement `scripts/help-screenshots.manifest.ts` with type `ManifestEntry`, constants `DESKTOP = {width:1280,height:800}` and `MOBILE = {width:390,height:844}`, and a 4-entry seed (`dashboard-active-shows`, `dashboard-pending-ingestion`, `per-show-staged-review`, `preview-as-crew-banner`). Each seed entry uses fixture `2026-03-rpas-central-four-seasons` with `frozenClockInstant: "2026-03-24T15:00:00.000Z"` (mid-show day for that fixture). Task F.10 grows the manifest as content authoring needs.
- [ ] Step 4: `pnpm typecheck && pnpm test tests/help/manifest-shape.test.ts` → PASS.
- [ ] Step 5: Commit: `feat(screenshots): manifest definition + 4 seed entries (Task F.1)`

---

### Task F.2: Fixture-range parser (`scripts/help-screenshots-fixture-range.ts`) + test #14

**Files:**
- Create: `scripts/help-screenshots-fixture-range.ts`
- Create: `tests/help/fixture-range-parser.test.ts`

Per spec §3.6.2 (r10 corrected) + AC-12.34. Parse raw fixture's INFO tab DATES rows; derive `[SET earliest .. STRIKE latest]`. Two layouts: flat `fixtures/shows/raw/<fixture>.md` (multi-tab) and pdf-only split `fixtures/shows/pdf-only/<fixture>__INFO.md`.

- [ ] Step 1: Inspect one fixture to confirm DATES shape: `grep -A20 -i "dates" fixtures/shows/raw/2026-03-rpas-central-four-seasons.md | head -25`. Note: heading prefix, row format (ISO `2026-03-22` vs US `3/22/26`).
- [ ] Step 2: Write failing test asserting `parseFixtureDateRange(src)` returns `{earliest, latest}` matching the known dates for: (a) `2026-03-rpas-central-four-seasons.md` → 2026-03-22 to 2026-03-26, (b) every file under `fixtures/shows/raw/*.md` parses without throwing, (c) `parseFixtureDateRangeFromPath()` handles the pdf-only split form.
- [ ] Step 3: Run test → FAIL.
- [ ] Step 4: Implement parser:
  - Export `type FixtureDateRange = { earliest: Date; latest: Date }`.
  - `parseFixtureDateRange(src: string): FixtureDateRange` — extract INFO tab via regex `/##[^\n]*\bINFO\b[\s\S]*?(?=\n##\s|\n$)/i` (fall back to whole `src` if no match — handles pdf-only single-tab files); extract dates via two regexes (`\b(20\d{2}-\d{2}-\d{2})\b` for ISO, `\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b` for US with 2-digit year → +2000); throw if no dates; sort; return first + last.
  - `parseFixtureDateRangeFromPath(path: string): FixtureDateRange` — read file, call `parseFixtureDateRange(src)`.
- [ ] Step 5: Run test; iterate parser regex if any fixture fails (note any encountered edge cases as inline comments).
- [ ] Step 6: Commit: `feat(screenshots): fixture-range parser for INFO-tab DATES (Task F.2 — test #14)`

---

### Task F.3: Capture script (`scripts/help-screenshots.ts`)

**Files:**
- Modify: `package.json` (add `sharp` dev dep)
- Create: `scripts/help-screenshots.ts`
- Create: `tests/help/capture-script.test.ts`

Per spec §3.6.2 — drives Playwright through the reproducibility preconditions, captures WebP via `sharp`, writes to `public/help/screenshots/<key>-{light,dark}.webp`.

**Mandatory preconditions enforced by the script (spec §3.6.2):**

1. `ENABLE_TEST_AUTH === "true"` AND `TEST_AUTH_SECRET` set → otherwise throw on startup.
2. Browser-side clock pin: `await context.clock.install({ time: new Date(entry.frozenClockInstant) })`.
3. Theme imposed via `page.addInitScript((t) => document.documentElement.setAttribute("data-theme", t), theme)`.
4. Animations off: `page.addStyleTag` with `*, *::before, *::after { animation-duration: 0s !important; ... transition-duration: 0s !important; }`.
5. Server clock pin via header: `await page.setExtraHTTPHeaders({ "X-Screenshot-Frozen-Now": entry.frozenClockInstant, Authorization: \`Bearer ${TEST_AUTH_SECRET}\` })`.
6. Realtime suppression: `page.addInitScript(() => { window.WebSocket = class { ... noop ... } })`.
7. Sign in via `signInAs(page, adminFixture)` from `tests/e2e/helpers/signInAs.ts`.
8. Browser settings: `chromium.launch({ args: ["--font-render-hinting=none", "--disable-skia-runtime-opts"] })`, context `timezoneId: "America/New_York"`, `locale: "en-US"`, `reducedMotion: "reduce"`.
9. Quiescence wait: `waitFor` selector → `waitForLoadState("networkidle")` → `expectStableMs` (default 500).
10. **Fixture-range validation BEFORE any capture:** for every manifest entry, parse the fixture file and assert `frozenClockInstant` is inside the operational range; throw with a clear error if not.
11. Encode via `sharp(pngBuf).webp({ quality: 90, effort: 4, smartSubsample: true, nearLossless: false }).toBuffer()`. Pin `sharp` version in `package.json`.
12. Write output to `public/help/screenshots/<key>-<theme>.webp`.

- [ ] Step 1: `pnpm add -D sharp@^0.34`
- [ ] Step 2: Write failing smoke test asserting the file exists and exports `captureAll: () => Promise<void>`.
- [ ] Step 3: Run test → FAIL.
- [ ] Step 4: Implement `scripts/help-screenshots.ts` per the preconditions list above. Use playwright's `chromium`, `sharp` for encoding, `signInAs` from `tests/e2e/helpers/signInAs.ts`. Provide an `if (require.main === module)` CLI entry so `pnpm dlx tsx scripts/help-screenshots.ts` runs `captureAll().catch(err => { console.error(err); process.exit(1); })`.
- [ ] Step 5: `pnpm typecheck && pnpm test tests/help/capture-script.test.ts` → PASS.
- [ ] Step 6: Commit: `feat(screenshots): capture script with Playwright + sharp + clock pinning (Task F.3)`

---

### Task F.4: Add `screenshots-help` Playwright project

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/global-setup-screenshots.ts`
- Create: `tests/help/playwright-config.test.ts`

Per spec §3.6.2. Dedicated Playwright project with own `webServer` env (`ENABLE_TEST_AUTH=true`, `TEST_AUTH_SECRET`), `globalSetup` running `pnpm db:seed` via `child_process.spawnSync` with array args (NOT `exec`/`execSync` with a shell string — avoids shell-injection class).

- [ ] Step 1: Write failing assertion that the config text contains `name: "screenshots-help"`, `ENABLE_TEST_AUTH: "true"` declaration, and a `globalSetup` reference for the screenshots project.
- [ ] Step 2: Run test → FAIL.
- [ ] Step 3: Edit `playwright.config.ts`:
  - Add a `screenshots-help` project (mirror existing `dev-build` / `prod-build` project shape) with `testMatch: /help-screenshots-clock-pipeline\.spec\.ts/`, `use.viewport`, `use.timezoneId`, `use.locale`, `use.colorScheme`, `use.reducedMotion`, `use.launchOptions.args = ["--font-render-hinting=none","--disable-skia-runtime-opts"]`. Set `globalSetup: "tests/e2e/global-setup-screenshots.ts"` as a project-level field.
  - Add the screenshots `webServer` entry (port 3003) with `env: { ENABLE_TEST_AUTH: "true", TEST_AUTH_SECRET: "test-secret-fixture" }`. Mirror existing webServer entries' shape.
- [ ] Step 4: Create `tests/e2e/global-setup-screenshots.ts`:
  ```ts
  // tests/e2e/global-setup-screenshots.ts — Phase F.4
  // Runs once before the screenshots-help project: seeds DB.
  // Uses spawnSync with array args (NOT exec with a shell string) to avoid
  // shell-injection class — even though the args are static here, the safer
  // pattern is the house rule.
  import { spawnSync } from "node:child_process";

  export default async function globalSetup(): Promise<void> {
    const result = spawnSync("pnpm", ["db:seed"], {
      stdio: "inherit",
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error(`globalSetup: pnpm db:seed exited with status ${result.status}`);
    }
  }
  ```
- [ ] Step 5: Run test → PASS. Smoke-run `pnpm test:e2e --project screenshots-help` — globalSetup executes, webServer comes up; suite is empty until F.9 lands.
- [ ] Step 6: Commit: `feat(screenshots): screenshots-help Playwright project + globalSetup (Task F.4)`

---

### Task F.5: `pnpm screenshot:help` script + CI drift gate

**Files:**
- Modify: `package.json` (add `screenshot:help` script)
- Create: `.github/workflows/screenshots-drift.yml` (or extend existing CI workflow)

Per spec §3.6.3 — CI runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. Non-zero exit fails the PR.

- [ ] Step 1: Add to `package.json` `scripts`: `"screenshot:help": "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm dlx tsx scripts/help-screenshots.ts"`.
- [ ] Step 2: Run `pnpm screenshot:help` manually — confirm WebPs land in `public/help/screenshots/`. If any manifest entry's `frozenClockInstant` is outside its fixture's range, the validation step (F.3 precondition 10) throws — fix the manifest entry.
- [ ] Step 3: `ls .github/workflows/ 2>/dev/null` to see existing workflows. Add a new `screenshots-drift.yml` (or extend an existing workflow with a job). Trigger on PR + daily cron. Steps: checkout → setup-node → pnpm install → `pnpm db:seed` → `pnpm screenshot:help` (with `ENABLE_TEST_AUTH` and `TEST_AUTH_SECRET` from GitHub Secrets) → `git diff --exit-code public/help/screenshots/`.
- [ ] Step 4: Commit: `feat(screenshots): pnpm screenshot:help + CI drift gate (Task F.5)`

---

### Task F.6: `<Screenshot>` `<picture>` contract test (test #10)

**Files:**
- Create: `tests/help/screenshot-picture-contract.test.tsx` (promotes the test from Task D.4 to a manifest-aware variant)

Per spec §7.1 test 10 / AC-12.25.

- [ ] Step 1: Write failing test that iterates `MANIFEST`; for each entry, renders `<Screenshot key={entry.key} alt="Test alt" />`, asserts the output contains:
  - `<picture>` element
  - `<source media="(prefers-color-scheme: dark)" srcset="/help/screenshots/<key>-dark.webp">`
  - `<img src="/help/screenshots/<key>-light.webp" alt="Test alt">`
- [ ] Step 2: Run test — should PASS immediately (Task D.4 implemented the component correctly; this test just exercises every manifest entry).
- [ ] Step 3: Commit: `test(help): <Screenshot> <picture>-contract per manifest entry (Task F.6 — test #10)`

---

### Task F.7: Manifest-integrity meta-test (test #9)

**Files:**
- Create: `tests/help/_metaScreenshotManifest.test.ts`

Per spec §7.1 test 9. Three assertions:

1. Every manifest entry's `fixture` resolves to either `fixtures/shows/raw/<fixture>.md` OR `fixtures/shows/pdf-only/<fixture>__INFO.md`.
2. Every manifest entry has BOTH light + dark WebPs on disk (gated: if `public/help/screenshots/` doesn't exist yet, mark as "first-time / pre-capture" and return — the test goes green once F.11 produces WebPs).
3. No orphan WebPs on disk — every `<key>-{light,dark}.webp` filename's `<key>` is in the manifest.

- [ ] Step 1: Write failing test per the three assertions.
- [ ] Step 2: Run test → FAIL on the fixture-existence assertion if any seed-manifest entry's fixture name is wrong; FAIL on the WebPs assertion until F.11 captures real bytes.
- [ ] Step 3: Iterate manifest entries (fix fixture names) until fixture-existence passes.
- [ ] Step 4: Commit (WebPs assertion stays partially red until F.11): `test(help): _metaScreenshotManifest integrity (Task F.7 — test #9)`

---

### Task F.8: Screenshot-coverage test (test #8)

**Files:**
- Create: `tests/help/screenshot-coverage.test.ts`

Per spec §7.1 test 8. Walks `app/help/**/*.mdx`, extracts every `<Screenshot key="...">` reference, asserts:

1. Every referenced `key` exists in `MANIFEST`.
2. Both WebPs exist on disk under `public/help/screenshots/`.
3. Both WebP files are non-empty.

- [ ] Step 1: Write failing test:
  - Walk `app/help/` recursively, collect `.mdx` files.
  - For each file, regex `/(<Screenshot)\s+[^>]*key=["']([^"']+)["']/g` to extract references.
  - Per reference: assert key ∈ manifest; both WebPs exist; both `statSync(path).size > 0`.
- [ ] Step 2: Run test — FAIL until F.11 captures WebPs for every referenced key (or until F.10's retrofit removes placeholders).
- [ ] Step 3: Commit: `test(help): screenshot-coverage (Task F.8 — test #8)`

---

### Task F.9: E2E clock-pipeline proof (test #18)

**Files:**
- Create: `tests/playwright/help-screenshots-clock-pipeline.spec.ts`

Per spec §7.1 test 18 / AC-12.39. Captures the `preview-as-crew-banner` manifest entry TWICE with two different `frozenClockInstant` values; asserts WebP bytes differ — proving the header reaches the server's render path.

- [ ] Step 1: Write the test:
  - Uses `@playwright/test` `test` / `expect`.
  - Inside the test, sign in as admin via `signInAs`.
  - Define a `captureAt(instant: string): Promise<Buffer>` helper that: installs `context.clock` at `instant`; sets `X-Screenshot-Frozen-Now` + `Authorization: Bearer ${TEST_AUTH_SECRET}` extra headers; navigates to the preview route; waits for the manifest's `waitFor` selector; takes a `page.screenshot({ type: "png" })`; encodes via `sharp` with the same pinned settings as Task F.3.
  - Capture once at `"2026-03-22T15:00:00.000Z"` (pre-show day) and once at `"2026-03-24T15:00:00.000Z"` (mid-show day) — both inside the RPAS Central 2026 fixture window.
  - Write both buffers to `tmp/screenshots-clock-pipeline/` for post-mortem debugging.
  - Assert `buf1.length > 0`, `buf2.length > 0`, and `buf1.equals(buf2) === false`.
- [ ] Step 2: Run the test — `pnpm test:e2e --project screenshots-help`. PASS confirms the request-scoped clock pipeline is wired end-to-end.
- [ ] Step 3: Commit: `test(playwright): E2E clock-pipeline proof for AC-12.39 (Task F.9 — test #18)`

---

### Task F.10: `<Screenshot>` retrofit on Phase E pages

**Files:**
- Modify: each `app/help/**/*.mdx` that has `<ScreenshotPlaceholder>` references from Phase E
- Modify: `scripts/help-screenshots.manifest.ts` (add entries as needed)

Phase E used `<ScreenshotPlaceholder>` for surfaces that weren't capturable yet. Replace each with a real `<Screenshot key="...">` reference + manifest entry.

- [ ] Step 1: Audit — `grep -rn "<ScreenshotPlaceholder" app/help/`.
- [ ] Step 2: For each occurrence, decide:
  - **Needs a real screenshot:** pick a key, add a manifest entry (route + fixture + frozenClockInstant + viewport + waitFor selector), replace placeholder with `<Screenshot key="<new-key>" alt="<copy alt from placeholder>" />`.
  - **Doesn't need a screenshot:** delete the placeholder.
- [ ] Step 3: Run `pnpm screenshot:help` to capture the new WebPs.
- [ ] Step 4: For each retrofitted page, commit: `feat(screenshots): retrofit <page> placeholders with real Screenshot entries (Task F.10 — <page>)`.
- [ ] Step 5: After all pages, run `pnpm test tests/help/screenshot-coverage.test.ts` (F.8) → PASS.

---

### Task F.11: Final clean-run + commit captured WebPs

**Files:**
- All WebPs under `public/help/screenshots/`

- [ ] Step 1: Reset to a clean working tree on the branch (commit/stash any pending changes).
- [ ] Step 2: Run `pnpm screenshot:help` → captures every manifest entry.
- [ ] Step 3: Run `git diff --exit-code public/help/screenshots/` → should exit 0 on a clean re-run (idempotent). If exit non-zero: investigate. Causes: unstable browser timing (`expectStableMs` too low), unmigrated server-side `Date.now()`, Realtime escape.
- [ ] Step 4: Commit captured WebPs: `feat(screenshots): final WebP captures from clean manifest (Task F.11)`
- [ ] Step 5: Run the manifest-integrity test (F.7) → all three assertions PASS.

---

## Phase F close-out

After F.1 – F.11 commits land:

- [ ] Manifest enumerates every documented surface
- [ ] Fixture-range parser validates every entry's `frozenClockInstant`
- [ ] `pnpm screenshot:help` is idempotent on a clean checkout
- [ ] CI workflow exits 0 on `git diff --exit-code public/help/screenshots/`
- [ ] Tests #8, #9, #10, #14, #18 all PASS
- [ ] All `<Screenshot key>` references in MDX resolve; no `<ScreenshotPlaceholder>` references remain (or only on pages explicitly excluded)
- [ ] WebPs under `public/help/screenshots/` are committed
- [ ] **Hand off to Phase G** ([07-affordance-retrofit.md](07-affordance-retrofit.md))

Phase F introduces ~11 commits + WebP binaries.
