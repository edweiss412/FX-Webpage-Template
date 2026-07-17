# Spec — Warning-control site scoping (a11y) + non-blocking copy requalification

**Date:** 2026-07-17
**Slug:** `use-raw-control-site-a11y-copy`
**Branch:** `fix/use-raw-control-site-a11y-copy`
**Class:** UI polish — accessibility (P2) + copy (P2). No DB, no advisory locks, no `app/api/**`.
**Backlog:** `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`, `BL-WIZARD-WARNINGS-COPY-QUALIFIER`
**Deferral ledger:** `DEFERRED.md` USE-RAW-FULL-LIST-2, USE-RAW-FULL-LIST-3

---

## 1. Problem

PR #399 (2026-07-16) made the wizard Step-3 `WarningsBreakdown` a complete actionable list of use-raw / recognize-role controls, kept alongside the capped `SectionFlagCallout` preview. Two impeccable dual-gate findings were deferred:

- **USE-RAW-FULL-LIST-2 [P2, a11y].** For a warning appearing in BOTH its section's callout preview AND the Parse-warnings list, the two mounted control instances emit **identical `data-testid` values** (`use-raw-control`, `role-recognize-control`, `use-raw-toggle-*`, `role-recognize-*`) and the use-raw radiogroup carries an **identical generic `aria-label`** (`"Which reading crew pages use"`, `components/admin/UseRawControl.tsx:448`). Screen-reader users hear the same unqualified group with no way to tell which warning it belongs to; unscoped `getByTestId` queries would multi-match across the two sites. All in-repo queries are container-scoped today, so nothing is broken — this is a latent a11y/tooling gap, not an active bug.

- **USE-RAW-FULL-LIST-3 [P2, copy].** The line `"These are informational and don't block publishing."` (`components/admin/wizard/step3ReviewSections.tsx:2344`) now headlines rows whose controls can rewrite crew-visible values (use-raw) or grant financial access (recognize-role). The line is still factually true — warnings never block publishing — but "informational" undersells that some rows are consequential and actionable.

## 2. Goal / non-goal

**Goal.** Give each mounted control instance a caller-declared **site** so its testids are unique per render site, and qualify the use-raw radiogroup + recognize-role trigger accessible names with the warning's own subject. Requalify the non-blocking copy line so "informational" no longer mislabels actionable rows.

**Non-goal.** No change to the keep-both render topology (USE-RAW-FULL-LIST-1 is the ratified spec contract — the callout preview and full list both stay; `DEFERRED.md` §USE-RAW-FULL-LIST-1). No change to the control state machines, server actions, `router.refresh()` timing (§8.1), decision-matching (`findUseRawDecision`), or `stableWarningKeys` identity. No publish-gate change. This spec touches **testids, accessible names, and one copy string only** — plus the tests and spec-reference quotes that track them.

## 3. Resolved decisions

1. **`site` is an optional, additive discriminator, orthogonal to `surface`.** A `surface` (`show` | `wizard`) already exists on both boundaries to pick the server action. `site` is separate: one surface (wizard) hosts two sites (callout + list). New closed union `WarningControlSite = "callout" | "list" | "showpage"`.
2. **Optional; absent = testids byte-identical.** When `site` is absent (standalone/unit mounts that render the control directly), every **testid** is emitted exactly as today (`use-raw-control`, not `use-raw-control-callout`); only a present `site` appends `-${site}`. The accessible-name qualification (§4.4) is INDEPENDENT of `site` and applies in every mount, so a no-site render's ARIA output does change (the radiogroup/trigger accessible name gains its kind/token subject). This is safe for the existing unit suites (`tests/components/UseRawControl.test.tsx`, `tests/components/RoleRecognizeControl.test.tsx`) because **no existing assertion checks these aria strings** (verified: no test greps `"Which reading"` or the trigger `aria-label`) — their testid/behavior assertions stay green unchanged; the aria change is covered by NEW assertions added in §10.1–10.2.
3. **Every leaf testid the control emits is suffixed** when `site` is present — not just the root container — so cross-site multi-match is resolved for the inner `use-raw-toggle-*` / `role-recognize-*` elements the finding names, not only the container.
4. **Accessible-name qualification uses the warning's own subject, not a threaded title** (the approach the user chose over full `reviewWarningTitle` plumbing):
   - use-raw radiogroup: qualified by `resolution.parsed.kind` (`rooms` | `hotels` | `dates`), which the control already computes in-scope.
   - recognize-role trigger: qualified by the `roleToken` the control already receives.
   No new prop is threaded from call sites for the accessible name; only `site` is threaded (for testids).
