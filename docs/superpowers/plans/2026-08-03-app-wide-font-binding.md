# Plan — app-wide font binding (`BL-HEADER-FONT-FALLBACK-WRAP`)

**Spec:** `docs/superpowers/specs/2026-08-03-app-wide-font-binding.md` · **Branch:** `feat/font-binding-modal-freshness-cue` · **Implementer:** Opus / Claude Code (UI hard rule) · **Date:** 2026-08-03

Read the spec first. Its §1.1 "Resolved scope" table (R1–R6) governs; this plan does not re-decide anything in it.

---

## 0. Pre-draft code-verification pass (run before this plan body was written)

Every file, symbol, and config entry this plan names, verified against the live tree:

| Claim | Verified |
| --- | --- |
| Root layout renders `<html className="h-full antialiased">` and loads no font | `app/layout.tsx:57` |
| `html { font-family: var(--font-sans) }` | `app/globals.css:659-663` |
| `--font-sans` begins with the literal family `"Inter"` | `app/globals.css:103-104` |
| Crew layout's loader + its options, pre-change | `app/show/[slug]/layout.tsx` at commit `70f924cdd` (lines 31, 33-37) |
| Crew layout's shell classes and testid (line anchors are pre-change; the file shrinks when its loader is removed) | `app/show/[slug]/layout.tsx` |
| `page-shell`'s only existing assertion is inside a SKIPPED describe, so it is not live coverage | `tests/e2e/crew-page.spec.ts:1432` inside `tests/e2e/crew-page.spec.ts:1416` |
| Root Playwright config `desktop-chromium` `testMatch` is an explicit allow-list regex | `playwright.config.ts:78-79` |
| Baseline dev server for that project (port from `E2E_PORT`, default 3000) | `playwright.config.ts:245-250` |
| Crew seeding helper, its return shape, and its teardown | `tests/e2e/helpers/seedShowWithCrew.ts:108`, `tests/e2e/helpers/seedShowWithCrew.ts:192`, `tests/e2e/helpers/seedShowWithCrew.ts:103` |
| Sign-in route is `/auth/sign-in`; there is NO `/sign-in` | `app/auth/sign-in/page.tsx` (a run against `/sign-in` returned 404) |
| Admin sign-in helper + fixture | `tests/e2e/helpers/signInAs.ts:43`, `tests/e2e/helpers/fixtures.ts:25` |
| Crew-preview screenshots render under the ADMIN tree, not the crew layout | `scripts/help-screenshots.manifest.ts:96-117`, `app/admin/show/[slug]/preview/[crewId]/page.tsx:42` |
| Empty event-detail groups are filtered out before render | `components/admin/wizard/step3ReviewSections.tsx:2216-2221` |
| The 240px width is hard-coded by the standalone harness, not produced by a 320px viewport on a live route | `tests/e2e/section-header-layout.layout.spec.ts:72-76` |
| Text-node line counting via `Range.getClientRects()` (the established technique) | `tests/e2e/section-header-layout.layout.spec.ts:381-391` |
| Standalone harness toolchain (no Next runtime) | `tests/e2e/helpers/liveEntryToolchain.ts:124-141` |
| Screenshot regen workflow + pinned image on a native-amd64 runner | `.github/workflows/screenshots-regen.yml:46` |
| Help screenshot baselines are byte-compared | `.github/workflows/screenshots-drift.yml:96` |
| DESIGN.md ratifies mechanism + location | `DESIGN.md:133` |

**Meta-test inventory** (`docs/agents/writing-plans.md:16`): this plan CREATES one structural meta-test (T1 step 2, the single-loader guard). It extends none of the named registries — no Supabase call boundary, no advisory-lock topology, no `admin_alerts` catalog row, no tile sentinel, no inline email normalization. Declared explicitly rather than left silent.

