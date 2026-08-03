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
| Crew layout's loader + its options | `app/show/[slug]/layout.tsx:31` and `app/show/[slug]/layout.tsx:33-37` |
| Crew layout's shell classes and testid | `app/show/[slug]/layout.tsx:45-48` |
| `page-shell` is asserted only for visibility | `tests/e2e/crew-page.spec.ts:1432` |
| Root Playwright config `desktop-chromium` `testMatch` is an explicit allow-list regex | `playwright.config.ts:78-79` |
| Baseline dev server for that project (port from `E2E_PORT`, default 3000) | `playwright.config.ts:245-250` |
| Crew seeding helper and its return shape | `tests/e2e/helpers/seedShowWithCrew.ts:108` and `tests/e2e/helpers/seedShowWithCrew.ts:192` |
| Text-node line counting via `Range.getClientRects()` (the established technique) | `tests/e2e/section-header-layout.layout.spec.ts:381-391` |
| 320px viewport is what produces the 240px row | `tests/e2e/section-header-layout.layout.spec.ts:143-144` |
| Standalone harness toolchain (no Next runtime) | `tests/e2e/helpers/liveEntryToolchain.ts:124-141` |
| Screenshot regen workflow + pinned image on a native-amd64 runner | `.github/workflows/screenshots-regen.yml:46` |
| Help screenshot baselines are byte-compared | `.github/workflows/screenshots-drift.yml:96` |
| DESIGN.md ratifies mechanism + location | `DESIGN.md:133` |

**Meta-test inventory** (`docs/agents/writing-plans.md:16`): this plan CREATES one structural meta-test (Task 3). It extends none of the named registries — no Supabase call boundary, no advisory-lock topology, no `admin_alerts` catalog row, no tile sentinel, no inline email normalization. Declared explicitly rather than left silent.

**Advisory-lock holder topology:** N/A — the diff contains no `pg_advisory*` call and no mutation of a lock-governed table, so no holder is added at any layer.

**e2e harness-readiness checklist** (`docs/agents/writing-plans.md:23`):

- **(a) Server boot:** the root `playwright.config.ts` baseline webServer, `pnpm dev -H 127.0.0.1 -p $E2E_PORT` (`playwright.config.ts:245-250`), `reuseExistingServer` locally. Task 1's spec joins the `desktop-chromium` project, which already targets that server. Sibling worktrees may hold :3000 — pass `E2E_PORT` when running locally.
- **(b) Readiness gate:** `await page.evaluate(() => document.fonts.ready)` after `goto(..., { waitUntil: "load" })`. This is the correct gate for this subject specifically: `networkidle` alone does not guarantee the font has been parsed and applied, and every width read is meaningless before it resolves. Crew-leg assertions additionally wait for the seeded page's own content.
- **(c) Detach safety:** every measurement happens inside a single `page.evaluate()` that creates, measures, and removes its probe spans synchronously in one task. No `locator.evaluate` on a node that can unmount, and no sampler outliving its element, so there is no auto-wait hang surface.

---

## Task 1 — RED: font identity in a real browser, both trees

**Creates** tests/e2e/font-binding.spec.ts (not yet tracked, so deliberately un-backticked).

**Register it** in the `desktop-chromium` `testMatch` at `playwright.config.ts:78-79` by adding `font-binding` to the alternation. Without this the spec runs nowhere and silently proves nothing — the same failure mode `tests/e2e/standalone.config.ts` documents for its own allow-list.

**Shape.** One helper, two cases (admin and crew). For each: `goto`, await `document.fonts.ready`, then a single `page.evaluate` that builds three absolutely-positioned off-screen spans with identical text (`"Wardrobe & key moments"`), `font-size: 16px`, `font-weight: 400`, `white-space: nowrap` — (a) inheriting the page cascade, (b) `font-family: "Inter"`, (c) `font-family: sans-serif` — measures each with `getBoundingClientRect().width`, removes them, and also returns `Array.from(document.fonts).map(f => ({ family: f.family, status: f.status }))`.

Assertions, in order:

1. **Non-vacuity precondition first:** `Math.abs(forcedInter - forcedSansSerif) > 1` — if the host resolves both to one face, fail loudly rather than pass empty.
2. `Math.abs(inherited - forcedInter) < 0.5`.
3. `Math.abs(inherited - forcedSansSerif) > 1`.
4. `fonts` contains at least one entry with `family === "Inter"` and `status === "loaded"`.

**Concrete failure mode caught:** on `/sign-in` today, `inherited` is 185.53 and `forcedInter` is 167.14 (the default-serif metric, because no Inter face exists there) — assertion 2 fails by 18.39px. It also catches a future Next release reverting to hashed `@font-face` family names, which would silently unbind `--font-sans`'s literal `"Inter"`; and assertion 3 stops a host that ships Inter as a *system* font from green-washing the result. It proves more than "the font is requested": nothing about a request is observed, only the resolved metric of rendered text.

