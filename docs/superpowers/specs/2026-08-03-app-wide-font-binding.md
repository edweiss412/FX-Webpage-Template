# Spec — app-wide font binding (`BL-HEADER-FONT-FALLBACK-WRAP`)

**Date:** 2026-08-03 · **Branch:** `feat/font-binding-modal-freshness-cue` · **Backlog entry:** `BL-HEADER-FONT-FALLBACK-WRAP` (`BACKLOG.md:249`) · **Implementer:** Opus / Claude Code (UI hard rule, `AGENTS.md` routing section)

---

## 0. One-line statement

`DESIGN.md:133` commits the product to Inter loaded via `next/font/google`; that wiring was never done, so **only the crew tree rendered Inter while admin, auth, help and the crash screen rendered the system fallback**. This spec wires the ratified mechanism — at `app/fonts.ts`, shared by both of Next 16's roots — and pins the result with real-browser font-identity assertions.

---

## 1. Background — what is actually true today

### 1.0 Probe data (empirical spike, run before drafting)

Per `docs/agents/spec-self-review.md:21` (empirical spike before speccing framework surfaces) and the backlog entry's own instruction to browser-check before acting, a Playwright probe was run against a **real crew page** (`/show/<slug>/<shareToken>`, seeded via `tests/e2e/helpers/seedShowWithCrew.ts`) and against a **non-crew surface**, on a dev server, Desktop Chrome, `document.fonts.ready` awaited. Oracle: render `"Wardrobe & key moments"` at `16px/400` in a probe span and compare the **inherited** width against widths forced onto each candidate family.

| Surface | `document.fonts` registered families | inherited width | forced `"Inter"` | generic `sans-serif` | verdict |
| --- | --- | --- | --- | --- | --- |
| crew page | `Inter` (7 faces, one `loaded`), `Inter Fallback`, `__nextjs-Geist*` (dev overlay) | **192.38px** | **192.38px** | 182.61px | **renders Inter** |
| non-crew shell (see caveat) | `__nextjs-Geist*` only (dev overlay) | **185.53px** | 167.14px | 182.61px | **does NOT render Inter** |

Three findings, all load-bearing:

1. **The crew binding works.** Next 16's `next/font/google` registers the face under the **literal** family name `Inter` (plus a size-adjusted `Inter Fallback`), not a hashed `__Inter_<hash>` name. So `--font-sans`'s literal `"Inter"` (`app/globals.css:103-104`) matches it. The backlog entry's stated doubt — *"`next/font`'s hashed `@font-face` family name does not obviously satisfy"* (`BACKLOG.md:253`) — is **empirically refuted for Next 16**. `--font-inter` (`app/show/[slug]/layout.tsx:36`) is genuinely unconsumed, but the binding does not depend on it.
2. **The non-crew tree renders the system fallback.** `185.53px` is neither the Inter width (192.38) nor generic `sans-serif` (182.61) — on this macOS host it is `-apple-system` / SF Pro, the third entry in the stack. On a bare-Linux client with none of the six named faces it falls through to generic `sans-serif` → DejaVu Sans, which is the wrap the backlog entry measured in CI.
**Caveat on the non-crew row, surfaced by adversarial review R1 and confirmed:** that probe navigated to `/sign-in`, which is **not a route** — the sign-in page is `app/auth/sign-in/page.tsx`, and there is no redirect. The measured page was therefore the root **not-found shell**. That shell still renders under `app/layout.tsx`, so the conclusion it supports — *the root layout loads no Inter* — is unaffected, and the width numbers are a valid measurement OF THE ROOT LAYOUT. But the row is not evidence about `app/admin/layout.tsx` specifically, and the numbers are re-measured against real routes (`/admin` behind `signInAs`, and `/auth/sign-in`) by the test in §4.1 rather than carried forward from here.

