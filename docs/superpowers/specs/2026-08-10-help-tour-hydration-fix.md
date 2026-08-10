# /help/tour hydration-mismatch fix + help-pages CI promotion

**Date:** 2026-08-10 · **Branch:** `fix/help-tour-hydration` · **Closes:** `BL-HELP-TOUR-HYDRATION-MISMATCH` (BACKLOG.md)
**Class:** app defect (UI surface, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The fix is a formatting normalization of `app/help/tour/page.mdx`, not a rewrite.** Copy, link targets, aria-labels, and classNames are byte-identical after the change; only JSX text-child line placement changes. Any finding proposing copy or layout changes is out of scope.
- **The CI promotion rides in the same arc.** BACKLOG.md (`BL-HELP-TOUR-HYDRATION-MISMATCH`, "Closing this unblocks a one-line follow-up") names the allowlist-row deletion + workflow wiring as the un-defer payload; folding it here is the ratified disposition, not scope creep.
- **No new test files.** The red test already exists: `tests/e2e/help-pages.spec.ts` asserts zero page errors per `/help/*` route and currently fails on `/help/tour` (probed 2026-08-09, both server postures, per the backlog entry). Green is the same suite passing. A bespoke MDX-compile unit guard was considered and rejected (YAGNI: the e2e page-error assertion is the durable guard once promoted to CI).
- **The backlog entry's causal guess is superseded by the probe below.** The entry hypothesized column-0 `<a>` elements being wrapped in `<p>`. The confirmed mechanism is different (text children on their own lines inside JSX flow elements are parsed as markdown paragraphs). Do not relitigate the old hypothesis.
- **Impeccable dual gate owed** (`app/help/tour/page.mdx` is a UI surface under AGENTS.md invariant 8). Expected visual delta is nil (§6); the gate verifies that.

## 2. Problem

`/help/tour` throws "Hydration failed because the server rendered HTML didn't match the client" plus twelve further page errors on every visit, under `BASELINE_SERVER_ONLY=1 pnpm dev` and `pnpm build && pnpm start` alike (probe transcript in the BACKLOG.md entry, 2026-08-09). Every other `/help/*` route passes the identical assertions. Because of this, `tests/e2e/help-pages.spec.ts` is held out of CI: it carries the `UNSEEN` allowlist row in `tests/ci/_metaE2eWorkflowCoverage.test.ts` (`"tests/e2e/help-pages.spec.ts": UNSEEN`) and is deliberately absent from `.github/workflows/app-e2e.yml`'s run step (the workflow's own header comment names this backlog row as the blocker).

## 3. Root cause — CONFIRMED by compile probe, 2026-08-10

`app/help/tour/page.mdx` contains six link cards across three grids. Three of the six were at some point reformatted (prettier-style: multi-line attributes, each text child on its own line) — the "Review queues" card (`app/help/tour/page.mdx:18`), the "Preview as crew" card (`app/help/tour/page.mdx:65`), and the "Onboarding wizard" card (`app/help/tour/page.mdx:101`). The other three keep the compact style: single-line attributes, text children inline with their tags.

MDX parses the children of a JSX flow element as markdown **flow** content. A text child sitting on its own line becomes a markdown paragraph and compiles to `<_components.p>` — nested inside whatever JSX element holds it. Compile probe (`@mdx-js/mdx` `compile`, `jsx: true`, run against the live file 2026-08-10) shows, for each of the three reformatted cards, output of the shape:

```jsx
<p className="text-text leading-relaxed mb-3"><_components.p>{"Most new sheets…"}</_components.p></p>
<span className="text-xs …"><_components.p>{"When something needs you"}</_components.p></span>
```

`<p>` inside `<p>` and `<p>` inside `<span>` are invalid HTML nesting — one of the named causes in React's own mismatch message. The browser's parser restructures the server HTML (closing the outer `<p>` early), the client render doesn't match, hydration fails, and React re-renders client-side. The three compact cards compile to plain text children and are unaffected.

Note on probe fidelity: the probe used raw `@mdx-js/mdx` while the app compiles through `@next/mdx` with `remark-gfm` (`next.config.ts:2`, `next.config.ts:29`). `remark-gfm` adds table/strikethrough/autolink syntax and does not alter paragraph formation inside JSX flow elements, so the mechanism carries over; the e2e red→green is the end-to-end confirmation on the real pipeline.

