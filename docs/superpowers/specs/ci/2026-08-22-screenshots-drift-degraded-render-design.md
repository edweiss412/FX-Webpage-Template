# screenshots-drift: two occurrences, two mechanisms, one gate that cannot tell either from a regression

**Status:** APPROVED at adversarial-review r7 (0 findings) · **Filed:** 2026-08-22 · **Arc:** `fix/screenshots-drift-instrument`
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
either encoded, or **refused with a named reason**, under three detectors (§4): layer 0 for a surface that
never rendered, layer 1 for a marked fault, layer 2 for a change in geometry. Layer 0 is what makes the
bound true rather than aspirational — without it the replacement class (§4.2.1) produces a bare timeout,
which names nothing.

A fault that is unmarked, geometry-neutral, and still renders its selector is caught by none of the three
and falls through to the existing byte comparison, which fails without attribution. That is a documented
limit (§8.1), not a silent wrong answer: the gate still goes red, it just cannot say why.

**Convergence criterion.** The instrument records runner identity, wall clock and decoded-pixel hashes on
**both** outcomes; the marker scan covers every JSX-returning fault branch reachable from the manifest EXCEPT a ternary whose guard `classifyExpression` cannot classify (see the coverage limit in section 8), and
enumerates its residue by name; §6 assigns one mechanism per reading **except the geometry row, which
narrows to a bounded candidate set** (§8.5) — a ceiling stated rather than claimed away. Settled by §9’s
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

A ts-morph probe over the consumer sites returned **six structural shapes**, not one:

| shape | example | scan result |
| --- | --- | --- |
| 1. branch directly returns JSX | `components/admin/RecentAutoAppliedStrip.tsx:726` | resolves to `<section>` — **enforceable** |
| 2. comparison in `useEffect`, announces only | `components/admin/RecentAutoAppliedStrip.tsx:721` | renders no JSX — skipped with a reason |
| 3. type-guard predicate definition | `components/admin/Dashboard.tsx:282` | not a consumer — skipped with a reason |
| 4. **degradation flag assigned to a variable** | `components/admin/Dashboard.tsx:489` | no JSX at the comparison site — **not enforceable** |
| 5. **`try`/`catch` returning JSX, no comparison at all** | `app/admin/show/[slug]/preview/[crewId]/page.tsx:202` | there is no `infra_error` comparison anywhere — **invisible to a comparison scan** |
| 6. **guarded by an IMPORTED type-guard predicate** | `app/admin/page.tsx:177` calling `isInfraError` from `app/admin/_finalizeCheckpoint.ts:38` | the predicate is defined in another module — **invisible to a scan that resolves only local declarations** |

Shape 4 has no JSX at the comparison: `ignoredDegraded` and `dataGapsDegraded` are booleans consumed by
JSX elsewhere, so branch and render are decoupled. Tracing flag to render is dataflow analysis this arc
does not carry.

Shape 5 has no comparison at all. `getShowForViewer` **throws** on a hard Supabase failure
(`lib/data/getShowForViewer.ts:390`, and again at `lib/data/getShowForViewer.ts:475`), and the preview
route catches it (`app/admin/show/[slug]/preview/[crewId]/page.tsx:202`) and returns JSX. A recognizer
built on `infra_error` comparisons cannot see a `catch` clause, so the accept-set is keyed on the
**rendering** construct, not on the comparison — see §4.3.

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

### 4.2.1 The replacement class — a fault that defeats every detector by never rendering the selector

The detectors above all run *after* `waitForQuiescence` has found `captureSelector`
(`scripts/capture-core.ts:100`). Several manifest-reachable faults **replace** that selector instead of
rendering inside it, so the wait times out and the capture reaches no detector, no geometry check, no
pixel hash, and no evidence record. The operator sees a bare missing-selector timeout.