3. **`document.fonts.check('16px "Inter"')` is NOT a usable oracle** — it returned `true` on the admin tree where Inter is provably absent (the forced-`"Inter"` probe fell back to the default serif metric, 167.14px, identical to the `serif` control). Any test written for this spec must use the **width comparison**, never `fonts.check()`.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
| --- | --- | --- |
| R1 | **The mechanism is `next/font/google`; the call site is `app/fonts.ts`, imported by both Next roots.** Not a self-hosted `@font-face`, not `@fontsource`. | `DESIGN.md:133` named `app/layout.tsx` and this spec IS the task it was waiting for — but Next 16 has TWO roots (`app/global-error.tsx` replaces the root layout), so the call is hoisted one module and both roots share the single instance. **Amended after review R4 and again after R6**, which found this row still prescribing the superseded site and still claiming no DESIGN.md amendment was wanted. Two amendments shipped, in lockstep with the code: the load-site sentence, and the pinned fallback stack (§2.5). |
| R2 | **`--font-sans` IS edited — it binds `var(--font-inter, "Inter", "Inter Fallback")`.** ~~The literal-`"Inter"` stack stays byte-identical.~~ | **Rewritten after review R8**, which was right that a governing row prescribing the opposite of the shipped design is not a harmless historical note. The original reasoning was half right: a BARE `var(--font-inter)` really would be invalid at computed-value time wherever the generated class is absent (every standalone harness), dropping `font-family` entirely rather than falling through. What it missed is that a `var()` FALLBACK LIST has neither problem, and that the literal-only stack skipped next/font's metric-matched face and so reflowed the swap window by ~10% on every route. §2.5 carries the full reasoning; `DESIGN.md` §2.1's pinned stack is amended in lockstep. |
| R3 | **Widening the tolerance in `tests/e2e/section-header-layout.layout.spec.ts` is REFUSED.** That file pins Arial / Liberation Sans for exactly one measurement, deliberately, with the reason inline. | `tests/e2e/section-header-layout.layout.spec.ts:165-183`; brief instruction; `BACKLOG.md:261`. Relaxing it hides the finding. A reviewer proposing it should be refused with this row. |
| R4 | **The standalone-harness residual is OUT OF SCOPE and is a documented limit, not a defect.** The 31 standalone harness specs (`tests/e2e/*.spec.ts` using `compileEntryCss`) serve static HTML + compiled `app/globals.css` with **no Next.js runtime**, so no `next/font` mechanism can reach them. They keep measuring the ambient host font. | §5.2 below. Cost today is zero: CI is green, and the one measurement that needed determinism already carries the Arial pin (R3). Filed forward as `BL-HARNESS-FONT-FIDELITY`. |
| R5 | **No product copy, label, or layout class changes.** Option (b) from the backlog entry (`whitespace-nowrap` + truncation on group titles) is **not** taken. | Once Inter loads app-wide, the wide-fallback path no longer exists for anything the Next app renders, including the swap window (`Inter Fallback` is metric-size-adjusted). Adding an ellipsis to a real product label to satisfy a test harness inverts the dependency. See §5.1. |
| R6 | **Help-screenshot baselines WILL change and are regenerated via the pinned-image workflow, never from a dev machine.** | `AGENTS.md` byte-comparison discipline; `.github/workflows/screenshots-regen.yml:46` pins the Playwright v1.59.1-jammy Docker image on a native-amd64 runner. See §6. |

---

## 2. The change

### 2.1 `app/fonts.ts` — load Inter once, for both roots

**Amended after review R4 and the impeccable critique.** The loader call lives in `app/fonts.ts`, exported, and BOTH Next roots import that one instance — `app/layout.tsx` and `app/global-error.tsx`, which renders its own `<html>` and replaces the root layout on a fatal error. Each root applies the generated class to its own `<html>` alongside the existing classes. `DESIGN.md` §2.1 named `app/layout.tsx` as the load site and was amended in lockstep with this change to name `app/fonts.ts` — the same site hoisted one module so the second root can share it, which is a mechanical consequence of Next 16's two-root model.

- `Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" })` — **identical options** to the crew layout's existing call (`app/show/[slug]/layout.tsx:33-37`), so the two cannot diverge in weight range, subset, or swap behavior during the transition.
- The class goes on `<html>` (`app/layout.tsx:57`), not `<body>`. **Precise reason, corrected after review R1:** the generated class does NOT set `font-family` — it only defines `--font-inter`. Binding happens because the loaded stylesheet registers the literal family `Inter` **document-wide**, which `--font-sans` already names (`app/globals.css:103-104`), applied at `html` (`app/globals.css:659-663`). Proof that the class placement is not what binds: today the crew tree applies it to a nested `<div>` and `<html>` still resolves to Inter (§1.0). `<html>` is nonetheless the right host for the class, because it is the widest scope at which `--font-inter` can be exposed, and the token should not be narrower than the font it names.
- `--font-inter` is **consumed** by `--font-sans` (§2.5), which is what puts next/font's metric-matched fallback face in the cascade. An earlier revision left it unconsumed; that is what made the swap window reflow.

### 2.2 `app/show/[slug]/layout.tsx` — drop the now-redundant duplicate

Remove the `Inter` import, the `inter` constant, and `${inter.variable}` from the `page-shell` class list. Rationale: two `next/font/google` calls for the same family emit two independent `@font-face` sets under the same family name — the probe already shows **seven** `Inter` faces registered on the crew page. One loader, at the root, is the ratified shape (R1).

**Guard conditions for this edit:**

| Concern | Disposition |
| --- | --- |
| `data-testid="page-shell"` | UNCHANGED. **Corrected after review R1:** the `toBeVisible` assertion at `tests/e2e/crew-page.spec.ts:1432` is inside a `test.describe.skip(...)` (`tests/e2e/crew-page.spec.ts:1416`), so it is NOT live coverage and must not be presented as a guard. The live guard for this testid is added by this spec's own §4.1 crew case, which asserts it visible before measuring. |
| Remaining classes | `flex min-h-screen flex-col bg-bg text-text` retained byte-identical and in the same order. |
| Anything reading `var(--font-inter)` | None. Repo-wide grep for `font-inter` returns only `app/show/[slug]/layout.tsx` (comment + the `variable:` option). After this change the token is defined at `<html>` instead of at `page-shell` — strictly wider scope, so no consumer can lose it. |
| Nested-layout `<html>` restriction | Not engaged: the crew layout renders a `<div>`, and the root layout already owns `<html>`/`<body>` (`app/layout.tsx:57-58`). |
| Null/empty/zero-value props | N/A — neither layout takes a prop other than `children`, which Next guarantees. |

