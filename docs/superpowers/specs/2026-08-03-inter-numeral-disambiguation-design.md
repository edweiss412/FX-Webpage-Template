# Inter numeral disambiguation — self-host upstream Inter so the OpenType features exist

**Date:** 2026-08-03
**Backlog entry:** `BL-INTER-NUMERAL-DISAMBIGUATION` (BACKLOG.md)
**Branch:** `feat/inter-numeral-disambiguation`
**Class:** typography / legibility, plus documentation correctness
**Touches:** UI surface (`app/`, `DESIGN.md`) → invariant 8 impeccable dual gate applies. No DB, no advisory locks, no RPC.

---

## 1. Problem

`BL-INTER-NUMERAL-DISAMBIGUATION` asks for `"zero" 1, "cv05" 1` on the tabular rule at `app/globals.css:658-664`, so crew reading room numbers, call times and confirmation numbers on a phone in direct sun can tell `0` from `O` and `I` from `l` from `1`.

**The entry's premise is false.** Google Fonts serves a build of Inter with the character-variant and stylistic-set features stripped. Adding those tags changes nothing on screen. The same is true of the `cv11` this codebase has been declaring since `78662acb5` (2026-05-03) — it has never rendered, on any route, on any device.

The legibility problem is real. The proposed fix does not reach it. Reaching it requires changing how the family is delivered, which is a decision `DESIGN.md` §2.1 ratified and this spec supersedes.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratified | Where |
| --- | --- | --- |
| Self-host upstream Inter v4.1 via `next/font/local`, superseding `DESIGN.md:133`'s `next/font/google` mechanism | User, 2026-08-03, after reviewing the measured feature tables in §2 | this spec |
| Vendor the release binary **verbatim** — no subsetting, no generation step, 344 KB | User, 2026-08-03 | §3.1 |
| `ss04` at `html` + `zero` added to the tabular rule — **not** `ss02` globally, **not** `zero` alone | User, 2026-08-03, choosing among three rendered options | §3.3 |
| `cv05` alone is the wrong tag: it moves lowercase `l` and leaves capital `I` untouched. `ss04` is Inter's own "disambiguation without zero" and covers both | Probe, §2.3 | §3.3 |
| The dead `cv11` is **deleted, not revived**. It is now available, but turning on a single-storey `a` product-wide is a type decision nobody has made | this spec | §6 |
| Italic stays synthesized. The product loads no italic face today (`font-style: normal`, §2.4) and loads none after | this spec | §3.1 |
| `BL-HARNESS-FONT-FIDELITY` is **not** closed here. A vendored file makes it tractable; wiring 31 harnesses is its own spec | BACKLOG.md, `BL-HARNESS-FONT-FIDELITY` | §6 |
| The four false `DESIGN.md` claims and the false plan disposition are corrected **in this branch**, not filed | this spec | §3.4 |

---

## 2. Probe findings

Every claim in this section is measured, not reasoned. Commands and outputs are in the review dispatch transcript.

### 2.1 What Google serves

Fetched live from fonts.gstatic.com on 2026-08-03 — the stylesheet at fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap, latin subset UcC73FwrK3iLTeHuS\_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2 — and read with fontTools:

```
features: calt ccmp dnom frac kern locl mark mkmk numr pnum tnum
axes:     wght 100–900
```

The same read against all seven woff2 files that `next/font/google` has already downloaded into .next/static/media/ returns the same set or a subset of it. **No `zero`. No `cv05`. No `cv08`. No `cv11`. No `ss01`–`ss08`. No `case`. No `opsz`.**

### 2.2 What upstream ships

`rsms/inter` release v4.1, the file web/InterVariable.woff2 inside it:

```
features: aalt calt case ccmp cpsp cv01–cv14 dlig dnom frac kern locl mark mkmk
          numr ordn pnum salt sinf ss01–ss08 subs sups tnum zero
axes:     opsz 14–32, wght 100–900
```

### 2.3 What the disambiguation tags actually substitute

Read out of the upstream `GSUB` lookup tables directly, not from documentation:

| Tag | Substitutions | Effect |
| --- | --- | --- |
| `zero` | `zero → zero.slash` (+ 7 positional variants) | Slashed zero. Separates `0` from `O`. |
| `cv05` | `l → l.ss02` (+ 14 accented forms) | Lowercase L gains a tail. |
| `cv08` | `I → I.1` (+ 33 accented forms) | Capital I gains serifs. |
| `ss02` | `I → I.1`, `l → l.ss02`, `zero → zero.slash` | Inter's "Disambiguation" — all three. |
| `ss04` | `I → I.1`, `l → l.ss02` | Same, **minus** the zero. `ss02 − ss04 = {zero, zero.tf, zero.squared, uni24EA}`. |

