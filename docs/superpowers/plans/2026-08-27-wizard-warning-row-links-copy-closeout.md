# Closeout — sheet-warning rows link to their cell, and say only what their controls can do

Plan: `docs/superpowers/plans/2026-08-27-wizard-warning-row-links-copy.md`. Spec: `docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md` (canonical). Branch `fix/wizard-warning-row-links-copy`, worktree `/Users/ericweiss/FX-worktrees/wizard-warning-row-links`. Closes no ledger row; files `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS`. **bl-orch merges; this arc never did.**

## 12. Invariant 8 — the impeccable dual gate

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

**The UI surface.** Three files under `components/`: `PerShowActionableWarnings.tsx` (guidance composition, the condensed popover slots, the follow-up gate), `NoteWarningCard.tsx` (the same follow-up gate), `sectionWarningExtras.tsx` (the `showControlsNote` prop on the two active mounts). The wizard's step-3 row changed too, but through the catalog — no component edit — which is why it is in scope for the gate's copy findings and not for its markup ones.

Both halves ran as isolated sub-agents with cwd pinned to this worktree, after bl-orch reported that a spawned agent inherits the session cwd (the main checkout) and one arc had already written a PNG into it.

### Critique — 27/40, mid-band, "not AI slop; mild product slop"

Method: dual-agent (A: design review, opus; B: detector + deterministic evidence, sonnet), isolated until synthesis. Browser visualization SKIPPED: authenticated Next.js + Supabase admin surface, and the local Postgres was held elsewhere when the pair ran. Detector: `[]`, exit 0, on all three files.

The verdict worth keeping: *"the engineering judgment is right — a card must not name buttons it doesn't mount — but the chosen anatomy lands the sentence in the wrong place on one of the two mounts that opt in."* That is precisely the defect the audit independently found from the a11y side, and it is fixed.

| Finding | Tier | Disposition |
| --- | --- | --- |
| Condensed crew card routes the note into the `?` popover while its Report + Ignore buttons are visible inline | P1 | **FIXED** (`ee106b60c`), jointly with the audit's P2 below. The note keeps travelling with the guidance into the popover (spec §4.3, §11 row C — unchanged); what moved is its POSITION inside that body, from between the advice and the trigger explanation to last. |
| Naming buttons in prose duplicates the buttons; delete the note and put Ignore's consequence on the control | P1 | **REJECTED, ratification cited.** Deliverable (B) as Eric ratified it is that the three rows stop naming controls *where they do not render* — spec §1.1, first bullet. Deleting the sentence everywhere is a different product decision, and the wizard-row repair does not depend on it. Recorded here so a later reviewer does not re-derive it. |
| Class sweep missed `longExplanation`: `PULL_SHEET_PARSE_PARTIAL` still named Report, on the field `notePopoverParts` renders FIRST, on a controls-less card | P2 | **FIXED** (`ee106b60c`). The real find of the gate. Stripped, and the guard widened from `helpfulContext` to every rendered prose field of every card code — a derived cover, not a longer list. `followUp` is excluded and inventoried in the test itself: §12.4 routing prose, rendered only by the health-alert surface. |
| Anatomy: the note is string-joined into the guidance rather than positioned as its own slot | P2 | **REJECTED.** Spec §4.3 specifies "the last sentence of the inline guidance line, separated by one space, in the same `data-testid` element". The condensed path now does have its own slot, which is where the ordering defect actually was. |
| Instance (autocorrect) rows silently lose the note | P2 | **REJECTED.** Spec §4.3's guard table, row 5: an instance line is the composed autocorrect sentence and the note is a catalog-guidance affordance. §11's G4 exercises the suppression on an entry that HAS a note. |
| "so it matches the row we show" is circular | P3 | **NOTED, not changed.** The phrase is §12.4 prose and identical across four fields; rewording it is a catalog-wide copy arc, not this diff. |

### Audit — 0 P0, 0 P1, 1 P2, 6 P3

