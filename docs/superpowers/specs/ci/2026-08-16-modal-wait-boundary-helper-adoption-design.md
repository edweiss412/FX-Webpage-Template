<!-- spec-lint: not-ui — no UI surface: changes land in tests/, scripts/, and .github/workflows/; app/ files are cited as evidence, not modified surfaces -->

# Modal-wait boundary-helper adoption — peer sweep design

**Date:** 2026-08-16 · **Ledger:** `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` · **Branch:** `test/modal-wait-helper-adoption`
**Status:** DRAFT (spec/plan-only arc; implementation is a separate session)
**Parent:** `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` — the class mechanism is CI-proven there (§2) and is cited here, never re-derived.

The parent arc measured the class defect: a transient gateway 502 on the foreground `get_admin_show_review_snapshot` RPC makes the loader throw `show_review_snapshot_failed` (`app/admin/_showReviewModal.tsx:281-283`) to the `/admin` error boundary (`app/admin/error.tsx:35`), and any test waiting only for the loaded review modal starves its full timeout. The repair shipped `tests/e2e/helpers/openShowReviewModal.ts` — goto + wait on modal-OR-boundary + exactly-one recovery via the product's own Retry (`app/admin/error.tsx:46`), every recovery surfaced as a `{ type: "infra-recovery" }` test annotation — and adopted it in one spec. This arc is the peer-adoption sweep: every other e2e spec exposed to the same starve adopts the same recovery, recoveries become operator-visible in every CI workflow that runs a member spec, and a structural guard keeps the next spec from re-authoring the unguarded pattern.

## 1. Scope

In scope:

- A shape-preserving refactor of `tests/e2e/helpers/openShowReviewModal.ts` that extracts the wait-plus-recovery core as a second export, so specs with bespoke navigation (URL variants, non-default `waitUntil`, row-click opens) can adopt the recovery without changing their navigation.
- Adoption across the derived member census (§2): every member call site routes its loaded-modal wait through the helper module; every downstream assertion is unchanged.
- Recovery visibility: every CI workflow step that runs a member spec emits a Playwright JSON report and prints `infra-recovery` annotations into the job log, via a shared collector extracted from the app-e2e oracle.
- A structural guard (meta-test) that fails when a new e2e spec navigates `/admin?show=` directly without engaging the helper module.
- Ledger + docs bookkeeping (§4.5).

Out of scope:

- Any change to `openShowReviewModal`'s ratified contract (recovery bound 1, error-message content, empty-slug guard) — parent spec §1.1/§4.1.
- Any product change, including the loader retry posture — filed as `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` (reason (a), product decision).
- The parent's five-green acceptance bar. These specs are already wired (or deliberately UNSEEN); this is hardening on existing workflows, not a re-entry.
- Root-causing the CI gateway 502 (parent §7 limit 1).

### 1.1 Resolved scope — do not relitigate

- **The class mechanism is settled by the parent arc's CI evidence.** Parent §2 has the failing runs' logs, the exact server signature, and the disproof of the fixture-collision theory. Findings that re-litigate the mechanism or demand fresh per-peer fault evidence are out of scope: per-peer reachability is **INFERRED, NOT PROBED** by declaration (the ledger entry filed it that way), and the adoption posture is uniform hardening, stated honestly rather than manufactured per-spec probes. The probe that settles any single peer is its own workflow's failure history, which no spec-time action can produce.
- **Recovery bound stays exactly 1.** Ratified in parent §1.1; the helper header repeats it (`tests/e2e/helpers/openShowReviewModal.ts:13-15`). Do not widen, per-caller or globally.
- **`--retries=0` posture is untouched** wherever a workflow sets it. The in-test recovery is not a Playwright retry (parent §1.1 third bullet); this arc adds no retries flags and removes none.
- **The two filed censuses are superseded by the mechanism-keyed derivation in §2 — deliberately.** The ledger entry's greps were literal-string approximations; §2 shows each one both over- and under-counts (BASE-templated selectors, comment-only matches, assertion-string matches, harness routes). The entry itself orders the member list re-derived at pickup. Findings proposing to restore the literal grep lists relitigate a measured correction.
- **`openShowReviewModal`'s existing unit surface stays green unchanged.** The three cases in `tests/e2e/helpers/openShowReviewModal.unit.test.ts:28-37` and the dead-slug diagnostic (`tests/e2e/admin-changes-feed-layout.spec.ts:185`) pin the public contract; the §4.1 refactor is internal extraction only.
- **The app-e2e oracle's stdout is pinned and stays byte-identical.** `tests/ci/appE2eAnnotationPrint.test.ts` runs `scripts/check-app-e2e-executed.mjs` as a child process and asserts its print lines; the §4.3 collector extraction must keep that suite green without editing its assertions.

