# Warning-panel polish bundle — handoff

**Branch:** `feat/warning-panel-polish`
**Spec:** `docs/superpowers/specs/2026-07-22-warning-panel-polish-design.md` (adversarial-review APPROVE at R7, commit 6757a1622)
**Plan:** `docs/superpowers/plans/2026-07-22-warning-panel-polish/plan.md` (part A APPROVE at R3, part B at R4)
**Mode:** autonomous ship (owner approval 2026-07-21 at the brainstorming gate; spec/plan user gates waived)

## §1 Scope shipped

The seven owner-ratified changes graduating warning-surface-trim (2026-07-21) deferrals:

1. Popover trigger-context + follow-up as two paragraphs (`HoverHelp.afterBodyText`, spec §3.1)
2. Count-tuple live region on the published Parse-warnings panel (`lib/admin/warningsPanelStatus.ts`, spec §3.2)
3. Follow-up sentence excluded from per-card `aria-describedby` (learnMore-parity attribute triple, spec §3.1)
4. Seamless extras container in the Silent state (`opts.seamless`, spec §3.3)
5. Callout actionability gate (`INFO_CODE_ACTIONABILITY` + two-layer scanner, spec §3.4)
6. Pointer sentence names elsewhere sections, bolded + tappable scroll buttons (spec §3.5)
7. Stale `data-warning-index` comment corrected (spec §3.6)

## §2 Task-to-commit map

| Task | Commit | Note |
|------|--------|------|
| 1 registry + scanner | 598f1846b | scanner extended for `as const` (crew.ts:418 shape) during green phase |
| 2 HoverHelp afterBodyText | f0d1d5d16 | 6/6 quadrants; 2045 neighbor tests green |
| 3 popover threading | 7597ca7af | staged baseline unchanged |
| 4 live region + shared helper | 9778a0d76 | `tests/helpers/publishedSurfaceProps.tsx` created |
| 5 seamless seam + comment fix | b40bb6205 | change 7 rides this commit |
| 6 callout gate | b9f5bf4aa | swept pins: only `publishedGuidanceRetired.test.tsx` encoded the old sourceCell axis |
| 7 pointer sentence | c72b50554 | neighbor `publishedWarningsPanel.test.tsx` ELSEWHERE_COPY re-frozen |
| 8 e2e | 7bced664d | desktop-chromium testMatch wired; z-10 / inline-block / centered-scroll / atomic-probe repairs from the verification loop |
| 9 docs | (this commit) | DEFERRED graduation + this handoff |

## §3 Empirical findings recorded for future reviewers

- **The pre-change published callout could NEVER render**: the R2 `sourceCell` conjunct was dead
  on that branch because no info-severity emitter is in `OPERATOR_ACTIONABLE_ANCHORED`
  (`lib/parser/dataGaps.ts:370-391`). The DEFERRED re-gate P3 entry describing a rendering
  callout reflected the pre-R2 diff. Spec §3.4 states the behavior delta honestly.
- **Registry order beats input order** in the pointer sentence (Crew, Contacts, Hotels, Rooms &
  scope…), and production overflow is CAP overflow — every elsewhere section is a rendered
  registry section, so label-miss is a defensive guard with no live producer (pinned at the
  chrome level in `pointerSentence.test.tsx`).
- **Inline 44×44 overlays in prose need three things** (each found by a red e2e run): `z-10` so
  the overlay wins hit-testing against the card's padding box; `inline-block` so percentage
  positioning has a deterministic containing block; and center-scrolling before geometry probes
  so the mobile sticky chip rail cannot overlap the probe zone. Probes must be ATOMIC (measure +
  probe in one evaluate) — the modal's post-open refresh detaches first-mounted nodes.
- **`published-show-attention.spec.ts` is not in any playwright testMatch** (pre-existing;
  discovered while wiring the new spec). Not repaired here — out of scope; flagged for the next
  e2e-touching PR.

## §4 Sibling-main events during the run

- PR #546 (attention split) merged into main mid-run; rebase + full gate re-run happens at
  close-out per plan.
- Nightly `mutation-harness` on main failed with benign fingerprint drift from the merged parser
  `autocorrect` field (`7295d794c`); dispositioned per repo policy as
  `BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT` (BACKLOG.md, commit 13f20b3c8). Non-required,
  path-filtered workflow; gates nothing on this PR.

## §5-§11 (reserved)

Numbered-section scaffold per invariant 8; sections not applicable to this bundle are reserved
rather than renumbered so §12 keeps its contractual name.

## §12 Impeccable dual-gate findings + dispositions

_Populated at close-out after `/impeccable critique` + `/impeccable audit` run on the diff._
