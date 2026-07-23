# Share-hub popover focus-treatment pass (SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE close-out)

**Date:** 2026-07-23
**Status:** Ratified (autonomous-ship run; user approved 2026-07-22, spec/plan review gates waived)
**Owner surface:** ShareHub popover (`components/admin/showpage/ShareHub.tsx`) and the four control components it renders.

## 1. Problem

The share-hub popover mixes three keyboard-focus treatments by accident, not design. This is
the residue of the `share-hub-fidelity-fixes` impeccable dual-gate (DEFERRED.md entry
`SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE`), whose P2 finding — focus-ring inconsistency within
the popover — was parked pending "a deliberate focus-treatment pass across the whole
popover." This is that pass.

Current state (all cites at branch point `8e70ab0e4`):

| Control | Classes today | File:line |
| --- | --- | --- |
| Primary trigger + kebab | plain `ring-2 ring-focus-ring` | `components/admin/showpage/ShareHub.tsx:374`, `components/admin/showpage/ShareHub.tsx:375`, `components/admin/showpage/ShareHub.tsx:397` |
| Mailto rows | plain | `components/admin/showpage/ShareHub.tsx:456` |
| Copy button (all 3 variants) | plain | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:96`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx:98`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx:106` |
| Rotate row | plain | `app/admin/show/[slug]/RotateShareTokenButton.tsx:251` |
| Rotate armed confirm / cancel | plain / plain | `app/admin/show/[slug]/RotateShareTokenButton.tsx:336`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:346` |
| Reset row | `ring-offset-2 ring-offset-surface` | `app/admin/show/[slug]/PickerResetControl.tsx:276` |
| Reset armed confirm / cancel | offset pair / offset pair | `app/admin/show/[slug]/PickerResetControl.tsx:240`, `app/admin/show/[slug]/PickerResetControl.tsx:250` |
| Archive row trigger / cancel (row variant) | plain / plain | `components/admin/ArchiveShowButton.tsx:254`, `components/admin/ArchiveShowButton.tsx:300` |
| Archive armed confirm (row variant) | plain | `components/admin/ArchiveShowButton.tsx:396` |
| Archive non-row trigger variants | bare `ring-offset-2` (no offset color) | `components/admin/ArchiveShowButton.tsx:321-322` |
| Archive non-row armed confirm variants | bare `ring-offset-2` | `components/admin/ArchiveShowButton.tsx:398-399` |
| Unarchive button | bare `ring-offset-2` | `components/admin/UnarchiveShowButton.tsx:72` |

Two defects:

1. **Inconsistency.** Three treatments in one 308px panel with no rule deciding which
   control gets which.
2. **Dark-mode white halo.** Tailwind's `ring-offset-2` without a `ring-offset-<color>`
   companion paints the offset gap with the default `#fff`. On the dark theme's `--color-surface`
   (`#16171C`, `DESIGN.md:22`) that renders a white halo around the archive non-row variants
   and the unarchive button.

## 1.1 Resolved scope — do not relitigate

- **Option A ("two-tier") is the ratified treatment.** User chose it 2026-07-22 from a
  three-option visual mockup (A two-tier / B offset-everywhere / C plain-everywhere).
  Do not re-open B or C.
- **Spec `2026-07-20-share-hub-fidelity-fixes` §4.1 ratified retaining the reset offset
  pair verbatim** — for THAT diff, to avoid silently changing a destructive control's focus
  treatment in a fidelity fix. Its stated un-defer trigger was exactly this deliberate pass;
  removing the row's offset here is the sanctioned supersession, not a violation.
- **Caret stays shadowless (P3 ratified 2026-07-22).** A drop shadow on the rotated 10px
  diamond (`components/admin/showpage/ShareHub.tsx:591`) casts a smudge rather than
  continuing panel elevation, and the HoverHelp caret — a border-triangle at
  `components/admin/HoverHelp.tsx:622` — is likewise shadowless. No code change; the
  DEFERRED entry graduates with this disposition recorded.
- **P1 caret anchoring is already resolved** (commit `cdf3a1012`, merged; test `T-HUB-CARET`
  + `T-HUB-CARET-KEBAB` in `tests/e2e/published-review-modal.interactions.spec.ts`). Out of
  scope here.
- **Codebase-wide focus sweep is OUT of scope.** ~156 `ring-offset-2` usages exist across
  `app/` + `components/`; this pass touches only the popover's own controls plus the touched
  components' sibling variants (dark-halo fix). A global pass is a separate future decision.
- **`ResetPickerEpochButton` (`app/admin/show/[slug]/ResetPickerEpochButton.tsx`) is a
  different component** (developer maintenance surface, not the popover) and is untouched;
  its test's `ring-offset-2` assertions are out of scope.
- **DESIGN.md token-table prose** (`DESIGN.md:40`: "3px ring + 2px offset") describes the
  focus-ring COLOR token, not a binding per-control recipe; the codebase ships `ring-2`
  everywhere (zero `ring-3` matches). This spec does not edit DESIGN.md's table; the
  two-tier recipe is recorded in §2 below and in the DEFERRED archive disposition.

## 2. The two-tier rule

Within the share-hub popover (and the touched components wherever they render):

- **Tier 1 — every ordinary control:** `focus-visible:ring-2 focus-visible:ring-focus-ring`
  with NO offset. Applies to: menu rows (rotate, reset, archive, mailto), triggers, cancel
  buttons, the copy button, the unarchive button.
