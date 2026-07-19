# Tasks 4–6 — Header content and the copy-button variant

> **Rule 1 applies:** each task ends with the FULL suite green and owns any spec it breaks. **Rule 2 applies:** real-browser assertions live here, written before the implementation they police.

---

## Task 4: header subline (§6.3)

**Failure mode caught:** the subline is threaded through new props (unnecessary — §F2), or `clientLabel: null` renders an orphan leading separator, or the dates entry vanishes entirely when `data.dates` is empty and the header silently loses its second line.

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (import at `:41`; subline in the header slot's text block)
- Modify: `tests/components/admin/showpage/publishedReviewModal.test.tsx`
- Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` (count literal)

**Breaks:** only the count pin, updated in-commit.

**Zero prop-signature change** (§F2). `PublishedReviewModal` already receives `data: PublishedSectionData`; `sectionData.ts:28` declares `clientLabel: string | null` and `publishedAdapter.ts:64` populates it from `show.client_label`. `app/admin/_showReviewModal.tsx` is NOT touched.

**Do NOT move `dateSummarySegments`** (Watchpoint 6). Add it to the EXISTING import at `PublishedReviewModal.tsx:41`, which already pulls `RawUnrecognizedCallout` from `@/components/admin/wizard/step3ReviewSections`.

**Red phase:** genuine — there is no subline element on the pre-change tree, so every assertion below fails to resolve its subject.

- [ ] **Step 1: failing tests:**
  - **T-SUBLINE-CLIENT-NULL:** `clientLabel: null` → no client span **AND no orphan bullet**. Assert the absence of the separator specifically, not just the client text — a leading separator with nothing before it is the actual defect.
  - **T-SUBLINE-DATES-EMPTY:** `dates` null/empty → the subline still renders and contains the literal `"Dates not detected"`. The subline never disappears entirely.
  - happy path: client text → bullet → `segs.join(" · ")`. **Derive the expected date string from the fixture** via `dateSummarySegments`, never a hardcoded literal (anti-tautology: a hardcoded string cannot prove the helper was called).
  - the subline element carries `data-testid={`${TESTID_BASE}-subline`}`.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement** under the title row, `mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle`:
  ```tsx
  const client = data.clientLabel;
  const segs = dateSummarySegments(data.dates ?? undefined);
  ```
  - `client !== null` → `<span className="min-w-0 wrap-break-word">{client}</span>` + a 3px `rounded-pill bg-border-strong` bullet, `aria-hidden`.
  - `client === null` → client span **and its bullet** both omitted.
  - Dates entry ALWAYS renders: `segs.length > 0 ? segs.join(" · ") : "Dates not detected"`.
  Mirrors `Step3ReviewModal.tsx:388-403` exactly, including the fallback string.
- [ ] **Step 4: run the scanner; update the count literal in this commit.** Expected `PublishedReviewModal.tsx` = **2** (sheet-link + subline client entry). Write the counted form — `{client !== null ? (` — not `{client === null ? null : …}`, which the lexical scanner cannot see (§9). Verify by running the scan.
- [ ] **Step 5: FULL SUITE GREEN.** `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`.
- [ ] **Step 6: commit** `feat(admin): client/date subline in the published modal header`

---

## Task 5: alert relocation — strip → header pill, ATOMIC (§6.6, §7, §11.1)

**Failure mode caught:** three at once. (a) The alert is rendered twice — moved but not removed. (b) The pill regresses to the mock's inert `<span>`, losing the only affordance connecting the header count to the alert list (§F1). (c) **`showControlDivider` keeps its `alertCount > 0` disjunct, so a show with only alerts renders a divider followed by nothing** — a real bug this change introduces if not handled (§7).

**Why ATOMIC (kept from the pre-review plan, and the model for the Task 7 merge):** removing the badge from the strip in one commit and adding the pill in another produces an intermediate commit where the alert count is invisible to the user **while every test in the tree is green**. Test-greenness is not product-correctness; one commit.

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (delete alert branch `:244-257`; `hasSignal` `:154`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (pill in the header's right group)
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx`, `publishedReviewModal.test.tsx`, `pageTransitions.test.tsx`
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (adds the T-TAP probe + T-ALERT-CAP 375px case)

**Keep-green, not a break:** `overviewSection.test.tsx:71` pins the `#overview` anchor target. The pill still targets it (Watchpoint 4) — it must pass unmodified.

### Real-browser assertions owned by this task

| Assertion | Genuinely RED pre-change? |
| --- | --- |
| **T-TAP (alert pill hit probe)** | **Yes** — the pill does not exist; the probe cannot resolve an anchor |
| **T-ALERT-CAP @375px** (right group ≤50% of header width, title keeps non-zero width, no h-overflow) | **Yes** — verified live, `StatusStrip.tsx:255` renders `{alertCount}` **uncapped**, so a 1200-alert fixture at 375px genuinely overflows the group today |
| **T-TAP (sheet link ≥44px)** | **No — declared.** Already `size-tap-min` (`PublishedReviewModal.tsx:270`) and ratified unchanged (Watchpoint 1). Rides along as a guard that the header restructure did not drop it |

- [ ] **Step 1: failing tests (jsdom):**
  - **T-ALERT-PILL-LINK:** an `<a>` with `href="#overview"`, accessible name `"2 alerts"`. Not a span.
  - **T-ALERT-PILL-ZERO:** `alertCount: 0` → no pill. Not an empty pill, not `"0 alerts"`.
  - **T-ALERT-CAP (text/name clauses):** `1` → `1 alert` / `1 alert`; `2` → `2 alerts` / `2 alerts`; `1200` → visible `99+ alerts`, accessible name `99+ alerts (1200 open alerts)`. Assert the name with an **anchored regex**; assert *visible* text against a clone of the subtree with the `sr-only` span removed. **The unit stays visible** — a bare `99+` is not self-explanatory. The sr-only suffix renders ONLY past the cap.
  - guard row (§7): `alertCount` negative / non-integer / `NaN` → **no pill**, matching the `0` row rather than inventing an error state. Gate: `Number.isInteger(alertCount) && alertCount > 0`. Defensive-only — the value is server-derived at `_showReviewModal.tsx:270` — but §7 promises stated behavior for every input, and an unguarded render produces `NaN alerts` in the header.
  - **T-ALERT-NOT-IN-STRIP:** the strip contains no alert element.
  - **T-DIVIDER-ALERT-ONLY:** `alertCount > 0`, `isLive: false`, no sync → the strip renders **NO** control divider.
- [ ] **Step 2: failing tests (Playwright).**
  - **T-TAP pill probe — a hit-behavior probe, NOT a rect measurement** (§11.1). The pill reaches 44px via a `::before` pseudo-element, which `getBoundingClientRect()` on the anchor **cannot see** (it returns the ~24px visible box). Asserting the rect would FAIL a correct implementation and the natural "fix" would be inflating the visible pill, destroying the design:
    ```js
    const box = pill.getBoundingClientRect();
    const cx  = box.left + box.width / 2;
    const top = box.top + box.height / 2 - 21;   // 21px above center
    const bot = box.top + box.height / 2 + 21;   // 21px below → 42px spanned, inside 44
    // both probes must resolve to the pill anchor or a node it contains
    ```
    Coordinates are viewport-relative. Apply the identical treatment to any other control reaching the floor via a pseudo-element rather than its own box.
  - **T-ALERT-CAP @375px:** with `alertCount: 1200`, the header's right group stays ≤50% of the header's width, the title element keeps a non-zero width, and the panel does not h-overflow. **The assertion is deliberately NOT "same width as the 2-alert case"** — `99+ alerts` is legitimately wider than `2 alerts`, so an equal-width assertion would be false-red and the tempting fix would be dropping the visible unit §6.6 requires.
- [ ] **Step 3: run — FAIL.**
- [ ] **Step 4: implement the pill** in the header's `shrink-0` right group, before the close button, per §6.6's markup verbatim. Load-bearing, not stylistic:
  - `before:-inset-y-3` is **copied deliberately from `StatusStrip.tsx:248-252`, not chosen fresh.** `text-xs` ≈ 16px line box + `py-1` (8px) ≈ 24px visible; `-inset-y-3` (12px each side) ≈ 48px ≥ 44. **`-inset-y-2` would yield ~40px and MISS the floor.** The probe in Step 2 is what actually proves it — the real height depends on resolved line-height.
  - The 8px `bg-status-review` dot replaces the `TriangleAlert` glyph and is `aria-hidden` — the count text carries the meaning. **`--color-status-review` is confirmed live** (`globals.css:93`; light `#a87716` `:298`, dark `#e0b84e` `:349`). Use the token, never the mock hex.
  - The space before the `sr-only` span is its OWN visible text node (`{" "}`), **not** a leading space inside the span — a leading space inside `sr-only` is trimmed during accessible-name computation, yielding `"99+ alerts(1200 open alerts)"`. Same idiom as `PublishedReviewModal.tsx:194-195`.
- [ ] **Step 5: delete the strip's alert branch** (`:244-257`) and fix `hasSignal` (`:154`):
  ```ts
  const hasSignal = isLive || (syncLabel != null && sync != null);
  ```
  If Task 2 deferred the `alertCount` prop deletion, complete it here.
- [ ] **Step 6: run the scanner; update BOTH literals in this commit.** Expected: `StatusStrip.tsx` = **6** (7 minus `alert`; `re-sync` arrives in Task 7), `PublishedReviewModal.tsx` = **4** (sheet-link, subline client entry, alert pill, capped sr-only suffix). **`PublishedReviewModal` is 4, not 3** — §6.6's cap adds `{alertCount > 99 ? (` as its own mounted conditional. Write both new mounts in the counted form. If the numbers differ, the edit landed differently than assumed — investigate before touching a literal.
- [ ] **Step 7: FULL SUITE GREEN** including Playwright:
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
  pnpm playwright test tests/e2e/published-review-modal.layout.spec.ts
  ```
  `overviewSection.test.tsx:71` must pass unmodified.
- [ ] **Step 8: commit** `feat(admin): move the alert badge to a header pill and drop its strip disjunct`

---

## Task 6: `ShareLinkCopyButton` — `variant` union, all three call sites (§6.4, §7.1, §7.2)

**Failure mode caught:** the shared **default (accent) arm** gets restyled to produce the outline treatment, silently restyling the share panel mounted inside this very modal (`ShareLinkBody` reaches it through the Overview `shareSlot` at `PublishedReviewModal.tsx:212`) — §F3. Second: a new test asserts the bare `data-testid="admin-current-share-link-copy-button"`, which appears **twice** inside the open modal, and silently measures the share panel's button instead of the strip's.

**Files:**
- Modify: `app/admin/show/[slug]/ShareLinkCopyButton.tsx` (`:19-31` props, `:62-66` arms, `:97-100` label swap)
- Modify: `app/admin/show/[slug]/ShareLinkBody.tsx:53`, `app/admin/show/[slug]/ShareChip.tsx:44`, `components/admin/showpage/StatusStrip.tsx:261`
- Modify/create: copy-button jsdom suite + the Playwright contrast case

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

`ShareChip` is the easy one to miss — the only `compact` consumer, living outside every surface this change otherwise touches.

### Real-browser assertion owned by this task

**T-CONTRAST (outline Copy label), BOTH themes — RED pre-change** because `variant="outline"` does not exist, so the assertion cannot resolve its subject.

Sampling is specified (§7.2) and is the whole point — the control is `background: transparent`, so reading `backgroundColor` off the element yields `rgba(0,0,0,0)` and any ratio against it is meaningless (a correct implementation fails, or a broken one passes):
- **Backdrop** = the computed `backgroundColor` of the nearest ancestor that actually paints — resolve by **walking up** until a non-transparent `backgroundColor` is found, not by assuming a fixed ancestor depth.
- **Label** = the button's computed `color` in its **idle, unfocused, unhovered** state.
- Ratio via the standard WCAG relative-luminance formula; assert **≥4.5:1** (WCAG 1.4.3). Toggle themes via the documented mechanism, never hardcoded hex.
- **Assert NO border ratio** — `border-border-strong` measures ~1.6:1 on band surface in **both** themes (Watchpoint 8). A 3:1 border rule is unsatisfiable with the mandated token and would force weakening the test or abandoning the token system.

- [ ] **Step 1: failing tests (jsdom):**
  - **T-COPY-OUTLINE — BOTH states.** Idle: visible label `"Copy crew link"`, copy glyph. Post-click: `"Copied"` + check glyph on the existing 2s timer (`:49`). **An idle-only assertion is the failure mode here** — announcing success only through the live region would leave sighted users with no feedback and the button would appear inert on click. Also: **no `aria-label` contradicting the visible label** (the visible text IS the accessible name; the copied state is additionally announced through the sr-only region at `:106`), and the reserved-min-width class is present so the left edge cannot shift.
  - **Scope every query to `[data-testid="strip-copy-link"] button`**, never the bare testid. The duplication exists today and is out of scope to fix; the bare testid silently targets the share panel's button.
  - **T-COPY-ACCENT-UNCHANGED:** `CurrentShareLinkPanel`'s button still renders the accent arm (`bg-accent` + `text-accent-text`, `:65`). **Declared NOT red** — an invariance guard on the shared arm (§F3), green before and after.
  - `variant="compact"` renders today's icon-only arm unchanged.
- [ ] **Step 2: failing test (Playwright):** T-CONTRAST for the outline label, both themes, sampled per §7.2 above.
- [ ] **Step 3: run — T-COPY-OUTLINE and T-CONTRAST FAIL** (no outline arm); T-COPY-ACCENT-UNCHANGED passes.
- [ ] **Step 4: implement.** Replace the boolean with the union. `"accent"` = today's `:65` literal unchanged; `"compact"` = today's `:64` literal unchanged; `"outline"` = NEW: `border border-border-strong bg-transparent text-text rounded-sm px-3 py-1.5 text-sm font-semibold min-h-tap-min`, hover `border-border-strong`/`bg-surface-sunken`, the same `focus-visible:ring-2 ring-focus-ring` as its siblings, visible label + copy glyph, **no `aria-label`**. Reserve the wider of `"Copy crew link"` / `"Copied"` as a min-width so the swap cannot shift the left edge — the button sits at the row's `ml-auto` end.
- [ ] **Step 5: migrate all three call sites** per the map.
- [ ] **Step 6: FULL SUITE GREEN.** `pnpm typecheck` is the completeness gate proving no call site was missed. Plus the Playwright contrast case.
- [ ] **Step 7: commit** `refactor(admin): ShareLinkCopyButton variant union with a neutral outline arm`

**Orange budget note:** this task removes the first of two oranges. The full three-state T-NO-ORANGE enumeration lands in Task 7, which removes the second (the accent Re-sync) — asserting it here would be red for a reason this task does not own.
