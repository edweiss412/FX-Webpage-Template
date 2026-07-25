# Crew-page share-link chrome — backlog closure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all three open BACKLOG items under `## Crew-page share-link chrome`. One ships code — a one-shot outline-plus-wash cue on the ShareHub crew-URL block when the share-token changes. One is resolved by deleting two orphaned components. One is closed as superseded by a ratified spec, with zero code.

**Architecture:** A client-only visual cue in `components/admin/showpage/ShareHub.tsx`. Render-phase derived state tracks the previous token and holds a nonce while a cue is live; `key={token}` on the URL block makes a token change remount it so the CSS animation restarts; a visibility predicate `(!open || !linkActive)` clears the cue whenever the target leaves the screen. All motion lives in `app/globals.css` keyframes hooked by a `data-share-link-flash` attribute — the component declares no `@keyframes`, matching the shipped `[data-step3-warning-flash]` split.

**Tech Stack:** Next.js 16, React 19.2.4, TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + @testing-library/react (jsdom), Playwright (standalone config), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md` — 8 adversarial rounds, ~48 findings, all verified true and repaired. Its §9.5 records the cited decision to resolve the oracle-prose vector by construction here rather than in a 9th prose round. **The plan is where that resolution happens**, so Task 6's adversary matrix is not optional polish.

## What the spec makes normative

Read §9.1 (N0-N7), §9.2 (coverage obligations), §9.3 (the live harness and its four wiring points), §9.4 (completion obligations K1-K9), and §6.1 (the three-branch transition rule). Those are the contract. §9.1.1's adversary register is worked examples for Task 6, never a gate.

## Empirical grounding (measured at plan time, not assumed)

- **`linkActive = published && !archived && url != null`** (`components/admin/showpage/ShareHub.tsx:419`). This is why the clear must read target visibility, not token nullity.
- **A pure unpublish does not rotate the token or bump the epoch** — `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2` puts rotation and the epoch bump explicitly out of scope. So the block can unmount with the token untouched.
- **The popover auto-closes on a lifecycle flip UNLESS busy** (`components/admin/showpage/ShareHub.tsx:490-495`), and a deferred close is CANCELLED when busy clears (`components/admin/showpage/ShareHub.tsx:517-520`). The leak path therefore requires the busy hold; a test without it exercises nothing.
- **The epoch gate accepts EQUAL epochs** — `epoch >= p.epoch` (`app/admin/show/[slug]/ShareTokenContext.tsx:47`). Only a strictly lower epoch is rejected.
- **The Copy button is a SIBLING of the URL block**, both inside one flex row (`components/admin/showpage/ShareHub.tsx:712-719`), so a `key` on the `<code>` cannot reset its state — but a `key` on the ROW would.
- **The body ResizeObserver early-returns on unchanged `scrollHeight`** (`components/admin/showpage/ShareHub.tsx:396`). A remounted `<code>` holding a fixed-length 64-hex token under `break-all` wraps identically, so no re-placement is scheduled.
- **The URL block is not focusable** — a plain `<code>`, no `tabIndex`, no handlers. A remount cannot drop focus; only a text selection is at risk, and `key={token}` changes only when the selected text has become a URL that no longer exists.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → green → commit. Task 1's deletion guards are red while the orphans exist.
- **Commit per task**, conventional-commits, `--no-verify` (the shared hook belongs to the main checkout).
- **No new user-visible copy at all**, so the em-dash ban and the §12.4 catalog gates have no surface here. The rotate banner copy at `app/admin/show/[slug]/RotateShareTokenButton.tsx:278-281` is unchanged.
- **UI quality gate (invariant 8):** `/impeccable critique` AND `/impeccable audit` on the diff, P0/P1 fixed or `DEFERRED.md`-logged, BEFORE cross-model review. Task 8.
- **Meta-test inventory:** EXTENDS `tests/styles/status-token-contrast.test.ts` (Task 5). CREATES one source-scan transitions test (Task 2) and one live browser spec (Task 6). N/A with reasons: `_metaInfraContract` (no Supabase calls), `_metaAdminAlertCatalog` (no alerts), `advisoryLockRpcDeadlock` (no `pg_advisory*`), `no-inline-email-normalization` (no emails), `_metaSentinelHidingContract` (no tiles), `_metaMutationSurfaceObservability` (adds and removes no mutation surface — both deleted files are presentational `"use client"` components), `_metaBgAccentInventory` (its matcher excludes `bg-accent-tint`, and our colours are `var()` references inside CSS keyframes, not Tailwind classes), `_metaDesignTokenPairs` (scoped to `app/help/_components`). **`tests/ci/_metaE2eWorkflowCoverage.test.ts` IS extended** — Task 6, wiring point 4.
- **Anti-tautology:** every cue assertion resolves the target by `getByTestId("admin-current-share-link-url")`, never a container. Negative assertions carry a positive precondition in the same test — assert the attribute PRESENT before asserting it absent, or the row proves nothing. Task 6 is the executable proof that this held.
- **No `pnpm screenshot:help` locally.** This is an arm64 host; the committed baselines are x64-Linux bytes. If run by accident, `git restore public/help/screenshots/`.

---

## File Structure

**Production files modified:**

- `components/admin/showpage/ShareHub.tsx` — export `SHARE_LINK_FLASH_MS`; add `prevToken`/`flash` render-phase state AFTER `linkActive` (`components/admin/showpage/ShareHub.tsx:419`, a TDZ hazard if placed earlier); add the clear predicate; add the timer effect; add `key={token}` and the conditional attribute to the `<code>` at `components/admin/showpage/ShareHub.tsx:713-718`.
- `app/globals.css` — two `@keyframes` blocks plus the `[data-share-link-flash]` rule and its reduced-motion override, adjacent to the step3 flash block at `app/globals.css:833-852`.
- `DESIGN.md` — the constant with its owning module; both false halves of the `DESIGN.md:274` preamble; the cue note required by spec §3.7.

- `components/admin/showpage/ShareHub.tsx` — additionally gains `data-testid="admin-current-share-link-row"` on the row wrapper (Task 3), without which N4's per-element selector contract is unexecutable.
- **Comment-only edits (Sweep B).** These modify production files and were missing from the earlier draft's inventory (plan-review finding 6): `app/admin/show/[slug]/ShareTokenContext.tsx`, `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `components/admin/showpage/StatusStrip.tsx`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx`.

**Production files deleted:** `app/admin/show/[slug]/ShareChip.tsx`, `app/admin/show/[slug]/CrewPageLink.tsx`.

**Tests deleted:** `tests/components/ShareChip.test.tsx`, `tests/components/CrewPageLink.test.tsx`.

**Tests renamed + reworked:** `tests/components/shareTokenInstantUpdate.test.tsx` becomes tests/components/shareTokenRotateSurface.test.tsx.

**Tests/CI created:** a ShareHub transitions source-scan test; a live browser spec plus its entry file; a dedicated workflow; a `testMatch` entry; a `_metaE2eWorkflowCoverage` row.

**Docs:** `BACKLOG.md`, `BACKLOG-archive.md`.

---

## Reconciliation sweeps — authored AND RUN at plan time

### Sweep A — orphan references

```
$ rg -n 'ShareChip|CrewPageLink' app components tests   [counts by file]
6  tests/components/shareTokenInstantUpdate.test.tsx   → renamed + reworked (Task 1)
4  tests/components/ShareChip.test.tsx                 → deleted (Task 1)
4  tests/components/CrewPageLink.test.tsx              → deleted (Task 1)
2  app/admin/show/[slug]/ShareChip.tsx                 → deleted (Task 1)
2  app/admin/show/[slug]/CrewPageLink.tsx              → deleted (Task 1)
1  tests/app/admin/rotateShareToken.test.tsx           → comment updated (Task 1)
1  app/admin/show/[slug]/ShareLinkCopyButton.tsx       → comment updated (Task 1)
```

Every hit has a disposition; the sweep must return zero after Task 1.

### Sweep B — stale topology prose (K4), by CLAIM not by identifier

A name-only grep misses these: they describe the retired three-consumer fan-out without naming a deleted component. Each verified stale at plan time:

| Site | Stale claim |
|---|---|
| `app/admin/show/[slug]/ShareTokenContext.tsx:6-8` | "every crew-URL surface … (header chip, Open crew page link, share-link card)" |
| `app/admin/show/[slug]/ShareTokenContext.tsx:72-74` | "the three consumers" |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx:14-17` | "the always-visible share-link card (and header chip / crew link)" |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx:161-164` | "the card / chip / crew link update instantly" |
| `components/admin/showpage/StatusStrip.tsx:7-9`, `components/admin/showpage/StatusStrip.tsx:18-24`, `components/admin/showpage/StatusStrip.tsx:27`, `components/admin/showpage/StatusStrip.tsx:39`, `components/admin/showpage/StatusStrip.tsx:99` | five sites, all describing a strip copy-link the file no longer has — verified `grep -c ShareLinkCopyButton` = 0. The earlier draft of this table listed only two of the five, so Task 1's "correct every Sweep-B site" would have shipped three unchanged (plan-review finding 6) |
| `tests/components/RotateShareTokenButton.test.tsx:4-6`, `tests/components/RotateShareTokenButton.test.tsx:71-73` | same fan-out |
| `tests/app/admin/rotateShareToken.test.tsx:9`, `tests/app/admin/rotateShareToken.test.tsx:10`, `tests/app/admin/rotateShareToken.test.tsx:73` | names the old filename and both deleted components |

### Sweep C — the singleton the backlog item mis-described

```
$ rg -c 'max-w-\[16rem\]' app components
app/admin/show/[slug]/ShareChip.tsx:1
```

One occurrence, in the file being deleted. The item's "the same magic appears elsewhere" premise is false.

---

## e2e harness-readiness checklist (mandatory, Task 6)

- **(a) Server boot:** none. No dev server, no Supabase. The spec bundles the real tree with version-pinned esbuild and serves one synthetic page over `node:http`, per `tests/e2e/hoverhelp-geometry.spec.ts`. Runs under `tests/e2e/standalone.config.ts`.
- **(b) Readiness gate:** `document.fonts.ready` plus one rAF tick before any computed-style read, then an explicit wait for the popover panel to be attached after the open click — never `networkidle`, which means nothing here since the page loads no network resources.
- **(c) Detach-safety:** the URL block is REPLACED by design on a token change, so any sampler holding a stale handle will hang on auto-wait. Every sample re-resolves the element by selector immediately before reading, and identity comparisons capture `elementHandle`s explicitly rather than reusing a `Locator` across the transition.

---

## Tasks

### Task 1 — Delete the orphans; rework and rename the integration test (K1-K4)

- [ ] RED: add a source-scan guard asserting `rg 'ShareChip|CrewPageLink'` finds nothing under `app/` and `components/`. Red while the files exist.
- [ ] Delete both components and their two test files.
- [ ] Rename `tests/components/shareTokenInstantUpdate.test.tsx` → tests/components/shareTokenRotateSurface.test.tsx (new name; created by Task 1); rewrite its header (the "three token consumers" claim is false).
- [ ] Preserve verbatim, per spec §4 — this is a FLOOR, not a summary: the real two-tap Rotate driver, the mocked no-op `router.refresh()`, the exact OLD url, the exact NEW url, both clipboard payloads, the OLD-token-nowhere sweep, the lower-epoch rejection case, popover-scoped locators.
- [ ] Repoint the stale-rotation test off the deleted chip and onto the ShareHub URL block. **Fix its TITLE** — it says "epoch <= current is rejected"; the gate accepts equal epochs (`app/admin/show/[slug]/ShareTokenContext.tsx:47`). K3a.
- [ ] Correct every Sweep-B site.
- [ ] GREEN: `pnpm test` + `pnpm typecheck`. Commit `refactor(admin): delete the orphaned share chip and crew-page link`.

### Task 2 — The normative CSS and the constant (N0, N1)

RED exists before implementation; the regex is TIGHTENED after, which is a refinement of a red test, not its creation (plan-review finding 1).

- [ ] RED: source-scan test under `tests/components/admin/showpage/` asserting `app/globals.css` declares `@keyframes share-link-flash-bg` and `share-link-flash-ring`, that `ShareHub.tsx` exports `SHARE_LINK_FLASH_MS = 1600` (N0, asserted as a VALUE), and that `ShareHub.tsx` declares no `@keyframes`. Red on all three counts against `origin/main`.
- [ ] Write the CSS from spec §3.4 verbatim and the constant; run `pnpm format`.
- [ ] TIGHTEN the same test to N1: compare the shipped rules against the normative block, using the formatted bytes. Ours is a two-name `animation:` shorthand that prettier reflows across three lines, unlike the single-line template at `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:729-734`, so the tightened pattern must be authored against real formatter output rather than guessed.
- [ ] GREEN. Commit `feat(admin): add the share-link flash keyframes`.

### Task 3 — The cue, one behaviour per red (§6.1 rule, N2-N5, N7)

The previous draft implemented all of §3.2 in one task and tested it in the next, so a correct implementation made the following task green on arrival (plan-review finding 1, BLOCKING). Split so each step's test precedes the code that satisfies it. Each bullet is test-then-minimal-change; one commit at the end of the task.

- [ ] RED: rotate through the real two-tap confirm; the URL block carries `data-share-link-flash=""` (N2) and `document.querySelectorAll("[data-share-link-flash]")` has length exactly 1 (N3 — plan-review finding 4; without this an implementation may mark the wrapper too and pass everything else). GREEN with `prevToken`/`flash` plus the both-non-null bump.
- [ ] RED: attribute present at `SHARE_LINK_FLASH_MS - 1`, absent at `SHARE_LINK_FLASH_MS`. GREEN with the timer effect.
- [ ] RED: with a cue live, force unrelated re-renders (busy flip, banner mount) and assert it PERSISTS (§6.1 branch 3). GREEN — the branch-3 no-op is what makes this pass, and a naive "clear when the token did not change" fails it.
- [ ] RED: element identity — the URL block DIFFERS across an accepted change; the Copy button and the popover panel are the SAME object (N4). GREEN with `key={token}`.
- [ ] RED: at expiry, EVERY named element including the URL block is the same object (N5). Already green if `key={token}`; RED against `key={flash}`, which Task 7 injects.
- [ ] RED, branch 1, one per cause: panel closed; token to null; **pure unpublish with a child held BUSY so the panel cannot auto-close** (`components/admin/showpage/ShareHub.tsx:490-495`), then busy clears (`components/admin/showpage/ShareHub.tsx:517-520`), then republish inside the window — asserting the target is PRESENT before asserting the attribute absent. GREEN with the `(!open || !linkActive)` predicate.
- [ ] RED: strictly-lower-epoch rotation leaves the URL unchanged AND no attribute. GREEN (no code change expected; if it passes immediately, record that in Task 7 rather than claiming a red).
- [ ] RED: `vi.getTimerCount()` is greater than 0 with a cue live and exactly 0 after `unmount()`. GREEN with the effect cleanup. Idiom: `tests/devcapture/useDevCapture.test.tsx:350-352`.
- [ ] Add `data-testid="admin-current-share-link-row"` to the row wrapper at `components/admin/showpage/ShareHub.tsx:712`. N4 requires each element to be resolvable **by its own stable selector**; the row has none today, and resolving it as the URL block's parent is not that contract (plan-review finding 5).
- [ ] GREEN, full file. Commit `feat(admin): cue the crew-URL block when the share-token changes`.

### Task 4 — Contrast rows (§9.2 item 5) — REGRESSION PINS, not TDD

- [ ] These pass on arrival against already-compliant tokens; that is their purpose, and the spec classes them as pins. No red phase is claimed (plan-review finding 1).
- [ ] Add rows to `tests/styles/status-token-contrast.test.ts` for all five uncovered pairs: `accent-edge` against `accent-tint` (both themes), against `surface` (dark), against `surface-sunken` (both themes). Helper API verified present: `MODES`, `tokenIn`, `contrast`, `DOT_FLOOR`.
- [ ] Prove they are not vacuous by temporarily perturbing a token value and observing the red, then reverting. Record it in Task 6's matrix.
- [ ] Commit `test(styles): pin the flash ring contrast floors`.

### Task 5 — The live browser spec and its FOUR wiring points (§9.3)

**The bundling mechanism is NOT plain `pnpm dlx esbuild`.** Codex's plan review ran the probe and it fails on `node:crypto` and `node:async_hooks`, reached through the `"use server"` modules that `RotateShareTokenButton`, `PickerResetControl` and the dev-capture row pull in (plan-review finding 2, BLOCKING). That is an esbuild-versus-Next semantics gap, not a real client-bundle leak, and the repo already solves it BY CLASS:

- [ ] Build through the plugin builder pattern of `tests/e2e/_step3ReviewModalBundle.mjs`, whose header (`tests/e2e/_step3ReviewModalBundle.mjs:10-32`) documents exactly this failure: `useServerElision` replaces any module whose first statement is a `"use server"` directive with no-op exports, dropping its server-only subtree; `emptyNodeBuiltins` resolves node builtins to an empty CJS module so `import { createHash } from "node:crypto"` binds to `undefined` rather than erroring at RESOLVE time. Reuse it if it generalises; otherwise add a sibling builder with the same two plugins. Do NOT name individual offending paths — the whole point is closing the class.
- [ ] The entry file must supply what a bare mount lacks (plan-review finding 2): `ShareTokenProvider` (`app/admin/show/[slug]/ShareTokenContext.tsx:83-85` throws without it), a `useRouter` stub for `app/admin/show/[slug]/RotateShareTokenButton.tsx:78` and `components/admin/ArchiveShowButton.tsx:97` (`tests/e2e/_nextNavigationStub.ts` exists), and any module-load guard the graph trips — `tests/e2e/_skeletonParityHarness.tsx` sets `HASH_FOR_LOG_PEPPER` for one such helper.
- [ ] **Render the PRODUCTION ANCESTRY, not a bare ShareHub** (§9.2 item 2; plan-review finding 3). The real chain is ShareHub inside `components/admin/showpage/StatusStrip.tsx:396-413`, inside the modal subheader at `components/admin/showpage/PublishedReviewModal.tsx:903-923`, under the panel's `PopoverHostContext.Provider` at `components/admin/review/ReviewModalShell.tsx:619-625` and `components/admin/review/ReviewModalShell.tsx:679-685`. A bare mount stays green against an ancestor-qualified rule that suppresses the cue only in production — adversary A18 exactly.
- [ ] Compile real `app/globals.css` through the Tailwind CLI with `@source` entries for ShareHub AND every ancestor whose classes participate, per `tests/e2e/hoverhelp-geometry.spec.ts:76` and `tests/e2e/hoverhelp-geometry.spec.ts:80-82`.
- [ ] Assertions per §9.2: both `background-color` AND `box-shadow`, in the motion and reduced-motion arms; restart via node REPLACEMENT with the attribute already present; exactly one element carrying the attribute (N3); no element in the panel with a resolved `animation-name` other than the cue's two.
- [ ] Wiring 1: the spec file. Wiring 2: the `testMatch` allow-list at `tests/e2e/standalone.config.ts:35`. Wiring 3: a dedicated workflow with `workflow_dispatch:`. Wiring 4: a `PATH_GATED` row in `tests/ci/_metaE2eWorkflowCoverage.test.ts` (fails by default for new dark specs, `tests/ci/_metaE2eWorkflowCoverage.test.ts:7`; precedent `tests/ci/_metaE2eWorkflowCoverage.test.ts:81`).
- [ ] The workflow path filter lists BOTH the runtime inputs AND the concrete sources (plan-review finding 9): the new spec, its entry file, the bundle builder, `tests/e2e/standalone.config.ts`, the workflow itself, `components/admin/showpage/ShareHub.tsx`, `app/globals.css`, the ancestor sources named above, plus `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `tsconfig.json`, `.github/actions/setup/**`. Model: `.github/workflows/hoverhelp-geometry-e2e.yml:15-30`.
- [ ] Commit `test(admin): add the real-browser share-link cue spec`.

