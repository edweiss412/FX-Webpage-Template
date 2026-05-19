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

Per spec §3.6.2 (r10 corrected) + AC-11.34. Parse raw fixture's INFO tab DATES rows; derive `[SET earliest .. STRIKE latest]`. Two layouts: flat `fixtures/shows/raw/<fixture>.md` (multi-tab) and pdf-only split `fixtures/shows/pdf-only/<fixture>__INFO.md`.

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
- Create: `tests/e2e/screenshots-help-setup.ts` (Playwright setup test, NOT a default-export globalSetup function)
- Create: `tests/help/playwright-config.test.ts`

Per spec §3.6.2. Dedicated Playwright project with own `webServer` env (`ENABLE_TEST_AUTH=true`, `TEST_AUTH_SECRET`), seeded via the **setup-project pattern** (a real Playwright test that runs once before the capture project).

- [ ] Step 1: Write failing assertion that the config text contains `name: "screenshots-help"`, `ENABLE_TEST_AUTH: "true"` declaration, and the setup-project dependency wiring.
- [ ] Step 2: Run test → FAIL.
- [ ] Step 3: Edit `playwright.config.ts`:
  - **r2 fix per F-r1 finding 2 (HIGH, CROSS-PHASE):** Playwright 1.59+ supports `globalSetup` only at the top-level `TestConfig` level. The setup-project pattern uses a **real Playwright test** that runs via `testMatch`, NOT a default-exported `globalSetup()` function. The r1 draft's `tests/e2e/global-setup-screenshots.ts` with `export default async function globalSetup()` would NEVER execute under a setup project (setup projects run test files; they call `test()` blocks).
  - Add TWO project entries:
    1. **Setup project** `screenshots-help-setup` with `testMatch: /screenshots-help-setup\.ts/`. The matched file is a real Playwright test (see Step 4).
    2. **Capture project** `screenshots-help` with `testMatch: /help-screenshots-clock-pipeline\.spec\.ts/`, `dependencies: ["screenshots-help-setup"]`, `use.viewport`, `use.timezoneId`, `use.locale`, `use.colorScheme`, `use.reducedMotion`, `use.launchOptions.args = ["--font-render-hinting=none","--disable-skia-runtime-opts"]`, `use.baseURL: "http://localhost:3004"`.
  - **r2 fix per F-r1 finding 3 (HIGH, PORT CONFLICT):** the r1 draft used port 3003, but live `playwright.config.ts:104,189,207-208` already binds `prod-runtime-flip` to 3003. Two webServers on the same port race or readiness-check the wrong app. Use **port 3004** for the screenshots webServer + `help-docs` project. Add a config-text assertion pinning `port 3004` so this can't silently regress.
  - Add the screenshots `webServer` entry on **port 3004** with `env: { ENABLE_TEST_AUTH: "true", TEST_AUTH_SECRET: "test-secret-fixture" }`. Mirror existing webServer entries' shape.
  - **r2 — testMatch coverage for new E2E specs (B-r10 finding 2):** add a dedicated `help-docs` project with `testMatch: /(deep-link-walker|help-auth|help-mobile)\.spec\.ts/`, `baseURL: "http://localhost:3004"`, `dependencies: ["screenshots-help-setup"]` (so help-docs also gets seeded DB), mirroring the existing project's `use` shape and including `ENABLE_TEST_AUTH: "true"` / `TEST_AUTH_SECRET` env. Document the project name in the phase summary so reviewers running `pnpm exec playwright test --project=help-docs` see the right scope.

