<!-- spec-lint: not-ui — no UI surface: changes land in tests/, scripts/, and .github/workflows/; app/ files are cited as evidence, not modified surfaces -->

# Modal-wait boundary-helper adoption — peer sweep design

**Date:** 2026-08-16 · **Ledger:** `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` · **Branch:** `test/modal-wait-helper-adoption`
**Status:** DRAFT (spec/plan-only arc; implementation is a separate session)
**Parent:** `docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md` — the class mechanism is CI-proven there (§2) and is cited here, never re-derived.

The parent arc measured the class defect: a transient gateway 502 on the foreground `get_admin_show_review_snapshot` RPC makes the loader throw `show_review_snapshot_failed` (`app/admin/_showReviewModal.tsx:281-283`) to the `/admin` error boundary (`app/admin/error.tsx:35`), and any test waiting for content that lives inside the review modal starves its full timeout. The repair shipped `tests/e2e/helpers/openShowReviewModal.ts` — goto + wait on modal-OR-boundary + exactly-one recovery via the product's own Retry (`app/admin/error.tsx:46`), every recovery surfaced as a `{ type: "infra-recovery" }` test annotation — and adopted it in one spec. This arc is the peer-adoption sweep: every other e2e open site exposed to the same starve adopts the same recovery, recoveries become operator-visible in every CI workflow that runs a member spec, and a structural guard keeps the next spec from re-authoring the unguarded navigation.

## 1. Scope

In scope:

- A shape-preserving refactor of `tests/e2e/helpers/openShowReviewModal.ts` that exposes the wait-plus-recovery core and a URL-taking entry point, so every navigation shape in the corpus (URL variants, non-default `waitUntil`, row clicks, legacy-route redirects) can adopt the recovery without re-authoring it.
- Adoption across the derived member census (§2): every member **open site** routes its post-open content wait through the helper module; every downstream assertion is unchanged.
- Recovery visibility: every CI workflow step that runs a member spec emits a Playwright JSON report and prints `infra-recovery` annotations into the job log, via a shared collector extracted from the app-e2e oracle.
- A structural guard (meta-test) that fails when any e2e spec navigates `/admin?show=` with its own `page.goto` instead of the helper.
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
- **The two filed censuses are superseded by the mechanism-keyed derivation in §2 — deliberately.** The ledger entry's greps were literal-string approximations that both over- and under-count (BASE-templated selectors, comment-only matches, assertion-string matches, harness routes, and — the larger gap — every open that is not a literal `goto`). The entry itself orders the member list re-derived at pickup. Findings proposing to restore the literal grep lists relitigate a measured correction.
- **The census unit is the OPEN SITE, not the file** (spec-review R1 finding 1). A file table hid nine live opens across four specs; §2.4 is per-site and its derivation (§2.1) is five commands with an explicit completeness argument, not two greps. Spec-review R2 finding 1 then separated the WAIT wrapper from the CAUSING click, which the §2 definition now states outright.
- **The guard's predicate is per-site, never per-file** (spec-review R1 finding 2). A file-level "does this file import the helper" predicate is a false-negative machine: one adopted site silences every other site in the same file. §4.4 bans the naked navigation itself. Findings proposing to re-introduce an import-presence predicate relitigate a refuted design.
- **The derivation carries a re-navigation command, and the site/wrapper distinction is settled** (spec-review R2 finding 1). §2.1 command (e) covers reload and history origins, whose loads write no URL for any URL-keyed command to find; §2 defines a site as the source location that CAUSES the load, never the wrapper that waits. Findings proposing to drop (e) as redundant, or to re-count wait wrappers as sites, relitigate a measured correction.
- **The core is `.first()`-scoped internally and unscoped in its return value** (spec-review R2 finding 2). §4.1's strictness contract is the resolution; it is a sweep over the core's five locator operations, not over the two known `MODAL_ANY` callers. Proposing that the RETURN value also narrow relitigates the §1.1 public-behavior pin directly above.
- **Census completeness drew a finding in all four spec rounds and is now closed as CODE, not as prose.** Round 3 triggered the same-vector rule; round 4 found the comprehensive re-analysis itself incomplete, which under AGENTS.md means the analysis was wrong in KIND, not in degree. The response is structural: §2.1 no longer carries a product enumeration at all, AC-2b makes the candidate list code, and every candidate must carry a member-or-exclusion disposition (`members ∪ exclusions = candidates`, exactly). The §2.3-§2.5 tables are a non-normative rendering. **Findings that the tables are incomplete are therefore no longer admissible as spec findings** — the tables are not the contract; the disposition rule and the derivation are. What IS admissible is a defect in the rule or in an origin: a load reachable by some means none of the five §2.1 origins produces (limit 7).
- **`openShowReviewModal`'s existing unit surface stays green unchanged.** The three cases in `tests/e2e/helpers/openShowReviewModal.unit.test.ts:28-37` and the dead-slug diagnostic (`tests/e2e/admin-changes-feed-layout.spec.ts:185`) pin the public contract; the §4.1 refactor is internal extraction plus two additive exports.
- **The app-e2e oracle's stdout is pinned and stays byte-identical.** `tests/ci/appE2eAnnotationPrint.test.ts` runs `scripts/check-app-e2e-executed.mjs` as a child process and asserts its print lines; the §4.3 collector extraction must keep that suite green without editing its assertions.

## 2. Member census (mechanism-keyed, per open site, derived at pickup)

An **open site** is one source location that CAUSES a `/admin?show=<slug>` load — the `goto`, the click, the keyboard activation, or the reload. A local wrapper that only WAITS causes no load and is never a site, however many callers reach it; where such a wrapper is nonetheless the single edit that adopts several sites, §4.2 says so and counts sites and edits separately. It is a **member** iff a content wait follows it whose target lives inside the review modal — the modal frame itself, a modal-interior control, or a modal-interior fragment id. Those waits can observe the error boundary instead; that is the whole class. The boundary replaces the `/admin` page segment but NOT `app/admin/layout.tsx` (`app/admin/error.tsx` is a sibling of `app/admin/page.tsx`), so a wait on `admin-layout` is satisfied on the boundary and proves nothing — only modal-interior waits are the class signal.

### 2.1 Derivation (five commands, run 2026-08-16; re-run at implementation)

```
# (a) literal/template goto of the route. NOTE the param-position-agnostic form: this MUST be
#     the same pattern the §4.4 guard uses, or the guard flags inputs the candidate producer
#     never proposes and the AC-2b disposition stops being total.
rg -n 'admin\?[^"'"'"'`]*\bshow=' tests/e2e/*.spec.ts

