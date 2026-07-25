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
- **No change to user-visible PRODUCT copy**, so the em-dash ban and the §12.4 catalog gates have no surface here. The rotate banner copy at `app/admin/show/[slug]/RotateShareTokenButton.tsx:278-281` is unchanged. Sweep B is deliberately scoped to code comments and test docs for this reason; the two stale user-facing claims it surfaces (`app/help/admin/per-show-panel/page.mdx:7` lists the copy-link among the status-strip contents; `app/help/admin/per-show-panel/page.mdx:30` places Re-sync beside it) are pre-existing debt from the share-hub consolidation and are FILED, not edited here.
- **UI quality gate (invariant 8):** `/impeccable critique` AND `/impeccable audit` on the diff, P0/P1 fixed or `DEFERRED.md`-logged, BEFORE cross-model review. **Both commands run with the canonical v3 setup gates, which are part of the contract and not optional preamble** (`AGENTS.md:20`): the context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read (the brand or product register). A run that records two passes without those setup steps does NOT satisfy invariant 8 (round-4 review, HIGH). Findings and dispositions go in the PR body. Task 8.
- **Meta-test inventory:** EXTENDS `tests/styles/status-token-contrast.test.ts` (Task 4). CREATES one source-scan transitions test (Task 2) and one live browser spec (Task 5). N/A with reasons: `_metaInfraContract` (no Supabase calls), `_metaAdminAlertCatalog` (no alerts), `advisoryLockRpcDeadlock` (no `pg_advisory*`), `no-inline-email-normalization` (no emails), `_metaSentinelHidingContract` (no tiles), `_metaMutationSurfaceObservability` (adds and removes no mutation surface — both deleted files are presentational `"use client"` components), `_metaBgAccentInventory` (its matcher excludes `bg-accent-tint`, and our colours are `var()` references inside CSS keyframes, not Tailwind classes), `_metaDesignTokenPairs` (scoped to `app/help/_components`). **`tests/ci/_metaE2eWorkflowCoverage.test.ts` IS extended** — Task 5, wiring point 4.
- **Anti-tautology:** every cue assertion resolves the target by `getByTestId("admin-current-share-link-url")`, never a container. Negative assertions carry a positive precondition in the same test — assert the attribute PRESENT before asserting it absent, or the row proves nothing. Task 6 is the executable proof that this held.
- **No `pnpm screenshot:help` locally.** This is an arm64 host; the committed baselines are x64-Linux bytes. If run by accident, `git restore public/help/screenshots/`.

---

## File Structure

**Production files modified:**

- `components/admin/showpage/ShareHub.tsx` — export `SHARE_LINK_FLASH_MS`; add `prevToken`/`flash` render-phase state AFTER `linkActive` (`components/admin/showpage/ShareHub.tsx:419`, a TDZ hazard if placed earlier); add the clear predicate; add the timer effect; add `key={token}` and the conditional attribute to the `<code>` at `components/admin/showpage/ShareHub.tsx:713-718`.
- `app/globals.css` — two `@keyframes` blocks plus the `[data-share-link-flash]` rule and its reduced-motion override, adjacent to the step3 flash block at `app/globals.css:833-852`.
- `DESIGN.md` — the constant with its owning module; both false halves of the `DESIGN.md:274` preamble; the cue note required by spec §3.7.

- `components/admin/showpage/ShareHub.tsx` — additionally gains `data-testid="admin-current-share-link-row"` on the row wrapper (Task 3), without which N4's per-element selector contract is unexecutable.
- **Comment-only edits (Sweep B).** These modify production files: `app/admin/show/[slug]/ShareTokenContext.tsx`, `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `components/admin/showpage/StatusStrip.tsx`, `components/admin/showpage/ShowReviewModalSkeleton.tsx`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx`. The skeleton was classified STALE in Sweep B but missing from this inventory until round 3.

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

### Sweep B — stale topology prose (K4): a COMMAND, a SCOPE, and a triage obligation

Three review rounds found this list incomplete — the plan named 7 sites, round 2 added 11, and running the query exhaustively returns **57 hits across 24 files**. Enumeration is not converging, so the list is not the obligation. The command is:

```
rg -n 'crew-URL surface|three consumers|header chip|card / chip|chip / crew|copy-link|copy link|T-COPY-FLUSH|share-link card' app components tests
```

