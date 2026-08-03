# Spec — app-wide font binding (`BL-HEADER-FONT-FALLBACK-WRAP`)

**Date:** 2026-08-03 · **Branch:** `feat/font-binding-modal-freshness-cue` · **Backlog entry:** `BL-HEADER-FONT-FALLBACK-WRAP` (`BACKLOG.md:249`) · **Implementer:** Opus / Claude Code (UI hard rule, `AGENTS.md` routing section)

---

## 0. One-line statement

`DESIGN.md:133` commits the product to Inter loaded via `next/font/google` in `app/layout.tsx`; that wiring was never done, so **only the crew tree renders Inter and the admin and help trees render the system fallback**. This spec wires the ratified mechanism at the ratified location and pins the result with a real-browser font-identity assertion.

---

## 1. Background — what is actually true today

### 1.0 Probe data (empirical spike, run before drafting)

Per `docs/agents/spec-self-review.md:21` (empirical spike before speccing framework surfaces) and the backlog entry's own instruction to browser-check before acting, a Playwright probe was run against a **real crew page** (`/show/<slug>/<shareToken>`, seeded via `tests/e2e/helpers/seedShowWithCrew.ts`) and against the **admin tree** (`/sign-in`), on a dev server, Desktop Chrome, `document.fonts.ready` awaited. Oracle: render `"Wardrobe & key moments"` at `16px/400` in a probe span and compare the **inherited** width against widths forced onto each candidate family.

| Surface | `document.fonts` registered families | inherited width | forced `"Inter"` | generic `sans-serif` | verdict |
| --- | --- | --- | --- | --- | --- |
| crew page | `Inter` (7 faces, one `loaded`), `Inter Fallback`, `__nextjs-Geist*` (dev overlay) | **192.38px** | **192.38px** | 182.61px | **renders Inter** |
| admin (`/sign-in`) | `__nextjs-Geist*` only (dev overlay) | **185.53px** | 167.14px | 182.61px | **does NOT render Inter** |

Three findings, all load-bearing:

1. **The crew binding works.** Next 16's `next/font/google` registers the face under the **literal** family name `Inter` (plus a size-adjusted `Inter Fallback`), not a hashed `__Inter_<hash>` name. So `--font-sans`'s literal `"Inter"` (`app/globals.css:103-104`) matches it. The backlog entry's stated doubt — *"`next/font`'s hashed `@font-face` family name does not obviously satisfy"* (`BACKLOG.md:253`) — is **empirically refuted for Next 16**. `--font-inter` (`app/show/[slug]/layout.tsx:36`) is genuinely unconsumed, but the binding does not depend on it.
2. **The admin tree renders the system fallback.** `185.53px` is neither the Inter width (192.38) nor generic `sans-serif` (182.61) — on this macOS host it is `-apple-system` / SF Pro, the third entry in the stack. On a bare-Linux client with none of the six named faces it falls through to generic `sans-serif` → DejaVu Sans, which is the wrap the backlog entry measured in CI.
3. **`document.fonts.check('16px "Inter"')` is NOT a usable oracle** — it returned `true` on the admin tree where Inter is provably absent (the forced-`"Inter"` probe fell back to the default serif metric, 167.14px, identical to the `serif` control). Any test written for this spec must use the **width comparison**, never `fonts.check()`.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
| --- | --- | --- |
| R1 | **The mechanism is `next/font/google` in `app/layout.tsx`.** Not a self-hosted `@font-face`, not `@fontsource`. | `DESIGN.md:133` — *"Loaded via `next/font/google` in `app/layout.tsx` (a future task wires this up; this file only defines tokens)."* This spec IS that future task. No DESIGN.md amendment is needed or wanted. |
| R2 | **`--font-sans` is not edited.** The literal-`"Inter"` stack stays byte-identical. | `DESIGN.md:139` pins the fallback stack verbatim; §1.0 finding 1 proves the literal name binds. Editing the token to `var(--font-inter), …` would make the declaration **invalid at computed-value time** on any surface lacking the `.variable` class (every standalone harness), which drops `font-family` to `unset` rather than falling through the stack — strictly worse. |
| R3 | **Widening the tolerance in `tests/e2e/section-header-layout.layout.spec.ts` is REFUSED.** That file pins Arial / Liberation Sans for exactly one measurement, deliberately, with the reason inline. | `tests/e2e/section-header-layout.layout.spec.ts:165-183`; brief instruction; `BACKLOG.md:261`. Relaxing it hides the finding. A reviewer proposing it should be refused with this row. |
| R4 | **The standalone-harness residual is OUT OF SCOPE and is a documented limit, not a defect.** The 33 standalone harnesses (`tests/e2e/*.spec.ts` using `compileEntryCss`) serve static HTML + compiled `app/globals.css` with **no Next.js runtime**, so no `next/font` mechanism can reach them. They keep measuring the ambient host font. | §5.2 below. Cost today is zero: CI is green, and the one measurement that needed determinism already carries the Arial pin (R3). Filed forward as `BL-HARNESS-FONT-FIDELITY`. |
| R5 | **No product copy, label, or layout class changes.** Option (b) from the backlog entry (`whitespace-nowrap` + truncation on group titles) is **not** taken. | Once Inter loads app-wide, the wide-fallback path no longer exists for anything the Next app renders, including the swap window (`Inter Fallback` is metric-size-adjusted). Adding an ellipsis to a real product label to satisfy a test harness inverts the dependency. See §5.1. |
| R6 | **Help-screenshot baselines WILL change and are regenerated via the pinned-image workflow, never from a dev machine.** | `AGENTS.md` byte-comparison discipline; `.github/workflows/screenshots-regen.yml:46` pins the Playwright v1.59.1-jammy Docker image on a native-amd64 runner. See §6. |