| replacement branch | outputs it can blank |
| --- | --- |
| `app/admin/layout.tsx:94` — `admin-layout-infra-error`, after an `is_session_live` or `is_admin` RPC failure | **all 14** |
| `components/admin/Dashboard.tsx:598` — `admin-dashboard-infra-error` replaces `components/admin/Dashboard.tsx:618` | 4 (`dashboard-overview`, `review-queues-empty-state`, both themes) |
| `app/admin/page.tsx:178` — `CheckpointInfraErrorPlaceholder` (`app/admin/page.tsx:72`, testid at `app/admin/page.tsx:75`) replaces the dashboard when `readFinalizeCheckpoint` yields an infra result, for both returned and thrown Supabase faults | 4 (`dashboard-overview`, `review-queues-empty-state`, both themes) |
| `app/admin/show/[slug]/preview/[crewId]/page.tsx:144` and two peers below it (show lookup, crew lookup, and the `getShowForViewer` catch) — replace the preview banner and crew shell | 8 (four entries, both themes) |

This is the worst case available to the design: the fault class the gate exists for, arriving in the one
form that silences every instrument the gate adds. It is squarely inside the threat fence and the probe
domain, and a bare timeout is **not** the "conservative refusal with the reason surfaced" the consequence
bound permits — nothing names what happened.

**Layer 0 answers it, and it is a precondition of the other two.** The capture treats a missing
`captureSelector` as a first-class outcome rather than an exception:

1. Catch the wait timeout instead of letting it propagate.
2. Scan the **document** — not the subtree, which does not exist — for `[data-render-fault]`.
3. Record the evidence entry with `refusedReason: "selector-absent"`, the selector that was missing, and
   every marker found.
4. Throw naming all of it.

Because the replacement branches are themselves fault renders, they carry `data-render-fault` like any
other shape-1 branch, so step 2 attributes them by the same mechanism rather than a second registry. A
replacement that carries no marker still produces an attributed `selector-absent` refusal with an evidence
record — degraded attribution, never silence.

### 4.3 Layer 1 — `data-render-fault`, honestly scoped

Every fault branch reachable from the manifest that **directly returns JSX** through an `IfStatement`, `CaseClause` or `CatchClause` carries
`data-render-fault="<reason>"` on the element it already renders — shape 1, shape 5, and the §4.2.1
replacement branches alike.

**The accept-set is keyed on the rendering construct, not on the comparison spelling.** A recognizer that
enumerates comparison forms is a denylist, and shape 5 is the proof: it has no comparison to enumerate.
The scan accepts a JSX-returning branch whose guard is any of — a literal `infra_error` comparison; a call
to an `infra_error` type-guard predicate resolved through the predicate's own **declaration**, whether that
declaration is local (`components/admin/Dashboard.tsx:282`, called at
`components/admin/Dashboard.tsx:491`) or **imported from another module**
(`app/admin/_finalizeCheckpoint.ts:38`, called at `app/admin/page.tsx:177`); `in`-operator narrowing on
`"kind"`; a `catch` clause whose `try` reaches a throwing loader; a `switch` case on a result kind; or
`tileErrors` population (`lib/data/getShowForViewer.ts:224`). Anything outside the accept-set is
**reported by name**, never silently dropped — on those three arms. The `ConditionalExpression` arm has no residue fallback and drops an unclassifiable guard silently; that is a declined asymmetry, recorded in the coverage limit in section 8.

**Resolution is through the declaration, never through the name.** A scan keyed on the identifier
`isInfraError` is a denylist with one entry: it breaks on a rename, on an alias at the import site, and on
a second predicate spelled differently. Two live predicates already differ in spelling and in module
(`isInfra` local to `components/admin/Dashboard.tsx`, `isInfraError` exported from
`app/admin/_finalizeCheckpoint.ts`), which is the corpus evidence that name-keying would not have held.

A derived-cover meta-test walks the manifest-derived roots, classifies every consumer, and:

- demands the attribute on every JSX-returning fault branch (shapes 1 and 5, and the replacements);
- skips shapes 2 and 3 with a recorded reason;
- **reports shape 4 and the non-`infra_error` shapes as an enumerated residue**, pinned in a reasoned
  registry naming each flag and each capture output it can reach. The §4.2 table is that registry’s initial
  content. The residue is visible and named, never silently absent — for the three arms that report one. The `ConditionalExpression` arm is the declared exception; see the coverage limit in section 8.

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
| `captureSelector` never appears | **layer 0**: caught, document scanned for markers, evidence written with `refusedReason: selector-absent`, throw names the missing selector and any markers found |
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
| `eventName` | `GITHUB_EVENT_NAME` | **trigger population — gates whether any reading below is drawn from one population at all** |
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

**Runner identity and the trigger both require explicit passthrough.** The capture runs inside
`docker run` forwarding only `-e CI=true` (`.github/workflows/screenshots-drift.yml:113`), so neither the
three runner variables nor `GITHUB_EVENT_NAME` reaches the process that writes the record. The step gains
`-e RUNNER_NAME -e RUNNER_ARCH -e RUNNER_OS -e GITHUB_EVENT_NAME` — the value-less form forwards the host
value while `-e CI=true` sets a literal, and both forms appear in the step. `os.cpus()` needs no
passthrough: it reads the container's view of the host CPU.

**`eventName` is in the record because a measurement demanded it, not because more fields are better.**
§7 records the probe: both failures are `pull_request` runs and all nine non-reproducing probes are
`workflow_dispatch` runs, so the only population ever sampled for a non-reproduction is one neither
failure came from. Without the field, a future operator holding two records has no way to notice they are
comparing across triggers, and every runner-population reading built on that pair is unsound in a way the
record itself conceals. It costs one environment variable to make that visible.

**The record is written even when nothing renders.** The §4.2.1 replacement class produces no
`captureSelector`, and the r1 draft would have produced no record either — the one outcome most in need of
evidence would have left none. Layer 0 writes the entry with `refusedReason: "selector-absent"` and null
geometry and hashes, so AC-5's both-outcomes promise holds on the worst case rather than only the easy one.

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
| `refusedReason` is `selector-absent` | **replacement-class fault** (§4.2.1). The named markers, if any, say which branch replaced the surface; none means an unmarked replacement, still attributed as selector-absent. |
| `faultHits` non-empty | **faulted render**, mechanism A. Refused; no drift reported. |
| `refusedReason` is geometry and `faultHits` is empty | **an unmarked layout-changing fault, or a real UI change — and the record NARROWS this rather than deciding it.** See the note below; do not read this row as unique attribution. |
| the two records being compared differ in `eventName` | **cross-trigger comparison — not a mechanism, and a stop rather than an answer.** Nothing is refuted; the two records are simply drawn from different populations, so neither reading below is admissible from this pair. Obtain a record from each side under one trigger, then read on. |
| `pixelSha256` differs, geometry identical, deltas concentrated below 32 in short runs | **rasterization variance**, mechanism B. Compare `cpuModel` across the passing and failing records. |
| `pixelSha256` differs, geometry identical, long runs and large deltas | **content change at fixed geometry.** Correlate `capturedAtUtc` for a time-dependent render. |
| `pixelSha256` identical, `webpSha256` differs | **encoder difference.** `cpuModel` names the population. |
| everything identical, gate still red | a committed-bytes problem, not a capture problem. |

**The cross-trigger row's POSITION is load-bearing, not cosmetic.** The table is first-match-wins, and the
row sits ahead of every reading that compares two records because a mis-sampled pair produces a confident
wrong answer rather than no answer — which is exactly what happened to the 0/9 account §7 corrects. Placed
after the runner-population row it would never fire on the case it exists for. It is also the one row that
returns no mechanism, and that is the point: the honest output of an inadmissible comparison is a refusal
to read it.

The two decoded-pixel rows are distinguishable only because the record carries decoded-pixel identity; a
container hash would collapse them into each other and into the encoder row.

**The geometry row narrows; it does not attribute, and the r2 draft overclaimed that it did.** On a
geometry refusal no image is written, so there is no candidate image to diff, and `faultHits` is empty by
definition — the entry key identifies the capture, not the branch that broke it. Several unmarked flags
reach one identity: `ignoredDegraded` (`components/admin/Dashboard.tsx:489`) and `dataGapsDegraded`
(`components/admin/Dashboard.tsx:491`) both reach `dashboard-overview`, and rooms, hotel and contacts
failures all reach `crew-preview-today-mobile`. A source diff cannot separate them either, because a
legitimate UI edit and a transient fault can arrive in the same run.

