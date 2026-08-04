# Self-host Inter so the app and its harnesses read one face — closing BL-HARNESS-FONT-FIDELITY

**Date:** 2026-08-03
**Branch:** `spec/harness-font-fidelity`
**Closes:** `BL-HARNESS-FONT-FIDELITY` (BACKLOG.md)
**Class:** test fidelity / CI determinism
**UI surface:** yes — `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css`, `DESIGN.md`. Invariant 8 (impeccable critique + audit dual gate) applies.

---

## 1. Problem

PR #676 wired Inter at both Next roots and bound `--font-sans` to `var(--font-inter)`, so every React-root surface now renders the committed **sans** family where the sans token applies (the four rootless auth HTML responses excepted — §1.1, and the app's deliberate monospace surfaces excepted — §4.2). `BL-HARNESS-FONT-FIDELITY` is the residual it filed: the standalone e2e harnesses have no Next runtime, so no `@font-face` reaches them, and they resolve the inline `var()` fallback pair and land on the ambient host font — SF Pro locally, DejaVu Sans on the Ubuntu runner.

**The exposure is broader than the entry's "cost today is zero" suggests.** Measured on this branch:

| Population | Count |
| --- | --- |
| `compileEntryCss` callers (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`) | 31 |
| …that measure font-dependent geometry (`getBoundingClientRect`, `scrollWidth`, `offsetWidth`, `boundingBox()`, or `toHaveScreenshot`) | **28** |
| …that pin a font themselves | **1** (`tests/e2e/section-header-layout.layout.spec.ts:182`) |

Cost is zero because nothing has drifted, not because few tests are exposed. Twenty-eight harnesses measure geometry the font determines and one of them controls for it.

**The predicate matters, and round 10 caught it too narrow.** An earlier count omitted Playwright's `locator.boundingBox()` and reported 25. Three callers are reachable only through it — `toggle-edge-layout`, `autoAppliedCardGrid.layout` and `dataQualityBadge.layout`, the last of which describes a font line-box invariant in its own header comment. The counts below are recomputed with `boundingBox()` included.

**The app side has its own unpinned input.** `next/font/google` fetches from Google at build time. The bytes are whatever Google serves that day: no lockfile entry, no hash, no diff to review. The repo runs byte-comparison gates downstream (50 committed PNGs, 14 WebPs), and AGENTS.md's byte-gate discipline exists precisely because inputs like this drift silently.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Self-hosting one face, read by both the app and the harnesses, is the chosen direction.** Owner-selected 2026-08-03 over (a) giving `compileEntryCss` its own committed copy alongside `next/font` and (b) leaving harnesses ambient and pinning per-test. Those are the two alternatives `BL-HARNESS-FONT-FIDELITY` names; neither is an open option here. | BACKLOG.md, `BL-HARNESS-FONT-FIDELITY` **Work:** paragraph. |
| **`DESIGN.md` §2.1's `next/font/google` mechanism is superseded by this spec, deliberately.** The entry flags that doing so "needs a spec, not a patch" — this is that spec, and §6 carries the amendment. The *typeface* commitment (Inter, one family, no display/body pairing) is untouched; only the delivery mechanism changes. | `DESIGN.md:133`; BACKLOG.md `BL-HARNESS-FONT-FIDELITY`. |
| **This is not a change of typeface, and that is what makes it safe.** The seven subsets committed here are byte-identical to the artifacts `next/font` already downloads and serves — verified, hashes in §3.3. Self-hosting moves the same bytes under repo control; it does not repaint the product. | §3.3. |
| **PR #676's binding shape is kept, not revisited.** `--font-sans: var(--font-inter, "Inter", "Inter Fallback"), …` (`app/globals.css:113-115`) with the inline `var()` fallback is deliberate: it keeps the declaration valid at computed-value time on any surface without the token, which is exactly the harness case. This spec changes what *defines* `--font-inter`, not the consuming declaration. | `app/globals.css:102-116` (the comment states the reasoning inline). |
| **The ~10% swap reflow #676 fixed stays fixed.** That work measured first paint snapping 187.28px → 168.91px on a real string before the metric-matched fallback was reachable. Any design here preserves a metric-matched `Inter Fallback` in the family list. | `app/globals.css:102-112`. |
| **The Arial pin at `tests/e2e/section-header-layout.layout.spec.ts:182` is not widened.** Its comment records the reason inline, and `BL-HARNESS-FONT-FIDELITY` explicitly refuses widening it as a resolution. Whether that pin should be *retargeted* at Inter once harnesses render Inter is a §5 question, not a licence to loosen the assertion. | `tests/e2e/section-header-layout.layout.spec.ts:165-183`; BACKLOG.md `BL-HARNESS-FONT-FIDELITY`. |
| **Four hand-built HTML auth responses are out of scope, and that limit is inherited rather than newly decided.** `app/api/auth/google/start/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `app/auth/callback/route.ts` and `app/auth/sign-out/route.ts` return complete HTML that mounts no React root, so no root layout and no stylesheet import reaches them. PR #676's review ratified this and filed it separately; an earlier draft of *this* spec silently widened G1 to "the app", restoring a claim that was already refuted once. It is fixed above, and it is not reopened here — expanding into auth plumbing belongs to the filed entry, not to harness fidelity. | `BACKLOG.md:1404` (`BL-AUTH-INTERSTITIAL-FONT`, filed 2026-08-03 from that review's R5). |
| **No database object is touched.** The tier × domain and CHECK/enum matrices (`docs/agents/spec-self-review.md:15` and `docs/agents/spec-self-review.md:16`) are N/A, stated rather than omitted. | — |
| **No new prop, input, or config flag.** Guard-conditions-per-prop (`docs/agents/spec-self-review.md:7`) and the flag lifecycle table (`docs/agents/spec-self-review.md:17`) are N/A. | — |

---

## 2. Goals and non-goals

**Goals**

- G1. Every Next-rendered surface **with a React root**, and all 31 harnesses, resolve **the family the committed manifest expects for them** — Inter, from the same committed files, wherever the sans token applies. The four rootless HTML responses are excluded by a ratified limit (§1.1), and monospace text is deliberately out of scope (§4.2): the app ships **two** families, and an earlier wording of this goal said "the same Inter face", which would have made the guard reject correct pages.
- G2. The font bytes are pinned in the repo by hash, so an upstream change is a reviewable diff rather than silent baseline drift.
- G3. No build-time network fetch for fonts.
- G4. The metric-matched fallback #676 introduced stays reachable, and its absence is caught statically.
- G5. `DESIGN.md` describes the mechanism that actually ships.

**Non-goals**

- N1. Changing the typeface, the family commitment, or the `--font-sans` consuming declaration.
- N2. Changing subset coverage. All seven subsets Google serves are committed, which is exactly what `next/font` downloads today (§3.3).

  **This looks like a contradiction in the source and is not — worth stating, because the inference is easy to get backwards.** `app/fonts.ts:30` declares `subsets: ["latin"]`, one subset, which reads as though six of the seven committed files are an expansion of coverage rather than parity with it. They are not: `subsets` selects which faces get a **preload hint**, not which files are fetched. A production build on this branch emits **seven** `.woff2` files under `.next/static/media/`, and their SHA-256 set is **identical** to the seven committed here — verified by building and hashing both sides, not inferred from the loader call. So the byte-identity claim above covers all seven files, and shipping seven changes nothing about what a reader downloads; it changes only who serves them.
- N3. Widening any existing tolerance to accommodate the new rendering.
- N4. Adding a theme-, weight-, or optical-size-switching mechanism.

---

## 3. Design

### 3.0 Artifacts this spec creates

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->

- `app/fonts.css` — the seven `@font-face` rules, the `Inter Fallback` face, and the `--font-inter` definition. Referred to below as "the fonts stylesheet".

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->

- `public/fonts/` — the seven committed `.woff2` subsets plus `OFL.txt`.

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->

- **Create (new, untracked):** `tests/styles/fontLoading.test.ts` (the static guard, §4.1), `tests/e2e/harness-font-face.spec.ts` (the harness-side guard — emitted-CSS descriptors, bare-sibling resolution, copied-artifact hashes, `font-display: block`, §4.1), `tests/e2e/font-rendering-census.spec.ts` (the runtime oracle over the route census, §4.2), `tests/e2e/helpers/fontFidelityFixture.ts` (the shared fixture distributing that oracle to the 31 harness callers, §4.1), `tests/e2e/_metaFontFidelityWiring.test.ts` (the structural meta-test asserting every `compileEntryCss` caller imports it, §4.1), and `tests/e2e/helpers/monoSurfaces.ts` (the frozen mono manifest and its freshness assertion, §4.2).

And one it deletes: `app/fonts.ts`, whose only export is the `next/font` loader instance both roots consume for its generated class name. With a self-hosted face there is no generated class; `--font-inter` is defined in CSS, so `app/layout.tsx:58` and `app/global-error.tsx:31` drop the `inter.variable` fragment from their `className` and the module goes away.

**Retiring it is not a one-file delete, and round 1 was right that the draft under-scoped it.** Three existing surfaces encode the `next/font` mechanism and each needs an explicit disposition, given here so two implementers cannot choose differently:

<!-- spec-lint: ignore — the file is retired by this spec; the row is its disposition -->

| Surface | Encodes | Disposition |
| --- | --- | --- |
| `tests/assets/singleFontLoader.test.ts` (`tests/assets/singleFontLoader.test.ts:218` defines `CANONICAL_LOADER = "app/fonts.ts"`; asserted at `tests/assets/singleFontLoader.test.ts:440` and `tests/assets/singleFontLoader.test.ts:456`) | that `app/fonts.ts` is the sole loader and is invoked exactly once | **Replaced, not deleted.** Its contract — one family, one delivery point, no second loader — is exactly what §4.1's repo-wide "no file in the source census imports `next/font`" row now carries. Retarget this file at the self-hosted mechanism rather than dropping it, so the anti-drift intent survives the mechanism change. |
| `tests/observe/globalError.test.tsx:61` | that the crash screen carries the loader's generated variable class, "so `--font-inter` resolves here too" | **Assertion changed, test kept.** The intent — the crash screen resolves `--font-inter` — is exactly right and is the gap #676 had to fix. Under self-hosting the mechanism is the stylesheet import, so the assertion becomes that, and §4.1 carries the same check statically. |
| `tests/setup.ts:113-135` | a global `next/font/google` mock, because the real loader throws outside Next's build pipeline | **Removed.** With no `next/font` import anywhere under `app/`, nothing needs the mock, and leaving it is dead infrastructure that would quietly permit a reintroduction. |

Each is a red-then-green step in its own right: the retargeted assertions must fail against the current tree before the mechanism swap lands.

**Two more files describe the retired mechanism in prose and must be corrected with it** (round 11): `app/show/[slug]/layout.tsx:20` says "The loader now lives at `app/fonts.ts`", and `tests/e2e/font-binding.spec.ts:5` says the family is "loaded via `next/font/google` from `app/fonts.ts`" — plus mechanism-specific names and failure messages further down. §4.2 says that spec's *assertions* are untouched, which stays true; its comments are not, and shipping them would leave the tree documenting a module this change deletes.

### 3.1 The app side

The fonts stylesheet declares, in this order:

1. Seven `@font-face` rules, one per subset — `font-family: "Inter"`, `font-style: normal`, `font-weight: 100 900`, `font-display: swap`, a `src: url(...)` pointing at the committed file, and that subset's `unicode-range` verbatim from §3.3.
2. The metric-matched fallback, reproducing what `next/font` computes today so the reflow fix from #676 survives unchanged:

   ```css
   @font-face {
     font-family: "Inter Fallback";
     src: local("Arial");
     ascent-override: 90.44%;
     descent-override: 22.52%;
     line-gap-override: 0%;
     size-adjust: 107.12%;
   }
   ```

   These are Next's precomputed Capsize figures for the Inter family, **not** a derivation from the committed subset bytes, and §3.4 records why that distinction matters and is deliberate.

3. `--font-inter: "Inter", "Inter Fallback";`

It is imported by both Next roots — `app/layout.tsx` and `app/global-error.tsx` — for the same reason `app/fonts.ts` is imported by both today: the global error boundary renders its own `<html>` and replaces the root layout, so anything the root sets up is absent there (`app/global-error.tsx:8-13` states this inline).

`app/layout.tsx` also gains a preload link for the latin subset only, matching what `next/font` preloads today — verified, not assumed: the production build's font manifest lists exactly **one** preloaded file across every app route, the 48,432-byte latin subset (Next marks it with a `-s.p.` infix in the emitted filename). This is also where the `subsets: ["latin"]` declaration actually has its effect, which is the distinction N2 above turns on: it chose the preload, never the download set.

```tsx
<link rel="preload" as="font" type="font/woff2" href="/fonts/inter-latin.woff2" crossOrigin="anonymous" />
```

`crossOrigin` is the JSX spelling; the raw-HTML `crossorigin` fails `pnpm typecheck` against React's `LinkHTMLAttributes`. `app/layout.tsx:58` renders `<html>` directly with no explicit `<head>`, so the tag goes in the JSX and React 19 hoists it.

### 3.2 The harness side

`compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`) is a single choke point: it runs the Tailwind CLI over a caller-supplied entry CSS and writes one `outFile`. All 31 callers serve that output as a static file beside their markup.

It gains one responsibility: alongside the stylesheet it already writes, emit the fonts stylesheet's `@font-face` block and copy the seven `.woff2` files into the same output directory, with `src` URLs relative to it. Because every caller already serves that directory, all 31 gain the real face at once with no per-caller change.

**The static guard parses with Lightning CSS, in Node, and that is a correction round 20 forced.** The guard reached its final shape by elimination. A regular expression was broken twice — `SRC:` in round 18, `s\72 c:` in round 19 — because a regex over a formal grammar is that defect by construction. The repair was to parse with the browser's own CSSOM, which closed both classes. Round 20 then showed the repair had moved the problem rather than solved it: `CSSStyleSheet` does not exist in Node, `unit-suite` runs this file under Node Vitest, and neither it nor the shared setup installs a browser. A guard that cannot run in the gate that is supposed to run it is not a guard.

Lightning CSS resolves it, and the reason it is the right parser is not convenience. It is **the parser that already compiles this exact file**: it reaches the repo at a single version through `@tailwindcss/cli` and `@tailwindcss/postcss`, which are what build `app/globals.css` and what `compileEntryCss` drives for every harness entry. Checking the stylesheet with the compiler's own front end is a stronger claim than checking it with an arbitrary browser engine, because the compiler is what the bytes actually pass through.

It is also a structurally better instrument than CSSOM, which is worth stating because "we changed parsers" otherwise reads as a lateral move:

- `src` arrives **decomposed** — `[{type:"url", value:{url, format:{type:"woff2"}, tech:[]}}]` — so "exactly one source, a URL, woff2, no `tech()`, no `local()`" is four field reads rather than a pattern. The round-13 `format()`/`tech()`/extra-comma mutants die on shape, not on spelling.
- `unicode-range` arrives as **numeric intervals** (`[{start:880,end:887}, …]`), so the hand-rolled interval parser the CSSOM version needed is gone.
- Metric overrides arrive as **percentage floats** (`0.9044`), so round 17's "wrong values, right ones in a comment" mutant cannot survive a textual near-match.
- Descriptor names are canonical, which is what closes rounds 18 and 19: `@FONT-FACE` and `@font-f\61 ce` both normalise to `font-face`, and `s\72 c` normalises to `src`, so the escaped duplicate is visible and last-wins is inspectable.

Re-validated end to end after the port, and the port found two genuinely weak assertions of its own that the earlier instrument had also carried: a URL check that accepted a greek URL nested one directory deeper (a "sub" segment inserted before the filename) because it only tested a `/fonts/` prefix, and a `--font-inter` check that accepted a trailing `, Arial` because it matched by substring. Both are now exact — full path equality, and an exact token sequence. **32/32 mutants killed, 17/17 rows passing, no browser.**

**The harness guard checks map equality, not membership — round 23 found it checking neither.** Its cross-block row located *some* app face with a matching `unicode-range` and compared inventory, weight, style and family, never the source. Three mutants walked through it: latin's face duplicated over greek's, filenames permuted among subsets, and an unsupported `format()` hint. That is the same existential-vs-map defect the app-side row was corrected for in an earlier round, reintroduced on the other side of the boundary because the harness instrument was written fresh rather than mirrored from the app one. The rows now key on the subset name in each emitted filename and require a **bijection** onto the app faces, then compare each emitted face against *its own* counterpart's range and descriptors, and pin the source shape (one `url`, typed `woff2`, no `tech`). **10 rows, 11 mutants**, and all three escapes die.

**The spike is committed, because round 21 proved a `/tmp` spike is not evidence.** The reviewer ran the path this spec named, found a regex-era file, and correctly reported that the Lightning CSS guard did not exist — the guard did exist, at a different `/tmp` path, which is worse than the alternative: the spec's central executable claim was unverifiable by the one party whose job is to verify it. Both artifacts now live at `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/static-guard.mjs` and `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs`, with running instructions in that directory's `README.md`. They are tracked, so any reviewer can reproduce `17/17 rows passing` and `32/32 mutants killed` rather than take it on report. No claim in §4.1 rests on a file outside the repo.

**What the spike instrument covers, stated so its results are not over-read.** Two different things in this spec are called spiked, and they cover different halves. The *mechanism* — below — is spiked end to end, through the real `compileEntryCss` path, and that is what establishes the harness half works at all. The *static guard* is a separate instrument: it parses the app stylesheet with **Lightning CSS** and is validated by mutation, currently **32 mutants, all killed, across 17 assertions**. Those 32 are aimed at the app stylesheet. **The harness-side rows are now covered too, and by their own instrument** — an earlier draft of this paragraph disclosed them as an open gap, which they no longer are. `harness-guard.mjs` in the spike directory simulates the target-state post-step (rewrite `/fonts/` URLs to bare siblings, `swap` to `block`, copy the seven files beside the output) and checks the four §4.1 harness rows plus their preconditions: **10 rows, and 11 mutants, all killed** — a subdirectory URL with the files copied correctly, latin's bytes copied under all seven names, `block` collapsed to `swap`, an impostor face sourcing `local("Arial")`, a missing sibling, an absolute `/fonts/` URL leaking into the harness block, a rogue descriptor in the emitted block only, and a byte-corrupted copy.

So the executable evidence is **27 rows and 43 mutants across two instruments**, app-side and harness-side, all tracked and reproducible. What remains genuinely unspiked is the runtime oracle's wiring into the 31 callers, which needs the fixture the plan builds — the fixture's *mechanism* is prototyped (below), its *distribution* is not.

**The mechanism is spiked, not assumed.** Compiling `app/globals.css` through the Tailwind CLI as `compileEntryCss` does, appending the seven-face block with bare sibling filenames and `font-display: block`, copying the seven files beside the output and serving the directory: the harness renders real Inter, with the oracle 0.008px from the expectation computed from the committed bytes and zero failed requests. Six faces stay `unloaded` and two load — the latin subset and `Inter Fallback` — which is correct `unicode-range` behaviour for ASCII text, and a useful negative result: an "all seven faces loaded" assertion would be wrong.

This is the step that self-hosting makes possible. Under `next/font` there is no file to copy — the bytes exist only inside a Next build — which is why the entry's alternative (a) required a *second*, independently-committed copy and carried drift risk by construction. With one committed source there is one set of bytes and nothing to drift against.

**How the 28 are derived, so the count is reproducible rather than asserted.** The predicate is *the spec builds its own document through the standalone harness toolchain* — `compileEntryCss` at `tests/e2e/helpers/liveEntryToolchain.ts:124`, or a sibling that calls it — because that is precisely the set whose CSS the app's `<head>` never reaches. It is NOT "reads geometry": 56 e2e specs read geometry, and the partition between the two halves is exact and empty in the middle.

```
$ rg -l 'boundingBox\(\)|getBoundingClientRect|offsetWidth|scrollWidth|clientWidth' tests/e2e --glob '*.spec.ts' | wc -l
56
# of those, using the standalone harness toolchain: 28   (every one named below)
# of those, navigating to the dev server instead:   28   (0 overlap)
```

The other 28 — `layout-dimensions`, `crew-layout-dimensions`, `admin-layout-dimensions`, `help-typography` and 24 more — navigate to the running app with `page.goto` or a `goto*` helper, so they already receive the real font from PR #676 and are out of scope by construction, not by omission. Any future spec that calls `compileEntryCss` joins the census automatically; the predicate is a `rg` invocation, not a hand-maintained list.

**Delivering the face is necessary but NOT sufficient, and round 3 is where that surfaced.** Of the 28 font-sensitive callers, only three synchronize on font loading: `resolve-label-layout`, `skeletonBandParity` and `stackedBandLayout` await `document.fonts.ready` explicitly. **`section-header-visual` does NOT count**, which round 19 established: it reads `link.boundingBox()` at `tests/e2e/section-header-visual.spec.ts:240` *before* `toHaveScreenshot()` at `tests/e2e/section-header-visual.spec.ts:247`, and Playwright awaits fonts only inside screenshot preparation — an ordinary `boundingBox()` delegates straight through. Its screenshot is synchronized; its geometry read is not. **The other 25 measure geometry with no synchronization at all.** Per CSS Font Loading Module Level 3, sizes and positions are not final until that promise settles; hand those callers a `font-display: swap` face and they can measure the fallback frame and then have *fallback* metrics re-derived into their pinned figures — which would be a worse outcome than today, because today's ambient measurement is at least stable.

Two changes close it, and the spec requires both:

1. **The harness-emitted face uses `font-display: block`, not `swap`.** This is a deliberate divergence from the app, and the reason is that the two environments want opposite things: a reader must never stare at invisible text, so the app swaps; a measurement harness must never measure the wrong face, so it blocks. The files are served from the same directory the page is served from, so the block period is a local read.
**The work is 88 navigation sites, not 25 waits, and that is the number the plan carries.** §5 counts files because files are what get edited; the invariant counts documents, and the two differ by more than a factor of three. Derived the same reproducible way as the census:

```
# navigation sites across the 25 callers
$ rg -c 'setContent\(|page\.goto\(|renderEntry\(|mountEntry\(' <the 25 files>
88 total; 15 of the 25 files have more than one; section-header-layout.layout has 14
```

Seven of that file's fourteen sit **inside loops** over cells and viewports, so the count of runtime documents is higher still and is not statically knowable. **Read that as a count, not as a placement rule** — round 21 caught the two colliding, and the placement rule is round 6's, unchanged. Navigation sites are how the *documents* are counted, because each one begins a document; they are not where the await goes. Nine of these callers navigate and only then wait for hydration, so awaiting fonts at the `goto` would run against a document with no text in it — the precise failure round 6 established. The await goes **where round 6 put it: after the content under measurement is present, and before that document's first geometry read.** In a loop body that lands once per iteration, which is what makes the per-document invariant hold without anyone enumerating iterations; per file it would leave thirteen documents unsynchronized in `section-header-layout.layout` alone while satisfying a reviewer who counted files.

2. **The 25 unsynchronized callers await `document.fonts.ready` once per measured document** — the invariant stated below; not once per file, not per navigation, and not per geometry read. `font-display: block` makes the race vanishingly unlikely; awaiting makes it impossible, and it is the guarantee the specification actually offers. The list is enumerated in §5 so the work is countable rather than discovered.

   **Per document, because 16 of the 25 create more than one.** Recomputed on this branch: `agendaScheduleLayout`, `appHealthIndicator.layout`, `autoAppliedCardGrid.layout`, `bulk-ignore-eyebrow.layout`, `compact-alert-card-layout`, `dataQualityBadge.layout`, `developer-toggle-layout`, `hoverhelp-geometry`, `pendingDiscardReal.layout`, `pendingDiscardReflow.layout`, `popover-clip-fit`, `section-header-layout.layout`, `section-header-visual`, `statusStripToggleLayout`, `step3-review-modal.interactions`, `step3-review-page.layout`. `section-header-visual` is the sixteenth: its one `page.goto` executes inside a test loop, so it is single-site but multi-document, which is the distinction this paragraph turns on. An earlier draft said 13 and listed 13 — it predated the `boundingBox()` predicate fix, which added `autoAppliedCardGrid.layout` and `dataQualityBadge.layout` to the multi-document set. A promise settled against the first document says nothing about the second, so a per-file wait would leave every later navigation in these 16 unsynchronized while reading as done.

**And per-navigation is still not the right anchor, which round 6 established.** Nine of the 25 — `attention-pill-focus`, `bulk-ignore-eyebrow.layout`, `collapse-panel-morph`, `compact-alert-card-layout`, `hoverhelp-geometry`, `popover-clip-fit`, `step3-review-modal.agenda`, `step3-review-modal.interactions`, `wizard-blocker-modal.layout` — navigate to markup that is just `<div id="root"></div>` and only then hydrate. A wait placed right after that navigation settles against a document with no text in it, so it triggers no font load and guarantees nothing about the text React renders next. CSS Font Loading Module Level 3 is explicit that further fonts may load after `ready` fulfills, and that a measurement is safe only while nothing subsequently changes the document.

`font-display: block` does not rescue this either: during its block period text is laid out with an *invisible fallback*, so fallback metrics are exactly what a premature measurement records.

**The invariant, stated once so §4.1 and §5 can both point at it rather than paraphrase it:**

> In each of the 25 callers, every document that is measured is awaited: after the content under measurement is present and before the first geometry read **of that document**.

Round 7 measured what the loose phrasings would have meant across the then-known set — dozens of navigation sites and hundreds of geometry operations — and found earlier drafts saying "before its first measurement" in §5 while §3.2 and §4.1 said "before each measurement". Those are three different edits (21, 82, 206) and only one of them is both safe and proportionate. Per-document is safe because a settled promise covers every read of *that* document and says nothing about the next one; it is proportionate because 206 waits before 206 reads of one settled document buys nothing.

Naming only the first would leave a timing-dependent guarantee; naming only the second would leave 25 files each able to regress independently.

Per invariant 1 the wait edits are not a bulk mechanical pass: the §4.1 row above is written first and must fail against the current tree — where all 25 have zero waits, confirmed by probe — before any wait is added.

### 3.3 The committed subsets

All seven Google serves for Inter **v20**, each verified byte-identical to an artifact the current `next/font` build already emits. Two filenames per subset: the *source* it was fetched from, and the *local* name the stylesheet's `src` references.

| Subset | Bytes | SHA-256 | Local filename | gstatic source basename |
| --- | --- | --- | --- | --- |
| `cyrillic-ext` | 25844 | `fccca918fea40089dacadc7045861314d1a6bc91f1f323cc1eeb22ebcdb321b5` | inter-cyrillic-ext.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7W0Q5n-wU` |
| `cyrillic` | 18744 | `aebf2ab4a4ce6810d73c1ac7be7cafb4e5ec4cee2d6db5fb3e09691747ec4bd6` | inter-cyrillic.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7W0Q5n-wU` |
| `greek-ext` | 11272 | `a2e2c783ca6f9c20486e81e72a279203e86730bbf8f01ff6a5ee9dbd09e1c271` | inter-greek-ext.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2ZL7W0Q5n-wU` |
| `greek` | 19044 | `46dd4cdca58c26ae87cc6927657bf83b2e8abfc39ffd0ab176e301a8d28d22bf` | inter-greek.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1pL7W0Q5n-wU` |
| `vietnamese` | 10280 | `8db00ff46c67b22cda8bed865acf7077651cac8d2841d5b40980556b48961931` | inter-vietnamese.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2pL7W0Q5n-wU` |
| `latin-ext` | 85272 | `a28eb6d3ccb534ae0c94ca999371df024aab60b08c3c8a5720ee9e32fa0faaa2` | inter-latin-ext.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7W0Q5n-wU` |
| `latin` | 48432 | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` | inter-latin.woff2 | `UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw` |

Total 218888 bytes, fetched from `https://fonts.gstatic.com/s/inter/v20/<basename>.woff2`. `unicode-range` per subset, verbatim:

- `cyrillic-ext` — `U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F`
- `cyrillic` — `U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116`
- `greek-ext` — `U+1F00-1FFF`
- `greek` — `U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF`
- `vietnamese` — `U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB`
- `latin-ext` — `U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF`
- `latin` — `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`

Byte identity is the load-bearing fact: it is what makes G1 a *consolidation* rather than a re-render. Application rendering does not change, so the 14 admin help WebPs hold (§5).

<!-- spec-lint: ignore — new files created by this spec; not yet tracked -->

`public/fonts/OFL.txt` carries the SIL Open Font License 1.1 text Inter is distributed under.

### 3.4 Why the fallback overrides are not derived from the committed bytes

Running Next's own `getFallbackMetricsFromFontFile` against the pinned artifacts gives a *different answer per subset*, because subsetting changes the glyph set it measures:

| Source | ascent | descent | line-gap | size-adjust |
| --- | --- | --- | --- | --- |
| Next Capsize metadata for Inter (**adopted**) | 90.44% | 22.52% | 0.00% | 107.12% |
| Derived from `inter-latin.woff2` | 89.79% | 22.36% | 0.00% | **107.89%** |
| Derived from `inter-latin-ext.woff2` | 96.88% | 24.12% | 0.00% | **100.00%** |

A single `Inter Fallback` face cannot honor seven different derivations. The Capsize figures describe the whole unsubsetted family, which is what one family-level fallback stands in for, and they are the values `next/font` uses today — so adopting them keeps the swap frame identical to what ships now and preserves #676's reflow fix exactly.

Accepted and documented: against the latin subset specifically, Arial is scaled about 0.71% differently than a subset-exact derivation would. That affects only the pre-swap frame on a cold load, and it is unchanged from today.

On a font-version bump: re-derive the **Capsize** figures for the new version — not from the subset files — and update §4.1's pins together with the §3.3 hashes.

### 3.5 Dimensional Invariants

**N/A — no fixed-dimension parent is introduced or altered.** This change adds no element and no flex or grid relationship. `app/layout.tsx` swaps a stylesheet import for another and adds a `<link>` in `<head>` (hoisted, renders no box); `app/global-error.tsx` does the same; both drop a CSS-variable-carrying className fragment with no layout effect. Stated rather than omitted because `docs/agents/spec-self-review.md:11` makes the section mandatory for UI specs.

### 3.6 Transition Inventory

**N/A — no component with multiple visual states is added or modified.** No state machine, no `AnimatePresence`, no conditional render; with N = 0 new states the N\*(N-1)/2 enumeration required by `docs/agents/spec-self-review.md:12` is empty.

One time-varying behavior exists and is deliberately preserved: `font-display: swap` produces a fallback frame followed by the loaded face, with the shift minimized by the metric-matched `Inter Fallback` (§3.1). It is unchanged from what ships today, and §4.1 pins both `font-display` and the fallback's `src` because no test here can observe the pre-swap frame — every screenshot path awaits `document.fonts.ready` by design (`scripts/capture-core.ts:107`).

---

## 4. Guards

### 4.0 What the guards are for, and where enumeration stops

Nine review rounds have killed twelve escaping mutants against this design. They fall into two kinds, and the distinction is what keeps §4.1 from growing without bound:

**Kind A — the shipped inputs are wrong.** Wrong bytes, wrong pairing, a `local()` fallback, a URL that resolves nowhere, a missing import, a stale token, a second delivery mechanism. These are *finitely* enumerable because the inputs are: seven files, one stylesheet, two roots, one toolchain, one token. §4.1 pins them, and each row names the mutant it kills.

**Kind B — something, somewhere, renders the wrong family.** A route-local override, a runtime-registered face, a descendant rule, a state no navigation reaches. This class does **not** terminate by enumeration: any list of places to look is a list someone can render outside. Rounds 6 through 9 each produced another instance — a `.css` file, then source-authored `<style>` text, then `new FontFace`, then `.help-prose`, then an `<h1>`, then `page.mdx`, then `loading.tsx` — and each time the fix was to widen where we look rather than to find the last hiding place.

So Kind B is closed by **one general oracle**, not a list: walk every visible text-bearing element on every rendered surface, look up the family the manifest expects for it, and assert the rendering matches — for sans text, a normalised child probe against the byte-derived expectation (§4.2); for the app's monospace text, the mono chain. Computed-family resolution alone is NOT the oracle — it was measured identical across a real face and two impostors. It has no privileged place to look within the elements it can reach. **Completeness has five dimensions — rounds 15, 18, 24 and 27 each found one the previous statement had missed.** The first is the *surface census*, which §4.2's census derives from the framework's own config rather than from a hand list. The second is the *element class*: two classes cannot host a probe at all, and §4.2 closes them by a different mechanism rather than by pretending they do not exist.

The third is **glyph repertoire**, and it is closed. The child probe is ASCII, so on its own it exercises only the latin face; a face aliased as `Inter` but scoped to another range — `new FontFace("Inter", "local('Arial')", { unicodeRange: "U+0370-03FF" })` — would render the parent's Greek from the impostor while the ASCII probe measured the genuine latin face and passed. Six subsets would go unlooked-at, with a large signal (Inter Greek 86.92px against Arial Greek 76.02px).

The fourth is **font selection**, and it is the one round 24 found. The probe normalises weight and stretch so that a width comparison means something, and that normalisation is itself the blind spot: a face registered at runtime at `weight: "1000"` or a non-normal `stretch`, paired with a matching rule on visible text, is selected by the text while the probe at 400 selects the genuine face. It is closed not by normalising further — that cannot work, since the normalisation is the hole — but by asserting the **registered face set** through `document.fonts`, on family, weight, style, stretch and `unicode-range`. §4.2 carries the measurement and the probe output.

The fifth is **viewport**, and round 27 found it. The census as specified would land in the project that already runs `font-binding`, which is `desktop-chromium` at 1280×800 — so a rule as ordinary as `@media (max-width: 639px) { html { font-family: Arial } }` introduces no `@font-face`, leaves every static row intact, passes the entire census, and renders every mobile page wrong. That is the product's **primary** viewport, not an edge case: the app is mobile-first, `playwright.config.ts:68` pins the mobile project at 390×844, and there are text-bearing roots that only mount there. So the census runs at **both** viewports — 390×844 and 1280×800 — and the mobile pass is not optional, because a mobile-first product whose font guard only checks desktop has the guarantee backwards.

So the oracle additionally runs **one probe per committed subset, once per surface** — seven measurements, not seven per element, since the faces are global and a single element proves them. Measured:

| | result |
| --- | --- |
| all genuine | all seven subsets pass |
| impostor on `greek` | **only** greek fires |
| impostor on `cyrillic-ext` | **only** cyrillic-ext fires |

**The probe text is derived from the font files, not hand-written**, and two earlier attempts failed for exactly the reasons that makes necessary. For each subset, walk its `unicode-range` and take the first few codepoints that (a) are above U+0020 — spaces and controls pull in the latin face and make the baseline fire with everything genuine, (b) are outside ASCII for non-latin subsets, for the same reason, and (c) have a real glyph, rejecting any where `glyphForCodePoint(cp).id === 0`, because a `.notdef` has a real advance width and silently poisons the expectation, and (d) **have a nonzero advance in the committed face** — the filter §4.2 derives, and the one that matters most, because combining marks pass (a) through (c) and measure zero under every font. Hand-picked strings failed all three tests.

The derived strings look odd — `"!\"#$"` for latin — because the walk takes the first qualifying codepoints in range order. That is a feature: nothing is hand-maintained, and a font revision that drops a glyph shifts the probe automatically rather than quietly measuring `.notdef`. **Cyrillic is the case that proves filter (d) is load-bearing rather than decorative:** without it the walk's first qualifying codepoint is `U+0301`, a combining acute, and the whole subset would be checked with a zero-width string. §4.2 carries the measurements.

**Demonstrated against the hardest Kind B case, not argued.** Mutant nine — a rogue face registered at runtime via `new FontFace("Inter", "local('Arial')")`, added to `document.fonts`, applied through a CSSOM `replaceSync` rule, with the string `@font-face` appearing in no source anywhere:

| check | clean | under mutant nine |
| --- | --- | --- |
| computed `font-family` | `Inter, "Inter Fallback", …` | `Inter, sans-serif` — looks canonical, **passes** |
| `document.fonts` family set | `{Inter}` | `{Inter}` — the mutant adds a second same-named entry, **passes** |
| byte-derived child probe | 194.141 (δ 0.008) | **184.359 (δ 9.774) — fires** |

Both rejected formulations pass the actual attack; the child probe catches it. That is what makes the one-oracle claim above load-bearing rather than aspirational.

The acceptance criterion is the project's preparedness posture (`docs/agents/spec-self-review.md:24`) — every surface renders the family the manifest expects for it — Inter where the sans token applies, mono where the design calls for it — or a test says otherwise — **not** "no imaginable mutant survives". A new Kind B instance that the general oracle already catches is not a finding. A new Kind B instance that reveals a *surface the census misses* is, and it is fixed by widening the census, not by adding a row.

### 4.1 Static guard

Sibling precedent: `tests/styles/design-figure-parity.test.ts` and `tests/styles/focusRingContrast.test.ts` both read live `app/globals.css` and assert against a documented figure. Note that the former pins **contrast figures only** — it contains no font reference — so it is a shape precedent, not an existing font guard.

| Assertion | Failure caught |
| --- | --- |
| The fonts stylesheet declares **exactly seven** `@font-face` rules with `font-family: Inter`, **covering the seven distinct expected subsets**, and **no face declares any descriptor twice**. | Dropping a subset — and three multiplicity mutants round 14 ran against the built guard, all of which escaped a count-plus-pairs formulation. **Duplicate face:** replace the Greek rule with a second valid Latin rule — still seven faces, every filename/range pair still valid, but only six distinct subsets, so Greek falls through. **Duplicate descriptor:** append a second `src` (or `font-display`, or a `size-adjust` on the fallback) — the parser read the *first* declaration while **CSS applies the last**, so the shipped behaviour differed from the checked behaviour. The guard now parses last-wins, asserts the subset set is distinct and complete, and rejects any repeated descriptor on any face — descriptor-agnostically, since a fixed Inter-only list let a duplicated `size-adjust` on the fallback through. Matrix **20/20**. |
| For each face, `RANGES[filenameFromSrc] === face.unicodeRange` — **map equality**, so each filename pairs with *that face's own* range — each face's `src` is **exactly one `url()` plus `format("woff2")` and nothing else**, and that URL is **resolved** (not string-inspected) before checking where it points — no `local()`, no `tech()`, no additional comma-separated sources, and its URL carries **no path traversal and resolves to a committed file** — `/fonts/inter-*.woff2` in the app stylesheet, the bare sibling `inter-*.woff2` in harness-emitted CSS. Round 12 caught an earlier wording that demanded a bare filename on *both* sides, which contradicts the app's own target state and the spike alike; the invariant is "resolves to the right file", and the two contexts spell that differently because the file sits in different places relative to the stylesheet. | Two mutants. Permuting the source URLs among subsets passes a face count, a range set and every hash while Greek or Cyrillic text selects a file with none of its glyphs. And **the eleventh:** `src: local("Arial"), url(…inter-greek.woff2)` on the Greek face alone. The pairing still holds, the committed and copied hashes are still correct, app and harness descriptors are still equal, and the English rendered probes exercise the Latin face and stay green — but CSS takes the first available source, and this host's Arial covers Greek, so Greek renders Arial in the app *and* every harness. A `local()` component is never wanted here: the whole point of self-hosting is that the bytes come from the repo.

**And checking only for `local()` is not enough — round 13 broke the spike three ways.** `format("definitely-unsupported")`, a `tech(...)` with an unsupported value, and `url(A) format(unsupported), url(B) format("woff2")` all passed a rule that merely required the value to start with `url(` and contain no `local(`. Per CSS Fonts Level 4 source parsing, an unsupported `format()`/`tech()` **excludes** that source, so a later comma-separated source silently selects the wrong subset — and none of it is visible to an ASCII probe, since it applies to the six non-Latin faces. The rule therefore pins the entire `src` value, not a prefix. All three mutants are now in the matrix; it stands at **16/16**.

And **the twelfth applies app-side too, which round 9's repair missed.** It closed URL resolution only for `compileEntryCss`'s emitted CSS. An app face declaring a src of "./fonts/inter-greek.woff2" keeps its correct basename-and-range pair and its correct committed hash, and no runtime probe exposes it because the live app renders no Greek or Cyrillic text at all — the only Greek codepoints in the tree are mathematical symbols in comments. Non-Latin app text would fall back with every row green. Resolution is now asserted on both sides. |
| Every referenced file exists under `public/fonts/`, and each SHA-256 equals §3.3. | A rename, a `.gitignore` rule, or an unreviewed byte swap. Does **not** catch a version bump that skips the §3.4 Capsize re-derivation — that is a checklist item on §3.4, not a guard, and saying so beats crediting one that cannot see it. |
| The stylesheet is parsed with **Lightning CSS** — the parser `@tailwindcss/cli` and `@tailwindcss/postcss` already use to compile it — not with regular expressions, and not with the browser CSSOM an earlier draft named. | **Two rounds of the same class, closed structurally.** Round 18 broke a regex parser with `SRC:` (CSS descriptors are case-insensitive); round 19 broke it again with `s\72 c:`, a valid escaped spelling of `src`. Patching spellings invites a third variant — a regular expression over a formal grammar is that defect by construction. A real CSS parser handles every escape, case variant and last-wins duplicate **by definition**, and Lightning CSS additionally runs in Node, which is what keeps the guard in the merge-blocking unit suite. Round 20 retired the CSSOM formulation for exactly that reason: it is the same parser that renders the page. Verified: `@font-face`, `@FONT-FACE` and `@font-f\61 ce` all parse to `CSSFontFaceRule`; an escaped duplicate `src` wins as CSS specifies; and two same-named faces appear as two rules, which is what closes the fallback-multiplicity mutant a `find()` missed. It also forced a correction worth keeping: CSSOM canonicalises `unicode-range` (`U+0460-052F` → `U+460-52F`), so ranges are compared as **parsed intervals** rather than strings — the correct comparison regardless, since a string compare false-fails on reformatting. |
| **Exactly one** `Inter Fallback` face exists. | **Round 19's mutant:** a second, ordinary `Inter Fallback` with `font-weight: 700` and `src: local("Times New Roman")`. During the swap frame bold text — 56 `font-bold` occurrences across 29 files — selects the exact-weight Times fallback instead of the canonical Arial one, so Arial's metric overrides scale the wrong glyphs and G4 fails, with every post-font-load runtime check green. |
| **Exactly one place in the repo declares `@font-face`** — the fonts stylesheet. The census covers `.css` files **and stylesheet text authored inside source files** (string and template literals in `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mdx`). | **Mutants six and seven, which are the same shape at two depths.** Six puts `@font-face` in an app-level `.css` file, which the `next/font` census never scanned. Seven puts it in an inline `<style>` inside a `.tsx` component — and that is not hypothetical plumbing: `app/auth/sign-out/route.ts:32` already emits a `<style>` block with a `font:` declaration from a `.ts` file, so the surface is live in this repo today. Both pass every other row: canonical stylesheet intact, hashes intact, roots importing, `app/globals.css` face-free, harness block matching, token and preload correct, no `next/font` anywhere. Both evaded the runtime gates as they stood when those mutants were found — `/admin`, `/auth/sign-in` and crew routes only, never `/help`. The census now derives all 14 help routes, so the runtime oracle reaches them; these rows remain because the static assertions are still the cheaper and more direct catch. A rogue family renders a visible surface in Arial while every gate stays green. |

**The census is scoped to shipped sources, because otherwise it rejects this spec's own evidence.** Round 22 found that the repo-wide "exactly one place declares `@font-face`" assertion is red on the intended tree: the tracked mutation corpus at `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/mutants.mjs` contains complete `@font-face` declarations as string literals — including an `@FONT-FACE` spelling, which the mandated parser treats as equivalent — because declaring them is exactly what a mutation corpus does. A census that cannot coexist with the evidence for the guard it protects is mis-scoped, not the corpus. So the walk covers `app/`, `components/`, `lib/`, `public/` and `tests/`, and excludes `docs/`; within `tests/` it excludes the spike directory by path. The exclusion is **by path, not by pattern** — an exclusion keyed on "looks like test data" would grow to cover a real regression — and the excluded paths are named in the test so a new one is a deliberate edit rather than a silent widening.
| **Runtime check, not static:** on every surface in the census below, each visible text-bearing element is checked by the three-way oracle of §4.2 — a normalised child probe where the element can host one, and a computed-family assertion where it cannot — with the probe's width matching the expectation computed from the committed bytes (§4.2). Explicitly **not** `tests/e2e/font-binding.spec.ts`'s token-derived reference, which §4.2 measured as tautological — both sides resolve the same alias. | **Mutants nine and ten, which need different halves of this row.** Nine registers a face at runtime (`new FontFace` + `document.fonts.add`, runtime-composed `<style>`, CSSOM `insertRule`/`replaceSync`) with the string `@font-face` nowhere in any literal — invisible to any text census. Ten needs no registration at all: `.help-prose { font-family: Arial }` on the real wrapper at `app/help/layout.tsx:66` leaves hashes, token, preload and the entire `document.fonts` set untouched while visible help content renders Arial. **A family-set assertion over the *cascade* catches neither** — round 7 refuted the round-6 draft that used one, and note this is a different assertion from the `document.fonts` **face-set** row round 24 added: that one enumerates the registered faces and their selection descriptors, which is what closes the weight-1000 impostor and subsumes mutant nine. Reading the refutation below as covering it would drop the load-bearing row. and `tests/e2e/font-binding.spec.ts:184-211` already documents the same limitation in its own comments: a set of family names cannot distinguish another face registered as `Inter`. Only computed rendering does. |
| Every `.woff2` `compileEntryCss` copies into a harness output directory hash-matches the `public/fonts/` original of the same name, **and every `src` URL in the emitted CSS is a bare filename with no path segment, resolving to one of those copied siblings**. | Two mutants, and the second is why the first is not enough. Copying the latin file's bytes out under all seven names passes filename-and-range pairing and an ASCII metric probe while non-Latin text falls to a host face. And **the twelfth:** emit a src of url("./fonts/inter-greek.woff2") while correctly copying inter-greek.woff2 beside the emitted stylesheet. The basename still pairs with its range, the copied bytes still hash, descriptor comparison still matches, the English probe still passes — and the browser requests a subdirectory that does not exist, so Greek falls back. Every assertion inspected either the URL's *basename* or the *bytes*; none inspected whether the URL resolves to them. The same escape exists independently on all six non-ASCII faces, app-side and harness-side. |
| Each of the 25 §5 callers satisfies the §3.2 per-document invariant: every measured document is awaited after its content is present and before that document's first geometry read. | Removing a wait, adding only one to a multi-navigation file, or anchoring it to the navigation instead of the measurement. All three leave geometry read against fallback metrics and then re-derived into pinned figures. Round 4 found this row missing entirely; round 6 corrected its anchor, after showing that nine callers navigate to an empty `#root` and hydrate afterward, so a post-navigation wait settles against a document with no text in it. |
| The harness-emitted face declares `font-display: block`, and the app's seven declare `swap`. | Collapsing the two environments onto one value. `swap` in a harness lets the 25 unsynchronized callers measure a fallback frame (§3.2); `block` in the app would show invisible text to a reader. The divergence is deliberate and each half is wrong in the other place. |
| The seven Inter faces' descriptor inventory is **exactly** `font-family`, `font-style`, `font-weight`, `font-display`, `src`, `unicode-range` — set equality, not a count — and **every face declares all six**. | **The replacement mutants.** Swapping `font-style` (or `font-weight`) for `size-adjust: 200%` keeps the descriptor count at six, so a cardinality check passes while a face renders at twice its intended size; and dropping one descriptor from a single face passes a whole-file set check. Both need the two halves stated here. This row was asserted by the built guard and had **no row in this table** until a self-audit against the code found it — §4.2 referred to it as though it existed. An implementer working from the spec alone would have omitted it and both mutants would escape. |
| Every one of the seven declares `font-display: swap`. | A font-block period, invisible to every test here (all await `document.fonts.ready`). |
| The `Inter Fallback` face's descriptor inventory is **exactly** its six expected descriptors, its `src` **equals** `local("Arial")` exactly, and each of the four override values **equals** its §3.1 figure exactly — parsed and compared, with CSS comments stripped first. | Repointing the fallback at another local family leaves the overrides correct for a face they no longer describe, which is worse than no fallback since they would scale the wrong glyphs. **Round 17 broke the substring formulation two ways:** `local("Times New Roman"), local("Arial")` matches a `/local("Arial")/` test while source order makes Times render (it is installed on this machine), and wrong metric values pass an `includes()` check when the *expected* values are preserved in a comment. Both now fail: values are parsed and compared for equality, and comments are stripped before parsing.

**And its inventory is now exhaustive like the Inter faces', which round 18 showed it was not.** Adding a valid `unicode-range: U+0370-03FF` to the fallback excludes it from Latin text entirely, so the swap frame silently reverts to the unadjusted system stack and PR #676's reflow fix is undone — with every pinned field unchanged and no row firing. It was the only face whose descriptor set was open. |
| `app/globals.css` defines `--font-sans` consuming `var(--font-inter, …)`, and contains **no** `@font-face` rule. | Regression of #676's binding; and `@font-face` migrating into the file every harness compiles, which would emit `url()`s into 31 harnesses relative to the wrong directory. |
| Both `app/layout.tsx` and `app/global-error.tsx` import the fonts stylesheet. | The crash screen silently reverting to a fallback face — the exact gap #676 had to fix once already, and no route-level test exercises it. |
| **No file in the repo-wide source census** imports `next/font` — the same census `tests/assets/singleFontLoader.test.ts` walks today: every directory including `components/`, `lib/`, `scripts/` and root-level modules, across `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` (`tests/assets/singleFontLoader.test.ts:163`) plus text-scanned `.mdx` (`tests/assets/singleFontLoader.test.ts:164`). | Re-introduction of the retired mechanism alongside the self-hosted one — the two-sources-drift failure this spec exists to prevent. **Scope corrected in round 2:** an earlier draft scoped this to `app/`, which is strictly narrower than the guard it replaces. A loader placed at, say, components/help/LocalFace.tsx and imported by `app/help/layout.tsx` has no `next/font` import under `app/` at all, and the existing browser guard visits admin, auth and crew but not help, so it would evade runtime corroboration too. That file's own comments record an earlier app-only walk failing this exact way. |
| `DESIGN.md`'s mechanism sentence and fallback-stack sentence match the live `app/globals.css` value. | G5 regressing silently. Nothing previously held these together (`design-figure-parity.test.ts` is contrast-only). |
| The `@font-face` block `compileEntryCss` emits matches the fonts stylesheet's on every descriptor except **two, both of which must differ by construction**: `font-display` (`block` against `swap`), and `src`, whose URL is `/fonts/inter-*.woff2` in the app and the bare sibling `inter-*.woff2` in the harness. On `src` the comparison is filename-normalised — the basename must match; the path prefix must not.

Round 11 caught that "everything except `font-display`" rejected the measured target state, because the spike's own emitted CSS rewrites `url("/fonts/` to `url("` to make the files siblings of the stylesheet. Two descriptors differ, both for stated reasons, and everything else matches.

**Equality alone is also not sufficient**, and the spike enforces more than the prose said: a rogue descriptor added to *both* blocks satisfies cross-block equality. So the guard additionally pins the descriptor **inventory** — exactly `font-family`, `font-style`, `font-weight`, `font-display`, `src`, `unicode-range`, and nothing else — which is what kills the `size-adjust: 200%` mutant. Stated as an exhaustive rule rather than a named list, because round 10 showed a named list is an open door: adding `size-adjust: 200%` to one non-Latin face in *both* blocks kept counts, pairings, URLs, hashes, display values, equality, token, preload and the English probes all green while that face renders at twice its intended size. `size-adjust` scales real glyph outlines, not metadata. Any descriptor not on a list is a descriptor nobody is checking, so the rule inverts: everything matches, `font-display` excepted, and the §3.1 metric-override values are pinned by their own row. | **The fifth escaping mutant:** emitting a face that declares `font-family: "Inter"` but sources `local("Arial")`. This row inspects the harness toolchain's emitted CSS, as do the URL-resolution, `font-display`, copied-artifact and harness-runtime rows. Note the `local("Arial")` impostor also violates the `src` rule above, so two rows fire on it, not one. Two neighbouring rows reach other harness-side surfaces — the copied `.woff2` artifacts, and the per-document waits — and the remaining rows inspect the app stylesheet, the roots, the token, the preload, `DESIGN.md` and the licence. Without this row specifically, the harnesses can render any face under the committed name. **Scope, corrected in round 5:** an earlier draft demanded unqualified equality here while §3.2 required a `font-display` divergence, which no implementation could satisfy at once; and its failure text claimed the impostor passed *every* row, when this row exists precisely to reject it. |
| The fonts stylesheet declares `--font-inter` **exactly once**, with a **parsed value equal to** `"Inter", "Inter Fallback"`. | **The third escaping mutant, found in round 1:** defining `--font-inter: "Inter"` alone. Every other row passes — the fallback face still exists, and `app/globals.css` still carries the inline `var()` fallback pair — so the metric-matched face becomes unreachable through the token while G4's stated static guarantee reads as satisfied. **Declared-once and parsed-equality rather than a regex test**, applying round 17's lesson before a round found it here: a regex over the whole file is satisfied by a correct declaration *anywhere*, so redeclaring the token later (CSS takes the last) passed, as did appending trailing families to the value. Both are now in the matrix, at **24/24**. |
| `app/layout.tsx` renders a `<link rel="preload">` for the latin subset, with `as="font"`, `type="font/woff2"` and `crossOrigin`. | **The fourth escaping mutant:** omitting the preload entirely. Every row passes, and `tests/e2e/font-binding.spec.ts` passes too because it awaits `document.fonts.ready` and therefore cannot observe discovery latency. The mechanism would silently stop matching `next/font`'s behavior — which preloads by default — lengthening the fallback interval with no gate the wiser. |
| The license file under the public fonts directory **is** the SIL Open Font License 1.1 — matched on its distinctive text, not merely non-empty. | A cleanup replacing it, or the wrong licence being shipped. Round 11 probed the weaker predicate: `"x"` and `"not-the-OFL"` both pass a non-empty check, so §3.3's claim to ship OFL-licensed bytes would be false with the row green. |

**The runtime row's census and wiring, pinned rather than described.** Round 7 found "a route census that includes `/help`" both incomplete and unimplementable: there are **14** help routes, and a runtime-composed face in a shared component executes on the leaves rather than the index — `RefAnchor` renders on `/help/errors` and `/help/admin/parse-warnings`, not on `/help`.

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

- **File** — `tests/e2e/font-rendering-census.spec.ts`.
- **Routes — derived from the app route tree, across every registered page extension.** `next.config.ts:46` registers `pageExtensions: ["ts", "tsx", "mdx"]` — **three**, not two — so the census is every page surface under `app/` across all of them. Derived on this branch: 19 `page.tsx` + 13 `page.mdx` = **32** today, with the ts extension registered and currently unused. The census is computed from that config array rather than from a literal extension list, so a future ts page joins it without an edit. Round 8's repair said "every `page.tsx`" and thereby gained 15 non-help pages while silently dropping the 13 `page.mdx` help routes the previous navigation-registry census had covered — a regression introduced by a repair, which is exactly why the census is derived from the framework's own page-extension config rather than from any hand-written rule. Round 8 showed why nothing narrower survives: a help-registry-plus-three list left **15** page surfaces uninspected — including `/me`, `/admin/settings`, `/admin/needs-attention`, `/admin/show/[slug]`, the five `admin/dev` pages and `/show/[slug]/unpublish` — and a route-local `fontFamily: "Arial"` on any of them escapes every static row and every enumerated runtime route. **Five** of the 32 need params or fixtures — `admin/show/[slug]`, `admin/show/[slug]/preview/[crewId]`, `admin/show/staged/[stagedId]`, `show/[slug]/[shareToken]` and `show/[slug]/unpublish` — and are covered with the same seeded data the existing suites use; any route genuinely not reachable in test is listed with its reason, so the exclusion is visible rather than silent.
- **The face block is appended to the compiled output, not to any caller's entry stylesheet, and that is what makes one edit reach 31 harnesses.** `compileEntryCss` is deliberately narrow: it shells out to the Tailwind CLI and explicitly does **not** own how callers build their entry CSS, because those 31 do it in materially different ways — inline template literals, `sources.map`, arrays of pre-formatted `@source` directives — and a previous attempt to consolidate them produced 54 TypeScript errors across 12 files (`tests/e2e/helpers/liveEntryToolchain.ts:110-122`). None of that diversity matters here, because the seven faces and the copied `.woff2` siblings are emitted **after** the CLI returns, as a post-step on `outFile` and its directory. Every caller gets the face block regardless of how it assembled its input, and no caller's entry stylesheet is touched.

- **Native disclosure states are reachable too, and the source-trigger derivation cannot see them — round 27.** The state census derived open-triggers from React state transitions, which finds nothing for a `<details>` element: the browser opens it natively, with no component state to enumerate. There are 16 such sites across 14 files, 15 of them default-collapsed, on both admin and crew surfaces — `app/me/page.tsx:238`, `components/crew/sections/GearSection.tsx:380`, `components/admin/HelpTooltip.tsx:53` and thirteen more. Their content is text-bearing and reachable by an ordinary click, so a rule scoped to the expanded state renders wrongly while the default walk passes. The census therefore also walks **native disclosures**: every `<details>` on a surface is opened and its content walked. This is a second case of the same lesson as the hover states — a derivation keyed on one mechanism (React state) silently excludes surfaces that use another (the platform's own).

- **State-only surfaces count as reachable, and three current ones were missing — round 26.** A surface does not have to be a mounted root to bear text: `focus:not-sr-only` on the help skip link (`app/help/layout.tsx:52`), the hover/focus-within reveal on `app/help/_components/RefAnchor.tsx:81`, and the occurrence tooltip at `components/admin/BellPanel.tsx:194` are all production-reachable, text-bearing states whose default state is hidden. A family override scoped to the hover or focus-visible state renders wrongly only while that state is active, so an ordinary route walk sees the default state and passes. The census therefore enumerates **states as well as roots**: any selector that reveals text under the hover, focus, focus-within, focus-visible or group-variant pseudo-classes is driven into that state and walked there. Only the skip link has any existing e2e interaction today, which is again evidence that existing coverage cannot be the criterion.

- **Four reachable interaction surfaces were missing from the census — round 24's finding, and it reopens one from round 12.** The derivation took "already driven by e2e" as its predicate, which quietly excluded surfaces that have real production click paths and only unit coverage: `AppHealthPopover` (`components/admin/nav/AppHealthIndicator.tsx:109`), the `CleanupAbandonedFinalizeButton` confirmation (`components/admin/CleanupAbandonedFinalizeButton.tsx:79`), the `ReapStaleSessionsButton` confirmation (`components/admin/ReapStaleSessionsButton.tsx:106`), and `GalleryLightbox` (`components/diagrams/Gallery.tsx:113`). Each mounts a root that is absent during an ordinary route visit, so a family override on any of them passes a visible-element walk that never opens it.

  The predicate was wrong, not just its result: **reachability in production is the criterion, and existing e2e coverage is not evidence of it either way.** The census therefore enumerates open-triggers from the *source* — the state transitions that mount a surface — rather than from what a suite happens to drive today, which is a derivation a new surface joins by construction instead of by someone remembering. The four are opened and walked; `ReapStaleSessionsButton` is the one round 12 already found, and its reappearance is the argument for deriving the list rather than maintaining it.

- **The 31 harness documents are reached by a shared fixture, not by a census spec — round 20's finding.** An earlier draft said each of the 31 gets the same visible-text walk "because the documents are already being rendered". They are, but not by anything the census file can see: all 31 import the base `@playwright/test` fixture directly and run under their own standalone and visual configurations, while the census spec this design adds (font-rendering-census, not yet created) is assigned to the crew project. A spec cannot inspect pages owned by another spec's process. As written, the caller-local `font-family: Arial` mutant survives the entire guard.

  So the oracle is **distributed to the callers instead of centralised**: a shared fixture module re-exports `test` with an auto-fixture that runs the walk after each test against whatever document that test rendered, and the 31 harness specs import `test` from it rather than from `@playwright/test`. The check then runs inside the process that owns the page, under whichever config the caller belongs to, with no cross-process inspection anywhere.

  **A fixture keyed on `page` is not sufficient, which round 21 established and an earlier draft of this bullet got wrong.** 30 of the 31 take their page from the standard `page` fixture, but `tests/e2e/agendaScheduleLayout.spec.ts:386-411` requests `{ browser }`, builds two contexts of its own (`newContext` → `newPage`, one of them `reducedMotion: "reduce"`), and **closes both before fixture teardown**. An after-test hook on `page` would inspect a blank default page and report green while two real documents went unchecked. The earlier draft asserted the opposite from a grep for `browser.newPage()`, which the `newContext()` → `ctx.newPage()` spelling does not match — the claim was wrong at the point it was most load-bearing, and the class sweep for it is `newContext(|.newPage()` across the 31, which finds that one file and no other.

  So the fixture **wraps page creation rather than consuming a page**: it proxies the `browser` fixture so every page created during a test — default, or from a caller's own context — is registered as it appears.

**Running the oracle on each document's `load` does not work, and this was prototyped rather than reasoned about.** A first version did exactly that and lost both of `agendaScheduleLayout`'s documents: the `load` handler's `evaluate` is asynchronous, the caller's `close()` wins the race, and the result is discarded by the same `catch` that exists to tolerate a closing page. The prototype failed, which is the only reason this is not a round-23 finding.

The oracle therefore runs **whenever a document ends** — which is not only at close, and round 23 caught the close-only version observing a fraction of what renders. A page that navigates fourteen times renders fourteen documents and is closed once; six source bodies across `section-header-layout.layout` and `statusStripToggleLayout` expand to nine runtime tests rendering **84 documents on reused pages**, of which close-only inspection saw nine. A caller-local `font-family: Arial` confined to any of the other 75 would pass every static row, the per-document font wait, and the oracle, and its geometry could then be blessed into a pinned figure.

**Neither vantage is complete alone, which round 26 established and the prototype now measures.** Wrapping the programmatic APIs cannot see browser-originated replacement — a link or form activation, `location =`, history, meta refresh — nor pages the browser creates via `window.open`, nor frames. An in-page `pagehide` listener, installed through an init script so it reaches every page and every frame however created, sees exactly those; but it does not fire for `setContent`, which replaces a document by writing into it, nor for a context being closed. The fixture therefore uses **both**, plus an after-body sweep for documents that simply outlive the test. The tracked prototype has one test per vantage, and removing any one mechanism turns one of them red.

**Round 27 was right that the earlier prototype did not exercise what its prose claimed.** Two defects, both of the kind that make a green test worthless. It reported `getComputedStyle(document.body).fontFamily`, so a document with an Inter body and an Arial _descendant_ passed — the prototype now walks every text-bearing element and reports the distinct families, and its assertion requires the descendant to be visible behind its root. And its caller-owned-context test hand-installed its own binding and pushed its own pre-close result, which **bypassed** the fixture rather than testing it; the context now comes from the wrapped `browser` fixture, so everything the test observes is the fixture's own behaviour. One wiring detail that fell out and is worth recording: Playwright's default `context` fixture is itself built by calling `browser.newContext()`, so instrumenting both the `context` fixture and the `newContext` wrapper double-registers the binding and throws. All instrumentation therefore lives in the one wrapper.

  Concretely the fixture proxies **navigation as well as close**: `goto`, `setContent`, `reload`, `goBack` and `goForward` each inspect the *outgoing* document before replacing it, and `page.close()` / `context.close()` inspect the final one before it is destroyed. Every document is therefore inspected exactly once, at the last moment it exists. One detail worth stating because it silently disabled the first attempt: the "has anything rendered yet" gate must ask the **document**, not the URL — `setContent()` leaves the URL at `about:blank`, so a URL-based guard skips every document a harness builds. That point is the only one guaranteed to be both after the document is final and before it is destroyed. The working prototype is tracked beside the guard, at `docs/superpowers/specs/spikes/2026-08-03-harness-font-fidelity/fixture-prototype.ts`; it covers both shapes — a page reused across three documents yields three observations rather than one, and two caller-owned contexts closed before teardown, in the shape `agendaScheduleLayout` uses, are both observed.

  **Both files get named homes, because round 21's sixth finding is that "a guard with no implementable home" is a class this spec has now hit twice.** The fixture is a new module named fontFidelityFixture.ts under tests/e2e/helpers/ (not yet created), beside the existing `tests/e2e/helpers/fixtures.ts`. The structural meta-test is a new file named _metaFontFidelityWiring.test.ts under tests/e2e/ (not yet created), following the `_meta*.test.ts` convention already used by `tests/e2e/_metaLiveEntryToolchain.test.ts` — which is the closest precedent in the repo, being the existing meta-test over this very toolchain, and which places it in the Node unit suite rather than a Playwright project. Both are added to §3.0's artifact inventory. The repo has no existing `test.extend` fixture, so the extension pattern itself is new even though the file conventions are not; an earlier draft of this bullet said there was no fixture precedent at all, which overstated it.

  What keeps it closed is that the wiring is **fail-by-default**, in the shape invariants 9 and 10 already use in this repo: a structural meta-test walks `tests/e2e/` for every spec that calls `compileEntryCss` and asserts it imports `test` from the shared fixture — so a new harness spec that imports `@playwright/test` directly fails the meta-test rather than silently opting out of the oracle. That is the same "filesystem-walked so a new surface fails by default" property that makes the mutation-surface meta-test work, and it is the reason this bullet names a mechanism rather than an intention.

- **The 31 harness documents are in the census too.** The §4.2 case builds one synthetic minimal entry, which proves the toolchain emits a working face — it says nothing about what each caller's own markup renders. A caller-local inline `font-family: Arial` leaves the shared emitted face, the copied hashes, the waits and the synthetic case all untouched, and the geometry regeneration in §5 would then bless that caller's wrong face into a pinned figure. Each of the 31 gets the same visible-text walk against the same pinned width, which is cheap because the documents are already being rendered — delivered through the shared fixture described immediately above, not by a spec that reaches across processes.
- **Interaction-only surfaces are in the census too — and the list is DERIVED, because hand lists keep being wrong.** Round 8 named 11 dialog roots, round 11 added 2, round 12 found ~13 more (`HoverHelp` open body, `PickerResetControl` and `ResetPickerEpochButton` confirmations, both `RotateShareTokenButton` layouts, both `ArchiveShowButton` armed layouts, the `PublishedToggle` error popover, `ReapStaleSessionsButton`, three `ReSyncButton` panels, the `AttentionMenu` panel, `CrewRowActions` reset confirmation, the `Step3ReviewWithFinalize` running tracker) — several of them descendants of an already-listed root that need a *further* transition. Three consecutive rounds growing the list is the signal that enumeration is the wrong instrument.

  So the census is derived from **production reachability**, enumerated from source open-triggers, not from what the e2e suites happen to drive — round 25 caught this paragraph still stating the criterion round 24 rejected. Every reachable surface is walked while it is open, which for most of them means reusing an interaction an existing spec already drives, and for the four round 24 named means opening them deliberately — the walk is a few lines added to suites that are already performing the interaction, not a new traversal to invent. Surfaces no existing spec opens are **not** individually enumerated here; they fall under the documented limit below.

- **Documented limit — reachability, stated rather than pretended.** Two classes cannot be reached without building new production or test seams, and this spec does not build them: `app/show/[slug]/[shareToken]/error.tsx` (the crew page is written so it "never throws an uncaught error into Next's generic boundary"), and `app/global-error.tsx` (no browser test reaches it; `tests/observe/globalError.test.tsx` renders the component directly in Vitest, which cannot prove a stylesheet reaches a replacement React root). Both keep their §4.1 *static* import assertions, which is what is actually available. The same applies to the `MaintenanceResetButtons` confirmations, gated behind `destructiveResetAllowed()` and unreachable in the crew-e2e environment.

  This is the §4.0 posture applied honestly to the census: **every surface reachable in production is measured, and every surface that is not reachable is named with its reason.** Existing test coverage is a convenience for reaching a surface, never the criterion for whether it belongs in the census — that inversion is exactly what hid four surfaces through twelve rounds. A future finding that names another unreachable surface is a documentation fix, not a defect; one that names a *reachable* surface the derivation misses is a real finding.

- **Non-page rendering states are in the census too.** Fifteen files — 4 `error.tsx`, 9 `loading.tsx`, 1 `not-found.tsx`, 1 `global-error.tsx`, derived from the tree — render user-visible React that no successful navigation ever measures. `app/global-error.tsx` matters most: it owns the second React root G1 names, and §4.1 otherwise checks only that it *imports* the stylesheet, never what its crash UI renders. Each is exercised through its trigger condition — a thrown boundary, a suspended segment, a missing record — and measured like any other surface, **except the two the documented limit below excludes**. Round 13 caught this section asserting all fifteen are exercised while the limit simultaneously said two cannot be: 13 are exercised, 2 carry static import assertions only. Stating both without reconciling them left an implementer to either invent new seams or drop coverage, with the document endorsing each.
- **Reachability is asserted, not assumed.** `app/help/layout.tsx:19` calls `requireAdmin()`, so a fresh context visiting `/help/**` lands on `/auth/sign-in` — a correctly-fonted page. Measuring that would turn every help case green without executing a single help component. Each case therefore signs in (`signInAs`, the pattern `tests/e2e/help-pages.spec.ts:95-113` uses) and asserts the final URL and a 200 before measuring.
- **The measurement walks the route's actual rendered elements and dispatches by element class**, measuring a normalised probe inside those that can host one and asserting computed family on those that cannot. `tests/e2e/font-binding.spec.ts:71-79` appends its probe span to `document.body`, which cannot see a descendant override — mutant ten, `.help-prose { font-family: Arial }` on the wrapper at `app/help/layout.tsx:66`. Round 8 moved the probe into "the deepest content wrapper" and round 9 refuted that too: on `/me` a `fontFamily: "Arial"` on the visible `<h1>` (`app/me/page.tsx:156`) renders Arial while a synthetic sibling inside `<main>` (`app/me/page.tsx:154`) keeps inheriting Inter and passes. There is no singular deepest wrapper. So the walk visits every visible text-bearing element and the probe is inserted **as a child of each one** — inheriting that element's exact cascade, with the glyph-run properties neutralised (§4.2).

  So the oracle walks the route's **visible text-bearing elements** and asserts each one's computed `font-family` resolves to the canonical chain. That has no privileged insertion point to be wrong about: an override anywhere in any branch lands on an element the walk visits.

  **Resolving the chain is not enough on its own, and the oracle is now spiked rather than specified.** Ten review rounds contested this guard's formulation; per the three-round prose cap (`docs/agents/spec-self-review.md:22`) it was built as code and measured. Three formulations, in Chromium:

  | Formulation | Real Inter | Arial aliased as `Inter` | Verdict |
  | --- | --- | --- | --- |
  | computed `font-family` | `Inter, "Inter Fallback", …` | **identical** | worthless alone |
  | `document.fonts` family set | `Inter:loaded` | **identical** | worthless alone |
  | width vs a **token-derived** reference | agree | agree | tautological — both sides resolve the same alias |
  | **width vs an expectation computed from the committed bytes** | delta **0.008px** | delta **9.774px** | **discriminates, ~1200× margin** |

  So the oracle is the last row. For a fixed string at a fixed size, the expected advance width is computed in-test from the committed file with fontkit — `font.layout(probe).advanceWidth / font.unitsPerEm * fontSize` (`unitsPerEm` 2048, one `wght` axis) — and compared to the rendered width within 0.5px.

**Inserting a non-Latin probe starts a font load, and the oracle awaits it — round 22's second instance.** The mechanism spike's useful negative result was that six of the seven faces sit `unloaded` for ASCII content, which is correct `unicode-range` behaviour. The per-surface subset sweep then *inserts* Greek, Cyrillic and Vietnamese probe text into a document where those faces have never been needed, which starts six fetches. Measuring immediately measures the fallback, and under `font-display: block` measures invisible text — so the sweep would report failure against a perfectly correct face, which is the more expensive direction of wrong. The oracle therefore awaits `document.fonts.ready` **after inserting each subset's probe and before measuring it**, not once per document: the §3.2 per-document invariant governs the 25 geometry callers and says nothing about content this guard introduces itself. Each subset's probe is inserted, awaited, measured, removed.

**The arithmetic itself is exact, which is worth separating from the end-to-end figure.** `layout(text).advanceWidth / unitsPerEm * fontSize` was checked against a real browser rendering the committed bytes, on a probe carrying the normalisation §4.2 specifies:

```
subset     probe             fontkit(px)    browser(px)     delta
latin      Hamburgefonstiv      130.0938       130.0938     0.0000
greek      Αλφαβητικος          101.4219       101.4219     0.0000
cyrillic   Привет мир            93.0469        93.0469     0.0000
```

Zero, not merely small, and on two non-Latin subsets as well as latin — so the formula is not an approximation that happens to be close. The **0.008px** figure reported elsewhere in this spec is a different measurement and both numbers stand: that one is the full harness path, where the residual comes from the surrounding document rather than from this computation. Reading the exactness here as licence to loosen the tolerance there would be the wrong inference.

**`font-weight` and `font-style` are pinned by value, which round 22 showed they were not.** The guard pinned the descriptor *inventory* — that the six names are present and no others — and pinned family, source, range and display by value. Inventory equality proves a descriptor **exists**; it never proved what it says. The reviewer ran the tracked guard and escaped it twice: collapsing every `font-weight: 100 900` to `font-weight: 400`, and reclassifying every `font-style: normal` as `italic`, each passed all fifteen rows. Cross-block equality does not help, because it lets the app and harness blocks be wrong *together*, and the runtime oracle cannot help either — it deliberately probes at weight 400, which is precisely the value the first mutant collapses to. The visible consequence is real: 56 `font-bold` sites across 29 files would render a synthetic bold off a face that no longer advertises the axis, and every static row would stay green. Two rows now pin the values exactly — `font-weight` as the parsed pair `[100, 900]`, `font-style` as `normal` — and both mutants die. **17 rows, 32 mutants.**

**The manifest is a named artifact with a stated identity model, because round 27 was right that "a committed manifest" is not implementable prose.** It is a new file named monoSurfaces.ts under tests/e2e/helpers/ (not yet created), exporting an ordered list of entries shaped `{ route, selector, scope }` — `scope` being `"element"` or `"subtree"`.

**The identity model is the load-bearing part, and the obvious keys are circular.** Keying on `.font-mono` or on `code` / `pre` tag names would mean deleting the class or changing the tag also changes the expected set, which is the exact defect round 26 found. Entries therefore key on identity that survives a typography change: a `data-testid` where one exists, otherwise a role-plus-accessible-name pair. Neither is altered by adding or removing `font-mono`, so both of round 26's mutants still fail. Where a container carries the utility for a whole region — `app/admin/dev/page.tsx:85` puts `font-mono` on an entire `<main>`, and its descendants inherit — the entry names that container with `scope: "subtree"`, and the walk treats every descendant as expected-mono without needing an entry each. Elements matching no entry are expected-Inter, so **the default is the assertion**, and a new surface is covered without anyone adding a row.

A freshness assertion keeps it honest in the other direction: every entry must still match at least one element on its route, so an entry left behind by a deleted component fails rather than silently widening the mono exemption. Both the manifest and that assertion are listed in §3.0 and §7.

**The expected family comes from a committed manifest, not from the rendering — round 26's BLOCKING finding, and it was right about the shape of the bug.** Classifying each element by the family its cascade selects, then asserting that family is correct, is circular: the oracle derives its expectation from the thing it is supposed to validate. Both directions escape. Delete `font-mono` from `components/admin/ShowsTableHeading.tsx:39` and the deliberately monospace heading inherits Inter, is classified as sans, and passes the Inter check. Add `font-mono` to the `<h1>` at `app/me/page.tsx:156` and a deliberately sans heading is classified as mono and receives no Inter check at all. Every static row, subset probe and face-set assertion stays green, because in both cases the rendering is a genuine committed family — just the wrong one for that element.

So the mono side is a **frozen oracle**: a committed manifest names the elements expected to render monospace, keyed by a stable selector, and the runtime check asserts exactly that set renders mono **and every other text-bearing element renders Inter**. Membership is the expectation; the rendering is the thing under test, and the two are no longer the same object. A deliberate typography change then requires editing the manifest in the same diff — which is the property wanted, not an inconvenience, because "someone changed which elements are monospace" is precisely the event that should require review. This is the pattern the repo already uses for frozen copy oracles. The manifest is seeded from today's nine `font-mono` utilities plus the semantic `code` / `kbd` / `samp` / `pre` elements Tailwind preflight puts on the mono stack; an earlier sentence comparing "9 against 5" counted utilities against token and comment occurrences and is withdrawn.

**The fourth completeness dimension is font *selection*, and round 24 opened it.** The probe normalises the axes that make a width comparison meaningful — weight to 400, stretch to normal — and that normalisation is exactly the blind spot: a face registered at runtime as `new FontFace("Inter", 'local("Arial")', { weight: "1000", stretch: "condensed" })`, paired with a runtime-composed `font-weight: 1000` rule, is selected by the *visible* text while the probe at 400 selects genuine Inter. Every stated assertion stays green — the stylesheet and committed bytes are untouched, computed family is still `Inter`, and no `@font-face` literal exists for the static census to find. 165 files carry non-400 weight utilities, so the surface is not hypothetical. Normalising more axes cannot fix this, because the normalisation *is* the hole; and measuring at each element's own weight is not available either, since `getVariation` throws on these files.

So the guard closes it **at the face set rather than per axis**: the oracle enumerates `document.fonts` on every surface and requires the registered faces to be exactly the expected set, compared on family, weight, style, stretch and `unicode-range`. Probed rather than assumed — a runtime-added impostor appears there in full, alongside the genuine face:

```
{ family: "Inter", weight: "100 900", style: "normal", stretch: "normal",    unicodeRange: "U+0-10FFFF" }
{ family: "Inter", weight: "1000",    style: "normal", stretch: "condensed", unicodeRange: "U+0-10FFFF" }
```

That is strictly stronger than patching the weight axis: it rejects *any* runtime-registered face under a committed family name, on any selection axis, including axes nobody thought to normalise. It also subsumes mutant nine, which this spec previously justified through the width probe alone.

**Probe text rejects zero-advance codepoints, not just unmapped ones, and the difference is a silently unguarded subset.** Rejecting `glyphForCodePoint(cp).id === 0` removes characters the face cannot draw. It does not remove characters the face draws with **no advance** — combining marks — and those defeat a width oracle completely, because a zero-width string measures zero under every font. Measured against the committed bytes at 16px:

```
U+0301 combining acute    0.0000px      U+0410 CYRILLIC A     11.0391px
U+0300 combining grave    0.0000px      U+0411 BE             10.3359px
U+0323 dot below          0.0000px      U+1EA0 A dot below    11.0391px
```

This is not hypothetical for one subset in particular: **cyrillic's lowest probeable codepoint is `U+0301`** — mapped, non-ASCII, above `U+0021`, and therefore accepted by every filter stated so far. A derivation that takes the lowest codepoints would hand cyrillic a probe of pure combining marks, the expectation computed from the bytes would be `0`, the rendered measurement would be `0`, and the row would pass under Inter, under Arial, and under a face that fails to load at all. `vietnamese` carries the same trap across `U+0300-0309`, `U+0323` and `U+0329`; `latin` and `latin-ext` each carry `U+0304`, `U+0308` and `U+0329`.

So the filter is **advance-based rather than category-based** — reject any codepoint whose advance in the committed face is zero — because advance is the property the oracle actually depends on, and a Unicode-category test would be a proxy for it that drifts. The derived probe additionally asserts its own expected width **exceeds a nonzero floor** before it is used, so a subset that somehow yields a degenerate probe fails loudly instead of passing vacuously. With that filter every subset still has ample material: 152 cyrillic-ext, 102 cyrillic, 233 greek-ext, 105 greek, 110 vietnamese, 722 latin-ext, 223 latin. The zero-probeable case cannot arise today, and the floor assertion is what keeps that a measured fact rather than an assumption.

**Lightning CSS is added as an exactly-pinned devDependency, and the pin is the whole argument.** The guard's claim to authority is that it parses with the same front end that compiles the file. That holds only if it is literally the same instance, and the obvious install silently breaks it: the @tailwindcss/node package (version 4.2.4 in this tree) depends on `lightningcss` at **exactly `1.32.0`** — no caret — while the current published version is `1.33.0`, so a bare `pnpm add -D lightningcss` installs a second copy, and the guard would then parse with a build that compiles nothing in this repo. The argument would be gone and nothing would report it.

So the dependency is added as an exact `1.32.0` pin, which dedupes onto the instance Tailwind already resolves, and a structural meta-test asserts the tree holds **exactly one** `lightningcss` version. Without that test the invariant is a comment: the next Tailwind bump moves its pin, the explicit pin does not follow, and the tree quietly grows a second copy. This is the same discipline the repo already applies to byte-comparison gates, which pin their execution environment rather than trusting that a deterministic-looking script produces stable bytes — a parser is an execution environment for a grammar, and a guard that pins its expectations while floating its parser has pinned the wrong half.

**The fontkit dependency is named, because round 11 showed the spec did not determine one buildable diff.** `fontkit` does not resolve in this repo today; the spike reached it through Next's private compiled path, which is not something to build a permanent guard on. The implementation adds `fontkit` as an explicit devDependency and imports it normally. That is a lockfile change and is called out here so it is reviewed rather than discovered — the alternatives (depend on a Next internal, or hand-parse woff2) are both worse and both would have been legitimate readings of the earlier wording.

  **For elements that can host one, the measurement is taken on a normalised probe inserted as a CHILD of the walked element** — the other two classes are handled below and are not a footnote to this sentence. This is the shape that survives; three earlier formulations did not, and each failed for a reason worth keeping visible.

  Walking the element itself and measuring it directly fails on ordinary page styling: with `text-transform: uppercase` (96 tokens across 55 files), `font-weight: 700`, `letter-spacing: .12em` and `font-feature-settings: "tnum" 1, "cv11" 1`, the element measures 276.531px against a 194.133px expectation — fontkit lays out the *source* string, the browser renders a *transformed* one. That is a guard failing on legitimate text, ~69× the tolerance.

  A synthetic probe elsewhere in the document fails the opposite way: it does not inherit the cascade of the element under test, so a descendant override (`.help-prose { font-family: Arial }`, or a rule on a single `<h1>`) never reaches it.

  A probe that is a **child of the element under test** has both properties, measured:

  | Surface (uppercase + bold 700 + `.12em` tracking + `tnum`/`cv11`) | probe | expected | delta | |
  | --- | --- | --- | --- | --- |
  | clean wrapper | 194.141 | 194.133 | **0.008** | passes |
  | wrapper overridden to Arial | 184.359 | 194.133 | **9.774** | fires |

  The probe carries `text-transform: none; font-variant: normal; font-feature-settings: normal; font-stretch: normal; letter-spacing: normal; word-spacing: normal; font-weight: 400`, is `position: absolute; visibility: hidden`, and is removed after measuring. It inherits `font-family` from its parent and neutralises everything that changes the glyph run.

  **The walk partitions by the family the MANIFEST expects, because the app ships two.** `DESIGN.md` §2.1 commits to one *sans* family and says nothing about monospace, but the tree renders mono in **34** places: 6 files using the `font-mono` utility, and 28 semantic `code` / `kbd` / `samp` / `pre` elements picking up Tailwind preflight's mono stack. `/help/errors` is an always-reachable member of the 32-route census, and `/admin/dev` puts `font-mono` on its entire `<main>` — so this is not a fringe case behind an interaction or an exclusion.

  A probe inherits its parent's `font-family` by design (that is how it catches descendant overrides), so on any of those 34 surfaces it inherits the *mono* chain and fails both the canonical-chain assertion and the Inter byte-derived width. **The guard would have gone red on a correct, unchanged application** — which is worse than not having it, and round 16 blocked on exactly that.

  **The partition is exhaustive, verified rather than assumed.** Auditing the tree for a third family the way round 16's finding was found: `app/globals.css` contains exactly **one** `font-family` declaration (`html { font-family: var(--font-sans) }` at `app/globals.css:671`), the only family tokens are `--font-sans` and Tailwind's default `--font-mono`, source carries **no** inline `fontFamily` at all, and the utility usage is 9 `font-mono` occurrences against 5 `font-sans` with no `font-serif` anywhere. Two families, and the classifier below covers both.

  So each walked element is classified by **manifest membership**, never by what it rendered: elements the manifest does not list get the Inter assertions; elements resolving to the mono chain are asserted to resolve to *that* chain and carry no Inter width check. The partition is manifest-driven, and deliberately hand-reviewed, so a new `code` element or `font-mono` site joins the right side automatically.

  **Per surface, the oracle also sweeps all seven subsets once** (§4.0): seven measurements against seven byte-derived expectations, with probe text derived from each subset's own `unicode-range` and glyph coverage. The per-element ASCII probe catches per-element overrides; the per-surface subset sweep catches a face scoped to a range the ASCII probe never touches. Neither subsumes the other, and the sweep is per surface rather than per element because the faces are global — one element proves all seven.

  **Two element classes cannot host a probe, and get a different check — measured, not assumed.** `<input>` is void, and ::placeholder / ::marker / ::before / ::after cannot contain a child span. That reaches 16 native controls across 11 files, nine runtime placeholders, the alert caret (`app/globals.css:710-714`) and list markers (`app/globals.css:1021-1024`). The demonstrated escape is `::placeholder { font-family: Arial }`, which no child probe anywhere in the document can see.

  `getComputedStyle(el, pseudo)` does reach them:

  | | clean | overridden | discriminates |
  | --- | --- | --- | --- |
  | ::placeholder | `Inter, sans-serif` | `Arial` | yes |
  | ::marker | `Inter, sans-serif` | `Arial` | yes |
  | ::after | `Inter, sans-serif` | `Arial` | yes |
  | the input element itself | `Inter, sans-serif` | `Inter, sans-serif` | no — correctly, since the override is on the pseudo |

  So the oracle is a three-way split by element class: **can host a child** → byte-derived child probe; **elements that render text but cannot host a child probe** → computed family on the element. The class is defined by that property rather than by an element list, because a list is what leaves `<option>` out: it is not void, so "void/replaced" misses it, and preflight's rule stops at `optgroup` — the real selector is `button, input, select, optgroup, textarea, ::file-selector-button` in Tailwind's shipped preflight (installed under node_modules, in tailwindcss/preflight.css at lines 238-244 — untracked, so quoted rather than cited), with no `option`. There are 10 `<option>` sites across four admin files. Probed rather than reasoned about: `option` inherits anyway, because `font-family` is an inherited property and no UA rule overrides it on `option`, so its computed family reads `TestInter, serif` under a `html { font-family: "TestInter", serif }` parent — identical to `select`, `optgroup`, `input`, `textarea` and the placeholder pseudo-element in the same probe. The check is therefore unchanged and already correct for it; only the class definition needed widening so nobody re-derives the preflight omission and files it; **pseudo-elements** → computed family on the pseudo.

  Classes two and three are **family-level, not byte-level**: they catch a family override, which is the demonstrated attack, but would not catch an alias impostor confined to a placeholder. Recorded as a documented limit rather than papered over — it is a real narrowing, and naming it is what keeps §4.0's boundary honest.

  **This also retires the weight problem entirely.** Instancing the variable font at each element's weight is impossible here — `getVariation` throws on this WOFF2 in both the Next-vendored fontkit and a real `fontkit@2.0.4`, at every weight including the default. Because the probe is forced to weight 400, no instancing is needed: the base-font `layout()` that does work is the only fontkit call required, and bold elements are covered because the probe inside them is not bold. The earlier weight-400 documented limit is withdrawn as unnecessary.

  Two properties matter and both are measured, not argued. It is **alias-independent**: an impostor fails on Arial's advance widths however the alias is spelled. And it is **environment-independent**: the expectation derives from the same bytes the browser renders, so there is no pinned literal to rot across platforms, Chromium builds or CI images — the failure mode the byte-gate discipline in AGENTS.md exists to prevent. It needs no baseline table and no per-environment figure, which is also why it is cheap enough to run on every surface in the census rather than a sample.
- **Config** — add to the project that already runs `font-binding`, alongside it.
- **CI** — that project's existing invocation names its specs explicitly, so this filename is added to it. (Contrast §4.2, whose standalone workflow is deliberately unfiltered and must not be touched — the two projects have opposite conventions and confusing them breaks a gate either way.)
- **Workflow-coverage disposition** — `crew-e2e.yml`'s `pull_request` trigger carries `paths-ignore`, and `tests/ci/_metaE2eWorkflowCoverage.test.ts:229-231` treats a spec in such a job as not fully PR-covered unless it is dispositioned. `font-binding.spec.ts` is already classified `PATH_GATED_BY_EXCLUSION` there (`tests/ci/_metaE2eWorkflowCoverage.test.ts:133`); the new spec gets the same disposition. Round 10 caught this: without it, "every e2e spec is PR-covered or reason-allowlisted" fails the moment the file exists, even with config, workflow command and executed-spec registry all exactly as specified.
- **Executed-spec registry** — add a threshold row for the new filename to `REQUIRED` in `scripts/check-crew-e2e-executed.mjs`. `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:498-513` asserts that every spec the job runs has one, so adding the spec to the workflow without it fails that gate; and the registry is what stops the new suite from collecting cases and skipping them all while the post-run oracle and CI both stay green. Round 8 caught this omission — it is the same wiring-completeness defect as §4.2's, one surface further along.

Source-text assertions, DB-free unit suite — **except** the two rows explicitly marked as runtime checks (the computed-rendering census above, and the harness face in §4.2). Those two exist because a text census provably cannot see runtime font registration, and pretending otherwise is what mutant nine punishes.

### 4.2 Executable guard — the harness face

`tests/e2e/font-binding.spec.ts` (whose comments and failure messages §3.0 updates, but whose assertions this spec leaves intact) already proves the **app** renders Inter on `/admin`, by measuring rendered text width against the family read from the token (`crew-e2e.yml:7-8`). It is left intact — its comments and failure text change per §3.0, its assertions do not.

What is missing is the harness half, and it is the point of this spec. A new case in the harness toolchain's own test surface:

1. builds a minimal entry CSS through `compileEntryCss`,
2. serves the output directory the way callers do,
3. renders a fixed string, and
4. proves the harness renders **the committed Inter**, by two assertions that together are not satisfiable by an impostor.

**A loaded-face check alone is NOT sufficient, and round 2 proved it with the fifth escaping mutant:**

```css
@font-face {
  font-family: "Inter";       /* the author-declared alias, not the bytes */
  src: local("Arial");
  font-weight: 100 900;
  font-display: block;        /* matches what the harness is required to emit */
  unicode-range: U+0000-00FF;
}
```

Emit that from `compileEntryCss` and the app stylesheet and its seven hashed files are untouched — but two rows fire, the emitted-block equality row and the `src` row, since `local("Arial")` is not one `url()` plus `format("woff2")`, `tests/e2e/font-binding.spec.ts` still passes (real routes still use the correct stylesheet), and a `some(f => f.family === "Inter" && f.status === "loaded")` predicate returns true — because `FontFace.family` is whatever the author wrote, and identifies nothing about the source. Every harness would render Arial under the name Inter, geometry baselines would be regenerated around the wrong face, and the suite would be green. That defeats G1 outright.

So the case asserts both:

- **Source equality, in the load-bearing descriptors.** The `@font-face` block `compileEntryCss` emits matches the block in the fonts stylesheet on `font-family`, `src` filename, `unicode-range`, `font-weight` and `font-style` — the descriptors that determine *which bytes render*. This is what ties the harness face to the seven hash-pinned files rather than to a name.

  **Two descriptors differ by construction; the rest match; and the inventory is pinned separately.** §4.1 states the rule and §4.2 does not restate it: `font-display` (`block` vs `swap`) and `src` (bare sibling vs `/fonts/…`) differ, everything else matches, and the descriptor *set* is pinned by its own row — because equality alone accepts a rogue descriptor present in both blocks. Round 12 caught this section still carrying the superseded "`font-display` is the one descriptor that must differ" wording.
- **Rendered metric — the §4.2 byte-derived oracle, not the token-derived one.** The same formulation §4.1 specifies: expected advance width computed from the committed file with fontkit, measured on a normalised weight-400 child probe, within 0.5px — never by instancing the variable font, which throws (§4.2). It must NOT copy `tests/e2e/font-binding.spec.ts`'s token-derived reference, which §4.1 measured as tautological — both sides resolve the same alias. Round 12 caught this section still pointing at that posture.

`document.fonts` enumerates only `@font-face`-declared faces, never system-installed ones, which is why the presence half is still worth having on a machine with no Inter installed. `document.fonts.check()` is deliberately not used — it returns true for a system-installed family.

**Anti-tautology:** the case must fail on the pre-change tree, where `compileEntryCss` emits no `@font-face` at all. The implementation verifies that before the fix lands.

**Wiring, named here rather than left to the plan.** Round 1 established that this guard had no implementable home: the toolchain's existing test surface is Vitest (`tests/e2e/helpers/liveEntryToolchain.css.test.ts:23`), a browser case cannot live there, and a new Playwright spec that is not in the standalone allowlist runs nowhere *and* trips the registration meta-gate. All four land together:

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->

- **File** — `tests/e2e/harness-font-face.spec.ts`. A Playwright spec, not a Vitest test, because it needs a real font-loading engine.
- **Config** — add `harness-font-face` to the `testMatch` alternation in `tests/e2e/standalone.config.ts:85-86`. It belongs on the standalone project for the same reason its 31 siblings do: it serves its own directory and needs no Next server.
- **Registration baseline** — regenerate `tests/e2e/standalone-baseline.json`, the committed membership data, in the same commit. `tests/ci/_metaSpecRegistration.test.ts` walks every test-shaped e2e file, rejects any resolved by no Playwright config, and pins standalone membership by observation via `_standaloneConfigProbe` (`tests/ci/_metaSpecRegistration.test.ts:6-10`). The meta-test is the checker; the baseline JSON is the artifact that changes.
- **CI — add nothing.** `.github/workflows/standalone-e2e.yml` runs the WHOLE standalone config unfiltered on every PR (`.github/workflows/standalone-e2e.yml:3`), and both that workflow and `_metaSpecRegistration` require the command to stay exactly `pnpm exec playwright test --config tests/e2e/standalone.config.ts`. **Naming a spec in it would narrow execution and break the coverage detector and the baseline comparator.** Round 2 caught an earlier draft instructing exactly that. Config membership is the whole wiring; CI picks the spec up for free.

Without all four the guard is red locally and absent from CI, which is the failure mode it exists to prevent.

---

## 5. Baseline churn

This is where the entry's "Effort: M" lives. **Harness rendering changes by design** — that is the goal — so every harness baseline measured against the ambient font moves.

| Artifact | Count | Affected? | Action |
| --- | --- | --- | --- |
| `tests/e2e/section-header-visual.spec.ts-snapshots/` | 50 PNG | **Yes** — the harness now renders Inter instead of the host font for its sans text | Regenerate via `workflow_dispatch` on `.github/workflows/section-header-visual-regen.yml`, from the pinned image. Never from an arm64 host. |
| The 27 other harness specs asserting geometry figures | — | **Yes, where a pinned number is font-dependent** | Run them; update pinned figures with measured values and record before/after in the PR. This is the bulk of the work and cannot be enumerated statically — the suite run is the census. |
| The 25 unsynchronized callers (of the 28 font-sensitive) | 25 files, one wait **per measured document** | **Yes — each gains `await document.fonts.ready` per the §3.2 invariant**, which is per document, not per file and not per geometry read. Enumerated so the work is countable: `agendaScheduleLayout`, `appHealthIndicator.layout`, `attention-pill-focus`, `autoAppliedCardGrid.layout`, `bulk-ignore-eyebrow.layout`, `collapse-panel-morph`, `compact-alert-card-layout`, `dataQualityBadge.layout`, `developer-toggle-layout`, `hoverhelp-geometry`, `pendingDiscardReal.layout`, `pendingDiscardReflow.layout`, `popover-clip-fit`, `published-review-modal.layout`, `pusher-alignment.layout`, `section-header-layout.layout`, `section-header-visual`, `statusStripToggleLayout`, `step3-review-modal.agenda`, `step3-review-modal.interactions`, `step3-review-modal.layout`, `step3-review-page.layout`, `step3-schedule-bookend-layout`, `toggle-edge-layout`, `wizard-blocker-modal.layout`. | The three already synchronized (`resolve-label-layout`, `skeletonBandParity`, `stackedBandLayout`) need nothing. `section-header-visual` is in the list of 25 despite its screenshot being font-safe, because its `boundingBox()` read at `tests/e2e/section-header-visual.spec.ts:240` precedes the capture. Figures are re-derived only after the await lands — measuring first would bake in fallback metrics. |
| `tests/e2e/section-header-layout.layout.spec.ts:182`'s Arial pin | — | Decision, not churn | The pin exists because the ambient stack differed across OSes. Once harnesses render a repo-controlled face that is identical everywhere, the reason is gone. Retarget it at Inter and re-derive `HEADER_LINE_PX` and `HEADER_WITH_PILL_PX` (`tests/e2e/section-header-layout.layout.spec.ts:360-361`). **Not** a tolerance widening — the assertion and its floor stay; only the font it measures under changes, from a stand-in to the one that ships. |
| `public/help/screenshots/` | 14 WebP | **No** — application rendering is unchanged (§3.3 byte identity) | None. A diff here means the app's face moved, which §3.3 says it must not; investigate rather than rebaseline. |
| `tests/e2e/font-binding.spec.ts` | — | **No** — it reads the family from the token and measures against it | Expected green before and after. |

---

## 6. Documentation updates

- `DESIGN.md:133` — amend §2.1's mechanism sentence from `next/font/google` in `app/fonts.ts` to the self-hosted stylesheet, naming both root import sites and the harness path. **The typeface commitment is unchanged**; call the amendment out explicitly so a later reader can see it was ratified (§1.1) rather than drifted.
- `DESIGN.md` fallback-stack sentence — update to the live `--font-sans` value, now pinned by a §4.1 row.
- `DESIGN.md` §2.1 — note that the product also ships a monospace family. §2.1 commits to "a single contemporary sans for all UI" and never mentions mono, yet 34 surfaces render it deliberately (§4.2). This spec does not change that typography; it records it, because the guard has to know about it and a design document that omits a shipped family will mislead the next reader the same way it misled this one. If the omission is deliberate, that reason belongs in §2.1 too.
- BACKLOG.md — mark `BL-HARNESS-FONT-FIDELITY` resolved and graduate it to `BACKLOG-archive.md`, removing the in-flight marker per invariant 12.

---

## 7. Testing

Per invariant 1: failing test → minimal implementation → passing test → commit.

| Test | Shape | Concrete failure it catches |
| --- | --- | --- |
| The static guard (new, §4.1) | Source-text, DB-free | Every **static** §4.1 row — the runtime-only rows belong to the census spec and the shared fixture, two rows below. Red before implementation — the fonts stylesheet does not exist. |
| Harness-face e2e (new, §4.2) | Playwright | `compileEntryCss` emits no face. Red on the pre-change tree by construction. |
| `tests/e2e/font-binding.spec.ts` (existing) | Playwright, real route | The app's binding regressing during the mechanism swap. Expected green throughout — it reads the family from the token, so it is agnostic to how the face is delivered. |
| `tests/e2e/section-header-visual.spec.ts` (existing) | Playwright pixel, standalone | Expected to **move**, once, by design. New baselines regenerated from the pinned image. |
| The 28 font-sensitive harnesses | Playwright | Expected to move where a figure is font-dependent; the suite run is the census. 25 of them additionally gain waits (§5); the other three already synchronize. |
| The route-census oracle (new, §4.2) | Playwright, real routes | A family override on any route surface, including the interaction-only ones. |
| The shared harness fixture (new, §4.1) | Playwright fixture | Distributes the oracle to all 31 harness callers; without it their documents are unchecked. |
| The mono manifest + freshness assertion (new, §4.2) | Playwright, real routes | A cross-family regression in either direction, and a manifest entry left behind by a deleted component. |
| The fixture-wiring meta-test (new, §4.1) | Source-text, DB-free | A new `compileEntryCss` caller that does not import the fixture — fails by default. |
| `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | — | Pre-push gates. |

---

## 8. Risks

| Risk | Handling |
| --- | --- |
| The mechanism swap changes app rendering, moving the 14 WebPs. | §3.3 byte identity says it cannot. A moved WebP is a real defect to investigate, not a baseline to accept (§5). |
| A geometry figure is updated to a wrong value because the harness was mid-migration when it was measured. | Figures are re-derived only after `compileEntryCss` emits the face and the §4.2 case is green, never before. |
| `@font-face` migrates into `app/globals.css` during implementation, emitting `url()`s into 31 harnesses relative to the wrong directory. | §4.1 asserts `app/globals.css` contains no `@font-face`. No pixel gate can see this — a wrong `url()` 404s and renders identically. |
| Committed binaries bloat the repo. | 218888 bytes across seven files, hash-pinned, changed only by a deliberate upgrade. Only the 48432-byte latin file is fetched by an English page; the rest are `unicode-range`-gated. |
| The retired `next/font` path is reintroduced later, recreating two sources. | §4.1 asserts no file in the **repo-wide** source census imports `next/font` — `components/`, `lib/`, `scripts/`, root modules and MDX included, matching the census `singleFontLoader.test.ts` walks today. Scoping it to `app/` is the already-refuted narrower reading that a `components/`-hosted loader walks straight through. |
