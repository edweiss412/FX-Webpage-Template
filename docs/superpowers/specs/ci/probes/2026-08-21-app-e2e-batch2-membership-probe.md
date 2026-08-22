<!-- spec-lint: not-ui — dated probe record (measurements quoted from run artifacts), not a design; it carries no scope to resolve. impeccable-gate: N/A — no UI surface. -->

# Probe record — app-e2e batch 2 membership (2026-08-21)

Companion to `docs/superpowers/specs/ci/2026-08-21-app-e2e-batch2-design.md`. Every number in the spec that describes a run comes from this record; this record is a dated measurement and is not edited to stay current. Commands are reproduced as run; outputs are quoted from the files named beside them, never retyped from memory.

Tree: `ci/app-e2e-batch2` at `ba5d3f808` (clean: `git status --porcelain | wc -l` = 0 before and after every run). Machine: the origin dev machine, shared local Supabase (127.0.0.1 port 54321), `pnpm dev` posture on port 3000. Two other heavy-slot holders were live during both queues; no other `playwright test` or `next dev|start` process was live at either launch (probe.ps.before held only `@playwright/mcp` server processes, which are unrelated to the app).

## 1. Population

```
$ grep -E '^ +"tests/e2e/[^"]+": UNSEEN,' tests/ci/_metaE2eWorkflowCoverage.test.ts | grep -oE 'tests/e2e/[^"]+'
tests/e2e/admin-dev.spec.ts
tests/e2e/admin-parse-panel.spec.ts
tests/e2e/admin-route-boundaries.spec.ts
tests/e2e/staged-preview.spec.ts
tests/e2e/admin-settings-admins-refresh.spec.ts
tests/e2e/deep-link-walker.spec.ts
tests/e2e/dev-capture.spec.ts
tests/e2e/developer-tier.spec.ts
tests/e2e/empty-state-reachability.spec.ts
tests/e2e/help-auth.spec.ts
tests/e2e/help-mobile.spec.ts
tests/e2e/help-screenshots-clock-pipeline.spec.ts
tests/e2e/help-typography.spec.ts
tests/e2e/needs-attention-page.spec.ts
tests/e2e/no-raw-codes.spec.ts
tests/e2e/onboarding-wizard-step1.spec.ts
tests/e2e/published-show-attention.spec.ts
tests/e2e/roles-settings-layout.spec.ts
tests/e2e/screenshots-help-capture.spec.ts
tests/e2e/sign-in-page.spec.ts
tests/e2e/source-link-dimensional.spec.ts
tests/e2e/telemetry-layout.spec.ts
tests/e2e/warning-panel-polish.spec.ts
$ ... | wc -l
23
```

## 2. Resolution (`--list`, no webServer, not a heavy phase)

```
$ BASELINE_SERVER_ONLY=1 pnpm exec playwright test --list --project=mobile-safari --project=desktop-chromium <the 23 paths>
Total: 114 tests in 16 files
$ pnpm exec playwright test --list <the 23 paths>     # every project
Total: 375 tests in 25 files   # includes dependency projects' own files (help-docs-setup, screenshots-help-setup, attention-modal-gallery under dev-build)
```

Per (project, file), both listings (`grep -E '^\s+\[' | sed -E 's/^[[:space:]]+\[([^]]+)\] › ([^:]+):.*/\1 \2/' | sort | uniq -c`):

```
      5 desktop-chromium admin-parse-panel.spec.ts        5 mobile-safari admin-parse-panel.spec.ts
      5 desktop-chromium admin-route-boundaries.spec.ts
      1 desktop-chromium admin-settings-admins-refresh.spec.ts
      4 desktop-chromium dev-capture.spec.ts
      7 desktop-chromium developer-tier.spec.ts
      4 desktop-chromium empty-state-reachability.spec.ts  4 mobile-safari empty-state-reachability.spec.ts
      6 desktop-chromium needs-attention-page.spec.ts     6 mobile-safari needs-attention-page.spec.ts
     10 mobile-safari no-raw-codes.spec.ts
      2 mobile-safari onboarding-wizard-step1.spec.ts
      6 desktop-chromium published-show-attention.spec.ts
      5 desktop-chromium roles-settings-layout.spec.ts
     12 desktop-chromium sign-in-page.spec.ts             12 mobile-safari sign-in-page.spec.ts
      5 desktop-chromium source-link-dimensional.spec.ts
      8 desktop-chromium staged-preview.spec.ts
      3 desktop-chromium telemetry-layout.spec.ts
      4 desktop-chromium warning-panel-polish.spec.ts
   --- non-baseline projects (class C) ---
      6 dev-build admin-dev.spec.ts   6 prod-build admin-dev.spec.ts   6 prod-runtime-flip admin-dev.spec.ts
     19 help-docs deep-link-walker.spec.ts   19 help-docs-desktop deep-link-walker.spec.ts
     13 help-docs help-auth.spec.ts   1 help-docs help-mobile.spec.ts
      6 help-docs help-typography.spec.ts   6 help-docs-desktop help-typography.spec.ts
      1 screenshots-help help-screenshots-clock-pipeline.spec.ts
   NOWHERE: screenshots-help-capture.spec.ts   (default config; resolves only under playwright.screenshots.config.ts)
```