## 2. Member census (mechanism-keyed, derived — not the entry snapshot)

A spec is a **member** iff it opens the real `/admin?show=<slug>` review surface — by direct `page.goto` or by clicking a dashboard row — and then waits for loaded-modal content. Those waits can observe the error boundary instead of the modal; that is the whole class.

Derivation commands (run at pickup 2026-08-16; the plan and the implementation re-run them — the counts below are as-of-authoring locators, not gates):

```
rg -n "goto\([^)]*admin\\\\?show=" tests/e2e/*.spec.ts     # direct-goto sites
rg -l "published-show-review" tests/e2e/*.spec.ts          # selector-referencing files, then classified by open mechanism
```

The entry's two literal greps mis-census in both directions: `rg -l 'published-show-review-modal'` misses every `published-*` spec (they build the selector from `const BASE = "published-show-review"` — e.g. `tests/e2e/published-show-attention.spec.ts:25-27`) while including a harness-only gallery; `rg -c 'admin\?show='` counts comment mentions (`tests/e2e/skeletonBandParity.spec.ts:7`) and assertion strings (`tests/e2e/published-review-modal.reopen.spec.ts:138` is an `href` expectation, not a navigation).

### 2.1 Members — direct-goto shape

| spec (tests/e2e/) | goto sites | current wait after goto | CI workflow |
| --- | --- | --- | --- |
| `admin-lifecycle-layout.spec.ts` | 11 | `LOADED_REVIEW_MODAL` local const, `toBeVisible` 30s (e.g. `tests/e2e/admin-lifecycle-layout.spec.ts:249-251`) | `lifecycle-layout-e2e.yml` |
| `admin-lifecycle-transitions.spec.ts` | 5 | same shape (`tests/e2e/admin-lifecycle-transitions.spec.ts:67`) | `lifecycle-layout-e2e.yml` |
| `admin-parse-panel.spec.ts` | 1 | `LOADED_REVIEW_MODAL` local const (`tests/e2e/admin-parse-panel.spec.ts:41`) | UNSEEN |
| `dev-capture.spec.ts` | 3 | inline loaded selector + `toHaveCount(1)` (`tests/e2e/dev-capture.spec.ts:52-54`) | UNSEEN |
| `font-binding.spec.ts` | 1 | inline loaded selector + `toHaveCount(1)` (`tests/e2e/font-binding.spec.ts:470-473`) | `crew-e2e.yml` |
| `picker-flow.spec.ts` | 2 | goto `waitUntil: "networkidle"` + `LOADED_REVIEW_MODAL` (`tests/e2e/picker-flow.spec.ts:398-399` and `tests/e2e/picker-flow.spec.ts:431-432`) | `crew-e2e.yml` |
| `warning-panel-polish.spec.ts` | 2 | BASE-templated `MODAL`, `toBeVisible` 30s (`tests/e2e/warning-panel-polish.spec.ts:96-97`) | UNSEEN |
| `needs-attention-holds.spec.ts` | 1 | `waitForFormAction(page, "mi11-reject")` — waits on modal-interior control, never the frame (`tests/e2e/needs-attention-holds.spec.ts:350-357`) | `admin-layout-e2e.yml` |
| `alert-action-links.spec.ts` | 1 | `waitForLoadState("networkidle")` then banner assertions (`tests/e2e/alert-action-links.spec.ts:381-383`) | `crew-e2e.yml` |
| `admin-layout-dimensions.spec.ts` | 4 | goto `waitUntil: "domcontentloaded"` + `MODAL` + content wait (`tests/e2e/admin-layout-dimensions.spec.ts:551-562`) | `phantom-gap-e2e.yml` |
| `published-review-modal.crew-actions.spec.ts` | 1 | BASE-templated `MODAL`, 30s (`tests/e2e/published-review-modal.crew-actions.spec.ts:48-53`) | `published-modal-e2e.yml` |
| `published-review-modal.deeplink.spec.ts` | 2 | local `openModal(page, url)` — URL variants `&alert_id=`, `#share-access` (`tests/e2e/published-review-modal.deeplink.spec.ts:122` and `tests/e2e/published-review-modal.deeplink.spec.ts:163-212`) | `published-modal-e2e.yml` |
| `published-review-modal.interactions.spec.ts` | 1 | local open helper, `opts.url ?? /admin?show=` (`tests/e2e/published-review-modal.interactions.spec.ts:103-105`) | `published-modal-e2e.yml` |
| `published-review-modal.realtime.spec.ts` | 1 | `MODAL` with imported `MODAL_OPEN_TIMEOUT_MS` (15_000, `tests/e2e/helpers/realtimeOracle.ts:38`) (`tests/e2e/published-review-modal.realtime.spec.ts:321-325`) | `published-modal-e2e.yml` |
| `published-show-attention.spec.ts` | 1 | BASE-templated `MODAL`, 30s (`tests/e2e/published-show-attention.spec.ts:71-72`) | UNSEEN |

