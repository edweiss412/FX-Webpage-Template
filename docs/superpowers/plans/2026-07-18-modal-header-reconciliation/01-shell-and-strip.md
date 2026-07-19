# Tasks 1–3 — Shell slot, prop deletions, band mount

Spec references (`§n`) point at `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md`. All paths are relative to the worktree root; run all commands from the worktree root. After EVERY task the tree is green (at minimum `pnpm vitest run` over the touched suites), then commit.

---

## Task 1: `ReviewModalShell` — optional `subHeader` slot + Step 3 baseline fixture (§6.1, §11.2)

**Failure mode caught:** the new shell slot leaks a wrapper, seam, or empty band into Step 3 — the one consumer that must be provably unchanged — and nobody notices because the only available baseline was captured from the post-change tree.

**Files:**
- Modify: `components/admin/review/ReviewModalShell.tsx` (props type `:54-71`; render after `</header>`, mirroring the `footer` idiom at `:449-456`)
- Create: `scripts/captureStep3HeaderBaseline.ts` (committed generator — reproducibility, §11.2)
- Create: `tests/components/admin/review/__fixtures__/step3-header-baseline.html`
- Modify/create: `tests/components/admin/review/reviewModalShell.test.tsx`

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
| `step3-header-baseline.html` + its generator script | **Setup data**, not a test | **No — and none is expected.** |
| T-SUBHEADER-SLOT | Test | **YES — this task's red.** |
| T-STEP3-INVARIANT | Test | No — a regression guard riding along, green before and after by design |

