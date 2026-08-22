# screenshots-drift: a degraded render is encoded as a baseline

**Status:** DRAFT · **Filed:** 2026-08-22 · **Arc:** `fix/screenshots-drift-instrument` · **Closes:** `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`, `BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` (one class; neither may be scheduled alone)

Both rows were filed as *nondeterminism of unknown mechanism* and both named the same two candidates. A replay of the surviving failure artifact refutes both and names a third mechanism outright. This document records the refutation with its evidence, specifies the repair that follows from it, and keeps the instrument the rows asked for — because the repair explains one occurrence and only fits the other.

---

## 1. What actually happened

`screenshots-drift` failed on run [32528532727](https://github.com/edweiss412/FX-Webpage-Template/actions/runs/32528532727) at `be5d3d810db2`, 2026-08-21 21:26Z. The gate printed one line:

```
public/help/screenshots/review-queues-empty-state-light.webp
 .../screenshots/review-queues-empty-state-light.webp | Bin 6148 -> 11408 bytes
```

The failure artifact was still inside its 7-day retention on 2026-08-22 and was downloaded (`gh run download 32528532727 -n drifted-screenshots`). Measured against the committed baselines:

| fact | value |
| --- | --- |
| images in the artifact | 14 |
| byte-identical to baseline | 13 |
| differing | 1 (`review-queues-empty-state-light.webp`) |
| captured geometry | 320x291 |
| baseline geometry | 320x164 |
| `review-queues-empty-state-**dark**.webp`, same run | 320x164, byte-identical to baseline |

The captured light image is 127px taller than its baseline and renders one element the baseline does not: a section headed **Recently auto-applied** containing the sentence *“We couldn’t load recently auto-applied changes right now. Refresh to try again.”*

That string is a single-sourced constant at `components/admin/RecentAutoAppliedStrip.tsx:45`, rendered at `components/admin/RecentAutoAppliedStrip.tsx:746` under `data-testid="auto-applied-error"`. The component's own contract comment states the branch structure (`components/admin/RecentAutoAppliedStrip.tsx:21`): an `ok` result with zero groups renders **nothing** (`return null`, `components/admin/RecentAutoAppliedStrip.tsx:756`), while an `infra_error` result renders the heading plus the card. Its loader returns `{ kind: "infra_error" }` on a failed Supabase read at five sites, among them `lib/admin/loadRecentAutoApplied.ts:170` (`show_change_log read failed`) and `lib/admin/loadRecentAutoApplied.ts:231` (`roster_shift_counts rpc failed`).

**So the byte gate did not observe nondeterministic encoding. It observed a transient data-read failure, rendered as a graceful degradation card, encoded into a WebP, and reported as drift.**

### 1.1 Resolved scope — do not relitigate

Each item carries the evidence that settles it.

- **Mechanism 1, time-of-day / date-dependent capture: REFUTED for this occurrence.** The extra content is an error card, not a non-empty queue. Decisively, the **dark** capture of the same selector on the same route, from the same page state seconds later under the same frozen instant, is byte-identical to its baseline (320x164). A wall-clock crossing that changed the light render would have to revert before the dark render. The capture freezes both clocks it can reach: the browser clock via `context.clock.install()` (`scripts/help-screenshots.ts:90`) and the server render clock via the `X-Screenshot-Frozen-Now` header honored at `lib/time/now.ts:22`.
- **Mechanism 2, runner-population bimodality in the encoder: REFUTED for this occurrence.** 13 of 14 images in the same run on the same runner are byte-identical to baseline. An encoder that varied by runner would move many images, not one. More conclusively, WebP encoding cannot change an element's **geometry** — 320x164 to 320x291 is a layout change, so the input PNG differed, so the render differed.
- **The two rows are one class and are closed together.** Stated by both rows (`BACKLOG.md:26`, `BACKLOG.md:775`).
- **No baseline is recaptured, on any branch or host.** The byte-pin discipline in AGENTS.md stands. A recapture would overwrite pinned bytes with whatever the fault produced. This spec never regenerates a baseline; it makes the fault refuse to become one.
- **The instrument still ships even though the mechanism is named** — see §5 and §7. The predecessor occurrence is same-class *compatible*, not proven.
- **Detection is structural, not copy-string matching.** Ratified by the orchestrator 2026-08-22. Matching the sentence at `components/admin/RecentAutoAppliedStrip.tsx:45` would pin one card out of an open set; the repo has 62 `infra_error` consumer branches across 45 files under `components/` and `app/` (measured, §4.1).

---

## 2. Why the capture cannot currently tell a degraded render from a healthy one

`waitForQuiescence` (`scripts/capture-core.ts:96`) waits for the selector to be **visible**, then `networkidle`, then `document.fonts.ready`, then a double-`requestAnimationFrame` flush, then a stable timeout. Every one of those conditions is about **paint stability**. A stably painted error card satisfies all of them perfectly. There is no assertion anywhere in the capture path that the render *succeeded*.

Three properties make the fault invisible rather than merely unhandled:

1. **The fault is server-side.** The `infra_error` is produced during the React Server Component render, inside the Next server on port 3004. The browser receives a 200 with well-formed HTML, so no browser-observable network signal exists to watch.
2. **The fault is silent in telemetry.** `lib/admin/loadRecentAutoApplied.ts` imports `log` (`lib/admin/loadRecentAutoApplied.ts:28`) but none of its five `infra_error` return sites log anything; the only emit in the file is an unrelated payload-validation warning. The failing run's job log contains no trace of the read failure. This is why the diagnosis required an artifact download rather than a log read.
3. **A passing run records nothing at all.** `.github/workflows/screenshots-drift.yml` uploads the capture artifact only `if: failure()`. There is no record from a passing run to compare a failing one against, which is precisely why the predecessor occurrence could never be diagnosed.

---

## 3. Convergence criterion, probe domain, threat fence

**Threat fence.** This guard defends against *environment-transient infrastructure faults during capture* — a Supabase read or RPC that fails once and succeeds on retry. It does not defend against an adversary who can author components, and it does not attempt to classify every conceivable degraded rendering in the product. Inputs outside that fence file to §8, not to a review round.

**Probe domain.** An admissible probe is drawn from: the two rows' recorded runs; the live `screenshots-drift` workflow; the 14 manifest-declared capture surfaces (`scripts/help-screenshots.manifest.ts`); and captures the instrument itself produces. A constructed component that no manifest entry reaches is outside the domain.

**Consequence bound (closable).** Over that domain: a capture whose render carried a recorded infra fault is **refused and reported by name**, never encoded into a baseline candidate. A capture the detector cannot classify is refused conservatively with the reason surfaced — a conservative refusal plus a surfaced signal is a documented limit, not a finding.

**Convergence criterion.** The instrument records runner identity and wall clock on **both** outcomes; the degraded-render gate refuses every manifest-reachable degradation branch; the discrimination table in §6 assigns exactly one mechanism to each possible reading of one recurrence. Settled mechanically by the acceptance tests in §9, not by argument.

---

## 4. Deliverable A — refuse to encode a degraded render

### 4.1 Why the signal is created rather than discovered

There is no shared error-card component to hang a testid on. Measured on this tree:

| population | count | why it is not the chokepoint |
| --- | --- | --- |
| `kind: "infra_error"` producers under `lib/`, `app/`, `components/` | 368 | no factory; instrumenting producers is a 368-site change |
| `infra_error` consumer branches (`=== "infra_error"`, `isInfraError(`) under `app/`, `components/` | 62 across 45 files | open set; enumerating it is the losing move |
| Supabase client factories in `lib/supabase/server.ts` | 2 (`lib/supabase/server.ts:33`, `lib/supabase/server.ts:79`) | genuine chokepoint, but wrapping PostgREST's thenable builders puts 158 call sites at risk for a CI-only signal |

So the signal is **declared on the degradation branch and enforced over a closed, manifest-derived population** — the shape this repo already uses for exactly this problem.

### 4.2 The shape, mirroring the guard that already exists

`tests/help/_metaServerTimeGuard.test.ts` enforces the `nowDate()` contract over a population **derived from the capture manifest**: `discoverScanRoots()` (`tests/help/_metaServerTimeGuard.test.ts:11`) seeds with `"components"` and adds `app/<first-segment>` for every `route:` in `scripts/help-screenshots.manifest.ts`. A new manifest entry widens the guard's population automatically.

Deliverable A adopts that established shape rather than inventing machinery:

1. **`data-degraded` on the degradation branch.** Every `infra_error` render branch reachable from a manifest capture surface carries `data-degraded="<reason>"` on the element it already renders. For `RecentAutoAppliedStrip` this is one attribute beside the existing `data-testid="auto-applied-error"` at `components/admin/RecentAutoAppliedStrip.tsx:746`. No behavior change, no new copy, no §12.4 code (invariant 5 untouched — the attribute is not user-visible text).
2. **A derived-cover meta-test.** Walks the manifest-derived population, finds every branch conditioned on `infra_error`, and asserts the JSX it returns carries `data-degraded`. Fail-by-default: a new consumer branch, or a new manifest entry that pulls one in, fails until marked.
3. **The capture refuses.** Before encoding, `captureAll` asserts the captured subtree contains no `[data-degraded]`. On a hit the capture **throws**, naming the entry key, the theme, and every `data-degraded` reason found. The job fails as an infrastructure fault with an attributed message, not as an opaque byte drift — and no bytes are written.

The refusal is the whole point: today a transient fault silently produces a new baseline candidate and the operator sees `Bin 6148 -> 11408`. After this, the operator sees which surface degraded and why.

### 4.3 Guard conditions

| input | behavior |
| --- | --- |
| subtree has no `[data-degraded]` | encode and write, unchanged from today |
| subtree has one or more | throw naming entry key, theme, and each reason; write nothing |
| `data-degraded` present with empty value | treated as a hit; reason reported as `(unspecified)` |
| element outside `captureSelector` carries it | not a hit — the assertion is scoped to the captured subtree, matching what the gate pins |
| entry has no `captureSelector` (full-page capture) | subtree is the document; full-page entries are in scope |

### 4.4 Dimensional Invariants

**N/A — this change renders no element and moves no box.** The only product-source edit is one additional
HTML attribute (`data-degraded`) on elements that already render, at branches that already exist. No element
is added, removed, resized, or repositioned; no class string, layout container, or flex/grid relationship
changes. AC-2 in §9 is the executable form of this claim: the capture must reproduce every committed baseline
byte-for-byte on an unchanged tree, which no dimensional change could satisfy.

The one dimensional fact this spec relies on is an **observation**, not an invariant it introduces: the
degraded render of the captured inbox subtree is 320x291 against the healthy 320x164 (§1). That difference is
the defect being detected, not a relationship this change must preserve.

### 4.5 Transition Inventory

**N/A — the marked branches have no animated states and this change adds none.** `data-degraded` is a static
attribute evaluated once per server render; it has no client state, no mount/unmount transition, and no
`AnimatePresence` involvement. The capture additionally neutralises animation entirely before any assertion
runs: `disableAnimations` (`scripts/capture-core.ts:66`) registers a pre-navigation init script forcing
zero-duration animations and transitions, so no captured surface can present a mid-transition frame regardless
of this change.

---

## 5. Deliverable B — the instrument, on both outcomes

The rows asked for this and it ships regardless of §4, because §4 explains one occurrence and only fits the other.

Each capture run writes one evidence file into `public/help/screenshots/`, named capture-evidence.json (new, gitignored, uploaded as an artifact on **both** success and failure):

| field | source | what it discriminates |
| --- | --- | --- |
| `runnerName`, `runnerArch`, `runnerOs` | `RUNNER_NAME` / `RUNNER_ARCH` / `RUNNER_OS` | runner-population effects |
| `cpuModel`, `cpuCount` | `os.cpus()` inside the pinned image | encoder SIMD-path bimodality |
| `capturedAtUtc` per entry | capture-time clock | time-of-day effects |
| `frozenClockInstant` per entry | the manifest entry | proves the frozen clock was applied |
| `pngWidth`, `pngHeight`, `pngSha256` per entry | pre-encode PNG | **separates a content change from an encoding change** |
| `webpBytes`, `webpSha256` per entry | post-encode WebP | matches what the gate compares |
| `degradedHits` per entry | §4 detector | attributes a refusal |

`pngSha256` beside `webpSha256` is the field neither row asked for and the one that closes the discrimination in a single run: an identical PNG with a differing WebP is an encoder difference; a differing PNG is a render difference. The existing artifact upload is post-encode only, which is why the 2026-08-21 diagnosis needed a geometry measurement to reach a conclusion the instrument will state directly.

The upload changes from `if: failure()` to `if: always()`, keeping the drifted-capture upload as-is and adding the evidence file. A passing run must leave a record or the comparison population can never be built.

---

## 6. Discrimination table — one recurrence assigns one mechanism

| reading of the next recurrence | mechanism named |
| --- | --- |
| `degradedHits` non-empty | **degraded render** (this spec's mechanism). Capture refused; no drift reported. |
| `degradedHits` empty, `pngSha256` differs from the passing run's, same `runnerName`/`cpuModel`, different `capturedAtUtc` band | **time-dependent render.** Row 1's mechanism 1, alive again. |
| `degradedHits` empty, `pngSha256` **identical**, `webpSha256` differs | **encoder bimodality.** Row 2's mechanism 2 — and the differing `cpuModel` names the population. |
| `degradedHits` empty, `pngSha256` differs, same time band, different `cpuModel` | **runner-dependent rendering** (font/raster stack), distinct from encoder bimodality. |
| `degradedHits` empty, everything identical, gate still red | baseline/committed-bytes problem, not a capture problem. |

Every row is decided by fields recorded on both outcomes, so one recurrence suffices. The two-well-separated-times capture the rows describe is retained as the *scheduled* probe for the second row only, and it is no longer the only way to reach an answer.

---

## 7. Row dispositions

- **`BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` — SOLVED.** Mechanism named and repaired; both filed candidates refuted with the evidence in §1. Archived on merge.
- **`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — PROBED-INSTRUMENTED, mechanism COMPATIBLE but NOT PROVEN.** Its `dashboard-overview-light.webp` occurrence (77670 to 82600 at `b5aa6ef7`) is past artifact retention and cannot be replayed. The full-page `dashboard-overview` capture mounts the same strip, so the same mechanism fits — but *fits* is not *proven*, and 0/9 dispatched reproductions remain consistent with a rarer effect this spec does not address. **The trap stays set.** The row stays open with §6 as its reading procedure and re-closes only on a recurrence that §6 attributes.

That distinction is deliberate. Closing the second row on the first row's evidence would be exactly the false certification this project keeps filing against.

**Sibling class:** `BL-ADMIN-LOADER-CI-TRANSIENT` records transient admin-loader failures in CI and is claimed by PR #875, in flight. Same fault class, different consumer. Wording is coordinated through the orchestrator and that row is not edited by this arc.

---

## 8. Documented limits

1. **Coverage is the `infra_error` class reachable from the manifest**, not every degraded rendering. A thrown render caught by an error boundary, or a Suspense fallback that never resolves, is not marked by §4 unless its branch carries the attribute. Re-file trigger: a recurrence whose `degradedHits` is empty and whose PNG differs with no time or CPU correlate.
2. **A live Postgres wall-clock dependency exists in the enclosing render and is left in place.** `purgeAndRotateIfStale`, called on every `/admin` request from `app/admin/page.tsx`, runs `now()` and `now() - interval '24 hours'` in inline SQL (`lib/onboarding/sessionLifecycle.ts:351`, and again at lines 352, 355 and 388). The `X-Screenshot-Frozen-Now` header cannot freeze Postgres time. It cannot explain the observed drift — the captures render the Dashboard branch, which is what the baseline image shows — but it is a real time-dependent input to a captured route and is recorded here rather than repaired, because the repair is a schema-time-source decision outside this arc's scope. Re-file trigger: any recurrence attributed to row 2 of §6.
3. **The server-time guard's population excludes `lib/`.** `discoverScanRoots()` (`tests/help/_metaServerTimeGuard.test.ts:11`) covers `components` plus manifest-derived `app/` segments; `lib/**` is never walked, and `.sql` is excluded by the extension filter (`tests/help/_metaServerTimeGuard.test.ts:48`). An unwaived survivor demonstrates the gap live: `lib/admin/loadAppEvents.ts:45` calls `new Date(Date.now() - sinceH * 3_600_000)` with no waiver. Peer instance of this arc's class, deferred under class-sweep exception (c) — widening the guard to `lib/**` is a redesign of a surface this PR does not otherwise touch and would pull an unbounded waiver population into a CI-fidelity diff. Filed as a follow-up row.
4. **The instrument records; it does not retry.** A retry-on-degraded policy would mask fault *rate*, which is the signal the sibling row needs. Deliberate.

---

## 9. Acceptance criteria

- **AC-1** A capture whose surface renders an `infra_error` branch throws, names the entry key and theme and reason, and writes no bytes. Proven by an injected loader failure, not by a mocked component.
- **AC-2** A healthy capture is byte-identical to today's output. The gate must not move a single committed baseline; this is verified by running the capture on an unchanged tree and asserting `git diff --exit-code public/help/screenshots/`.
- **AC-3** The derived-cover meta-test fails when an `infra_error` branch reachable from the manifest lacks `data-degraded`, proven by a mutant that removes the attribute.
- **AC-4** The meta-test's population is derived from the manifest, proven by a mutant adding a manifest entry whose route pulls in an unmarked branch.
- **AC-5** The evidence file is written and uploaded on **both** a passing and a failing run, with every §5 field populated. Proven against a real dispatched run, not locally only.
- **AC-6** `pngSha256` and `webpSha256` are recorded separately and differ independently — proven by a fixture where the PNG is fixed and the encoder settings move.

**Anti-tautology note.** AC-1 must inject the failure at the loader boundary so the real branch executes; asserting that a hand-constructed `infra_error` prop renders a card would prove only that React renders props. AC-2 is the one that catches the whole class of "the gate now passes because it stopped looking."