What the record CAN do is list, for the refused entry, the residue members statically known to reach it —
that mapping is derived by §4.3's meta-test and costs nothing to carry. So the operator gets a bounded
candidate set plus the dimensions, which is narrowing, and the honest ceiling. Unique attribution for the
flag-shaped residue would need the dataflow analysis §4.2 declines; §8.5 records the limit.

---

## 7. Row dispositions

- **`BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` — SOLVED.** Mechanism A named and repaired; both filed
  candidates refuted with §1.1’s evidence. Archived on merge.

- **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — MECHANISM NAMED, DISTINCT CLASS, STAYS OPEN.**
  Its occurrence is replayed in §1.2 and is rasterization variance, not mechanism A. The row’s own original
  candidate was closer to right than its successor’s, and it is upgraded from `INFERRED, NOT PROBED` to
  PROBED with the measurement recorded.

  **This arc ships its first scheduled step — and ships it as an instrument, not as an answer.** The row
  asked for runner identity captured on both outcomes; §5 delivers that plus the decoded-pixel hash.
  `runnerName` + `cpuModel` + `pixelSha256` is the triple that makes a runner-keyed reading **testable**,
  because it separates “the pixels moved” from “the encoding moved” and then keys the population. §6’s
  rasterization-variance row is the row’s reading procedure, and §6’s cross-trigger row is the
  admissibility check that must clear before it. The trap this arc sets is the row’s instrument, not an unrelated one.

  **What is proven and what is not.** The replay proves *rasterization variance*: identical geometry,
  identical content, sub-pixel deltas. It does **not** prove the variance is keyed to runner or CPU rather
  than some other per-run condition — no runner identity was recorded for occurrence B or for its nine
  dispatched probes, so no population comparison is possible even in principle. Runner population remains
  the leading hypothesis and stays a hypothesis; the row keeps its unprobed status on that specific
  question, which is why it stays open rather than closing on a named mechanism.

  **What makes the class hard, and why the repair is not opened here.** The variance survived both pins the
  byte-comparison discipline prescribes: the image tag is pinned and the run passes
  `--platform linux/amd64` (`.github/workflows/screenshots-drift.yml:113`). So the open question is which
  of two repairs is right — pin the rasterization environment harder (whatever still varies beneath a
  pinned image on a fixed platform), or stop requiring byte equality and compare within a perceptual
  tolerance. Those are different products with different failure modes, and choosing between them needs the
  population data §5 begins collecting. This spec states the question and does not answer it.

  **The 0/9 is a MIS-SAMPLE, which is a sharper correction than “uninformative”.** Probed 2026-08-24
  against `repos/edweiss412/FX-Webpage-Template/actions/workflows/screenshots-drift.yml/runs`. Both
  failures are `pull_request`: occurrence A is run 32528532727 on `be5d3d810db2`, occurrence B is run
  31930558546 on `b5aa6ef7`, and each is the only screenshots-drift run its sha ever had — one run
  returned per `head_sha`, `run_attempt` 1. The nine non-reproducing probes are every one
  `workflow_dispatch`, and every one on `119895a7c756`: seven in a 23-second burst spanning
  2026-08-16T11:32:38Z to 11:33:01Z, and two at 11:06:08Z and 11:06:28Z.
  Six further dispatches on that sha were cancelled and are not among the nine.

  So the probes never sampled the population either failure came from. The baseline is not the difference:
  `119895a7c756` is a descendant of `b5aa6ef7` and `git diff` between them over `public/help/screenshots/`
  is empty, so both trees carry byte-identical committed baselines. What moved is the trigger, and a
  trigger is not cosmetic — a `pull_request` run builds the merge ref while a `workflow_dispatch` run
  builds the branch head, and the two can be routed to different runner pools.

  **This names no mechanism and must not be read as naming one.** `pull_request` is not hereby a suspect;
  nine dispatches is a small sample and the two triggers may well share a pool. What the measurement
  retires is the inference the previous wording invited. 0/9 was never weak evidence *against* a
  runner-population effect, because it is not evidence about the failing population at all — a comparison
  across triggers is inadmissible before it is uninformative. That is why §5 records `eventName` and why
  §6’s cross-trigger row precedes both readings it would otherwise corrupt. The row keeps its unprobed
  status on the runner question, now for a stated reason rather than an absence.