**Scope — and why K4 does not reach the help tree (round-3 review, BLOCKING).** As written, K4 collided head-on with the no-copy-change contract: two hits are user-visible help prose, and `app/help/admin/per-show-panel/page.mdx:30` is genuinely stale — it says the Re-sync button sits "between the sync line and the copy-link button", and that button no longer exists. Marking it LEGITIMATE would be false; correcting it would change shipped user copy in a diff that promises not to.

The resolution is scope, not denial. **That staleness was created by the share-hub consolidation** (`docs/superpowers/specs/2026-07-20-share-hub-design.md:104` removed the strip copy-link), not by this diff, and it lives in a different medium with its own CI surface (help affordances, screenshots). So:

- **IN scope for K4:** stale claims about the crew-URL fan-out that THIS diff's deletions and rename create, plus stale in-code comments about the retired strip copy-link in source and test files. Code comments and test docs only.
- **OUT of scope:** `app/help/**` user-facing content. Pre-existing debt from a prior PR, filed as `BL-HELP-STRIP-COPYLINK-STALE` in Task 7 rather than silently passed over. Correcting it belongs with a help pass that can own the screenshot regeneration.

Task 1 triages EVERY in-scope hit as **STALE** (corrected) or **LEGITIMATE** (a copy affordance that still exists — the ShareHub Copy button — left alone, reason recorded). The triage record goes in the PR body; K4 is met when the record covers every in-scope hit, not when a named list is fixed.

Known STALE at plan time, verified: `app/admin/show/[slug]/ShareTokenContext.tsx:6-8` and `app/admin/show/[slug]/ShareTokenContext.tsx:72-74`; `app/admin/show/[slug]/RotateShareTokenButton.tsx:14-17` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:161-164`; `components/admin/showpage/StatusStrip.tsx:7-9`, `components/admin/showpage/StatusStrip.tsx:18-24`, `components/admin/showpage/StatusStrip.tsx:27`, `components/admin/showpage/StatusStrip.tsx:39`, `components/admin/showpage/StatusStrip.tsx:99`, `components/admin/showpage/StatusStrip.tsx:199`, `components/admin/showpage/StatusStrip.tsx:203`; `components/admin/showpage/ShowReviewModalSkeleton.tsx:123`; `tests/components/RotateShareTokenButton.test.tsx:4-6`; `tests/app/admin/rotateShareToken.test.tsx:9`, `tests/app/admin/rotateShareToken.test.tsx:10`, `tests/app/admin/rotateShareToken.test.tsx:73`; `tests/components/admin/showpage/statusStrip.test.tsx:5`, `tests/components/admin/showpage/statusStrip.test.tsx:373`; `tests/components/admin/showpage/publishedReviewModal.test.tsx:28`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:766`; `tests/components/admin/showpage/pageTransitions.test.tsx:59`; `tests/e2e/_statusStripToggleHarness.tsx:27`; `tests/e2e/_publishedReviewModalHarness.tsx:18`, `tests/e2e/_publishedReviewModalHarness.tsx:88`; `tests/e2e/_skeletonParityHarness.tsx:126`.

Two corrections to that list from round 3, both verified: the StatusStrip `T-COPY-FLUSH` hits are at `components/admin/showpage/StatusStrip.tsx:199` and `components/admin/showpage/StatusStrip.tsx:203`, not at line 196; and `tests/components/RotateShareTokenButton.test.tsx:71-73` is an `aria-describedby` test unrelated to topology — it is NOT a Sweep-B site.

### Sweep C — the singleton the backlog item mis-described

```
$ rg -c 'max-w-\[16rem\]' app components
app/admin/show/[slug]/ShareChip.tsx:1
```

One occurrence, in the file being deleted. The item's "the same magic appears elsewhere" premise is false.

---

## e2e harness-readiness checklist (mandatory, Task 5)

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

### Task 3 — The cue (§6.1 rule, N2-N5, N7)

Round 2 was right that the previous draft's "each bullet is test-then-minimal-change" was false: several steps are satisfied by an earlier step's minimal implementation, and one was explicitly admitted green. Claiming a red where none exists is the same defect the spec spent four rounds on. So each step is LABELLED for what it is, using the spec's taxonomy:

- **RED** — fails before its own implementation step.
- **GUARD** — green once the preceding RED steps land; it exists to reject a specific wrong implementation, which Task 6 proves by injecting one.

Written in order; one commit at the end.

- [ ] **RED** — rotate through the real two-tap confirm: the URL block carries `data-share-link-flash=""` (N2) and `document.querySelectorAll("[data-share-link-flash]")` has length exactly 1 (N3). Implement `prevToken`/`flash` plus the both-non-null bump.
- [ ] **RED** — present at `SHARE_LINK_FLASH_MS - 1`, absent at `SHARE_LINK_FLASH_MS`. Implement the timer effect. **Its cleanup lands here** (spec §3.2 writes the effect with `return () => clearTimeout(t)`), which is why the cleanup row below is a GUARD, not a RED.
- [ ] **RED** — element identity across an accepted change: the URL block DIFFERS; the Copy button, **the row wrapper**, and the popover panel are each the SAME object, resolved by their own selectors (N4 — the row was omitted from this assertion in the previous draft while its selector was added elsewhere, so a row replacement could violate the literal contract with nothing failing). Implement `key={token}` and add `data-testid="admin-current-share-link-row"` at `components/admin/showpage/ShareHub.tsx:712`.
- [ ] **RED** — branch 1, each cause: panel closed; token to null; **pure unpublish with a child held BUSY so the panel cannot auto-close** (`components/admin/showpage/ShareHub.tsx:490-495`), then busy clears (`components/admin/showpage/ShareHub.tsx:517-520`), then republish inside the window, asserting the target is PRESENT before asserting the attribute absent. Implement the `(!open || !linkActive)` predicate.
- [ ] **GUARD** — persistence: with a cue live, force unrelated re-renders (busy flip, banner mount) and assert the attribute PERSISTS (§6.1 branch 3). Green once the above land; rejects a "clear whenever the token did not change" implementation, injected in Task 6.
- [ ] **GUARD** — expiry identity: every named element including the URL block is the same object (N5). Green with `key={token}`; rejects `key={flash}`.
- [ ] **GUARD** — strictly-lower-epoch rotation leaves the URL unchanged and no attribute. Green throughout; rejects a cue keyed on the rotate event.
- [ ] **GUARD** — `vi.getTimerCount()` is greater than 0 with a cue live and exactly 0 after `unmount()`. Rejects a timer effect without cleanup. Idiom: `tests/devcapture/useDevCapture.test.tsx:350-352`.
- [ ] GREEN, full file. Commit `feat(admin): cue the crew-URL block when the share-token changes`.

### Task 4 — Contrast rows (§9.2 item 5) — REGRESSION PINS, not TDD

- [ ] These pass on arrival against already-compliant tokens; that is their purpose, and the spec classes them as pins. No red phase is claimed (plan-review finding 1).
- [ ] Add rows to `tests/styles/status-token-contrast.test.ts` for all five uncovered pairs: `accent-edge` against `accent-tint` (both themes), against `surface` (dark), against `surface-sunken` (both themes). Helper API verified present: `MODES`, `tokenIn`, `contrast`, `DOT_FLOOR`.
- [ ] Prove they are not vacuous by temporarily perturbing a token value and observing the red, then reverting. Record it in Task 6's matrix (the matrix task).
- [ ] Commit `test(styles): pin the flash ring contrast floors`.

### Task 5 — The live browser spec and its FOUR wiring points (§9.3)

**The bundling mechanism is NOT plain `pnpm dlx esbuild`.** Codex's plan review ran the probe and it fails on `node:crypto` and `node:async_hooks`, reached through the `"use server"` modules that `RotateShareTokenButton`, `PickerResetControl` and the dev-capture row pull in (plan-review finding 2, BLOCKING). That is an esbuild-versus-Next semantics gap, not a real client-bundle leak, and the repo already solves it BY CLASS:

- [ ] Build through the plugin builder pattern of `tests/e2e/_step3ReviewModalBundle.mjs`, whose header (`tests/e2e/_step3ReviewModalBundle.mjs:10-32`) documents exactly this failure: `useServerElision` replaces any module whose first statement is a `"use server"` directive with no-op exports, dropping its server-only subtree; `emptyNodeBuiltins` resolves node builtins to an empty CJS module so `import { createHash } from "node:crypto"` binds to `undefined` rather than erroring at RESOLVE time. Reuse it if it generalises; otherwise add a sibling builder with the same two plugins. Do NOT name individual offending paths — the whole point is closing the class.
- [ ] The entry file must supply what a bare mount lacks: `ShareTokenProvider` (`app/admin/show/[slug]/ShareTokenContext.tsx:83-85` throws without it), a `useRouter` stub for `app/admin/show/[slug]/RotateShareTokenButton.tsx:78` and `components/admin/ArchiveShowButton.tsx:97` (`tests/e2e/_nextNavigationStub.ts` exists), and any module-load guard the graph trips — the `HASH_FOR_LOG_PEPPER` guard is supplied by the SPEC, at `tests/e2e/skeletonBandParity.spec.ts:103`, not by its harness file (round-3 review). Round 3 confirmed the generalized elision plugins bundle and hydrate this graph WITHOUT that variable, so it is a pattern to know, not a step to copy.
- [ ] **Drive the token change through the production override seam, NOT the elided server action.** `useServerElision` replaces server actions with THROWING stubs (`tests/e2e/_step3ReviewModalBundle.mjs:54`), so a real Rotate confirm cannot update the provider and the restart assertion would be undrivable (round-2 review, HIGH). The seam already exists in production: `app/admin/show/[slug]/RotateShareTokenButton.tsx:80` reads `useDevActionOverride("rotateShareToken")` and calls `overrideRotate ?? rotateShareToken`. Mount `DevActionOverrideContext` (`components/admin/dev/actionOverrideContext.tsx:21`) supplying a fake that resolves `{ ok: true, new_share_token, new_epoch }`. The REAL two-tap confirm, the REAL provider gate and the REAL remount all run; only the network hop is substituted. Two successive rotations with different tokens give the two node replacements the restart assertion needs.
- [ ] **Render the PRODUCTION ANCESTRY, not a bare ShareHub** (§9.2 item 2; plan-review finding 3). The real chain is ShareHub inside `components/admin/showpage/StatusStrip.tsx:396-413`, inside the modal subheader at `components/admin/showpage/PublishedReviewModal.tsx:903-923`, under the panel's `PopoverHostContext.Provider` at `components/admin/review/ReviewModalShell.tsx:619-625` and `components/admin/review/ReviewModalShell.tsx:679-685`. A bare mount stays green against an ancestor-qualified rule that suppresses the cue only in production — adversary A18 exactly.
- [ ] Compile real `app/globals.css` through the Tailwind CLI with `@source` entries for ShareHub AND every ancestor whose classes participate, per `tests/e2e/hoverhelp-geometry.spec.ts:76` and `tests/e2e/hoverhelp-geometry.spec.ts:80-82`.
- [ ] Assertions per §9.2: both `background-color` AND `box-shadow`, in the motion and reduced-motion arms; restart via node REPLACEMENT with the attribute already present; exactly one element carrying the attribute (N3); no element in the panel with a resolved `animation-name` other than the cue's two.
- [ ] Wiring 1: the spec file. Wiring 2: the `testMatch` allow-list at `tests/e2e/standalone.config.ts:35`. Wiring 3: a dedicated workflow with `workflow_dispatch:`. Wiring 4: a `PATH_GATED` row in `tests/ci/_metaE2eWorkflowCoverage.test.ts` (fails by default for new dark specs, `tests/ci/_metaE2eWorkflowCoverage.test.ts:7`; precedent `tests/ci/_metaE2eWorkflowCoverage.test.ts:81`).
- [ ] **The workflow path filter is specified by GLOB, not by enumerating imports.** Three rounds enumerated a list and three rounds found it short — round 4 named `ShareLinkCopyButton`, `PickerResetControl`, the archive controls, dev-capture, `resolveOrigin`, `crewLinkMailto`, StatusStrip's graph, `ReviewModalShell`'s hooks and `PublishedReviewModal`'s value imports. The exercised tree is a whole subgraph and a per-file list will keep being wrong, so the filter covers the DIRECTORIES that subgraph lives in:

  - `components/admin/showpage/**` — ShareHub, StatusStrip, PublishedReviewModal, the skeleton
  - `components/admin/review/**` — ReviewModalShell and the popover host
  - `app/admin/show/[slug]/**` — the rotate driver, picker reset, copy button, token context, `resolveOrigin`, `crewLinkMailto`
  - `components/admin/dev/**` — the override context and dev-capture
  - `components/admin/HoverHelp.tsx`, `components/admin/ArchiveShowButton.tsx`, `components/admin/UnarchiveShowButton.tsx`, `lib/popover/position.ts` — the remaining cross-cutting imports at `components/admin/showpage/ShareHub.tsx:99-116`
  - `app/globals.css`, the spec, its entry file, the bundle builder, `tests/e2e/_nextNavigationStub.ts` and any other harness stub, `tests/e2e/standalone.config.ts`, the workflow itself
  - runtime inputs: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `tsconfig.json`, `.github/actions/setup/**`

  Globs cost extra job runs on unrelated edits in those directories. That is the correct trade: this job exists to prove a browser behaviour that a source scan cannot, and a skipped run is a silent hole. Model: `.github/workflows/hoverhelp-geometry-e2e.yml:15-30` and `.github/workflows/phantom-gap-e2e.yml:45-47`, which take the same subtree-glob approach for the same reason.