- [ ] Step 4: Create `tests/e2e/screenshots-help-setup.ts` as a **real Playwright test** (NOT a default-export):

  ```ts
  // tests/e2e/screenshots-help-setup.ts — Phase F.4
  // r2 fix per F-r1 finding 2: setup projects run TEST FILES. A default-
  // exported `globalSetup()` function would never execute. This file is a
  // real Playwright test that seeds the DB exactly once before the
  // screenshots-help + help-docs projects run.
  import { test, expect } from "@playwright/test";
  import { spawnSync } from "node:child_process";

  test("seed screenshots DB (runs once before screenshots-help + help-docs)", async () => {
    const result = spawnSync("pnpm", ["db:seed"], {
      stdio: "inherit",
      shell: false,
    });
    expect(
      result.status,
      `pnpm db:seed exited with status ${result.status}`,
    ).toBe(0);
  });
  ```

- [ ] Step 5: Run test → PASS. **r4 fix per F-r3 finding 1 (HIGH):** ALL direct project runs MUST set the test-runner env vars (the setup-project preflight asserts them). Use the env-prefixed form:

  ```bash
  ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm exec playwright test --project screenshots-help-setup
  ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm exec playwright test --project screenshots-help
  ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm exec playwright test --project help-docs
  ```

  Or add convenience scripts to `package.json` mirroring `screenshot:help` (`test:e2e:screenshots-help-setup`, `test:e2e:screenshots-help`, `test:e2e:help-docs`) that bake in the env. Without this, `pnpm test:e2e --project screenshots-help` fails the setup preflight before ever running the capture/clock-pipeline suite.
- [ ] Step 6: Commit: `feat(screenshots): screenshots-help Playwright project + setup-project seeding on port 3004 (Task F.4)`

---

### Task F.5: `pnpm screenshot:help` script + CI drift gate

**Files:**
- Modify: `package.json` (add `screenshot:help` script)
- Create: `.github/workflows/screenshots-drift.yml` (or extend existing CI workflow)

Per spec §3.6.3 — CI runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. Non-zero exit fails the PR.

**r2 fix per F-r1 finding 1 (CRITICAL):** the r1 draft made `screenshot:help` a direct `tsx scripts/help-screenshots.ts` invocation. The Playwright `webServer` declared in F.4 is started ONLY by `playwright test`, not by an arbitrary tsx invocation. On a clean CI runner the script would connect to nothing; locally it might silently capture against a stale dev server that lacks the test-auth env, violating AC-11.19/12.26 (and silently corrupting the WebP corpus).

Two options to fix this; pick (a) to inherit F.4's webServer + setup-project + env automatically:

(a) **PREFERRED:** make screenshot capture a Playwright project. Add a `screenshots-help-capture` project that runs a single `tests/e2e/screenshots-help-capture.spec.ts` test, which iterates the manifest and calls `captureAll()`. Then `pnpm screenshot:help` becomes `pnpm exec playwright test --project=screenshots-help-capture`. Playwright starts the webServer, runs the setup-project seed, then the capture test — single command, server lifecycle owned by Playwright.

(b) Alternative: have `scripts/help-screenshots.ts` itself spawn `next build && next start --port 3004` with the test-auth env set, capture, then kill the server. This duplicates Playwright's webServer logic and is harder to keep in sync; (a) is preferred.

- [ ] Step 1: Implement option (a). Move the `captureAll()` logic from F.3's CLI entry into a Playwright test file `tests/e2e/screenshots-help-capture.spec.ts` (test calls `captureAll()` from `scripts/help-screenshots.ts`). Add the `screenshots-help-capture` project to `playwright.config.ts` with `testMatch: /screenshots-help-capture\.spec\.ts/`, `dependencies: ["screenshots-help-setup"]`, baseURL on port 3004, and the same `use` shape as `screenshots-help`.
- [ ] Step 2: Add to `package.json` `scripts`:
  ```json
  "screenshot:help": "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture playwright test --project=screenshots-help-capture"
  ```

  **r3 fix per F-r2 finding 1 (HIGH):** `webServer.env` sets env for the SPAWNED Next server, NOT for the Playwright test process. The capture script's startup check `process.env.ENABLE_TEST_AUTH === "true"` runs in the test process and would fail without the runner env. The `signInAs` helper + the `Authorization: Bearer ${TEST_AUTH_SECRET}` header in F.9 also read from the test process env — they must match the server's secret exactly.

  Setting both `ENABLE_TEST_AUTH=true` and `TEST_AUTH_SECRET=test-secret-fixture` on the command line ensures the test runner sees them. Playwright then forwards `webServer.env` (with the SAME values) to the spawned Next server. Both processes see the same secret.

  Add an assertion in the setup-project test:

  ```ts
  test("seed screenshots DB (runs once before screenshots-help + help-docs)", async () => {
    // r3: pre-flight that the runner env matches what the webServer was
    // started with. Mismatch = captures will fail auth on a clean CI run.
    expect(process.env.ENABLE_TEST_AUTH).toBe("true");
    expect(process.env.TEST_AUTH_SECRET).toBe("test-secret-fixture");

    const result = spawnSync("pnpm", ["db:seed"], {
      stdio: "inherit",
      shell: false,
    });
    expect(result.status, `pnpm db:seed exited with status ${result.status}`).toBe(0);
  });
  ```
- [ ] Step 3: Run `pnpm screenshot:help` manually — confirm: (i) the webServer comes up on 3004 with test-auth env, (ii) the setup-project test seeds, (iii) `captureAll()` runs, (iv) WebPs land in `public/help/screenshots/`. If any manifest entry's `frozenClockInstant` is outside its fixture's range, F.3 precondition 10 throws — fix the manifest entry.
- [ ] Step 4: `ls .github/workflows/ 2>/dev/null` to see existing workflows. Add `screenshots-drift.yml`. Trigger on PR + daily cron. Steps: checkout → setup-node → pnpm install → `pnpm screenshot:help` (server lifecycle handled by Playwright; no separate `pnpm db:seed` step needed because the setup-project does it) → `git diff --exit-code public/help/screenshots/`.
- [ ] Step 5: Commit: `feat(screenshots): pnpm screenshot:help as Playwright capture project + CI drift gate (Task F.5)`

---

### Task F.6: `<Screenshot>` `<picture>` contract test (test #10) — test-first per AGENTS.md invariant #1

**Files:**
- Create: `tests/help/screenshot-picture-contract.test.tsx` (promotes the test from Task D.4 to a manifest-aware variant)

Per spec §7.1 test 10 / AC-11.25.

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

- [ ] Step 1: Write the test. **r4 fix per F-r3 finding 2 (class-sweep from F.9 attribute-order class):** assertions MUST be attribute-order-independent. The D.4 `<Screenshot>` renders `<img>` with class/loading/decoding alongside src/alt; the literal-tag-string assertions in r1 would fail against the correct component output (or pass only when component output happens to match the asserted attribute order). Use DOM-query assertions on the rendered tree.

  Iterates `MANIFEST`; for each entry, renders `<Screenshot name={entry.key} alt="Test alt" />` via `@testing-library/react` and asserts via `container.querySelector`:

  ```ts
  // @vitest-environment jsdom
  // tests/help/screenshot-picture-contract.test.tsx
  import "@testing-library/jest-dom/vitest";
  import { describe, it, expect } from "vitest";
  import { render } from "@testing-library/react";
  import { Screenshot } from "@/app/help/_components/Screenshot";
  import { MANIFEST } from "@/scripts/help-screenshots.manifest";

  describe("<Screenshot> <picture>-contract per manifest entry (F.6 / test #10)", () => {
    for (const entry of MANIFEST) {
      it(`${entry.key}: emits <picture> + <source media=dark> + <img>`, () => {
        const { container } = render(<Screenshot name={entry.key} alt="Test alt" />);

        // <picture> element exists.
        const picture = container.querySelector("picture");
        expect(picture, `<picture> missing for ${entry.key}`).not.toBeNull();

        // <source> with prefers-color-scheme: dark — attribute-independent.
        const darkSource = picture!.querySelector('source[media="(prefers-color-scheme: dark)"]');
        expect(darkSource, `dark <source> missing for ${entry.key}`).not.toBeNull();
        expect(darkSource!.getAttribute("srcset")).toBe(
          `/help/screenshots/${entry.key}-dark.webp`,
        );

        // <img> — assert required attributes individually; tolerate
        // additional attributes (className, loading, decoding, etc.).
        const img = picture!.querySelector("img");
        expect(img, `<img> missing for ${entry.key}`).not.toBeNull();
        expect(img!.getAttribute("src")).toBe(
          `/help/screenshots/${entry.key}-light.webp`,
        );
        expect(img!.getAttribute("alt")).toBe("Test alt");
      });
    }
  });
  ```
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