**Advisory-lock holder topology:** **No new holder at any layer, and no new mutation path.** The product diff mutates nothing and contains no `pg_advisory*` call. Task 1's test seeds through the pre-existing `seedShowWithCrew()` helper, which does insert into `shows` and `crew_members` (`tests/e2e/helpers/seedShowWithCrew.ts:103-105`, `tests/e2e/helpers/seedShowWithCrew.ts:118-135`, `tests/e2e/helpers/seedShowWithCrew.ts:178-181`) without taking the lock. **Stated explicitly after spec review R1**, which correctly refused a flat N/A here. That helper is shared e2e fixture setup already used by every crew-route suite (`tests/e2e/crew-page.spec.ts`, `tests/e2e/picker-flow.spec.ts`, `tests/e2e/crew-layout-dimensions.spec.ts`), running single-worker (`playwright.config.ts:41`) against a local test database. This plan neither introduces that path nor changes its locking, so the holder count for every hashkey is exactly what it was before this branch. Changing the helper's locking posture is a repo-wide decision about test fixtures — out of scope here, and not altered silently. Task 1 does add the teardown its callers should have (`deleteSeededShow`).

**e2e harness-readiness checklist** (`docs/agents/writing-plans.md:23`):

- **(a) Server boot:** the root `playwright.config.ts` baseline webServer, `pnpm dev -H 127.0.0.1 -p $E2E_PORT` (`playwright.config.ts:245-250`), `reuseExistingServer` locally. Task 1's spec joins the `desktop-chromium` project, which already targets that server. Sibling worktrees may hold :3000 — pass `E2E_PORT` when running locally.
- **(b) Readiness gate:** `await page.evaluate(() => document.fonts.ready)` after `goto(..., { waitUntil: "load" })`. This is the correct gate for this subject specifically: `networkidle` alone does not guarantee the font has been parsed and applied, and every width read is meaningless before it resolves. Crew-leg assertions additionally wait for the seeded page's own content.
- **(c) Detach safety:** every measurement happens inside a single `page.evaluate()` that creates, measures, and removes its probe spans synchronously in one task. No `locator.evaluate` on a node that can unmount, and no sampler outliving its element, so there is no auto-wait hang surface.

---

## T1, step 1 — RED: font identity in a real browser, three real routes

_(T1 is one task and one commit; these steps run inside it. See the task graph below.)_

**Creates** tests/e2e/font-binding.spec.ts (not yet tracked, so deliberately un-backticked).

**Register it in THREE places — the Playwright project, a CI workflow, and the coverage census.** Spec review R2 caught that an earlier draft did only the first, which leaves the oracle runnable locally and dark in CI:

1. `playwright.config.ts:78-79`, the `desktop-chromium` `testMatch` alternation. Without this the spec runs nowhere even locally.
2. `.github/workflows/crew-e2e.yml`'s explicit spec list, plus its post-run execution oracle `scripts/check-crew-e2e-executed.mjs` (`REQUIRED`, 4 cases once T2's row case lands — bump it in the same commit as that case, or the oracle silently tolerates a dark one — collected is not executed, and that registry is what makes a silently-skipped suite fail the job). **crew-e2e is the right home** rather than a dev-server-only run: it builds and starts the production artifact, and the binding rests on `next/font` registering the literal family name, which a dev-only run would leave unproved against the build CI actually ships.
3. `tests/ci/_metaE2eWorkflowCoverage.test.ts`'s allowlist — crew-e2e filters with `pull_request.paths-ignore`, so the coverage census classifies its specs as path-gated and attributes none of them to the run step. The four existing crew-e2e specs each carry a `PATH_GATED_BY_EXCLUSION` row; this spec needs the same.

The repo's own `tests/ci/_metaE2eWorkflowCoverage.test.ts` fails on an unwired spec, so running it is the check that this step happened.

**Shape.** One helper, three cases. **Routes corrected after spec review R1:** an earlier draft named `/sign-in`, which does not exist (a run returned 404, and a 404 still renders the ROOT layout — so a probe there reads as a plausible pass for a surface never visited). Every case asserts status 200 AND page identity. The cases are `/admin` behind `signInAs(page, ADMIN_FIXTURE)`, the public `/auth/sign-in`, and the seeded crew route (torn down with `deleteSeededShow`). For each: `goto`, await `document.fonts.ready`, then a single `page.evaluate` that builds three absolutely-positioned off-screen spans with identical text (`"Wardrobe & key moments"`), `font-size: 16px`, `font-weight: 400`, `white-space: nowrap` — (a) inheriting the page cascade, (b) `font-family` forced to the family `--font-inter` names, (c) `font-family: sans-serif` — measures each with `getBoundingClientRect().width`, removes them, and also returns `Array.from(document.fonts).map(f => ({ family: f.family, status: f.status }))`.