### 2.5 `--font-sans` binds the metric-matched fallback

`--font-sans` is `var(--font-inter, "Inter", "Inter Fallback"), ui-sans-serif, …` (`app/globals.css`), not the bare literal.

**This supersedes decision R2 as originally written**, which said the token stays byte-identical. R2's reasoning was half right and half wrong. Right: writing a bare `var(--font-inter)` would be invalid at computed-value time on any surface without the generated class — every standalone harness — and would drop `font-family` entirely rather than falling through. Wrong: it concluded from that the token must not be touched, and separately claimed the swap window was already metric-matched. The impeccable critique measured otherwise. `next/font` generates an `Inter Fallback` face (`local(Arial)` with `size-adjust` and `ascent-override` tuned to Inter) precisely so `display: "swap"` swaps without reflow, and it is reachable ONLY through `--font-inter`. Naming the literal skipped it, so the swap window reflowed ~10% on every route — worst at 390px, where a label can unwrap from two lines to one and shift everything below it mid-glance.

The `var()` **fallback list** answers R2's real objection: when the token is undefined the declaration resolves to the literal pair instead of becoming invalid, so the harnesses behave exactly as before. `DESIGN.md` §2.1's pinned stack is updated in lockstep, per invariant 7.

### 2.3 Dimensional invariants

