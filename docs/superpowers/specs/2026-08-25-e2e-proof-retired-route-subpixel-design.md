# Re-target the empty-state proof, and settle the tap-target read before measuring

**Date:** 2026-08-25
**Branch:** `fix/e2e-proof-retired-route-subpixel`
**Closes:** `BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE` (BACKLOG.md:752), `BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE` (BACKLOG.md:701)
**Facing:** product
<!-- spec-lint: not-ui — this spec CHANGES no UI file. Its diff is tests/**, .github/workflows/**, playwright.config.ts and docs/**; every components/ and app/ path it cites is a READ-ONLY reference to the surface a test asserts against. Section 4 of the plan records the one product-code edit that was considered and declined, and the reason. -->

**Files no new ledger row.** Eric's directive of 2026-08-25 binds this arc: findings are repaired in this PR under the class-sweep default, or recorded as documented limits on the owning surface. No `BL-`/`DEF-` row of any facing is minted here.

---

## 1. What the two rows share

Both rows describe a real-browser proof that reports something other than the contract it was written to guard. One waits on identities the product stopped rendering, so it fails everywhere and runs nowhere. The other reads a correct layout at a moment when the browser has not finished drawing it, so it reds on a page that is not wrong. In both cases the assertion text is fine and the surface underneath it moved.

Neither repair loosens anything. The empty-state spec gets re-pointed at identities that exist; the tap-target spec keeps all six of its half-pixel equalities and stops reading during an entrance animation.

---

## 2. Corrections to the rows' own text

Both rows misstate a mechanism. Both corrections make the finding stronger, and the spec uses the corrected version throughout.

### 2.1 Row 2 understates its scope (empty-state)

The row says the defect is the retired route. Verified against the live tree on 2026-08-25, the route is one of four dead identities:

| Identity | Referenced at | Defined in product code |
|---|---|---|
| `venue-tile` | `tests/e2e/empty-state-reachability.spec.ts:155` | nowhere |
| `show-status-tile` | `tests/e2e/empty-state-reachability.spec.ts:173` | nowhere |
| `tile-grid` | `tests/e2e/empty-state-reachability.spec.ts:198`, `tests/e2e/empty-state-reachability.spec.ts:206` | nowhere |
| `lodging-tile` | `tests/e2e/empty-state-reachability.spec.ts:199` | nowhere |
| `stale-footer` | `tests/e2e/empty-state-reachability.spec.ts:221` | `components/shared/StaleFooter.tsx:98`, `components/shared/StaleFooter.tsx:114` (alive) |

The spec's own comment at `tests/e2e/empty-state-reachability.spec.ts:159-161` cited a VenueTile module that no longer exists; the `components/crew/` tree replaced it and the old `components/tiles/` directory now holds one file, `OpeningReelVideo.tsx`, so that citation was dead too. `tests/e2e/crew-page.spec.ts:147-148` names those testids as retired by the six-section redesign, and `tests/e2e/crew-page.spec.ts:1602` calls out "the retired flat `tile-grid` body".

Re-targeting the route is therefore necessary and not sufficient. Three of the four cases must be re-expressed against the redesigned CrewShell.

### 2.2 Row 1 states a false mechanism for its second half (dark-on-main)

The row says "`lifecycle-layout-e2e` is path-filtered". It is not. `.github/workflows/lifecycle-layout-e2e.yml:14-16` is `on: pull_request:` with no `paths`, plus `workflow_dispatch:`, and the header comment at `.github/workflows/lifecycle-layout-e2e.yml:4-6` records that the absence of a filter is deliberate, ratified over four spec-review rounds. The job is dark on `main` because it carries **no `push:` trigger at all**, so it never runs there under any circumstance. Only `quality.yml:3-4`, `unit-suite.yml:3-4` and `x-audits.yml:3-4` carry `push: branches: [main]`.

Section 5 records the decision this correction leads to, which is not the one the row's wording implies.

### 2.3 Row 1's suspect is wrong, and the measurement says so

The row nominates the tolerance: "whether the invariant that actually matters can be asserted without an exact-equality claim about padding". Section 3 measures the quantity and the tolerance is not the defect. The read is.

---

## 3. Evidence: what the tap-target measurement actually does

The row's own first scheduled step is "re-run the case N times on one head under CI posture to size the flake rate before touching the assertion". Both runs below are on branch head `cd493bbdb`, `CI=1 BASELINE_SERVER_ONLY=1`, `--project=mobile-safari --retries=0`, one worker, cold `pnpm build`, wrapped in `pnpm heavy`.

### 3.1 Sizing run: the flake reproduces locally

`--repeat-each=20 -g "sites 6/7"`: **19 passed, 1 failed**. The failure:

```
Error: cell top padding must be 8px (py-2)
Expected: 8
Received: -0.567138671875
```

A negative top padding is not a rasterisation drift. The eyebrow's measured top sits above its own cell's top, which no font metric can produce.

### 3.2 Characterisation run: the value is a step function of time, not a distribution

The measurement helper was temporarily instrumented to take 14 reads at 40ms spacing per run, recording top padding, bottom padding and the dead-space total. `--repeat-each=40`. 39 runs completed, 546 reads:

- **537 of 546 reads are exactly `8.000 / 8.000 / 34.000`.** Not close to canonical. Identical.
- **9 reads are non-canonical, and every one is at read index 0, 1, 2 or 3**, that is within 120ms of `[data-step3-review-panel]` appearing. Indices 4 through 13 are canonical in all 39 runs.
- **The dead-space total is `34.000` in 546 of 546 reads.** The `tests/e2e/tap-target-inline-controls.layout.spec.ts:429` aggregate never moved. Only the split between top and bottom padding did.
- 3 of 39 runs had a non-canonical FIRST read, a **7.7%** first-read flake rate, consistent with the 1-in-20 sizing run.

The nine non-canonical values:

```
8.000/8.222   8.000/16.018   -0.290/16.290   0.249/15.751   8.000/9.027
6.450/9.550   7.865/8.135    7.114/8.886     7.140/8.860
```

Six of the nine sum to exactly 16.000, which is two edges of `py-2`: the cell box is right and the content is displaced within it. The three that do not (`16.222`, `17.027`, `24.018`) are the other shape, where the top padding reads a clean `8.000` and the bottom absorbs the whole discrepancy. The `8.000 / 9.027` pair reproduces the CI signature the row recorded (`9.5096435546875` against an expected `8`, top passing, bottom failing).

### 3.3 The mechanism

`[data-step3-review-panel]` carries a CSS entrance animation. At the 390px mobile-safari viewport the rule is `app/globals.css:977-979`:

```css
[data-step3-review-panel] {
  animation: step3-details-sheet-rise var(--duration-normal) var(--ease-out-quart);
}
```

`step3-details-sheet-rise` is `translateY(100%)` to `translateY(0)` (`app/globals.css:917-924`) and `--duration-normal` is `220ms` (`app/globals.css:285`).

`openStep3Modal` returns as soon as `page.waitForSelector("[data-step3-review-panel]")` resolves (`tests/e2e/helpers/devCaptureStaged.ts:749`), which is the moment the panel enters the DOM, which is when the animation **starts**. Every measurement in `tests/e2e/tap-target-inline-controls.layout.spec.ts` is therefore free to land inside a 220ms window during which WebKit's `getBoundingClientRect` returns rects that are internally inconsistent between a transformed ancestor and its descendants. The observed bad-read window, 0 to 120ms, sits inside 220ms; the observed clean window, 160ms onward, sits after it.

The spec has no barrier of any kind between the modal opening and the first read: no `document.fonts.ready`, no `waitForLoadState`, no animation wait. Confirmed by grep over the whole 765-line file.

### 3.4 What this rules out

The row's font-rasterisation hypothesis predicts a value that varies continuously with runner load and is equally likely on any read. The measurement shows a value that is bit-identical on 537 of 546 reads and wrong only inside a bounded window after a known animation starts. The tolerance is not implicated: widening it to accept `-0.290` would accept a genuine 8px padding regression as well.

---

## 4. Design, row 1 (tap-target)

### 4.1 The repair is a barrier, not a tolerance

**Every one of the six half-pixel equalities stays exactly as written.** `f816d2ca8` tightened this file deliberately and the tightening is correct. What changes is when the read happens.

`openStep3Modal` (`tests/e2e/helpers/devCaptureStaged.ts:735`) gains, after `waitForSelector` and before it returns:

1. **An entrance-animation settle.** Await every running animation on the panel and its subtree via `getAnimations({ subtree: true })` and `Promise.all(...map(a => a.finished))`, bounded by an explicit timeout so a hung animation fails loudly instead of hanging the case. This is exact rather than a sleep: it waits for the specific thing the evidence names, and it costs nothing once the animation has already finished.
2. **`await document.fonts.ready`.** Not redundant with (1) and not the fix for the measured defect. It is the corpus rule for any navigate-then-measure caller (`tests/e2e/_metaFontWaitCoverage.test.ts:1-10`), it closes the separate fallback-frame arm that guard exists for, and it is one line.

**Placement is the point.** The barrier goes in the helper that opens the animated panel, not at the call sites, so it is a derived cover in the sense AGENTS.md requires: every present and future caller of `openStep3Modal` inherits it, and a new measurement added to any of those specs cannot forget it. This mirrors `rectOf` in `tests/e2e/crew-page.spec.ts:225-244`, whose header states the same reasoning ("placed on `rectOf` itself rather than on the call sites so the gate is a DERIVED cover").

`openStep3Modal`'s other callers are `tests/e2e/step3-review-modal.*.spec.ts`. They gain the same barrier. The change can only make them later by at most one animation duration and cannot make them fail: a settled read is the read they already expect on 98% of runs.

### 4.2 Guarding the barrier so it cannot be silently removed

A barrier with no test is a comment. The premise test asserts, in a real browser, that `openStep3Modal` does not return while an entrance animation is running on the panel:

```
await openStep3Modal(page, dfid);
const running = await page.evaluate(() =>
  document.querySelector("[data-step3-review-panel]")!
    .getAnimations({ subtree: true })
    .filter((a) => a.playState === "running").length);
expect(running, "openStep3Modal must not return mid-entrance").toBe(0);
```

**Failure mode this catches:** someone deletes the settle from the helper, or the panel gains a second entrance animation on a descendant that the settle's subtree walk does not reach. Before the barrier lands this assertion fails; after it, it passes. It is not a "the function was called" test: it reads the browser's own animation registry after the helper has returned.

**The premise must be live.** A barrier test whose premise is false where it runs passes unconditionally forever, which is the guard-premise failure AGENTS.md names. So before the barrier assertion the test reads the panel's own computed style and requires that an entrance animation is DECLARED at this viewport:

```
const animationName = await panel.evaluate((el) => getComputedStyle(el).animationName);
expect(animationName, "premise: the panel must declare an entrance animation, ...").not.toBe("none");
```

Reading the declaration from CSS rather than sampling a `getAnimations()` count mid-open is deliberate: the computed style still reports the declaration after the animation has finished, so the premise is observable at the same moment as the barrier and needs no racing sample. A future CSS change that drops the entrance, or a runner forcing `prefers-reduced-motion` where `app/globals.css:993-997` sets `animation: none`, turns this red and says the barrier guards nothing, instead of leaving a green test that proves nothing.

### 4.3 What is deliberately not changed

- No tolerance, on any assertion, in any file.
- No change to `--retries=0` (`.github/workflows/lifecycle-layout-e2e.yml:177-179`) or its execution oracle (`.github/workflows/lifecycle-layout-e2e.yml:195-200`).
- No change to `CONTACT_CELL_DEAD_SPACE_PX = 34` (`tests/e2e/tap-target-inline-controls.layout.spec.ts:61-62`), which the measurement shows was never wrong.

---

## 5. Design, row 1 second half: the dark-on-main window

**Decision: no `push:` trigger is added. The window is recorded as a documented limit in the workflow header, with the corrected mechanism.**

Reasoning, which the row could not reach because it had the mechanism wrong:

The job fires on **unfiltered** `pull_request:`. Every change that reaches `main` therefore ran this spec on its own PR head before merging. The row's stated fear, "a tightened assertion can sit latent on `main` and first surface on whichever unrelated PR next touches a matching path", assumes a path filter that does not exist. With no filter, there is no matching-path lottery: the assertion runs on the PR that tightened it.

What the row actually observed is not a coverage hole. It is an **attribution** problem: an arc with no rendering code in its diff ate a red produced by a flake, spent a diagnosis cycle, and reran. The fix for attribution is to remove the flake, which section 4 does.

The residual gap is genuine but narrow: `main` after a merge is not byte-identical to the PR head that was measured, so an interaction between two independently-green PRs would not be observed until the next PR. Closing that costs a full `pnpm build` plus four e2e steps on every merge to `main`, on a job that is advisory and in no required context set, producing a signal with no owner. That trade is not worth taking on the evidence available: zero post-merge-only reds have been observed on this job.

**Re-file trigger, recorded in the workflow header:** if a red on this job is ever traced to an interaction present on `main` but absent from both contributing PR heads, add `push: branches: [main]` and name that run.

---

## 6. Design, row 2 (empty-state)

### 6.1 Fixture isolation, and why the old shape could not work at all

The retired spec mutated the shared Waldorf seed and then navigated. That shape is dead, and not because of the route.

`getShowForViewer` reads through `cachedShowData` (`lib/data/getShowForViewer.ts:961`), an `unstable_cache` entry tagged per show with `revalidate: 300` (`lib/data/showCacheTag.ts:6`, tag at `lib/data/showCacheTag.ts:16`). Only the app's own write paths bust that tag (`revalidateShow`, `lib/data/showCacheTag.ts:34`). A test that writes to Postgres directly leaves the cache untouched, so the next render serves the pre-write projection for up to five minutes.

**Measured on run 2 of this rewrite,** after the route and identity were both correct: emptying `shows.dates` left the schedule section still rendering its day cards, and deleting the show's reservations left the hotels card in place. Nothing about those assertions was wrong. The page had simply not read the database.

So each case **copies the seed show** into a fresh row with its own `id`, `slug` and `drive_file_id`, applies its mutation to the copy before the first navigation, and the suite deletes every copy in `afterAll`. A fresh show id is a fresh cache key, so the first render is necessarily the state the test just wrote. Both-direction cases make two copies rather than mutating one twice, which is also what makes the present and missing halves independent rather than sequential.

Two details the run surfaced and the implementation carries:

- The share token is **minted by the database** on show insert (`show_share_tokens` is keyed by `show_id`). An explicit insert collides with it: `duplicate key value violates unique constraint "show_share_tokens_pkey"`. The helper reads the minted token instead of racing it.
- `hotel_reservations` rows are copied **opt-in**, because whether they exist is exactly what category 3 varies.

This removes every write to the shared seed, so the suite stops being a contender for the single-writer contention behind `workers: 1` (`playwright.config.ts:35-49`).

### 6.1b The lock has its own executable proof

`tests/help/walker-routes.test.ts` is the guard normally cited for locked-table fixture writes, and it cannot prove this one. It recognizes PostgREST mutation syntax, so it is equally green whether the SQL the helper emits holds the advisory lock or not. Probed by deleting the lock line: `currentWalkerHits: 0`, `mutantWalkerHits: 0`, `lockPresentCurrent: true`, `lockPresentMutant: false`. Same verdict, opposite safety.

Invariant 2 requires tests to assert the lock is HELD, so the transaction shape is exported (`lockedStatement`, `copyShowBody`, `deleteShowBody`) and proved without a database in `tests/e2e/helpers/lockedShowCopy.unit.test.ts`. The analyzer there classifies statement ORDER rather than containment, because containment is satisfied by a lock placed after the write. It carries four positive controls, one per known failure of this shape: the lock deleted, the lock after the write, a commit between the lock and the write, and a nested second acquisition. The first three are the three that cost arc C review rounds 4, 5 and 6 one at a time while a lexical guard stayed green (`tests/e2e/helpers/lockedCrewRestriction.ts` header).

### 6.2 Route and auth

`tests/e2e/empty-state-reachability.spec.ts:154` becomes the crew route with a resolved share token, copying the working pattern in `tests/e2e/crew-page.spec.ts`: share-token lookup from `show_share_tokens` (`tests/e2e/crew-page.spec.ts:248-263`), goto of the form `/show/${slug}/${shareToken}?s=${section}` with a status assertion (`tests/e2e/crew-page.spec.ts:364-367`). `shareToken` is a required path segment (`tests/e2e/crew-page.spec.ts:152-153`).

**The viewer becomes `ADMIN_FIXTURE`, and this is measured rather than chosen.** The first run of the rewrite kept the old spec's `NON_ADMIN_CREW_FIXTURE` plus its per-suite `crew_members` LEAD row. All four cases failed at `crew-shell` after a bounce through `/api/auth/picker-bootstrap`. The cause is recorded in `playwright.config.ts:65-73`: over plain http WebKit refuses to STORE the server's `__Host-`-prefixed Secure picker envelope, so a crew identity never persists on the mobile-safari project and the shell never mounts. `crew-page.spec.ts:1347-1349` records the working alternative: the `admin` arm of `resolveShowPageAccess` renders the full CrewShell for the seeded crew route regardless of the picker cookie.

None of the four §8.3 contracts is viewer-scoped. Dates, the venue power row, the hotels card and the stale footer are all show-level, so the admin arm observes exactly the behaviour a crew viewer would. The per-suite `crew_members` row is therefore deleted along with the identity that needed it, which removes one seed mutation from a suite that already writes four.

### 6.3 Case-by-case re-expression against live identities

Each case navigates to the section that renders its field, asserts the section root, and then asserts the §8.3 contract on an identity the product actually emits.

**Category 1, required-field-missing.** `shows.dates` emptied. Section `schedule`. `components/crew/sections/ScheduleSection.tsx:315-317` renders `<EmptyState label="Show dates haven't been confirmed yet." />` when `visibleDays.length === 0`, inside the still-rendered section, which is exactly the §8.3 category-1 idiom: a required field missing inside a rendered surface.

Assertions: with the template's own dates the placeholder is absent and `day-card` is visible; on a copy with the dates emptied the placeholder is visible, carries `data-variant="required-field"` (the atom's own discriminant, `components/atoms/EmptyState.tsx`), and `day-card` count is 0. A fixture premise asserts the template carries show days at all, so a seed that stops carrying them fails by name rather than turning the case green for the wrong reason.

**"Emptied" is a measured shape, not an obvious one.** Two candidates were run and rejected. `dates: {}` renders HTTP 200 with no `crew-shell` at all, because `getShowForViewer` casts that jsonb rather than validating it and the shell faults above the section's own try/catch. `showDays: []` alone still renders four day cards, because `aggregateDays` reads `travelIn`, `set`, `showDays` and `travelOut` (`lib/crew/agendaDisplay.ts:120-123`) and travel and set days are days too. The patch therefore keeps the template's dates object and empties exactly those four fields, which is the field list the function itself defines.

**This is a change of surface from the row's own description, and the reason is a finding.** The row and the old spec put category 1 on the venue tile. Probed against the live tree on 2026-08-25, that idiom no longer exists there: a null `venue.name` reflows the row out through `KeyValueRows`' sentinel-hiding (`components/crew/primitives/KeyValueRows.tsx:67`), which is category-2 behaviour, and the only `EmptyState` in `VenueSection.tsx` is the SECTION-level one at `VenueSection.tsx:471-475` gated on `allHidden` (`VenueSection.tsx:319`), which the seed's seven diagram objects keep false. Every `<EmptyState>` under `components/crew/**` is section-level except `ScheduleSection.tsx:316`.

So the redesign left §8.3's per-field placeholder reachable on exactly one crew surface. That is recorded as a **documented limit** in section 7.4 and in the e2e spec's own header, and category 1 is proven where the idiom lives. Per Eric's directive it files no ledger row.

**Category 2, optional-field-missing.** `event_details.power = 'TBD'`. Section `venue`. `components/crew/sections/VenueSection.tsx:189-190` routes the raw value through `shouldHideGenericOptional` (`lib/visibility/emptyState.ts`), and `components/crew/sections/VenueSection.tsx:290` pushes the `Power` fact row only when the result is non-null.

The current assertion is that the string `TBD` is absent from the tile's text. That is weak: it passes if the whole section fails to render. The replacement asserts the **row identity**, not the sentinel: with `power='TBD'` the fact row keyed `Power` is absent, and with `power` set to a real value in the same test the row is present and carries that value. That is the null case and the boundary in one, and it fails if the section is blank.

**Category 3, whole-tile-missing.** Two copies of the same template, one made WITH the show's `hotel_reservations` rows and one made without. Section `travel`. `hasHotels` (`components/crew/sections/TravelSection.tsx:390`) is true on the first and false on the second, so the hotels card at `components/crew/sections/TravelSection.tsx:606` renders and then does not.

**Not by deleting and restoring rows on one show, and not by viewer identity.** Deleting on a rendered show is invisible for the cache reason in section 6.1, so the case varies the copy instead: `makeCopy`'s `withReservations` flag decides whether the reservation rows are cloned, and nothing is ever deleted or restored mid-case. The viewer route is also closed off: the redesign's Travel section renders EVERY `hotelReservations[]` entry (`components/crew/sections/TravelSection.tsx:15`, `components/crew/sections/TravelSection.tsx:387`), not the viewer's own, so "the viewer is not named on a reservation" changes nothing about what renders and would have passed for the wrong reason under any viewer.

Assertions: on the with-reservations copy `travel-hotels` is visible; on the without copy its count is 0 and the section is still alive, that is `travel-getting-there` or the section-level `section-empty` (`components/crew/sections/TravelSection.tsx:827`) is present. Without that last clause the case passes on a section that threw. A fixture premise asserts the template carries a reservation at all.

**Category 4, stale-sync.** The only case whose identity survived. `last_checked_at` older than 6h with `last_sync_status='ok'`; `stale-footer` visible with `data-tier="red"` and `data-code="SYNC_DELAYED_SEVERE"` (`components/shared/StaleFooter.tsx:98`, `components/shared/StaleFooter.tsx:114-116`).

It gains a fresh-state half, and the contrast is on the TIER rather than on the element's absence. `selectCodeAndTier` returns `{code: null, tier: "subtle"}` under ten minutes (`StaleFooter.tsx:80-81`) and the code-less branch still emits the element (`StaleFooter.tsx:96-107`), so a recently-checked show has a footer, just not a red one. Asserting count 0 there was run and failed against exactly that subtle-tier footer. The case now asserts `data-tier="subtle"` with no `data-code` on the fresh copy, and red plus `SYNC_DELAYED_SEVERE` on the stale one.

### 6.4 The four `toHaveScreenshot` assertions are deleted

The byte-comparison discipline in AGENTS.md forbids pixel baselines on a native Linux runner, and `app-e2e.yml` is native. Moving the spec to the pinned-Docker screenshots job was the alternative; it is rejected because this spec mutates the shared Waldorf seed in `beforeAll`/`beforeEach` and that job is not built for a live-DB writer, and because the §8.3 contract is a DOM contract, not an appearance contract. Every category's real invariant is expressible as behaviour, and section 6.2 expresses it.

The four `*-mobile-safari-darwin.png` baselines under `tests/e2e/empty-state-reachability.spec.ts-snapshots/` are deleted with them. A `-darwin.png` baseline is by construction unusable on a Linux runner, so nothing is lost that was ever used in CI.

### 6.5 Project membership: mobile-safari only

`playwright.config.ts:83` (mobile-safari) and `playwright.config.ts:97` (desktop-chromium) both name this spec. The desktop-chromium alternative is **removed**.

Reason: §8.4 makes the crew page mobile-primary, and section 6.2's admin arm is what renders there. Running one behaviour suite twice buys no coverage while doubling the fixture shows it creates. (An earlier draft also argued shared-seed contention; section 6.1's per-test copies removed that argument entirely, since the suite no longer writes the shared seed at all. It is recorded here so the review does not credit a reason that no longer applies.) `playwright.config.ts:35-49` records that suites sharing the Waldorf seed are the reason `workers: 1` exists, and `tests/e2e/crew-page.spec.ts:161-165` gates itself to mobile-safari for the same "keeps the seed reads single-writer" reason. Running one behaviour spec twice against one mutable seed buys no coverage and doubles the mutation traffic. §8.4 makes the crew page mobile-primary, so mobile-safari is the arm that matters.

This is a narrowing, and it is stated here so the review does not read it as scope creep.

### 6.6 Wiring, and the allowlist row

The spec joins the `app-e2e.yml` batch run step at `.github/workflows/app-e2e.yml:188`, whose file list is the authority for membership. The invocation there is `--project=mobile-safari --project=desktop-chromium`; naming the spec in the file list plus removing it from the desktop-chromium `testMatch` gives it exactly one project without a second run step.

Its `UNSEEN` row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:163` is then removed. This is mechanically forced rather than remembered: the shadowing assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:296` fails on an allowlisted spec that has become covered. Wiring and de-allowlisting cannot drift apart.

**The order matters and is a hard gate.** The row comes off only after a real run shows all four cases passing. A wired-but-failing spec is worse than an allowlisted one, because it reds every PR.

---

## 7. Class sweep and dispositions

Both rows sit on shapes that recur. Per the class-sweep default every instance is repaired in this PR unless it is recorded as a documented limit with a reason. No ledger row is filed for any of them.

### 7.1 Dead e2e identities: swept, and the class is closed

A mechanical sweep extracted every testid referenced from `tests/e2e/**` and every testid defined under `app/`, `components/`, `lib/`, including template-literal prefixes, and differenced them. Result: **four dead ids, all in the retired flat-tile family, and `empty-state-reachability.spec.ts` is the only broken spec.**

One peer turned up and **is repaired in this PR**, and it was larger than the sweep first reported. `tileGridColumnCount` (at line 85 of the now-deleted e2e layout helper) waits on `tile-grid` and has zero callers. Checking its file rather than only its function showed the whole module is dead: `gotoCrewPage` (line 50 of the same file) navigates `/show/${slug}?crew=${crewId}`, which is BOTH the retired slug-only route and the retired `?crew=` identity mock, and that helper file has **no importers anywhere in the repo**. All three exports are unreferenced. The file is deleted rather than the one function, which is the difference between repairing the instance and repairing the shape.

Ruled out, and recorded so a reviewer does not re-raise them:

- `tests/e2e/crew-page.spec.ts:1605` references `tile-grid` in a deliberate `toHaveCount(0)` negative assertion pinning that the retired body is gone. Correct as written.
- `lodging-tile` and `tile-grid` also appear in comments at `components/atoms/Section.tsx:87` and `components/shared/TileServerFallback.tsx:50`. Prose, not selectors.
- Ids composed at runtime (`mi11-approve`, `crew-warn-stack-*`, `schedule-day-<date>`, `-section-crew-panel-card`, `-review-footer`, `published-show-review-*`) are alive and only look dead to a naive grep.

### 7.2 Half-pixel equalities on measured boxes: reframed, not swept into a widening

A sweep of the whole e2e corpus for exact-equality assertions over `getBoundingClientRect` arithmetic returns a large population, on both projects. Section 3 changes what to do with it: the defect class is **not** "an exact equality on a measured box". It is **"a read taken before the surface has settled"**. Loosening tolerances across that population would degrade a set of guards that are, on the evidence, correct 537 times out of 546.

Peers on mobile-safari with the same read-timing exposure were checked against their own readers. `tests/e2e/crew-page.spec.ts` and `tests/e2e/crew-layout-dimensions.spec.ts` already settle every rect through `rectOf` (`crew-page.spec.ts:225-244`), which is the pattern section 4.1 follows. They are not instances.

### 7.3 The font-wait guard's blind spot: documented limit, in the guard's own header

`tests/e2e/_metaFontWaitCoverage.test.ts` is the corpus's navigate-then-measure guard. Two measured properties limit it, and both are recorded in that file's header by this PR, with the probe output:

1. **`analyzeSource` is single-file** (`tests/e2e/_fontWaitCoverage.ts:573-582` builds a `noResolve` program over one source). A spec that navigates through a helper has no `page.goto` of its own, so no navigation site is found and the file reports zero problems. `tap-target-inline-controls.layout.spec.ts` is exactly that shape: it navigates through `openStep3Modal`, and the analyzer reports nothing for it. Probed over `tests/e2e/helpers/**`, five exported helpers navigate (`driveToState`, `openShowReviewFrameAt`, `openShowReviewModalAt`, `openStep3Modal`, `signInAs`), and **30 specs call one and also read geometry**. (A sixth, `gotoCrewPage`, is deleted by this PR: see section 7.1.)
2. **`CALLERS` at `tests/e2e/_metaFontWaitCoverage.test.ts:31-58` is hand-enumerated**, so a spec absent from that list is unchecked whatever the analyzer would say about it. Probed by running `analyzeSource` over all 104 e2e specs: **10 files report live problems and none of them is in `CALLERS`** (`admin-layout-dimensions`, `admin-lifecycle-layout`, `admin-nav-layout-dimensions`, `deep-link-walker`, `help-mobile`, `help-typography`, `notify-toggles`, `sign-in-page`, `stage-restricted-crew-schedule`, `telemetry-layout`).

**Why this is a documented limit and not work in this PR.** Repairing it means either enrolling ten specs, each of which then needs a real e2e run to confirm the added await did not move its timing, or teaching the analyzer to resolve imports and deciding per helper whether its navigation is the one being measured (`signInAs` navigates to an auth endpoint that is never the measured document, so a naive rule would fire on nearly every spec in the corpus). Both are a redesign of a surface this PR does not otherwise touch, which is class-sweep exception (c). Under Eric's directive it files nowhere; it is written into the guard header where the next person to touch that guard will read it, with the two probe commands that reproduce both numbers.

**This PR does not add `tap-target-inline-controls.layout` to `CALLERS`.** Doing so would enrol a file the analyzer cannot see a navigation in, producing a row that passes unconditionally forever. That is the tautological-guard failure the AGENTS.md guard-premise rule names. The spec gets a real barrier and a real premise test (section 4.2) instead, and the guard header records why the row is absent.

### 7.4 The venue surface no longer honours §8.3's required-field rule, and that is a recorded limit, not a resolved question

**State it plainly, because an earlier draft of this section did not.** Master spec §8.3 says: "Required fields missing (e.g., venue name): the section renders a ... placeholder, not an empty card." Venue name is §8.3's own example. The redesigned crew page does not do this. A missing `venue.name` reflows out through `KeyValueRows`' sentinel-hiding (`components/crew/primitives/KeyValueRows.tsx:67`), which is the treatment §8.3 reserves for OPTIONAL fields, and the only `EmptyState` in `components/crew/sections/VenueSection.tsx` is the section-level one at `components/crew/sections/VenueSection.tsx:471-475` gated on `allHidden` (`components/crew/sections/VenueSection.tsx:319`). With any other venue content present, the seed's seven diagram objects included, `allHidden` is false, so a crew member sees a Venue section carrying diagrams, no venue name, no address, and no signal that anything is missing.

That is a §8.3 violation on a shipped, crew-facing surface. It is NOT permitted by §8.3, no amendment covers it, and this spec does not claim otherwise. An earlier draft said to revisit "if §8.3 is amended", which had the direction backwards: §8.3 already requires the behaviour and the product is the side that drifted.

**Disposition, and whose call it was.** Repairing it is a change under `components/`, which arms invariant 8's impeccable dual gate, and the placeholder's wording is itself an open product question: §8.3's literal copy is "Doug hasn't filled this in yet", and that exact sentence was rejected during a design review for naming Doug to the crew, with `components/atoms/EmptyState.tsx` now defaulting to `Information missing.` and every surface passing its own override. So the rule is live and its wording was overtaken, and nothing on record says which the venue case owes.

Because that is a scope-and-copy decision an e2e arc cannot settle, it was put to the owner rather than decided here. **Eric ruled on 2026-08-25: record it as a documented limit and ship this branch as tests and CI configuration only.** Per the same directive this arc mints no ledger row, so this section and the header of `tests/e2e/empty-state-reachability.spec.ts` are where the gap lives.

**Why category 1 still has a real proof.** Probed across `components/crew/**`: every `<EmptyState>` is section-level except `ScheduleSection.tsx:316`, which is a genuine per-field required-field placeholder. §8.3's idiom survives on exactly one crew surface, and category 1 is proven there. The catalog therefore has a live proof of the required-field contract; what it does not have, and this section says so, is a venue-specific one.

**Re-file trigger:** any decision to restore the venue placeholder, or an amendment to §8.3 that retires the venue example. Either way this section is the pointer to the case that moves.

## 8. Alternatives considered and rejected

**Loosen the flaking tolerance.** Rejected on measurement: the observed bad values include `-0.290`, so any tolerance wide enough to accept them accepts a total loss of the padding the assertion protects. Section 3 shows the settled value is exact.

**Delete the two padding-split assertions and keep only the 34px aggregate.** Rejected: `tests/e2e/tap-target-inline-controls.layout.spec.ts:56-59` records why the aggregate alone is insufficient (`gap-1 py-2` and `gap-2 py-1.5` both sum to 34). The aggregate is also, per 546 of 546 reads, the one quantity that never flaked. Deleting the assertions that work to fix a defect in neither of them is backwards.

**`waitForTimeout(250)` after opening the modal.** Rejected: a sleep is a guess that is simultaneously too long on every healthy run and too short on a loaded runner. `getAnimations().finished` waits for the named thing and returns immediately when it is already done.

**Sample the animation registry inside `openStep3Modal` and expose it for the premise test.** Rejected as the primary mechanism because it puts test-only observability into a shared helper. The premise assertion in section 4.2 instead reads `getAnimations()` from the page in a test-local probe path before invoking the settled helper, so the helper stays free of test scaffolding.

**Move `empty-state-reachability.spec.ts` to the pinned-Docker screenshots job.** Rejected in section 6.4.

**Add `push: branches: [main]` to `lifecycle-layout-e2e.yml`.** Rejected in section 5, with the re-file trigger recorded.

---

## 9. Test plan

Every assertion this PR writes or edits runs in a real browser against the compiled app. No jsdom, since jsdom computes no layout. Every expected value derives from a token, a component-owned constant, or the fixture, never a hardcoded literal transcribed from a render.

| Task | Assertion | Concrete failure mode it catches |
|---|---|---|
| T1 | `openStep3Modal` returns with zero RUNNING animations on the panel subtree, and the panel is asserted to DECLARE a non-`none` `animationName` | The settle is deleted, or a descendant gains an entrance animation the subtree walk misses; and separately, the entrance being dropped from CSS, which would leave the barrier guarding nothing. Fails 6 of 6 before T2's barrier lands, passes after. |
| T2 | The six existing half-pixel equalities, unchanged, run green over `--repeat-each=40` | A padding, gap or inset regression. Unchanged teeth; the run count is the evidence the barrier worked. |
| T3 | Category 1: with the seed's dates, no placeholder and `day-card` visible; with `dates` emptied, `empty-state[data-variant=required-field]` carrying `ScheduleSection.tsx:316`'s own copy and `day-card` count 0 | A section that renders the placeholder unconditionally, and a section that renders nothing at all. The fixture premise catches a seed that stops carrying dates. |
| T4 | Category 2: the `Power` fact row absent with `TBD`, present with a real value, in one test | The old "`TBD` not in text" form passing on a blank section. |
| T5 | Category 3: `travel-hotels` visible on the with-reservations copy, count 0 on the without copy, `section-travel` non-blank in both | A travel section that failed to render being read as "the tile is correctly missing", and a card that never renders under any data. |
| T6 | Category 4: fresh copy renders `stale-footer` at `data-tier="subtle"` with no `data-code`; stale copy renders it red with `SYNC_DELAYED_SEVERE` | A footer that is always red, and a tier ladder regression. |
| T1b | `lockedStatement` emits begin → advisory lock → write → commit in that order, keyed per show, with exactly one acquisition | The lock deleted, the lock placed after the write, a commit between the two, and a nested second acquisition. Each is built as a mutant and asserted RED, because an order assertion over one known-good string proves nothing about the analyzer. |
| T7 | Coverage meta-test green with the spec wired and its `UNSEEN` row removed | Wiring and de-allowlisting drifting apart; forced by the shadowing assertion at `tests/ci/_metaE2eWorkflowCoverage.test.ts:296`. |

Null and boundary cases are inside T3, T4 and T5 by construction: each asserts both the missing state and the present state of the same identity.

**Verification is a real run, not a reading.** Each e2e task is verified by `pnpm heavy` wrapping the outermost playwright command under `CI=1 BASELINE_SERVER_ONLY=1`. The `--repeat-each=40` sizing is re-run after the barrier lands, and a zero-failure result over at least 40 repeats is the bar for T2.

---

## 10. Convergence criterion

**Consequence bound.** Each case in scope either proves its identity against a surface that actually renders it, or is left on the coverage allowlist with the run line saying why. No case passes vacuously and none reds on rasterisation alone. A conservative outcome plus a surfaced signal is a documented limit, not a finding.

**Probe domain.** `tests/e2e/empty-state-reachability.spec.ts`, `tests/e2e/tap-target-inline-controls.layout.spec.ts`, `tests/e2e/helpers/devCaptureStaged.ts`, `tests/e2e/helpers/lockedShowCopy.ts` and its unit proof, the seed fixture `seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf` those specs load, the two Playwright projects at `playwright.config.ts:83` and `playwright.config.ts:97`, and `.github/workflows/lifecycle-layout-e2e.yml`. A probe outside that set, or against a hand-built page, files to documented limits and not to a round.

**Threat fence.** Ordinary CI runner variance and ordinary authoring drift under the real compiled app. Not adversarial fixtures, not hand-injected CSS, not a constructed animation.

---

## 11. Resolved scope — do not relitigate

- Eric's no-new-rows directive of 2026-08-25. This arc closes its two rows and mints no `BL-`/`DEF-` row of any facing. Findings are repaired here or recorded as documented limits on the owning surface.
- The deliberate absence of a `paths` filter on `lifecycle-layout-e2e.yml`, ratified over four spec-review rounds (`.github/workflows/lifecycle-layout-e2e.yml:4-6`).
- The `--retries=0` flag on the tap-target step (`.github/workflows/lifecycle-layout-e2e.yml:177-179`) and its execution oracle (`.github/workflows/lifecycle-layout-e2e.yml:195-200`).
- `shareToken` is a required path segment on the crew route (`tests/e2e/crew-page.spec.ts:152-153`).
- The six-section redesign retired the flat tile-grid idiom (`tests/e2e/crew-page.spec.ts:147-148`).