Assertions, in order:

1. **Non-vacuity precondition first:** `Math.abs(forcedInter - forcedSansSerif) > 1` — if the host resolves both to one face, fail loudly rather than pass empty.
2. `Math.abs(inherited - forcedInter) < 0.5`.
3. `Math.abs(inherited - forcedSansSerif) > 1`.
4. `fonts` contains at least one `loaded` entry whose family is the one `--font-inter` names.
5. `<html>` exposes `--font-inter`. Asserted separately because the token is NOT what binds the font (see T1 step 3) — every width check would still pass if the loader silently stopped emitting `variable:`.
6. The resolved cascade NAMES `Inter Fallback`, **and** a face by that name is actually registered. The cascade string alone is not enough: computed style preserves a family name whether or not any face answers to it.
7. The document registers exactly one font family (excluding the generated companion and the dev overlay's `__nextjs-*`).
8. No `@font-face` is registered twice on its `(family, style, weight, unicodeRange)` tuple.
9. Every app face shares ONE weight+style descriptor PAIR — a second pair means a second, differently-configured loader for the same family, which 7 and 8 both miss. Keyed on the pair, not weight alone: review R6 demonstrated a `style: "italic"` second loader keeping family `Inter` and weight `100 900`.

Assertions 7-9 corroborate the structural guard rather than closing it; see step 2 for what each layer actually proves.

**Concrete failure mode caught:** assertion 2 fails today on both non-crew routes, because no Inter face is registered there and the forced-`"Inter"` probe falls back to the default serif metric. (The 185.53-vs-167.14 figure in the spec's probe table was taken on the 404 shell; the real per-route numbers come from this task's own first RED run and are recorded in the closeout.) The crew case's assertion 5 is RED today too, since the `.variable` class currently sits on a nested `<div>` rather than `<html>`. It is upgrade-proof against a future Next that hashes the generated family name — the expected family is read from `--font-inter`, the same indirection `--font-sans` uses, rather than hardcoded; and assertion 3 stops a host that ships Inter as a *system* font from green-washing the result. It proves more than "the font is requested": nothing about a request is observed, only the resolved metric of rendered text.

**Explicitly NOT `document.fonts.check()`** — spec §1.0 finding 3 measured it returning `true` on a tree where Inter is provably absent.

**Anti-tautology note:** the expected values are *derived from the page's own render* (three mutually-constraining measurements), never hardcoded pixel constants, so the test cannot pass by matching a stale literal.

**Verify:** `E2E_PORT=3010 pnpm exec playwright test tests/e2e/font-binding.spec.ts --project=desktop-chromium` → the two non-crew cases FAIL on assertion 2; the crew case fails only on assertion 5 (token scope) and passes 1-4. A crew-case failure on assertions 1-4 would falsify the spec's probe and must stop the task.

**No commit at this step** — T1 commits once, after the implementation makes these green.

---

## T1, step 2 — RED: structural single-loader guard

**Creates** tests/assets/singleFontLoader.test.ts (vitest, node env).

Walk the repo from the filesystem as a denylist and PARSE each file with the TypeScript compiler API. **This is a TRIPWIRE for the ordinary accident, not a census** — four adversarial rounds each found a location a file-walk cannot see, and the vector was descoped rather than patched a fifth time (spec §4.3). A green run does not prove a second loader is absent — resolving `next/font/*` import bindings in every form, const and assignment alias chains to a fixpoint, and AST call nodes. Not a text match: three review rounds each demonstrated live escapes against source-scanning oracles. Assert the set is exactly one entry, the shared loader module app/fonts.ts (paths written un-backticked here because a bracketed array literal is read as a citation by spec:lint). Also count loader CALL SITES as AST call nodes, so a second call added under an existing import is caught in any of the eighteen fixtured forms — parentheses, sequence expressions, `Function.prototype.call`, object-literal members, namespace member/element access and the rest. Forms outside that set (R5's `Reflect.apply`) escape it; the residual note below is the authority.

**Concrete failure mode caught:** a future route layout adding its own `Inter()` call, which re-registers a second `@font-face` set under the same family name. The probe already observed **seven** `Inter` faces on the crew page from the single existing loader; a second loader compounds that silently. The only other thing that would notice is the runtime pair below, and only when the two loaders' faces differ AND the module is reached by one of the three routes that suite visits. Class-sweep discipline: filesystem walk, not a named-file scan.

**This guard is a TRIPWIRE for the ordinary accident.** Rounds 2, 3 and 4 each demonstrated new escaping call forms (R4's latest: `Reflect.apply`). An open syntactic space is not closed by enumeration, so the corroboration lives in T1 step 1's RUNTIME assertions — exactly one font family, and no `@font-face` registered twice on its full `(family, style, weight, unicodeRange)` tuple. Those observe what the browser registered, so call syntax cannot evade them — but a byte-identical second call registers identical faces and escapes them too. Neither layer is a closure; the pair is defence in depth, not a proof. This one runs in milliseconds without a browser.

**Anti-tautology:** the assertion pins the exact path set, not a count. This matters concretely — spec review R1 caught an earlier spec wording of "exactly one `next/font` import under `app/`", which is GREEN today (the crew layout is that one) and could therefore never go RED, violating invariant 1. A count also cannot see a loader that MOVED to the wrong layout.

**Verify:** written against the current tree it FAILS — the loader set is the crew layout, not the root — and it passes only after step 3 lands. Run: `pnpm vitest run tests/assets/singleFontLoader.test.ts`.

**No commit at this step** — part of T1's single commit.

---

## T1, step 3 — GREEN: load Inter, at the module both roots can share

**Rewritten after review R5**, which correctly found that the previous wording told an implementer to put a fresh `Inter()` call inside `app/layout.tsx` and to leave `app/globals.css` alone — recreating the exact two defects the R4 and impeccable repairs removed.

**Create `app/fonts.ts`** and put the single loader call there:

```ts
export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
```

Not in `app/layout.tsx`, because **Next 16 has two roots**. `app/global-error.tsx` renders its own `<html>` and replaces the root layout on a fatal error — it already re-imports the global stylesheet for exactly that reason — so a loader living only in the root layout leaves the crash screen on the system font. A second `Inter()` call there would emit a second `@font-face` set under the same family name. One call, exported, imported by both.

**Both roots import it.** `app/layout.tsx` applies `inter.variable` to `<html>` (joining `h-full antialiased`); `app/global-error.tsx` applies it to its own `<html>`, which also needs `lang="en"` to match (WCAG 3.1.1; the sibling root has it).

**EDIT `app/globals.css`.** `--font-sans` becomes `var(--font-inter, "Inter", "Inter Fallback"), ui-sans-serif, …`. Naming the literal `"Inter"` skips next/font's generated metric-matched `Inter Fallback` face — built with `size-adjust`/`ascent-override` precisely so the `display: "swap"` window does not reflow — so first paint renders a system font at native metrics and then snaps ~10% on every React-root route. The `var()` **fallback list** is what makes this safe: where the token is undefined (the standalone harnesses, which compile this file with no Next runtime) it substitutes the literal pair rather than leaving the declaration invalid at computed-value time, which would drop `font-family` entirely.

**Update `DESIGN.md` §2.1 in lockstep** (invariant 7): the pinned fallback stack gains `Inter Fallback`, and the line naming the load site is corrected.

**Verify:** T1 step 1's spec passes all its cases; the step 2 guard passes; then `pnpm typecheck && pnpm lint`.

**Commit (the whole of T1):** `feat(assets): load Inter at the root layout, per DESIGN.md 2.1`

---

## T2 — the measured row, on a real Next surface

The backlog entry's measured artifact is the group title `"Wardrobe & key moments"` in the 240px narrowest real row. Add a case to Task 1's spec asserting that the title occupies exactly **one** text line.

**The 240px figure does NOT come from a viewport — corrected after spec review R1.** It is hard-coded by the standalone harness (`tests/e2e/section-header-layout.layout.spec.ts:72-76`); the 320px viewport lines only open that harness page. So this task may not assert "320px yields a 240px row" on a live route.

**Measured how:** `Range.selectNodeContents()` on the title's own text node, then `getClientRects()` filtered to `width > 0.5`, counted. Never the heading box — it is inflated by an inline link and reports one line even when the text wraps (`tests/e2e/section-header-layout.layout.spec.ts:381-391`).

This is the layout-dimensions proof the spec's §4.2 requires: a real-browser rect assertion, not jsdom (jsdom computes no layout).

**Reachability is established by navigation BEFORE the assertion is written.** Empty event-detail groups are filtered out before render (`components/admin/wizard/step3ReviewSections.tsx:2216-2221`), so an unseeded page renders nothing to measure. The implementer must land on exactly one of:

- **(a)** a named live admin route plus the seeded state that renders a NON-EMPTY group carrying this title, with the exact selector recorded and the container width read FROM THE DOM rather than assumed. The one-line assertion is then written against that.
- **(b)** if no live route reaches it, this task is recorded in the closeout as N/A, covered by the documented limit in spec §5.2, with the navigation attempt shown.

A surrogate row is NOT acceptable under either branch — it would not be the artifact the backlog entry measured, and asserting on one is the tautology this project's rules exist to prevent. Whichever branch is taken is recorded explicitly, never left silent.

**T2's TDD lifecycle, stated plainly because review R4 was right to ask.** T2 adds no product behavior — the behavior it measures ships in T1 — so its cycle is not "failing test → minimal implementation → passing test" over product code; there is no implementation to write. Its genuine RED→GREEN was over the TEST's own validity: the first non-vacuity probe face (Courier New) did NOT wrap the label, so the check FAILED and the "stays on one line" assertion stood exposed as unfalsifiable at that row width. Only after measuring five faces and finding one that does wrap (cursive, 212px in a 238px row) did it go green. That is a real observed failure that changed the artifact, recorded here rather than dressed up as a product TDD cycle it is not.

**Commit:** `test(assets): pin the measured group-title row to one line under the loaded font`

---

## T3 — Regenerate the help-screenshot byte baselines

Spec §6 and R6. 14 committed WebPs under `public/help/screenshots/` are byte-compared by `.github/workflows/screenshots-drift.yml:96`. Help pages inherit the root layout, so their type changes.

1. Push T1 and T2.
2. `gh workflow run screenshots-regen.yml --ref feat/font-binding-modal-freshness-cue` — regenerates from the pinned Playwright v1.59.1-jammy image on a native-amd64 runner (`.github/workflows/screenshots-regen.yml:46`) and commits to the branch. **Never regenerate locally** — an arm64 host produces different bytes than the native-x64 runner even on an identical pinned image.
3. `git pull` the regen commit; confirm `screenshots-drift` is green on the branch.
4. **Expect ALL 14 to change, including the six `crew-preview-*`.** Corrected after spec review R1: those are captured from `/admin/show/<slug>/preview/<crewId>` (`scripts/help-screenshots.manifest.ts:96-117`), which renders `CrewShell` under the ADMIN tree (`app/admin/show/[slug]/preview/[crewId]/page.tsx:42`) and does not inherit the crew layout. They carry the root fallback today. A large crew-preview delta is the expected result, not a falsification signal — there is no unchanged-baseline cross-check to be had here.

If any local step ran `pnpm screenshot:help`, restore with `git restore public/help/screenshots/` before committing anything — local capture overwrites the x64-Linux baseline with host-architecture bytes.

---

## T4 — Invariant 8: impeccable dual gate

The UI surfaces in this diff are `app/fonts.ts`, `app/layout.tsx`, `app/global-error.tsx`, `app/show/[slug]/layout.tsx`, `app/globals.css` and `DESIGN.md`, so the gate is mandatory.

Run `/impeccable critique` AND `/impeccable audit` on the diff, both with the canonical v3 setup gates: the context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read (brand.md or product.md). P0/P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry. Findings + dispositions land in §12 below, which carries the machine-checkable marker line enforced by `tests/docs/_metaInvariant8Closeout.test.ts`.

**Pre-code mechanical UI checklist** (run BEFORE T1's implementation step, not after — the impeccable pair is a verifier, not a discovery mechanism): no user-visible copy is added, so the em-dash ban and apostrophe-literal rules have no target; no tap target added or moved; no type/token class changes; **no new or repurposed color token**, so no `DESIGN.md` contrast row and no contrast meta-test are required.

---

## T5 — Backlog graduation

- Move `BL-HEADER-FONT-FALLBACK-WRAP` (`BACKLOG.md:249`) to `BACKLOG-archive.md` at its terminal state, carrying the probe table and the scoping statement (fixed for every React-root surface; the standalone-harness residual and the four hand-built auth error documents are documented limits).
- File the successor entry `BL-HARNESS-FONT-FIDELITY` in `BACKLOG.md` per spec R4/§5.2.
- Add a new leading segment to the `Last reconciled:` line at `BACKLOG.md:7`.
- **Expect a rebase conflict:** two sibling panes are graduating other rows from the same file concurrently. Resolve by keeping BOTH sides — the entries are disjoint and the reconciliation line concatenates.

Item B (`BL-MODAL-REALTIME-UPDATED-CUE`) graduates separately, after its investigation and the user's decision.

---

## T6 — Whole-diff cross-model review, CI, merge

Split tight-scope Codex reviews per surface with the file list inlined (the default for anything beyond a handful of files), each brief carrying "Your role: REVIEWER ONLY" and an `EXPLICITLY DO NOT RELITIGATE:` block seeded from spec §1.1. Every `file:line` a brief asserts is grepped before dispatch. No `~/.claude/projects/` memory paths — Codex cannot read them.

Then push → **real CI green, not just local** → `gh pr merge --merge` → fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Task graph and commit lifecycle

**Restructured after spec review R2, which was right to call the earlier graph a lifecycle violation.** That version made "write the RED test" and "make it pass" two tasks with two commits, which produces a commit whose tests fail — invariant 1 says *"Every task: failing test → minimal implementation → passing test → commit"*, i.e. the cycle completes INSIDE one task, and invariant 6 gives that task one commit. It also scheduled the structural guard AFTER the implementation, where it starts green and can never have driven anything, and put the review gates after execution instead of before it.

Corrected: **T1 is one task** — every test for this change, plus the implementation, plus the CI wiring that makes the tests real, in a single commit whose tree is green. The RED observation happens during the task and its output is recorded in the closeout; it is not frozen into a commit. Every subsequent task carries its own commit, including the ones the earlier graph left commitless.

| # | Task | Commit |
| --- | --- | --- |
| T1 | Font-identity e2e (3 routes) + single-loader structural guard + CI wiring + root loader in, crew duplicate out. RED observed, then GREEN, then committed. | `feat(assets):` |
| T2 | The measured group-title row — branch (a) live assertion, or branch (b) recorded N/A. | `test(assets):` under (a); `docs(assets):` recording the disposition under (b). Either way T2 carries its OWN commit — review R3 was right that folding it into T4 would batch two tasks into one, against invariant 6. |
| T3 | Regenerate the help-screenshot baselines from the pinned image. | the regen workflow's own commit |
| T4 | Impeccable critique + audit; §12 dispositions and marker. | `docs(assets):` |
| T5 | Backlog graduation + file `BL-HARNESS-FONT-FIDELITY`. | `docs(backlog):` |
| T6 | Whole-diff review, CI green, merge. | no commit of its own |

## Checklist

1. [x] Self-review
2. [ ] Adversarial review (cross-model, Codex) — spec + plan, to APPROVE. **Not yet approved. R1-R11 all returned BLOCKING and were repaired in turn; R12 returned NEEDS-ATTENTION with no user-facing failure found in the shipped behaviour, only documentation inconsistencies.** Rounds 8-11 all landed on one vector — the loader guard's location census — which was DESCOPED at R11 per the AGENTS.md same-vector rule rather than patched a fifth time (spec §4.3). Marked complete prematurely in an earlier revision; review R4 caught that, and the box stays open until a round returns APPROVE.
3. [x] T1 — tests + implementation + CI wiring (`2ab7e966a`, amended by `e58725c5b` and the impeccable/R4 repairs)
4. [x] T2 — the measured row, branch (a): reachable via `/admin?show=<slug>` (`461c164dc`)
5. [x] T3 — screenshot baselines regenerated from the pinned image (`dd0bbbf8d`, all 14 changed including the six crew-preview, which confirms they render under the admin tree)
6. [x] T4 — impeccable critique 31/40 + audit 19/20, dispositions + marker in §12
7. [x] T5 — backlog graduation
8. [ ] T6 — whole-diff review, real CI green, merge, `0  0`

---

## 12. Invariant-8 close-out

Both halves ran on the diff (`git diff 7aab6dae9..HEAD -- app/ DESIGN.md`), with the canonical v3 setup gates: the context.mjs context load (PRODUCT.md + DESIGN.md), then the product register reference (this is app UI — admin dashboard plus crew page — not a brand surface). Critique ran as two isolated parallel sub-agents per the skill's hard invariant, so it is NOT a degraded run.

### Critique — 31/40 (Good)

| Severity | Finding | Disposition |
| --- | --- | --- |
| **P1** | `--font-sans` named the literal `"Inter"`, so next/font's generated metric-matched `Inter Fallback` face was never in the cascade. The `display: "swap"` window painted a system font at native metrics and then snapped ~10% (187.28px → 168.91px on a real string) on every React-root route — worst at 390px, where a label can unwrap from two lines to one and shift everything below it mid-glance. | **FIXED** (`84fe79369`). `--font-sans` now reads `var(--font-inter, "Inter", "Inter Fallback"), …`; the `var()` fallback list keeps the declaration valid at computed-value time on surfaces without the generated class. `DESIGN.md` §2.1's pinned stack updated in lockstep (invariant 7). Pinned by a new e2e assertion that the resolved cascade contains the fallback face. This finding also retired spec decision R2 as originally written — see spec §2.5. |
| **P2** | `app/global-error.tsx` renders its own `<html>` and replaces the root layout, so the crash screen was the one tree still rendering the system font. | **FIXED** (`84fe79369`). The loader moved to `app/fonts.ts` and both roots import the one instance. Codex review R4 found this independently and also called it BLOCKING. |
| **P3** | Numerals are not disambiguated (`zero`/`cv05`) where crew read room numbers and confirmation numbers in direct sun. | **FILED TO BACKLOG, not deferred** — the two ledgers carry different commitment semantics (`DEFERRED.md` is "will do, concrete trigger"; `BACKLOG.md` is "might do"), and this has no trigger. It is a type-feature decision about `DESIGN.md` §2.4's tabular rule, not part of binding the family. `BL-INTER-NUMERAL-DISAMBIGUATION`. Wording corrected after review R5 flagged the mismatch. |
| **P3** | The `app/layout.tsx` comment carried a claim ("nothing consumes `--font-inter`") that the P1 fix falsifies. | **FIXED** — the loader and its commentary moved to `app/fonts.ts` and the claim is gone. |

### Audit — 19/20 (Excellent), anti-patterns PASS

detect.mjs returned `[]`, exit 0, on the changed files. **Zero P0, zero P1.**

| Severity | Finding | Disposition |
| --- | --- | --- |
| **P2** | `app/global-error.tsx`'s `<html>` carried no `lang` (WCAG 3.1.1, Level A). Pre-existing, but this diff edits that exact element and its sibling root has `lang="en"`. | **FIXED** — `lang="en"` added. |
| **P2** | `DESIGN.md` §2.1 still read "a future task wires this up" and named `app/layout.tsx` as the load site. Both halves false after this change, and `app/fonts.ts` quotes that sentence as its own justification. | **FIXED** — rewritten to name `app/fonts.ts` and the two-root reason, with the history noted. |
| **P3** | The crash screen has no no-FOUC theme bootstrap, so an explicit `data-theme` choice is lost there. | **NOT FIXED — out of scope.** Pre-existing and unrelated to fonts; fixing it means moving theme bootstrap into a second root, which is its own change. Recorded here so it is not re-derived. |
| **P3** | `font-feature-settings: "tnum" 1, "cv11" 1` was host-font-dependent outside the crew tree and now deterministically activates Inter's alternates on admin/auth/help for the first time. | **ACCEPTED** — this is the intended consequence of the change, not a defect. 35 admin/component files use `tabular-nums`; their figure alignment was silently host-dependent before. |

Three audit claims were verified as **false positives** and are recorded so a later reviewer does not re-derive them: `subsets: ["latin"]` does not drop glyphs (Next emits all seven `unicode-range` slices; `subsets` scopes only the preload); `@theme` vs `@theme inline` is correct as written, since `--font-inter` lands on the `<html>` element, which is the document root scope, the same element `--font-sans` is declared on; and the two `font_google_inter_*` chunks in `.next/dev` are build staleness, not two loaders.

**Empirical confirmation the change reaches its target:** the dev build's next-font-manifest lists the woff2 for `app/admin/page` and `app/auth/sign-in/page` as well as the crew page, with `appUsingSizeAdjust: true`. Admin and auth appearing at all is direct evidence the binding now reaches trees that previously loaded no font.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded
