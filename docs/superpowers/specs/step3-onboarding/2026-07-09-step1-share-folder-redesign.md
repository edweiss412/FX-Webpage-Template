# Spec — Onboarding Step 1 "Share your show folder" redesign

**Date:** 2026-07-09
**Slug:** `step1-share-folder-redesign`
**Surface:** `components/admin/wizard/Step1Share.tsx` (UI-only)
**Design mock:** `docs/superpowers/specs/2026-07-09-step1-share-folder-mock/Share folder screen.dc.html`
**Governing product spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §9.0 (lines 2535–2546)

---

## 1. Goal & scope

Restyle the **body** of onboarding wizard Step 1 to match the claude.ai design mock: pull the two helper disclosures inline (nested where they belong in the flow) and give them a chevron that rotates on open, instead of the current two standalone bordered `<details>` boxes stacked below step 4.

**In scope:** `components/admin/wizard/Step1Share.tsx` only.

**Out of scope (already exists and matches the mock — do NOT touch):**

- Onboarding top bar — `components/admin/nav/OnboardingTopBar.tsx` (FXAV wordmark, "Setup" pill, email, Sign out).
- Step indicator (1 Share folder · 2 Verify · 3 Review & publish) — `StepIndicator` in `components/admin/OnboardingWizard.tsx:119`.
- Sticky wizard footer — `components/admin/wizard/WizardFooter.tsx` (the mock's bottom-pinned CTA row).
- "Start over" affordance — rendered by the shell `OnboardingWizard.tsx:108` (spec §9.0:2546 mandates it at the wizard/shell level, on every step). The mock shows it because the tool exports the whole page; it is NOT part of the step body.

The mock renders as a full page (chrome + body). This change reproduces only the **body** deltas; the surrounding chrome is unchanged.

## 2. Copy contract — adopt LAYOUT, keep spec §9.0 copy (invariant 7)

The mock's text is illustrative, **not** authoritative. Where the mock drifts from spec §9.0, ship the spec copy:

| Element | Mock text | **Ship (authoritative)** | Source |
| --- | --- | --- | --- |
| Email-disclosure summary | "Why this email?" | **"What's this email?"** | §9.0:2544 |
| Email-disclosure body | reworded ("…the one folder you share with it, and only what is inside it…") | The current body **verbatim** from the live component (`Step1Share.tsx:186-190`): "It is the app's identity inside your Drive. It can only see what you share with it, and only the folder you choose. Removing the share at any time revokes the app's access." | shipped copy, §9.0:2544 |
| "Don't have a folder yet?" sub-steps | 3 items | The current **4** items (`Step1Share.tsx:200-207`), with **one forced correctness edit**: item 3 currently reads "Share the folder with the email **above**…" (`:205`) — correct while the box sits at the bottom, below the email card. Once the helper moves to the top (D1), the email card is **below** it, so item 3 becomes "Share the folder with the email **below**…". This is a placement-driven directional fix, not a copy re-opening. | current component + D1 relocation |
| The four numbered prompts (steps 1–4) | as shown | **Verbatim** from §9.0:2540-2542 as the live component already renders (`Step1Share.tsx:117,127,137,172`) | §9.0 |

Curly apostrophes throughout (impeccable typography contract, already honored in the live component).

> Note: the **shipped** live copy is kept verbatim. §9.0:2544 describes the explainer loosely as "two sentences"; the shipped, already-spec-reviewed component renders three short sentences. This redesign does NOT re-open approved copy — it relocates and restyles the disclosure, leaving its text exactly as shipped. Adopting the mock's rewording is explicitly out of scope (§12, invariant 7).

## 3. Layout deltas (the four changes)

Numbered against the live component (`components/admin/wizard/Step1Share.tsx`):

**D1 — "Don't have a folder yet?" moves inline into step-1's `<li>`.**
Currently a standalone bordered `<details data-testid="wizard-step1-no-folder">` box at `Step1Share.tsx:193-208`, after step 4. Move it to be a child of the **step-1** list item (the "find the folder" item, currently `:109-119`).

**Required DOM shape (the step-1 `<li>` must be restructured from a horizontal row to a row+column, mirroring the existing step-3 `<li>` shape at `:129-138`).** The live step-1 `<li>` is `flex gap-3` (a horizontal row: numeral + prompt text). Left as-is, the disclosure would render as a **third flex item to the right** of the prompt, not below it. Restructure to:

```
<li className="flex flex-col gap-*">          {/* was: flex gap-3 */}
  <div className="flex gap-3">                {/* the numeral + prompt row */}
    <span …>1</span>
    <span>In Google Drive, find the folder …</span>
  </div>
  <details data-testid="wizard-step1-no-folder" className="group ml-9"> … </details>
</li>
```

The `ml-9` (36px = 24px numeral + 12px gap) aligns the disclosure under the prompt text, not the numeral. Summary restyled as an **accent underlined link** with a trailing chevron (mock: `#FFA047` underlined = `text-accent-on-bg underline underline-offset-2` — `accent-on-bg` IS the action-allowed link token, DESIGN.md:34). Keep `data-testid="wizard-step1-no-folder"`. Sub-steps list: 4 items, with the single directional fix from §2 — item 3 "email **above**" → "email **below**" (the email card is now below this relocated helper). Everything else in the sub-list is verbatim.

**D2 — "What's this email?" moves inline directly under the email card.**
Currently a standalone bordered `<details data-testid="wizard-step1-explainer">` box at `:176-191`, after step 4. Move it to be the sibling directly **below the email card** inside step-3's `<li>` column.

**Required DOM shape.** The live card `<div>` at `:139-163` currently carries `ml-9` directly and holds the `<code>` + Copy button + feedback. Restructure so the `ml-9` indent moves to an **outer wrapper** that holds BOTH the card and the explainer as siblings, and give the card container a stable testid:
```
<li className="flex flex-col gap-3">                 {/* step 3 */}
  <div className="flex gap-3"> … numeral + "Paste this email…" … </div>
  <div className="ml-9 flex flex-col gap-3">          {/* the indented column — card + explainer siblings */}
    <div data-testid="wizard-step1-email-card"
         className="flex … rounded-md border border-border bg-surface p-tile-pad …">   {/* card: drops ml-9, gains testid */}
      <code data-testid="wizard-step1-service-account-email" …/>
      <button data-testid="wizard-step1-copy-email-button" …/>
      <span data-testid="wizard-step1-copy-feedback" role="status" …/>
    </div>
    <details data-testid="wizard-step1-explainer" className="group"> … </details>   {/* sibling directly BELOW the card, NOT inside it */}
  </div>
</li>
```
The explainer is the card's **next sibling** in the `ml-9` wrapper — never a child of the card. Summary restyled as a **quiet** disclosure with a leading chevron, no underline. **Token:** the summary label uses `text-text` — NOT `text-text-subtle`. DESIGN.md:27 states `--color-text-subtle` is "Never used for action targets," and a `<summary>` IS an action target; `text-text` gives the mock's quieter (vs. the current `text-text-strong`) feel while staying action-legal. The decorative chevron (`aria-hidden`) may render at `text-text-subtle` (a glyph, not an action target). Keep `data-testid="wizard-step1-explainer"`, `data-testid="wizard-step1-explainer-summary"`, and add `data-testid="wizard-step1-email-card"` on the card container.

**D3 — Chevron rotate-on-open + native-marker suppression on both disclosures.**
Each `<details>` gets `className="group"`; the chevron SVG gets `transition-transform duration-normal group-open:rotate-180`. Chevron is the lucide `ChevronDown` (matches the mock's `m6 9 6 6 6-6` down-caret path), `aria-hidden="true"`, `size-4 shrink-0`.

**Native marker MUST be hidden.** Adding a custom chevron without suppressing the browser's default `<summary>` disclosure triangle shows **two** affordances. Each `<summary>` carries `list-none [&::-webkit-details-marker]:hidden` (the mock does this via `summary::-webkit-details-marker{display:none}` + `list-style:none`).

The closest existing in-repo pattern (marker-hidden, tap-floored, `group-open` chevron rotation) is the Step-3 pack disclosure, `components/admin/wizard/step3ReviewSections.tsx:2131-2134`, which reads **verbatim**:
```
<summary className="flex min-h-tap-min cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
  <ChevronRight aria-hidden="true"
    className="size-4 shrink-0 text-text-subtle transition-transform duration-fast group-open:rotate-90" />
  <span …>{label}</span>
  …
</summary>
```
This redesign **reuses that structural shape** (the `<summary>` classes + `group-open` chevron-rotation mechanism) but applies these **deliberate deltas** from the mock, which are NEW requirements, not copied from the snippet above:
- icon `ChevronDown` (not `ChevronRight`) — matches the mock's down-caret;
- rotation `group-open:rotate-180` (not `rotate-90`) — a down-caret flips to point up on open;
- duration `duration-normal` / 220ms (not `duration-fast`) — matches the mock's 220ms;
- label token per D1 (`text-accent-on-bg underline`) / D2 (`text-text`), not the Step-3 `text-text-strong` label.

Both step-1 summaries follow this shape (differing in label token per D1/D2 and chevron lead/trail position). Native `<details>`/`<summary>` disclosure semantics + keyboard toggle are preserved.

Mock duration is 220ms → `--duration-normal` (`app/globals.css:215` = `220ms`). Under `prefers-reduced-motion`, `--duration-normal` collapses to `0ms` automatically (`app/globals.css:397-401`) — no per-component guard needed.

**D4 — Remove the two standalone bordered boxes.**
The `rounded-md border border-border bg-surface-sunken p-tile-pad` wrapper styling on both former standalone `<details>` (`:176-178`, `:193-195`) is dropped; the disclosures now sit inline unboxed per D1/D2.

Everything else — eyebrow, heading, HelpSheet `?`, intro paragraph, the four numbered steps, the email card + Copy button + copy-feedback live region, and the `WizardFooter` advance CTA — is **unchanged** in structure and copy.

## 4. Token mapping (mock hex → existing `@theme` token, dark values)

No new token is introduced. Every hex maps to a token the component already consumes:

| Mock hex | Token / utility | `globals.css` |
| --- | --- | --- |
| `#FF8C1A` (accent fill, step-1 pill) | `--color-accent` / `bg-accent` | `:31` DESIGN.md |
| `#FFA047` ("Don't have a folder" link) | `--color-accent-on-bg` / `text-accent-on-bg` | DESIGN.md:34 (dark) |
| `#16171C` (email card) | `--color-surface` / `bg-surface` | DESIGN.md:22 |
| `#0B0C10` (numeral pills) | `--color-surface-sunken` / `bg-surface-sunken` | DESIGN.md:24 |
| `#2A2B30` (borders) | `--color-border` / `border-border` | DESIGN.md |
| `#3A3B40` (Copy btn border) | `--color-border-strong` | DESIGN.md:30 |
| `#F5F3EE` (headings, email code) | `--color-text-strong` | DESIGN.md |
| `#E8E6E0` (step body) | `--color-text` | DESIGN.md |
| `#E8E6E0` ("What's this email?" summary **label** — interactive) | `--color-text` / `text-text` (NOT `text-text-subtle` — DESIGN.md:27 bans it for action targets; see D2) | DESIGN.md:25 |
| `#9C9A93` (decorative chevrons, captions, intro paragraph — non-action) | `--color-text-subtle` / `text-text-subtle` | DESIGN.md:27 |
| `#74736d` (explainer body) | `--color-text-subtle` — **deliberately NOT `text-text-faint`** despite `#74736D` being that token's exact dark value (DESIGN.md:28); see rationale below | DESIGN.md:27-28 |
| `220ms` chevron | `--duration-normal` | `:215` |

The mock's `#74736d` explainer-body shade **is** the exact dark value of `--color-text-faint` (DESIGN.md:28). It is deliberately **rejected** here in favour of `text-text-subtle` (the live component's choice, `:187`) for an accessibility reason: DESIGN.md:28 scopes `text-text-faint` to "Decorative text, divider labels. Min AA-large only (3:1) — **never used for crew-actionable copy**." The explainer body is 14px explanatory copy (small, AA-body copy), so it must clear the AA-body 4.5:1 floor that `text-text-subtle` provides (7.8:1 light / 6.4:1 dark, DESIGN.md:27) and `text-text-faint` does not. Matching the mock's exact faint shade would ship an AA contrast violation; `text-text-subtle` is the correct token. This is an intentional accessibility override, not a "no token exists" fallback.

## 5. Guard conditions (props / state)

`Step1Share` takes one prop, `serviceAccountEmail: string`, and owns `copied` boolean state. No new props/state.

| Input | null / empty / edge | Behavior |
| --- | --- | --- |
| `serviceAccountEmail = ""` | The component trusts a non-empty email (server resolves it; `Step1Share.tsx:14-15`). Empty string → the `<code>` renders empty and Copy copies `""`. **Unchanged** — not a new concern this change introduces; preserved as-is. |
| `copied` toggling | Copy success shows "Copied" + live-region text for `COPY_FEEDBACK_RESET_MS` (2200ms), then resets. Clipboard rejection → benign, no raw error (invariant 5). **Unchanged.** |
| `<details>` open state | Native; defaults closed. Chevron rotates via CSS `group-open`. No JS state. |

No numeric inputs, no NaN surface. No unbounded lists (sub-step lists are fixed 3–4 items).

## 6. Dimensional invariants

**N/A.** No fixed-height/width parent contains flex/grid children whose dimensions must be pinned. All parents are content-sized (`flex-col gap-*`, `ml-9`). The email card is `flex` but its children are content-sized with no cross-axis stretch dependency (the live component already ships this; unchanged). No real-browser `getBoundingClientRect` layout task required.

## 7. Transition inventory

Only one animated element: the chevron on each disclosure. States = { closed, open }. All pairs:

| From → To | Treatment |
| --- | --- |
| closed → open | Chevron rotates 0° → 180°, `transition-transform`, `--duration-normal` (220ms), eased. Panel content appears instantly (native `<details>` — no height animation; matches mock, which animates only `.chev`). |
| open → closed | Chevron rotates 180° → 0°, same transition. Panel hides instantly. |

**Compound:** the two disclosures are independent (separate `<details>`), no shared state; opening one does not affect the other. No compound transition to enumerate. Under `prefers-reduced-motion` both rotations are instant (token collapses to 0ms).

The Copy button's "Copy"→"Copied" text swap is an **instant** text change (no animation) — unchanged from the live component.

## 8. Accessibility

- Chevrons are `aria-hidden="true"` (decorative; the `<summary>` text carries meaning).
- Native `<details>`/`<summary>` keeps built-in disclosure semantics + keyboard toggle (Enter/Space) — no ARIA wiring needed. Preserved from the live component.
- Copy-feedback stays a `role="status" aria-live="polite"` live region (`Step1Share.tsx:155-162`) — unchanged.
- `<summary>` min tap target: **both** disclosure summaries MUST carry `min-h-tap-min` (44px). DESIGN.md:185 mandates ≥44×44px for **every** interactive element, explicitly naming "accordion handle" — a disclosure summary is exactly that. The mock's `min-height: 28px` is illustrative and does NOT override the DESIGN contract (invariant 8). Each `<summary>` is `inline-flex items-center min-h-tap-min` so the label + chevron sit visually inline while the vertical hit area meets the 44px floor. (Note: the live shipped summaries lack this floor — a pre-existing gap; this redesign brings them into compliance.)

## 9. Testing

TDD. Existing coverage to keep green / update:

- `tests/components/admin/wizard/Step1Share.test.tsx` — renders, copy interaction, "What's this email?" disclosure. Update any assertion that depends on the former standalone-box **position**; the `wizard-step1-explainer` / `-explainer-summary` testids and copy remain. **Explainer-relocation test (required).** Query `emailCard = getByTestId('wizard-step1-email-card')` and `explainer = getByTestId('wizard-step1-explainer')`, then assert ALL of:
1. `expect(emailCard.contains(explainer)).toBe(false)` — the explainer is NOT nested inside the card (catches an impl that appends the `<details>` into the card's flex container after the code/feedback, which would satisfy a naive "follows the `<code>`" order check while rendering as another card row).
2. `expect(emailCard.parentElement).toBe(explainer.parentElement)` — they are siblings in the same `ml-9` wrapper.
3. `expect(emailCard.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()` — the explainer comes strictly **after** the card.

Do NOT accept weaker conditions (e.g. only "follows `wizard-step1-service-account-email`" or "card is not a descendant of the explainer"). Failure modes caught: (i) explainer left as a standalone block after step 4 (fails siblings-in-wrapper); (ii) explainer above the card (fails strict order); (iii) explainer appended *inside* the card (fails `!contains`).
- `tests/components/admin/wizard/Step1Share.noFolder.test.tsx` — "Don't have a folder yet?" disclosure. Update to assert it is now nested inside the step-1 `<li>` (query by `wizard-step1-no-folder`, assert it is a descendant of the step-1 item). **Directional-copy regression test:** assert the nested sub-list contains "the email below" and does NOT contain "the email above" (catches the stale directional pointer after the D1 relocation — a first-time user must not be sent to an email card that is now below, not above).
- `tests/components/admin/OnboardingWizard.test.tsx` — shell integration; should be unaffected (testids preserved). Run to confirm.
- `tests/e2e/onboarding-wizard-step1.spec.ts` — Playwright. Update selectors only if they assert removed box styling; the disclosures + copy flow persist.
- `tests/help/_affordance-matrix-shape.test.ts`, `tests/help/_uiLabelExceptions.ts` — HelpSheet affordance (`wizard-step1--tooltip`) unchanged; confirm still green.

**New transition-audit test** (required by writing-plans additions, component has a Transition Inventory): for **each** disclosure assert (a) the `<details>` carries `group`; (b) the chevron carries `group-open:rotate-180` + `transition-transform` (static className assertion — jsdom suffices for class presence; the actual rotation is CSS the browser applies); (c) the `<summary>` carries the native-marker-hiding classes `list-none` and `[&::-webkit-details-marker]:hidden` (D3). Concrete failure modes caught: a chevron added without `group-open` (rotation silently dead); a `<details>` missing `group` (chevron never rotates); a custom chevron added while the native triangle still shows (missing marker-hiding = double affordance).

**Step-1 structure/order test:** assert the no-folder `<details>` (`wizard-step1-no-folder`) is NOT a sibling inside the horizontal prompt row but **follows** it — i.e. the step-1 `<li>` contains an inner prompt row `<div>` and the disclosure is after it in document order (strict `compareDocumentPosition … FOLLOWING`, mirroring the explainer test). Failure mode caught: the disclosure placed as a third flex item to the right of the prompt (D1 row→column restructure skipped).

**Tap-floor assertion:** the transition-audit test also asserts both `<summary>` elements carry `min-h-tap-min` (DESIGN.md:185, §8). Failure mode caught: a summary restyled to the mock's 28px, regressing the accordion-handle tap floor.

**Anti-tautology:** the disclosure-nesting test asserts DOM ancestry (`wizard-step1-no-folder` is within the step-1 `<li>`, not merely present in the document), so a regression that renders it back as a standalone bottom box fails.

## 10. Meta-test inventory

**None created or extended.** This change touches no auth boundary, no DB write, no `admin_alerts`, no tile sentinel, no `pg_advisory*`, no Supabase call site, no email normalization, no `§12.4` code. The candidate registries (`_metaInfraContract`, `_metaAdminAlertCatalog`, `advisoryLockRpcDeadlock`, `no-inline-email-normalization`, `_metaMutationSurfaceObservability`) are all N/A — it is a pure presentational restyle of one client component with no server surface.

## 11. Invariants touched

- **Invariant 5 (no raw error codes in UI):** preserved — clipboard failure stays benign, no code surfaced.
- **Invariant 7 (spec canonical):** honored — §9.0 copy kept over the mock's drift (§2).
- **Invariant 8 (impeccable dual-gate):** `Step1Share.tsx` is under `components/` → `/impeccable critique` + `/impeccable audit` run on the diff before Codex review; HIGH/CRITICAL fixed or `DEFERRED.md`.
- Invariants 1–4, 6, 9, 10: N/A to this surface.

## 12. Out-of-scope / won't-do (disagreement-loop preempt)

- **Shell chrome** (top bar, step indicator, footer, Start over) — NOT touched; already matches the mock (§1). A reviewer noting "the mock shows a step indicator / Start over that isn't in this diff" should see they live in the shell, cited §1.
- **Mock copy** ("Why this email?", reworded body, 3-item sub-list) — deliberately NOT adopted; spec §9.0 wins (§2, invariant 7).
- **The one copy edit that IS made** — no-folder sub-step 3 "email above" → "email below" — is NOT copy re-opening; it is a factual-correctness fix forced by the D1 relocation (the referent moved). Keeping "above" verbatim would ship a broken instruction. This is the sole text change; all other §9.0 copy is verbatim.
- **`#74736d` explainer shade** — the mock's exact `text-text-faint` value is deliberately rejected for `text-text-subtle`; text-faint is AA-large-only / non-crew-actionable (DESIGN.md:28) and the 14px body needs AA-body contrast (§4). Not a drift; an a11y override.
- **Mock's 28px summary height** — deliberately NOT matched; both summaries are floored to `min-h-tap-min` (44px) per DESIGN.md:185, overriding the mock (§8).