Per spec §7.1 test 9. Four assertions:

1. Every manifest entry's `fixture` resolves to either `fixtures/shows/raw/<fixture>.md` OR `fixtures/shows/pdf-only/<fixture>__INFO.md`.
2. **r2 fix per F-r1 finding 5 (MEDIUM): every manifest entry's `route` resolves to a real App Router page.** Compute the file-system path from the route (e.g., `/show/[slug]` → `app/show/[slug]/page.tsx`; `/admin/show/<slug>` → `app/admin/show/[slug]/page.tsx`); assert `existsSync(...)` returns true for `page.tsx` OR `page.mdx`. Without this, a stale or typoed `route` stays manifest-valid until capture time and the harness can commit screenshots of an error/404 page while the meta-test stays green.
3. Every manifest entry has BOTH light + dark WebPs on disk (gated: if `public/help/screenshots/` doesn't exist yet, mark as "first-time / pre-capture" and return — the test goes green once F.11 produces WebPs).
4. No orphan WebPs on disk — every `<key>-{light,dark}.webp` filename's `<key>` is in the manifest.

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
  - For each file, regex `/(<Screenshot)\s+[^>]*name=["']([^"']*)["']/g` to extract references. **r3 fix per D-r3 finding 2 (MEDIUM):** uses `[^"']*` (zero or more) so empty `name=""` props are CAPTURED, not silently skipped — the walker then fails them explicitly below. (r2 used `[^"']+` which let empty names slip through entirely.)
  - **r2 fix per D-r2 finding 1 (HIGH):** the r1 regex matched `key=` which is the OLD prop name — after the r14 rename to `name=`, MDX call sites would be invisible to this walker, letting real coverage gaps ship undetected.
  - Per reference: assert the captured name is non-empty AND ∈ `MANIFEST` (the manifest's JS field stays `key`; only the React prop renamed). An empty captured name fails with "Screenshot has empty name attribute in <file>" — matching the runtime error D.4's component throws.
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

Per spec §7.1 test 18 / AC-11.39. Captures the `preview-as-crew-banner` manifest entry TWICE with two different `frozenClockInstant` values; asserts WebP bytes differ — proving the header reaches the server's render path.

**r2 fix per Phase-C-r8 finding 1 (HIGH, CROSS-PHASE):** the r1 test varied BOTH `context.clock` AND `X-Screenshot-Frozen-Now`, then asserted final-WebP-byte difference. That passes even if the server header path is broken, because client components like `RightNowCard` read browser `Date` under `context.clock` and would produce different output regardless. r2 isolates the server header by **keeping the browser clock fixed** and varying ONLY the server header, AND adds a primary assertion against a **server-rendered marker** (the `data-today` attribute on the schedule tile) extracted from the initial HTML response BEFORE any client hydration. This pins AC-11.39's contract: the header reaches server render.

- [ ] Step 1: Write the test:
  - Uses `@playwright/test` `test` / `expect`.
  - Inside the test, sign in as admin via `signInAs`.
  - **Fix the browser clock once** at a neutral instant (`"2026-03-23T12:00:00.000Z"`) for both captures via `context.clock.install({ time: ... })`. Do NOT vary it between captures.
  - **r3 fix per F-r1 finding 4 (HIGH, CROSS-PHASE):** the r2 helper queried `[data-testid="schedule-tile"]` for a `data-today` attribute, but live `components/tiles/ScheduleTile.tsx` puts `data-testid="schedule-tile"` on the section root while `data-today="true"` (boolean) lives on each `<li data-testid="schedule-day">`. The actual ISO date lives in **`data-day`** on the same `<li>`. Also, querying via `page.locator` after `page.goto` reads the hydrated DOM, NOT the initial server HTML promised by the assertion.

  Fix: fetch the initial HTML via `page.request.get(url, { headers })` (raw server response, no JS execution), parse with a tiny regex or use `JSDOM`, locate `<li data-testid="schedule-day" data-today="true" data-day="YYYY-MM-DD">`, return `data-day`. Helper signature:

  ```ts
  async function serverRenderedTodayAt(instant: string): Promise<string> {
    const res = await page.request.get(previewUrl, {
      headers: {
        "X-Screenshot-Frozen-Now": instant,
        Authorization: `Bearer ${process.env.TEST_AUTH_SECRET}`,
        Cookie: signedInCookieHeader, // from signInAs()
      },
    });
    expect(res.ok()).toBe(true);
    const html = await res.text();
    // Match `<li data-testid="schedule-day" data-today="true" data-day="2026-03-24">`
    // (attribute order can vary — use a permissive match).
    // r3 fix per F-r2 finding 2: live JSX emits attributes in the order
    // `data-testid` → `data-day` → `data-today`. The r2 alternation regex
    // only matched two orderings (testid→today→day OR day→today→testid)
    // and would fail the correct live shape. r3 uses attribute-independent
    // matching: find ALL `<li ...>` elements with all three required
    // attributes (any order), then extract `data-day` via a sub-match.
    const liRe = /<li\b[^>]*>/g;
    let match: RegExpExecArray | null;
    let dataDay: string | null = null;
    while ((match = liRe.exec(html))) {
      const tag = match[0];
      const hasTestid = /\bdata-testid=["']schedule-day["']/.test(tag);
      const hasToday = /\bdata-today=["']true["']/.test(tag);
      if (!hasTestid || !hasToday) continue;
      const dayMatch = tag.match(/\bdata-day=["']([^"']+)["']/);
      if (dayMatch) {
        dataDay = dayMatch[1];
        break;
      }
    }
    expect(dataDay, `no <li data-testid="schedule-day" data-today="true" data-day="..."> found in initial HTML for ${instant}`).not.toBeNull();
    return dataDay!;
  }
  ```

  - **Primary assertion (server-only):** call the helper twice with two different server-header instants (`"2026-03-22T..."` pre-show, `"2026-03-24T..."` mid-show). Assert `today1 !== today2` AND both match the expected dates from the manifest fixture. If `today1 === today2`, the server-render path is NOT consuming the header — TEST FAILS regardless of any WebP output.
  - **Secondary assertion (full-pipeline byte diff, ADDITIONAL not replacement):** with the browser clock still fixed, also capture WebPs via `page.screenshot({ type: "png" })` → sharp-encode at both instants and assert `buf1.equals(buf2) === false`. This catches end-to-end regressions in the encoding/sharp/output path that don't show up in the data-day attribute alone.
  - Write both buffers to `tmp/screenshots-clock-pipeline/` for post-mortem debugging.
- [ ] Step 2: Run the test — **r4 fix per F-r3 finding 1:** set runner env explicitly so the setup-project preflight passes:
  ```bash
  ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture pnpm exec playwright test --project screenshots-help
  ```
  PASS confirms BOTH the server header is consumed AND the full pipeline produces distinct outputs. The PRIMARY (server-only) assertion specifically pins AC-11.39's "request-scoped header reaches server render" contract — a broken server path fails this assertion even if WebP bytes happen to differ.
- [ ] Step 3: Commit: `test(playwright): E2E clock-pipeline proof for AC-11.39 — server-rendered marker + byte diff (Task F.9 — test #18)`

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