**Explicitly NOT `document.fonts.check()`** — spec §1.0 finding 3 measured it returning `true` on a tree where Inter is provably absent.

**Anti-tautology note:** the expected values are *derived from the page's own render* (three mutually-constraining measurements), never hardcoded pixel constants, so the test cannot pass by matching a stale literal.

**Verify:** `E2E_PORT=3010 pnpm exec playwright test tests/e2e/font-binding.spec.ts --project=desktop-chromium` → the admin case FAILS, the crew case PASSES (crew already binds, spec §1.0). A crew-case failure here would falsify the spec's probe and must stop the task.

**Commit:** `test(assets): pin that both trees render Inter, in a real browser`

---

## Task 2 — GREEN: load Inter at the root, drop the duplicate

**Edit `app/layout.tsx`.** Add `import { Inter } from "next/font/google";` and

```ts
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
```

— byte-identical options to `app/show/[slug]/layout.tsx:33-37`, so the two cannot diverge during the transition. Apply `inter.variable` to `<html>` at `app/layout.tsx:57`, joining the existing `h-full antialiased` (the class goes on `<html>`, not `<body>`, because `app/globals.css:659-663` applies `font-family` at `html`).

**Edit `app/show/[slug]/layout.tsx`.** Remove the import, the `inter` constant, and `${inter.variable}` from the shell class list. Keep `data-testid="page-shell"` and the remaining classes `flex min-h-screen flex-col bg-bg text-text` byte-identical and in the same order. Update the file's header comment, which currently describes the loader it no longer owns (`app/show/[slug]/layout.tsx:6-15`) — leaving it would make the comment a false citation for the next reader.

**Do NOT touch `app/globals.css`.** Spec R2: `--font-sans` stays byte-identical. Binding to `var(--font-inter)` would make the declaration invalid at computed-value time on every surface lacking the `.variable` class.

**Verify:** Task 1's spec now passes both cases. Then `pnpm typecheck && pnpm lint`.

**Commit:** `feat(assets): load Inter at the root layout, per DESIGN.md 2.1`

---

## Task 3 — RED→GREEN: structural single-loader guard

**Creates** tests/assets/singleFontLoader.test.ts (vitest, node env).

Walk `app/` from the filesystem (not a lexical file list, so a NEW loader fails by default), collecting every file whose contents match `from "next/font/`. Assert the set is exactly one entry, the root layout path app/layout.tsx (paths written un-backticked here because a bracketed array literal is read as a citation by spec:lint).

**Concrete failure mode caught:** a future route layout adding its own `Inter()` call, which re-registers a second `@font-face` set under the same family name. The probe already observed **seven** `Inter` faces on the crew page from the single existing loader; a second loader compounds that silently, and nothing else in the repo would notice. Class-sweep discipline: filesystem walk, not a named-file scan.

**Anti-tautology:** the assertion pins the exact path set, not a count — a test asserting `length === 1` would pass if the loader MOVED to the wrong layout.

**Verify:** written against the pre-Task-2 tree it fails (the set is the crew layout path instead); after Task 2 it passes. Run: `pnpm vitest run tests/assets/singleFontLoader.test.ts`.

**Commit:** `test(assets): pin exactly one next/font loader, filesystem-walked`

---

## Task 4 — RED: the measured row, on a real Next surface

The backlog entry's measured artifact is the group title `"Wardrobe & key moments"` in the 240px narrowest real row. Add a case to Task 1's spec asserting, at a 320px viewport, which is the width that produces the 240px row per `tests/e2e/section-header-layout.layout.spec.ts:143-144`, that the title occupies exactly **one** text line.

**Measured how:** `Range.selectNodeContents()` on the title's own text node, then `getClientRects()` filtered to `width > 0.5`, counted. Never the heading box — it is inflated by an inline link and reports one line even when the text wraps (`tests/e2e/section-header-layout.layout.spec.ts:381-391`).

This is the layout-dimensions proof the spec's §4.2 requires: a real-browser rect assertion, not jsdom (jsdom computes no layout).

**Reachability check before writing the assertion:** confirm the event-detail group title renders on a reachable admin surface at 320px. If it is only reachable behind a modal or a seeded parse state, seed that state explicitly in the test rather than asserting on a surrogate row — a surrogate would not be the artifact the backlog entry measured. If it turns out to be reachable ONLY through the standalone harness, this task converts to an explicit closeout note recording it as N/A, covered by the documented limit in spec §5.2, because a Next-rendered instance is what the task exists to measure; that disposition is recorded, never silent.

**Commit:** `test(assets): pin the 240px group-title row to one line under the loaded font`

---

