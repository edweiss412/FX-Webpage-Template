# Close-out — SETTINGS-DEVROW-GALLERY-RESIDUE-1

**Branch:** `fix/settings-devrow-gallery-residue`
**Spec:** `docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md` (Codex APPROVE at R5)
**Plan:** `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/plan.md` (same APPROVE)

## 1. What shipped

All four deferred impeccable findings from the 2026-07-21 settings-attention-gallery-link
gate, closed one per task:

| Finding | Closed by |
| --- | --- |
| 1 — [P2] bare "Open" in a screen-reader link list | hidden `sr-only` qualifier; accessible name `Open developer tools`, visible label unchanged |
| 2 — [P2] link label vs destination heading | the destination `<h1>` moved to `Attention gallery`; the link label is untouched |
| 3 — [P3] `devLinkClass` diverges from its sibling | `transition-colors duration-fast` added to the shared literal. **Transition half only** |
| 4 — [P3] description does not mention the gallery | now `Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.` |

Plus one class-sweep fix found by the gate (§12) and one structural guard
(tests/docs/\_metaDeferralLedgerGraduation.test.ts).

## 2. Spec / plan review rounds

Codex, 5 rounds, 26 findings accepted and repaired, 1 refuted with measurement.

| Round | Verdict | Findings |
| --- | --- | --- |
| R1 | NEEDS-ATTENTION | 5 — transition inventory, accessible-name mechanics (refuted), T7 brittleness, count mismatch, test-file ambiguity |
| R2 | BLOCKING | 8 — TDD red state, unimported `readFileSync`, premature PR number, substring-vs-token assertions, unscoped offset predicate, `aria-label` escape hatch, closeout ambiguity, undercounted scope |
| R3 | BLOCKING | 5 — the R2 red-state repair was not a red state, post-review diff mutation, `icon` guard contract, counts again, narrow grep |
| R4 | BLOCKING | 8 — red trunk at a commit boundary, surviving backfill sentence, false-green §12 assertion, `isDeveloper` fail-closed claim, four file inventories, contract count, vitest project wiring, registry comment |
| R5 | **APPROVE** | none |

**The one refutation.** R1 claimed the accessible-name algorithm normalizes a flat
accumulated string, making the JSX whitespace placement irrelevant and T1
non-discriminating. A throwaway jsdom probe measured all three forms against the
installed `dom-accessibility-api@0.5.16`: space inside the `sr-only` span →
`Opendeveloper tools`; span on its own line → `Opendeveloper tools`; space as a visible
text node on the same line → `Open developer tools`. The claim is wrong and the
formatting is load-bearing. Recorded here so a future reviewer does not re-derive it.

**Two repairs were themselves rejected and superseded** (R2 F1 → R3 F1 → R4 F1 on the
red-state vector; R2 F3 → R3 F2 → R4 F2 on the PR-number backfill). The red-state vector
recurring twice is what triggered shipping the structural guard instead of a third prose
patch.

## 3. Deviation from the approved plan

One, recorded rather than silently absorbed. Both the spec and the plan specified
`new URL(..., import.meta.url)` for the two file-reading tests. That throws
`TypeError: The URL must be of scheme file` under vitest's transform, because
`import.meta.url` is not a `file:` URL there — a false red that hides the real
assertion. Both readers use `join(process.cwd(), ...)` instead, the convention
`tests/cross-cutting/vitest-projects-partition.test.ts` already uses. Caught by the
task's own rule to confirm what the red state fails on; spec and plan were corrected to
match reality in the same commit.

## 4. Sibling merge reconciled

`origin/main` moved twice mid-flight: #574 (AGENTS.md split into `docs/agents/`) and
#575 (gallery write guard, which touches
`app/admin/dev/attention-gallery/page.tsx` — the same file as finding 2). Merged before
the gate ran; the merge is clean and the `<h1>` change survived. The branch's diff
against `origin/main` is 11 files, none of them accidental.

## 12. Invariant-8 impeccable gate

