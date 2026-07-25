# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

**This file is the OPEN queue only.** Resolved / shipped / superseded entries live in **[BACKLOG-archive.md](./BACKLOG-archive.md)** with full provenance — grep by id, ids are unchanged. When an item below ships, move its whole entry there rather than annotating it resolved in place; otherwise this queue silently turns into a changelog.

Last reconciled: 2026-07-24 — 30 resolved entries graduated to the archive.

---

## BL-PHANTOM-GAP-PROBE-OTHER-SURFACES — run the zero-extent-flex-item probe on the crew page and dashboard harnesses

**Filed:** 2026-07-24 (branch `fix/overview-phantom-gap`). **Class:** layout hardening. **Effort:** S per harness.

`T-NOPHANTOM` (tests/e2e/published-review-modal.layout.spec.ts) walks the rendered tree for in-flow items with zero extent on their parent's gap axis — an always-rendered wrapper whose entire content is state-gated is invisible but still charges its parent's `gap`. It found two instances on its first run: the reported Overview `overview-sheet-sync` slot (32px) and `ScheduleDayRow`'s time grid (4px per entry-less day). Both are now fixed with `empty:hidden`.

The probe is scoped to the PUBLISHED MODAL tree only, so the crew page, the admin dashboard, and the wizard's own surfaces are unmeasured. A static sweep of `components/` + `app/` for the conditional-only-wrapper shape found no further true positives, but it cannot see the `{items.map(...)}` form — an empty array leaves no textual trace, and that is exactly the form the ScheduleDayRow instance took. So static coverage is not a substitute.

**Work:** extract the probe into a shared helper and mount it in the existing standalone crew-page and dashboard layout harnesses. Expect false positives to need the same `checkVisibility()` treatment per surface (on the modal, the `lg:hidden` chip rail alone produced 25).

## BL-CI-PARALLEL-DB-FALLBACK-AUDIT — re-run the closed-port protocol across the parallel project

**Status:** OPEN, raised by adversarial review of PR #517 (finding 2).

The `unit-suite-nodb` job proves that no parallel-project file FAILS without a database. That is weaker than "touches no database": a test that swallows a connection error, skips on unavailability, returns early from a setup hook, or takes an untaken conditional DB path will pass while exercising a FALLBACK rather than the DB-backed behavior it was written to check. The no-DB job repeats that same observation every PR, so it shares the blind spot — it is a regression detector, not a proof.

The stronger protocol already exists and was used for the original 2026-06-23 partition: point every Supabase endpoint at a CLOSED PORT rather than simply omitting the database. A refused connection surfaces swallowed-error paths that an absent server does not.

**Work:** re-run that closed-port protocol across all ~691 current parallel-project files, and compare per-file assertion COUNTS against a run with the database present. A file whose assertion count drops is silently degrading. Any found either move to serial or get an explicit note saying the fallback path is what is under test.

## BL-CI-RECLASSIFY-PARALLEL-STABILITY — revive the serial→parallel reclassification only with a concurrency-stability + clean-wall proof

**Filed:** 2026-07-20 (arc SHELVED). **Class:** CI perf. **Effort:** L (structural stability + multi-run measurement).

