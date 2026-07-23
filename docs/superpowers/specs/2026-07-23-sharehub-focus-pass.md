# Share-hub popover focus-treatment pass (SHAREHUB-FIDELITY-IMPECCABLE-RESIDUE close-out)

**Date:** 2026-07-23
**Status:** Ratified (autonomous-ship run; user approved 2026-07-22, spec/plan review gates waived)
**Owner surface:** ShareHub popover (`components/admin/showpage/ShareHub.tsx`) and the five control components it renders (`ShareLinkCopyButton`, `RotateShareTokenButton`, `PickerResetControl`, `ArchiveShowButton`, `UnarchiveShowButton`).

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
| Copy button (3 variants; popover renders ONLY `variant="accent"`, the `app/admin/show/[slug]/ShareLinkCopyButton.tsx:98` branch — `components/admin/showpage/ShareHub.tsx:440` render site; `app/admin/show/[slug]/ShareLinkCopyButton.tsx:96` / `app/admin/show/[slug]/ShareLinkCopyButton.tsx:106` render on non-popover surfaces and are UNTOUCHED by this diff) | plain | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:96`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx:98`, `app/admin/show/[slug]/ShareLinkCopyButton.tsx:106` |
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
- **DESIGN.md focus prose is updated IN-BRANCH** (superseding this spec's earlier
  "does not edit DESIGN.md" stance, per the impeccable-critique P2 finding): the token-table
  focus-ring cell now states the 2px ring, the no-bare-offset rule, and points at this
  spec's §2; the §15 confirm-go paragraph records the popover two-tier scoping. Commit
  `c53bb8e75`.

## 2. The two-tier rule

Within the share-hub popover (and the touched components wherever they render):

- **Tier 1 — every ordinary control:** `focus-visible:ring-2 focus-visible:ring-focus-ring`
  with NO offset. Applies to: menu rows (rotate, reset, archive, mailto), triggers, cancel
  buttons, the copy button, the unarchive button.
- **Tier 2 — armed destructive confirm buttons only:** tier 1 PLUS
  `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Applies to: rotate armed
  confirm, reset armed confirm, archive armed confirm. Primary justification: DESIGN.md §15
  already mandates a container-matched focus offset for confirm-go buttons ("Focus-ring
  offset matches the surrounding container"), so tier 2 is that existing rule applied
  consistently — preserving §4.1's intent (destructive confirms keep a distinct treatment).
  Secondarily the gap adds visual weight at the point of no return for sighted keyboard
  users — a nicety, not a load-bearing danger cue (danger is carried by the armed copy +
  `aria-describedby`, never by the ring).

Rationale for the tier boundary: "armed confirm" = the button whose activation irreversibly
commits the destructive action (rotate = old link dies, reset = every pick cleared, archive =
crew links stop working). Cancel buttons and the rows that ARM the confirm are ordinary
navigation/arming steps — a focus ring differentiating them buys nothing and crowds 44px rows
in a 308px panel.

Unarchive is deliberately tier 1: it is a single-tap, non-destructive, recoverable lifecycle
action with no armed state (`components/admin/UnarchiveShowButton.tsx:8-10` — "Unarchive is
SAFE (it exposes nothing — the show lands in Held, which is crew-unreachable via the
`!published` gate) … a single tap dispatches").

`ring-offset-surface` is correct for every LIVE tier-2 render: the only render site is the
popover, whose panel is `bg-surface` (`components/admin/showpage/ShareHub.tsx:420`). For the
unreachable non-row archive confirms, `ring-offset-surface` is the component-family DEFAULT,
not a proven backdrop match — the non-row wrapper and armed `<form>` carry no background
class of their own (`components/admin/ArchiveShowButton.tsx:312-345`), so the actual backdrop
is whatever a future host provides. A future non-surface host must restyle the offset color;
what this pass guarantees is only that the offset gap is never the un-themed default white.

## 3. Changes

### 3.1 Code (9 changed class-string lines across 4 files; 1 further line confirmed already-correct)

1. `app/admin/show/[slug]/PickerResetControl.tsx:276` (reset row): REMOVE
   `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
2. `app/admin/show/[slug]/PickerResetControl.tsx:250` (reset cancel): REMOVE the same pair.
3. `app/admin/show/[slug]/PickerResetControl.tsx:240` (reset armed confirm): UNCHANGED —
   already the tier-2 recipe.
4. `app/admin/show/[slug]/RotateShareTokenButton.tsx:336` (rotate armed confirm): ADD
   `focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
5. `components/admin/ArchiveShowButton.tsx:396` (archive armed confirm, row variant): ADD
   the pair.
6. `components/admin/ArchiveShowButton.tsx:321`, `components/admin/ArchiveShowButton.tsx:322`
   (non-row ARMING triggers, compact + full): REMOVE the bare
   `focus-visible:ring-offset-2` — an arming trigger is tier 1 wherever it renders, and the
   bare offset is the dark-halo defect.
7. `components/admin/ArchiveShowButton.tsx:398`, `components/admin/ArchiveShowButton.tsx:399`
   (non-row ARMED CONFIRMS, compact + full): ADD `focus-visible:ring-offset-surface` next to
   the existing `ring-offset-2` — an armed destructive confirm is tier 2 wherever it renders.
   These non-row branches are currently unreachable — the component's only render site is the
   popover row variant (`components/admin/showpage/ShareHub.tsx:557`) — but the tier rule is
   applied by control ROLE, not render site, so future reuse cannot resurrect the un-themed
   white halo or the tier mismatch. (See §2's caveat: for these branches `ring-offset-surface`
   is the family default, not a proven backdrop match.)
8. `components/admin/UnarchiveShowButton.tsx:72`: REMOVE bare `focus-visible:ring-offset-2`
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
  - Tier-1 inventory (positive AND negative): every ordinary popover control asserts the
    plain-ring tokens present AND forbids any `focus-visible:ring-offset-*` token — primary
    trigger (`share-hub-primary`), kebab (`share-hub-kebab`), mailto row
    (`admin-current-share-link-email-button`), copy button
    (`admin-current-share-link-copy-button` — the popover-rendered `variant="accent"` branch,
    the only copy variant inside the popover; the other two variants are unchanged code on
    non-popover surfaces, outside AC-1's "inside the popover" scope), rotate row + cancel
    (`admin-rotate-share-token-button`, `admin-rotate-share-token-cancel-button`), reset row
    + cancel (`picker-reset-all-button`, `picker-reset-cancel-button`), archive row trigger +
    cancel (`archive-show-button`, `archive-show-cancel-button`), unarchive
    (`` `unarchive-show-button-${showId}` `` — dynamic suffix,
    `components/admin/UnarchiveShowButton.tsx:69`). Catches: pass reverted, base ring token
    lost, bare offset (white halo) sneaking onto a tier-1 control.
  - Tier-2: the three armed destructive confirms (`picker-reset-confirm-button`
    `app/admin/show/[slug]/PickerResetControl.tsx:239`,
    `admin-rotate-share-token-confirm-button`
    `app/admin/show/[slug]/RotateShareTokenButton.tsx:335`,
    `archive-show-confirm-button` `components/admin/ArchiveShowButton.tsx:387`) contain BOTH
    `focus-visible:ring-offset-2` AND `focus-visible:ring-offset-surface` plus the base ring
    tokens, AND forbid any other `focus-visible:ring-offset-*` token
    (`/^focus-visible:ring-offset-(?!2$|surface$)/`). Catches: tier-2 dropped, the
    bare-offset halo class reappearing without its color, and a stray extra offset token
    (e.g. `ring-offset-white`) overriding the surface color while every positive assertion
    stays green. The non-row `ArchiveShowButton` assertions apply the same exact-pair
    negative.
  - Non-row Archive variants (`tests/components/admin/ArchiveShowButton.test.tsx`, which
    already renders the full + compact variants directly): trigger forbids any offset token;
    armed confirm has the full pair — in BOTH variants. Catches: the four non-row edits
    (§3.1 items 6-7) being silently omitted, which the popover-only suite cannot see.
  - Anti-tautology: every assertion targets a specific `data-testid` element, never a
    container scan, via the token-set `expectClasses` helper
    (`tests/components/admin/showpage/_rowAssertions.ts:56` — substring matches cannot fake
    a token).
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
- AC-2: zero bare `ring-offset-2` (offset without explicit offset color) remains in the four
  edited source files.
- AC-3: full local gates green (scoped suites + `pnpm test` + typecheck + eslint +
  format:check), impeccable dual-gate P0/P1-clean on the diff, real CI green.
- AC-4: DEFERRED entry graduated to archive.

## 5. Dimensional Invariants

N/A — the diff changes focus-ring utility classes only; no fixed-dimension parent, no
flex/grid child relationship, no layout surface is created or altered. (`ring` utilities
paint via `box-shadow`, which does not participate in layout.)

## 6. Transition Inventory

The touched controls have two orthogonal state axes: focus (`unfocused` / `focus-visible`)
and control lifecycle (`idle` / `armed` / `resolving`, where the destructive controls swap
DOM between idle row and armed confirm+cancel). This diff changes WHICH ring tokens render,
never HOW any state transitions — but per the inventory rule every pair is declared:

| Transition | Treatment |
| --- | --- |
| unfocused → focus-visible (any control, either tier) | Instant. Rings are `box-shadow`; every touched control declares only `transition-colors` or `transition-opacity` (grep over the six files: 17× `transition-colors`, 5× `transition-opacity`, zero `transition-all`/`transition-shadow`), so box-shadow is not an animated property. Matches `DESIGN.md:238` (`--duration-instant`: focus rings intentionally not animated). |
| focus-visible → unfocused | Instant — same mechanism. |
| idle → armed (row swapped for confirm + cancel) | Pre-existing DOM replacement + programmatic focus move; unchanged by this diff. The newly mounted confirm's tier-2 ring appears instantly (new node, no transition from a prior value). |
| armed → idle (cancel tap or 4s auto-revert) | Pre-existing DOM replacement + focus restore to the trigger ref; unchanged. Tier-1 ring on the restored trigger appears instantly. |
| armed → resolving (confirm tapped, `disabled`/`aria-busy`) | Pre-existing `disabled:opacity-60` styling via `transition-opacity`/`transition-colors`; ring tokens unchanged during resolving; no ring animation. |
| idle → resolving (single-tap controls: unarchive, copy — no armed state) | Pre-existing `disabled`/`aria-busy` styling via `transition-colors`/`transition-opacity`; ring tokens unchanged (tier 1 throughout); no ring animation. |
| resolving → idle (action settles or errors) | Pre-existing re-render; ring tokens unchanged, instant. (The armed family reaches resolving only via armed; unarchive is the live idle→resolving producer.) |
| Compound: auto-revert fires WHILE the confirm is focus-visible | Confirm unmounts, focus restores to the trigger; tier-2 ring is replaced by the tier-1 ring in one paint (both instant). No crossfade — two different nodes. |
| Compound: focus-visible held WHILE armed → resolving | Ring persists with identical tokens; only fill/opacity animates (pre-existing). |

On the `DESIGN.md:239` "ring-show" entry under `--duration-fast`: that names ring
micro-interactions on OTHER surfaces (hover/press); no touched control declares a
box-shadow-animating transition class, so nothing in this diff participates in `ring-show`.
No new transition classes are added anywhere in the diff.

## 7. Meta-test inventory

None applies: no Supabase call boundary, no sentinel text, no admin-alert code, no advisory
lock, no email normalization, no mutation surface (class-string-only diff). Declared per the
writing-plans mandate; the plan restates it.