- [ ] **Step 1: generate the baseline ON THE PRE-CHANGE TREE.** Write `scripts/captureStep3HeaderBaseline.ts`: render `Step3ReviewModal` from a FIXED fixture, read `header.innerHTML`, normalize React ids, write to `tests/components/admin/review/__fixtures__/step3-header-baseline.html`. Run it now, before touching `ReviewModalShell.tsx`.
  - **Id normalization is mandatory and lives in BOTH the generator and the test.** The Step 3 header contains `useId()` output (`h2Id`, wired to `id` and the shell's `aria-labelledby`). Adding the shell's conditional branch can perturb `useId` values while the header is visually identical. Replace `:r…:`-style tokens — and any `id` / `for` / `aria-labelledby` / `aria-describedby` value containing one — with a stable placeholder. The committed fixture must be id-free.
  - Do NOT use `toMatchSnapshot` or any self-updating format; a `-u` run would absorb a real regression.
- [ ] **Step 2: write T-SUBHEADER-SLOT + T-SUBHEADER-FALSEY + T-STEP3-INVARIANT.** In `reviewModalShell.test.tsx`:
  - **T-SUBHEADER-SLOT:** `subHeader` provided → an element with `data-testid={`${testIdBase}-subheader`}` exists, sits between the header wrapper and the body in DOM order, and carries `relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2`. `subHeader` omitted → `queryByTestId(...)` is `null`.
  - **T-SUBHEADER-FALSEY:** `subHeader={false}` → NO band element (gate on truthiness, **not** `!= null` — `false`/`""`/`0` are all valid `ReactNode`s that a `!= null` gate would render an empty bordered seam for; the existing `footer` gate at `:449` uses `!= null` and is pre-existing/out-of-scope — do not copy it). Plus a type-level assertion that `subHeader={0}` does not compile (`@ts-expect-error`) — **`pnpm typecheck` is the enforcing gate here, since vitest strips types.**
  - **T-STEP3-INVARIANT:** two SCOPED assertions, NOT a whole-panel snapshot — (a) the rendered Step 3 modal contains zero `[data-testid$="-subheader"]` elements; (b) the Step 3 `<header>` subtree's normalized `innerHTML` equals the committed fixture's contents. Scoping is the point: a whole-panel snapshot fails on the shell's intentional new `null`-rendering branch, and the reflex response is to loosen or delete the test.
- [ ] **Step 3: run — expect T-SUBHEADER-SLOT and T-SUBHEADER-FALSEY to FAIL** (prop does not exist), T-STEP3-INVARIANT to PASS. `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx`
- [ ] **Step 4: implement.** Add the prop to `ReviewModalShellProps` with the doc comment above verbatim. Render immediately after `</header>`:
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
- [ ] **Step 5: run — all three PASS.** Also run the Step 3 suites unmodified: `pnpm vitest run tests/components/admin/wizard/ tests/components/admin/review/`. Zero edits to any wizard test file is the acceptance signal.
- [ ] **Step 6: `pnpm typecheck`** (the only gate that proves T-SUBHEADER-FALSEY's `subHeader={0}` clause).
- [ ] **Step 7: commit** — the fixture, the generator, the red test and the implementation land TOGETHER. Committing the fixture alone first would produce a green, test-free commit, which invariant 1 forbids.
  `feat(review): optional subHeader band slot on ReviewModalShell`

**Breaks no existing test.** Step 3 suites must pass with zero edits.

---

## Task 2: `StatusStrip` prop deletions + harness repair (§6.5)

**Failure mode caught:** dead API survives the single-render-site finding and keeps a `<h1>` branch alive inside a dialog that must have exactly one `<h2>` and no `<h1>`; and the e2e harnesses that construct full strip prop objects rot silently (they break at type-check, not runtime — §14.3).

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (props `:54-102`; `<h1>` branch `:171-192`; `containerClass` `:161-164`; `title ?? slug` `:179`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:292-307` — drop `renderTitle`, `chrome`, `title`, `alertCount` from the pass-through)
- Modify: `tests/e2e/_statusStripToggleHarness.tsx` (`:62-127`)
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx` (`:197`, `:400`, `:408` and peers)
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` (`:124` count literal)

**Disposition table (§6.5) — delete only what is unreachable from a production render path:**

| Prop | Disposition | Rationale |
| --- | --- | --- |
| `renderTitle` | **Delete** | Only call site passes `false` (`PublishedReviewModal.tsx:305`). The `<h1>` branch is dead in production. Also removes `strip-title` + `strip-title-divider` |
| `chrome` | **Delete** | Band owns chrome now (Task 1). Both arms (`:161-164`) collapse to one flex-layout literal |
| `title` | **Delete** | Its ONLY consumer is `title ?? slug` inside the deleted `<h1>` branch. `slug` STAYS — it feeds `copyUrl` and the toggle |
| `alertCount` | **Delete from `StatusStripProps` ONLY** | Both strip consumers leave (badge → Task 5; `hasSignal` disjunct → Task 5). **Do NOT remove it from `PublishedReviewModalProps`** — it is that component's own prop (`:74`, destructured `:114`) and the Overview rail badge uses it at `:183-195`. Only the pass-through at `:304` disappears |
| `isLive` | **KEEP** | Reachable: `_showReviewModal.tsx:336` → `:382`. Renders `strip-live-badge` |
| `archived` | **KEEP** | Reachable; drives read-only mode |
| `finalizeOwned` | **KEEP** | Passed through to `PublishedToggle`; real behavior |

> **Sequencing note.** `alertCount`'s two strip consumers are removed in Task 5 (atomic alert move). Delete the PROP here only if the strip compiles without it at this commit; if the `hasSignal` disjunct still references it, defer the `alertCount` row to Task 5 and say so in the commit body. Do not leave a half-deleted prop across two commits.

**Existing tests this breaks — disposition is explicit (§6.5). Never "delete to get green":**

| Test | Disposition | Why |
| --- | --- | --- |
| `statusStrip.test.tsx:400` — asserts the `page` chrome KEEPS `sticky`/`z-30`/seam/padding/shadow | **RETIRE** | The `page` arm ceases to exist. The assertion has no subject after the change |
| `statusStrip.test.tsx:408` — asserts the `modal-header` chrome DROPS those same tokens | **REWRITE** | Its intent — the strip must not carry container chrome inside the band — survives the prop deletion. Rewrite against the single remaining layout literal. **It is the only guard against someone re-adding page chrome and double-seaming the band.** Retiring both would silently remove that guard |
| `statusStrip.test.tsx:197` and peers — construct props with `renderTitle: false` | **REWRITE (call shape)** | The prop disappears; the behavior under test does not |
| `_statusStripToggleHarness.tsx:62-127` | **REWRITE** | `stripProps()` builds a full `StatusStripProps`; the deleted keys must go. The harness comment at `:127` describes page chrome that no longer exists |

- [ ] **Step 1: failing tests.** Rewrite `:408` against the single layout literal; update `:197`-style call shapes; add **T-NO-H1** (or confirm `publishedReviewModal.test.tsx:270` still covers it) asserting no `<h1>` anywhere in the dialog. Retire `:400` with a one-line comment naming this task and spec §6.5 as the reason. Run → the rewritten `:408` and the call-shape cases FAIL against current source.
- [ ] **Step 2: implement the deletions** per the table. Collapse `containerClass` to the single flex-layout literal. Delete the `<h1>` branch entirely.
- [ ] **Step 3: repair `_statusStripToggleHarness.tsx`.** Remove deleted keys from `stripProps()`; update the `:127` comment.
- [ ] **Step 4: run the lexical scanner and update the count literal IN THIS COMMIT.** Deleting `renderTitle` removes `StatusStrip.tsx:171` from the scan → 8 becomes 7 only after Task 5 also removes the alert; at THIS commit the expected value is **7** (`−renderTitle`), with `alert` still present and `re-sync` not yet added. **Verify by running the scan, never by reasoning** (§9) — a count that "should" move but doesn't means the edit landed differently than assumed.
  ```
  pnpm vitest run tests/components/admin/showpage/pageTransitions.test.tsx
  ```
  Update `pageTransitions.test.tsx:124`'s literal AND its trailing enumeration comment to match what the scan actually found.
- [ ] **Step 5: `pnpm typecheck`** — this is the gate that proves the harness repair (§14.3). vitest will not catch it.
- [ ] **Step 6: run** `pnpm vitest run tests/components/admin/showpage/`.
- [ ] **Step 7: commit** `refactor(admin): delete StatusStrip renderTitle/chrome/title dead props`

---

## Task 3: strip moves into the `subHeader` band (§6.1, §6.2)

**Failure mode caught:** the strip is restyled in place and never actually leaves the `<header>` element — every color and order test passes while the panel is still two bands and the header-rhythm problem this change exists to fix is untouched.

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:244-309` — header slot loses its outer flex-column wrapper; `subHeader={<StatusStrip … />}`)
- Modify: `components/admin/showpage/StatusStrip.tsx` (root className)
- Modify: `tests/components/admin/showpage/publishedReviewModal.test.tsx` (`:323` — strip location assertion)
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` if the scan moves

- [ ] **Step 1: failing tests** in `publishedReviewModal.test.tsx`:
  - the `show-status-strip` element is a descendant of `published-show-review-subheader`, and is **NOT** a descendant of the header wrapper (assert both directions — the negative is what catches a copy-not-move);
  - **T-ARCHIVED-BAND:** `archived: true` → the band still renders and is non-empty (archived badge present), with NO toggle, NO copy link, NO live badge (`StatusStrip.tsx:194-211`, `:221`, `:144-146`). The read-only mode must not produce an empty bordered seam;
  - rewrite `:323` ("StatusStrip renders inside the panel with the publish toggle present") to assert the band location rather than merely "inside the panel". **REWRITTEN, not retired** — the intent survives.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement the header slot** per §6.2's shape — two children, no outer flex-column wrapper (there is no second row left inside the header):
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
  **No eyebrow** (§6.2, Watchpoint 7). The 44px sheet-link anchor is unchanged (Watchpoint 1).
- [ ] **Step 4: set the strip root** to `flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap`. **`w-full` is the invariant that makes right-flush reachable** (§8) — the band is not a flex container, so nothing stretches the strip for free (Tailwind v4 here does not default `.flex` to `align-items: stretch`). **Do NOT add `relative` to the strip root** — that would silently re-anchor the Task 7 overlays to the strip and break their `inset-x-0` full-band width.
- [ ] **Step 5: run the scanner; update any moved literal in this commit.** Moving JSX between slots can change the lexical hit count in `PublishedReviewModal.tsx` even with no semantic change. Run, read, update.
- [ ] **Step 6: run** `pnpm vitest run tests/components/admin/showpage/` + `pnpm typecheck`.
- [ ] **Step 7: commit** `feat(admin): move the published modal status strip into its own band`

**Known-red after this task, resolved later:** `tests/e2e/published-review-modal.layout.spec.ts:169-198` (panel composition) and `:221-232` (header rhythm) model a two-band panel. They are addressed in Task 13 — **the rhythm assertion's premise dissolves** (the strip is no longer inside the header), so it is REPLACED by a band-composition assertion, not retuned. Record this as a known-red in the commit body so a reviewer does not read it as an unnoticed break.