### Task 6 — The executable adversary matrix (spec §9.0; the oracle resolution)

- [ ] **Commit everything first.** Reverting an injected mutation with `git checkout --` discards uncommitted work in that same file.
- [ ] **Scope of "row" (plan-review finding 7):** a row is one assertion added by Tasks 2, 3 and 5 — the CUE COVERAGE. Completion guards (Task 1's orphan scan, the Sweep-B reconciliation, K-obligation checks) and the Task 4 contrast pins are NOT rows: they are mandatory under K1-K9 and reject no cue adversary by design. They are exempt and must never be deleted for failing to red.
- [ ] For each adversary in spec §9.1.1, build it, run the cue suite, record which rows red.
- [ ] Every adversary must red at least one row. Every row must red for at least one adversary. A row that reds for nothing is strengthened or deleted before review.
- [ ] **Write the matrix to docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md** (created by this task) — a tracked artifact, so the mandated commit has content (plan-review finding 8; every mutation is reverted, so the tree would otherwise be clean). Reproduce it in the PR body.
- [ ] Commit `test(admin): record the share-link cue adversary matrix`.

### Task 7 — Docs and backlog (K5-K7)

- [ ] `DESIGN.md`: the constant with its owning module; BOTH false halves of the `DESIGN.md:274` preamble (single-file ownership, and "never produce a painted px" — false for both highlight durations); the §3.7 cue note with its measured ratios.
- [ ] `BACKLOG.md`: remove the whole section; file `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`.
- [ ] `BACKLOG-archive.md`: three resolutions, recording that `max-w-[16rem]` was a singleton and that the focus item was superseded, so neither is re-derived later.
- [ ] Commit `docs: close the crew-page share-link chrome backlog items`.

### Task 8 — Gates

- [ ] `/impeccable critique` and `/impeccable audit` on the diff; P0/P1 fixed or `DEFERRED.md`-logged; findings and dispositions recorded.
- [ ] Full local suite: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- [ ] Whole-diff cross-model review to APPROVE. **This is where the oracle gets its adversarial pass** — against assertions that exist and can be run, per spec §9.5.
- [ ] Push; real CI green, INCLUDING `screenshots-drift` (it fires on `app/**` and `components/**`). Expect no drift; if it reds, investigate — do NOT rebaseline.
- [ ] `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` is `0  0`.

---

## Task checklist

- [ ] Task 1 — delete orphans, rework + rename the integration test
- [ ] Task 2 — normative CSS + constant
- [ ] Task 3 — the cue, one behaviour per red
- [ ] Task 4 — contrast pins
- [ ] Task 5 — live browser spec + four wiring points
- [ ] Task 6 — adversary matrix
- [ ] Task 7 — docs + backlog
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] Task 8 — gates, CI, merge
