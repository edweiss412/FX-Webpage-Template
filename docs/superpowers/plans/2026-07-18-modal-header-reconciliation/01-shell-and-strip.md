# Tasks 1–3 — Shell slot, prop deletions, band mount

Spec references (`§n`) point at `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md`. All paths are relative to the worktree root; run all commands from the worktree root.

> **Rule 1 (no known-red commits).** Every task below ends with the **FULL suite green** — `pnpm test && pnpm typecheck && pnpm lint`, plus every Playwright suite the task touches. A task that breaks an existing spec updates that spec **in the same commit**. There is no "fixed in a later task" state in this plan.

---

## Task 1: `ReviewModalShell` — optional `subHeader` slot + Step 3 baseline fixture (§6.1, §11.2)

**Failure mode caught:** the new shell slot leaks a wrapper, seam, or empty band into Step 3 — the one consumer that must be provably unchanged — and nobody notices because the only available baseline was captured from the post-change tree.

**Files:**
- Modify: `components/admin/review/ReviewModalShell.tsx` (props type `:54-71`; render after `</header>`, mirroring the `footer` idiom at `:449-456`)
- Create: `scripts/captureStep3HeaderBaseline.ts` (committed generator — reproducibility, §11.2)
- Create: `tests/components/admin/review/__fixtures__/step3-header-baseline.html`
- Modify/create: `tests/components/admin/review/reviewModalShell.test.tsx`

**Breaks nothing.** Additive optional prop. Step 3 suites must pass **unmodified** — that is this task's acceptance signal.

**Interface produced:**
```ts
/** Optional band rendered BETWEEN header and body, with its own bottom seam.
 *  Omitted → no element at all. Type is deliberately narrower than ReactNode:
 *  `0` / `""` must be a COMPILE ERROR, not a silently-omitted band.
 *  `| undefined` is EXPLICIT — this repo sets exactOptionalPropertyTypes (tsconfig.json:9). */
subHeader?: ReactElement | false | null | undefined;
```

**Two artifacts, two different TDD statuses** (§11.2 — restated so a reviewer does not read a green-on-arrival file as a post-hoc test):

| Artifact | Kind | Red phase? |
| --- | --- | --- |
| `step3-header-baseline.html` + its generator script | **Setup data**, not a test | **No — and none is expected** |
| T-SUBHEADER-SLOT | Test | **YES — this task's red.** The prop does not exist on the pre-change tree, so the band assertion cannot resolve |
| T-SUBHEADER-FALSEY | Test | **YES** — same reason |
| T-STEP3-INVARIANT | Test | **No — declared.** A regression guard riding along, green before and after by design |