### 2.2 Members — click-open shape (row click, then loaded-modal wait)

| spec (tests/e2e/) | open mechanism | current wait | CI workflow |
| --- | --- | --- | --- |
| `published-review-modal.reopen.spec.ts` | `waitForRowHydration` + row click | `MODAL` `toBeVisible` 30s (`tests/e2e/published-review-modal.reopen.spec.ts:66`) | `published-modal-e2e.yml` |
| `published-review-modal.closeFreshness.spec.ts` | row click (`tests/e2e/published-review-modal.closeFreshness.spec.ts:71`) | `MODAL` `toBeVisible` 30s (`tests/e2e/published-review-modal.closeFreshness.spec.ts:55`) | `published-modal-e2e.yml` |
| `published-review-modal.realtime.spec.ts` | row click after close (`tests/e2e/published-review-modal.realtime.spec.ts:788-790`) | `MODAL` with `MODAL_OPEN_TIMEOUT_MS` | `published-modal-e2e.yml` |

A row click is a client-side navigation to the same `?show=` route; the loader and its error boundary are identical, and `reset()` re-runs the loader at the same URL, so the recovery mechanics transfer unchanged.

### 2.3 Excluded, each with its reason

| spec | reason |
| --- | --- |
| `admin-changes-feed-layout.spec.ts` | Parent arc; already adopted (`tests/e2e/admin-changes-feed-layout.spec.ts:25`, `tests/e2e/admin-changes-feed-layout.spec.ts:130`). |
| `attention-modal-gallery.spec.ts` | Renders the modal from fixture scenarios on the dev gallery route (`GALLERY_PATH = "/admin/dev/attention-gallery"`, `tests/e2e/attention-modal-gallery.spec.ts:76`; page imports scenario builders, not the snapshot loader — `app/admin/dev/attention-gallery/page.tsx:34-36`). No `get_admin_show_review_snapshot` foreground read; the class does not apply. Census-1 false member (testid literal match only). |
| `published-review-modal.layout.spec.ts` | Standalone harness (mkdtemp workdir, `tests/e2e/published-review-modal.layout.spec.ts:110`); never navigates `/admin`. |
| `published-review-modal.prefetch.spec.ts` | Opens via row click on the real route, but its assertions COUNT `?show=` network requests (`tests/e2e/published-review-modal.prefetch.spec.ts:141-151`). A silent recovery re-runs the loader and adds exactly the traffic those assertions measure — adoption would convert a rare visible starve into a rare wrong-count failure that looks like a product regression. Excluded; documented limit 3. |
| `skeletonBandParity.spec.ts`, `stackedBandLayout.spec.ts`, `popover-clip-fit.spec.ts`, `attention-pill-focus.spec.ts` | Selector references only (comments, or standalone-harness sub-testids like `published-show-review-alert-pill`); none opens the real route. |

## 3. Approaches considered

1. **Extract the wait-plus-recovery core as a second export; adopt per navigation shape (CHOSEN).** `openShowReviewModal` keeps its exact contract; a new `awaitLoadedReviewModal` carries the modal-or-boundary wait + single recovery for callers that must own their navigation (URL variants, `waitUntil` options, row clicks). Pros: every member adopts without changing what it navigates or asserts; the parent's ratified contract is untouched; one recovery implementation, zero copies. Cons: two exports to keep coherent — mitigated by `openShowReviewModal` delegating to the core.
2. **Adopt `openShowReviewModal` only where its signature already fits.** Leaves the URL-variant deeplink sites, the `domcontentloaded` layout sites, and every click-open wait unhardened — including four member specs in the workflow with the largest member surface. Rejected: the sweep's disposition rule (AGENTS.md class-sweep) is repair-all-in-one-PR unless a named exception applies; "the signature doesn't fit" is a helper-shape problem this arc can fix, not an exception.
3. **Playwright-level retry (`retries: 1`) on member workflows.** Rejected: laundering — a fail-then-pass retry hides deterministic regressions, which is exactly why `--retries=0` is ratified where it appears (parent §1.1).
4. **Server-side bounded retry in the loader.** Product decision, already filed (`BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`), explicitly out of scope.

