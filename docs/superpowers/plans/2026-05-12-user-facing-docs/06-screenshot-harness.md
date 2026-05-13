# Phase F — Screenshot harness

**Scope:** Build the deterministic screenshot capture pipeline. Manifest of `(key, route, fixture, viewport, frozenClockInstant)` entries; fixture-INFO-tab date-range parser; Playwright capture script using `signInAs` + `context.clock.install` + `X-Screenshot-Frozen-Now` header; `sharp` encoder with pinned settings; CI drift gate; structural meta-tests (#8, #9, #10, #14); E2E clock-pipeline proof (#18); real screenshot captures committed.

**Prereqs:** Phase E complete (strict sequential per 00-overview.md — implies A + B + C + D also complete). Phase E may have left `<ScreenshotPlaceholder>` references in some pages — Task F.10 converts those to `<Screenshot name>` references in lockstep with capturing the WebPs.

**Tasks:** F.1 → F.11 (11 tasks). F.1 → F.2 → F.3 are linear (manifest defines the contract; parser validates entries; capture script consumes both). F.4 + F.5 run after F.3. F.6 – F.9 are tests that can interleave. F.10 (E2E proof) requires F.5 (the screenshot:help script). F.11 (capture real WebPs) is the deliverable that ships the final bytes.

---

### Task F.1: Manifest definition (`scripts/help-screenshots.manifest.ts`)

**Files:**
- Create: `scripts/help-screenshots.manifest.ts`

Per spec §3.6.1 — the manifest is the single source of truth. `<Screenshot name="...">` references look up here; `_metaScreenshotManifest.test.ts` validates the manifest matches filesystem + fixture corpus.

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
  - **r2 — Playwright API correction (B-r10 finding 1):** Playwright 1.59+ does NOT support `globalSetup` as a `Project`-level option — it's a top-level `TestConfig` option only. Project-scoped setup uses a **setup project + dependency** pattern instead. Add TWO project entries:
    1. A setup project `screenshots-help-setup` with `testMatch: /global-setup-screenshots\.ts/` (the file itself becomes a single-test setup task).
    2. The capture project `screenshots-help` with `testMatch: /help-screenshots-clock-pipeline\.spec\.ts/`, `dependencies: ["screenshots-help-setup"]`, `use.viewport`, `use.timezoneId`, `use.locale`, `use.colorScheme`, `use.reducedMotion`, `use.launchOptions.args = ["--font-render-hinting=none","--disable-skia-runtime-opts"]`.
  - Add the screenshots `webServer` entry (port 3003) with `env: { ENABLE_TEST_AUTH: "true", TEST_AUTH_SECRET: "test-secret-fixture" }`. Mirror existing webServer entries' shape.
  - **r2 — testMatch coverage for new E2E specs (B-r10 finding 2):** the live `playwright.config.ts` uses restrictive `testMatch` regexes per project (currently `/admin-dev\.spec\.ts/` on multiple projects). Without an update, the new specs created by Phase G (`deep-link-walker.spec.ts`), Phase H (`help-auth.spec.ts`, `help-mobile.spec.ts`) will be silently uncollected and `pnpm test:e2e` can return green without running them. Add a dedicated `help-docs` project with `testMatch: /(deep-link-walker|help-auth|help-mobile)\.spec\.ts/`, mirroring the existing project's webServer + use shape and including `ENABLE_TEST_AUTH: "true"` / `TEST_AUTH_SECRET` env so the auth-test fixtures work. Document the project name in the phase summary so reviewers running `pnpm exec playwright test --project=help-docs` see the right scope.
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

### Task F.6: `<Screenshot>` `<picture>` contract test (test #10) — test-first per AGENTS.md invariant #1

**Files:**
- Create: `tests/help/screenshot-picture-contract.test.tsx` (promotes the test from Task D.4 to a manifest-aware variant)

Per spec §7.1 test 10 / AC-12.25.

**r2 — TDD ordering fix (B-r8 finding 3, cross-phase verify-red sweep per B-r7 finding 1):** the r1 task said "Run test — should PASS immediately (Task D.4 implemented the component correctly)." That is green-only commit and violates AGENTS.md invariant #1. r2 adds a Step 0 verify-red that temporarily breaks the `<Screenshot>` `<picture>` shape, observes the new test FAIL, restores, then commits green — same restore protocol as B.5 / Phase H.

- [ ] **Step 0: Verify-red-via-restore**

Temporarily break one branch of `<Screenshot>`'s output to prove the new contract test catches the regression:

```bash
# Pre-flight: app/help/_components/Screenshot.tsx must be clean — else the restore
# step would discard unrelated working-tree edits.
git status --short app/help/_components/Screenshot.tsx
# Expected: empty output. ABORT and resolve those edits first if non-empty.

# Backup, then break the dark <source> media attribute so manifest-aware
# assertions on it fail:
cp app/help/_components/Screenshot.tsx app/help/_components/Screenshot.tsx.bak
sed -i '' 's/(prefers-color-scheme: dark)/(prefers-color-scheme: light)/' app/help/_components/Screenshot.tsx
```

After Step 1 writes the test, run it. Expected: FAILS for every manifest entry — the dark `<source>` media query is wrong. Restore:

```bash
mv app/help/_components/Screenshot.tsx.bak app/help/_components/Screenshot.tsx
git status --short app/help/_components/Screenshot.tsx
# Expected: empty output.
```

- [ ] Step 1: Write the test. Iterates `MANIFEST`; for each entry, renders `<Screenshot name={entry.key} alt="Test alt" />`, asserts the output contains:
  - `<picture>` element
  - `<source media="(prefers-color-scheme: dark)" srcset="/help/screenshots/<key>-dark.webp">`
  - `<img src="/help/screenshots/<key>-light.webp" alt="Test alt">`
- [ ] Step 2: Re-run the test against the restored `<Screenshot>` component — PASSES.
- [ ] Step 3: Commit (record the observed verify-red failure in the message body):

  ```bash
  git commit -m "test(help): <Screenshot> <picture>-contract per manifest entry (Task F.6 — test #10)

  Verify-red observed: swapped 'prefers-color-scheme: dark' -> light in
  Screenshot.tsx; manifest-aware assertion failed for every entry.
  Restored and re-ran -> PASS."
  ```

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
- [ ] Step 4: Commit (test PASSES at F.7; the WebP-existence assertion short-circuits when `public/help/screenshots/` doesn't yet exist — F.11 creates the dir and the assertion starts firing on a green baseline): `test(help): _metaScreenshotManifest integrity (Task F.7 — test #9, TDD green)`

---

### Task F.8: Screenshot-coverage test (test #8) — manifest-key-only at F.8 commit

**Files:**
- Create: `tests/help/screenshot-coverage.test.ts`

Per spec §7.1 test 8 (TDD-compliant split per r5). The full test has two halves:
- **Half A (F.8 commit, TDD-green):** every `<Screenshot name="...">` reference resolves to a `MANIFEST` entry.
- **Half B (F.11 commit, after captures):** the on-disk WebP existence + non-empty checks. F.11 appends these to the same test file once the WebPs are committed.

This split honors AGENTS.md plan-wide invariant #1 (TDD: every commit green). r4 missed this — F.8 was committing red until F.11.

- [ ] Step 1: Write the failing test (Half A only):
  - Walk `app/help/` recursively, collect `.mdx` files.
  - For each file, regex `/(<Screenshot)\s+[^>]*name=["']([^"']+)["']/g` to extract references. **r2 fix per D-r2 finding 1 (HIGH):** the r1 regex matched `key=` which is the OLD prop name — after the r14 rename to `name=`, MDX call sites would be invisible to this walker, letting real coverage gaps ship undetected.
  - Per reference: assert the extracted name ∈ `MANIFEST` (the manifest's JS field stays `key`; only the React prop renamed).
  - **Non-empty assertion:** at least one `<Screenshot name=>` reference must be discovered in the walk (else the regex is broken or the walk finds nothing). Prevents vacuous pass.
  - NO on-disk WebP assertion at F.8 commit.
- [ ] Step 2: Run test — FAILS if any Phase E page references a `<Screenshot name>` that's not yet in the manifest. Phase E may have authored against not-yet-added manifest keys; F.8 catches these.
- [ ] Step 3: Add manifest entries (or fix MDX `name` typos) until Half A passes.
- [ ] Step 4: Commit (Half A green): `test(help): screenshot-coverage Half A — manifest reachability via name prop (Task F.8 — test #8)`

**F.11 appends Half B:** after captures land, extend this same file with the on-disk WebP existence + non-empty assertions. F.11 commits green on its own (because the captures are present).

---

### Task F.9: E2E clock-pipeline proof (test #18)

**Files:**
- Create: `tests/e2e/help-screenshots-clock-pipeline.spec.ts`

Per spec §7.1 test 18 / AC-12.39. Captures the `preview-as-crew-banner` manifest entry TWICE with two different `frozenClockInstant` values; asserts WebP bytes differ — proving the header reaches the server's render path.

**r2 fix per Phase-C-r8 finding 1 (HIGH, CROSS-PHASE):** the r1 test varied BOTH `context.clock` AND `X-Screenshot-Frozen-Now`, then asserted final-WebP-byte difference. That passes even if the server header path is broken, because client components like `RightNowCard` read browser `Date` under `context.clock` and would produce different output regardless. r2 isolates the server header by **keeping the browser clock fixed** and varying ONLY the server header, AND adds a primary assertion against a **server-rendered marker** (the `data-today` attribute on the schedule tile) extracted from the initial HTML response BEFORE any client hydration. This pins AC-12.39's contract: the header reaches server render.

- [ ] Step 1: Write the test:
  - Uses `@playwright/test` `test` / `expect`.
  - Inside the test, sign in as admin via `signInAs`.
  - **Fix the browser clock once** at a neutral instant (`"2026-03-23T12:00:00.000Z"`) for both captures via `context.clock.install({ time: ... })`. Do NOT vary it between captures.
  - Define a `serverRenderedTodayAt(instant: string): Promise<string>` helper that: sets `X-Screenshot-Frozen-Now` + `Authorization: Bearer ${TEST_AUTH_SECRET}` extra headers; navigates to the preview route with `await page.goto(url, { waitUntil: "domcontentloaded" })`; extracts the **server-rendered** `data-today` attribute from the schedule tile via `await page.locator('[data-testid="schedule-tile"]').getAttribute("data-today")` BEFORE client effects can rewrite it.
  - **Primary assertion (server-only):** call the helper twice with two different server-header instants (`"2026-03-22T..."` pre-show, `"2026-03-24T..."` mid-show). Assert `today1 !== today2` AND both match the expected dates from the manifest fixture. If `today1 === today2`, the server-render path is NOT consuming the header — TEST FAILS regardless of any WebP output.
  - **Secondary assertion (full-pipeline byte diff, ADDITIONAL not replacement):** with the browser clock still fixed, also capture WebPs via `page.screenshot({ type: "png" })` → sharp-encode at both instants and assert `buf1.equals(buf2) === false`. This catches end-to-end regressions in the encoding/sharp/output path that don't show up in the data-today attribute alone.
  - Write both buffers to `tmp/screenshots-clock-pipeline/` for post-mortem debugging.
- [ ] Step 2: Run the test — `pnpm test:e2e --project screenshots-help`. PASS confirms BOTH the server header is consumed AND the full pipeline produces distinct outputs. The PRIMARY (server-only) assertion specifically pins AC-12.39's "request-scoped header reaches server render" contract — a broken server path fails this assertion even if WebP bytes happen to differ.
- [ ] Step 3: Commit: `test(playwright): E2E clock-pipeline proof for AC-12.39 — server-rendered marker + byte diff (Task F.9 — test #18)`

---

### Task F.10: `<Screenshot>` retrofit on Phase E pages

**Files:**
- Modify: each `app/help/**/*.mdx` that has `<ScreenshotPlaceholder>` references from Phase E
- Modify: `scripts/help-screenshots.manifest.ts` (add entries as needed)

Phase E used `<ScreenshotPlaceholder>` for surfaces that weren't capturable yet. Replace each with a real `<Screenshot name="...">` reference + manifest entry.

- [ ] Step 1: Audit — `grep -rn "<ScreenshotPlaceholder" app/help/`.
- [ ] Step 2: For each occurrence, decide:
  - **Needs a real screenshot:** pick a key, add a manifest entry (route + fixture + frozenClockInstant + viewport + waitFor selector), replace placeholder with `<Screenshot name="<new-key>" alt="<copy alt from placeholder>" />`.
  - **Doesn't need a screenshot:** delete the placeholder.
- [ ] Step 3: Run `pnpm screenshot:help` to capture the new WebPs.
- [ ] Step 4: For each retrofitted page, commit: `feat(screenshots): retrofit <page> placeholders with real Screenshot entries (Task F.10 — <page>)`.
- [ ] Step 5: After all pages, run `pnpm test tests/help/screenshot-coverage.test.ts` (F.8) → PASS.

---

### Task F.11: Final clean-run + commit captured WebPs + append screenshot-coverage Half B

**Files:**
- All WebPs under `public/help/screenshots/`
- Modify: `tests/help/screenshot-coverage.test.ts` (append Half B — F.8 only committed Half A)

- [ ] Step 1: Reset to a clean working tree on the branch (commit/stash any pending changes).
- [ ] Step 2: **Write Half B BEFORE capturing WebPs (TDD-clean red-then-green per r7 — round-6 finding 1).** The previous draft wrote Half B after captures, producing a green-only commit. r7 fixes by ordering: write the assertion → run it red (WebPs don't exist yet) → run capture (makes it green) → commit both.

  Edit `tests/help/screenshot-coverage.test.ts` and append:

  ```ts
  describe("Screenshot coverage Half B — on-disk WebP existence (Task F.11)", () => {
    const outDir = join(process.cwd(), "public/help/screenshots");
    for (const ref of screenshotRefs) {
      for (const theme of ["light", "dark"] as const) {
        const path = join(outDir, `${ref.key}-${theme}.webp`);
        it(`${ref.key}-${theme}.webp exists and is non-empty`, () => {
          expect(existsSync(path), `Missing WebP: ${path}`).toBe(true);
          expect(statSync(path).size, `Empty WebP: ${path}`).toBeGreaterThan(0);
        });
      }
    }
  });
  ```

- [ ] Step 3: Run the test — expected RED (WebPs not captured yet OR `public/help/screenshots/` empty if first F.11 run): `pnpm test tests/help/screenshot-coverage.test.ts`. This proves Half B catches missing WebPs.
- [ ] Step 4: Run `pnpm screenshot:help` → captures every manifest entry.
- [ ] Step 5: Run `git diff --exit-code public/help/screenshots/` → should exit 0 on a re-run after first capture (idempotent). On first F.11 run, expect new WebP bytes.
- [ ] Step 6: Re-run `pnpm test tests/help/screenshot-coverage.test.ts` → both Half A and Half B PASS now (WebPs on disk).
- [ ] Step 7: Commit captured WebPs + Half B together: `feat(screenshots): final WebP captures + coverage Half B (Task F.11 — completes test #8, TDD red→green)`
- [ ] Step 8: Run the manifest-integrity test (F.7) → all three assertions PASS (the WebP-existence assertion that short-circuited at F.7 now fires green).

---

## Phase F close-out

After F.1 – F.11 commits land:

- [ ] Manifest enumerates every documented surface
- [ ] Fixture-range parser validates every entry's `frozenClockInstant`
- [ ] `pnpm screenshot:help` is idempotent on a clean checkout
- [ ] CI workflow exits 0 on `git diff --exit-code public/help/screenshots/`
- [ ] Tests #8, #9, #10, #14, #18 all PASS
- [ ] All `<Screenshot name>` references in MDX resolve; no `<ScreenshotPlaceholder>` references remain (or only on pages explicitly excluded)
- [ ] WebPs under `public/help/screenshots/` are committed
- [ ] **Hand off to Phase G** ([07-affordance-retrofit.md](07-affordance-retrofit.md))

Phase F introduces ~11 commits + WebP binaries.