## 4. Fix

Reformat the three expanded cards to the exact style of their compact siblings, in place:

- attributes on one line;
- every text child inline between its opening and closing tag on a single line (`<p className="…">The text…</p>`), so MDX emits it as a plain JSX text child instead of a markdown paragraph.

No character of user-visible copy, no href, no aria-label, no className changes. The diff is whitespace/line-structure only. (Equivalent alternative — wrapping text children in `{"…"}` expressions — rejected: it diverges from the sibling style instead of converging on it.)

Acceptance for this section: recompiling the fixed file with the §3 probe yields exactly **one** `_components.p` in the whole module (the legitimate intro paragraph, `app/help/tour/page.mdx:3`), and none nested inside a JSX element.

## 5. CI promotion (the unblocked follow-up)

1. Delete the `"tests/e2e/help-pages.spec.ts": UNSEEN` row from the allowlist in `tests/ci/_metaE2eWorkflowCoverage.test.ts` (the meta-test then requires the spec to be wired, fail-by-default).
2. Add `tests/e2e/help-pages.spec.ts` to the run step of `.github/workflows/app-e2e.yml` (the `pnpm exec playwright test …` list at the `run:` line, same projects/flags as the existing entries).
3. Update the two header comments in `app-e2e.yml` that name this spec as blocked (top-of-file comment and the "help-pages.spec.ts is deliberately NOT here" block) — they become stale the moment the row lands.
4. The BACKLOG.md entry graduates (archive per ledger convention; the IN PROGRESS marker comes off in the PR's last commit per invariant 12).

## 6. Verification

- **Red (exists today):** `BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/help-pages.spec.ts --project=mobile-safari` — fails: `/help/tour: page errors observed` (13 entries). This is the pre-existing failing case; the fix task writes no new test (invariant-1 shape: the failing test predates the fix).
- **Green:** same command passes; run the full spec file (all 14 routes, both projects) to confirm no sibling route regressed.
- **Compile probe:** §4's one-`_components.p` assertion, run ad hoc (not committed — the e2e page-error assertion is the durable guard).
- **Visual delta:** none intended. Pre-fix, users already see the client-re-rendered (correct) DOM after the hydration flash; post-fix the server HTML is identical to it. Impeccable critique + audit dual gate on the diff verifies (invariant 8).
- **CI:** real `app-e2e.yml` green on the PR (local-passes-CI-fails is its own bug class — AGENTS.md cross-cutting discipline).

## 7. Documented limits

- The other eleven `.mdx` files under `app/help/` were not audited for the same latent shape; only `/help/tour` fails the live page-error assertion today, and `help-pages.spec.ts` asserts zero page errors on **all fourteen** routes, so any sibling instance that ever manifests is caught by the same promoted gate. A repo-wide MDX formatting lint is out of scope (no second live instance; filing bar requires probe evidence).

## Dimensional Invariants

None. The diff changes JSX line structure only; no fixed-height/width parent, no flex/grid child relationship, no class or style is added, removed, or altered. The rendered card grid keeps its existing classes byte-for-byte (AC-2).

## Transition Inventory

None. The page is static content with a single visual state; the fix adds no state, no conditional render, no animation. The only behavioral change is the removal of the failed-hydration client re-render, which is not an authored transition.

## 8. Acceptance criteria

- **AC-1:** `/help/tour` renders with zero page errors under both server postures (e2e assertion green, both Playwright projects).
- **AC-2:** `app/help/tour/page.mdx` copy, hrefs, aria-labels, and classNames are byte-identical to before (verifiable by diffing the extracted strings).
- **AC-3:** `help-pages.spec.ts` runs in `app-e2e.yml` on pull_request; its allowlist row is gone; `tests/ci/_metaE2eWorkflowCoverage.test.ts` passes.
- **AC-4:** No stale comment in `app-e2e.yml` still names this spec as blocked.
- **AC-5:** Impeccable critique + audit pass on the diff (P0/P1 fixed or DEFERRED.md-logged).

impeccable-gate: pending — critique + audit due at implementation close-out (UI surface: app/help/tour/page.mdx)