- **Tier 2 — armed destructive confirm buttons only:** tier 1 PLUS
  `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Applies to: rotate armed
  confirm, reset armed confirm, archive armed confirm. The offset gap gives the
  point-of-no-return commit extra focus weight, preserving the intent behind §4.1's original
  ratification (destructive controls keep a distinct treatment) while making it systematic.

Rationale for the tier boundary: "armed confirm" = the button whose activation irreversibly
commits the destructive action (rotate = old link dies, reset = every pick cleared, archive =
crew links stop working). Cancel buttons and the rows that ARM the confirm are ordinary
navigation/arming steps — a focus ring differentiating them buys nothing and crowds 44px rows
in a 308px panel.

Unarchive is deliberately tier 1: it is a single-tap, non-destructive, recoverable lifecycle
action (`components/admin/UnarchiveShowButton.tsx:10` — "a single tap dispatches"); it has no
armed state and restores access rather than revoking it.

`ring-offset-surface` is correct (not `-bg`/`-raised`): every tier-2 button renders on the
panel's `bg-surface` (`components/admin/showpage/ShareHub.tsx:420`).

## 3. Changes

### 3.1 Code (9 class-string line edits, 4 files)

1. `app/admin/show/[slug]/PickerResetControl.tsx:276` (reset row): REMOVE
   `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
2. `app/admin/show/[slug]/PickerResetControl.tsx:250` (reset cancel): REMOVE the same pair.
3. `app/admin/show/[slug]/PickerResetControl.tsx:240` (reset armed confirm): UNCHANGED —
   already the tier-2 recipe.
4. `app/admin/show/[slug]/RotateShareTokenButton.tsx:336` (rotate armed confirm): ADD
   `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
5. `components/admin/ArchiveShowButton.tsx:396` (archive armed confirm, row variant): ADD
   the pair.
6. `components/admin/ArchiveShowButton.tsx:321`, `components/admin/ArchiveShowButton.tsx:322`, `components/admin/ArchiveShowButton.tsx:398`, `components/admin/ArchiveShowButton.tsx:399` (non-row variants): ADD
   `focus-visible:ring-offset-surface` next to the existing bare `ring-offset-2` (dark-halo
   fix). These branches are currently unreachable — the component's only render site is the
   popover row variant (`components/admin/showpage/ShareHub.tsx:557`) — but they are kept
   consistent so future reuse does not resurrect the halo. The non-row backdrop is also
   `bg-surface` per the component's own class strings.
7. `components/admin/UnarchiveShowButton.tsx:72`: REMOVE bare `focus-visible:ring-offset-2`
   (tier 1; also removes the halo).

No DOM structure, copy, color-token, spacing, or behavior changes. No new tokens. No DB.
Guard-condition/cap/transition/dimensional sections: N/A — no prop, mode, list, state, or
layout surface changes; the diff is focus-ring utility classes only.

### 3.2 Tests (TDD — tests change first)

- `tests/components/admin/showpage/shareHub.test.tsx:485-505` ("reset idle state … keeps its
  ring offset"): rewrite to the new contract — reset row asserts tier 1 (offset pair in
  `forbids`, not `exactly`), renamed accordingly.
- New/extended assertions pinning the two-tier contract, each stating its concrete failure
  mode:
  - Reset row + reset cancel: `className` DOES NOT contain `ring-offset` (catches: pass
    reverted / partial application).
  - Rotate armed confirm, reset armed confirm, archive armed confirm (row variant): contain
    BOTH `focus-visible:ring-offset-2` AND `focus-visible:ring-offset-surface` (catches:
    tier-2 dropped, and the bare-offset halo class reappearing without its color).
  - Unarchive button: does NOT contain `ring-offset` (catches: halo regression).
  - Anti-tautology: assertions target the specific `data-testid` buttons
    (`picker-reset-all-button`, `admin-rotate-share-token-button` confirm,
    `archive-show-confirm-button`, `` `unarchive-show-button-${showId}` `` — dynamic suffix,
    `components/admin/UnarchiveShowButton.tsx:69`), not a container scan.
- Existing suites for these components must stay green (`tests/components/admin/showpage/shareHub.test.tsx`,
  `tests/components/ResetPickerEpochButton.test.tsx` untouched).

### 3.3 Docs

- `DEFERRED.md`: remove the `SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE` block; add graduation
  note to the "Last reconciled" header line.
- `DEFERRED-archive.md`: append the entry with final dispositions (P1 resolved
  `fix/sharehub-caret-anchor`; P2 resolved by this pass, two-tier rule stated; P3 ratified
  no-shadow with HoverHelp precedent).

## 4. Acceptance criteria

- AC-1: every interactive control inside the popover carries `focus-visible:ring-2
  focus-visible:ring-focus-ring`; ONLY the three armed destructive confirms additionally
  carry `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
- AC-2: zero bare `ring-offset-2` (offset without explicit offset color) remains in the five
  touched files.
- AC-3: full local gates green (scoped suites + `pnpm test` + typecheck + eslint +
  format:check), impeccable dual-gate P0/P1-clean on the diff, real CI green.
- AC-4: DEFERRED entry graduated to archive.

## 5. Dimensional Invariants

N/A — the diff changes focus-ring utility classes only; no fixed-dimension parent, no
flex/grid child relationship, no layout surface is created or altered. (`ring` utilities
paint via `box-shadow`, which does not participate in layout.)

## 6. Transition Inventory

N/A — no visual state, mode, or conditional render is added or removed. Focus rings are
`--duration-instant` by design-system rule (`DESIGN.md:238`: focus rings intentionally not
animated); this diff does not change that.

## 7. Meta-test inventory

None applies: no Supabase call boundary, no sentinel text, no admin-alert code, no advisory
lock, no email normalization, no mutation surface (class-string-only diff). Declared per the
writing-plans mandate; the plan restates it.