⚠️ **DEGRADED: single-context (sub-agent delegation declined by standing session
instruction).** Both assessments ran inline in this context rather than as two isolated
sub-agents. Declared per the critique command's banner requirement; the detector half is
unaffected by the degradation.

**Setup gates:** `context.mjs` loaded PRODUCT.md + DESIGN.md (target
`components/admin/settings/DevToolsRow.tsx`); register = **product** (admin settings
surface, design serves the task), `reference/product.md` read.

### critique

**Assessment B (detector, deterministic):** `detect.mjs --json` over
`components/admin/settings/DevToolsRow.tsx`, `components/admin/ArchivedShowRow.tsx`,
`app/admin/dev/attention-gallery/page.tsx` → `[]`, exit 0. No anti-pattern hits.

**Assessment A (design review):**

| Tier | Finding | Disposition |
| --- | --- | --- |
| P2 | **The exact defect being fixed has a second instance.** `components/admin/ArchivedShowRow.tsx:85` renders a link whose accessible name is the bare word "Open" — and unlike the settings row's single instance, this one repeats once per archived show, so an out-of-context link list reads "Open, Open, Open". Strictly worse than the case under repair. | **FIXED in this diff.** `Open <span className="sr-only">{row.title ?? row.slug}</span>`; accessible name becomes `Open Old Show`, visible label unchanged. Asserted in `tests/components/admin/Dashboard-archived.test.tsx` with the same name-plus-clone-and-strip pair. Fixing rather than deferring follows the project's class-sweep rule: patching one instance of a shape while an identical worse instance stays is the whack-a-mole the rule exists to prevent. |
| P3 | `ArchivedShowRow.tsx:83` carries a bare `focus-visible:ring-offset-2`. | **Not raised as a finding — out of scope by ratification.** One of the ~90 app-wide bare offsets owned by `BL-FOCUS-RING-CONTRAST`; `DESIGN.md:40` bans adding one, and fixing it needs the per-backdrop color decision that backlog item owns. Recorded so a future reviewer does not re-derive it. |

**Strengths:** the copy change carries the product register's plain-language voice with
no jargon and no em dash; the fix mechanism (hidden text node, not `aria-label`) keeps
WCAG 2.5.3 label-in-name intact, so voice control on the spoken word "Open" still
matches; the transition lands on the shared literal, so the two links cannot drift.

**P0/P1:** none.

### audit

| Dimension | Score | Notes |
| --- | --- | --- |
| Accessibility | 4 | Two links gain descriptive accessible names; visible labels unchanged; no ARIA introduced (deliberately no `aria-label` — it would replace rather than extend the visible text and put label-in-name at risk on the next copy edit). Heading hierarchy unchanged; only the `<h1>`'s text moved. Focus indicators untouched. |
| Performance | 4 | One `transition-colors` on two links. `background-color` is paint, not layout; no layout-property animation. Two `sr-only` spans added, zero layout boxes. |
| Theming | 4 | `duration-fast` is a DESIGN.md token (`--duration-fast: 120ms`, `app/globals.css:215`). The `prefers-reduced-motion` block at `app/globals.css:411` rewrites it to `0ms` at `:root`, so the new transition inherits reduced-motion for free with no per-component opt-in. No hex, no hard-coded color. |
| Responsive | 4 | `min-h-tap-min` (44px) preserved on both links — the venue-floor phone requirement in PRODUCT.md. `sr-only` is `position:absolute` with a 1px clip, so it contributes no width and cannot change wrap behavior at 390px. The row is still `flex-wrap`. |
| Anti-patterns | 4 | Detector `[]`. None of the banned patterns present. |

**P0/P1:** none. Nothing deferred; the one P2 was fixed in-diff and the one P3 is an
already-ratified out-of-scope item with a backlog owner.

## 13. Verification

See the PR body for the full gate output (`pnpm test`, `typecheck`, `lint`,
`format:check`, plus the directly affected files and the vitest project-partition
meta-test).