## Task 5 — Regenerate the help-screenshot byte baselines

Spec §6 and R6. 14 committed WebPs under `public/help/screenshots/` are byte-compared by `.github/workflows/screenshots-drift.yml:96`. Help pages inherit the root layout, so their type changes.

1. Push Tasks 1–4.
2. `gh workflow run screenshots-regen.yml --ref feat/font-binding-modal-freshness-cue` — regenerates from the pinned Playwright v1.59.1-jammy image on a native-amd64 runner (`.github/workflows/screenshots-regen.yml:46`) and commits to the branch. **Never regenerate locally** — an arm64 host produces different bytes than the native-x64 runner even on an identical pinned image.
3. `git pull` the regen commit; confirm `screenshots-drift` is green on the branch.
4. **Cross-check on the spec's probe:** the `crew-preview-*` baselines should be unchanged or near-unchanged (crew pages already rendered Inter). A large crew-preview delta falsifies spec §1.0 and must stop the plan for re-analysis rather than be accepted as noise.

If any local step ran `pnpm screenshot:help`, restore with `git restore public/help/screenshots/` before committing anything — local capture overwrites the x64-Linux baseline with host-architecture bytes.

---

## Task 6 — Invariant 8: impeccable dual gate

`app/layout.tsx` and `app/show/[slug]/layout.tsx` are UI surfaces, so the gate is mandatory.

Run `/impeccable critique` AND `/impeccable audit` on the diff, both with the canonical v3 setup gates: the context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read (brand.md or product.md). P0/P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry. Findings + dispositions land in §12 below, which carries the machine-checkable marker line enforced by `tests/docs/_metaInvariant8Closeout.test.ts`.

**Pre-code mechanical UI checklist** (run BEFORE Task 2, not after — the impeccable pair is a verifier, not a discovery mechanism): no user-visible copy is added, so the em-dash ban and apostrophe-literal rules have no target; no tap target added or moved; no type/token class changes; **no new or repurposed color token**, so no `DESIGN.md` contrast row and no contrast meta-test are required.

---

## Task 7 — Backlog graduation

- Move `BL-HEADER-FONT-FALLBACK-WRAP` (`BACKLOG.md:249`) to `BACKLOG-archive.md` at its terminal state, carrying the probe table and the scoping statement (fixed for every Next-rendered surface; the standalone-harness residual is a documented limit).
- File the successor entry `BL-HARNESS-FONT-FIDELITY` in `BACKLOG.md` per spec R4/§5.2.
- Add a new leading segment to the `Last reconciled:` line at `BACKLOG.md:7`.
- **Expect a rebase conflict:** two sibling panes are graduating other rows from the same file concurrently. Resolve by keeping BOTH sides — the entries are disjoint and the reconciliation line concatenates.

Item B (`BL-MODAL-REALTIME-UPDATED-CUE`) graduates separately, after its investigation and the user's decision.

---

## Task 8 — Whole-diff cross-model review, CI, merge

Split tight-scope Codex reviews per surface with the file list inlined (the default for anything beyond a handful of files), each brief carrying "Your role: REVIEWER ONLY" and an `EXPLICITLY DO NOT RELITIGATE:` block seeded from spec §1.1. Every `file:line` a brief asserts is grepped before dispatch. No `~/.claude/projects/` memory paths — Codex cannot read them.

Then push → **real CI green, not just local** → `gh pr merge --merge` → fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## Task checklist

1. [ ] Task 1 — RED font-identity spec, registered in `testMatch`
2. [ ] Task 2 — root loader in, duplicate out
3. [ ] Task 3 — single-loader structural guard
4. [ ] Task 4 — 240px row, one line, real browser
5. [ ] Task 5 — screenshot baselines regenerated from the pinned image
6. [ ] Task 6 — impeccable critique + audit, dispositions in §12
7. [ ] Self-review
8. [ ] Adversarial review (cross-model, Codex)
9. [ ] Task 7 — backlog graduation
10. [ ] Task 8 — whole-diff review, CI green, merge, `0  0`

---

## 12. Invariant-8 close-out

Filled in at Task 6. Findings and dispositions recorded here.

The marker line is written here at Task 6, once both halves have actually run. It is deliberately absent until then: the grammar admits only RAN or RAN-DEGRADED, so a placeholder would be both a false claim and a malformed line.

**Known transient consequence, stated so it is not read as an oversight:** while the marker is absent, `tests/docs/_metaInvariant8Closeout.test.ts` §4.1.1 fails locally on this file, because the plan declares the dual gate without yet carrying its marker. That is the guard working as designed. It goes green at Task 6, which runs before the branch is pushed, so CI never observes the intermediate state. A `PRE_GUARD_DEBT` row is NOT the right escape here: that mechanism is for pre-guard history, not for a live plan mid-flight.
