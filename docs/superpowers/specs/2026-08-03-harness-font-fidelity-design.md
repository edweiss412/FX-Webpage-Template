# Self-host Inter so the app and its harnesses read one face — closing BL-HARNESS-FONT-FIDELITY

**Date:** 2026-08-03
**Branch:** `spec/harness-font-fidelity`
**Closes:** `BL-HARNESS-FONT-FIDELITY` (BACKLOG.md)
**Class:** test fidelity / CI determinism
**UI surface:** yes — `app/layout.tsx`, `app/global-error.tsx`, `app/globals.css`, `DESIGN.md`. Invariant 8 (impeccable critique + audit dual gate) applies.

---

## 1. Problem

PR #676 wired Inter at both Next roots and bound `--font-sans` to `var(--font-inter)`, so every React-root surface now renders the committed family. `BL-HARNESS-FONT-FIDELITY` is the residual it filed: the standalone e2e harnesses have no Next runtime, so no `@font-face` reaches them, and they resolve the inline `var()` fallback pair and land on the ambient host font — SF Pro locally, DejaVu Sans on the Ubuntu runner.

**The exposure is broader than the entry's "cost today is zero" suggests.** Measured on this branch:

| Population | Count |
| --- | --- |
| `compileEntryCss` callers (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`) | 31 |
| …that measure font-dependent geometry (`getBoundingClientRect`, `scrollWidth`, `offsetWidth`, or `toHaveScreenshot`) | **25** |
| …that pin a font themselves | **1** (`tests/e2e/section-header-layout.layout.spec.ts:182`) |

Cost is zero because nothing has drifted, not because few tests are exposed. Twenty-five harnesses measure geometry the font determines and one of them controls for it.

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
| **No database object is touched.** The tier × domain and CHECK/enum matrices (`docs/agents/spec-self-review.md:15` and `docs/agents/spec-self-review.md:16`) are N/A, stated rather than omitted. | — |
| **No new prop, input, or config flag.** Guard-conditions-per-prop (`docs/agents/spec-self-review.md:7`) and the flag lifecycle table (`docs/agents/spec-self-review.md:17`) are N/A. | — |

---

## 2. Goals and non-goals

**Goals**

- G1. The app and all 31 harnesses resolve the same Inter face from the same files.
- G2. The font bytes are pinned in the repo by hash, so an upstream change is a reviewable diff rather than silent baseline drift.
- G3. No build-time network fetch for fonts.
- G4. The metric-matched fallback #676 introduced stays reachable, and its absence is caught statically.
- G5. `DESIGN.md` describes the mechanism that actually ships.

**Non-goals**

- N1. Changing the typeface, the family commitment, or the `--font-sans` consuming declaration.
- N2. Changing subset coverage. All seven subsets Google serves are committed, which is exactly what `next/font` declares today (§3.3).
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

- `tests/styles/fontLoading.test.ts` — the static guard (§4.1).

And one it deletes: `app/fonts.ts`, whose only export is the `next/font` loader instance both roots consume for its generated class name. With a self-hosted face there is no generated class; `--font-inter` is defined in CSS, so `app/layout.tsx:58` and `app/global-error.tsx:31` drop the `inter.variable` fragment from their `className` and the module goes away.

**Retiring it is not a one-file delete, and round 1 was right that the draft under-scoped it.** Three existing surfaces encode the `next/font` mechanism and each needs an explicit disposition, given here so two implementers cannot choose differently:

<!-- spec-lint: ignore — the file is retired by this spec; the row is its disposition -->

| Surface | Encodes | Disposition |
| --- | --- | --- |
| `tests/assets/singleFontLoader.test.ts` (`tests/assets/singleFontLoader.test.ts:218` defines `CANONICAL_LOADER = "app/fonts.ts"`; asserted at `tests/assets/singleFontLoader.test.ts:440` and `tests/assets/singleFontLoader.test.ts:456`) | that `app/fonts.ts` is the sole loader and is invoked exactly once | **Replaced, not deleted.** Its contract — one family, one delivery point, no second loader — is exactly what §4.1's "no file under `app/` imports `next/font`" row now carries. Retarget this file at the self-hosted mechanism rather than dropping it, so the anti-drift intent survives the mechanism change. |
| `tests/observe/globalError.test.tsx:61` | that the crash screen carries the loader's generated variable class, "so `--font-inter` resolves here too" | **Assertion changed, test kept.** The intent — the crash screen resolves `--font-inter` — is exactly right and is the gap #676 had to fix. Under self-hosting the mechanism is the stylesheet import, so the assertion becomes that, and §4.1 carries the same check statically. |
| `tests/setup.ts:113-135` | a global `next/font/google` mock, because the real loader throws outside Next's build pipeline | **Removed.** With no `next/font` import anywhere under `app/`, nothing needs the mock, and leaving it is dead infrastructure that would quietly permit a reintroduction. |

Each is a red-then-green step in its own right: the retargeted assertions must fail against the current tree before the mechanism swap lands.

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

`app/layout.tsx` also gains a preload link for the latin subset only, matching what `next/font` preloads today:

```tsx
<link rel="preload" as="font" type="font/woff2" href="/fonts/inter-latin.woff2" crossOrigin="anonymous" />
```

`crossOrigin` is the JSX spelling; the raw-HTML `crossorigin` fails `pnpm typecheck` against React's `LinkHTMLAttributes`. `app/layout.tsx:58` renders `<html>` directly with no explicit `<head>`, so the tag goes in the JSX and React 19 hoists it.

### 3.2 The harness side

`compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`) is a single choke point: it runs the Tailwind CLI over a caller-supplied entry CSS and writes one `outFile`. All 31 callers serve that output as a static file beside their markup.

It gains one responsibility: alongside the stylesheet it already writes, emit the fonts stylesheet's `@font-face` block and copy the seven `.woff2` files into the same output directory, with `src` URLs relative to it. Because every caller already serves that directory, all 31 gain the real face at once with no per-caller change.

This is the step that self-hosting makes possible. Under `next/font` there is no file to copy — the bytes exist only inside a Next build — which is why the entry's alternative (a) required a *second*, independently-committed copy and carried drift risk by construction. With one committed source there is one set of bytes and nothing to drift against.

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

### 4.1 Static guard

Sibling precedent: `tests/styles/design-figure-parity.test.ts` and `tests/styles/focusRingContrast.test.ts` both read live `app/globals.css` and assert against a documented figure. Note that the former pins **contrast figures only** — it contains no font reference — so it is a shape precedent, not an existing font guard.

| Assertion | Failure caught |
| --- | --- |
| The fonts stylesheet declares **exactly seven** `@font-face` rules with `font-family: Inter`. | Dropping a subset. Text in its range silently falls to another family. |
| For each face, the `unicode-range` and the `src` filename are checked **as a pair** against §3.3 — not as two independent sets. | Permuting the source URLs among subsets. Face count, range set, and every hash still check out while Greek or Cyrillic text selects a file with none of its glyphs. |
| Every referenced file exists under `public/fonts/`, and each SHA-256 equals §3.3. | A rename, a `.gitignore` rule, or an unreviewed byte swap. Does **not** catch a version bump that skips the §3.4 Capsize re-derivation — that is a checklist item on §3.4, not a guard, and saying so beats crediting one that cannot see it. |
| Every one of the seven declares `font-display: swap`. | A font-block period, invisible to every test here (all await `document.fonts.ready`). |
| The `Inter Fallback` face declares `src: local("Arial")` and the four §3.1 override values. | Repointing the fallback at another local family leaves the overrides correct for a face they no longer describe — worse than no fallback, since they would scale the wrong glyphs. |
| `app/globals.css` defines `--font-sans` consuming `var(--font-inter, …)`, and contains **no** `@font-face` rule. | Regression of #676's binding; and `@font-face` migrating into the file every harness compiles, which would emit `url()`s into 31 harnesses relative to the wrong directory. |
| Both `app/layout.tsx` and `app/global-error.tsx` import the fonts stylesheet. | The crash screen silently reverting to a fallback face — the exact gap #676 had to fix once already, and no route-level test exercises it. |
| **No file in the repo-wide source census** imports `next/font` — the same census `tests/assets/singleFontLoader.test.ts` walks today: every directory including `components/`, `lib/`, `scripts/` and root-level modules, across `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` (`tests/assets/singleFontLoader.test.ts:163`) plus text-scanned `.mdx` (`tests/assets/singleFontLoader.test.ts:164`). | Re-introduction of the retired mechanism alongside the self-hosted one — the two-sources-drift failure this spec exists to prevent. **Scope corrected in round 2:** an earlier draft scoped this to `app/`, which is strictly narrower than the guard it replaces. A loader placed at, say, components/help/LocalFace.tsx and imported by `app/help/layout.tsx` has no `next/font` import under `app/` at all, and the existing browser guard visits admin, auth and crew but not help, so it would evade runtime corroboration too. That file's own comments record an earlier app-only walk failing this exact way. |
| `DESIGN.md`'s mechanism sentence and fallback-stack sentence match the live `app/globals.css` value. | G5 regressing silently. Nothing previously held these together (`design-figure-parity.test.ts` is contrast-only). |
| The `@font-face` block `compileEntryCss` emits is equal to the one in the fonts stylesheet. | **The fifth escaping mutant:** emitting a face that declares `font-family: "Inter"` but sources `local("Arial")`. Nothing else in this table looks at what the harness toolchain emits — every other row inspects the app stylesheet, which the mutant leaves untouched. Without this row the harnesses can render any face under the committed name. |
| The fonts stylesheet defines `--font-inter` with the exact value `"Inter", "Inter Fallback"`. | **The third escaping mutant, found in round 1:** defining `--font-inter: "Inter"` alone. Every other row passes — the fallback face still exists, and `app/globals.css` still carries the inline `var()` fallback pair — so the metric-matched face becomes unreachable through the token while G4's stated static guarantee reads as satisfied. Pinning the face is not enough; the value that reaches it is what matters. |
| `app/layout.tsx` renders a `<link rel="preload">` for the latin subset, with `as="font"`, `type="font/woff2"` and `crossOrigin`. | **The fourth escaping mutant:** omitting the preload entirely. Every row passes, and `tests/e2e/font-binding.spec.ts` passes too because it awaits `document.fonts.ready` and therefore cannot observe discovery latency. The mechanism would silently stop matching `next/font`'s behavior — which preloads by default — lengthening the fallback interval with no gate the wiser. |
| The license file `public/fonts` OFL.txt exists and is non-empty. | License file lost in a cleanup. |

Source-text assertions; DB-free unit suite.

### 4.2 Executable guard — the harness face

`tests/e2e/font-binding.spec.ts` already proves the **app** renders Inter, on `/admin`, by measuring rendered text width against the family read from the token (`crew-e2e.yml:7-8`). It is untouched.

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
  font-display: swap;
  unicode-range: U+0000-00FF;
}
```

Emit that from `compileEntryCss` and every §4.1 row still passes (the app stylesheet and its seven hashed files are untouched), `tests/e2e/font-binding.spec.ts` still passes (real routes still use the correct stylesheet), and a `some(f => f.family === "Inter" && f.status === "loaded")` predicate returns true — because `FontFace.family` is whatever the author wrote, and identifies nothing about the source. Every harness would render Arial under the name Inter, geometry baselines would be regenerated around the wrong face, and the suite would be green. That defeats G1 outright.

So the case asserts both:

- **Source equality.** The `@font-face` block `compileEntryCss` emits is equal to the block in the fonts stylesheet — same families, same `src` filenames, same ranges, same descriptors. This is what ties the harness face to the seven hash-pinned files rather than to a name.
- **Rendered metric.** A fixed string measures to Inter's width, the posture `tests/e2e/font-binding.spec.ts` already uses on the app side (loaded-face presence combined with a width check), so a face that merely claims the name fails.

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
| `tests/e2e/section-header-visual.spec.ts-snapshots/` | 50 PNG | **Yes** — the harness now renders Inter instead of the host font | Regenerate via `workflow_dispatch` on `.github/workflows/section-header-visual-regen.yml`, from the pinned image. Never from an arm64 host. |
| The 24 other harness specs asserting `getBoundingClientRect` / width figures | — | **Yes, where a pinned number is font-dependent** | Run them; update pinned figures with measured values and record before/after in the PR. This is the bulk of the work and cannot be enumerated statically — the suite run is the census. |
| `tests/e2e/section-header-layout.layout.spec.ts:182`'s Arial pin | — | Decision, not churn | The pin exists because the ambient stack differed across OSes. Once harnesses render a repo-controlled face that is identical everywhere, the reason is gone. Retarget it at Inter and re-derive `HEADER_LINE_PX` and `HEADER_WITH_PILL_PX` (`tests/e2e/section-header-layout.layout.spec.ts:360-361`). **Not** a tolerance widening — the assertion and its floor stay; only the font it measures under changes, from a stand-in to the one that ships. |
| `public/help/screenshots/` | 14 WebP | **No** — application rendering is unchanged (§3.3 byte identity) | None. A diff here means the app's face moved, which §3.3 says it must not; investigate rather than rebaseline. |
| `tests/e2e/font-binding.spec.ts` | — | **No** — it reads the family from the token and measures against it | Expected green before and after. |

---

## 6. Documentation updates

- `DESIGN.md:133` — amend §2.1's mechanism sentence from `next/font/google` in `app/fonts.ts` to the self-hosted stylesheet, naming both root import sites and the harness path. **The typeface commitment is unchanged**; call the amendment out explicitly so a later reader can see it was ratified (§1.1) rather than drifted.
- `DESIGN.md` fallback-stack sentence — update to the live `--font-sans` value, now pinned by a §4.1 row.
- BACKLOG.md — mark `BL-HARNESS-FONT-FIDELITY` resolved and graduate it to `BACKLOG-archive.md`, removing the in-flight marker per invariant 12.

---

## 7. Testing

Per invariant 1: failing test → minimal implementation → passing test → commit.

| Test | Shape | Concrete failure it catches |
| --- | --- | --- |
| The static guard (new, §4.1) | Source-text, DB-free | Each §4.1 row. Red before implementation — the fonts stylesheet does not exist. |
| Harness-face e2e (new, §4.2) | Playwright | `compileEntryCss` emits no face. Red on the pre-change tree by construction. |
| `tests/e2e/font-binding.spec.ts` (existing) | Playwright, real route | The app's binding regressing during the mechanism swap. Expected green throughout — it reads the family from the token, so it is agnostic to how the face is delivered. |
| `tests/e2e/section-header-visual.spec.ts` (existing) | Playwright pixel, standalone | Expected to **move**, once, by design. New baselines regenerated from the pinned image. |
| The 24 geometry harnesses | Playwright | Expected to move where a figure is font-dependent; the suite run is the census. |
| `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | — | Pre-push gates. |

---

## 8. Risks

| Risk | Handling |
| --- | --- |
| The mechanism swap changes app rendering, moving the 14 WebPs. | §3.3 byte identity says it cannot. A moved WebP is a real defect to investigate, not a baseline to accept (§5). |
| A geometry figure is updated to a wrong value because the harness was mid-migration when it was measured. | Figures are re-derived only after `compileEntryCss` emits the face and the §4.2 case is green, never before. |
| `@font-face` migrates into `app/globals.css` during implementation, emitting `url()`s into 31 harnesses relative to the wrong directory. | §4.1 asserts `app/globals.css` contains no `@font-face`. No pixel gate can see this — a wrong `url()` 404s and renders identically. |
| Committed binaries bloat the repo. | 218888 bytes across seven files, hash-pinned, changed only by a deliberate upgrade. Only the 48432-byte latin file is fetched by an English page; the rest are `unicode-range`-gated. |
| The retired `next/font` path is reintroduced later, recreating two sources. | §4.1 asserts no file under `app/` imports `next/font`. |