- [ ] Commit `test(admin): add the real-browser share-link cue spec`.

### Task 6 — The executable adversary matrix (spec §9.0; the oracle resolution)

- [ ] **Commit everything first.** Reverting an injected mutation with `git checkout --` discards uncommitted work in that same file.
- [ ] **Scope of "row":** a row is one assertion in any test this milestone ADDS OR REWORKS — Tasks 1 through 5. The previous draft excluded Tasks 1 and 4, which made two adversaries unrejectable and contradicted the every-adversary rule (round-2 review, BLOCKING): **A21** (a wrong token rendered, or Copy writing a stale one) is rejected ONLY by Task 1's preserved exact URL and clipboard assertions, and **A22** (a token retune below the ring's contrast floor) ONLY by Task 4's contrast pins. The claim that the pins reject no adversary was simply false for A22.
- [ ] **Exempt, and never deleted for failing to red:** the pure completion GUARDS — Task 1's orphan scan and the Sweep-B triage record. They assert the absence of deleted code and the correction of stale prose; no cue mutation can red them, and K1-K4 require them regardless.
- [ ] For each adversary in spec §9.1.1, build it, run the cue suite, record which rows red.
- [ ] Every adversary must red at least one row. Every row must red for at least one adversary. A row that reds for nothing is strengthened or deleted before review.
- [ ] **Write the matrix to docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md** (created by this task) — a tracked artifact, so the mandated commit has content (plan-review finding 8; every mutation is reverted, so the tree would otherwise be clean). Reproduce it in the PR body.
- [ ] Commit `test(admin): record the share-link cue adversary matrix`.

### Task 7 — Docs and backlog (K5-K7)

- [ ] `DESIGN.md`: the constant with its owning module; BOTH false halves of the `DESIGN.md:274` preamble (single-file ownership, and "never produce a painted px" — false for both highlight durations); the §3.7 cue note with its measured ratios.
- [ ] `BACKLOG.md`: remove the whole section; file `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`; file `BL-HELP-STRIP-COPYLINK-STALE` covering BOTH stale help claims — `app/help/admin/per-show-panel/page.mdx:7` (lists the copy-link among the status strip's contents) and `app/help/admin/per-show-panel/page.mdx:30` (places Re-sync beside that button). Naming only one would let a later closure repair it and leave the other (round-4 review, LOW) — out of scope here because correcting it changes shipped user copy and pulls in the help screenshot surface.
- [ ] `BACKLOG-archive.md`: three resolutions, recording that `max-w-[16rem]` was a singleton and that the focus item was superseded, so neither is re-derived later.
- [ ] Commit `docs: close the crew-page share-link chrome backlog items`.

### Task 8 — Gates

- [ ] `/impeccable critique` and `/impeccable audit` on the diff, EACH preceded by its canonical v3 setup: context.mjs context load (PRODUCT.md + DESIGN.md), then the register reference read (the brand or product register), per `AGENTS.md:20`. P0/P1 fixed or `DEFERRED.md`-logged; findings and dispositions recorded in the PR body.
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