## 3. Static sweep (grep counts per file, the 16 baseline-resolving specs)

`test.skip|describe.skip|.fixme|test.fail(`: 0 in every file. `waitForTimeout`: 0 in every file. `project.name` gates: 0 in every file. `toHaveScreenshot`: 5, all in `empty-state-reachability.spec.ts`. `process.env.*` keys read: `TEST_AUTH_SECRET` only. Port literals: 127.0.0.1 port 3000 in `tests/e2e/sign-in-page.spec.ts:39` and `source-link-dimensional.spec.ts`. Date literals (`20YY-MM-DD`): `staged-preview.spec.ts:47` (`SHOW_DAYS`) and fixture timestamps in `needs-attention-page`, `roles-settings-layout`, `warning-panel-polish`, `dev-capture`, `published-show-attention`, `empty-state-reachability` (all fixed-timestamp seed data; none partitions against the wall clock).

## 4. Run 1 — all 16 baseline-resolving specs, one invocation

Harness: `pnpm heavy bash probe-inner.sh <scratch> <worktree>`, which inside the slot hold ran `pnpm db:seed` (rc 0, "Seeded 10 fixture shows") and then:

```
BASELINE_SERVER_ONLY=1 PLAYWRIGHT_JSON_OUTPUT_NAME=<scratch>/probe-report.json \
  pnpm exec playwright test tests/e2e/admin-parse-panel.spec.ts tests/e2e/admin-route-boundaries.spec.ts tests/e2e/staged-preview.spec.ts tests/e2e/admin-settings-admins-refresh.spec.ts tests/e2e/dev-capture.spec.ts tests/e2e/developer-tier.spec.ts tests/e2e/empty-state-reachability.spec.ts tests/e2e/needs-attention-page.spec.ts tests/e2e/no-raw-codes.spec.ts tests/e2e/onboarding-wizard-step1.spec.ts tests/e2e/published-show-attention.spec.ts tests/e2e/roles-settings-layout.spec.ts tests/e2e/sign-in-page.spec.ts tests/e2e/source-link-dimensional.spec.ts tests/e2e/telemetry-layout.spec.ts tests/e2e/warning-panel-polish.spec.ts \
  --project=mobile-safari --project=desktop-chromium --retries=0 --reporter=list,json
```

Exit code captured at the producer (probe.rc): **1**. Stamps (probe.inner.meta): `inner-start 2026-08-22T03:18:59Z head=ba5d3f80… dirty=0`, `inner-end 2026-08-22T03:25:58Z rc=1 head=ba5d3f80… dirty=0` (7 min wall including seed and the dev-server boot). Reporter stats: `{"duration":413917.9,"expected":86,"skipped":1,"unexpected":27,"flaky":0}`. Slot acquired after 1 min 40 s in the queue (probe.outer.log: `acquired slot-0`); port 3000 free before boot and released after.