This is why the entry's `zero + cv05` pair is incomplete on its own terms, independent of availability: it never touches capital `I`.

### 2.4 What the current build actually emits

From `.next/static/chunks/*.css` in the committed build:

```css
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;
  src:url(...)format("woff2");unicode-range:U+0000-00FF,...}
```

Seven such rules, one per Google subset, each carrying `unicode-range` so only the needed subset downloads. `font-style: normal` is explicit and there is no italic face — the seven live italic render sites (`app/help/_components/ScreenshotPlaceholder.tsx:15`, `components/atoms/EmptyState.tsx:83`, `components/admin/telemetry/HealthAlertsPanel.tsx:217`, `components/admin/wizard/step3ReviewSections.tsx:2166`, `components/crew/sections/GearSection.tsx:421`, `components/admin/review/AttentionBanner.tsx:225`, `components/admin/settings/AdministratorsSection.tsx:214`) are synthesized obliques today.

### 2.5 What `next/font/local` can and cannot reproduce

Read from Next's bundled font loader sources, not from documentation. **Vendor paths below are deliberately plain text, not code spans:** they live under node_modules, which is untracked, and `pnpm spec:lint` resolves every code-span citation against `git ls-files`. Do not "fix" them into backticks — the linter will fail. Two files, both under node_modules/next/dist:

- **`unicode-range` per file: not expressible.** `declarations` is applied uniformly to every `@font-face` the loader emits, and `src`-as-array emits one face per entry with the same declarations. Google's on-demand seven-subset split cannot be reproduced. One file, one coverage decision. — compiled/@next/font/dist/local/loader.js:36-39
- **`adjustFontFallback` defaults ON** and, unlike the Google loader's static metric table, computes overrides from *our* font file: `getFallbackMetricsFromFontFile(fallbackFontFile.fontMetadata, 'sans-serif')` when `adjustFontFallback !== false`. — compiled/@next/font/dist/local/loader.js:61-66
- **The `variable` token keeps its two-entry shape.** The token is built as the font family, then the generated `Fallback` family, then any `fallback` entries. So `--font-inter` still names a metric-matched companion second, which is exactly what `tests/e2e/font-binding.spec.ts:246-255` asserts. **The existing e2e binding test survives the swap unchanged.** — esm/build/webpack/loaders/next-font-loader/postcss-next-font.js:49-59 and :96-100
- **`weight` and `style` must be passed explicitly.** The loader emits `font-weight` / `font-style` descriptors only when given, and `declarations` is forbidden from carrying them. Omitting `weight` on a variable font would leave the face at an implied `normal`, so the browser would synthesize bold instead of using the `wght` axis. — compiled/@next/font/dist/local/loader.js:42-47 and compiled/@next/font/dist/local/validate-local-font-function-call.js:50
- **The generated family name becomes a hash**, not the literal `Inter` — the loader uses the JS variable name the call is assigned to. Nothing depends on the literal: `--font-sans` reads the token and the e2e test reads the family from the token. But two comments that describe the literal go stale (§3.4). — compiled/@next/font/dist/local/loader.js:39

### 2.6 Payload, measured

| Option | woff2 bytes | vs today | Coverage |
| --- | --- | --- | --- |
| Today, Google latin subset | 47.3 KB | — | latin, six more on demand |
| **Upstream verbatim (chosen)** | **344.0 KB** | **+296.7 KB** | everything Google covers, and more |
| Subset to latin + latin-ext | 173.5 KB | +126.2 KB | drops Cyrillic, Greek, Vietnamese |
| Subset to latin | 72.4 KB | +25.1 KB | also drops Polish ł, Czech č, Turkish ğ |

Verbatim is chosen because it is the only row with no generation step: the artifact is a signed release file with a recorded checksum, not committed build output, so no byte-reproducibility gate is needed and the byte-comparison discipline in `AGENTS.md` does not engage. Subsetting later is a one-file change requiring no re-decision.

### 2.7 The guard test is buildable

`fontkit` opens `.woff2` in Node with no decompression step and exposes both things the guard needs:

```
availableFeatures: aalt calt case ccmp cpsp cv01 … ss04 … tnum zero
variationAxes:     [ 'opsz', 'wght' ]
```

One new devDependency.

---

## 3. What ships

### 3.1 The vendored font

`app/_fonts/InterVariable.woff2` — 352,240 bytes, sha256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`, from `rsms/inter` release v4.1 (Inter-4.1.zip, sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`), file web/InterVariable.woff2 inside it.

