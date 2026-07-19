# Tasks 4–6 — Header content and the copy-button variant

---

## Task 4: header subline (§6.3)

**Failure mode caught:** the subline is threaded through new props (unnecessary — §F2), or `clientLabel: null` renders an orphan leading separator, or the dates entry vanishes entirely when `data.dates` is empty and the header silently loses its second line.

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (import at `:41`; subline in the header slot's text block)
- Modify: `tests/components/admin/showpage/publishedReviewModal.test.tsx`
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` (count literal)

**Zero prop-signature change** (§F2). `PublishedReviewModal` already receives `data: PublishedSectionData`; `sectionData.ts:28` declares `clientLabel: string | null` and `publishedAdapter.ts:64` populates it from `show.client_label`. `app/admin/_showReviewModal.tsx` is NOT touched.

**Do NOT move `dateSummarySegments`** (Watchpoint 6). Add it to the EXISTING import at `PublishedReviewModal.tsx:41`, which already pulls `RawUnrecognizedCallout` from `@/components/admin/wizard/step3ReviewSections`. The cross-domain import is established, not new.

- [ ] **Step 1: failing tests:**
  - **T-SUBLINE-CLIENT-NULL:** `clientLabel: null` → no client span **AND no orphan bullet**. Assert the absence of the separator specifically, not just the client text — a leading separator with nothing before it is the actual defect.
  - **T-SUBLINE-DATES-EMPTY:** `dates` null/empty → the subline still renders and contains the literal `"Dates not detected"`. The subline never disappears entirely.
  - happy path: `clientLabel` present → client text, then a bullet, then `segs.join(" · ")`. **Derive the expected date string from the fixture** via `dateSummarySegments`, never a hardcoded literal (anti-tautology: a hardcoded string cannot prove the helper was called).
  - the subline element carries `data-testid={`${TESTID_BASE}-subline`}`.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement** under the title row, `mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle`:
  ```tsx
  const client = data.clientLabel;
  const segs = dateSummarySegments(data.dates ?? undefined);
  ```
  - `client !== null` → `<span className="min-w-0 wrap-break-word">{client}</span>` followed by a 3px `rounded-pill bg-border-strong` bullet, `aria-hidden`.
  - `client === null` → client span **and its bullet** both omitted.
  - Dates entry ALWAYS renders: `segs.length > 0 ? segs.join(" · ") : "Dates not detected"`.
  This mirrors `Step3ReviewModal.tsx:388-403` exactly, including the fallback string.
- [ ] **Step 4: run the scanner; update the count literal in this commit.** The client entry is a new conditional mount. Expected `PublishedReviewModal.tsx` = **2** at this commit (sheet-link + subline client entry). Write it in the counted form — `{client !== null ? (` — not `{client === null ? null : …}`, which the lexical scanner cannot see (§9). Verify by running the scan.
- [ ] **Step 5: run** `pnpm vitest run tests/components/admin/showpage/`.
- [ ] **Step 6: commit** `feat(admin): client/date subline in the published modal header`

---

## Task 5: alert relocation — strip → header pill, ATOMIC (§6.6, §7)

**Failure mode caught:** three at once. (a) The alert is rendered twice — moved but not removed. (b) The pill regresses to the mock's inert `<span>`, losing the only affordance connecting the header count to the alert list (§F1). (c) **`showControlDivider` keeps its `alertCount > 0` disjunct, so a show with only alerts renders a divider followed by nothing** — a real bug this change introduces if not handled, per §7.

**Why atomic:** removing the badge from the strip in one commit and adding the pill in another produces an intermediate commit where the alert count is invisible to the user while every test in the tree is green. One commit.

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (delete the alert branch `:244-257`; `hasSignal` `:154`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (pill in the header's right group)
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx`, `publishedReviewModal.test.tsx`, `pageTransitions.test.tsx`

- [ ] **Step 1: failing tests:**
  - **T-ALERT-PILL-LINK:** the pill is an `<a>` with `href="#overview"` and accessible name `"2 alerts"`. Not a span (Watchpoint 4).
  - **T-ALERT-PILL-ZERO:** `alertCount: 0` → no pill at all. Not an empty pill, not `"0 alerts"`.
  - **T-ALERT-CAP:** assert the full §6.6 table — `1` → visible `1 alert`, name `1 alert`; `2` → `2 alerts` / `2 alerts`; `1200` → visible `99+ alerts`, accessible name `99+ alerts (1200 open alerts)`. Assert the name with an **anchored regex** and assert the *visible* text against a clone of the subtree with the `sr-only` span removed. **The unit stays visible** — a bare `99+` is not self-explanatory. The sr-only suffix renders ONLY past the cap. (The 375px width clause of T-ALERT-CAP is real-browser and lands in Task 11.)
  - guard row (§7): `alertCount` negative / non-integer / `NaN` → **no pill**, matching the `0` row rather than inventing an error state. Gate is `Number.isInteger(alertCount) && alertCount > 0`. Defensive-only — the value is server-derived at `_showReviewModal.tsx:270` — but §7 promises stated behavior for every input, and an unguarded render produces `NaN alerts` in the header.
  - **T-ALERT-NOT-IN-STRIP:** the strip contains no alert element.
  - **T-DIVIDER-ALERT-ONLY:** `alertCount > 0`, `isLive: false`, no sync → the strip renders **NO** control divider.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement the pill** in the header's `shrink-0` right group, before the close button, per §6.6's markup verbatim. Points that are load-bearing, not stylistic:
  - `before:-inset-y-3` is **copied deliberately from `StatusStrip.tsx:248-252`, not chosen fresh.** Arithmetic: `text-xs` ≈ 16px line box + `py-1` (8px) ≈ 24px visible; `-inset-y-3` (12px each side) ≈ 48px ≥ 44. **`-inset-y-2` would yield ~40px and MISS the floor.** Still assert the measured behavior in Task 11 — the real height depends on resolved line-height.
  - The 8px `bg-status-review` dot replaces today's `TriangleAlert` glyph and is `aria-hidden` — the count text carries the meaning. **`--color-status-review` is confirmed live** (`globals.css:93`; light `#a87716` `:298`, dark `#e0b84e` `:349`). Use the token, never the mock hex.
  - The space before the `sr-only` span is its OWN visible text node (`{" "}`), **not** a leading space inside the span — a leading space inside `sr-only` is trimmed during accessible-name computation, yielding `"99+ alerts(1200 open alerts)"`. The same idiom is already used at `PublishedReviewModal.tsx:194-195`.
- [ ] **Step 4: delete the strip's alert branch** (`:244-257`) and fix `hasSignal` (`:154`):
  ```ts
  const hasSignal = isLive || (syncLabel != null && sync != null);
  ```
  With the alert gone from the strip, `alertCount` is no longer a strip signal — the disjunct MUST drop. If Task 2 deferred the `alertCount` prop deletion, complete it here.
- [ ] **Step 5: run the scanner; update BOTH literals in this commit.** Expected: `StatusStrip.tsx` = **6** at this commit (7 minus `alert`; `re-sync` arrives in Task 8), `PublishedReviewModal.tsx` = **4** (sheet-link, subline client entry, alert pill, capped sr-only suffix). **`PublishedReviewModal` is 4, not 3** — §6.6's cap adds `{alertCount > 99 ? (` as its own mounted conditional. Write both new mounts in the counted form. Verify by running the scan; if the numbers differ from these, the edit landed differently than assumed — investigate before touching a literal.
- [ ] **Step 6: run** `pnpm vitest run tests/components/admin/showpage/ tests/components/admin/showpage/overviewSection.test.tsx` — `overviewSection.test.tsx:71` pins the `#overview` anchor target's existence and must still pass.
- [ ] **Step 7: commit** `feat(admin): move the alert badge to a header pill and drop its strip disjunct`

---

## Task 6: `ShareLinkCopyButton` — `variant` union, all three call sites (§6.4)

**Failure mode caught:** the shared **default (accent) arm** gets restyled to produce the outline treatment, silently restyling the share panel mounted inside this very modal (`ShareLinkBody` reaches it through the Overview `shareSlot` at `PublishedReviewModal.tsx:212`) — §F3. Second failure mode: a new test asserts the bare `data-testid="admin-current-share-link-copy-button"`, which appears **twice** inside the open modal, and silently measures the share panel's button instead of the strip's.

**Files:**
- Modify: `app/admin/show/[slug]/ShareLinkCopyButton.tsx` (`:19-31` props, `:62-66` className arms, `:97-100` label swap)
- Modify: `app/admin/show/[slug]/ShareLinkBody.tsx:53`, `app/admin/show/[slug]/ShareChip.tsx:44`, `components/admin/showpage/StatusStrip.tsx:261`
- Modify/create: `tests/components/admin/…` copy-button suite

**Interface produced:**
```ts
variant?: "accent" | "compact" | "outline";  // default "accent" — today's behavior
```
The boolean `compact` is **replaced, not kept as a deprecated alias** — two spellings for one axis is the defect being fixed. All three call sites migrate in this same commit or `pnpm typecheck` fails.

**Migration map — every row must land:**

| Call site | Today | After |
| --- | --- | --- |
| `ShareLinkBody.tsx:53` | `<ShareLinkCopyButton url={url} />` | `variant="accent"` — **write it explicitly; do not rely on the default.** The point is an inventoryable style axis: a later restyle greps `variant="accent"` and must find this call site, the shared default arm this task exists to protect |
| `ShareChip.tsx:44` | `<ShareLinkCopyButton url={url} compact />` | `variant="compact"` |
| `StatusStrip.tsx:261` | `<ShareLinkCopyButton url={copyUrl} />` | `variant="outline"` |

`ShareChip` is the easy one to miss — it is the only `compact` consumer and lives outside every surface this change otherwise touches.

- [ ] **Step 1: failing tests:**
  - **T-COPY-OUTLINE — BOTH states.** Idle: visible label `"Copy crew link"`, copy glyph. Post-click: label `"Copied"` + check glyph on the existing 2s timer (`:49`). **An idle-only assertion is the failure mode here** — announcing success only through the live region would leave sighted users with no feedback and the button would appear inert on click. Also assert: **no `aria-label` that contradicts the visible label** (the visible text IS the accessible name; the copied state is additionally announced through the existing sr-only region at `:106`), and the button's left edge is unmoved across the swap (jsdom cannot measure this — assert the reserved-min-width class here, and measure geometry in Task 11).
  - **Scope every query to `[data-testid="strip-copy-link"] button`**, never the bare testid. The duplication exists today and is out of scope to fix; asserting the bare testid silently targets the share panel's button.
  - **T-COPY-ACCENT-UNCHANGED:** `CurrentShareLinkPanel`'s button still renders the accent arm (`bg-accent` + `text-accent-text`, `ShareLinkCopyButton.tsx:65`). This is the §F3 regression guard.
  - `variant="compact"` renders today's icon-only arm unchanged.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement.** Replace the `compact` boolean with the `variant` union. `"accent"` = today's `:65` literal unchanged; `"compact"` = today's `:64` literal unchanged; `"outline"` = NEW: `border border-border-strong bg-transparent text-text rounded-sm px-3 py-1.5 text-sm font-semibold min-h-tap-min`, hover `border-border-strong`/`bg-surface-sunken`, the same `focus-visible:ring-2 ring-focus-ring` as its siblings. Outline arm carries a visible label and **no `aria-label`**. Reserve the wider of `"Copy crew link"` / `"Copied"` as a min-width so the swap cannot shift the left edge — the button sits at the row's `ml-auto` end.
- [ ] **Step 4: migrate all three call sites** per the map.
- [ ] **Step 5: `pnpm typecheck`** — the gate that proves no call site was missed.
- [ ] **Step 6: run** `pnpm vitest run tests/` scoped to the copy-button, strip, share-panel and share-chip suites.
- [ ] **Step 7: commit** `refactor(admin): ShareLinkCopyButton variant union with a neutral outline arm`

**Note on the orange budget:** this task is what makes the publish toggle the only orange *control* in the region. The Live-now dot keeps its accent hue as the one ratified non-control exception (Watchpoint 5). T-NO-ORANGE (Task 12) enumerates the exact expected set per state rather than asserting absence — an absence check would miss `bg-status-live` entirely.