Static analysis only. Dev server, Playwright, `pnpm build` and the suite all SKIPPED by instruction (authenticated surface; the Postgres slot and the heavy slots were held). Line counts and popover heights in the audit are computed, not measured, and it says so.

| Finding | Tier | Disposition |
| --- | --- | --- |
| Condensed popover announces the action sentence mid-description, inside one `aria-describedby` run, then returns to "Appears when…" | P2 | **FIXED** (`ee106b60c`). `condensedPopoverSlots` gained a `trailing` slot, appended last. Same repair as the critique's P1. |
| `withControlsNote` exported with a docstring promising unit-testability, and no unit test; its `markup.length > 0` fallback unreachable from the only caller | P3 | **FIXED.** Five cases now drive spec §4.3's table directly, including the null-guidance-plus-blank-note fallback, which is reachable from a unit test and from nowhere else. |
| The 300-char `helpfulContext` cap stopped bounding the rendered line once two fields render in one span | P3 | **FIXED.** The composed length is capped beside the existing assertion. |
| `renderEmphasis` scans the composed string, so an unbalanced `*` in one field could open an `<em>` spanning into the other | P3 | **FIXED.** No `controlsNote` may carry `*` or `_`. No carrier does today; the point is that it stays that way. |
| `entry.controlsNote.trim()` called twice per item | P3 | **FIXED.** |
| The note is disclosure-only exactly where its buttons are visible | P3 | **ACCEPTED as designed** — and materially improved by the ordering fix. |
| Rendered contrast read from `DESIGN.md` rather than sampled | P3 | **ACCEPTED.** `text-warning-text` on `bg-warning-bg` is 9.5:1 light / 9.2:1 dark (`DESIGN.md:38`), AAA either way, and the diff changes no token. |

Verified clean by the audit, worth recording because each is a plausible worry: no `dangerouslySetInnerHTML` anywhere on the path (`renderEmphasis` returns React nodes, so a catalog string cannot inject markup); the `showControlsNote` promise holds against `Ignore`'s own `hasIgnorableSnippet` gate, because `emitUnknownField` always writes a `rawSnippet` and a new guard pins `UNKNOWN_FIELD` as the only code whose note names Ignore; the diff adds no interactive element, so the 44px floor is untouched; no i18n framework is present, so the hardcoded `" "` join is a documented non-concern.

### Pre-code mechanical checklist (spec §7)

Run on the three new strings and the three shortened ones: no em dash, no en dash, no curly quotes, straight apostrophes throughout, imperative lead on every action sentence. `_metaEmDashCopy` and the extended banned-vocabulary sweep both cover them from here on, and the sweep now includes `controlsNote`.

## 13. Dimensional invariants and transitions

Spec §10: none. No fixed-dimension parent gains a child; the guidance line is a text node in an existing flex column.

Spec §11's inventory is executable rather than described. `tests/admin/perShowActionableTransitions.test.tsx` grew from four synthetic variants to seven — G2 (guidance + note), G3 (note alone), G4 (an autocorrect instance line that must suppress a note the entry HAS) — and its pair matrix is now DERIVED over every ordered pair instead of six hardcoded ones, so all ten G-pairs run in both directions, and once more in condensed mode. Every assertion is synchronous after `rerender`, and each checks that the guidance node has no motion ancestor.

## 14. What this arc did not do

Filed, not repaired: `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS`. Two of the three near-miss rows on the dispatching show are noise — a Google-Form response dump and a gear inventory matrix are not "rows we show", so "rename this row so it matches the row we show" is wrong advice there whatever link it carries. Giving those rows a working link makes the wrong advice easier to follow, not less wrong. Which block shapes are legitimate near-miss homes is a product decision (class-sweep exception (a)), and the repair moves the 65-row measured baseline, so it is a calibrated detector arc with its own hit/miss table.

Documented limits are spec §9 and unchanged: duplicate `(kind, label, value)` on one tab resolves to the tab; a kind spanning two tabs resolves null; region anchors keep the allowlist; included `OLD`-tab regions never anchor; a literal pipe inside a cell fractures the row for the parser and the anchor is the whole cell; the hotel link is a block range, not a cell.