**The rows’ shared one-class assertion is corrected, not honored.** Working them together was right and is
what surfaced both mechanisms; closing them together would have shipped a false certification.

---

## 8. Documented limits

1. **An unmarked, geometry-neutral fault that still renders its selector is caught by none of the three.** It falls through to the existing
   byte comparison, which fails without attribution. Shape-4 members that remove and add content in
   compensating amounts are the realistic instance. Re-file trigger: a recurrence whose `faultHits` is
   empty, whose geometry matches, and whose pixel deltas are long-run.
2. **Layer 1 covers branches that directly return JSX, through three of its four arms.** Shapes 2, 3 and 4
   are an enumerated residue (§4.2), not a covered population — named, not silent. Shape 5 and the §4.2.1
   replacements ARE covered, because the accept-set is keyed on the rendering construct rather than on a
   comparison spelling.

   **The `ConditionalExpression` arm is the exception, and the asymmetry is DECLINED rather than closed**
   (`fix/screenshots-drift-residue`, 2026-08-25). The `IfStatement` arm falls back to a fault-vocabulary
   probe and reports an unclassifiable guard as `unknown` residue; the ternary arm has no fallback and
   drops it in silence. Re-probed on the live tree: **719** ternaries under the derived roots return JSX in
   `whenTrue`, **79** of those carry a fault-vocabulary guard and are unclassifiable, and **70 of the 79
   sit in `"use client"` files** — interaction state, not a server-render fault, and this instrument
   captures server-rendered output. Of the nine in server components, four are emptiness checks and two are
   already registered, so the fallback would buy roughly three new sites for 79 hand-written reasons. The
   vocabulary probe is the wrong filter on this arm.

   **Re-file trigger, computed rather than promised:** the count of server-component ternaries that are
   unclassifiable, fault-vocabulary AND unregistered rises above **7**, its resting value today.
   `tests/help/_metaRenderFaultMarking.test.ts` asserts that bound, re-derives the 719 and 79 above and
   compares them to the arm's own comment, and pins each registered site as still unreached — so these
   figures cannot go stale silently, which is how the previous pair (714 and 91) did.
3. **A live Postgres wall-clock dependency is left in place.** `purgeAndRotateIfStale`, called on every
   `/admin` request, runs `now()` and `now() - interval '24 hours'` in inline SQL
   (`lib/onboarding/sessionLifecycle.ts:351`, and again at lines 352, 355 and 388). The frozen-now header
   cannot reach Postgres. It explains neither occurrence — both render the Dashboard branch — but it is a
   real time-dependent input to a captured route. The repair is a time-source decision outside this arc.
5. **A geometry refusal narrows to a candidate set, never to one branch.** No image is written and
   `faultHits` is empty, so the evidence names the capture and the statically-reachable residue members,
   not the branch that fired. Unique attribution for flag-shaped faults needs the dataflow analysis §4.2
   declines to carry. Re-file trigger: a recurrence where the candidate set is large enough that an
   operator cannot act on it.
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
  and writes **no image bytes**. Proven for the replacement class too (§4.2.1): with `captureSelector`
  absent the run still produces an attributed `selector-absent` refusal and an evidence entry, never a bare
  timeout. The evidence record is still written — that distinction is the assertion,
  not an exception to it. Proven by an injected loader failure, not a mocked component.