The DB-free serial→parallel reclassification (PR #528, closed unmerged) is correctness-verified but was shelved: moving ~527 files into the parallel project raises per-shard concurrency, and timing-sensitive moved files (e.g. `tests/admin/_metaInfraContract.test.ts`) starve past the 5s test timeout under CI load — candidate CI run 1 green, run 2 red on identical code. A required gate cannot flake, and the class is load-dependent (not fully enumerable up front). The wall-clock win was also unproven (~17s in contention-noisy samples, under the spec's 30s gate). Seventh lever this program has rejected on the local-passes-CI-fails pattern.

**Reusable asset:** the DB-touch probe + static `DB_BINDING_SIGNALS` matcher (branches `spike/db-touch-instrumentation`, `perf/ci-reclassify-db-free-serial`). Retrospective: `docs/superpowers/specs/ci/2026-07-20-serial-parallel-reclassification-retrospective.md`.

**Do NOT re-attempt the move without, in this order:** (1) solve criterion-3 at CI scale structurally — cap the parallel project's per-leg worker concurrency (`poolOptions.maxWorkers`) or raise the parallel `testTimeout` — and prove stability across ≥5 consecutive green CI runs; (2) demonstrate a clean ≥30s wall win with sequential, non-contending measurements (one CI run at a time). Absent both, the correctness tooling can stand alone (e.g. a nightly DB-drift audit) without the move.

**Status:** open (shelved).

## BL-HOVERHELP-VISUAL-VIEWPORT — position HoverHelp against the visual viewport under pinch-zoom

**Filed:** 2026-07-22 (hoverhelp-smart-position spec §9, deferred by design) · **Class:** UI robustness (mobile pinch-zoom) · **Effort:** S-M (`window.visualViewport` rect + resize/scroll listeners in the shell measure path)

`computePopoverPlacement` bounds body-host popovers by the LAYOUT viewport (`window.innerWidth/innerHeight`). Under pinch-zoom the visual viewport is a smaller, offset window onto the layout viewport, so an open popover can sit partially outside what the zoomed-in user can see. Ratified as out of scope for v1 (spec §1.1): admin surfaces are desktop-first, pinch-zoom on the crew page is transient, and the popover is dismissible/reopenable at the new zoom. Fix shape: use `window.visualViewport` (rect + `resize`/`scroll` events feeding the existing rAF coalescer) as the bounds rect when present.

**Status:** open.

---

## BL-CREW-WARN-STACK-E2E-GEOMETRY — real-browser width-fill assertion for the crew under-row warning stack

**Filed:** 2026-07-24 (retroactive — deferred in PR #534's body 2026-07-21, never filed) · **Class:** test coverage (real-browser layout) · **Effort:** S (one assertion in an existing spec)

PR #534 descoped its Task 10 (real-browser layout) with: "`CrewUnderRowStack`'s parent is not fixed-dimension, so the rule's trigger doesn't apply; width-fill is unit-asserted. Deferred `BL-CREW-WARN-STACK-E2E-GEOMETRY`." The id was cited in the PR body but no row was ever added to this file, DEFERRED.md, or the archive — found by a PR-body-vs-ledger reconciliation sweep on 2026-07-24.

**Mostly superseded.** PR #563 (crew-warning-attachment T5) landed real-browser geometry for this surface at `tests/e2e/published-review-modal.layout.spec.ts:1050+`: the under-row stack `[data-testid="crew-warn-stack-<key>"]` is measured inside the crew panel card's border box on all four edges, and between its member's row and the next. The residual gap is narrow: those are CONTAINMENT bounds, not the width-FILL equality the deferral named (`stack.width === row.width` within tolerance), which remains jsdom-only (`tests/admin/wizard/crewWarnStack.test.tsx`) where no layout is computed.

**Work:** add a width-fill equality assertion to the existing T5 describe block, reusing its harness page (`crewwarnings.html`) and `TOL`. No new harness or config needed.

**Status:** open (residual only).

## BL-MODAL-REALTIME-UPDATED-CUE — freshness cue near the published modal's action clusters

**Filed:** 2026-07-24 (retroactive — deferred in PR #505's body 2026-07-20, never filed) · **Class:** UI refinement · **Effort:** S

Impeccable P3 from `admin-modal-realtime-refresh`: an optional "updated just now" cue near the modal's action clusters, so a realtime-driven change is attributable rather than appearing as content silently shifting under the cursor. Deferred as a future refinement — the spec ratifies the silent-by-design posture, so nothing requires it.

**Un-defer signal (weak, hence backlog not DEFERRED.md):** a user reporting that modal content changed without explanation. Note the tension with the ratified posture — adding a cue is a spec decision, not a polish pass.

**Status:** open.

## BL-REALTIME-BROADCAST-FRAME-DROP-WATCH — ~9% local broadcast-frame loss on a healthy socket

**Filed:** 2026-07-24 (retroactive — recorded in PR #505's residuals 2026-07-20, never filed) · **Class:** observability watch item · **Effort:** S (read CI history) to M (if real)

PR #505 measured local realtime silently dropping ~9% of broadcast frames on an otherwise healthy socket; absorbed by CI runner retries and explicitly NOT a code defect of that diff. Filed as a watch item so the observation is not lost: if the drop rate is an artifact of the local stack it should disappear against validation/prod, and if it does not, subscriber code that assumes every broadcast arrives needs a reconcile-on-focus fallback.

**Work:** sample the realtime-dependent e2e/CI history for retry frequency before deciding whether there is anything to fix.

**Status:** open (watch).

## BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT — refresh known-holes fingerprints after parser autocorrect field (2026-07-22)

The `autocorrect` field populated at all 13 parser producers (`7295d794c`, merged via the
warning-card-identity-placement chain, PR #543-era) changes parse output for corpus fixtures whose
mutated cells produce autocorrect-bearing warnings, so the redacted parse-output fingerprints in
`tests/parser/mutation/knownHoles.ts` drift. Nightly run 29907734946 (2026-07-22): DRIFTED
fingerprint rows across 7 shards — SAME siteIds, fingerprint-only, zero NEW siteIds, zero fixed
holes — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER-ROLETOKEN-DRIFT
and BL-MUTATION-LEDGER-REFRESH-AMBIGUITY in `BACKLOG-archive.md` for the identical prior instances and
their resolution mechanics). The nightly `mutation-harness`
workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it gates no PR.
**Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run
--project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the
next mutation-file-touching PR or the next post-merge nightly triage.

## BL-TEST-PG-CLIENT-TEARDOWN — leak-proof postgres.js clients in DB tests

~55 test files (`tests/db/**`, `tests/notify/**`, `tests/sync/**`, `tests/onboarding/**`, `tests/agenda/**`, `tests/show/**`, `tests/app/admin/**`) create module-level `postgres(DB_URL, { max, prepare: false })` clients with **no `idle_timeout` and no `.end()`**. postgres.js default `idle_timeout` is 0 (never auto-close), so in the serial DB-test worker these pools hold their connections for the whole run and can exhaust local Postgres `max_connections` (~100) after a long session — surfacing as spurious "too many clients" failures on untouched code (the class `pnpm db:reset-pool` mitigates at runtime, added 2026-07-06).

Structural fix (scoped, TDD, needs local DB to verify — do NOT blind-sweep):

1. Shared factory `tests/db/testSql.ts` → `makeTestSql(opts)` returning `postgres(url, { max: 1, idle_timeout: 1, prepare: false, ...opts })`, registered in a module-level set; export `endAllTestSql()`.
2. Global per-file teardown: `afterAll(endAllTestSql)` (or the vitest global-teardown hook) so any factory client closes at end of each test file.
3. Migrate the ~55 files to the factory. **Exclude / hand-audit** the connection-hold tests — `*concurrency*`, `advisoryLock*`, deadlock/lock-topology tests — where an aggressive `idle_timeout` could drop a held connection mid-test and break lock semantics. Those keep an explicit long-lived client with a manual `.end()`.
4. Structural meta-test: fail if a `tests/**` file calls `postgres(` directly instead of `makeTestSql(` (allowlist the audited lock-hold exceptions).

Trigger to promote out of backlog: next time a full local suite exhausts the pool and `db:reset-pool` between runs stops being enough.

---

## BL-WATCH-RECONCILE-BACKOFF — dedicated reconcile cron + backoff state for watch channels

**Status:** OPEN · **Severity:** low (Approach A ships hourly reconcile; this is the richer variant) · **Surfaced:** watch-channel-health brainstorming (2026-07-01), user-ratified as backlog

Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1: a dedicated `fxav_cron_reconcile_watch` (`*/15`) plus a `drive_watch_reconcile_state` table (attempts, `next_attempt_at`, last error class) giving precise exponential backoff and faster recovery than the shipped hourly reconcile pass. Adopt if the hourly cadence proves too slow in practice (e.g., renewal failures near show start) or if escalation cadence needs sub-hour precision. Costs: new cron + migration + validation-parity surface + cronJobsParity/pg-cron registrations + more tests.

## BL-COPY-CRON-SWEEP-2 — de-jargon "cron" on the two non-catalog admin surfaces

**Status:** OPEN · **Severity:** low (copy quality; admin-facing) · **Surfaced:** BL-COPY-CRON-SWEEP execution (2026-07-03; entry in `BACKLOG-archive.md`)

The cron sweep of the catalog surfaced two more admin-facing "cron" mentions outside the §12.4 catalog, left out of the copy-lockstep PR because both are UI files (`app/**`, so touching them would drag the impeccable dual-gate into a pure-copy PR): `app/admin/settings/page.tsx:306` ("per-job cron run health for troubleshooting") and `app/help/admin/onboarding-wizard/page.mdx:117` ("points cron at the folder for ongoing sync"). Neither is a §12.4 code, so neither needs the three-way lockstep — but both should ship through the UI gate (Opus + impeccable) if picked up. Re-grep line numbers before executing.

---

## Picker-flow app bugs (3) — surfaced by the skipped picker-flow e2e (PR #60)

PR #60 landed the picker-flow e2e (`tests/e2e/picker-flow.spec.ts`) with three `test.skip` stubs whose SKIP comments each say the blocker is **app behavior, not a helper/config gap**. PR #60's summary claimed these were "filed as follow-ups in BACKLOG.md," but no entries existed — the bugs lived only as `// SKIP:` comments and are still live. These three entries make the tracking honest. Do NOT un-skip the tests until the paired app fix ships; enabling a stub without its fix just re-surfaces a known red. (Each SKIP comment records a direct repro.)

### BL-PICKER-BOOTSTRAP-HOST-FLIP — bootstrap redirect canonicalizes 127.0.0.1 → localhost and drops the auth cookie

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (blocks the authed picker-bootstrap leg; the host flip drops the host-scoped Supabase auth cookie) · **Class:** APP-BEHAVIOR BLOCKER

The authed leg redirects through `/api/auth/picker-bootstrap`, whose `NextResponse.redirect(new URL(nextOutcome.path, request.url), …)` (`app/api/auth/picker-bootstrap/route.ts:181,199`) canonicalizes the host `127.0.0.1` → `localhost` (`request.url` reports `localhost` even under `pnpm start -H 127.0.0.1`; `NEXT_PUBLIC_SITE_ORIGIN` does not influence it). That host flip drops the `127.0.0.1`-scoped Supabase auth cookie, so the revisit resolves to Mode A instead of `needs_picker_bootstrap` and the crew-shell never renders. Verified reproducing under both `pnpm dev` and `pnpm build && pnpm start`. **Fix:** emit a host-relative `Location` from the bootstrap redirect (app fix in `app/api/auth/picker-bootstrap/route.ts`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:77` ("first-contact gate -> tap 'Sign in with Google' -> OAuth happy path -> show body renders"; SKIP note at :68).

### BL-PICKER-GATE-SKIP-MISMATCH — "Continue as guest" can't reach the picker while an authed non-roster session persists

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (a cleared-but-present session can't reach the picker via guest-skip) · **Class:** APP-BEHAVIOR BLOCKER

"Continue as guest" (`clearIdentityAndSkip`, wired at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:96`) clears the stale picker entry, but the browser STILL carries the authed non-roster Google session, so the post-action resolve is `reason: 'google_mismatch'` (NOT `first_contact`); `page.tsx` honors `?gate=skip` only for `first_contact` (`app/show/[slug]/[shareToken]/page.tsx:25-28,77`), so the Mode B mismatch gate re-renders and `picker-interstitial-root` never mounts. Confirmed by direct repro: after the guest click the page stays on the Mode B gate (mismatch header still visible), not the picker. **Fix:** let the gate semantics reach the picker via `?gate=skip` when the session is present-but-cleared (app decision in `app/show/[slug]/[shareToken]/page.tsx` + `clearIdentityAndSkip`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:173` ("Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker"; SKIP note at :164).

### BL-PICKER-CLAIMED-ROW-NEXT-DROP — claimed-row recovery GET form discards the `next` query param

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (post-sign-in return target is lost on the claimed-row recovery path) · **Class:** APP-BEHAVIOR BLOCKER

The claimed-row recovery control is `<form action={signInRecoveryUrl} method="GET">` with NO hidden inputs (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:154`; `signInRecoveryUrl = /auth/sign-in?next=<encoded>` built at :86). On a GET submit the browser DISCARDS the action URL's query string and rebuilds it from the (empty) form fields, so the navigation lands on bare `/auth/sign-in` with no `?next=`. `waitForURL(/auth/sign-in\?next=/)` therefore never matches (final page is `/auth/sign-in` with no `next`). **Fix:** carry `next` as a hidden `<input>` rather than in the action query (app fix in `_PickerInterstitial.tsx`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:234` ("Deactivated row: tapping a claimed crew member redirects through /auth/sign-in"; SKIP note at :226).

---

## BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE — auto-resolve GITHUB_BOT_LOGIN_MISSING on successful bot auth

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: GITHUB_BOT_LOGIN_MISSING / DEFER)

The `GITHUB_BOT_LOGIN_MISSING` alert tracks that the bot login env is unset (`lib/reports/submit.ts:778`). This is config state observable inside the M8 report pipeline, but the review discipline for report features requires live GitHub integration probes. Auto-resolution deferred pending M8 shipping and validation-environment gates. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 line 94.

## BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE — auto-resolve branch-protection alerts on policy sync

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: BRANCH_PROTECTION_DRIFT / BRANCH_PROTECTION_MONITOR_AUTH_FAILED / DEFER)

`BRANCH_PROTECTION_DRIFT` and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` track state of the GitHub branch-protection CI monitor (`scripts/verify-branch-protection.ts`). Both are raised outside app runtime (CI-side ops script), making auto-resolution a separate ops-pipeline concern orthogonal to the app's admin-alert infrastructure. Deferred to a future branch-protection monitoring redesign. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 lines 95–96.

## BL-ALERT-REPORT-FAMILY-AUTORESOLVE — evaluate manual-by-design posture for report-family incidents

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: REPORT\_\* codes / EVENT)

The six report-family codes (`REPORT_ORPHANED_LOST_LEASE`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT`) are all incident notices and observational audit records (external GitHub state changes, impossible-state alarms). They're event-shaped by design and cannot auto-resolve on condition recovery because there is no recoverable condition — a manual acknowledgment is the correct workflow. Revisit post-M8 if new incident classes emerge that blur the event/state boundary. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 lines 88–93.

## BL-ALERT-TILE-RENDER-PER-TILE-KEYING — per-tile keyed auto-resolution for TILE_SERVER_RENDER_FAILED

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: TILE_SERVER_RENDER_FAILED / EVENT\*)