- [ ] **Step 1: generate the baseline ON THE PRE-CHANGE TREE.** Write `scripts/captureStep3HeaderBaseline.ts`: render `Step3ReviewModal` from a FIXED fixture, read `header.innerHTML`, normalize React ids, write the fixture file. Run it now, before touching `ReviewModalShell.tsx`.
  - **Id normalization is mandatory and lives in BOTH the generator and the test.** The Step 3 header contains `useId()` output (`h2Id`, wired to `id` and the shell's `aria-labelledby`). Adding the shell's conditional branch can perturb `useId` values while the header is visually identical. Replace `:r…:`-style tokens — and any `id` / `for` / `aria-labelledby` / `aria-describedby` value containing one — with a stable placeholder. The committed fixture must be id-free.
  - Do NOT use `toMatchSnapshot` or any self-updating format; a `-u` run would absorb a real regression.
- [ ] **Step 2: write the three tests.**
  - **T-SUBHEADER-SLOT:** `subHeader` provided → an element with `data-testid={`${testIdBase}-subheader`}` exists, sits between the header wrapper and the body in DOM order, and carries `relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2`. `subHeader` omitted → `queryByTestId(...)` is `null`.
  - **T-SUBHEADER-FALSEY:** `subHeader={false}` → NO band element (gate on truthiness, **not** `!= null` — `false`/`""`/`0` are all valid `ReactNode`s that a `!= null` gate would render an empty bordered seam for; the existing `footer` gate at `:449` uses `!= null` and is pre-existing/out-of-scope — do not copy it). Plus a `@ts-expect-error` assertion that `subHeader={0}` does not compile — **`pnpm typecheck` is the enforcing gate, since vitest strips types.**
  - **T-STEP3-INVARIANT:** two SCOPED assertions, NOT a whole-panel snapshot — (a) the rendered Step 3 modal contains zero `[data-testid$="-subheader"]` elements; (b) the Step 3 `<header>` subtree's normalized `innerHTML` equals the committed fixture. Scoping is the point: a whole-panel snapshot fails on the shell's intentional new `null`-rendering branch, and the reflex response is to loosen or delete the test.
- [ ] **Step 3: run — T-SUBHEADER-SLOT and T-SUBHEADER-FALSEY FAIL** (prop does not exist), T-STEP3-INVARIANT PASSES.
- [ ] **Step 4: implement.** Add the prop with the doc comment above verbatim; render immediately after `</header>`:
  ```tsx
  {subHeader ? (
    <div
      data-testid={`${testIdBase}-subheader`}
      className="relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2"
    >
      {subHeader}
    </div>
  ) : null}
  ```
  - **The band is NOT a flex container** — deliberate (§6.1). If it were `flex items-center` and `StatusStrip` stayed a plain `<div>`, the strip would shrink-wrap as a flex item and `ml-auto` on the copy button would flush to the strip's own edge, not the band's. The band supplies chrome only; the strip's root supplies the row.
  - **`relative` is load-bearing, not decorative.** It is the positioned ancestor for the publish toggle's popover AND the relocated Re-sync overlay (§6.7). Omitting it does not fail loudly — `absolute inset-x-0 top-full` silently resolves against the panel (itself `relative`) and the overlay lands below the entire modal.
- [ ] **Step 5: FULL SUITE GREEN.** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`. Confirm zero edits to any `tests/components/admin/wizard/*` file.
- [ ] **Step 6: commit** — fixture, generator, red test and implementation land TOGETHER. Committing the fixture alone first would produce a green, test-free commit, which invariant 1 forbids.
  `feat(review): optional subHeader band slot on ReviewModalShell`

---

## Task 2: `StatusStrip` prop deletions + harness **and layout-spec** repair (§6.5)

**Failure mode caught:** dead API survives the single-render-site finding and keeps a `<h1>` branch alive inside a dialog that must have exactly one `<h2>` and no `<h1>`; and the e2e harness + the spec that consumes it rot silently (they break at type-check, not runtime — §14.3).

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (props `:54-102`; `<h1>` branch `:171-192`; `containerClass` `:161-164`; `title ?? slug` `:179`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:292-307` pass-through)
- Modify: `tests/e2e/_statusStripToggleHarness.tsx` (`:62-127`)
- **Modify: `tests/e2e/statusStripToggleLayout.spec.ts`** — this spec builds its states from `stripProps()` and measures a `card` / page-chrome variant that ceases to exist. **Owned by this task per Rule 1.**
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx` (`:197`, `:400`, `:408` and peers)
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` (`:124`)

**Disposition table (§6.5) — delete only what is unreachable from a production render path:**

| Prop | Disposition | Rationale |
| --- | --- | --- |
| `renderTitle` | **Delete** | Only call site passes `false` (`PublishedReviewModal.tsx:305`). The `<h1>` branch is dead in production. Also removes `strip-title` + `strip-title-divider` |
| `chrome` | **Delete** | Band owns chrome now (Task 1). Both arms (`:161-164`) collapse to one flex-layout literal |
| `title` | **Delete** | Its ONLY consumer is `title ?? slug` inside the deleted `<h1>` branch. `slug` STAYS — it feeds `copyUrl` and the toggle |
| `alertCount` | **Delete from `StatusStripProps` ONLY** | Both strip consumers leave in Task 5. **Do NOT remove it from `PublishedReviewModalProps`** — it is that component's own prop (`:74`, destructured `:114`) and the Overview rail badge uses it at `:183-195`. Only the pass-through at `:304` disappears |
| `isLive` | **KEEP** | Reachable: `_showReviewModal.tsx:336` → `:382`. Renders `strip-live-badge` |
| `archived` | **KEEP** | Reachable; drives read-only mode |
| `finalizeOwned` | **KEEP** | Passed through to `PublishedToggle`; real behavior |

> **`alertCount` sequencing.** Its two strip consumers (the badge at `:244`, the `hasSignal` disjunct at `:154`) are removed in Task 5. Delete the PROP here only if the strip compiles without it at this commit; otherwise defer that one row to Task 5 and say so in the commit body. Do not leave a half-deleted prop across two commits.

**Existing tests this breaks — RETIRE (subject gone) vs REWRITE (intent survives). Never "delete to get green":**

| Test | Disposition | Why |
| --- | --- | --- |
| `statusStrip.test.tsx:400` — asserts the `page` chrome KEEPS `sticky`/`z-30`/seam/padding/shadow | **RETIRE** | The `page` arm ceases to exist. No subject |
| `statusStrip.test.tsx:408` — asserts the `modal-header` chrome DROPS those tokens | **REWRITE** | Intent — the strip must not carry container chrome inside the band — survives. **It is the only guard against re-adding page chrome and double-seaming the band.** Retiring both would silently remove that guard |
| `statusStrip.test.tsx:197` and peers — construct props with `renderTitle: false` | **REWRITE (call shape)** | The prop disappears; the behavior under test does not |
| `_statusStripToggleHarness.tsx:62-127` | **REWRITE** | `stripProps()` builds a full `StatusStripProps`; deleted keys must go. The `:127` comment describes page chrome that no longer exists |
| `statusStripToggleLayout.spec.ts` invariant (b) — "inline idle strip height < **card-variant** strip height by >20px" | **REWRITE** | Its baseline is a harness state built from the deleted chrome variants. The compaction intent survives; re-derive the baseline from a state that still exists. **Never hardcode a pixel** — the spec's own header (`:1-33`) insists every baseline comes from a sibling render in the same harness |
| `statusStripToggleLayout.spec.ts` invariants (a), (c), (d) | **KEEP where the state survives** | They measure `PublishedToggle` chip containment and the error banner, not strip chrome. Re-verify each still resolves against the repaired harness |

- [ ] **Step 1: failing tests.** Rewrite `:408` against the single layout literal; update `:197`-style call shapes; retire `:400` with a one-line comment naming this task and §6.5. Confirm **T-NO-H1** (`publishedReviewModal.test.tsx:270`) — a **keep-green** guard, not a red. Run → the rewritten `:408` and the call-shape cases FAIL against current source (**genuine red:** the `chrome` prop and its page arm still exist).
- [ ] **Step 2: implement the deletions** per the table. Collapse `containerClass` to the single flex-layout literal. Delete the `<h1>` branch entirely.
- [ ] **Step 3: repair the harness AND `statusStripToggleLayout.spec.ts` in this commit.** Remove deleted keys from `stripProps()`; update the `:127` comment; re-derive invariant (b)'s baseline.
- [ ] **Step 4: run the lexical scanner and update the count literal IN THIS COMMIT.** Deleting `renderTitle` removes `StatusStrip.tsx:171` → expected **7** at this commit (`alert` still present, `re-sync` not yet added). **Verify by running the scan, never by reasoning** (§9) — a count that "should" move but doesn't means the edit landed differently than assumed.
  ```
  pnpm vitest run tests/components/admin/showpage/pageTransitions.test.tsx
  ```
  Update `pageTransitions.test.tsx:124`'s literal AND its trailing enumeration comment to match what the scan actually found.
- [ ] **Step 5: FULL SUITE GREEN**, including `pnpm typecheck` (the gate that proves the harness repair — vitest will not catch it) and the repaired Playwright spec:
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
  pnpm playwright test tests/e2e/statusStripToggleLayout.spec.ts --config tests/e2e/standalone.config.ts
  ```
- [ ] **Step 6: commit** `refactor(admin): delete StatusStrip renderTitle/chrome/title dead props`

---

## Task 3: strip moves into the `subHeader` band + band geometry pins (§6.1, §6.2, §8)

**Failure mode caught:** the strip is restyled in place and never actually leaves the `<header>` element — every color and order test passes while the panel is still two bands and the header-rhythm problem this change exists to fix is untouched.

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:244-309`)
- Modify: `components/admin/showpage/StatusStrip.tsx` (root className)
- Modify: `tests/components/admin/showpage/publishedReviewModal.test.tsx` (`:323`)
- **Modify: `tests/e2e/published-review-modal.layout.spec.ts`** (`:169-198` panel composition, `:221-232` header rhythm) — **owned by this task per Rule 1**
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` if the scan moves

### Real-browser assertions owned by this task, and why each is genuinely RED pre-change

| Assertion | Pre-change failure |
| --- | --- |
| **T-LAYOUT** — panel = header + subheader + body; no h-overflow @ 375/390/768/1280 | **RED:** no `-subheader` element exists at all, so the three-term sum cannot resolve. The live spec at `:169-198` asserts the *two*-term form today, which is the contract being replaced |
| **T-COPY-FLUSH** — Copy's right edge == the **band's** content-box right edge (±1px) | **RED:** verified live, the strip's `modal-header` arm is `"flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"` — **no `w-full`** (`:161-164`) — and there is no band to measure against. Note `strip-copy-link` **already carries `ml-auto shrink-0`** (`:259-263`), so a red here must NOT be "fixed" by adding `ml-auto`; it is already there. The assertion tests that `ml-auto` resolves against a full-band-width row |
| **T-ARCHIVED-BAND** — `archived` → band renders non-empty with the archived badge, no toggle/copy/live | **RED:** no band exists |

- [ ] **Step 1: failing tests.**
  - jsdom (`publishedReviewModal.test.tsx`): `show-status-strip` is a descendant of `published-show-review-subheader` **and is NOT a descendant of the header wrapper** — assert both directions; the negative is what catches a copy-not-move. Rewrite `:323` to assert band location rather than merely "inside the panel" (**REWRITTEN, not retired** — intent survives).
  - jsdom: **T-ARCHIVED-BAND** — the read-only mode must not produce an empty bordered seam (`StatusStrip.tsx:194-211`, `:221`, `:144-146`).
  - Playwright, in `published-review-modal.layout.spec.ts`: **T-LAYOUT** and **T-COPY-FLUSH**, written as the *replacement* for the two-band assertions. T-LAYOUT explicitly asserts header height, subheader height, and their sum vs the panel's pre-body offset, preserving the existing spec's **non-vacuity check** (the content pane genuinely overflows) and its `no footer element` assertion.
  - **T-COPY-FLUSH must be measured against the band's content box**, not the panel's — the band carries `px-tile-pad`, so a panel-relative assertion would be off by the padding and would get "fixed" by deleting the padding.
- [ ] **Step 2: run — FAIL.** Both Playwright assertions fail for the reasons tabulated above; the jsdom band assertions fail because no band exists.
- [ ] **Step 3: implement the header slot** per §6.2 — two children, no outer flex-column wrapper (there is no second row left inside the header):
  ```tsx
  header={
    <>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <h2 id={h2Id} data-testid={`${TESTID_BASE}-title`} className="min-w-0">…</h2>
          {openSheetHref !== null ? (/* unchanged 44px anchor — :263-274 */) : null}
        </div>
        {/* subline slot — Task 4 */}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* alert pill — Task 5 */}
        {/* unchanged close button — :276-285 */}
      </div>
    </>
  }
  subHeader={<StatusStrip … />}
  ```
  **No eyebrow** (Watchpoint 7). The 44px sheet-link anchor is unchanged (Watchpoint 1).
- [ ] **Step 4: set the strip root** to `flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap`. **`w-full` is the invariant that makes right-flush reachable** (§8) — the band is not a flex container, so nothing stretches the strip for free (Tailwind v4 here does not default `.flex` to `align-items: stretch`). **Do NOT add `relative` to the strip root** — that would silently re-anchor Task 7's overlays to the strip and break their `inset-x-0` full-band width.
- [ ] **Step 5: rewrite `published-review-modal.layout.spec.ts:221-232` (header rhythm) IN THIS COMMIT.** Its premise **dissolves** — it polices the gap between the title row and the strip *inside* the header, and they are now separate bands. Replace with a **band-composition assertion** (the header seam and the subheader seam are distinct, and the header's internal gap governs title→subline only). **Do not delete it; do not merely retune a number** (§14.1) — deleting coverage without replacement is a silent regression.
- [ ] **Step 6: run the scanner; update any moved literal in this commit.** Moving JSX between slots can change the lexical hit count in `PublishedReviewModal.tsx` even with no semantic change. Run, read, update.
- [ ] **Step 7: FULL SUITE GREEN**, including the rewritten Playwright suite:
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
  pnpm playwright test tests/e2e/published-review-modal.layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts
  ```
  `step3-review-modal.layout.spec.ts:222` must pass **unmodified** — that is the Step-3-invariance signal.
- [ ] **Step 8: commit** `feat(admin): move the published modal status strip into its own band`