- **AC-2** A healthy capture is byte-identical to today’s output **and every expected entry-theme identity
  completed in THIS run**. Two traps, and a count alone catches neither. `git diff --exit-code` exits 0
  when the capture wrote nothing — the empty-capture trap. And a directory count exits 0 too, because the
  fourteen committed baselines are already on disk before capture begins and are overwritten in place: a
  run that completes one entry and silently skips thirteen still leaves fourteen files and an empty diff.
  So the oracle is a **set of identities derived from a directory that began the run empty**, one per
  `(entry.key, theme)`; the test asserts that set equals the fourteen expected identities, then asserts the
  diff is empty. Identity equality over provably-new artifacts, never cardinality and never a property the
  previous run's output already satisfies.

  **And production must be structurally provable, because three assertion-level attempts each failed.** The
  history is worth keeping, since each fix looked sufficient: a directory count passes because the fourteen
  baselines are already on disk; completion events emitted when `captureEntryTheme` returns pass because
  deleting the single `writeFile` at `scripts/help-screenshots.ts:111` leaves the function returning
  normally; and reading the file back after writing ALSO passes, because a healthy capture reproduces the
  committed baseline byte-for-byte — which is AC-2's own premise — so the pre-existing file satisfies both
  the non-zero length and the matching hash. **Read-back proves matching bytes exist, not that this run
  produced them.**

  No assertion over `public/help/screenshots/` can distinguish the two, because the capture overwrites in
  place and the correct output is byte-identical to what is already there. So the repair is structural
  rather than another assertion: **the capture writes each image into a fresh output directory created
  empty at the start of the run**, and the completion set is derived from files present in that directory.
  A no-op writer yields an empty directory and therefore zero completions, which fails loudly instead of
  silently. The images are copied into `public/help/screenshots/` afterwards, so the existing byte gate at
  `.github/workflows/screenshots-drift.yml:136` is unchanged and keeps doing exactly what it does today.

  Emptiness at start is the load-bearing property: it is what makes "this file exists" mean "this run wrote
  it". The directory is created fresh per run and is gitignored alongside the evidence record.

  **The principle, stated because three rounds were spent rediscovering it.** Read-back proves matching
  bytes EXIST; it cannot prove which run produced them, and no stronger property of the bytes closes that
  gap — a hash, a length, a re-decode, a checksum of a checksum all describe content, and the content is
  *supposed* to be identical. **Production is certified by the provenance of the workspace, not by any
  property of the artifact.** A location that provably started empty is what converts "these bytes are
  correct" into "this run made them". Any future oracle over capture output is measured against that
  sentence rather than against a better comparison.
- **AC-3** The meta-test fails when a manifest-reachable shape-1 branch lacks `data-render-fault`, proven
  by a mutant removing the attribute.
- **AC-4** The population is derived from the manifest **including template-literal routes**, proven by two
  mutants: one adding a plain-string route, one adding a template-literal route. The second is the one a
  quote-only parser fails.
- **AC-5** The evidence record is written and uploaded on both a passing and a failing run, with every
  field that applies populated — including `eventName` and the three runner fields, which require the
  Task 7 passthrough, and with post-encode fields `null` exactly on refused entries. Proven against a real
  CI run under **each** trigger this arc can produce: a `workflow_dispatch` run and the `pull_request`
  runs the arc’s own PR already fires. One trigger is not enough, and §7 is the reason — a proof drawn only
  from dispatch would certify the instrument on precisely the population that mis-sampled the question the
  instrument exists to answer.
- **AC-6** `pixelSha256` is computed over decoded RGB. Proven by re-encoding one committed baseline at two
  PNG compression levels and asserting `pixelSha256` holds where a container hash would not.
- **AC-7** `data-degraded` on a captured surface does **not** trigger a refusal, proven against
  `crew-preview-today-mobile`, which renders `data-degraded="false"` today
  (`components/crew/RightNowHero.tsx:472`).

**Anti-tautology.** AC-1 injects at the loader boundary so the real branch executes; asserting that a
hand-constructed `infra_error` prop renders a card would prove only that React renders props. AC-2’s
produced-count is what catches a gate that passes by not looking. AC-6 asserts the two hash kinds behave
differently rather than extracting both from one path and comparing them to each other.