---

## 2. The change

### 2.1 `app/layout.tsx` — load and expose Inter

Add the `next/font/google` import and apply the generated class to `<html>`, alongside the existing `h-full antialiased`:

- `Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" })` — **identical options** to the crew layout's existing call (`app/show/[slug]/layout.tsx:33-37`), so the two cannot diverge in weight range, subset, or swap behavior during the transition.
- The class goes on `<html>` (`app/layout.tsx:57`), not `<body>`, because `app/globals.css:659-663` applies `font-family: var(--font-sans)` at the `html` element. Putting it lower would leave `<html>`'s own computed font unbound.
- `--font-inter` remains exposed (unconsumed by `--font-sans` per R2) so the named token stays available for any future inline use, exactly as the crew layout's comment (`app/show/[slug]/layout.tsx:11-15`) describes.

### 2.2 `app/show/[slug]/layout.tsx` — drop the now-redundant duplicate

Remove the `Inter` import, the `inter` constant, and `${inter.variable}` from the `page-shell` class list. Rationale: two `next/font/google` calls for the same family emit two independent `@font-face` sets under the same family name — the probe already shows **seven** `Inter` faces registered on the crew page. One loader, at the root, is the ratified shape (R1).

**Guard conditions for this edit:**

| Concern | Disposition |
| --- | --- |
| `data-testid="page-shell"` | UNCHANGED. Asserted at `tests/e2e/crew-page.spec.ts:1432` (`toBeVisible`) — a visibility assertion, unaffected by class-list composition. |
| Remaining classes | `flex min-h-screen flex-col bg-bg text-text` retained byte-identical and in the same order. |
| Anything reading `var(--font-inter)` | None. Repo-wide grep for `font-inter` returns only `app/show/[slug]/layout.tsx` (comment + the `variable:` option). After this change the token is defined at `<html>` instead of at `page-shell` — strictly wider scope, so no consumer can lose it. |
| Nested-layout `<html>` restriction | Not engaged: the crew layout renders a `<div>`, and the root layout already owns `<html>`/`<body>` (`app/layout.tsx:57-58`). |
| Null/empty/zero-value props | N/A — neither layout takes a prop other than `children`, which Next guarantees. |

### 2.3 Dimensional invariants

**N/A — declared explicitly.** This change introduces no fixed-dimension parent and no flex/grid child relationship; it alters only the resolved `font-family` on `<html>`. The Tailwind-v4 `align-items` caveat (`docs/agents/spec-self-review.md:11`) has no surface here. The **layout consequence** of the font change is nonetheless proven in a real browser (§4.2), because a font swap is a layout-affecting change even though it is not a dimensional-invariant change.

### 2.4 Transition inventory

**N/A — declared explicitly.** No component gains or loses a visual state. The one time-varying behavior is the `display: "swap"` window, which is unchanged in kind from the crew tree's existing behavior and is metric-matched by next/font's generated `Inter Fallback` face (observed in the probe, §1.0). No `AnimatePresence`, ternary render, or conditional block is added.

---

## 3. Why this is worth shipping (the finding restated correctly)

The backlog entry frames the exposure as *"reachable only on a desktop Linux browser lacking all six named faces"* (`BACKLOG.md:257`) — narrow, and that framing stands for the DejaVu **wrap**. The probe surfaces a **second, wider** consequence the entry did not know about:

> The product renders **two different type families across its two trees today** — Inter on crew pages, the host system sans on admin and help — while `DESIGN.md:133` commits to *"single contemporary sans for all UI. One family, no display/body pairing."*

That is a live violation of a ratified design contract on every device, not just bare Linux. It also means the `font-feature-settings: "tnum" 1, "cv11" 1` commitment (`app/globals.css:649-652`, `DESIGN.md:170-175`) is applied to a font whose `cv11` alternate — described at `DESIGN.md:175` as *"Inter's single-storey 'a' alternate"* — does not exist outside Inter, so admin numerics silently lose the intended treatment.

