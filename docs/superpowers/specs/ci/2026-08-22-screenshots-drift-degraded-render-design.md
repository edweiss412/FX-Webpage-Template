# screenshots-drift: two occurrences, two mechanisms, one gate that cannot tell either from a regression

**Status:** DRAFT (r1 repaired) · **Filed:** 2026-08-22 · **Arc:** `fix/screenshots-drift-instrument`
**Closes:** `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`
**Re-dispositions:** `BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — mechanism named, distinct class, stays OPEN

Both rows were filed as nondeterminism of unknown mechanism, both named the same two candidates, and both
assert they are **one class**. Both failure artifacts were still inside their retention windows and were
replayed. The replay refutes the shared framing: the two occurrences have **different mechanisms**, and
neither is either candidate as filed.

---

## 1. What the two replays measured

### 1.1 Occurrence A — run 32528532727, `be5d3d810db2`, 2026-08-21 21:26Z

The gate printed `review-queues-empty-state-light.webp | Bin 6148 -> 11408`. Artifact downloaded
(`gh run download 32528532727 -n drifted-screenshots`) and measured against the committed baselines:

| fact | value |
| --- | --- |
| images in artifact | 14 |
| byte-identical to baseline | 13 |
| differing | 1 |
| captured geometry | 320x291 |
| baseline geometry | 320x164 |
| dark twin of the same selector, same run | 320x164, byte-identical |

The captured image is 127px taller and renders one element the baseline does not: a **Recently
auto-applied** heading plus the sentence “We couldn’t load recently auto-applied changes right now.
Refresh to try again.” — the constant at `components/admin/RecentAutoAppliedStrip.tsx:45`, rendered at
`components/admin/RecentAutoAppliedStrip.tsx:746`. The component’s contract comment
(`components/admin/RecentAutoAppliedStrip.tsx:21`) states the branch structure: `ok` with zero groups
returns `null` (`components/admin/RecentAutoAppliedStrip.tsx:756`); `infra_error` renders the card. The
loader returns `infra_error` on a failed Supabase read at five sites, among them
`lib/admin/loadRecentAutoApplied.ts:170` and `lib/admin/loadRecentAutoApplied.ts:231`.

**Mechanism A: a transient data-read failure, rendered as a graceful degradation card, encoded as a
baseline candidate.**

### 1.2 Occurrence B — run 31930558546, `b5aa6ef7`, 2026-08-16 06:05Z

The predecessor row records this occurrence as unreplayable. It was not: the artifact expires
2026-08-23T06:09Z and was still live when this was written, with about twenty hours to spare. Downloaded
and compared against the baseline **as committed at that same sha**
(`git show b5aa6ef7:public/help/screenshots/…`):

| image | captured | baseline | geometry | identical |
| --- | --- | --- | --- | --- |
| `dashboard-overview-light.webp` | 82600 | 77670 | **1216x1463 both** | no |
| `dashboard-overview-dark.webp` | 81698 | 81698 | 1216x1463 both | yes |

Decoded to raw RGB and compared pixel by pixel:

| measurement | value |
| --- | --- |
| differing pixels | 45293 of 1779008 |
| delta 0-31 | 42007, which is 93% of all differing pixels |
| delta 224-255 | 357 |
| horizontal run lengths | 1px:920, 2px:576, 4px:491, 3px:439, 8px:315 |
| best vertical shift alignment | offset 0, so a uniform shift is refuted |
| differing rows | 568 of 1463, in 25 bands of 3-116px scattered down the page |

Cropped and inspected: identical layout, identical text, identical dates and counts.

**Mechanism B: sub-pixel text rasterization variance.** Mostly tiny deltas in short runs on glyph edges,
across every text run on the page, at unchanged geometry and unchanged content. A content change produces
long runs and large deltas; this is the anti-aliasing signature. That it happened at all is the hard part:
the capture already pins the image tag AND passes `--platform linux/amd64`
(`.github/workflows/screenshots-drift.yml:113`), so the variance survived both pins the byte-comparison
discipline prescribes.

### 1.3 The rows are not one class

Occurrence A changed geometry because content was added. Occurrence B changed no geometry, no layout and
no content. **The repair specified below would never fire on occurrence B**, and a rasterization pin would
have done nothing for occurrence A. Both rows’ one-class assertion (`BACKLOG.md:26`, `BACKLOG.md:775`) is
refuted by measurement.

What the rows got right is that they should be *worked* together — one arc, one replay method, one
instrument. That is what this spec does. It does not close them together.

### 1.4 Resolved scope — do not relitigate

- **Both originally-filed mechanisms are refuted for occurrence A** (§1.1). Encoding cannot change element
  geometry, and a wall-clock crossing cannot revert between two themes captured seconds apart. Challenge
  this with a probe, not an argument.
- **Occurrence B is rasterization, not encoding** (§1.2). The pixels differ *before* encoding, so the
  encoder is not the variable.
- **No baseline is recaptured, on any branch or host** (AGENTS.md byte-comparison discipline).
- **`data-render-fault` is a new attribute, deliberately NOT `data-degraded`.** `data-degraded` is taken
  and means something else: a legitimate *product* state on `components/crew/RightNowHero.tsx:472`
  (dateless / unknown / viewer_unconfirmed), pinned at `tests/components/crew/rightNowHero.test.tsx:311`.
  A crew page in that state is a valid screenshot; an infra read failure is not. The two must not share a
  selector.
- **`BL-ADMIN-LOADER-CI-TRANSIENT` is a sibling row claimed by PR #875 and is not edited by this arc.**

---

## 2. Why the capture cannot tell any of this from a regression

`waitForQuiescence` (`scripts/capture-core.ts:96`) waits for visibility, then `networkidle`, then
`document.fonts.ready`, then a double-`requestAnimationFrame`, then a stable timeout. Every condition is
about **paint stability**. A stably painted error card satisfies all of them. Nothing in the capture path
asserts the render *succeeded*.

Three properties make a fault invisible rather than merely unhandled:

1. **It is server-side.** The `infra_error` arises during the RSC render inside the Next server on port
   3004. The browser receives a 200 with well-formed HTML, so no browser-observable network signal exists.
2. **It is silent in telemetry.** `lib/admin/loadRecentAutoApplied.ts` imports `log`
   (`lib/admin/loadRecentAutoApplied.ts:28`) but none of its five `infra_error` returns emit. The failing
   run’s job log carries no trace of the read failure.
3. **A passing run records nothing.** `.github/workflows/screenshots-drift.yml:172` uploads only
   `if: failure()`. Both diagnoses above depended on a failure artifact surviving inside a 7-day window.

---

## 3. Convergence criterion, probe domain, threat fence

**Threat fence.** Environment-transient infrastructure faults during capture: a Supabase read or RPC that
fails once and succeeds on retry. NOT an adversary who can author components, and NOT every conceivable
degraded rendering. Rasterization variance (mechanism B) is explicitly **out of this repair’s scope** and
is handled by §7’s re-disposition, not by the guard.

**PROBE DOMAIN:** the two rows’ recorded runs and their artifacts; the live
`.github/workflows/screenshots-drift.yml`; the 14 manifest-declared capture outputs
(`scripts/help-screenshots.manifest.ts`); and captures the instrument produces. A probe must come from
that domain or be one ordinary edit away from an input in it.

**Consequence bound — closable, and narrower than the r1 draft claimed.** Over that domain a capture is
either encoded, or **refused with a named reason**, under two independent detectors (§4). A fault that is
both unmarked and geometry-neutral is caught by neither and falls through to the existing byte comparison,
which fails without attribution. That is a documented limit (§8.1), not a silent wrong answer: the gate
still goes red, it just cannot say why.

**Convergence criterion.** The instrument records runner identity, wall clock and decoded-pixel hashes on
**both** outcomes; the marker scan covers every JSX-returning `infra_error` branch reachable from the
manifest and enumerates its residue by name; §6 assigns one mechanism per reading. Settled by §9’s
acceptance tests.

---

## 4. Deliverable A — refuse to encode a faulted render

### 4.1 Why the signal is created rather than discovered

| population | count | why it is not the chokepoint |
| --- | --- | --- |
| `kind: "infra_error"` producers under `lib/`, `app/`, `components/` | 368 | no factory; a 368-site change |
| `infra_error` consumer comparisons under `app/`, `components/` | 62 in 45 files | open set, and per §4.2 most are not render branches at all |
| Supabase client factories (`lib/supabase/server.ts:33`, `lib/supabase/server.ts:79`) | 2 | a real chokepoint, but wrapping PostgREST’s thenable builders risks 158 call sites for a CI-only signal |

### 4.2 What a source scan can and cannot see — measured, not assumed

A ts-morph probe over the consumer sites returned **four structural shapes**, not one:

| shape | example | scan result |
| --- | --- | --- |
| 1. branch directly returns JSX | `components/admin/RecentAutoAppliedStrip.tsx:726` | resolves to `<section>` — **enforceable** |
| 2. comparison in `useEffect`, announces only | `components/admin/RecentAutoAppliedStrip.tsx:721` | renders no JSX — skipped with a reason |
| 3. type-guard predicate definition | `components/admin/Dashboard.tsx:282` | not a consumer — skipped with a reason |
| 4. **degradation flag assigned to a variable** | `components/admin/Dashboard.tsx:489` | no JSX at the comparison site — **not enforceable** |

Shape 4 is the one that matters. `ignoredDegraded` and `dataGapsDegraded` are booleans consumed by JSX
elsewhere; branch and render are decoupled, so there is nothing to mark at the comparison. Tracing flag to
render is dataflow analysis this arc does not carry.

**The recognizer is narrower than `infra_error` besides.** Manifest-reachable faults also arrive as
`"kind" in result` and as `tileErrors` population, which no `infra_error` comparison names. Known
instances, all inside the threat fence and all reachable from current manifest entries:

| capture output | fault shape |
| --- | --- |
| `dashboard-overview`, both themes | a `shows_internal` read failure becomes `dataGapsDegraded` — adds a notice, removes warning badges |
| `needs-attention-mobile`, both themes | loader error branch keyed on `"kind" in result`, replacing the inbox |
| `crew-preview-today-mobile`, both themes | rooms / hotel / contacts failures populate `tileErrors`; `admin_preview` resolves `isAdmin=false`, so content disappears with no error marker |
| `crew-preview-gear-mobile`, both themes | a rooms failure removes the captured room details |
| `crew-preview-schedule-mobile`, both themes | a rooms failure removes the captured Crew Schedule |

**Consequence, stated plainly:** layer 1 alone would leave 10 of the 14 capture outputs able to fault
silently. That is why layer 2 exists, and why §3’s consequence bound is narrower than the r1 draft’s.

### 4.3 Layer 1 — `data-render-fault`, honestly scoped

Every **shape-1** branch reachable from the manifest carries `data-render-fault="<reason>"` on the element
it already renders. A derived-cover meta-test walks the manifest-derived roots, classifies every consumer
by shape, and:

- demands the attribute on shape 1;
- skips shapes 2 and 3 with a recorded reason;
- **reports shape 4 and the non-`infra_error` shapes as an enumerated residue**, pinned in a reasoned
  registry naming each flag and each capture output it can reach. The §4.2 table is that registry’s initial
  content. The residue is visible and named, never silently absent.

**The route parser must read template literals.** Four of the seven manifest routes are template literals,
the first at `scripts/help-screenshots.manifest.ts:73` with peers at lines 97, 105 and 113; the remaining
three are plain quoted strings, the first at `scripts/help-screenshots.manifest.ts:51` with peers at lines
59 and 81. A quote-only parser — the form `tests/help/_metaServerTimeGuard.test.ts:11` uses — sees three of
seven and would silently under-derive the population. The scan reads the AST, not a quote regex.

### 4.4 Layer 2 — geometry, and exactly what it is worth

Before encoding, compare the captured element’s pixel dimensions against the committed baseline’s, read
with `sharp(path).metadata()`.

**It does not identify a fault.** It fires on any dimension change, and a faulted render is
indistinguishable to it from a legitimate UI change — exactly as they are to the byte comparison that
already exists. It changes no pass/fail semantics. It adds three things:

1. **Coverage across all four shapes**, including the flag-driven shape 4 that layer 1 cannot reach,
   whenever the fault changes layout.
2. **Failure before the write**, so committed bytes are never overwritten by a faulted capture.
3. **The diagnostic**: `320x164 -> 320x291` is the line that would have made occurrence A readable from
   the log instead of from an artifact race.

**It is not total, and occurrence B proves it**: 1216x1463 in both, a real pixel difference, geometry
silent. §8.1 records that limit.

### 4.5 Guard conditions

| input | behavior |
| --- | --- |
| no `[data-render-fault]` in subtree, geometry matches | encode and write, unchanged from today |
| any `[data-render-fault]` | throw naming entry key, theme and each reason; write no image |
| attribute present with an empty value | treated as a hit, reason `(unspecified)` |
| marked element outside the captured subtree | not a hit — scoped to what the gate pins |
| geometry differs | throw naming both dimensions; write no image |
| no committed baseline for this entry | geometry check skipped with a recorded reason; layer 1 still applies |
| entry has no `captureSelector` | subtree is the document; in scope |
| `data-degraded` present | **ignored** — a different attribute and a legitimate product state (§1.4) |

### 4.6 Dimensional Invariants

**N/A — no element is added, removed, resized or repositioned.** The only product-source edit is one
additional HTML attribute on elements that already render, at branches that already exist. AC-2 is the
executable form: the capture must reproduce every committed baseline byte for byte on an unchanged tree,
which no dimensional change could satisfy. The one dimensional fact this spec relies on is an
*observation* (§1.1’s 320x164 against 320x291), not an invariant it introduces.

### 4.7 Transition Inventory

**N/A — the marked branches have no animated states and this change adds none.** `data-render-fault` is a
static attribute evaluated once per server render: no client state, no mount or unmount transition, no
`AnimatePresence`. The capture additionally neutralises animation before any assertion runs —
`disableAnimations` (`scripts/capture-core.ts:66`) registers a pre-navigation init script forcing
zero-duration animations and transitions.

---

## 5. Deliverable B — the instrument, on both outcomes

One evidence record per capture run, written into `public/help/screenshots/` under the name
capture-evidence.json (new, gitignored — see below), uploaded on **both** outcomes.

| field | source | discriminates |
| --- | --- | --- |
| `runnerName`, `runnerArch`, `runnerOs` | `RUNNER_NAME` / `RUNNER_ARCH` / `RUNNER_OS` | runner population |
| `cpuModel`, `cpuCount` | `os.cpus()` inside the pinned image | rasterizer and SIMD path |
| `capturedAtUtc` per entry | the capture clock | time-of-day effects |
| `frozenClockInstant` per entry | the manifest entry | proves the frozen clock applied |
| `pixelWidth`, `pixelHeight` per entry | pre-encode | geometry change |
| **`pixelSha256`** per entry | **sha256 of DECODED RGB, never the PNG container** | render change against encoding change |
| `webpBytes`, `webpSha256` per entry | post-encode, **null on a refused entry** | matches what the gate compares |
| `faultHits` per entry | layer 1 | attributes a refusal |
| `refusedReason` per entry | layer 1 or 2, else null | why nothing was encoded |

**`pixelSha256` hashes decoded pixels, never the PNG container.** A container hash is not a render
identity: re-encoding identical pixels at two compression levels yields different container hashes
(probed — 2337672 against 156312 bytes, container hashes differ, decoded-pixel hashes equal). Hashing the
container would report a render change whenever only encoding moved, which is exactly the confusion §6
exists to resolve. Occurrence B’s diagnosis used decoded pixels for the same reason.

**Runner identity requires explicit passthrough.** The capture runs inside `docker run` forwarding only
`-e CI=true` (`.github/workflows/screenshots-drift.yml:113`), so the three runner variables do not reach
the process that writes the record. The step gains `-e RUNNER_NAME -e RUNNER_ARCH -e RUNNER_OS` — the
value-less form forwards the host value while `-e CI=true` sets a literal, and both forms appear in the
step. `os.cpus()` needs no passthrough.

**Writing the record is not writing a baseline.** §4’s refusal means no **image** is encoded or written.
The evidence record is written on every outcome, including a refused one — that is the point of it. AC-1
and AC-5 are worded to that distinction; post-encode fields are `null` on a refused entry, and AC-5
requires every field that *applies*.

**The record must be gitignored.** The gate’s own untracked check
(`.github/workflows/screenshots-drift.yml:137`) runs
`git ls-files --others --exclude-standard public/help/screenshots/` and fails on any untracked file there.
Probed both directions on this tree: untracked and listed, then ignored and absent. Without the ignore
entry the instrument would red the very gate it instruments.

The upload changes from `if: failure()` to `if: always()`. A passing run must leave a record or the
comparison population can never be built — the defect that made occurrence B nearly unrecoverable.

---

## 6. Discrimination table — one recurrence, one mechanism

Read in order; the first matching row wins.

| reading | mechanism |
| --- | --- |
| `faultHits` non-empty | **faulted render**, mechanism A. Refused; no drift reported. |
| `refusedReason` is geometry and `faultHits` is empty | **an unmarked layout-changing fault, or a real UI change.** The diff separates them: if no render input moved it is a shape-4 residue member (§4.2), and the record names which. |
| `pixelSha256` differs, geometry identical, deltas concentrated below 32 in short runs | **rasterization variance**, mechanism B. Compare `cpuModel` across the passing and failing records. |
| `pixelSha256` differs, geometry identical, long runs and large deltas | **content change at fixed geometry.** Correlate `capturedAtUtc` for a time-dependent render. |
| `pixelSha256` identical, `webpSha256` differs | **encoder difference.** `cpuModel` names the population. |
| everything identical, gate still red | a committed-bytes problem, not a capture problem. |

Rows 3 and 4 are distinguishable only because the record carries decoded-pixel identity; a container hash
would collapse them into each other and into row 5.

---

## 7. Row dispositions

- **`BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` — SOLVED.** Mechanism A named and repaired; both filed
  candidates refuted with §1.1’s evidence. Archived on merge.

- **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — MECHANISM NAMED, DISTINCT CLASS, STAYS OPEN.**
  Its occurrence is replayed in §1.2 and is rasterization variance, not mechanism A. The row’s own original
  candidate was closer to right than its successor’s, and it is upgraded from `INFERRED, NOT PROBED` to
  PROBED with the measurement recorded.

  **This arc ships its first scheduled step.** The row asked for runner identity captured on both outcomes;
  §5 delivers exactly that, plus the decoded-pixel hash — and `runnerName` + `cpuModel` + `pixelSha256` is
  precisely the triple that settles a runner-keyed rasterization difference, because it separates “the
  pixels moved” from “the encoding moved” and then keys the population. §6 row 3 is the row’s reading
  procedure. The trap this arc sets is the row’s instrument, not an unrelated one.

  **What makes the class hard, and why the repair is not opened here.** The variance survived both pins the
  byte-comparison discipline prescribes: the image tag is pinned and the run passes
  `--platform linux/amd64` (`.github/workflows/screenshots-drift.yml:113`). So the open question is which
  of two repairs is right — pin the rasterization environment harder (whatever still varies beneath a
  pinned image on a fixed platform), or stop requiring byte equality and compare within a perceptual
  tolerance. Those are different products with different failure modes, and choosing between them needs the
  population data §5 begins collecting. This spec states the question and does not answer it.

  The 0/9 dispatched non-reproductions are explained rather than mysterious: a runner-population effect
  reproduces only when a dispatch lands on the minority population.

**The rows’ shared one-class assertion is corrected, not honored.** Working them together was right and is
what surfaced both mechanisms; closing them together would have shipped a false certification.

---

## 8. Documented limits

1. **An unmarked, geometry-neutral fault is caught by neither layer.** It falls through to the existing
   byte comparison, which fails without attribution. Shape-4 members that remove and add content in
   compensating amounts are the realistic instance. Re-file trigger: a recurrence whose `faultHits` is
   empty, whose geometry matches, and whose pixel deltas are long-run.
2. **Layer 1 covers shape 1 only.** Shapes 2-4 and the non-`infra_error` fault shapes are an enumerated
   residue (§4.2), not a covered population. Named, not silent.
3. **A live Postgres wall-clock dependency is left in place.** `purgeAndRotateIfStale`, called on every
   `/admin` request, runs `now()` and `now() - interval '24 hours'` in inline SQL
   (`lib/onboarding/sessionLifecycle.ts:351`, and again at lines 352, 355 and 388). The frozen-now header
   cannot reach Postgres. It explains neither occurrence — both render the Dashboard branch — but it is a
   real time-dependent input to a captured route. The repair is a time-source decision outside this arc.
4. **The instrument records; it does not retry.** A retry-on-fault policy would mask fault *rate*, which is
   what the successor arc for row 2 needs.

**Peers filed, repaired in neither this diff nor each other’s** (orchestrator ruling 2026-08-22):

- **The loader is telemetry-silent on the fault this arc is about.** Five `infra_error` returns in
  `lib/admin/loadRecentAutoApplied.ts`, zero emits, so occurrence A could only be attributed by an artifact
  race. *Incident:* this arc’s own diagnosis. *Class-sweep exception (c):* the repair is an emit in
  `lib/admin/**`, pulling application review surface into a PR scoped to workflow, scripts and docs.
- **The server-time guard’s population excludes `lib/`.** `discoverScanRoots()`
  (`tests/help/_metaServerTimeGuard.test.ts:11`) covers `components` plus manifest-derived `app/` roots;
  `lib/**` is never walked and `.sql` is excluded by the extension filter
  (`tests/help/_metaServerTimeGuard.test.ts:48`). Live unwaived survivor: `lib/admin/loadAppEvents.ts:45`.
  *Class-sweep exception (c):* widening it is a redesign of a guard this PR does not otherwise touch.

---

## 9. Acceptance criteria

- **AC-1** A capture whose surface renders a marked fault throws, names entry key, theme and each reason,
  and writes **no image bytes**. The evidence record is still written — that distinction is the assertion,
  not an exception to it. Proven by an injected loader failure, not a mocked component.
- **AC-2** A healthy capture is byte-identical to today’s output **and every manifest entry and theme was
  actually produced**. `git diff --exit-code` alone is insufficient: it exits 0 when the capture wrote
  nothing at all, which is the green-but-empty trap. The test asserts a produced-count equal to the
  manifest’s expected output count, then asserts the diff is empty.
- **AC-3** The meta-test fails when a manifest-reachable shape-1 branch lacks `data-render-fault`, proven
  by a mutant removing the attribute.
- **AC-4** The population is derived from the manifest **including template-literal routes**, proven by two
  mutants: one adding a plain-string route, one adding a template-literal route. The second is the one a
  quote-only parser fails.
- **AC-5** The evidence record is written and uploaded on both a passing and a failing run, with every
  field that applies populated — including the three runner fields, which requires the Task 5 passthrough,
  and with post-encode fields `null` exactly on refused entries. Proven against a real dispatched run.
- **AC-6** `pixelSha256` is computed over decoded RGB. Proven by re-encoding one committed baseline at two
  PNG compression levels and asserting `pixelSha256` holds where a container hash would not.
- **AC-7** `data-degraded` on a captured surface does **not** trigger a refusal, proven against
  `crew-preview-today-mobile`, which renders `data-degraded="false"` today
  (`components/crew/RightNowHero.tsx:472`).

**Anti-tautology.** AC-1 injects at the loader boundary so the real branch executes; asserting that a
hand-constructed `infra_error` prop renders a card would prove only that React renders props. AC-2’s
produced-count is what catches a gate that passes by not looking. AC-6 asserts the two hash kinds behave
differently rather than extracting both from one path and comparing them to each other.