`app/_fonts/LICENSE.txt` — the SIL Open Font License 1.1 text shipped in that release, verbatim. Required: the OFL obliges the license to accompany the font.

`app/_fonts/PROVENANCE.md` — release tag, both checksums, the upstream URL, and the date fetched, so a future reader can verify the binary without trusting this document.

The `_` prefix makes the directory private to the App Router, so it never becomes a route.

### 3.2 The loader

`app/fonts.ts` swaps `Inter` from `next/font/google` for `localFont`:

```ts
import localFont from "next/font/local";

export const inter = localFont({
  src: "./_fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});
```

Every option is load-bearing and justified in §2.5. `weight: "100 900"` and `style: "normal"` reproduce the descriptors §2.4 measured on the current build exactly. `adjustFontFallback` is left at its default, which is ON. `preload` is left at its default, which is `true` — matching today's behavior; the preload payload grows from 47 KB to 344 KB, which §5 records as the accepted cost.

The module's existing two-roots rationale is unchanged and its doc comment is kept; only the sentences describing `next/font/google` and the literal family name are corrected.

### 3.3 The CSS

`app/globals.css`, at the `html` rule (currently line 670):

```css
html {
  font-family: var(--font-sans);
  font-feature-settings: "ss04" 1;
  ...
}
```

`app/globals.css`, replacing the tabular rule at lines 658-664:

```css
time,
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings:
    "ss04" 1,
    "tnum" 1,
    "zero" 1;
}
```

**`ss04` is repeated in the tabular rule deliberately.** `font-feature-settings` inherits as a whole value, not as a merged list, so a rule that sets it replaces the inherited `"ss04" 1` entirely. Without the repeat, a `.tabular-nums` span containing letters — `A1 · Audio Lead`, a stage label, a plate number — would silently lose the disambiguation the `html` rule grants everything else. This is the single most likely implementation defect in the change and the guard in §4.2 exists to catch it.

`cv11` is removed. It never rendered; §6 records why it is not revived.

### 3.4 The documentation corrections

Five claims are false today. Each is corrected in this branch, in the same commit as the change that makes the corrected statement true where applicable.

| Claim | Location | Correction |
| --- | --- | --- |
| "Loaded via `next/font/google` in `app/fonts.ts`" | `DESIGN.md:133` | `next/font/local` against the vendored binary; record the supersession and why. |
| "it has explicit display-vs-text optical sizing built in" | `DESIGN.md:135` | Was false of the Google build (`wght` only). Becomes **true** after the swap — the `opsz` axis ships in the vendored file and `font-optical-sizing` defaults to `auto`. Rewrite to say so and cite the axis. |
| "`font-feature-settings: 'tnum' 1, 'cv11' 1`" as the mandatory contract | `DESIGN.md:172` | Restate as `'ss04' 1, 'tnum' 1, 'zero' 1`, with the inheritance note from §3.3. |
| "Tailwind utility: `font-tabular` (mapped via `@theme` → `--font-feature-settings-tabular`)" | `DESIGN.md:174` | **Delete.** Neither the utility nor the token has ever existed; nothing under `app/`, `components/` or `lib/` uses it. §2.4 currently offers two "equivalent application surfaces" and only one is real. |
| "`cv11` is Inter's single-storey 'a' alternate … improves call-time legibility on mobile" | `DESIGN.md:177` | Replace with the `ss04`/`zero` justification: which glyphs, why split that way, and that the split is the typeface's own. |
| "now deterministically activates Inter's alternates on admin/auth/help for the first time" | `docs/superpowers/plans/2026-08-03-app-wide-font-binding.md:246` | Correct the P3 disposition in place. No alternates were activated; the served font had none. Leave the row, mark the correction and its date, so the record shows what was believed and what was true. |

The fallback-stack prose at `DESIGN.md:139-141` and the `--font-sans` comment at `app/globals.css:104-112` both describe the generated family as the literal `Inter`. After the swap it is a hash. Both are corrected to say the token is the single source and the literal `"Inter"` in the `var()` fallback now names only a host-installed Inter, for harnesses with no Next runtime.

### 3.5 Dimensional Invariants

This change introduces no component, no fixed-dimension parent, and no flex or grid container. It alters only which glyphs a font renders and which family the loader binds. The relevant dimensional question is not parent→child sizing but **whether text metrics change**, and they do — for one reason, tracked as a gate rather than an invariant:

| Relationship | Guarantee | Verified by |
| --- | --- | --- |
| Rendered text advance width, before vs after the swap | **Not held constant, deliberately.** The vendored font activates the `opsz` axis, and `font-optical-sizing` defaults to `auto`, so glyph widths shift slightly at every size. | §4.5, a real-browser one-line assertion at the narrowest viewport. §5 records the `font-optical-sizing: none` fallback if it fails. |
| First-paint layout vs swapped layout | **Held.** `adjustFontFallback` generates a metric-matched companion from the vendored file's own metrics, and `--font-inter` still names it second, so the `display: swap` window does not reflow. | `tests/e2e/font-binding.spec.ts:246-255`, unchanged and re-run. |
| Every other parent→child dimension in the product | **N/A** — no layout container, class, or dimension token is touched by this change. | — |

### 3.6 Transition Inventory

**N/A — no component with visual states is added or modified.** The change has no animated surface: no `AnimatePresence`, no conditional render, no state machine, no hover or focus treatment. The only visual state transition anywhere near it is the font-swap window, which is not a component state — it is the browser's `display: swap` behavior, is unchanged by this work, and is covered by the metric-matched-companion row in §3.5.

---

## 4. Tests

Every task is TDD: failing test, minimal implementation, passing test, commit.

### 4.1 Feature-availability guard — the bug class this change exists to kill

tests/styles/fontFeatureAvailability.test.ts. Walks `app/globals.css`, extracts every OpenType tag from every `font-feature-settings` declaration, opens `app/_fonts/InterVariable.woff2` with `fontkit`, and asserts each tag appears in `availableFeatures`.

**Failure mode it catches:** exactly the one that produced this backlog entry — a feature tag declared in CSS that the loaded font cannot honor, rendering nothing and reading as intentional for three months.

**Proved against the historical bug, not just asserted.** The guard's checking function is exported and exercised twice: once against the vendored font, where it must report no missing tags; and once against a committed fixture of the Google-served binary this change replaces — tests/styles/fixtures/inter-google-latin-v20.woff2, 47.3 KB, the exact file measured in §2.1 — where it must report `zero`, `ss04` **and** `cv11` as missing. That second assertion is the regression proof: it demonstrates the guard would have caught the dead `cv11` on the day it was written in `78662acb5`. Without it, the guard is only a claim about the future.

Scoped so it cannot pass by accident: the tag list is extracted from the CSS source, not hardcoded, so a future tag added to any rule is covered by default. The test asserts the extracted tag list is non-empty and contains at least the three tags §3.3 requires before comparing, so a regex that silently stops matching fails loudly instead of passing vacuously against an empty set.

### 4.2 Tabular-rule inheritance guard

Same file. Asserts that every `font-feature-settings` declaration in `app/globals.css` that is not the `html` rule's own also carries every tag the `html` rule declares — the §3.3 inheritance trap, stated structurally rather than as a comment.

**Failure mode it catches:** someone adds a third `font-feature-settings` rule later, omits `ss04`, and silently drops disambiguation on that surface.

### 4.3 Axis guard

Same file. Asserts the vendored font exposes both `opsz` and `wght`, because `DESIGN.md:135` will claim optical sizing after §3.4 and that claim must be enforced, not merely written.

### 4.4 Real-browser rendering proof

`tests/e2e/font-binding.spec.ts` gains one test: on a real page, measure the rendered advance width of `0` with and without `font-feature-settings: "zero" 1` applied, and assert they differ. jsdom cannot do this — it computes no layout and applies no OpenType feature.

**Failure mode it catches:** the whole class of "the declaration is present and the glyph is unchanged" that this spec is about. A test that only asserts the CSS string is present would have passed for the entire life of the `cv11` bug.

The existing binding assertions are expected to pass unchanged (§2.5). They are re-run, not rewritten.

### 4.5 Regression surface

`tests/e2e/font-binding.spec.ts:376` asserts an event-detail group title occupies one line at the narrowest viewport. The vendored font activates the `opsz` axis, which changes metrics at small sizes. This test is a genuine gate on that change, not a formality — §5 records the fallback if it fails.

---

## 5. Documented limits and accepted costs