**N/A — declared explicitly.** This change introduces no fixed-dimension parent and no flex/grid child relationship; it alters only the resolved `font-family` on `<html>`. The Tailwind-v4 `align-items` caveat (`docs/agents/spec-self-review.md:11`) has no surface here. The **layout consequence** of the font change is measured in a real browser regardless, because a font swap is layout-affecting even though it is not a dimensional-invariant change. Two measurements carry it, and the distinction matters (review R2 was right that an unconditional "is proven" here contradicted §4.2's permitted N/A branch):

- **Unconditional:** §4.1 measures rendered TEXT ADVANCE with `getBoundingClientRect()` on three live routes. This runs always and is what proves the font actually changed the layout.
- **Conditional:** §4.2's group-title row runs only under its branch (a). Under branch (b) it is recorded N/A with the navigation attempt shown. Nothing else in this spec depends on §4.2 landing.

### 2.4 Transition inventory

**N/A — declared explicitly.** No component gains or loses a visual state. The one time-varying behavior is the `display: "swap"` window, which is unchanged in kind from the crew tree's existing behavior and is metric-matched by next/font's generated `Inter Fallback` face (observed in the probe, §1.0). No `AnimatePresence`, ternary render, or conditional block is added.

---

## 3. Why this is worth shipping (the finding restated correctly)

The backlog entry frames the exposure as *"reachable only on a desktop Linux browser lacking all six named faces"* (`BACKLOG.md:257`) — narrow, and that framing stands for the DejaVu **wrap**. The probe surfaces a **second, wider** consequence the entry did not know about:

> The product renders **two different type families across its two trees today** — Inter on crew pages, the host system sans on admin and help — while `DESIGN.md:133` commits to *"single contemporary sans for all UI. One family, no display/body pairing."*

That is a live violation of a ratified design contract on every device, not just bare Linux. It also means the `font-feature-settings: "tnum" 1, "cv11" 1` commitment (`app/globals.css:649-652`, `DESIGN.md:170-175`) is applied to a font whose `cv11` alternate — described at `DESIGN.md:175` as *"Inter's single-storey 'a' alternate"* — does not exist outside Inter, so admin numerics silently lose the intended treatment.

Scoping statement for the closeout, per the brief: **the DejaVu wrap itself is fixed only for Next-rendered surfaces with a React root** — every page of the product proper. Two exclusions, both documented rather than implied: the standalone measurement harnesses keep their ambient font by construction (R4, §5.2), and four hand-built auth error documents mount no React root and ARE read when they appear (§5.0).

---

## 4. Test plan

TDD per invariant 1: each test is written and observed RED before its implementation.

### 4.1 T1 — font identity, real browser, three real routes (the red test)

A new spec file, tests/e2e/font-binding.spec.ts (created by this change, so it is deliberately un-backticked here — it is not yet a tracked path), registered in the root `playwright.config.ts` `desktop-chromium` `testMatch` (`playwright.config.ts:78-79`) — an explicit allow-list, so an unregistered spec runs nowhere and silently proves nothing.

**Routes, corrected after review R1.** An earlier draft named `/sign-in`, which **does not exist** — the sign-in page is `app/auth/sign-in/page.tsx`, there is no redirect, and the run confirmed a `404`. A 404 still renders the ROOT layout, so a font probe on the not-found shell reads as a plausible pass for a surface never visited. Every case therefore asserts **status 200 AND page identity**, and the three routes are:

| Case | Route | Auth | Identity assertion (named, per review R2) | Proves |
| --- | --- | --- | --- | --- |
| admin tree | `/admin` | `signInAs(page, ADMIN_FIXTURE)` (`tests/e2e/helpers/signInAs.ts:43`, `tests/e2e/helpers/fixtures.ts:25`) | `admin-layout` visible (`app/admin/layout.tsx:157`) AND `admin-layout-infra-error` absent (`app/admin/layout.tsx:92`) | `app/admin/layout.tsx` under the root layout — the tree the backlog entry is about |
| public auth tree | `/auth/sign-in` | none | `sign-in-page` visible (the same testid `tests/e2e/sign-in-page.spec.ts:74` pins) | the root layout binds without any session, so a regression cannot hide behind auth |
| crew tree | `/show/<slug>/<shareToken>` via `seedShowWithCrew()` (`tests/e2e/helpers/seedShowWithCrew.ts:108`) | none | `page-shell` visible | the existing binding is not lost when the duplicate loader is removed; torn down with `deleteSeededShow` |

Each identity assertion names a testid **owned by the layout or page under test**, never a generic element. A generic `nav`-visible check would not structurally prevent the round-1 failure class (measuring the wrong 200 shell) from recurring.

For each case, after `await page.evaluate(() => document.fonts.ready)`:

1. Build three probe spans off-screen with identical text/size/weight: (a) inheriting the page's real cascade, (b) forced to `"Inter"`, (c) forced to `sans-serif`.
2. Assert **`inherited === forced-Inter`** within 0.5px, and **`inherited !== forced-sans-serif`** by a margin > 1px.
3. Assert `Array.from(document.fonts)` contains at least one face with `family === "Inter"` and `status === "loaded"`.
4. Assert `<html>` exposes `--font-inter`. This is asserted **separately and for its own reason**: per §2.1 the token is not what binds the font, so every width check above would still pass if the loader silently stopped emitting `variable:` and the documented token vanished. Added after review R1 noted the spec promised an exposure it never tested.
5. Assert the resolved cascade **contains `Inter Fallback`** — next/font's generated, metric-matched companion face. Added after the impeccable critique's P1: naming the literal `"Inter"` in `--font-sans` skipped that face, so the `display: "swap"` window painted a system font at native metrics and then snapped about 10 percent (187.28px to 168.91px on a real string) on every route. See §2.5.
6. Assert the document registers **exactly one font family** (excluding the generated companion face and the dev overlay's `__nextjs-*` faces).
7. Assert **no `@font-face` is registered twice**, keyed on the full `(family, style, weight, unicodeRange)` tuple. Exists because review R4 showed 6 alone cannot see the case the guard is actually for: a second loader for the SAME family adds more Inter faces, and a set of family names still reduces to one entry.
8. Assert **every app face shares ONE weight+style descriptor pair**. Added after review R6, which demonstrated with a live Next-16 probe that a second loader configured `style: "italic"` keeps family `Inter` and weight `100 900`, so its tuples do not duplicate and 6 and 7 both pass. Keyed on the PAIR, not weight alone, for exactly that reason.

Assertions 6-8 are the RUNTIME CORROBORATION described in §4.3 — corroboration, not closure: a byte-identical second call registers indistinguishable faces and escapes all three. Both they and the width checks carry non-vacuity preconditions (more than one face present; the forced-family widths differ).

**Concrete failure mode caught (anti-tautology, `docs/agents/writing-plans.md:14`):** assertion 2 fails today on both non-crew routes, because no Inter face is registered there and the forced-`"Inter"` probe falls back to the default serif metric. (The pre-correction measurement of that gap — 185.53 vs 167.14, 18.39px — was taken on the 404 shell; the real per-route numbers are recorded in the closeout from T1's own first RED run, not carried over from the probe.) The crew case's assertion 4 is also RED today, since the `.variable` class currently sits on a nested `<div>` rather than `<html>`. It also fails if a future Next release reverts to hashed family names (`--font-sans`'s literal `"Inter"` would stop matching), which is the exact fragility R2 leans on; and the `!== sans-serif` leg prevents a green read on a host that happens to ship Inter as a system font. **It does NOT use `document.fonts.check()`** (§1.0 finding 3: returns `true` where Inter is provably absent).

**Non-vacuity precondition:** the forced-`"Inter"` and forced-`sans-serif` widths must differ from each other by > 1px before either assertion is trusted; if a host resolves both to the same face the test fails loudly rather than passing empty.

### 4.2 T2 — the measured row, in a real browser, under the real font

The backlog entry's measured artifact is the event-detail group title `"Wardrobe & key moments"` in the 240px narrowest real row. T2 asserts that the title occupies **one** text line, measured by `Range.getClientRects()` on the title's own text node — not the heading box, which is inflated by an inline link and reports one line even when the text wraps (`tests/e2e/section-header-layout.layout.spec.ts:381-391` is the established technique).

**Reachability is resolved BEFORE the assertion is written, not assumed — corrected after review R1.** The 240px figure comes from a standalone harness that hard-codes that container width (`tests/e2e/section-header-layout.layout.spec.ts:72-76`); the cited viewport lines only set 320px and open that harness page. So the spec may NOT simply assert "320px yields a 240px row" on a live route. The implementer must first establish, by navigation, one of:

- **(a)** a live admin route + seeded state that renders `EventDetailsBreakdown` with a NON-EMPTY group carrying this title — note empty groups are filtered out at `components/admin/wizard/step3ReviewSections.tsx:2216-2221`, so an unseeded page renders nothing to measure — together with the exact selector and the measured container width. T2 is then written against that, with the container width asserted from the DOM rather than assumed.
- **(b)** if no live route reaches it, T2 is recorded in the closeout as **N/A, covered by the documented limit in §5.2**, with the navigation attempt shown. A surrogate row is NOT acceptable: it would not be the artifact the backlog entry measured, and asserting on one would be the tautology this project's rules exist to prevent.

Whichever branch is taken is recorded explicitly; it is never left silent. Under branch (a) this is the layout-dimensions proof the brief requires: a real-browser `getBoundingClientRect()`-class assertion, not jsdom.

### 4.3 The single-loader structural guard (plan T1, step 2)

**Numbering note, corrected after R6:** the plan's task graph makes this T1's second step, not a task called "T3" — T3 there is the screenshot regeneration. The spec previously used its own numbering and the two disagreed.

A structural test that walks the WHOLE REPO from the filesystem as a DENYLIST (not an allowlist of directories, and not a lexical file list, so a NEW loader fails by default — the class-sweep discipline, `AGENTS.md`) and asserts the set of files importing from `next/font/` **is exactly `app/fonts.ts`**, and that the count of loader call sites matches.

**Corrected after review R1:** an earlier draft said "exactly one `next/font` import under `app/`", which is GREEN today (the crew layout is that one) and therefore could never go RED — violating invariant 1. Pinning the *path set* makes it RED pre-change (the set is the crew layout) and GREEN post-change. It also catches what a count cannot: a loader that MOVED to the wrong layout, and a second call site added without a second import.

**Failure mode caught:** a future route layout re-adding its own loader call, silently re-registering a second face set under the same family name. The probe already observed seven `Inter` faces from a single loader; a second one compounds that invisibly.

**Mutation-family coverage (`docs/agents/writing-plans.md:24`) — an enumeration the guard is tested against, NOT a closure over the syntactic space.**

The guard parses with the TypeScript compiler API and resolves import bindings (named, aliased, default, namespace), const/assignment alias chains to a fixpoint, and AST call nodes. It covers eighteen demonstrated forms, each with an executable fixture: M1 a second loader in a NEW file; M2 a second NAMED import, both invoked (R2's probe); M3 the same loader twice; M4 an ALIASED import; M5 a const-alias chain; M6 the loader MOVED; M7 `next/font/local`; M8 a DEFAULT import; M9 a NAMESPACE import; M10 two invocations on ONE line; then R4's set — M11 `(Inter)(…)`, M12 `(0, Inter)(…)`, M13 `{ Inter }.Inter(…)`, M14 `Inter.call/apply`, M15 an assignment alias, M16 namespace ELEMENT access, M17 a namespace alias, M18 namespace destructuring. A negative case pins that an identically-named import from an unrelated module is NOT counted.

**The location vector was DESCOPED after four rounds, not patched a fifth time.**

Rounds 2, 3 and 4 each produced new escaping CALL FORMS (R4's last: `Reflect.apply(Inter, null, [...])`). Rounds 8, 9, 10 and 11 each then produced new escaping LOCATIONS: `lib/`, `components/` and `.js`; then root-level modules, arbitrary shared directories and `.mdx`; then directory basenames matched at depth; then a `.next`-prefixed directory at depth, five further MDX escape encodings, and `.mts`/`.cts`.

`AGENTS.md`'s same-vector rule says that after three rounds on one vector you stop patching and either change the approach or descope. This spec spent two extra rounds ignoring that. R11's own conclusion — that a directory walk plus a handwritten extension list plus a regex cannot hold, and the boundary needs module-graph semantics — is accepted, and the descope is the response.

**What the guard is now, explicitly:** a TRIPWIRE for the ordinary accident, which is the failure this project actually had (the loader that started this work sat in `app/show/[slug]/layout.tsx`, a completely ordinary place). It is NOT a census and proves NO closure. A green run does not establish that a second loader is absent.

**What was still worth taking from R11** — the cheap correctness wins, since they cost nothing: `.mts`/`.cts` join the extension list (`tsconfig.json` includes `.mts`), and the `.next` prefix skip moves to the repo root only, since R11 showed `@/shared/.next-font/rogue` was importable and hidden.

**Why the residual is acceptable rather than closed.** A second font loader is a mistake, not an attack. Mistakes are made in ordinary places, and those are caught twice over — by this tripwire and, independently, by the runtime checks in §4.1, which see any second loader whose faces differ in family, descriptor pair, or tuple. A deliberately hidden byte-identical duplicate is caught by neither. Building module-graph resolution through the TypeScript and MDX compilers would close more of it, with its own failure modes, and is not justified by that risk. If it is ever wanted, it is its own piece of work.

**Failure mode caught:** a future route layout re-adding its own loader call, silently re-registering a second face set under the same family name. The probe already observed seven `Inter` faces from a single loader; a second one compounds that invisibly.

**Mutation-family coverage (`docs/agents/writing-plans.md:24`) — an enumeration the guard is tested against, NOT a closure over the syntactic space.**

The guard parses with the TypeScript compiler API and resolves import bindings (named, aliased, default, namespace), const/assignment alias chains to a fixpoint, and AST call nodes. It covers eighteen demonstrated forms, each with an executable fixture: M1 a second loader in a NEW file; M2 a second NAMED import, both invoked (R2's probe); M3 the same loader twice; M4 an ALIASED import; M5 a const-alias chain; M6 the loader MOVED; M7 `next/font/local`; M8 a DEFAULT import; M9 a NAMESPACE import; M10 two invocations on ONE line; then R4's set — M11 `(Inter)(…)`, M12 `(0, Inter)(…)`, M13 `{ Inter }.Inter(…)`, M14 `Inter.call/apply`, M15 an assignment alias, M16 namespace ELEMENT access, M17 a namespace alias, M18 namespace destructuring. A negative case pins that an identically-named import from an unrelated module is NOT counted.

**What each layer buys, with its residual — no layer claims closure.**

- **The PATH-SET assertion** catches a second loader added anywhere the census walks. Its residual is the census boundary itself, which four rounds showed cannot be made exhaustive by a file walk (see the descope above).
- **The CALL-COUNT assertion** is best-effort over the eighteen fixtured forms. Its residual is a second call inside an already-censused file via an unenumerated form — R5 demonstrated `Reflect.apply`.
- **The RUNTIME assertions** observe what the browser registered, so no call syntax evades them. Two residuals: a byte-identical second call registers indistinguishable faces, and they only see the routes the suite visits.

A new SYNTACTIC family is admissible here only with a live escaping mutant demonstrated against the shipped guard, and it is a tripwire improvement, never a closure claim.

### 4.4 Existing suites that must stay green

`pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:standalone`. The standalone suites are **expected unchanged** — they never load Next (R4) — which is itself a check on R4's claim: if a standalone measurement moves, R4 is wrong.

**And the new spec must have a CI EXECUTION PATH, not merely a `testMatch` row.** Review R2 caught that registering in `playwright.config.ts` alone leaves the oracle dark in CI: `.github/workflows/crew-e2e.yml` invokes an explicit spec list, and the rest of the project is dead-in-CI by design. Three registrations are required, and the repo's own `tests/ci/_metaE2eWorkflowCoverage.test.ts` fails until they are all present: the Playwright `testMatch`, the crew-e2e workflow's spec list plus its post-run execution oracle `scripts/check-crew-e2e-executed.mjs` (collected is not executed), and a coverage-census allowlist row alongside the four existing crew-e2e specs. crew-e2e is also the right home on the merits: it builds and starts the PRODUCTION artifact, so the literal-family binding is proved against the build CI ships rather than only against a dev server.

---

## 5. Documented limits

### 5.0 Four standalone HTML responses escape both React roots

**Found by review R5, and the "every Next-rendered surface" claim was wrong until this was written down.** Four route handlers build and return their own complete `<html>` document as a string. They never mount either React root, so neither the loader's generated class nor the app stylesheet reaches them:

- `app/api/auth/google/start/route.ts` (its document is built at `app/api/auth/google/start/route.ts:24-41`)
- `app/api/auth/picker-bootstrap/route.ts`
- `app/auth/callback/route.ts`
- `app/auth/sign-out/route.ts` — this one explicitly sets `system-ui, sans-serif` in its own inline style

**What they actually are, corrected after review R6.** An earlier revision of this section called them transient interstitials seen for well under a second and never read. That was wrong, and the disposition should not rest on it. All four are **persistent error documents with readable copy and no automatic redirect**: a 503 from the Google-auth start (`app/api/auth/google/start/route.ts:21-41`), 403/502 pages from the picker bootstrap (`app/api/auth/picker-bootstrap/route.ts:34-49`), a 503 from the auth callback (`app/auth/callback/route.ts:46-66`), and a 500 from sign-out that carries explanatory copy and a retry button (`app/auth/sign-out/route.ts:20-48`). A user who lands on one reads it.

**Disposition: still a documented limit, but on the honest reasoning.** Two things separate them:

- **The sign-out page's `system-ui, sans-serif` is defensible on one narrow, checkable fact.** Two earlier attempts at this rationale were wrong and both were caught: "error pages should not depend on a webfont" is incoherent as a principle (R7 — this change binds the webfont on `app/global-error.tsx`, the fatal-error page), and "no stylesheet at all" is simply false (R8 — it inlines a `<style>` block at `app/auth/sign-out/route.ts:32-38`). The accurate statement: it is a self-contained document that **requests zero external assets**. Adding a webfont would introduce the first network dependency to a page that currently has none, and it is a page you reach because a request already failed. That is a local property of this document, and implies nothing about error pages generally.
- **The other three get browser defaults — a serif — which nobody chose.** That is the real gap, and it is a worse outcome than the system stack.

Covering them properly means either inlining an `@font-face` per hand-built document (a second font-delivery mechanism, the same objection that keeps `BL-HARNESS-FONT-FIDELITY` out of this change) or routing them through React, which is a larger change to auth plumbing than a font justifies mid-change. Filed as `BL-AUTH-INTERSTITIAL-FONT` with the corrected characterization, so it is picked up on its real merits.

What this costs the headline claim: the accurate form is **every Next-rendered surface with a React root**. It is NOT literally every byte of HTML the app can emit, and §3 and the archive entry say so in those terms.

### 5.1 Why option (b) is not taken

`BACKLOG.md:259` offers option (b): leave the stack alone and make the affected rows font-independent, via `whitespace-nowrap` plus truncation on the closed-set group titles. Rejected for three reasons, recorded so it is not relitigated:

1. After §2 the wide-fallback path does not exist on any Next-rendered surface, so the row it would harden has nothing left to harden against there.
2. `truncate` on the group title would make `tests/e2e/section-header-layout.layout.spec.ts:246-251` assertion (c) — floored label height ≈ unfloored label height — **vacuous**, since `white-space: nowrap` forces both to one line unconditionally. Trading a real assertion for a cosmetic guard is a net loss.
3. It changes what a real user sees (an ellipsis) to change what a test harness measures.

### 5.2 The standalone-harness residual (R4)

All 31 standalone harness specs route through `compileEntryCss` (`tests/e2e/helpers/liveEntryToolchain.ts:124-141`), which runs the Tailwind CLI over `app/globals.css` and serves the result as a static file alongside harness-rendered markup. There is no Next.js runtime, therefore no `next/font` `@font-face`. Those harnesses continue to measure the host's ambient resolution of the `--font-sans` stack (SF Pro locally, DejaVu on the Ubuntu runner).

Cost today: **zero.** CI is green; the single measurement that was font-sensitive carries the deliberate Arial / Liberation Sans pin (R3). Closing it properly means giving `compileEntryCss` a font asset to emit alongside the compiled stylesheet it already writes — a shared-helper change touching all 31 harnesses' fidelity at once, and a second font-delivery mechanism alongside `next/font`. That is a separate decision with its own design tradeoff, filed as **`BL-HARNESS-FONT-FIDELITY`** rather than smuggled in here.

### 5.3 Build-time dependency

`next/font/google` fetches the font at **build time**. This is not a new exposure: `app/show/[slug]/layout.tsx:31` has had the same build-time dependency since `8f4ad9c12` (2026-05-03) and every CI build already performs it. Gate evaluation moment: **build-time** (the `@font-face` and its woff2 are emitted into the build artifact); the test shape that proves it is T1's runtime `document.fonts` read against a booted server, which can only pass if the build-time fetch succeeded.

---

## 6. Consequence: help-screenshot baselines

14 committed WebPs under `public/help/screenshots/` are byte-compared by `.github/workflows/screenshots-drift.yml`. Help pages (`app/help/layout.tsx`) inherit from the root layout, so their rendered type changes from the host system sans to Inter.

**Expect ALL 14 to differ, including the `crew-preview-*` six.** Review R1 corrected an earlier claim here that the crew previews would be unchanged. They are captured from `/admin/show/<slug>/preview/<crewId>` (`scripts/help-screenshots.manifest.ts:96-117`), which renders the `CrewShell` component under the **admin** route tree (`app/admin/show/[slug]/preview/[crewId]/page.tsx:42`) and does **not** inherit `app/show/[slug]/layout.tsx`. They therefore carry the root fallback today and will change with the root loader like everything else. There is no "unchanged baseline" cross-check to be had from them, and a large crew-preview delta is the EXPECTED result, not a falsification signal.

Regeneration procedure, per `AGENTS.md` byte-comparison discipline — **never from this dev machine** (arm64 host bytes diverge from the native-x64 runner even on an identical pinned image):

1. Land the font change on the branch and push.
2. `gh workflow run screenshots-regen.yml --ref feat/font-binding-modal-freshness-cue` — regenerates from the pinned Playwright v1.59.1-jammy Docker image on a native-amd64 runner (`.github/workflows/screenshots-regen.yml:46`) and commits the baselines to the branch.
3. Pull the regen commit, then confirm `screenshots-drift` is green on the branch.

If any local verification step runs `pnpm screenshot:help`, restore the committed WebPs afterwards with `git restore public/help/screenshots/` — local capture overwrites the x64-Linux baseline with host-architecture bytes.

---

## 7. Invariant compliance

| Invariant | Disposition |
| --- | --- |
| 1 — TDD per task | Each task completes its own RED→GREEN cycle before committing; the plan's task graph is the authority for what those tasks are (T1 carries the tests plus the implementation, T2 the measured row, T3 the baseline regeneration). An earlier revision numbered tasks independently here and disagreed with the plan; corrected after review R7. |
| 2 — advisory lock | **No new holder, and no new mutation path.** The *product* diff mutates nothing. The §4.1 test seeds a show through the pre-existing `seedShowWithCrew()` helper, which does insert into `shows` and `crew_members` (`tests/e2e/helpers/seedShowWithCrew.ts:103-105`, `tests/e2e/helpers/seedShowWithCrew.ts:118-135`, `tests/e2e/helpers/seedShowWithCrew.ts:178-181`) without taking the lock. **Corrected after review R1:** an earlier draft declared this row a flat N/A, which was false. The accurate position: that helper is shared e2e fixture setup already used by every crew-route suite in the repo (`tests/e2e/crew-page.spec.ts`, `tests/e2e/picker-flow.spec.ts`, `tests/e2e/crew-layout-dimensions.spec.ts`), running single-worker (`playwright.config.ts:41`) against a local test database. This spec neither introduces that path nor changes its locking, so the single-holder rule is unaffected — the holder count for every hashkey is exactly what it was before this branch. Changing the helper's locking posture is a repo-wide decision about test fixtures, out of scope here and not silently altered. §4.1 does add the teardown the helper's callers should have (`deleteSeededShow`, `tests/e2e/helpers/seedShowWithCrew.ts:103`), so a run leaves no row behind. **Corrected again after review R4:** §4.2's row test needs a show carrying `event_details`, and an earlier draft did that with a direct `admin.from("shows").update(...)` at the call site — which WOULD have been a new unlocked mutation path against a lock-governed table, exactly what this row denies. It is now a column on the insert `seedShowWithCrew` already performs (`eventDetails` option), so no new mutation path, no new call site, and no new lock holder. |
| 3 — email canonicalization | N/A — no email boundary. |
| 4 — no global sync cursor | N/A. |
| 5 — no raw error codes in UI | N/A — no user-visible copy added or changed. |
| 6 — commit per task | One commit per task, and each task completes its own RED→GREEN cycle before committing, so no commit freezes a failing tree. **Corrected after review R2**, which was right that the earlier graph (test-commit, then implementation-commit) violated invariant 1's "failing test → minimal implementation → passing test → commit" ordering. The plan's task graph is the authority; the code commits are `feat(assets):` for T1 (all tests + implementation + CI wiring), optionally `test(assets):` for T2 under branch (a), `docs(assets):` for T4's closeout, and `docs(backlog):` for T5. |
| 7 — spec is canonical | This spec implements `DESIGN.md:133`, and **amends** it in two places, in lockstep with the code: the pinned fallback stack gains `Inter Fallback` (§2.5), and the load-site sentence now names `app/fonts.ts` and the two-root reason. **Corrected after review R5**, which caught this row still claiming no amendment was proposed. |
| 8 — impeccable dual gate | **ENGAGED** — the UI surfaces are `app/fonts.ts`, `app/layout.tsx`, `app/global-error.tsx`, `app/show/[slug]/layout.tsx`, `app/globals.css` and `DESIGN.md`. `/impeccable critique` + `/impeccable audit` run on the diff with the canonical v3 setup gates before adversarial review; findings + dispositions in §12 of the closeout, which carries the `impeccable-gate:` marker line. |
| 9 — Supabase call-boundary | N/A — **no new Supabase call site.** Review R4 correctly flagged that an earlier draft of §4.2 added one (a direct `admin.from("shows").update(...)` destructuring only `{ error }`, with no registry row and no `// not-subject-to-meta:` comment). That call is gone: the data it wrote is now a field on the insert `seedShowWithCrew` already performs, so the boundary count is unchanged from `origin/main` and there is nothing to register. |
| 10 — mutation-surface observability | N/A — no mutating route, no `"use server"` action added. |
| 11 — worktree only | Satisfied at Stage 0: `FX-worktrees/font-binding-modal-freshness-cue` off `origin/main`. |

**Meta-test inventory** (`docs/agents/writing-plans.md:16`): this change CREATES one structural meta-test (the single-loader guard, plan T1 step 2). It extends none of the listed registries — no auth boundary, no DB write, no admin alert, no tile sentinel — declared explicitly rather than left silent.

**Pre-code mechanical UI checklist:** no user-visible copy is added (so the em-dash ban and apostrophe-literal rules have no target), and no tap target is added or moved. **No new or repurposed COLOR token**, so no `DESIGN.md` contrast row or contrast meta-test is required — the one token that changes is `--font-sans`, whose value carries no colour and therefore no contrast ratio. (An earlier revision claimed no token changed at all; review R5 correctly flagged that as false.)

---

## 8. Companion-surface check

- Crew route: `app/show/[slug]/[shareToken]/page.tsx` is the only crew route since the M11.5 picker pivot; `lib/audit/authChain.ts` pins the canonical paths. Touched indirectly (its layout loses the duplicate import); covered by T1's crew leg.
- Parser version mirrors (`lib/parser/versions/v*.ts`) and `supabase/migrations/` — N/A, no parser or DB surface.
- **Roots under `app/`: there are TWO, not one.** `app/layout.tsx` is the ordinary root; `app/global-error.tsx` renders its own `<html>` and REPLACES the root layout on a fatal error, which is why it already re-imports the global stylesheet (`app/global-error.tsx:5`). Anything the root layout sets up is absent there. **Corrected after review R4 and the impeccable critique, which found this independently:** an earlier draft's sweep listed only route layouts, so the crash screen would have kept rendering the system font — the same divergence this spec exists to close, surviving on the one surface a user reaches when things are already going wrong.
- Consequence for the load site: the loader call lives in `app/fonts.ts`, exported, and BOTH roots import that one instance. A second `Inter()` call in `global-error.tsx` would emit a second `@font-face` set under the same family name. `DESIGN.md:133` names `app/layout.tsx` as the load site; `app/fonts.ts` is that site hoisted one module so the second root can share it, which is a mechanical consequence of Next 16's two-root model rather than a departure.
- Route layouts: `app/admin/layout.tsx`, `app/help/layout.tsx`, `app/show/[slug]/layout.tsx` — all three enumerated; only the crew layout changes (its duplicate loader is removed), and admin/help inherit the root's font with no edit.