Scoping statement for the closeout, per the brief: **the DejaVu wrap itself is fixed only for Next-rendered surfaces** (which is every surface a crew member or admin ever sees). The standalone measurement harnesses keep their ambient font by construction (R4).

---

## 4. Test plan

TDD per invariant 1: each test is written and observed RED before its implementation.

### 4.1 T1 — font identity, real browser, both trees (the red test)

A new spec file, tests/e2e/font-binding.spec.ts (created by this change, so it is deliberately un-backticked here — it is not yet a tracked path), registered in the root `playwright.config.ts` `desktop-chromium` `testMatch` (`playwright.config.ts:78-79`) — an explicit allow-list, so an unregistered spec runs nowhere and silently proves nothing.

For each of the two trees — admin (`/sign-in`, no auth required) and crew (`/show/<slug>/<shareToken>` via `seedShowWithCrew()`, `tests/e2e/helpers/seedShowWithCrew.ts:108`) — after `await page.evaluate(() => document.fonts.ready)`:

1. Build three probe spans off-screen with identical text/size/weight: (a) inheriting the page's real cascade, (b) forced to `"Inter"`, (c) forced to `sans-serif`.
2. Assert **`inherited === forced-Inter`** within 0.5px, and **`inherited !== forced-sans-serif`** by a margin > 1px.
3. Assert `Array.from(document.fonts)` contains at least one face with `family === "Inter"` and `status === "loaded"`.

**Concrete failure mode caught (anti-tautology, `docs/agents/writing-plans.md:14`):** today assertion 2 fails on `/sign-in` — measured 185.53 vs 167.14, a 18.39px gap — so the test is genuinely RED before the change. It also fails if a future Next release reverts to hashed family names (`--font-sans`'s literal `"Inter"` would stop matching), which is the exact fragility R2 leans on; and the `!== sans-serif` leg prevents a green read on a host that happens to ship Inter as a system font. **It does NOT use `document.fonts.check()`** (§1.0 finding 3: returns `true` where Inter is provably absent).

**Non-vacuity precondition:** the forced-`"Inter"` and forced-`sans-serif` widths must differ from each other by > 1px before either assertion is trusted; if a host resolves both to the same face the test fails loudly rather than passing empty.

### 4.2 T2 — the measured row, in a real browser, under the real font

The backlog entry's measured artifact is the event-detail group title `"Wardrobe & key moments"` in the 240px narrowest real row. T2 asserts, on a real Next-rendered admin surface at a 320px viewport (which produces the 240px row, per `tests/e2e/section-header-layout.layout.spec.ts:143-144`), that the title occupies **one** text line, measured by `Range.getClientRects()` on the title's own text node — not the heading box, which is inflated by an inline link and reports one line even when the text wraps (`tests/e2e/section-header-layout.layout.spec.ts:381-391` is the established technique).

This is the layout-dimensions proof the brief requires: a real-browser `getBoundingClientRect()`-class assertion, not jsdom.

### 4.3 T3 — single loader (structural)

A structural test asserting exactly one `next/font` import exists under `app/`, walking the filesystem so a NEW duplicate fails by default rather than being missed by a lexical file list (the class-sweep discipline, `AGENTS.md`). Failure mode caught: a future route layout re-adding its own `Inter()` call and silently re-registering a second face set.

### 4.4 Existing suites that must stay green

`pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:standalone`. The standalone suites are **expected unchanged** — they never load Next (R4) — which is itself a check on R4's claim: if a standalone measurement moves, R4 is wrong.

---

## 5. Documented limits

### 5.1 Why option (b) is not taken

`BACKLOG.md:259` offers option (b): leave the stack alone and make the affected rows font-independent, via `whitespace-nowrap` plus truncation on the closed-set group titles. Rejected for three reasons, recorded so it is not relitigated:

1. After §2 the wide-fallback path does not exist on any Next-rendered surface, so the row it would harden has nothing left to harden against there.
2. `truncate` on the group title would make `tests/e2e/section-header-layout.layout.spec.ts:246-251` assertion (c) — floored label height ≈ unfloored label height — **vacuous**, since `white-space: nowrap` forces both to one line unconditionally. Trading a real assertion for a cosmetic guard is a net loss.
3. It changes what a real user sees (an ellipsis) to change what a test harness measures.

### 5.2 The standalone-harness residual (R4)

All 33 standalone harnesses route through `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`), which runs the Tailwind CLI over `app/globals.css` and serves the result as a static file alongside harness-rendered markup. There is no Next.js runtime, therefore no `next/font` `@font-face`. Those harnesses continue to measure the host's ambient resolution of the `--font-sans` stack (SF Pro locally, DejaVu on the Ubuntu runner).