- **Preload grows from 47 KB to 344 KB.** Accepted per §2.6. It loads behind `display: swap` with a metric-matched fallback, so it never blocks first paint, and it is cached across every route and every show after one fetch. If field evidence shows it matters, subsetting is a one-file change.
- **Optical sizing changes metrics everywhere.** `font-optical-sizing` defaults to `auto` and the vendored font has an `opsz` axis, so every size renders slightly differently from today. This is an improvement and makes `DESIGN.md:135` true. **If §4.5 fails**, the fallback is `font-optical-sizing: none` at `html`, which pins metrics to the 14pt master; that reverses the §3.4 correction for `DESIGN.md:135`, which must then be rewritten again rather than left claiming a disabled feature.
- **Italic remains synthesized.** No change from today (§2.4). Shipping the upstream italic face would add another 378.9 KB for seven low-traffic surfaces.
- **The 31 standalone harnesses still render the ambient host font.** Unchanged by this work; `BL-HARNESS-FONT-FIDELITY` owns it, and a vendored file at a known path makes it tractable.
- **`ss04` moves `I` and `l` in every string in the product**, including proper nouns and copy. That is the point, and the artifact rendered it on real strings before the decision. It does not touch digits.

---

## 6. Out of scope

- **Reviving `cv11`.** Now available, deliberately not enabled. A single-storey `a` product-wide is a visible type decision nobody has made, and enabling it inside the tabular rule — where it has lived, inert — would apply it to number spans that contain almost no letters. Delete now; a future spec may propose it product-wide on its own merits.
- **`ss02` globally**, i.e. a slashed zero in running prose. Considered and rejected at the decision gate.
- **Subsetting the font.** §2.6.
- **`BL-HARNESS-FONT-FIDELITY`.** §5.
- **Building the `font-tabular` utility** `DESIGN.md:174` describes. Nothing uses it; the claim is deleted rather than implemented.
- **Regenerating help screenshots.** No screenshot in `public/help/screenshots/` is a specimen of numerals under test, and regenerating on an arm64 host would pollute the x64-Linux baseline.

---

## 7. Acceptance criteria

1. `app/_fonts/InterVariable.woff2` is present, matches the §3.1 checksum, and is accompanied by the OFL text and a provenance record.
2. `tests/styles/fixtures/inter-google-latin-v20.woff2` is present as the regression fixture §4.1 requires, and the guard reports `zero`, `ss04` and `cv11` missing against it.
3. `app/fonts.ts` loads it via `next/font/local` with the §3.2 options; no `next/font/google` import remains in the repo.
4. `app/globals.css` declares `ss04` at `html` and `ss04`/`tnum`/`zero` on the tabular rule; no `cv11` remains.
5. tests/styles/fontFeatureAvailability.test.ts passes, and is demonstrated to fail against the previous Google-served font.
6. The new §4.4 rendering test proves a slashed zero renders, in a real browser.
7. Every existing `tests/e2e/font-binding.spec.ts` assertion passes unchanged.
8. All five §3.4 documentation claims are corrected, and no false claim about Inter's features remains anywhere in the repo (`rg` sweep over `DESIGN.md`, `PRODUCT.md`, `docs/`, and source comments for `cv11`, `cv05`, `font-tabular`, `optical sizing`).
9. `BL-INTER-NUMERAL-DISAMBIGUATION` is graduated to `BACKLOG-archive.md` with its premise correction recorded, and its IN PROGRESS marker is cleared.
10. `/impeccable critique` and `/impeccable audit` both pass on the diff, with the closeout marker line recorded.

---

## 8. Citations

Verified against the worktree at `deda7d989` before drafting.

| Claim | Anchor |
| --- | --- |
| Current loader, options, two-roots rationale | `app/fonts.ts:27-33` |
| Tabular rule as it stands | `app/globals.css:658-664` |
| `--font-sans` token and its comment | `app/globals.css:104-115` |
| §2.1 family mechanism | `DESIGN.md:133` |
| Optical-sizing claim | `DESIGN.md:135` |
| Fallback-stack prose | `DESIGN.md:139-141` |
| §2.4 mandatory contract, phantom utility, `cv11` justification | `DESIGN.md:172`, `DESIGN.md:174`, `DESIGN.md:177` |
| False P3 disposition | `docs/superpowers/plans/2026-08-03-app-wide-font-binding.md:246` |
| Existing binding assertions the swap must not break | `tests/e2e/font-binding.spec.ts:246-255` |
| One-line title regression gate | `tests/e2e/font-binding.spec.ts:376` |
| `next/font/local` uniform declarations | §2.5, first bullet (vendor path, plain text) |
| `adjustFontFallback` default and metric source | §2.5, second bullet |
| Variable-token two-entry shape | §2.5, third bullet |
| `weight`/`style` descriptor emission, and `declarations` may not carry them | §2.5, fourth bullet |
| Generated family name is a hash, not the literal | §2.5, fifth bullet |
| Live italic render sites (7, enumerated) | §2.4 |
| Structural-guard precedent for a styles meta-test | `tests/styles/eyebrow-tracking.test.ts` |