Per (spec, project), passed-on-first-attempt / failed / skipped / timedOut, from probe-report.json via summarize.mjs (identity = one `results[]` entry with status `passed`, the oracle's rule):

```
admin-parse-panel.spec.ts|desktop-chromium          4/1/0/0
admin-parse-panel.spec.ts|mobile-safari             4/1/0/0
admin-route-boundaries.spec.ts|desktop-chromium     4/1/0/0
admin-settings-admins-refresh.spec.ts|desktop-chromium 0/0/0/1
dev-capture.spec.ts|desktop-chromium                3/1/0/0
developer-tier.spec.ts|desktop-chromium             7/0/0/0
empty-state-reachability.spec.ts|desktop-chromium   0/4/0/0
empty-state-reachability.spec.ts|mobile-safari      0/4/0/0
needs-attention-page.spec.ts|desktop-chromium       3/3/0/0
needs-attention-page.spec.ts|mobile-safari          3/3/0/0
no-raw-codes.spec.ts|mobile-safari                  9/1/0/0
onboarding-wizard-step1.spec.ts|mobile-safari       0/2/0/0
published-show-attention.spec.ts|desktop-chromium   5/1/0/0
roles-settings-layout.spec.ts|desktop-chromium      4/1/0/0
sign-in-page.spec.ts|desktop-chromium               11/1/0/0
sign-in-page.spec.ts|mobile-safari                  11/1/0/0
source-link-dimensional.spec.ts|desktop-chromium    5/0/0/0
staged-preview.spec.ts|desktop-chromium             8/0/0/0
telemetry-layout.spec.ts|desktop-chromium           3/0/0/0
warning-panel-polish.spec.ts|desktop-chromium       2/1/1/0
```

Per spec, passed-first-attempt / resolved: GREEN = `developer-tier` 7/7, `source-link-dimensional` 5/5, `staged-preview` 8/8, `telemetry-layout` 3/3. Every other spec RED on at least one identity.

### 4.1 Non-passing cases, with the reporter's first error lines (probe.failures.txt)

| # | Project | Spec:line | Title (abridged) | Error head |
| --- | --- | --- | --- | --- |
| 1, 13 | both | `tests/e2e/admin-parse-panel.spec.ts:137` | Discard try_again removes the staged row from DB | `expect(data?.length ?? 0).toBe(0)` received 1; page snapshot shows the `STALE_DISCARD_REJECTED` alert ("The staged parse you were viewing was replaced by a newer sync") |
| 2-5, 17-20 | both | lines 150, 166, 188 and 211 of `tests/e2e/empty-state-reachability.spec.ts` | all four categories | `toBeVisible` on `venue-tile` / `show-status-tile` / `tile-grid` / `stale-footer`: element(s) not found after `page.goto('/show/<slug>')` |
| 6-8, 21-23 | both | lines 184, 197 and 224 of `tests/e2e/needs-attention-page.spec.ts` | badge equals seeded count | `admin-attention-badge` expected "3" (then "2"), received "9+" |
| 9 | ms | `tests/e2e/no-raw-codes.spec.ts:91` | discovers static app routes | `expect(routePaths).toContain("/")` received `["/admin", "/admin/dev/telemetry", …]` |
| 10, 11 | ms | lines 32 and 81 of `tests/e2e/onboarding-wizard-step1.spec.ts` | first-visit wizard | `[data-testid=onboarding-wizard]` not found |
| 12, 26 | both | `tests/e2e/sign-in-page.spec.ts:116` | signed-in crew + `next=/show/<slug>` | expected pathname `/show/signin-…`, received `/me` |
| 14 | dc | `tests/e2e/admin-route-boundaries.spec.ts:132` | preview route inherits error boundary | helper threw `no crew member for show slug-e53e3669 (run pnpm db:seed). error=no row` |
| 15 | dc | `tests/e2e/admin-settings-admins-refresh.spec.ts:91` | revoke + add refresh the list | `Test timeout of 60000ms exceeded`; snapshot at timeout: `Administrators (1)`, `Revoked (15)`, add form present, new email absent |
| 16 | dc | `tests/e2e/dev-capture.spec.ts:198` | staged: Step3 modal sentinel | `wizard-step3-card-<dfid>-more` not visible (3 s × 10 attempts); helper telemetry each attempt: `settings={"pending_wizard_session_id":"c5fef1e1-…","watched_folder_id":"seed-fixture-folder"}`, body `FXAV|Setup|<email>|Sign out|Dashboard|` then empty |
| 24 | dc | `tests/e2e/published-show-attention.spec.ts:232` | resolve lifecycle (LAST, mutates) | pill expected "1 issue", received "2 issues" after clicking `per-show-alert-resolve-<overviewAlertId>` |
| 25 | dc | `tests/e2e/roles-settings-layout.spec.ts:244` | saved-confirm spans the row | width diff expected ≤1, received 697 (`role-mapping-saved-confirm` measured in its `sr-only` state, i.e. `savedConfirm` false) |
| 27 | dc | `tests/e2e/warning-panel-polish.spec.ts:267` | announcer speaks after Ignore | `warnings-panel-status` expected "Warning ignored.", received "" after 15 s |
| (skipped) | dc | `tests/e2e/warning-panel-polish.spec.ts:340` | reveal button | did not run (serial describe, prior failure) |

### 4.2 Shared-database residue at run time (explains rows 6-8, 21-23 and 14)

Read from the local stack immediately after run 1 (`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`):

```
$ select drive_file_id, wizard_session_id is null as counted, staged_id from public.pending_syncs order by 1;
drive-067b7555-…|t|…    drive-5f161e02-…|t|…    drive-6963da36-…|t|…    drive-9e105a86-…|t|…
$ select drive_file_id from public.pending_ingestions order by 1;
drive-067b7555-…   drive-5f161e02-…   drive-6963da36-…   drive-c9ebf602-…
$ select slug, drive_file_id, published, (select count(*) from crew_members c where c.show_id=s.id) from shows s where slug like 'slug-%' or slug like 'signin-%';
(20+ rows of slug-<8hex> shows with drive-<uuid> ids, several published, crew count 0)
```

None of these carry the `seed-fixture:` prefix `pnpm db:seed` manages or any e2e spec's own namespace; they are another suite's rows on the shared local database. Four counted `pending_syncs` plus four `pending_ingestions` plus the spec's own three seeded rows is 11, which the badge renders as "9+" (rows 6, 21). `admin-route-boundaries`'s helper selects the first `published AND NOT archived` show with no namespace filter and received one of the foreign `slug-*` shows, which has no crew (row 14). Neither condition exists on a CI runner, where the database is per-job and seeded once; both are fragilities in the specs' fixture selection that a local run exposes.

### 4.3 Run 1 was contaminated on every postgres.js path, and the contamination is named before run 2

Reading the discard route for row 1/13 found the mechanism: `app/api/admin/show/staged/[stagedId]/discard/route.ts:64` resolves the staged row through `defaultReadDriveFileIdForStagedId` (`app/api/admin/show/staged/[stagedId]/apply/route.ts:46`), a postgres.js query against `databaseUrl()`, and returns `404 STALE_DISCARD_REJECTED` when it finds no row. The app's `databaseUrl()` family resolves `TEST_DATABASE_URL ?? DATABASE_URL` in twelve modules:

```
$ rg -n 'TEST_DATABASE_URL' lib --glob '!**/*.test.*'
lib/reports/submit.ts:140 · lib/reports/rateLimit.ts:45 · lib/onboarding/rescanWizardSheet.ts:90 · lib/onboarding/sessionLifecycle.ts:95 · lib/db/advisoryLock.ts:24 · lib/drive/watch.ts:242 · lib/sync/syncLog.ts:9 · lib/audit/emailCanonicalization.ts:24 · lib/sync/lockedShowTx.ts:40 · lib/sync/unpublishConfirmPage.ts:71 · lib/notify/digest.ts:59 · lib/notify/deliver.ts:77
$ grep -E '^TEST_DATABASE_URL=' .env.local | sed -E 's#(postgres(ql)?://[^@]*@)([^/:]+).*#\1<...>@\3#'
TEST_DATABASE_URL=postgresql://postgres.vzakgrxqwcalbmagufjh:<...>@aws-1-us-east-2.pooler.supabase.com
```

So under `pnpm dev` with this machine's `.env.local`, every postgres.js path in run 1 read the REMOTE validation project while the specs seeded the LOCAL stack through `supabaseAdmin`. `pnpm preflight` had already printed the warning ("TEST_DATABASE_URL is NON-LOOPBACK … loopback-guarded DB tests will skip"); it was read as a unit-test note and not as a probe-env defect. Every run-1 red on a postgres.js path is therefore unmeasured, not red: rows 1/13 (discard → `lockedShowTx`) and 16 (wizard Step-3 → `sessionLifecycle`) for certain; rows 15, 24, 25, 27 are classified per route in section 5 after reading which client each route uses.

A second invocation had already been queued with the same environment. It was killed while QUEUED (python waiter pid 50651 and its `pnpm` parent 50555, both by PID after confirming their argv carried this session's scratch path; no `prio-wait-*` marker existed to clean; wrapper exit 143 recorded in p2-killed-contaminated-env/probe.outer.meta). It consumed queue position only.

## 5. Run 2 — seven specs, one invocation, both DSNs on the local stack

Same harness and files list as run 1 minus the settled specs, plus `needs-attention-page.spec.ts` to measure whether the DSN changed its discard flow. The only environment change is on the playwright invocation (inherited by the dev server it boots):

```
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  BASELINE_SERVER_ONLY=1 PLAYWRIGHT_JSON_OUTPUT_NAME=<scratch>/p2/probe-report.json \
  pnpm exec playwright test tests/e2e/admin-parse-panel.spec.ts tests/e2e/admin-settings-admins-refresh.spec.ts tests/e2e/dev-capture.spec.ts tests/e2e/published-show-attention.spec.ts tests/e2e/roles-settings-layout.spec.ts tests/e2e/warning-panel-polish.spec.ts tests/e2e/needs-attention-page.spec.ts \
  --project=mobile-safari --project=desktop-chromium --retries=0 --reporter=list,json
```

Pre-registered before the result landed: (a) `admin-parse-panel` and `dev-capture` go GREEN if the DSN split was their whole cause, and stay RED on the same case if it was not; (b) `needs-attention-page` keeps its three badge reds because its badge count comes from `supabase-js` over the LOCAL stack (`lib/admin/loadNeedsAttention.ts:139`) and the foreign rows are still there; (c) `roles-settings-layout` is DSN-independent (`app/admin/settings/_actions/roleTokenMappings.ts:22` uses the service-role supabase client), so a repeat red there is a real test or app defect and a green is a timing flake, either way not a DSN artefact; (d) the remaining three are classified by the route-client read recorded below. Non-reproduction is a branch in every row.

Exit code at the producer (p2/probe.rc): **1**. Stamps: `inner-start 2026-08-22T03:49:32Z head=ba5d3f80… dirty=0`, `inner-end 2026-08-22T03:52:26Z rc=1 head=ba5d3f80… dirty=0` (3 min wall). Reporter stats: `{"duration":170160.4,"expected":28,"skipped":5,"unexpected":9,"flaky":0}`. Seed rc 0. port 3000 free before boot; no `playwright test` / `next` process live at launch. Queue wait 13 min behind two live mutation runs.

Per (spec, project), passed-first-attempt / failed / skipped / timedOut:

```
admin-parse-panel.spec.ts|desktop-chromium          5/0/0/0
admin-parse-panel.spec.ts|mobile-safari             5/0/0/0
admin-settings-admins-refresh.spec.ts|desktop-chromium 0/0/0/1
dev-capture.spec.ts|desktop-chromium                4/0/0/0
needs-attention-page.spec.ts|desktop-chromium       3/3/0/0
needs-attention-page.spec.ts|mobile-safari          3/3/0/0
published-show-attention.spec.ts|desktop-chromium   6/0/0/0
roles-settings-layout.spec.ts|desktop-chromium      0/1/4/0
warning-panel-polish.spec.ts|desktop-chromium       2/1/1/0
```

Against the pre-registration:

- (a) CONFIRMED. `admin-parse-panel` 10/10 and `dev-capture` 4/4: both run-1 reds vanished with nothing but the DSN change. `published-show-attention` 6/6 likewise (its resolve route is postgres.js: `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:52`).
- (b) CONFIRMED. `needs-attention-page` red on the same three cases per project; the badge read "8"/"6"/"6" (mobile-safari) and "4"/"3"/"3" (desktop-chromium) against expected "3"/"2"/"2". The foreign pending rows moved between projects during the run (another session's suite on the shared stack), which is the class itself: the expectation assumes an otherwise-empty population.
- (c) NO DATA. `roles-settings-layout` failed in `beforeAll` at its fixture insert with `An invalid response was received from the upstream server` (the local Supabase gateway's transient 502, the class `BL-CHANGES-FEED-MODAL-BATCH-FLAKE` measured on CI), and its four cases were skipped. Run 2 says nothing about the run-1 red; run 1 (4/5, the one red measured the `sr-only` state) remains the only measurement.
- (d) `admin-settings-admins-refresh` timed out again at 60 s on the same case, DSN-independent (its actions use the supabase client, not postgres.js): reproduced 2 of 2. `warning-panel-polish` announcer red again with the local DSN, so the ignore route's postgres.js read was not the cause: reproduced 2 of 2; the reveal case was skipped again by the serial describe.

Non-passing error heads (p2/probe-summary.txt): needs-attention rows as above; `admin-settings-admins-refresh.spec.ts:91 timedOut`; `roles-settings-layout.spec.ts:119 failed :: fixture insert failed: An invalid response was received from the upstream server` then line 200, line 209, line 244, line 284 skipped; `tests/e2e/warning-panel-polish.spec.ts:267` expected "Warning ignored." received "" after 15 s, line 340 skipped.

## 6. Run 3 — the three unsettled specs, `--trace on`, both DSNs local

Same harness; files `admin-settings-admins-refresh`, `warning-panel-polish`, `roles-settings-layout`; the only change from run 2's command is `--trace on`. Exit 1; stamps `inner-start 2026-08-22T03:56:41Z … dirty=0`, `inner-end 2026-08-22T03:58:15Z rc=1 … dirty=0`; stats `{"duration":90480.3,"expected":6,"skipped":1,"unexpected":3,"flaky":0}`. Per spec: `admin-settings-admins-refresh` 0/1 (timedOut), `roles-settings-layout` 4/5 (line 244 red, width diff 697 again), `warning-panel-polish` 2/4 (line 267 red, line 340 skipped).

Traces were unzipped (`p3/trace-<case>/`) and read as data: `0-trace.network` for requests, `0-trace.trace` for the action timeline and per-action logs.

- **`admin-settings-admins-refresh`.** Network: POSTs to `/api/test-auth/set-session`, two bell-token refreshes, and exactly ONE server action (`POST /admin/settings`, next-action `609f1f0f…`, 200): the revoke. No second action POST. Timeline: the last action that completed was the `fill` on `admin-allowlist-email-input` (4 ms); the `click` on `admin-allowlist-add-button` never completed. Its log, repeating until the 60 s test timeout: "element is visible, enabled and stable / scrolling into view if needed / `<div data-testid="admin-settings-admins-card" …>` intercepts pointer events / retrying click action". The page snapshot carries `button "Add admin"` in the Administrators heading row, and `app/admin/settings/page.tsx:23` documents it: "Add admin" is a heading-row trigger that discloses the add form. The spec fills and clicks inside the undisclosed form; the inputs exist in the DOM (the a11y snapshot lists them), so `fill` succeeds, but the button's hit-test resolves to the card. Classification: test-only staleness; the UI gained a disclosure the spec predates.
- **`warning-panel-polish` (announcer).** Network: after the modal opened there is NO request to `/api/admin/show/<slug>/data-quality/ignore` at all (only set-session, bell-token and realtime subscriber-token POSTs). Timeline: the `click` on `[data-testid^="dq-ignore-"] >> nth=0` completed in 179 ms, then `toHaveText` on `warnings-panel-status` waited 15004 ms. `DataQualityWarningControls.tsx` wires `onClick={run}` directly to the button and `run()` issues the fetch first, so a completed click with no fetch means the click landed on a button whose React handler was not yet attached. `openShowReviewModal` (`tests/e2e/helpers/openShowReviewModal.ts`) awaits the modal's mount and carries no hydration gate; `tests/e2e/dev-capture.spec.ts:50` to `tests/e2e/dev-capture.spec.ts:62` defines the in-tree gate (`awaitModalHydrated`: loaded frame visible, exactly one modal, initial focus landed on `published-show-review-close`, the effect-flush signal). Classification: test-only, the pre-hydration click-swallow class the ci-dark design §6.1 records for the lifecycle transitions spec. The announce path itself was not exercised by any run, so nothing here asserts it works; the post-fix run is where that is measured.
- **`roles-settings-layout` (line 244).** Network: the save's server-action POST to `/admin/settings/roles` (next-action `60dd7454…`) is recorded with status -1, i.e. still in flight when the test ended. The measurement ran while the action was pending, which is exactly when `role-mapping-saved-confirm` is the `sr-only` placeholder (`RoleMappingRow.tsx:165` to `RoleMappingRow.tsx:174`), and `toBeVisible` accepts that box. Classification: test-only race; the wait must be on the confirmation text.

## 7. Dispositions (the spec's section 4 is the normative copy; this is the measured basis)

MEMBER on a green run: `developer-tier`, `source-link-dimensional`, `staged-preview`, `telemetry-layout` (run 1); `admin-parse-panel`, `dev-capture`, `published-show-attention` (run 2, after the DSN correction). MEMBER after a named test-only repair, to be confirmed green on the post-fix run: `no-raw-codes` (retired `/` route), `sign-in-page` (slug-only `next` rejected since the picker pivot), `admin-route-boundaries` and `admin-parse-panel`'s lookup (unscoped seed selection), `needs-attention-page` (badge literals over a shared population), `roles-settings-layout` (confirmation race), `admin-settings-admins-refresh` (undisclosed add form), `warning-panel-polish` (pre-hydration click). EXCLUDED: `onboarding-wizard-step1` (ratified). DEFERRED with a row: `empty-state-reachability` (retired route and pixel baselines). Out of batch by requirement class: the seven class-C paths.