Cost today: **zero.** CI is green; the single measurement that was font-sensitive carries the deliberate Arial / Liberation Sans pin (R3). Closing it properly means giving `compileEntryCss` a font asset to emit alongside the compiled stylesheet it already writes — a shared-helper change touching all 33 harnesses' fidelity at once, and a second font-delivery mechanism alongside `next/font`. That is a separate decision with its own design tradeoff, filed as **`BL-HARNESS-FONT-FIDELITY`** rather than smuggled in here.

### 5.3 Build-time dependency

`next/font/google` fetches the font at **build time**. This is not a new exposure: `app/show/[slug]/layout.tsx:31` has had the same build-time dependency since `8f4ad9c12` (2026-05-03) and every CI build already performs it. Gate evaluation moment: **build-time** (the `@font-face` and its woff2 are emitted into the build artifact); the test shape that proves it is T1's runtime `document.fonts` read against a booted server, which can only pass if the build-time fetch succeeded.

---

## 6. Consequence: help-screenshot baselines

14 committed WebPs under `public/help/screenshots/` are byte-compared by `.github/workflows/screenshots-drift.yml`. Help pages (`app/help/layout.tsx`) inherit from the root layout, so their rendered type changes from the host system sans to Inter and **every admin/help baseline will differ**. The `crew-preview-*` baselines are expected to be **unchanged or near-unchanged** (crew pages already render Inter — §1.0), which is a useful cross-check on the probe: a large crew-preview delta would mean the probe's conclusion is wrong.

Regeneration procedure, per `AGENTS.md` byte-comparison discipline — **never from this dev machine** (arm64 host bytes diverge from the native-x64 runner even on an identical pinned image):

1. Land the font change on the branch and push.
2. `gh workflow run screenshots-regen.yml --ref feat/font-binding-modal-freshness-cue` — regenerates from the pinned Playwright v1.59.1-jammy Docker image on a native-amd64 runner (`.github/workflows/screenshots-regen.yml:46`) and commits the baselines to the branch.
3. Pull the regen commit, then confirm `screenshots-drift` is green on the branch.

If any local verification step runs `pnpm screenshot:help`, restore the committed WebPs afterwards with `git restore public/help/screenshots/` — local capture overwrites the x64-Linux baseline with host-architecture bytes.

---

## 7. Invariant compliance

| Invariant | Disposition |
| --- | --- |
| 1 — TDD per task | Each of T1/T2/T3 is written RED first; one commit per task. |
| 2 — advisory lock | N/A — no mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`. No `pg_advisory*` surface touched, so the holder-topology enumeration is not engaged. |
| 3 — email canonicalization | N/A — no email boundary. |
| 4 — no global sync cursor | N/A. |
| 5 — no raw error codes in UI | N/A — no user-visible copy added or changed. |
| 6 — commit per task | `feat(assets):` for the font wiring, `test(assets):` for the pins. |
| 7 — spec is canonical | This spec implements `DESIGN.md:133` as written; no amendment proposed. |
| 8 — impeccable dual gate | **ENGAGED** — `app/layout.tsx` and `app/show/[slug]/layout.tsx` are UI surfaces. `/impeccable critique` + `/impeccable audit` run on the diff with the canonical v3 setup gates before adversarial review; findings + dispositions in §12 of the closeout, which carries the `impeccable-gate:` marker line. |
| 9 — Supabase call-boundary | N/A — no Supabase client call added. |
| 10 — mutation-surface observability | N/A — no mutating route, no `"use server"` action added. |
| 11 — worktree only | Satisfied at Stage 0: `FX-worktrees/font-binding-modal-freshness-cue` off `origin/main`. |

**Meta-test inventory** (`docs/agents/writing-plans.md:16`): this change CREATES one structural meta-test (T3, single-`next/font`-loader). It extends none of the listed registries — no auth boundary, no DB write, no admin alert, no tile sentinel — declared explicitly rather than left silent.

**Pre-code mechanical UI checklist:** no user-visible copy is added (so the em-dash ban and apostrophe-literal rules have no target), no tap target is added or moved, no type/token class changes, and **no new or repurposed color token** — so no `DESIGN.md` contrast row or contrast meta-test is required.

---

## 8. Companion-surface check

- Crew route: `app/show/[slug]/[shareToken]/page.tsx` is the only crew route since the M11.5 picker pivot; `lib/audit/authChain.ts` pins the canonical paths. Touched indirectly (its layout loses the duplicate import); covered by T1's crew leg.
- Parser version mirrors (`lib/parser/versions/v*.ts`) and `supabase/migrations/` — N/A, no parser or DB surface.
- Layouts under `app/`: `app/layout.tsx`, `app/admin/layout.tsx`, `app/help/layout.tsx`, `app/show/[slug]/layout.tsx` — all four enumerated; only the root and crew layouts change, and the admin/help layouts inherit the root's font with no edit.