`TILE_SERVER_RENDER_FAILED` is state-shaped (a tile's render threw) but has no aggregation point: tiles stream independently per-request, and the alert row is deduped per (show, code) with `context.tileId` replaced on re-raise. Tile A's successful render cannot prove tile B is healthy; auto-resolving on any tile success masks ongoing failures. A per-tile-keyed redesign (persist `tileId` in the alert row, auto-resolve on that tile's next success) closes this structurally but requires schema change. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 line 76.

---

## BL-KNOWN-SECTIONS-WALKER — real auto-drift enforcement for the known-section-header registry

**Status:** OPEN · **Severity:** low (defense-in-depth; today's guard is a hand-maintained pin) · **Class:** TEST-ENFORCEMENT GAP

`tests/parser/_metaKnownSectionsRegistry.test.ts` is documented as a drift guard that keeps `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts`) from falling behind the block parsers, but it only asserts a **hardcoded** `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. Both lists are hand-maintained, so a new block parser whose header is registered in NEITHER list passes CI green and its rows would false-positive `UNKNOWN_SECTION_HEADER`. The docstrings in both files were corrected (audit idx87) to describe the real, narrower guarantee (catches an accidental DELETION of a registered header; does NOT detect a genuinely-new unregistered header).

**Why not fixed now:** a robust, low-false-positive walker over `lib/parser/blocks/*.ts` is not cheaply achievable without a parser refactor. Header detection is heterogeneous — plain uppercase literals (`col0Upper === "VENUE"`), lowercase literals (`label === "hotel stays"`), and **regexes** whose matched header is computed, not a literal (`event.ts` `EVENT_DETAILS_HEADER_RE`, `hotels.ts` `/^HOTEL\s+RESERVATIONS?$/`, `rooms.ts` `gsFieldRe`) — and only `dress.ts`/`client.ts` import from `knownSections.ts`. The block-parser sources are also dense with intentional non-header uppercase literals ("NAME", "PHONE", "LED", "TRAVEL", "FRIDAY", "II", "N/A", warning codes), so a naive "every uppercase literal must be registered" walker would need a large hand-maintained exclusion list — the same drift-prone artifact this would replace.

**Fix (when prioritized):** route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const the parsers match against), then have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`. Add a proof test that an unregistered header fails. This closes the class structurally instead of by hand-maintained parallel lists.

---

## Secondary-name Drive-ID columns — deferred from the drive_file_id nonblank CHECK (2026-07-02)

The empty/whitespace `drive_file_id` DB-CHECK work (migration `20260702120200_drive_file_id_nonblank.sql`; spec `docs/superpowers/specs/data-quality/2026-07-02-empty-drive-file-id-check-design.md` §9) deliberately scoped itself to **every column named exactly `drive_file_id`** (14 public + 5 dev mirror). The two columns below are Drive-ID-bearing but carry a _secondary_ name and are **not reachable-empty**, so they were documented out of scope rather than silently dropped. The scope rule stays crisp ("every column named exactly `drive_file_id`").

### BL-OPENING-REEL-DRIVE-ID-NONBLANK — nonblank CHECK on `shows.opening_reel_drive_file_id`

**Status:** OPEN · **Severity:** low (not reachable-empty) · **Class:** DEFENSE-IN-DEPTH

`shows.opening_reel_drive_file_id` (`supabase/migrations/20260501000000_initial_public_schema.sql:16`, nullable) has no nonblank CHECK. Its write source `extractOpeningReel()` returns non-empty-or-null, and any read of it flows through the JS read-path guard (`assertNonEmptyDriveFileId`), so it is not reachable-empty from untrusted input. **Fix (when prioritized):** add `check (opening_reel_drive_file_id is null or opening_reel_drive_file_id ~ '[^[:space:]]')` (+ dev mirror) following the same idempotent DROP-IF-EXISTS/ADD shape as the primary migration. Ref spec §9.

### BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK — nonblank CHECK on `wizard_finalize_checkpoints.last_processed_drive_file_id`

**Status:** OPEN · **Severity:** low (cursor copy of an already-CHECK'd id) · **Class:** DEFENSE-IN-DEPTH

`wizard_finalize_checkpoints.last_processed_drive_file_id` (`supabase/migrations/20260501001000_internal_and_admin.sql:423`, nullable) is a cursor copy of a `drive_file_id` that is itself already covered by the primary nonblank CHECK, so a blank cannot originate here. **Fix (when prioritized):** add the nullable-form nonblank CHECK (+ dev mirror if the column is cloned) for defense-in-depth. Ref spec §9.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

### BL-SCAN-SSE-BODY-NULL-CODE — onboarding scan SSE result body emits a user-facing `code:null`

**Status:** OPEN · **Severity:** low · **Class:** USER-FACING SURFACE

`app/api/admin/onboarding/scan/route.ts` emits `{ type: "result", body: { ok: false, code: null } }` to the client on catch (adjacent to the now-forensic-coded `ONBOARDING_SCAN_FAILED` log). The `code:null` is a distinct client-facing surface — arguably warrants a real §12.4 code so the client can catalog-look-up, but that is an expensive 3-way §12.4 change out of scope for the forensic batch. **Fix (when prioritized):** assign a cataloged code + regen `gen:spec-codes` + add the `catalog.ts` row.

### BL-PICKER-TAMPER-ADMIN-ALERT — selectIdentity tamper breadcrumb could also raise an `admin_alerts` upsert

**Status:** OPEN · **Severity:** low · **Class:** ALERTING GAP

`lib/auth/picker/selectIdentity.ts` logs a `PICKER_IDENTITY_CLAIMED_TAMPER` forensic warn on a hand-crafted claimed-row bypass, but does not raise an `admin_alerts` upsert. The forensic batch is code-stamping only; whether this security/tamper breadcrumb should also surface as an operator-visible admin alert is a separate alerting decision. **Fix (when prioritized):** design the alert severity/dedupe + add the `admin_alerts.upsert` under the per-show lock.

### BL-AGENDA-PERDAY-VIEWER-FILTER — Schedule agenda area is whole-show / not day-filtered for restricted crew

**Status:** OPEN · **Severity:** low · **Class:** VISIBILITY SCOPE

The Schedule section's Agenda area (`components/crew/sections/ScheduleSection.tsx:117-152`) renders `AgendaEmbed` + per-link `AgendaScheduleBlock` from `link.extracted` as a **whole-show** artifact: `AgendaScheduleBlock` receives no date/stage restriction and shows the full-show agenda to **every** viewer (the only branch that suppresses it is the `unknown_asterisk` early-return, `:157-168`). So date-restricted AND (post-#248) stage-restricted crew see the full-show agenda above their filtered day cards. This is pre-existing behavior, not introduced by #248 (spec §3.5) — a stage-restricted crew (e.g. Calvin, on-site to strike) legitimately benefits from the agenda, so it was scoped out. **Fix (when prioritized):** thread the effective visible-day set into `AgendaScheduleBlock` and filter its per-day rows to the viewer's worked days (affects all date-restricted crew, so decide the product posture first — whole-show vs per-viewer agenda).

### BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — quiet-link affordance family: small tap target + no SR new-tab announcement

**Status:** OPEN · **Severity:** low · **Class:** A11Y / RESPONSIVE

The shared quiet-link affordance (`components/admin/PerShowActionableWarnings.tsx:98` precedent, copied by the per-show alert action link in `components/admin/PerShowAlertSection.tsx`) is a `text-xs` underline anchor without `min-h-tap-min`, below the comfortable venue-floor thumb-target bar, and its external variant marks the `↗` as `aria-hidden` with no visually-hidden "(opens in new tab)" so screen readers do not hear the new-tab behavior. Surfaced by the 2026-07-04 alert-action-links impeccable dual-gate (handoff §12). **Fix (when prioritized):** family-wide — add a min-height tap padding treatment and a `sr-only` new-tab suffix to the shared affordance on BOTH surfaces in one pass, not per-call-site divergence.

### BL-ALERT-ACTION-LINKS-E2E — real-browser e2e pass over all 9 alert action links

**Status:** OPEN · **Severity:** low · **Class:** TEST COVERAGE

PR #287 shipped the per-code action-link registry (`lib/adminAlerts/alertActions.ts`, 9 codes) with unit + jsdom-render + structural-meta coverage, but no real-browser e2e: nobody has clicked the links in a live app. Coverage gap: fragment-scroll behavior of the `#share-access` internal links on the deployed show page, real seeded alert rows carrying each code's context shape (incl. absent-field variants rendering NO link), the banner global-vs-per-show split on a live `/admin`, and external hrefs (`docs.google.com` / `drive.google.com` / `github.com`) asserted verbatim without navigating off-app. **Fix (when prioritized):** a Playwright spec (harness precedent: `tests/e2e/`) that seeds one alert row per registered code (`SHOW_FIRST_PUBLISHED`, `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, `ROLE_FLAGS_NOTICE`, `LIVE_ROW_CONFLICT`, `WIZARD_SESSION_SUPERSEDED_RACE`, `REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) plus per-code negative rows (context field absent → no anchor), renders `/admin` and `/admin/show/[slug]`, clicks each internal link asserting the landed section, and asserts external anchors' exact href/target/rel without following them. Pair with a one-time validation-deployment smoke click-through.

### BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC — WATCH_CHANNEL_ORPHANED renders a raw provider error string in the admin banner

**Status:** OPEN · **Severity:** low · **Class:** INVARIANT-5 / UI COPY

The `WATCH_CHANNEL_ORPHANED` expanded panel renders `context.error_message` verbatim inside a `<code>` block (`components/admin/AlertBanner.tsx:239-240,423-429`) — a free-form provider/infra error string (e.g. a Google Drive API failure message), not cataloged copy. This predates the 2026-07-04 at-a-glance-identity work and is a deliberate infra-diagnostic affordance for an infra-only, Eric-facing alert (the copy escalates to support). Surfaced during that spec's Codex adversarial review (R9 F17) as a tension with invariant 5 (no raw error codes/diagnostics in user-visible UI). Deliberately left out of scope there — the identity-line work was proven to add no new diagnostic exposure. **Fix (when prioritized):** decide whether the watch detail should be mapped to a cataloged/sanitized status class (e.g. a small enum of "config error / transient / auth revoked") rather than the raw provider string, and if so route it through `lib/messages/lookup.ts`; keep a debug-only affordance for the raw text behind the developer tier if Eric still needs it.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-STEP3-IMPECCABLE-LIVE-RENDER — live-render impeccable pass on the Step-3 Variant-B page

**Status:** OPEN · **Severity:** low · **Class:** UI EVALUATION

The Step-3 "Review & publish" Variant-B redesign (spec/plan `2026-07-04-step3-review-page-variant-b`) shipped its UI quality gate (invariant 8) via a real-browser static-harness (DI-1…DI-4, bite-verified), a manual DESIGN.md/PRODUCT.md/mock conformance review (close-out §12), and the whole-diff Codex cross-model review as external attestation. What it could NOT do: a `/impeccable critique` + `/impeccable audit` pass on the LIVE rendered page — this repo has no live-app Step-3 seed (every Step-3 layout spec is a standalone static harness). **Fix (when prioritized):** stand up a minimal admin Step-3 seed (a reserved wizard session + a manifest with ≥1 clean, ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row), then run the impeccable v3 dual-gate against the live `/admin?step=3` render — including an explicit dark-mode warn-contrast check and the double-"Review" affordance on demoted RESCAN cards (close-out §12 finding 7).

---

## Test-safety hardening (2026-07-05)

### BL-DBTEST-LOOPBACK-EVAL-GUARD — retrofit module-eval loopback guard onto pre-existing db tests

**Status:** OPEN · **Severity:** low · **Class:** TEST SAFETY

The finalize-resume-deadlock whole-diff R1 review surfaced (and fixed, for the 3 suites in that diff) a latent pattern shared by ~20 pre-existing `tests/onboarding/*.db.test.ts` files: `LOCAL_URL = process.env.LOCAL_TEST_DATABASE_URL ?? <loopback default>` is consumed by a probe `beforeAll` that opens `postgres(LOCAL_URL)` and sets `dbUp = true` BEFORE the loopback assertion (`expect(LOCAL_URL).toMatch(/127…/)`) runs in a later `beforeAll`. If `LOCAL_TEST_DATABASE_URL` is mispointed to a remote host (`TEST_DATABASE_URL` is the validation project), the probe connects remote and `dbUp` flips true; even when the later assertion throws, `afterAll`'s `if (dbUp)` teardown still issues DELETE/UPDATE against the remote. The default is loopback so this only bites on an explicit remote override, hence low severity. **Fix (when prioritized):** wrap each file's `LOCAL_URL` in `assertLocalDbUrl(...)` from `tests/db/_remediationHelpers.ts` (synchronous module-eval throw on non-loopback host, before any handle) — the proven pattern in `cleanupReapCrossSession.db.test.ts` + 7 others and now the 3 finalize-resume-deadlock suites. Consider a structural meta-test that fails any `*.db.test.ts` opening `postgres(...)` on a URL not passed through `assertLocalDbUrl`.

### BL-RESCAN-PREPARE-ERROR-GRANULARITY — distinguish parse vs Drive-fetch failure in re-scan fail-closed paths

**Status:** OPEN · **Severity:** low · **Class:** TELEMETRY GRANULARITY

Both re-scan fail-closed catch sites — the finalize inline auto-heal (`app/api/admin/onboarding/finalize/route.ts`, the `prepareOnboardingFiles` try/catch) and the standalone `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:127`) — map ANY `prepareOnboardingFiles` throw to `DRIVE_FETCH_FAILED`. Because `prepareOnboardingFiles` does export AND parse, a parser/schema failure or malformed-workbook fault is reported to Doug as a Drive fetch failure, and telemetry loses the export-vs-parse distinction. The recovery path is identical (both demote fail-closed to the re-apply page), so this is a wrong-reason/observability issue, not a correctness bug — surfaced by whole-diff R5. **Fix (when prioritized):** have `prepareOnboardingFiles` throw a discriminated error (e.g. `{ kind: 'drive_fetch' | 'parse' }`) and map each to a distinct §12.4 code at BOTH call sites (new code needs the full 3-way lockstep + CI touchpoints). Deferred to keep the two sites consistent and avoid a new catalog code mid-feature.

### BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS — deletion-safety Link guard misses helper-built hrefs

**Status:** OPEN · **Severity:** low · **Class:** TEST COVERAGE

The Step-3 consolidation deletion-safety guard (`tests/admin/step3DeletionSafety.test.ts`, the "no in-app `<Link href>` out to the retired staged page" test) matches only a literal `/admin/onboarding/staged/` substring on the SAME source line as `href`. A helper-built href (`href={buildStagedUrl(id)}` where the path lives in a const or is assembled elsewhere) could reintroduce a link to the retired staged page without tripping the guard — surfaced by whole-diff R5 (LOW). A blanket "path appears anywhere" scan is NOT a clean fix: the path is LEGITIMATELY referenced by the finalize race-row `re_apply_url` builder and the `next.config.ts` 307 redirect source (both ratified in spec §4.6 — they now 307 to /admin), so a stricter guard false-positives on those. **Fix (when prioritized):** a JSX-aware check that resolves `<Link>`/`<a>` href expressions (including one-hop helper returns) to a URL and asserts none resolve under `/admin/onboarding/staged/`, while allow-listing the ratified non-Link string references. Low value + false-positive risk mid-feature, so deferred; the literal same-line guard plus the retired-import guard already cover the common regressions.

### BL-ROOM-DIMS-ONLY-NOVEL-HEADER — parse a dims-only novel breakout header (no DAY-range)

**Status:** OPEN · **Severity:** low · **Class:** PARSER COVERAGE

The parser-anchor-de-literalization PR (spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md`, audit finding #6) de-literalizes the v1 breakout-room loop from the two literal names `MABEL`/`LAUDERDALE` to any `NAME + trailing DAY-range` header, so a future differently-named DAY-range breakout (`GRAND BALLROOM DAY 1 & 2`) now parses. A dims-ONLY header with NO DAY-range (`SALON ABCD&#10;60' x 45'`, `MERIDIAN HALL&#10;50' x 30'`) is deliberately **out of scope** (spec §2 "Descoped", adversarial-review R31 f1): it is structurally identical to a dims-bearing ASSET/equipment row (`PROJECTION SCREEN&#10;5' x 9'`, `4' X 8' RISER`), so a name-blind admit gate cannot tell a novel dims-only room from an asset — 14 adversarial rounds confirmed every dims-based admit/evidence/ownership gate reopened asset fabrication or field theft. origin/main never parsed this shape, so it is NOT a regression, and a blanket data-gap signal is rejected (it would fire on every gear row = noise). **Fix (when prioritized):** parse a dims-only room only under a POSITIVE room-context signal the sheets actually carry — a `BREAKOUT`/room-section header above the row, or an explicit room label — NOT a dims token. Add fixtures with a real dims-only room inside a room section and assert it parses without any asset row (dims-bearing gear elsewhere on the sheet) becoming a room.

**Update (2026-07-06, spec `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md`):** partially addressed by the BO-venue-header anchor — a dims-only header sitting above a **`BO` field block** now parses, anchored on the field block (not the dims token), so no asset is fabricated. The remaining unaddressed sub-case is a dims-only header with **no** field block of any kind (a bare `NAME&#10;dims` cell), which stays out of scope (indistinguishable from an asset without an anchor).

---

### BL-MUTATION-HARNESS-OPEN-HOLES — parser silent-fragility classes pinned by the mutation harness

**Status:** OPEN (2026-07-06, feat/mutation-harness) · **Severity:** medium · **Class:** PARSER ROBUSTNESS

The rec-5 mutation-testing harness (`tests/parser/mutationHarness.test.ts`, nightly workflow) pins **7,885 day-1 silent holes** — mutants whose parse changed with no compensating signal (`SILENT_WRONG` / `SILENT_SIGNAL_LOSS`), recorded in `tests/parser/mutation/knownHoles.ts`. Each hole's `finding` field maps its operator class to the audit finding it exercises (`OPERATOR_FINDING_MAP`), so a ledger failure is triageable by operator. Documented-finding classes: **`header-typo` → audit #5** (short-header typo intolerance, `sectionHeaderNormalize.ts:16,66`); **`blank-row:inject` / `blank-row:remove` → audit #10** (blank-row block segmentation, `exportSheetToMarkdown.ts:104`). The remaining operator classes are silent-fragility surfaces the audit did not enumerate as a numbered finding; each is tracked as a backlog sub-item below and its holes shrink when that class is hardened:

- **`BL-MUTATION-REF-SUB`** — a body cell rewritten to the literal `#REF!` (a real broken-reference export artifact, present in 3/7 live shows) is absorbed into the parse with no signal. Value-corruption class.
- **`BL-MUTATION-UNICODE`** — a zero-width non-joiner (U+200C) injected into a cell value is silently retained (the fintech live ZWNJ shape). Invisible-character class.
- **`BL-MUTATION-COLUMN-SHIFT`** — a spurious leading empty column shifts a section's row grid with no signal (the East Coast column-shifted outlier). Layout-shift class.
- **`BL-MUTATION-MERGED-CELL`** — deleting one interior pipe (how a merged cell exports) fuses two adjacent cells silently. Cell-fusion class.
- **`BL-MUTATION-SECTION-ORDER`** — reordering two adjacent top-level blocks silently reorders the parser's output arrays (the parser preserves source order). **Order-sensitivity discovered by the harness on 2026-07-06** (58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS` across the corpus); section-reorder was reclassified cosmetic → corrupting as a result.

**Ratchet:** the ledger is a shrink-only baseline. When a downstream fix hardens one of these classes, the corresponding holes become `staleRows` and the nightly harness fails until they are removed from `knownHoles.ts` — turning each parser-robustness fix into a measurable ledger reduction. Do NOT grow the ledger silently; a NEW hole (regression) fails the harness as `newAlarms`.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN (2026-07-15; audit finding #10, 2026-07-04) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — id-based transport visibility + no-match admin warning (deferred from Flow 8.4 to 8.3)

**Status:** PARTIALLY CLOSED (2026-07-09, Flow 8.4 PR #374) · **Severity:** medium · **Class:** CREW VISIBILITY / ENRICH

**Partial closure (Flow 8.4, PR #374 — `docs/superpowers/specs/2026-07-09-flow8.4-transport-assignee-warning.md`):** the **enrich-time no-match admin warning** shipped. `lib/sync/enrichTransportAssignees.ts` emits one admin-only aggregate data-gap warning (`TRAVEL_TRANSPORT_NAME_UNMATCHED`, `gateExempt: true`) when a transport driver/assignee name references a crew member who would not see their own tile — turning silent invisibility into a staged-review data-quality signal. **Still deferred to 8.3:** id-persistence + id-based visibility matching (a crew `id` does not exist at enrich time — the uuid is DB-assigned at APPLY via `gen_random_uuid()`, `initial_public_schema.sql:32` — so resolve-to-id-and-persist is architecturally infeasible in the enrich pass; 8.3 must move it to an apply-time step). The regression pins below also remain for 8.3, which changes the `transportTileVisible` predicate.

The Flow-8 audit item 8.4 (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §Flow 8) asks that a transport name mis-parse cannot hide a driver's own itinerary. `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) matches assigned crew by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`), which closes the common variance (nickname / legal-name / case / trim / prefix) but NOT a **hard** mis-parse (a merged-cell overflow that shifts the surname token, e.g. a driver stored as `"Doug Larson Loadout"` — the adjacent column fused onto the name — vs roster `"Doug Larson"`; verified `namesRefer` returns false because the multi-token rule compares last tokens `"loadout"`≠`"larson"`). In that case the driver silently does not see their own ground-transport block. Flow 8.4 (PR #374, see Partial closure above) now emits an **admin-visible no-match warning** for this case, so it is no longer _silent_ — but the driver still does not see their tile until the operator fixes the name, because id-based visibility matching remains deferred to 8.3.

**Deferred defensive regression pins (moved out of `flow8-self-serve-trio` at plan-review Round-11; land red-first in 8.3):** pin `transportTileVisible`'s _current_ fuzzy tolerance against name-parse-variance regression — driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix); `"Douglas Larson"` vs `"Doug Larson"` → visible (surname); assigned-names `["Bill Werner"]` vs `"William Werner"` → visible; case/trim `"  doug larson "` → visible; negative controls (`"Jane Smith"` → not visible, empty/`null` → not visible, admin → visible when transportation exists); and the **known-gap fixture** driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (verified live: multi-token rule compares last tokens `"loadout"`≠`"larson"`, `nameMatch.ts:50-53`). These were removed from the milestone because a green-only regression-pin task conflicts with plan-wide invariant 1 (non-negotiable red-first per task); they belong red-first in 8.3, which changes this exact predicate.

**Fix (deferred to the 8.3 venue-timezone / enrich spec, same enrich domain + admin-warning machinery):** at enrich time, resolve free-text `driver_name` / `assigned_names` → `crew_member` ids against the show roster, persist the resolved id set on the transportation legs / driver, match viewer visibility by id (robust to any later render-time name garble), and emit an admin-visible alert when an assigned name resolves to **no** roster member (turns silent invisibility into a data-quality signal — parallels 8.3's ET-default admin warning). Add fixtures with a hard-mis-parsed driver name and assert the driver's own transport becomes visible via id resolution AND that the no-match name raises the admin warning. Interim crew recourse until this lands: the Flow-8.1 picker "Don't see your name?" affordance.

---

## Parser ambiguity-warning coverage (2026-07-07, ambiguity-warnings-v1)

Transform sites the transform-sites walker (`tests/parser/_metaTransformSitesWalker.test.ts`, spec `2026-07-07-ambiguity-warnings-v1-design.md` §6) declares as `exempt: "deferred:BL-..."` — value-producing judgment sites that do NOT yet emit an `AMBIGUITY_CODES` warning. Each is a concrete deferral (the walker fails if the ref is missing here), not a silent gap.

### BL-PARSER-HOTEL-INLINE-AMBIGUITY — emit an ambiguity warning for inline (unstructured) hotel-guest paths

**Status:** OPEN (2026-07-07, ambiguity-warnings-v1) · **Severity:** low · **Class:** PARSER AMBIGUITY COVERAGE

`hotels.ts` emits `HOTEL_GUEST_SPLIT_AMBIGUOUS` only from the **structured** `parseGuestCell` path (spec §4.2). The **inline** guest-extraction paths (guest names glued into an unstructured hotel/reservation line, not the pipe-structured guest cell) make the same class of split judgment but do not yet surface a warning. Deferred: the inline paths are lower-frequency in the live corpus and share no collector with `parseGuestCell`, so wiring them is a separate emit unit + fixture effort. Declared as `{ site: "inline guest paths", exempt: "deferred:BL-PARSER-HOTEL-INLINE-AMBIGUITY" }` in `hotels.ts` `TRANSFORM_SITES`. Trigger to promote: a live show where an inline guest line is mis-split with no operator signal.

### BL-PARSER-ADDRESS-SPLIT-AMBIGUITY — emit an ambiguity warning for `splitHotelNameAddress` name/address splits

**Status:** OPEN (2026-07-07, ambiguity-warnings-v1) · **Severity:** low · **Class:** PARSER AMBIGUITY COVERAGE

`splitHotelNameAddress` (`hotels.ts:329`) splits a combined `<hotel name> <street address>` string into a name and an address by a suffix-only heuristic — a genuine judgment call that produces a value but emits no ambiguity warning when the boundary is uncertain. Deferred: the current heuristic is strictly suffix-anchored and low-risk; adding an ambiguity signal needs a defined uncertainty threshold + its own emit unit test to avoid warn-spam on the common unambiguous case. Declared as `{ site: "splitHotelNameAddress", exempt: "deferred:BL-PARSER-ADDRESS-SPLIT-AMBIGUITY" }` in `hotels.ts` `TRANSFORM_SITES`. Trigger to promote: a live show where a name/address split lands wrong with no operator signal.

---

## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)

### BL-CREWPAGE-ROTATE-URL-FLASH — one-shot highlight on the crew URL when it updates after a rotate

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** UI POLISH

The instant-rotate rework updates the crew URL on every surface (header ShareChip, ShareLinkBody card, CrewPageLink) the moment a rotate resolves, and the confirmation-only banner says "The updated link is shown above." The swap itself is silent — the token is an opaque random string, so an admin watching the banner may not register that the URL above just changed. Deferred (impeccable critique P2): a brief reduced-motion-safe highlight/flash on `admin-current-share-link-url` (and the chip) keyed on the epoch advance would draw the eye, but it introduces a new transient visual state that needs its own transition-inventory + reduced-motion handling + test, and the banner copy already directs attention upward. Trigger to promote: admin feedback that a rotate's new URL is easy to miss.

### BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE — replace `max-w-[16rem]` magic + confirm tap-target width on crew-link chrome

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** UI TOKEN DISCIPLINE

`ShareChip.tsx` uses an arbitrary `max-w-[16rem]` (pre-existing, mirrored from the prior inline chip) rather than a named width token, and `CrewPageLink.tsx` sets `min-h-tap-min` but no `min-w` (text width clears 44px in practice but is not guaranteed). Both are pre-existing patterns carried forward verbatim by the component-extraction refactor, not regressions. Deferred: token-izing the width + adding an explicit min-width is cosmetic and app-wide (the same magic appears elsewhere); batch it with a DESIGN token pass. Trigger to promote: a DESIGN.md token-discipline sweep.

### BL-CREWPAGE-ROTATE-FOCUS-MGMT — restore keyboard focus across the two-tap rotate state edges

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** A11Y

The `RotateShareTokenButton` two-tap state machine (idle → confirm → resolving → idle) unmounts the focused button on each edge, so a keyboard user's focus drops to `<body>` after tapping Rotate and again after the action resolves. Pre-existing (the state machine + 3s auto-revert predate the instant-rotate dedup; this diff only changed the success-banner content), and impeccable-audit-rated P2 (not a WCAG-A blocker — the controls remain reachable by re-tabbing). Deferred: a correct fix moves focus to the Confirm button on entering confirm and to the idle Rotate button (or the banner) on resolve via a ref/effect, plus `waitFor`-based focus assertions (async activeElement). Out of scope for a dedup/instant-update refactor. Trigger to promote: an a11y pass on the admin per-show action rows.

---

## Destructive-confirm family (2026-07-16/17, destructive-confirm-pass + destruct1-armed-reflow)

### BL-DESTRUCT-STACK-THUMB-ORDER — reconsider destructive-vs-safe order when the pending discard buttons stack

**Status:** OPEN (2026-07-17, destruct1-armed-reflow impeccable critique P2) · **Severity:** low · **Class:** UI MOBILE ERGONOMICS

When `PendingPanelDiscardButtons` stacks full-width `< sm` (DESTRUCT-1 fix), the irreversible "Permanently ignore" sits BELOW the safe "Defer until modified" — i.e. nearest a resting thumb (impeccable critique P2, persona Casey). Mitigated already by the two-tap arm→confirm guard + 4s auto-revert. NOT fixed in the DESTRUCT-1 branch because the obvious fix (a `< sm` visual reorder) is a trap: a CSS `order` flip desyncs DOM/visual order on a destructive control (WCAG 2.4.3 focus-order regression) and would also flip the conventional Defer-left / Ignore-right at `≥ sm`; a DOM reorder fixes the stacked case but breaks the side-by-side order. A real fix needs either a breakpoint-forked render (two DOM orders) or a deliberate spacing/affordance change, weighed against the guard already covering the mis-tap. Trigger: next admin mobile pass, or a venue-floor mis-tap report on this specific control.

### BL-DESTRUCT-CONFIRM-COPY-HARMONIZE — harmonize confirm-label grammar + auto-revert timing across destructive surfaces

**Status:** OPEN (2026-07-16, destructive-confirm-pass) · **Severity:** low · **Class:** UI CONSISTENCY

Morph guards say "Confirm: X" while panel confirms say bare "Confirm revoke|reset|rotate|dismiss"; panels auto-revert at 3s (`AUTO_REVERT_MS`) while guards + Archive use 4s (`ARM_REVERT_MS`). One grammar + one timing constant across all 11 recipe surfaces. DEFERRED.md DESTRUCT-2. Trigger: next destructive-surface polish pass.

### BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS — announce bulk-undo full success to screen readers

**Status:** OPEN (2026-07-16, destructive-confirm-pass) · **Severity:** low · **Class:** UI A11Y

`RecentAutoAppliedStrip` renders the aggregate outcome only when `failed > 0`; an all-success bulk undo self-heals visually (rows drop on revalidate) but emits no `role="status"` confirmation for SR users. Net-new affordance beyond spec §6 F2's ratified failure-only alert. DEFERRED.md DESTRUCT-3. Trigger: bundled with BL-DESTRUCT-CONFIRM-COPY-HARMONIZE or an SR-user report.

## BL-STAGED-IDENTITYLINK-RENAME-IDENTITY — dashboard staged apply treats identity-link renames as remove+add

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §2.5) · **Class:** sync (staged identity application) · **Effort:** M (staged-core threading + double-apply analysis)

The dashboard staged-apply path (`applyStagedCore`) applies an identity-linked rename (MI-12/13/14) as **remove-old + add-new** by ratified contract (R33-2, `applyStagedCore.ts:552`; passes zero `identityLinkRenames`), so crew identity (id/oauth link) is NOT preserved across a rename on that path. The capability AUDIT is already complete (arm (c) audits the removed old identity's loss + arm (b) the added new identity's grant, path-independent), so this is NOT an audit gap. If identity-PRESERVATION on the staged path is ever wanted, thread `identityLinkRenames` through `applyStagedCore` (compute via `computeIdentityLinkRenames` from the staged `triggeredReviewItems`) — but resolve the double-apply / R33-2-override risk first. Trigger: a report of a staged rename losing a crew member's oauth link.

## BL-MASTERSPEC-FINANCIALS-VOCAB — reconcile stale LEAD-only financials-gate prose in the master spec

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug, owner scope decision) · **Class:** docs (canonical-spec consistency) · **Effort:** S (doc-only grep-sweep)

Pre-existing `2026-07-15-extend-role-scope-vocab` debt: that spec added the `FINANCIALS` role flag but did not reconcile the master spec's (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) ~15 financials-access prose claims, which still describe financials/`shows_internal`/FinancialsTile access as LEAD-only. Live code (`lib/data/getShowForViewer.ts:380` `financialsEntitled = isAdmin || includes("LEAD") || includes("FINANCIALS")`, `lib/visibility/scopeTiles.ts:141`) grants on LEAD ∪ FINANCIALS ∪ admin. Reconcile every financials-entitlement claim to `LEAD ∪ FINANCIALS` (or admin). Grep seed: `rg -n "financ|shows_internal|FinancialsTile|financialsEntitled|Proposal|Invoice|PO#" <masterspec> | rg -i "LEAD" | rg -v "FINANCIALS"` (the final exclude is CASE-SENSITIVE — drops only lines already naming the all-caps FINANCIALS role flag). Exclude RLS-admin-only denial and `raw_unrecognized`/`parse_warnings` (admin/LEAD-only — FINANCIALS grants only the `financials` column). Trigger: next master-spec pass or an audit flagging the drift. (This capability-narrow change already corrected the §6.8 MI-9 "LEAD is the only capability element" claim; the rest is out of its scope.)

## BL-STANDALONE-CONFIG-CI-DARK — the standalone real-browser specs run in no CI job

**Status:** OPEN · **Severity:** MEDIUM (test-coverage integrity) · **Class:** CI WIRING — pre-existing, surfaced by the `modal-header-reconciliation` close-out (2026-07-19)

`tests/e2e/standalone.config.ts` holds ~19 self-contained real-browser specs (the `*.layout` family, `statusStripToggleLayout`, `blocked-row-resolver-transitions`, `collapse-panel-morph`, `packlist-rescan-recovery`, `skeletonBandParity`, …). **No workflow invoked that config, and Playwright's default `playwright.config.ts` matches none of those files under any project.** Consequences: `pnpm exec playwright test tests/e2e/<one>.spec.ts` reports `No tests found` (the failure looks like a bad path, not a missing project), and the specs are runnable ONLY by someone who already knows to pass `--config=tests/e2e/standalone.config.ts`. They went green once at authoring time and were never run again in CI.

This is the **#479 failure class repeating** — a spec living in no CI-run project drifted silently and broke on `main` once the Step 3 client graph changed. The lesson memo is "a dark spec in an unrun project rots."

**Partially closed:** `.github/workflows/modal-header-layout-e2e.yml` (added by `modal-header-reconciliation`) now runs the four modal-header-family specs — `published-review-modal.layout`, `skeletonBandParity`, `statusStripToggleLayout`, `step3-review-modal.layout` — via `pnpm test:e2e:modal-header`, with `workflow_dispatch` enabled. **The other ~15 remain dark.**

**Fix:** wire the remainder into CI (either extend the new workflow's spec list job-by-job, or add a job that runs the whole standalone config), then add a **structural guard** so the class cannot silently reopen: a meta-test asserting every `tests/e2e/*.spec.ts` is matched by at least one project in `playwright.config.ts` OR by `standalone.config.ts` AND named in some workflow's run list. Fails-by-default, so a NEW standalone spec that nothing runs breaks CI at authoring time instead of rotting.

**Known blocker for a whole-config job:** `packlist-rescan-recovery.spec.ts` shells out to `pnpm dlx esbuild@0.28.0` (network fetch at test time) and fails locally on a cold/offline dlx cache — pin or vendor that dependency before putting it in a required job.

**Trigger:** next milestone touching `tests/e2e/**` layout harnesses, or any adversarial round that flags real-browser coverage.

## BL-ADMIN-PARSEPANEL-ORPHANED — ParsePanel/StagedReviewCard live-scope mount orphaned

Since the show-page→modal pivot (#476) nothing imports `components/admin/ParsePanel.tsx` (its per-show mount was deleted; whole-parse review was deliberately dropped from published shows in 65d5be75a in favor of MI-11 holds in the Changes feed). `StagedReviewCard` remains live in the onboarding wizard; the live-scope `ParsePanel` wrapper is dead code. Surfaced during published-show-alerts (2026-07-19, spec §14). **Fix (when prioritized):** delete ParsePanel or re-home it explicitly; sweep `tests/e2e/_metaEmphasisRenderContract` style registries on removal.

## BL-RESYNC-REGRESSED-JUMP-LINK — the alert's "open the parse panel" pointer is prose, not an affordance

**Status:** OPEN · **Severity:** LOW-MEDIUM (discoverability) · **Class:** UX — surfaced by the correction-loop de-duplication (#516, 2026-07-20)

`RESYNC_QUALITY_REGRESSED`'s body ends "…open the parse panel to see what degraded and fix the sheet." That sentence is the ONLY thing routing Doug from the alert to the Parse warnings panel, and it is plain prose: no link, no jump control.

This pointer became load-bearing in #516. Before that change, the Overview section rendered the correction-loop instruction ("Fixed it in the sheet? … then re-sync.") directly under the alert, so a reader who never scrolled still got the how-to-fix. #516 removed that copy as a duplicate — correctly, since the Parse warnings panel renders the same sentence on a strictly wider condition — which means the alert's prose pointer is now the whole bridge between "something degraded" and "here is how to fix it".

**Why this is NOT a code fix:** master spec §12.4 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2801`) ratifies "No action link." for this row. Adding a jump affordance contradicts a ratified contract, so it needs a spec amendment first, not a patch. Do not "just add a link" in a UI PR.

**Options to weigh at spec time:** (a) amend the §12.4 row to permit a section-jump action link (note the row's `resolution:"auto"` posture — the link would be navigational, not resolving, which is a different affordance class than the action links other rows carry); (b) leave the alert alone and instead make the rail's "Parse warnings" section carry the attention dot the alert implies, so the route is visible in the nav rather than in prose; (c) accept the prose pointer as sufficient given the rail is always visible in the modal.

**Trigger:** next milestone touching §12.4 alert rows, the attention surface, or `CompactAlertCard` affordances.

## BL-INVARIANT8-CLOSEOUT-ENFORCEMENT — mechanically enforce that every invariant-8 plan ships a §12 closeout

Descoped out of the 2026-07-24 dev-row copy close-out after three consecutive whole-diff
review rounds on the same vector. The change shipped
`tests/docs/_metaDeferralLedgerGraduation.test.ts`, whose ledger invariants (no id both
active and archived; every graduated id archive-only) are enforceable and true. A third
assertion — every plan declaring an invariant-8 (impeccable) gate carries a `## 12`
closeout section — was removed, because it cannot be made both fail-by-default and
honest against the tree as it stands.

**Measured 2026-07-24.** `docs/superpowers/plans/` holds 33 flat `*.md` plans and 274
nested files that mention invariant 8 or impeccable. Plan files are variously
`plan.md`, `00-plan.md`, `PLAN.md`; closeouts are variously `closeout.md` inside a plan
directory or a sibling `<name>-closeout.md`. Of the 13 plan DIRECTORIES that declare the
gate, 12 have no `## 12` closeout section. There is therefore no rule that locates a
closeout for an arbitrary plan, so a filesystem walk silently under-reports; and a
registry-based version is an opt-in list, which is precisely the fail-by-default hole a
structural guard exists to close.

**Work when prioritized:** (1) ratify one closeout location convention; (2) migrate or
explicitly debt-list the existing plans; (3) restore the assertion as a default-deny
walk over that convention, requiring both gate halves named AND an affirmative P0/P1
disposition (a lexical check must reject hedges — "skipped", "pending", "not run",
"TBD" — since the earlier draft passed on "Critique skipped. Audit pending."). Note the
honest ceiling: any text assertion verifies SHAPE, not that a human actually ran the
gate.

## BL-FOCUS-RING-CONTRAST — compute + meta-test `--color-focus-ring` contrast against every backdrop family

From the impeccable critique of `feat/sharehub-focus-pass` (Assessment A P2, 2026-07-23). `--color-focus-ring` is translucent orange (`rgba(255,140,26,0.55)` light / `rgba(255,160,71,0.65)` dark, DESIGN.md token table). Naive alpha-blend puts the light-mode ring around ~1.6:1 against white `--color-surface` — under the WCAG 2.2 SC 2.4.13 Focus Appearance ≥3:1 expectation — while dark mode lands ~4.5:1. Pre-existing and app-wide (every `focus-visible:ring-focus-ring` control), NOT introduced by the focus pass; the pass actually improved perceptibility where the offset gap now separates ring from fill. Work: compute real ratios per backdrop family (surface, surface-sunken, warning-text fill, accent fill), decide whether the light token needs a darker/opaque variant, and pin the outcome with a contrast meta-test (the `status-token-contrast` pattern). Owner decision needed on token change vs accepted-as-brand. Same sweep should reconcile the ~90 pre-existing BARE `ring-offset-2` usages (no color companion) outside the share-hub components with the DESIGN.md token-table rule the focus pass added ("never bare ring-offset-2") — each is a latent dark-mode white halo.

## BL-DEV-SWITCHER-BAR-MOBILE-WIDTH — attention-gallery switcher bar counter/description collapse to zero width on mobile

**Status:** OPEN · **Severity:** LOW (developer-only surface) · **Class:** responsive layout — surfaced by the modal-state-coverage impeccable critique (2026-07-22)

At the 390px mobile viewport the switcher bar's counter ("52 / 116") and scenario-description block measure clientWidth 0 (flex siblings squeeze them out), so the operator cannot tell which scenario is active on mobile. Desktop is unaffected. Pre-existing at origin/main 76288ca62 (section jump select landed with the bar); NOT introduced by the modal-state-coverage branch (zero layout-class hunks touch the bar in that diff). **Fix (when prioritized):** give the counter/description block a min-width floor (or wrap the bar) in components/admin/dev/AttentionModalSwitcher.tsx and add a 390px real-browser assertion to the gallery e2e.

## BL-FLOW8REPICK-TEARDOWN-FLAKE — flow8Repick uncaught `window is not defined` after env teardown (CI shard flake)

**Status:** OPEN · **Severity:** LOW (flake; 0 test failures) · **Class:** jsdom teardown race — surfaced on PR #558's `unit-suite-db (5)` (2026-07-23), rerun green, main green at the same code.

`tests/show/flow8Repick.test.tsx` renders React trees with no `afterEach(cleanup)`; mounted components leave scheduler work (`Immediate performWorkUntilDeadline`) that can tick AFTER the jsdom environment is torn down → `ReferenceError: window is not defined` as an **uncaught error** — vitest reports every test passing (879/879 on the shard) yet exits 1 via the separate `Errors` summary line (the known `feedback_vitest_exits_1_on_uncaught_errors_all_tests_pass` class). Eruption is shard-composition-dependent: adding/removing test files reshuffles the serial shards, changing neighbors/timing — PR #558 added two test files and hit it; a `--failed` rerun passed. **Fix (when prioritized):** add `afterEach(cleanup)` to flow8Repick (and sweep `tests/show/` for sibling render-without-cleanup files); assert no `Errors` line in the CI gate wrapper if this class recurs.

## BL-IGNORED-SUMMARY-TAP-TARGET — Ignored (N) disclosure summary is under the 44px tap floor

From the impeccable audit of `feat/crew-warning-attachment` (2026-07-23), pre-existing: the `Ignored (N)` `<summary>` in `components/admin/showpage/sectionWarningExtras.tsx` is a `text-xs` row with no `min-h-tap-min`, under the 44px floor, while `CrewUnderRowStack`'s equivalent "N more" summary carries it. Add `min-h-tap-min` + flex alignment to match.

## BL-SHAREHUB-ARM-VIEWPORT-REVEAL — armed Archive confirm unreachable inside the overflow-clip modal panel

**Status:** ✅ RESOLVED — `feat/sharehub-archive-copy-reveal` (2026-07-24; spec `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md`). · **Severity when open:** HIGH (was filed MEDIUM) · **Class:** clipped-overlay content stranding — the same class as `BL-HOVERHELP-PORTAL`, which the share hub was never migrated for.

**The original entry was wrong in two ways, both corrected here by measurement.**

It said the operator "CAN reach them by scrolling the modal panel manually (band and popover move up with it)". They cannot: `[data-review-modal-panel]` is `overflow: clip` (`components/admin/review/ReviewModalShell.tsx:623`), which is NOT a scroll container. It reports a `scrollHeight` (1854) larger than its `clientHeight` (476) — which is why it read as scrollable — but assigning `scrollTop` is a no-op, asserted directly by the probe (`panelIsScrollContainer: false`; a manual `scrollTop += overshoot` left it at 0). No ancestor between the popover and the viewport scrolls either: `body` is `overflow: hidden` under the modal scroll-lock and the wrapper is `fixed inset-0`. The popover's own scroller is the only one that exists, and its scrollport bottom is itself off-screen, so its last 108-261px of content is unreachable at ANY scroll position.

It also said "short phones". Measured unreachable at 390x844, 740, 667, 620 and 560 — every height swept, including the project's default mobile viewport. The geometry is structural, not viewport-specific bad luck: the hub anchor sits a constant 347px below the panel top, so fitting requires `347 + popoverHeight <= 0.85 * vh`, i.e. `vh >= 973px` while the 30rem cap binds, and never at all below 686px where the cap is 70vh.

So a destructive control could be ARMED and then neither confirmed nor cancelled (Cancel sits in the same off-screen band; Escape still dismissed).

**Fixed by** migrating the hub popover to the portal + `lib/popover/position.ts` placement stack already shipped for `HoverHelp`, rather than writing new placement math. Reachability at all five heights, plus containment, side selection, caret, focus and the armed-resize case, are pinned in `tests/e2e/admin-lifecycle-layout.spec.ts`.

## BL-ATTENTION-MENU-PANEL-CLIP — attention menu is an anchored, capped scroller inside the clipping panel

**Status:** OPEN · **Severity:** UNVERIFIED (needs measurement before triage) · **Class:** same as `BL-SHAREHUB-ARM-VIEWPORT-REVEAL` above.

Surfaced BY the structural registry added in `feat/sharehub-archive-copy-reveal` (`tests/components/admin/showpage/popoverOverlayRegistry.ts`), which is the point of building it. `AttentionMenu` mounts INSIDE the `overflow-clip` review-modal panel (`components/admin/showpage/PublishedReviewModal.tsx`), is absolutely anchored (`components/admin/showpage/AttentionMenu.tsx:119`, `top-[calc(100%+8px)]`) and carries its own capped scroller (`components/admin/showpage/AttentionMenu.tsx:130`, `max-h-96 overflow-y-auto`), while using neither clip-safety mechanism.

The original spec sweep missed it because that grep required `top-full` and this component uses an arbitrary anchor — exactly the false negative plan-review R3 predicted, then demonstrated on a real file.

NOT fixed on suspicion: whether it strands content depends on measured geometry, and it sits near the panel top where 384px may well fit. **Probe recipe:** open the menu at 390x{844,667,560} with enough items to fill `max-h-96` and assert the last item is reachable via `elementFromPoint`, the shape spec §9.2 uses. Registered as `unverified-gap` so the guard stays green while the question stays visible.

## BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS — the hub backdrop swallows taps on its own triggers

**Status:** OPEN · **Severity:** LOW (near-invisible in use) · **Class:** stacking-context misconception.

With the hub open, the `fixed inset-0 z-20` backdrop wins the hit test over both trigger buttons. The root's (now removed) open-gated `z-30` elevated the WHOLE root, backdrop included, and never ordered that fixed child against its non-positioned trigger siblings — so `tests/components/admin/showpage/shareHub.test.tsx` pinned class-level z values and read them as paint order, the exact failure `T-HUB-ZORDER`'s own comment warns about.

**Pre-existing, not a regression:** the same `elementFromPoint` probe fails identically with `origin/main`'s `ShareHub.tsx` checked out in place. Near-invisible because the backdrop's own handler closes the popover, so a trigger tap still dismisses — just via the outside-click path, without focus restore.

**Fix shape:** give the trigger group its own open-gated stacking level above the backdrop, or move the backdrop into the portal beneath the body; then restore the trigger assertions in T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts`), which were deliberately scoped out rather than asserted as expected so the eventual fix does not look like a regression.

## BL-SHAREHUB-CONFIRM-NAMES-SHOW — armed Archive confirm does not name the show it will archive

**Status:** OPEN · **Severity:** LOW · **Class:** destructive-confirm context.

Surfaced by the impeccable critique of `feat/sharehub-archive-copy-reveal` (2026-07-24, finding 1). On short viewports the hub popover now places ABOVE its trigger, which covers the show title and status band — so at the moment the operator arms a destructive action, the surface no longer shows which show they are acting on.

Placement is not the thing to change: opening upward is what makes the confirm reachable at all, and the prior behaviour was a popover clipped off-screen, which is strictly worse than an obscured title. The better fix is to make the confirm self-describing — name the show in the armed consequence sentence, so context travels with the decision instead of depending on what happens to be visible behind the popover.

Fix shape: include the show title in the armed confirm copy in `components/admin/ArchiveShowButton.tsx`, and pin it in `tests/components/admin/showpage/shareHub.test.tsx`. Copy is owner-ratified (destructive-confirm-pass §R7), so this needs a copy decision, not just an edit.

## BL-PUBLISHED-TOGGLE-OVERLAY-CLIP — published-toggle error overlay can be cut by the panel clip

**Status:** OPEN · **Severity:** LOW · **Class:** as above, weaker variant.

`components/admin/PublishedToggle.tsx:59` anchors an error banner `absolute inset-x-0 top-full` inside the clipping panel. Unlike the share hub it carries NO cap and NO internal scroller, so it cannot strand content in a hidden scroll tail — the failure mode the registry exists for — but a long enough error could still be visually cut at the clip edge. Error-only and momentary (`components/admin/PublishedToggle.tsx:55`), hence out of scope for the placement migration.

## BL-E2E-LIFECYCLE-SPECS-CI-DARK — admin-lifecycle e2e specs are matched by playwright projects but invoked by no workflow

**Status:** OPEN · **Severity:** MEDIUM (dark regression coverage) · **Class:** CI wiring — surfaced by the archive-row-menu-idiom spec R11 adversarial round (2026-07-24).

`tests/e2e/admin-lifecycle-layout.spec.ts` and `tests/e2e/admin-lifecycle-transitions.spec.ts` appear in the `mobile-safari` project `testMatch` (`playwright.config.ts`), but every e2e workflow runs an explicit spec list and none names them — they run nowhere in CI. The archive-row-menu-idiom branch wires the LAYOUT spec (new `lifecycle-layout-e2e.yml`, since it carries that feature's load-bearing assertions); the TRANSITIONS spec remains dark. **Fix (when prioritized):** add `admin-lifecycle-transitions.spec.ts` to the same workflow (or its own) after fixing its local flake class — the 2026-07-24 flake audit (archive-row branch) measured: static source-guard red since 2026-07-20 (fixed on that branch via the ArchiveShowButton transition-opacity carve-out mirroring PublishedToggle's), plus 3 pre-hydration click-swallow failures (hub kebab open x2, published toggle x1) whose failing cases move between runs; the layout spec's toPass hydration-retry is the template. The structural guard for the class (workflow-coverage meta-test with a reasoned allowlist) SHIPPED with the archive-row-menu-idiom branch (spec §6 item 6); un-wiring work here is now just moving this spec off that allowlist by adding it to a workflow. Related owner decision (R18): branch protection requires only the `quality` context (owner-directed solo posture, plans DEFERRED.md 2026-06-22 entry) — promoting e2e jobs into the required set so a red e2e blocks merge at the GitHub layer is an owner GitHub-settings action, not repo code; until then enforcement is the pipeline's all-checks-green procedural gate.

## BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP — no-op repeat archive emits a duplicate SHOW_ARCHIVED event

**Status:** OPEN · **Severity:** LOW (forensic telemetry cosmetics) · **Class:** idempotent-no-op observability — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24).

`archive_show` is an under-lock idempotent no-op when the show is already archived (`supabase/migrations/20260601000000_b2_show_lifecycle.sql:73-74`), but `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`) treats that no-op as committed success and emits `SHOW_ARCHIVED` again — a repeat submit inside the committed-refreshing window (or from a stale tab) writes a duplicate forensic event for a transition that did not occur. Pre-existing on all variants. **Fix (when prioritized):** have the RPC return a performed/no-op discriminator and emit `SHOW_ARCHIVED` only on the actual false→true transition; add a repeat-submit test asserting single emission.

## BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE — realtime invalidation can swap Archive→Unarchive while the archive form is still pending

**Status:** OPEN · **Severity:** MEDIUM (destructive-control race; needs probe before design) · **Class:** cross-surface lifecycle race — surfaced by the archive-row-menu-idiom spec R15 adversarial round (2026-07-24); inferred from code paths, NOT yet empirically probed.

Scenario: the archive RPC's show invalidation publishes before the server action finishes post-RPC work; the mounted realtime bridge refreshes `archived` props while `useFormStatus` is still pending; ShareHub swaps Archive for Unarchive; ArchiveShowButton's unmount cleanup releases the busy gate; a fast next tap could fire Unarchive while the original action is still settling (server-side advisory lock serializes actual mutations, so the exposure is UX/telemetry, not data corruption). Shared with the legacy variants; untouched by the row restyle. **Fix (when prioritized):** run the mandated empirical race probe (invalidation arriving before action completion), then ratify one of: retain pending UI across the swap, close the hub on the archived flip, or disable the replacement lifecycle control until settlement.