# (b) goto with a NON-literal first argument (variable route, could resolve to ?show=)
rg -n 'goto\(' tests/e2e/*.spec.ts | rg -v 'goto\(\s*[`"'"'"']'

# (c) legacy routes that 307 into the modal
rg -n '/admin/show/' tests/e2e/*.spec.ts

# (d) in-app link activation. PRODUCT-KEYED: first enumerate every product surface whose
#     href or openHref targets the route, then grep tests for each surface's testid.
rg -n "href=" components/admin/ app/admin/ | rg 'show='
rg -n 'useShowModalNav|buildShowModalHref' app/ components/
rg -n 'shows-table-row|needs-attention-link|health-alert-show-link|bell-caret|archived-show-open|admin-preview-banner-exit' tests/e2e/*.spec.ts

# (e) re-navigations of the CURRENT url (no url is written, so (a)-(d) cannot see them)
rg -n 'reload\(|goBack\(|goForward\(' tests/e2e/*.spec.ts
```

**Why these five cover the corpus.** A `/admin?show=` load originates from a full navigation, an in-app link activation, or a RE-navigation of the url already in the address bar. That third origin writes no url anywhere, so no url-keyed command can see it — spec-review R2 finding 1 surfaced it as a live member (`admin-lifecycle-transitions.spec.ts:174`, inside `expectFlipLanded`'s `reload` recovery tier, which reloads the current `?show=` route and waits on the modal at `admin-lifecycle-transitions.spec.ts:175`). (e) closes it, and the class-sweep is a classification of every one of its 21 hits, not a patch of the named instance: exactly one is on a `?show=` route. The other 20 reload or step back on `/admin`, `/admin/needs-attention`, the picker, or a crew route (`theme-toggle.spec.ts:216`, `needs-attention-holds.spec.ts` 291/303/326, `needs-attention-page.spec.ts:193`, `picker-flow.spec.ts` 742/772/788, `bell-panel-layout.spec.ts` 354/566, `admin-nav-layout-dimensions.spec.ts` 611/635/700, `crew-section-toggle.spec.ts` 235/244, `crew-page.spec.ts` 1529/1533), and `published-review-modal.interactions.spec.ts:392` steps back OFF `?show=` to close the modal, asserting its absence. Of the url-writing origins: (a) catches every full navigation whose URL is written inline, in any query-parameter order; (b) is the complete residue of full navigations — every non-literal `goto` argument in the tree, 100 lines, each classified, and only three resolve to `?show=` (`published-review-modal.deeplink.spec.ts:120`, `published-review-modal.interactions.spec.ts:103`, `alert-action-links.spec.ts:345`); (c) catches the redirect-in shape, whose URL never contains `?show=`; (d) catches link activation by naming the two product testids that carry a `/admin?show=` href, which any test must reference to reach them.

**(d) is PRODUCT-keyed, and after four rounds the product list is DERIVED BY CODE rather than
written here.** Census completeness drew a finding in every one of spec rounds 1-4. Round 3
triggered this repo's same-vector rule and round 4 then found the comprehensive re-analysis
ITSELF incomplete — a nine-row prose table that miscounted itself ("eight across six
components") and still omitted lines 694 and 1003 of `components/admin/ShowRowActions.tsx`, `StagedReviewCard.tsx:372`
(`router.push(openHref(slug))`), the crew-side link at `app/show/[slug]/unpublish/blocks.tsx:66`,
and every dynamic `action.href` that `lib/adminAlerts/alertActions.ts` builds at lines 61, 90 and
146 and `BellPanel.tsx:355` / `HealthAlertsPanel.tsx:150` render.

Per AGENTS.md, a finding on the same vector AFTER the comprehensive re-analysis means the
analysis was incomplete and the response is structural, not another patch. **The vector is
therefore declared unresolved as prose and closed as code.** No corrected product table appears
in this spec, because the defect is the format: a hand-written enumeration over a live tree is
wrong the moment either moves, and four rounds is sufficient evidence that this one does not
converge by being rewritten more carefully.

What replaces it, normatively (AC-2b):

- The candidate enumeration is CODE, beside the guard predicate. It derives the product-surface
  list by scanning `app/` and `components/` for `openHref(` call sites and for literal
  `/admin?…show=` hrefs, resolving `action.href` builders through
  `lib/adminAlerts/alertActions.ts`, and extracting each site's `data-testid` where it has one.
  Nothing about that list is typed into this document.
- Every candidate it produces carries a DISPOSITION: a member (with its §4.2 shape) or an
  exclusion (with a reason). **`members ∪ exclusions = candidates`, exactly** — an
  undispositioned candidate fails the meta-test. This is the total disposition round 4 correctly
  identified as the only closable form: a subset assertion cannot notice a new candidate, and a
  bare equality cannot hold because origins (b)-(e) deliberately produce non-members.
- The §2.3, §2.4 and §2.5 tables below are the as-of-authoring RENDERING of that disposition,
  not its source. They are non-normative. If they and the code disagree, the code is right and
  the meta-test says so.

The honest limit of this, stated rather than papered over: total disposition closes
*candidate omission*, not *origin omission*. A load reached by some means none of the five §2.1
origins produces would still be invisible, and no mechanism in this arc changes that — it is
documented limit 7, narrowed to what it actually is.

**(d) is also testid-keyed rather than call-keyed, and that too is load-bearing.** Grepping for the click (`rg 'shows-table-row.*click'`) misses `published-review-modal.interactions.spec.ts:355`, where the locator is bound to a variable at line 349 and clicked as `trigger.click()`. The testid reference is the invariant; the call shape is not. Residual limit: a test that reached a row by `getByRole("link", …)` would evade (d) — probed and absent from the corpus (`rg 'getByRole\(.link' tests/e2e/*.spec.ts` returns four hits, none an admin dashboard row), and recorded as documented limit 6.

**Measured correction to the entry's censuses.** `rg -l 'published-show-review-modal'` misses every `published-*` spec (they build the selector from `const BASE = "published-show-review"`, e.g. `tests/e2e/published-show-attention.spec.ts:25`) while including a harness-only gallery; `rg -c 'admin\?show='` counts comment mentions (`tests/e2e/skeletonBandParity.spec.ts:7`) and assertion strings (`tests/e2e/published-review-modal.reopen.spec.ts:138`, `tests/e2e/published-review-modal.realtime.spec.ts:909` are `href` expectations, not navigations).

### 2.2 Totals

**51 member open sites across 17 spec files** — 37 direct-goto (§2.3) and 14 non-textual (§2.4). They are adopted by **49 edit locations**. Two exclusions and two wrapper effects separate sites from edits, and they pull in opposite directions:

- `published-review-modal.reopen.spec.ts`'s four row clicks all reach one wait wrapper, so one edit discharges four sites (-3).
- `published-review-modal.interactions.spec.ts:506` (`openGated`) is ONE click site whose loaded-modal wait lives in BOTH callers, after `release()` at lines 529 and 550 — its own wait at line 508 is the skeleton panel while the gate is still held, so it is not the wait to replace (+1).

Arithmetic: 37 + 14 = 51 sites; 51 - 3 + 1 = 49 edits.

Two `/admin?show=` gotos are NOT adopted and are the guard's two pinned exemptions: `published-review-modal.deeplink.spec.ts:298` (a non-member — no modal-interior wait) and `published-review-modal.deeplink.spec.ts:344` (a member whose skeleton-tolerant wait this mechanism cannot harden). Both are recorded in §2.5.

Spec review corrected this count three times, each time at the derivation rather than the list. R1: the unit is the open site, not the file. R2: a fifth origin (reload), and WAIT wrappers were being counted as sites when the CAUSING clicks are the source locations. R3: two sites are unhardenable and leave the member set entirely. The §2 definition now states which of site-or-wrapper a row is, so the unit and the count cannot drift apart again.

Spec-review R2 corrected this count twice over. Finding 1 caught the reload origin (+1) and, separately, that §2.4 was counting two WAIT wrappers as sites while their four and one causing clicks were the actual source locations (+3, and the `closeFreshness` row now cites its click rather than its wrapper). The definition in §2 is now explicit about which of the two a site is, so the unit and the count cannot drift apart again.

> **§2.3, §2.4 and §2.5 are NON-NORMATIVE.** They render the disposition as of authoring. The
> normative artifact is AC-2b's total disposition in code; where a table and the code disagree,
> the code is right and the meta-test says so. Counts below are as-of-authoring, not gates.

### 2.3 Members — direct `goto` of `/admin?show=` (37 sites)

| spec (tests/e2e/) | goto site lines | post-open wait (the class signal) | CI workflow |
| --- | --- | --- | --- |
| `admin-lifecycle-layout.spec.ts` | 249, 362, 475, 603, 704, 785, 829, 915, 969, 1150, 1242 (11) | file-level loaded const (`admin-lifecycle-layout.spec.ts:59`), `toBeVisible` 30s | `lifecycle-layout-e2e.yml` |
| `admin-lifecycle-transitions.spec.ts` | 282, 310, 412, 539 (`pageB`), 604 (5) | same shape (`admin-lifecycle-transitions.spec.ts:67`) | `lifecycle-layout-e2e.yml` |
| `admin-parse-panel.spec.ts` | 249 (1) | `LOADED_REVIEW_MODAL` local const, `toBeVisible` 30s (`admin-parse-panel.spec.ts:250-251`) | UNSEEN |
| `dev-capture.spec.ts` | 168, 227, 236 (3) | local `awaitModalHydrated` (`dev-capture.spec.ts:49-58`): inline loaded selector + `toHaveCount(1)` + focus poll | UNSEEN |
| `font-binding.spec.ts` | 463 (1) | inline loaded selector + `toHaveCount(1)` (`font-binding.spec.ts:470-473`) | `crew-e2e.yml` |
| `picker-flow.spec.ts` | 398, 431 (2) | goto `waitUntil: "networkidle"` + `LOADED_REVIEW_MODAL` (`picker-flow.spec.ts:399`, `picker-flow.spec.ts:432`) | `crew-e2e.yml` |
| `warning-panel-polish.spec.ts` | 96, 340 (2) | BASE-templated `MODAL`, `toBeVisible` 30s (`warning-panel-polish.spec.ts:97`) | UNSEEN |
| `needs-attention-holds.spec.ts` | 350 (1) | `waitForFormAction(page, "mi11-reject")` — modal-interior control, never the frame (`needs-attention-holds.spec.ts:357`) | `admin-layout-e2e.yml` |
| `alert-action-links.spec.ts` | 381 (1) | `waitForLoadState("networkidle")` then banner assertions (`alert-action-links.spec.ts:383`) | `crew-e2e.yml` |
| `admin-layout-dimensions.spec.ts` | 551, 686, 836, 1182 (4) | goto `waitUntil: "domcontentloaded"` + `MODAL` + two content waits (`admin-layout-dimensions.spec.ts:552-566`) | `phantom-gap-e2e.yml` |
| `published-review-modal.crew-actions.spec.ts` | 48 (1) | `MODAL` 30s + `MODAL_ANY` count + focus poll (`published-review-modal.crew-actions.spec.ts:53-55`) | `published-modal-e2e.yml` |
| `published-review-modal.deeplink.spec.ts` | 120 (local `openModal`, callers 163/183/212) (1) | `MODAL` 30s (`published-review-modal.deeplink.spec.ts:122`) | `published-modal-e2e.yml` |
| `published-review-modal.interactions.spec.ts` | 103 (local `openModal`, `opts.url ??`), 389 (2) | `MODAL` 30s + `MODAL_ANY` count (`published-review-modal.interactions.spec.ts:105-108`, `published-review-modal.interactions.spec.ts:390`) | `published-modal-e2e.yml` |
| `published-review-modal.realtime.spec.ts` | 321 (1) | `MODAL` with `MODAL_OPEN_TIMEOUT_MS` (15_000, `tests/e2e/helpers/realtimeOracle.ts:38`) (`published-review-modal.realtime.spec.ts:325`) | `published-modal-e2e.yml` |
| `published-show-attention.spec.ts` | 71 (local `openModal`) (1) | BASE-templated `MODAL`, 30s (`published-show-attention.spec.ts:72`) | UNSEEN |

### 2.4 Members — non-textual opens (14 sites)

The nine sites spec-review R1 finding 1 named, the two the file table already implied but never located, the three extra `reopen` clicks spec-review R2 finding 1 separated from their wrapper, and the reload origin that same finding surfaced.

| spec (tests/e2e/) | open site | mechanism | post-open wait |
| --- | --- | --- | --- |
| `published-review-modal.deeplink.spec.ts` | 239 | legacy `/admin/show/<slug>?alert_id=` → 307 into `?show=` | `MODAL` 30s (`published-review-modal.deeplink.spec.ts:248`) |
| `published-review-modal.deeplink.spec.ts` | 257 | legacy combined `?alert_id=…#share-access` → 307 | `MODAL` 30s (`published-review-modal.deeplink.spec.ts:280`) |
| `needs-attention-holds.spec.ts` | 335 | `needs-attention-link-identity-hold-<id>` click | `mi11-approve` / `mi11-reject` visible (`needs-attention-holds.spec.ts:337-338`) — modal-interior controls |
| `alert-action-links.spec.ts` | 345 | route-loop `goto(route, { waitUntil: "commit" })`; the loop groups `/admin?show=<slug>` destinations (`alert-action-links.spec.ts:313-334`) | `admin-layout` (boundary-satisfied, proves nothing) then `[id="<fragment>"]` `toBeAttached` 30s (`alert-action-links.spec.ts:359-362`) — `#share-access` / `#overview` / `#warnings` are modal-interior |
| `published-review-modal.interactions.spec.ts` | 255 | Enter on the focused row Link (client nav) | `MODAL` 30s + `MODAL_ANY` count (`published-review-modal.interactions.spec.ts:262-263`) |
| `published-review-modal.interactions.spec.ts` | 355 | `trigger.click()` (locator bound at `published-review-modal.interactions.spec.ts:349`) | `MODAL` 30s (`published-review-modal.interactions.spec.ts:356`) |
| `published-review-modal.interactions.spec.ts` | 506 | `openGated` row click behind a held `page.route` on `?show=`, callers at lines 515 and 542 | `${MODAL} ${PANEL}` visible 15s after `release()` (`published-review-modal.interactions.spec.ts:529`, `published-review-modal.interactions.spec.ts:550`) |
| `published-review-modal.realtime.spec.ts` | 789 | row click after `waitForRowHydration` | `MODAL`, `MODAL_OPEN_TIMEOUT_MS` (`published-review-modal.realtime.spec.ts:790`) |
| `published-review-modal.reopen.spec.ts` | 85 | row click | local `awaitLoadedModal` (`published-review-modal.reopen.spec.ts:65`): `MODAL` 30s + `MODAL_ANY` count + focus poll |
| `published-review-modal.reopen.spec.ts` | 100 | row click | same wrapper |
| `published-review-modal.reopen.spec.ts` | 116 | row click | same wrapper |
| `published-review-modal.reopen.spec.ts` | 141 | row click | same wrapper |
| `published-review-modal.closeFreshness.spec.ts` | 71 | row click | local `awaitLoadedModal` (`published-review-modal.closeFreshness.spec.ts:54`): `MODAL` 30s + focus poll |
| `admin-lifecycle-transitions.spec.ts` | 174 | `page.reload()` of the current `?show=` route, inside `expectFlipLanded`'s `reload` recovery tier (`admin-lifecycle-transitions.spec.ts:162`) | `expect(modal).toBeVisible({ timeout: 20_000 })` (`admin-lifecycle-transitions.spec.ts:175`) |

A row click is a client-side navigation to the same `?show=` route; the loader and its error boundary are identical, and `reset()` re-runs the loader at the same URL, so the recovery mechanics transfer unchanged. A reload is the same story with the URL held constant: it re-runs the very loader that can throw, and the wait after it is a bare modal wait, so it starves exactly like a fresh open. `expectFlipLanded` is a wedge-recovery ladder whose THIRD tier is that reload, which makes the site doubly worth hardening — it is already the path a flaky run takes. `openGated` (`published-review-modal.interactions.spec.ts:506`) holds an inbound `?show=` route until `release()`; the handler stays installed with the gate already resolved, so a recovery's re-request passes straight through — adoption is safe there, and the wait it hardens is the post-`release()` one.

### 2.5 Excluded, each with its reason

| site | reason |
| --- | --- |
| `admin-changes-feed-layout.spec.ts` (whole file) | Parent arc; already adopted (`admin-changes-feed-layout.spec.ts:25`, `admin-changes-feed-layout.spec.ts:130`). |
| `published-review-modal.deeplink.spec.ts:298` | Unknown-slug goto: the loader `redirect()`s to bare `/admin` and the test asserts NO modal. No modal-interior wait, so no class exposure. **This is the guard's one ship-time exemption** (§4.4). |
| `published-review-modal.deeplink.spec.ts:344` and `published-review-modal.realtime.spec.ts:913` | **Skeleton-tolerant waits — cannot be hardened by this mechanism** (spec-review R3 finding 1). Both wait on `MODAL_ANY`, which matches the Suspense skeleton as well as the loaded modal (`components/admin/showpage/ShowReviewModalSkeleton.tsx:51` renders through the same shell, `components/admin/review/ReviewModalShell.tsx:584`). The skeleton mounts immediately while the loader is still pending, so it WINS a modal-or-boundary race: the helper would return on the skeleton, emit no annotation, and hide the fault instead of surfacing it. Waiting on the loaded frame instead would change what these two tests assert — line 344 exists to prove Esc closes WHICHEVER frame is up, and line 913 re-opens mid-close-transition. Excluded; documented limit 3b, and the deeplink line is one of the guard's two pinned exemptions. |
| `published-review-modal.deeplink.spec.ts:316` | SIGNED-OUT legacy route → sign-in redirect; never reaches the loader. |
| `published-review-modal.prefetch.spec.ts` (clicks at 122, 145, 177) | Opens via row click on the real route, but its assertions COUNT `?show=` network requests (`published-review-modal.prefetch.spec.ts:141-151`). A recovery re-runs the loader and adds exactly the traffic those assertions measure — adoption would convert a rare visible starve into a rare wrong-count failure that looks like a product regression. Excluded; documented limit 3. |
| `attention-modal-gallery.spec.ts` | Renders the modal from fixture scenarios on the dev gallery route (`GALLERY_PATH = "/admin/dev/attention-gallery"`, `attention-modal-gallery.spec.ts:76`; the page imports scenario builders, not the snapshot loader — `app/admin/dev/attention-gallery/page.tsx:34-36`). No `get_admin_show_review_snapshot` foreground read. Census-1 false member (testid literal match only). |
| `published-review-modal.layout.spec.ts` | Standalone harness (mkdtemp workdir, `published-review-modal.layout.spec.ts:110`); never navigates `/admin`. |
| `admin-parse-panel.spec.ts` lines 122, 145, 177, 218; `crew-page.spec.ts` lines 1597, 1625, 1639; `admin-route-boundaries.spec.ts` lines 124, 136 | `/admin/show/staged/*` and `/admin/show/*/preview/*` — different routes with their own loaders; the `?show=` snapshot RPC is not on their path. |
| the 20 non-`?show=` hits of §2.1 command (e) | Reloads and history steps on `/admin`, `/admin/needs-attention`, the picker, or a crew route — the loader under test is not the `?show=` one. `published-review-modal.interactions.spec.ts:392` is the inverse case: it steps BACK off `?show=` to close the modal and asserts its absence, so a boundary there would fail the assertion it already makes. Enumerated in §2.1. |
| `skeletonBandParity.spec.ts`, `stackedBandLayout.spec.ts`, `popover-clip-fit.spec.ts`, `attention-pill-focus.spec.ts` | Selector references only (comments, or standalone-harness sub-testids like `published-show-review-alert-pill`); none opens the real route. |

## 3. Approaches considered

1. **Expose the wait-plus-recovery core AND a URL-taking entry point; adopt per navigation shape (CHOSEN).** `openShowReviewModal` keeps its exact contract and becomes a thin wrapper. `awaitReviewModalOrRecover` carries the ready-or-boundary wait plus the single recovery for callers that own their navigation (row clicks, legacy redirects); `openShowReviewModalAt` adds goto-with-options for callers that own their URL. Pros: every one of the 51 sites adopts without changing what it navigates or asserts; the parent's ratified contract is untouched; one recovery implementation, zero copies; and because no spec writes the naked navigation any more, the §4.4 guard becomes a flat per-site ban rather than a heuristic. Cons: three exports to keep coherent — mitigated by two of them delegating to the third.
2. **Adopt `openShowReviewModal` only where its signature already fits.** Leaves the URL-variant deeplink sites, the `domcontentloaded` layout sites, both legacy-redirect sites, and all fourteen §2.4 opens unhardened. Rejected: the sweep's disposition rule (AGENTS.md class-sweep) is repair-all-in-one-PR unless a named exception applies; "the signature doesn't fit" is a helper-shape problem this arc can fix, not an exception.
3. **A runtime guard: a global Playwright fixture that fails any test navigating to `?show=` outside the helper.** This is the only genuinely per-open enforcement (no lexical recognizer), and it is rejected on blast radius, not on principle: it would install on every spec in the tree, and it would have to distinguish legitimate non-member navigations (`published-review-modal.deeplink.spec.ts:298`) at runtime, re-importing the same exemption problem into a surface with far more ways to fail. Recorded here so it is not re-proposed as an unbounded ask; the static guard's honest limits are §7.5 and §7.7.
4. **Playwright-level retry (`retries: 1`) on member workflows.** Rejected: laundering — a fail-then-pass retry hides deterministic regressions, which is exactly why `--retries=0` is ratified where it appears (parent §1.1).
5. **Server-side bounded retry in the loader.** Product decision, already filed (`BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE`), explicitly out of scope.

## 4. Design

### 4.1 Helper surface: one core, two entry points

`tests/e2e/helpers/openShowReviewModal.ts` gains two exports; no new module. The lazy `@playwright/test` dynamic import stays inside the boundary branch — the module must remain loadable under vitest (header rule, `tests/e2e/helpers/openShowReviewModal.ts:17-19`).

- **`awaitReviewModalOrRecover(page, opts?): Promise<Locator>`** — steps 3-7 of the parent §4.1 contract, verbatim semantics. `opts = { timeoutMs?, label? }`.
  - **There is no `readySelector` option** (spec-review R3 finding 1). Earlier drafts had one, so the two sites that deliberately wait for ANY frame could adopt. That was wrong, and provably so: the Suspense skeleton renders through the SAME shell with `testIdBase="published-show-review"` (`components/admin/showpage/ShowReviewModalSkeleton.tsx:51`, `components/admin/review/ReviewModalShell.tsx:584`), so `MODAL_ANY` matches the skeleton. A modal-or-boundary race on that selector is won by the skeleton, which mounts immediately while the loader is still pending — the core would take its ready-return branch, emit NO recovery annotation, and the test would proceed as if nothing were wrong. That is a silent-pass path, which §6's consequence bound forbids outright. The option is removed rather than patched, and the two sites are excluded from adoption with their reason recorded (§2.5, limit 3b). The core waits on `LOADED_REVIEW_MODAL` and nothing else.
  - **Strictness contract (spec-review R2 finding 2, narrowed by R3 finding 1).** With
    `readySelector` gone the ready locator is single-match BY CONSTRUCTION —
    `LOADED_REVIEW_MODAL` is `…-modal:has(…-title)` and only the loaded frame renders a title
    node, so the transient skeleton twin can never match it. The `.first()` scoping below is
    therefore defense in depth, not the load-bearing fix it was in R2: it is retained so that a
    future selector change cannot silently re-introduce the strict-mode exit, and the premise it
    rests on (single-match) is asserted executably rather than assumed. Every
    locator operation in the core runs on a `.first()`-scoped locator. The sweep is over
    the core's operations, not over the two known callers — the five operations in today's body are
    `modal.or(boundary).first().waitFor` (`tests/e2e/helpers/openShowReviewModal.ts:64`, already
    scoped), `modal.isVisible()` (`tests/e2e/helpers/openShowReviewModal.ts:68`), `modal.waitFor()`
    (`tests/e2e/helpers/openShowReviewModal.ts:78`), `boundary.isVisible()`
    (`tests/e2e/helpers/openShowReviewModal.ts:80`), and `page.locator(RETRY_SELECTOR).click()`
    (`tests/e2e/helpers/openShowReviewModal.ts:76`). The first three take the ready locator and
    MUST be `.first()`-scoped; the last two address the error boundary, which is a single node by
    construction (`app/admin/error.tsx:34`) and is never co-rendered with the frames it replaces.
    Without this, a conforming extraction throws a generic Playwright strict-mode violation during
    the documented twin-frame interval — an exit that names neither the boundary nor
    `show_review_snapshot_failed`, which is a direct breach of the §6 consequence bound.
  - **The RETURN value is not `.first()`-scoped**, so `openShowReviewModal`'s public behavior is
    byte-identical: it still returns `page.locator(LOADED_REVIEW_MODAL)`, and any caller counting or
    scoping off it sees exactly what it sees today (§1.1 pins). Only the internal waits narrow.
  - `timeoutMs` keeps today's non-finite/non-positive fallback to 30_000 (`tests/e2e/helpers/openShowReviewModal.ts:54-57`).
  - `label` replaces `slug=<slug>` in the annotation description and error messages (`slug=…` when called through `openShowReviewModal`; caller-supplied context otherwise, e.g. `url=/admin?show=x&alert_id=y` or `click:shows-table-row-<slug>`; absent → `label=unspecified`). The substrings the parent's dead-slug diagnostic asserts — the waited-on selectors and the `show_review_snapshot_failed` grep hint — are preserved verbatim on every exit path (`tests/e2e/helpers/openShowReviewModal.ts:31-38`, `tests/e2e/helpers/openShowReviewModal.ts:80-88`).
  - Recovery bound stays exactly 1.
- **`openShowReviewModalAt(page, url, opts?): Promise<Locator>`** — `page.goto(url, opts?.gotoOptions)` then `awaitReviewModalOrRecover(page, { …opts, label: opts?.label ?? 'url=' + url })`. `gotoOptions` is Playwright's own goto options object, passed through untouched, so `waitUntil: "networkidle"` / `"domcontentloaded"` / `"commit"` callers keep their exact navigation semantics.
- **`openShowReviewModal(page, slug, opts?)`** — empty-slug guard (unchanged) → `openShowReviewModalAt(page, '/admin?show=' + slug, { timeoutMs: opts?.timeoutMs, label: 'slug=' + slug })`. Public behavior identical; the §1.1 pins prove it.

### 4.2 Adoption — per open site, downstream assertions unchanged

The helper replaces ONLY the navigation-plus-content-presence wait. Every assertion, hydration wait, focus poll, count check, and interaction downstream stays byte-unchanged. Four shapes, each keyed to a §2 column:

- **Shape G — plain goto (`openShowReviewModal(page, slug)`).** Sites: `admin-lifecycle-layout.spec.ts` (all 11), `admin-lifecycle-transitions.spec.ts` (all 5), `admin-parse-panel.spec.ts:249`, `dev-capture.spec.ts` lines 168, 227, 236, `font-binding.spec.ts:463` (keep `toHaveCount(1)`), `warning-panel-polish.spec.ts` lines 96 and 340, `needs-attention-holds.spec.ts:350` (keep `waitForFormAction` after — the helper ADDS a loaded-modal wait this site never had, which is the hardening), `published-review-modal.crew-actions.spec.ts:48` (keep count + focus poll), `published-review-modal.realtime.spec.ts:321` (pass `{ timeoutMs: MODAL_OPEN_TIMEOUT_MS }`), `published-show-attention.spec.ts:71`, `published-review-modal.interactions.spec.ts:389`. **28 sites over 11 files.**
- **Shape U — caller owns the URL or the goto options (`openShowReviewModalAt`).** Sites: `picker-flow.spec.ts:398` and `picker-flow.spec.ts:431` (`gotoOptions: { waitUntil: "networkidle" }` — load-bearing for the post-open clicks), `admin-layout-dimensions.spec.ts` lines 551, 686, 836, 1182 (`gotoOptions: { waitUntil: "domcontentloaded" }`; the `reducedMotion` emulation precedes the call and is untouched; both content waits stay after), `published-review-modal.deeplink.spec.ts:120` (its local `openModal(page, url)` delegates), `published-review-modal.interactions.spec.ts:103` (the `opts.url ??` branch), `alert-action-links.spec.ts:381` (URL keeps its `encodeURIComponent`). **9 sites over 5 files.**
- **Shape N — navigation is not a goto the helper can own (`awaitReviewModalOrRecover` alone).** The open — legacy-route redirect, row click, keyboard activation, link click, or a variable route the loop already navigated — is unchanged; only the wait routes through the core. Sites: `published-review-modal.deeplink.spec.ts` lines 239 and 257 (after their `waitForURL`), `needs-attention-holds.spec.ts:335` (before the `mi11-*` assertions), `alert-action-links.spec.ts:345` (for `?show=` routes only, after the `admin-layout` wait and before the fragment waits), `published-review-modal.interactions.spec.ts` lines 255, 355, 506, `published-review-modal.realtime.spec.ts:789`, `published-review-modal.reopen.spec.ts:65` (its local `awaitLoadedModal` delegates — ONE edit covering the four click sites at 85, 100, 116, 141), `published-review-modal.closeFreshness.spec.ts:54` (same, covering the click at 71), and `admin-lifecycle-transitions.spec.ts:175` (the reload tier's bare `expect(modal).toBeVisible({ timeout: 20_000 })` becomes `awaitReviewModalOrRecover(page, { timeoutMs: 20_000, label: 'reload:expectFlipLanded' })`; the `modal` locator the caller passed in stays valid and every later `modal.getByTestId("published-toggle")` assertion is untouched). **14 sites over 8 files, 12 edit locations** — `reopen`'s one edit covers four sites (-3) and `openGated`'s one site takes two edits (+1).

28 + 9 + 14 = 51 sites, discharged by 28 + 9 + 12 = **49 edit locations**. No site is in two shapes; a FILE may host two (`admin-lifecycle-transitions.spec.ts` has five Shape G gotos and one Shape N reload). The two places sites and edits diverge are enumerated in §2.2.

Where a file's local `MODAL` / `MODAL_ANY` constant survives for OTHER assertions (count checks, scrim lookups, post-close absence), it stays; only the presence-wait-after-open routes through the helper.

**Two placements, chosen by where the goto lives relative to the wait.** When a local wrapper owns BOTH (`published-review-modal.deeplink.spec.ts:118`, `published-show-attention.spec.ts:69`, `published-review-modal.interactions.spec.ts:94`), the delegation happens inside the wrapper — one edit, every caller covered, the wrapper's extra assertions untouched. When the wrapper owns only the WAIT and the goto sits in each test (`dev-capture.spec.ts:49` against gotos at 168/227/236; `published-review-modal.reopen.spec.ts:65` and `published-review-modal.closeFreshness.spec.ts:54` against row clicks), the goto sites take the helper call and the wrapper is left byte-unchanged: its now-redundant first wait passes instantly against an already-visible modal, which is why "downstream assertions unchanged" holds literally rather than approximately. Reopen and closeFreshness have no goto to replace, so there the wrapper itself delegates — the wait is the only edit available.

### 4.3 Recovery visibility: shared collector, printed in every member workflow

Today the annotation is operator-visible only in `app-e2e.yml`: the oracle collects from `tests[].annotations` only (double-count trap documented at `scripts/check-app-e2e-executed.mjs:70-71`) and prints one row per recovery plus a total (`scripts/check-app-e2e-executed.mjs:202-203`). Green runs upload no artifact and the list reporter prints no annotations, so an unprinted workflow absorbs recoveries invisibly.

<!-- spec-lint: ignore — scripts/lib/infraRecoveryAnnotations.mjs is created by this spec's implementation -->
- **Extract the collector** to a shared module (e.g. `scripts/lib/infraRecoveryAnnotations.mjs`): `collect(report)` (tests[].annotations only, every occurrence) + `print(recoveries)` (the exact current two-line-shape stdout). `check-app-e2e-executed.mjs` imports it; its stdout stays byte-identical (§1.1 pin). One copy of the read-location semantics, because two copies drift.
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this spec's implementation -->
- **New thin printer** `scripts/print-infra-recoveries.mjs --report <path>`: reads a Playwright JSON report, prints via the shared module, always exits 0 (informational only, never a gate — a recovered run is a green run by design, parent §4.4).
<!-- spec-lint: ignore — scripts/print-infra-recoveries.mjs is created by this spec's implementation -->
- **Wiring rule (the closable statement):** every CI workflow step that executes a member spec emits a JSON report (`--reporter=list,json` + `PLAYWRIGHT_JSON_OUTPUT_NAME`) and is followed by a print of that report's recoveries **that runs unconditionally (`if: always()`) and does not alter the run's outcome**. Spec-review R4 finding 2: without `if: always()` the print step is an ordinary prerequisite-gated step, so a run that RECOVERS and then fails a downstream assertion skips the print entirely — the recovery happened, the list reporter prints no annotations, a failed run's artifact is not where an operator looks first, and outcome (b) of the §6 consequence bound silently loses its annotation. Probed on the live tree: none of the five member workflows contains an `if: always()` step today. The printer already exits 0 always, so `always()` cannot convert a red run to green; the Playwright step's own status remains the job's verdict — through the workflow's existing executed-count oracle where one already consumes that report (`.github/workflows/crew-e2e.yml:188` → `check-crew-e2e-executed.mjs` gains the print duty), through `print-infra-recoveries.mjs` otherwise (`.github/workflows/published-modal-e2e.yml:149`; `.github/workflows/lifecycle-layout-e2e.yml:110`, `:130-133`; the `phantom-gap-e2e.yml` steps running `admin-layout-dimensions.spec.ts`, e.g. `.github/workflows/phantom-gap-e2e.yml:194`; `.github/workflows/admin-layout-e2e.yml:173`). The plan enumerates the exact step list by re-deriving members × workflows from §2.3/§2.4; UNSEEN members have no steps (documented limit 4).

### 4.4 Structural guard: the naked navigation is banned outright

<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this spec's implementation -->
New meta-test (e.g. `tests/ci/_metaModalWaitHelper.test.ts`) with its predicate authored as an importable module (registry-expressible shape from the start, per AGENTS.md convergence criterion 4; enrolled in `tests/mutation/source/registry.ts` at implementation, `pnpm mutation:guards` run and its score plus unaccepted-survivor set reported before the first diff review dispatch).

- **Population:** filesystem walk of `tests/e2e/*.spec.ts` — a new spec is covered by default, never silently exempt. `tests/e2e/helpers/**` is outside the population by construction, which is why the helper's own `page.goto` does not need an exemption.
- **Rule (per SITE, not per file):** a line containing both a `goto(` call and a `/admin` route carrying a `show` query parameter IN ANY PARAMETER POSITION is a violation — matched as `admin\?` followed by a `show=` param on the same line, not the literal `admin?show=`. Spec-review R3 finding 2 probed the narrow spelling: the corpus already contains `/admin?bucket=archived&show=${show.slug}&alert_id=…` (`published-review-modal.interactions.spec.ts:281`), so copying an existing corpus URL into a direct `goto` is ONE ordinary edit that the literal predicate would wave through. The widened form is a strict superset that is IDENTICAL on today's corpus — both spellings return the same 38 goto lines — so it costs zero false positives and closes the case. This is a predicate correction, not recognizer growth: it stays one single-line regex and recognizes no new grammar. There is no import-presence escape: after §4.2 no spec file writes that navigation at all, because Shape G/U route it through the helper and Shape N does not navigate by goto. Spec-review R1 finding 2 refuted the import predicate concretely — `published-review-modal.interactions.spec.ts` adopts at line 103 and its naked goto at line 389 would go quiet — and that class covers every §2.3 file, so the predicate is not repairable by widening the import check.
- **Escape hatch:** an inline `// modal-wait-exempt: <non-empty reason>` on the violating line or the line immediately above. The guard reports file + line + reason for every exemption, and a companion assertion pins the exemption inventory to exactly TWO entries: `published-review-modal.deeplink.spec.ts:298` (the unknown-slug non-member, §2.5) and `published-review-modal.deeplink.spec.ts:344` (a member whose skeleton-tolerant wait cannot be hardened, §2.5 and limit 3b). Adding a third fails the suite until an author edits that pinned inventory deliberately; the accepted limit is a claim someone has to re-make, not a hole that widens silently.
- **Premise proof (executable, per `BL-GUARD-PREMISE-REACHABILITY`):** the suite constructs temp fixture specs and asserts the predicate FLAGS a bare `goto` line; STAYS QUIET on a helper call carrying the same URL text (the false-positive direction); STAYS QUIET on a line carrying a valid exemption comment; FLAGS an exemption with an empty reason; and — the finding-2 regression pin — FLAGS a bare `goto` line in a file that ALSO contains a helper import, which the refuted predicate would have passed. The guard demonstrably discriminates where it runs, not only on today's clean corpus.
- **Deliberate narrowness (the recognizer fence):** the guard covers the single-line navigation shape. The 38 `goto` lines the predicate matches today partition as **36 adopted + 2 exempt** (`published-review-modal.deeplink.spec.ts:298`, a non-member; and `published-review-modal.deeplink.spec.ts:344`, a member this mechanism cannot harden). That is not the same set as §2.3's 37 direct-goto members: `published-review-modal.deeplink.spec.ts:120` is a member whose URL is a variable, so the single-line predicate does not match it and is not expected to — it adopts because §4.2 says so, not because the guard makes it. Spec-review R4 finding 3 caught the earlier phrasing conflating the two sets (probed: §2.1 command (a) returns no multi-line split). A URL assembled on a previous line and passed as a variable, a click-open, and any adversarial spelling are NOT recognized — they file to documented limits 5 and 7, never to guard growth. Repair direction under any review finding of a "missed" spelling is narrowing-or-limit, per the AGENTS.md same-axis-recurrence rule.

### 4.5 Ledger + docs bookkeeping

- `BACKLOG.md` `BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION` graduates to `BACKLOG-archive.md` on merge, recording the census correction (both literal greps mis-censused; the open-site derivation of §2.1 is the durable form, and its (d) testid-keyed half is the part a call-shape grep cannot replace) and the prefetch exclusion.
- This spec gets its `docs/superpowers/specs/ci/README.md` index row.
- The plan carries the invariant-8 closeout marker: `impeccable-gate: N/A — no UI surface`.

## 5. Acceptance criteria

- **AC-1:** `awaitReviewModalOrRecover` and `openShowReviewModalAt` exist with the §4.1 contract; `openShowReviewModal` delegates through both; the §1.1 pins (three unit cases, dead-slug diagnostic, no top-level `@playwright/test` value import) pass unchanged. New unit cases cover `gotoOptions` pass-through, `label` fallback, and — the R2 finding-2 pin, narrowed by R3 finding 1 — a **twin-frame fixture** in which BOTH a skeleton `…-modal` and a loaded `…-modal:has(…-title)` are present, asserting that `LOADED_REVIEW_MODAL` resolves to EXACTLY ONE node. The property under test is the locator's CARDINALITY, not the execution of any branch — spec-review R5 finding 2 correctly caught an earlier phrasing that asked this fixture to prove the post-recovery re-wait, which is inside the boundary branch that limit 2 says has no deterministic test. Cardinality is the right property anyway and is strictly stronger per unit of machinery: the first wait and the post-recovery re-wait use the SAME locator, so proving it matches one node covers both call sites by construction, without either being executed. There is no `readySelector` case, because there is no `readySelector`.
- **AC-2:** All 51 member open sites in §2.3 + §2.4 (re-derived at implementation via §2.1's five commands) engage the helper in their assigned shape (§4.2); downstream assertions unchanged — verified by targeted local playwright runs of all 17 adopted specs under `pnpm heavy` (non-interactive playwright is heavy by invocation shape), green against a freshly seeded database.
<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this spec's implementation -->
- **AC-2b-pattern:** origin (a) and the §4.4 guard predicate resolve the SAME route pattern from ONE exported constant in the predicate module — never two regexes that happen to agree. Spec-review R5 finding 1 measured the cost of two: R3 widened the guard to match a `show` param in any position but left origin (a) on the literal `admin?show=`, so a direct `goto` of `/admin?bucket=archived&show=…` (one ordinary edit from `published-review-modal.interactions.spec.ts:281`, which already holds that URL) was flagged by the guard and never proposed as a candidate — the disposition was not total over an in-domain input. A unit case asserts the two consumers share the constant, so the drift cannot recur.
<!-- spec-lint: ignore — tests/ci/_metaModalWaitHelper.test.ts is created by this spec's implementation -->
- **AC-2b (structural defense for the census vector):** the guard's predicate module ALSO exports a candidate enumeration over the five §2.1 origins — a filesystem walk of `tests/e2e/*.spec.ts` plus a product-surface scan of `app/` and `components/` for `openHref(` call sites, literal `/admin?…show=` hrefs, and `action.href` builders resolved through `lib/adminAlerts/alertActions.ts` — with NO hand-maintained list on either side. `tests/ci/_metaModalWaitHelper.test.ts` then asserts a TOTAL DISPOSITION: every candidate is either a member (carrying its §4.2 shape) or an exclusion (carrying a reason), `members ∪ exclusions = candidates` with no leftovers on either side. An undispositioned candidate fails. A subset assertion would be vacuous against a newly-omitted candidate and a bare equality could never pass (origins (b)-(e) deliberately yield non-members), which is why the disposition — not the member set — is the assertion. Verified red-first: the suite is run against a constructed candidate with no disposition and must fail.
- **AC-3:** The §4.4 guard lands with its five-case executable premise proof (including the import-present-but-naked-goto regression pin), passes on the adopted corpus with exactly the TWO pinned exemptions of §2.2 (`published-review-modal.deeplink.spec.ts:298` and `published-review-modal.deeplink.spec.ts:344`), and its predicate module is enrolled in the source-mutation registry with the score + empty unaccepted-survivor set reported before the first diff review dispatch.
- **AC-4:** The §4.3 wiring rule holds: every workflow step executing a member spec emits a JSON report and prints its recoveries; `check-app-e2e-executed.mjs` stdout is byte-identical under the collector extraction (`tests/ci/appE2eAnnotationPrint.test.ts` green unchanged); the new printer has a vitest case (child-process, synthetic report: prints rows from `tests[].annotations` only, exactly-once on the duplicated-location case, plus the total line — red first).
- **AC-5:** No behavior change to any workflow's gating: printers and oracle print duties are informational; no retries flags added or removed; no run-step file list changes.
- **AC-6:** Ledger graduation + README index row + review-rounds corpus rows land with the arc.

## 6. Consequence bound, probe domain, threat fence (for review dispatches)

- **Consequence bound:** for every one of the **51 enumerated member open sites in §2.3 + §2.4**, the post-open wait either (a) yields the ready content, (b) recovers exactly once with a surfaced `infra-recovery` annotation, or (c) fails loudly naming the boundary and the `show_review_snapshot_failed` signature. There is no silent-pass path; a deterministic defect still fails on the post-reset re-wait. A conservative failure plus a surfaced annotation is a DOCUMENTED LIMIT, not a finding. The bound ranges over that finite enumerated set, settled by re-running §2.1's five commands — never over all imaginable specs or navigation spellings.
- **PROBE DOMAIN:** `tests/e2e/*.spec.ts` (member census + guard population) and the member rows of `.github/workflows/*.yml` (§4.3 step list). An admissible probe is an input drawn from those files, or one ordinary edit away from one. A constructed spec exercising a spelling absent from the corpus files to documented limits, not to a finding.
- **Threat fence:** transient infrastructure faults (gateway-502 class) on CI-hosted local Supabase, and ordinary authoring mistakes by a contributor copy-pasting an existing pattern. Adversarial obfuscation, production outages, faults that survive one reset, and novel hand-rolled navigation spellings are out of scope — the last two deliberately fail the test and file to limits, respectively. Every admissibility judgement above cites this fence and the probe domain together: a finding must name the corpus input it is drawn from.

## 7. Documented limits

1. **Per-peer reachability stays INFERRED.** No member has its own CI failure sample; the class mechanism is the parent's evidence and the posture is uniform hardening. The entry was filed with exactly this declaration; this spec keeps it honest rather than manufacturing probes.
2. **The recovery branch has no deterministic test** (inherited, parent §7 limit 2 — the RPC is server-side, out of `page.route()` reach). Steps that ARE deterministic (guard, starve error, collector, printer) are tested; the recovery path's proof remains the annotation trail on real occurrences. This limit and AC-1 are consistent by construction and were made so deliberately (R5 finding 2): AC-1 asserts a locator's cardinality, which needs no branch execution, and asserts nothing about the boundary branch running. No acceptance criterion in this spec requires deterministic traversal of that branch.
3. **`published-review-modal.prefetch.spec.ts` keeps the starve exposure.** Its request-count assertions are incompatible with a loader re-run (§2.5). Cost: its historical starve odds are unchanged for one spec; a starve there fails with the bare Playwright timeout, and the fix is a redesign of its counting windows — out of scope, reconsidered only if that spec actually flakes on this signature.
3b. **Two member sites keep the starve exposure because the mechanism cannot reach them.** `published-review-modal.deeplink.spec.ts:344` and `published-review-modal.realtime.spec.ts:913` wait on a selector the Suspense skeleton also matches, so a modal-or-boundary race resolves on the skeleton and would hide the fault rather than surface it (§2.5). Cost: a boundary at either site still fails, but as the bare downstream timeout it fails today — the deeplink site at its focus poll, the realtime site at its freshness evaluate — with no annotation and no named signature. The repair is a redesign of what those two tests wait on, which is a change to their assertions and therefore out of this arc's scope; filed as `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` (disposition reason (c) — a redesign of a surface this PR does not otherwise touch). Reconsidered if either spec actually flakes on this signature.

4. **UNSEEN members get local-only value.** `admin-parse-panel`, `dev-capture`, `warning-panel-polish`, `published-show-attention` run in no workflow (`tests/ci/_metaE2eWorkflowCoverage.test.ts` UNSEEN rows); adoption hardens local runs and any future wiring, but no CI log will print their recoveries until they are wired — a wiring decision this arc does not own.
5. **The guard recognizes the single-line goto shape only.** It matches a `/admin` route with a `show` param in any position (R3 finding 2), but a URL assembled on one line and passed to `goto` on the next still evades it, as does a `show` value delivered through a fragment or a differently-spelled route. All three are probed absent from today's corpus; a future author who writes one gets the helper's header comment and this spec, not a guard failure. Widening the recognizer to track variable assignment is explicitly refused (§4.4 fence).
6. **The census's link-activation half is testid-keyed.** A test that reached a dashboard row via `getByRole("link", …)` instead of the `shows-table-row-*` / `needs-attention-link-*` testid would be invisible to §2.1 command (d). Probed absent (four `getByRole("link"…)` hits in the corpus, none an admin row); if one is ever authored, the derivation gains a fifth command rather than the guard gaining a rule.
7. **Total disposition closes candidate omission, NOT origin omission — and the guard's own predicate still sees `goto` lines only.** Two distinct residues, kept distinct because spec review round 4 correctly caught the earlier text blurring them. (a) AC-2b makes a new candidate from any of the five §2.1 origins fail until someone dispositions it, so §2.4's non-goto sites ARE machine-covered against silent omission. (b) A load reached by some means none of the five origins produces is invisible to that enumeration, and nothing here changes it; the only mechanism that would is the runtime fixture rejected as §3 approach 3, whose blast radius exceeds the value. (c) Separately, the §4.4 GUARD — the thing that fails a naked re-authoring — matches single-line `goto` lines only, so a new click-open is dispositioned by (a) but not blocked by the guard. Accepted, and the asymmetry is deliberate: disposition asks 'has a human decided about this site', the guard asks 'did someone re-author the exact shape we banned'.
8. **Recovery-print coverage is workflow-step-enumerated, not workflow-structural.** A future workflow that newly runs a member spec must copy the reporter + print pattern; nothing machine-checks that. Accepted: a structural workflow-parser guard is a bigger recognizer than the value at stake (the run still passes and the annotation still exists in the report).

## 8. Invariant-8 disposition

No UI surface: changes land in `tests/`, `scripts/`, and `.github/workflows/`. The plan closeout carries `impeccable-gate: N/A — no UI surface`.