5. **Copy stays non-blocking-true.** New line keeps a literal `don't block publishing` clause (so existing regex assertions and the ratified non-blocking contract hold) and drops "informational," pointing at the optional fixes below.
6. **Label-in-name preserved (WCAG 2.5.3).** Any `aria-label` added to a control with visible text contains that visible text verbatim as a substring.

## 4. The `WarningControlSite` contract

New type module `components/admin/warningControlSite.ts`:

```ts
export type WarningControlSite = "callout" | "list" | "showpage";
```

Both controls accept an optional `site?: WarningControlSite`; both boundaries accept an optional `site?: WarningControlSite` and forward it. A tiny in-file helper in each control builds testids:

```ts
const tid = (base: string) => (site ? `${base}-${site}` : base);
```

### 4.1 Guard conditions for `site`

| `site` value | Testid behavior | Accessible-name behavior |
| --- | --- | --- |
| absent (`undefined`) | bare base testids (today's output, unchanged) | kind/token qualification STILL applies (independent of `site`) |
| `"callout"` / `"list"` / `"showpage"` | every leaf testid suffixed `-${site}` | same as above |

`site` never affects rendering, visual output, state, or which action fires — testid strings only. An unexpected string cannot occur (closed union, TS-enforced); if one did, `tid()` would suffix it verbatim (fail-soft, no crash).

## 5. Site assignments (every mount site, cited)

| Mount | File:line (origin/main) | `site` passed |
| --- | --- | --- |
| Wizard section flag-callout preview — use-raw | `components/admin/wizard/step3ReviewSections.tsx:611` | `"callout"` |
| Wizard section flag-callout preview — recognize-role | `step3ReviewSections.tsx:623` | `"callout"` |
| Wizard Parse-warnings full list — use-raw | `step3ReviewSections.tsx:2429` | `"list"` |
| Wizard Parse-warnings full list — recognize-role | `step3ReviewSections.tsx:2438` | `"list"` |
| Live per-show page — use-raw | `components/admin/showpage/sectionWarningExtras.tsx:57` | `"showpage"` |
| Live per-show page — recognize-role | `sectionWarningExtras.tsx:64` | `"showpage"` |

The live per-show page never renders a callout+list pair for one warning (single site per warning there), but it still gets `"showpage"` so its testids never collide with a future co-mount and so the a11y qualification is uniform. Standalone/test host mounts that render the boundary/control without a `site` keep bare testids.

## 6. UseRawControl changes (`components/admin/UseRawControl.tsx`)

Add `site?: WarningControlSite` to the prop type. Add `const tid = (base) => site ? ...`.

### 6.1 Testid map (leaf → suffixed via `tid()`)

`use-raw-control` (all three render branches: legacy-unavailable `:392`, disabled `:403`, active `:445`), `use-raw-toggle-off` (`:456`), `use-raw-parsed` (`:462`), `use-raw-toggle-on` (`:486`), `use-raw-raw` (`:491`), `use-raw-pending-note` (`:514`, `:520`), `use-raw-error` (`:534`), `use-raw-retry` (`:541`). Every one wrapped in `tid(...)`.

### 6.2 Radiogroup accessible name (`:447-448`)

Replace the constant `aria-label="Which reading crew pages use"` with a kind-qualified label derived from the already-narrowed `resolution.parsed.kind`:

| kind | aria-label |
| --- | --- |
| `rooms` | `Which reading crew pages use for the room split` |
| `hotels` | `Which reading crew pages use for the hotel guest split` |
| `dates` | `Which reading crew pages use for the show dates` |

The radiogroup only renders in resolvable states (after the guard-state early returns), so `resolution` is present + `resolvable:true` and `.parsed.kind` is a live closed union — no guard needed. `kind` is exhaustive; a new kind is a compile error at the map.

### 6.3 Guard-state branches

`legacy-unavailable` (`:392`) and `disabled` (`:403`) render a `<p data-testid="use-raw-control">` with no radiogroup and no aria-label — they get the `tid()` suffix only (no accessible-name change; they carry no interactive group).

## 7. RoleRecognizeControl changes (`components/admin/RoleRecognizeControl.tsx`)

Add `site?: WarningControlSite`; add `tid()`.

### 7.1 Testid map

`role-recognize-control` (`:170`, `:190`, `:237`, `:251`), `role-recognize-trigger` (`:173`), `role-recognize-saved` (`:202`), `role-recognize-change` (`:221`), `role-recognize-stale`/`role-recognize-conflict` (`:239`), `role-recognize-panel` (`:253`), `role-recognize-check-${flag}` (`:272`, `:289`), `role-recognize-none-helper` (`:309`), `role-recognize-error` (`:318`), `role-recognize-save` (`:329`), `role-recognize-cancel` (`:339`). Every one via `tid()`. The `${uid}-fin` / `${uid}-fin-cap` DOM `id`s (`:289-300`) are `useId`-based and already unique per instance — left unchanged.

### 7.2 Trigger accessible name (`:171-181`)

The collapsed trigger's visible text is `COPY.TRIGGER_LABEL`. Add an `aria-label` that qualifies it with the token while containing the visible text verbatim (WCAG 2.5.3). New copy helper in `components/admin/roleRecognizeCopy.ts`:

```ts
export const triggerAriaLabel = (token: string) => `${TRIGGER_LABEL}: “${token}”`;
```

Applied only when a token is present (the control already early-returns on a blank token, `:117-118`, so the trigger always has one). Guard: an empty/whitespace token cannot reach the trigger.

## 8. Boundary changes

`UseRawControlBoundary.tsx` and `RoleRecognizeControlBoundary.tsx`: add optional `site?: WarningControlSite` to the props (alongside, not inside, the `SurfaceProps` union) and forward it to the control (`<UseRawControl ... site={props.site} />` / `<RoleRecognizeControl ... site={props.site} />`). No action/logic change. Absent `site` forwards `undefined` (bare testids).

## 9. Copy requalification (`step3ReviewSections.tsx:2344` + doc)

- **Old:** `These are informational and don't block publishing.`
- **New:** `These warnings don't block publishing. Some include an optional fix you can apply below.`

Guarantees: retains a literal `don't block publishing` clause (existing assertions `tests/components/step3SheetCard.test.tsx:645`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:680,704` match `/don.t block publishing/i` — still pass); drops "informational"; names the actionable rows.

The `-nonblocking` testid (`:2341`) and the surrounding structure are unchanged. The JSDoc at `:2296-2300` describing "One explicit line states that warnings are informational" is updated to match the new wording.

**Spec-reference sync (copy discipline).** The old string is quoted as evidence of the non-blocking contract in two prior specs; the non-blocking contract is unchanged, only the framing. Update the parenthetical quotes in the same PR:
- `docs/superpowers/specs/2026-07-07-flow3-correction-loop-clarity.md:46`
- `docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-redesign.md:94,422`

Each gets a `(requalified 2026-07-17 → "…optional fix you can apply below."; non-blocking contract unchanged)` note appended to its quote — the historical claim stays true, the current wording is discoverable. These are prior specs, not the master spec (§12.4) — no `x1-catalog` gate involved.

### 9.1 Ledger resolution (this change closes the deferrals)

Because this PR IS the fix for both deferred findings, the live ledgers must move from "deferred" to "resolved" in the same PR — leaving them describing an unresolved gap (or, for `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`, quoting a `warning-title-qualified` fix this spec deliberately supersedes with kind/token qualification) would be stale.

- `DEFERRED.md` USE-RAW-FULL-LIST-2 (currently `:608`) and USE-RAW-FULL-LIST-3 (currently `:614`): append a `**Resolution (2026-07-17):**` line to each pointing at this spec + PR (mirrors the existing resolution-line convention in the file, e.g. the §555 use-raw-full-list resolution).
- `BACKLOG.md` `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y` (currently `:77`) and `BL-WIZARD-WARNINGS-COPY-QUALIFIER` (currently `:83`): mark each `✅ RESOLVED` with the branch/spec, and correct the `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y` prose so it no longer claims the fix is `warning-title-qualified aria-labels` — the shipped approach is **site-scoped testids + kind/token-qualified accessible names** (the user-ratified approach for this diff). Note that leaf-testid suffixing is applied to ALL leaf testids, not only the container, and that all in-repo queries were container-scoped so no query broke.

Line numbers above are the current origin/main positions; the implementer re-greps at edit time (the ledgers are append-only churny files). These edits land in the copy/ledger commit, not a separate cleanup PR.

## 10. Test plan (anti-tautology)

### 10.1 Unit — `tests/components/UseRawControl.test.tsx` (extend)

- **Every leaf suffixed, present (exhaustive, implementation-agnostic):** render with `site="list"` in each state that exposes a distinct leaf set — (a) active/resolvable (exposes `use-raw-control`, `use-raw-toggle-off`, `use-raw-toggle-on`, `use-raw-parsed`, `use-raw-raw`), (b) an `apply-pending` decision (exposes `use-raw-pending-note`), (c) post-failed-toggle (exposes `use-raw-error`, `use-raw-retry`) — and in EACH, assert that **every** node matching `[data-testid]` inside the control's root ends with `-list` and that NO bare base testid resolves (`queryByTestId("use-raw-toggle-off")` etc. are null). Implemented as a loop over `root.querySelectorAll("[data-testid]")` asserting each `getAttribute("data-testid").endsWith("-list")` — so an implementation that suffixes only the root container (or misses any single leaf) FAILS. This is the assertion that pins the §6.1 "every leaf" contract; a root-only test would be tautologically satisfiable. Failure caught: partial/root-only suffixing.
- **Bare testid, absent:** render with no `site` in the same states; assert every `[data-testid]` inside the control equals its bare base (none ends with `-list`) — `getByTestId("use-raw-control")`, `getByTestId("use-raw-toggle-off")`, etc. resolve and no `*-list` node exists. Failure caught: an always-on suffix that would break every unit mount.
- **Kind-qualified aria (data-driven):** for each of a rooms / hotels / dates fixture, assert the radiogroup's `aria-label` equals the row's expected string derived from a `{kind → label}` map defined IN the test (not imported from source — otherwise tautological). Failure caught: a generic or wrong-kind aria-label.

### 10.2 Unit — `tests/components/RoleRecognizeControl.test.tsx` (extend)

- **Every leaf suffixed, present (exhaustive):** render/drive with `site="showpage"` through each phase that exposes a distinct leaf set — collapsed (`role-recognize-control`, `role-recognize-trigger`), expanded panel/idle (`role-recognize-panel`, `role-recognize-check-${flag}` ×4, `role-recognize-none-helper`, `role-recognize-save`, `role-recognize-cancel`), post-error (`role-recognize-error`), saved (`role-recognize-saved`, `role-recognize-change`), and the stale/conflict notices (`role-recognize-stale` / `role-recognize-conflict`) — asserting in EACH that every `[data-testid]` inside the control root ends with `-showpage`. Same `querySelectorAll` loop as 10.1; catches root-only suffixing. Mirror the absent case (no suffix anywhere).
- **Trigger aria contains token AND the RENDERED visible label:** read the trigger button's own rendered visible text at test time — `trigger.textContent` with the `aria-hidden` chevron stripped (query the chevron `<span aria-hidden>` and subtract, or read the first text node) — and assert the trigger's `aria-label` (a) contains the raw `roleToken` fixture value AND (b) contains that rendered visible string as a substring. Deliberately does NOT import `COPY.TRIGGER_LABEL` — deriving the expected label from the same constant the component uses would be tautological (both sides move together); reading the rendered DOM proves label-in-name against what a user actually sees, catching a future drift where the visible text changes but the aria-label doesn't. Failure caught: an aria-label that drops the visible text (WCAG 2.5.3) or omits the token.

### 10.3 Integration — `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (migrate)

- Callout host queries → `-callout` leaf testids; list host queries → `-list` leaf testids (mechanical suffix on the existing `within(row)/within(callout)` scoped queries).
- **New cross-site distinctness test:** mount a single warning into BOTH a callout host and a list host (existing `calloutHost` + list `q` harnesses) and assert the two `use-raw-control-callout` / `use-raw-control-list` testids are BOTH present and distinct — the concrete failure the finding names (two identical ids). Assert against the two host renders, not one container that holds both.

### 10.4 Integration — `tests/components/admin/showpage/sectionWarningControls.test.tsx` (migrate)

- The `within(sectionEl(...))` queries for `use-raw-control` / `role-recognize-control` become `-showpage` (mechanical). The section-scoping anti-tautology posture (comment `:20`) is preserved.

### 10.5 Copy

- `warningsBreakdownControls.test.tsx` (or the existing `step3ReviewSections.test.tsx` warnings test): assert the requalified line renders — contains `don't block publishing`, does NOT contain `informational`, and contains `optional fix`. Scope to the `-warnings-nonblocking` testid node so the assertion can't pass off some other panel's text.

## 11. Invariants & inventories

- **Meta-test inventory:** no structural meta-test is created or extended. No new Supabase call boundary, admin-alert code, advisory-lock surface, sentinel-hiding surface, or email-normalization site. Declared: none applies (testid/aria/copy-only diff).
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched.
- **Dimensional invariants:** N/A — no fixed-dimension parent, no flex/grid dimension relationship changes. No layout-dimensions task.
- **Transition inventory:** N/A — no new visual state or animation; the control state machines and their existing transitions (`role-recognize` pop-in, use-raw pending/error) are untouched. No transition-audit task.
- **No-raw-error-codes (invariant 5):** unchanged — no code string is rendered; aria strings are static English.
- **UI quality gate (invariant 8):** applies — the diff touches `components/**`. `/impeccable critique` + `/impeccable audit` run on the diff before cross-model review; P0/P1 fixed or deferred.

## 12. Out of scope

- Demoting the callout to a pure preview (USE-RAW-FULL-LIST-1 / `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`) — ratified keep-both stands.
- Within-site multi-warning testid collisions (two different in-scope warnings inside one callout) — pre-existing, not raised by finding 2, and callouts cap at 3 entries with typically ≤1 in-scope use-raw warning.
- Any change to `reviewWarningTitle`, `findUseRawDecision`, `stableWarningKeys`, or server actions.