## 4. Design

### 4.1 Helper refactor: extract `awaitLoadedReviewModal`

`tests/e2e/helpers/openShowReviewModal.ts` gains a second export; no new module.

- `awaitLoadedReviewModal(page: Page, opts?: { timeoutMs?: number; label?: string }): Promise<Locator>` — steps 3–7 of the parent §4.1 contract, verbatim semantics: wait up to `timeoutMs` (default 30_000, same non-finite/non-positive fallback as today, `tests/e2e/helpers/openShowReviewModal.ts:54-57`) for `LOADED_REVIEW_MODAL` OR the boundary; modal → return locator; boundary → push `{ type: "infra-recovery" }` annotation (lazy `@playwright/test` dynamic import preserved — the module must stay loadable under vitest, header rule `tests/e2e/helpers/openShowReviewModal.ts:17-19`), click `admin-route-error-retry`, re-wait for the modal only; boundary again → terminal error; neither → enriched starve error. Recovery bound stays exactly 1.
- `label` replaces `slug=<slug>` in the annotation description and error messages (`slug=…` when called through `openShowReviewModal`, caller-supplied context otherwise, e.g. `url=/admin?show=x&alert_id=y` or `click:shows-table-row-<slug>`; absent → `label=unspecified`). The error-message substrings the parent's dead-slug diagnostic asserts — both waited-on selectors and the `show_review_snapshot_failed` grep hint — are preserved verbatim on every exit path (`tests/e2e/helpers/openShowReviewModal.ts:31-38`, `tests/e2e/helpers/openShowReviewModal.ts:80-88`).
- `openShowReviewModal(page, slug, opts)` becomes: empty-slug guard (unchanged) → `page.goto('/admin?show=' + slug)` (unchanged) → `awaitLoadedReviewModal(page, { timeoutMs: opts?.timeoutMs, label: 'slug=' + slug })`. Public behavior identical; the §1.1 pins prove it.

### 4.2 Adoption — per-member shape, downstream assertions unchanged

The helper replaces ONLY the navigation-plus-modal-presence wait. Every assertion, hydration wait, and interaction downstream of the modal becoming visible stays byte-unchanged. Three adoption shapes:

- **Shape G (plain goto):** replace `page.goto('/admin?show=' + slug)` + bare modal wait with `const modal = await openShowReviewModal(page, slug)`. Applies to: `admin-lifecycle-layout`, `admin-lifecycle-transitions`, `admin-parse-panel`, `dev-capture` (keep its `toHaveCount(1)` after), `font-binding` (same), `warning-panel-polish`, `needs-attention-holds` (keep `waitForFormAction` after — the helper ADDS a loaded-modal wait this spec never had, which is the hardening), `alert-action-links` (keep its `waitForLoadState("networkidle")` and banner waits after), `published-review-modal.crew-actions`, `published-review-modal.realtime` goto site (pass `{ timeoutMs: MODAL_OPEN_TIMEOUT_MS }`), `published-show-attention`.
- **Shape B (bespoke goto, then core):** the spec keeps its own `page.goto` (URL variants or `waitUntil` options), then calls `awaitLoadedReviewModal`. Applies to: `published-review-modal.deeplink` (its local `openModal(page, url)` keeps `goto(url)`, delegates the wait), `published-review-modal.interactions` (same, `opts.url` branch), `picker-flow` (goto's `waitUntil: "networkidle"` is load-bearing for post-open clicks — keep the bespoke goto, then core; equivalently helper + `waitForLoadState("networkidle")`, plan picks one and applies it to both sites identically), `admin-layout-dimensions` (keeps `waitUntil: "domcontentloaded"` + `reducedMotion` emulation, then core, then its content wait unchanged).
- **Shape C (click-open, then core):** row click unchanged, then `awaitLoadedReviewModal(page, { label: 'click:' + rowTestId })` replaces the bare `MODAL` wait. Applies to: `published-review-modal.reopen`, `published-review-modal.closeFreshness`, `published-review-modal.realtime` click site.

Where a file's local `MODAL` constant survives for OTHER assertions (count checks, scrim lookups, post-close absence), it stays; only the presence-wait-after-open routes through the helper.

### 4.3 Recovery visibility: shared collector, printed in every member workflow

Today the annotation is operator-visible only in `app-e2e.yml`: the oracle collects from `tests[].annotations` only (double-count trap documented at `scripts/check-app-e2e-executed.mjs:70-71`) and prints one row per recovery plus a total (`scripts/check-app-e2e-executed.mjs:202-203`). Green runs upload no artifact and the list reporter prints no annotations, so an unprinted workflow absorbs recoveries invisibly.

<!-- spec-lint: ignore — scripts/lib/infraRecoveryAnnotations.mjs is created by this spec's implementation -->
- **Extract the collector** to a shared module (e.g. `scripts/lib/infraRecoveryAnnotations.mjs`): `collect(report)` (tests[].annotations only, every occurrence) + `print(recoveries)` (the exact current two-line-shape stdout). `check-app-e2e-executed.mjs` imports it; its stdout stays byte-identical (§1.1 pin). One copy of the read-location semantics, because two copies drift.
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this spec's implementation -->
- **New thin printer** `scripts/print-infra-recoveries.mjs --report <path>`: reads a Playwright JSON report, prints via the shared module, always exits 0 (informational only, never a gate — a recovered run is a green run by design, parent §4.4).
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this spec's implementation -->
- **Wiring rule (the closable statement):** every CI workflow step that executes a member spec emits a JSON report (`--reporter=list,json` + `PLAYWRIGHT_JSON_OUTPUT_NAME`) and is followed by a print of that report's recoveries — through the workflow's existing executed-count oracle where one already consumes that report (`.github/workflows/crew-e2e.yml:188` → `check-crew-e2e-executed.mjs` gains the print duty), through `print-infra-recoveries.mjs` otherwise (`.github/workflows/published-modal-e2e.yml:149`; `.github/workflows/lifecycle-layout-e2e.yml:110`, `.github/workflows/lifecycle-layout-e2e.yml:130-133`; `phantom-gap-e2e.yml` steps running `admin-layout-dimensions.spec.ts`, e.g. `.github/workflows/phantom-gap-e2e.yml:194`; `.github/workflows/admin-layout-e2e.yml:173`). The plan enumerates the exact step list by re-deriving members × workflows; UNSEEN members have no steps (documented limit 4).

### 4.4 Structural guard: direct-goto census meta-test

<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this spec's implementation -->
New meta-test (e.g. `tests/ci/_metaModalWaitHelper.test.ts`) with its predicate authored as an importable module (registry-expressible shape from the start, per AGENTS.md convergence criterion 4; enrolled in `tests/mutation/source/registry.ts` at implementation, `pnpm mutation:guards` run before the first diff review dispatch).

- **Population:** filesystem walk of `tests/e2e/*.spec.ts` — a new spec is covered by default, never silently exempt.
- **Rule:** any line whose text contains both a `goto(` call and `admin?show=` requires the FILE to either import from `helpers/openShowReviewModal` or carry a `modal-wait-exempt: <non-empty reason>` comment. Violation names file + line. At ship the exemption set is empty (every direct-goto file adopts, and Shape-B files import the module for the core).
- **Premise proof (executable, per `BL-GUARD-PREMISE-REACHABILITY`):** the suite constructs a temp fixture spec containing the bare goto pattern and asserts the predicate FLAGS it, plus a stays-quiet case (import present) and an exemption case (comment present, and empty-reason rejected) — the guard demonstrably discriminates where it runs, not only on today's clean corpus.
- **Deliberate narrowness (the recognizer fence):** the guard covers the navigation shape the parent's CI evidence proved, keyed on line content. Click-open waits, novel URL spellings, and adversarial obfuscation are NOT recognized — they file to documented limit 5, never to guard growth. Repair direction under any review finding of a "missed" spelling is narrowing-or-limit, per AGENTS.md same-axis-recurrence rule.

### 4.5 Ledger + docs bookkeeping

- `BACKLOG.md` `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` graduates to `BACKLOG-archive.md` on merge, recording the census correction (both literal greps mis-censused; the mechanism-keyed derivation is the durable form) and the prefetch exclusion.
- This spec gets its `docs/superpowers/specs/ci/README.md` (or the specs README the tree uses) index row.
- The plan carries the invariant-8 closeout marker: `impeccable-gate: N/A — no UI surface`.

## 5. Acceptance criteria

- **AC-1:** `awaitLoadedReviewModal` exists with the §4.1 contract; `openShowReviewModal` delegates to it; the §1.1 pins (three unit cases, dead-slug diagnostic, no top-level `@playwright/test` value import) pass unchanged.
- **AC-2:** Every member file in the §2 census (re-derived at implementation) engages the helper module at every member site, in its assigned shape (§4.2); downstream assertions unchanged — verified by targeted local playwright runs of every adopted spec under `pnpm heavy` (non-interactive playwright is heavy by invocation shape), green against a freshly seeded database.
- **AC-3:** The §4.4 guard lands with its executable premise proof (flags a constructed violation; quiet on import; exemption honored, empty reason rejected), passes on the adopted corpus with zero exemptions, and its predicate module is enrolled in the source-mutation registry with the score + empty unaccepted-survivor set reported before the first diff review dispatch.
- **AC-4:** The §4.3 wiring rule holds: every workflow step executing a member spec emits a JSON report and prints its recoveries; `check-app-e2e-executed.mjs` stdout is byte-identical under the collector extraction (`tests/ci/appE2eAnnotationPrint.test.ts` green unchanged); the new printer has a vitest case (child-process, synthetic report: prints rows from `tests[].annotations` only, exactly-once on the duplicated-location case, plus the total line — red first).
- **AC-5:** No behavior change to any workflow's gating: printers and oracle print duties are informational; no retries flags added or removed; no run-step file list changes.
- **AC-6:** Ledger graduation + README index row + review-rounds corpus rows land with the arc.

## 6. Consequence bound, probe domain, threat fence (for review dispatches)

- **Consequence bound:** every member open — direct goto or row click — either (a) yields the loaded modal, (b) recovers exactly once with a surfaced `infra-recovery` annotation, or (c) fails loudly naming the boundary and the `show_review_snapshot_failed` signature. There is no silent-pass path; a deterministic defect still fails on the post-reset re-wait. A conservative failure plus a surfaced annotation is a DOCUMENTED LIMIT, not a finding. The bound ranges over the finite member census of §2, settled by the derivation commands, not over all imaginable specs.
- **PROBE DOMAIN:** `tests/e2e/*.spec.ts` (member census + guard population) and the member rows of `.github/workflows/*.yml` (§4.3 step list). An admissible probe is drawn from those files or is one ordinary edit away; constructed inputs outside them file to documented limits.
- **Threat fence:** transient infrastructure faults (gateway-502 class) on CI-hosted local Supabase, and ordinary authoring mistakes by a contributor copy-pasting existing patterns. Adversarial obfuscation, production outages, faults that survive one reset, and novel hand-rolled navigation spellings are out of scope — the last two deliberately fail the test / file to limits respectively.

## 7. Documented limits

1. **Per-peer reachability stays INFERRED.** No member has its own CI failure sample; the class mechanism is the parent's evidence and the posture is uniform hardening. The entry was filed with exactly this declaration; this spec keeps it honest rather than manufacturing probes.
2. **The recovery branch has no deterministic test** (inherited, parent §7 limit 2 — the RPC is server-side, out of `page.route()` reach). Steps that ARE deterministic (guard, starve error, collector, printer) are tested; the recovery path's proof remains the annotation trail on real occurrences.
3. **`published-review-modal.prefetch.spec.ts` keeps the starve exposure.** Its request-count assertions are incompatible with a silent loader re-run (§2.3). Cost: its historical starve odds are unchanged for one spec; a starve there fails with the bare Playwright timeout, and the fix is a redesign of its counting windows — out of scope, reconsidered only if that spec actually flakes on this signature.
4. **UNSEEN members get local-only value.** `admin-parse-panel`, `dev-capture`, `warning-panel-polish`, `published-show-attention` run in no workflow (`tests/ci/_metaE2eWorkflowCoverage.test.ts` UNSEEN rows); adoption hardens local runs and any future wiring, but no CI log will print their recoveries until they are wired — a wiring decision this arc does not own.
5. **The guard recognizes the proven navigation shape only.** Click-open waits and novel spellings are unguarded (fence, §4.4); the sweep itself covers today's corpus, and tomorrow's authors get the guard plus the helper's header comment.
6. **Recovery-print coverage is workflow-step-enumerated, not workflow-structural.** A future workflow that newly runs a member spec must copy the reporter + print pattern; nothing machine-checks that. Accepted: a structural workflow-parser guard is a bigger recognizer than the value at stake (the run still passes and the annotation still exists in the report).

## 8. Invariant-8 disposition

No UI surface: changes land in `tests/`, `scripts/`, and `.github/workflows/`. The plan closeout carries `impeccable-gate: N/A — no UI surface`.
