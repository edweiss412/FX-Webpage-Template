# Adversarial spec review — warning-card identity and placement (R1)

## Your role: REVIEWER ONLY

Do not fix issues, propose patches as commits, or imply changes you will make. Challenge the design and surface findings. Fixes are the implementer session's job in a separate dispatch.

Do NOT invoke any nested cross-model review (`/codex:adversarial-review`, the companion script, `/codex:review`) from inside this session. Your verdict comes from your own direct analysis.

## Scope

ONE artifact: `docs/superpowers/specs/2026-07-21-warning-card-identity-placement.md` (302 lines) in this worktree, branch `feat/warning-card-identity-placement`, based on `origin/main @ 2a868b132`.

Read the spec, then verify its claims against the live codebase in this checkout. You have tool access; use it to check every `file:line` citation you doubt.

## What the feature is

Autocorrect warning cards in the admin published-show modal (five `*_AUTOCORRECTED` parse-warning codes) currently render generic per-code catalog copy. The card names no crew member, quotes a FIXED example rather than the real correction, and for three of five codes ends with "Update the sheet if the spelling was intentional" — an instruction with no reachable action, because the matcher re-corrects any intentional spelling on the next sync.

Four changes: (1) a structured `ParseWarning.autocorrect` field; (2) instance copy rendered from the catalog's EXISTING `dougFacing` template; (3) under-row placement for the two crew-scoped codes; (4) warning groups nested into their section body instead of mounting as a sibling after the panel.

## EXPLICITLY DO NOT RELITIGATE

These are ratified. Verify the citation; do not re-derive or re-argue. Spec §1.1 carries all of them with citations.

1. **Cutting the trailing instruction for the three unfixable codes** rather than rewriting it. Ratified by the user 2026-07-20 after three options were weighed. The closed-vocabulary matcher (`lib/parser/personalization.ts:196`) makes every "fix it in the sheet" instruction a dead end for those codes; the card's existing Report/Ignore controls are the actions.
2. **Keeping the fix instruction for `COLUMN_HEADER_AUTOCORRECTED` and `FIELD_LABEL_AUTOCORRECTED`.** They correct a LABEL, not a vocabulary token, so a rename genuinely escapes the matcher.
3. **Instance copy REPLACES the generic guidance line rather than rendering alongside it.** User decision 2026-07-20, option B of three.
4. **Under-row placement is unconditional for crew-scoped codes, NOT gated on instance count.** The N=1-under-row / N>=2-grouped alternative was explicitly considered and rejected: placement would flip on a count the operator cannot see.
5. **ParseWarnings are NOT forced into `AttentionItem`.** The discriminated union at `lib/admin/attentionItems.ts:73-77` exists to make a payload-less alert item a compile error. Crew-scoped warning cards travel in a separate map.
6. **§4 (group nesting) is the deferral #532 explicitly named**, not a contradiction of it. See `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md` §1.1.

Arguing any of the six above is out of scope and will be discarded. Everything else is fair game.

## Where I most want adversarial pressure

Rank findings by whether they would cause a DEFECT or a wasted implementation round, not by how much you disagree with a phrasing.

### A. The `dougFacing` reuse (§4.1) — highest risk, newest decision

This is the least-reviewed part of the spec. It was NOT in the original ratified design; it emerged from the citation pass when `spec:lint` surfaced that the catalog already carries a `_<crew-name>_` slot for both crew-scoped codes.

Attack it hard:

- `dougFacing` is currently consumed by notify email templates (`lib/notify/templates/realtimeProblem.ts`) and the alert path via `messageFor(code, params)` (`lib/messages/lookup.ts:106`). Does rendering it on a THIRD surface (the warning card) break an assumption either existing consumer relies on? Is `dougFacing` semantically "email/alert copy" in a way that makes it wrong for an inline card?
- The spec strips a trailing sentence by exact suffix match and replaces a parenthetical. Is string surgery on catalog copy sound, or is it a maintenance trap that the §10.9 tripwire test only partially covers? Is there a case where the strip half-matches?
- `interpolate` (`lib/messages/lookup.ts:20-36`) leaves an unresolved placeholder INTACT. Spec §4.3 guards this by falling back when `subject` is null. Is that guard complete across every path that can reach the renderer?
- Does the `_<crew-name>_` emphasis marker interact correctly with `renderEmphasis` on this surface? Check `components/admin/PerShowActionableWarnings.tsx:204`.
- Is there a catalog-parity or coverage gate (#531 added `tests/messages/_metaPopoverContextCoverage.test.ts`) that this new consumer would violate or should extend?

### B. The two-mechanism emitter population (§3.2)

`STAGE_WORD_AUTOCORRECTED` populates `autocorrect` at its emit site (`lib/parser/blocks/crew.ts:342`). `ROLE_TOKEN_AUTOCORRECTED` cannot — `extractRoleFlags` is pure and never receives the crew name — so `subject` is stamped later at `lib/parser/blocks/crew.ts:367-372`.

- Verify that asymmetry is REAL by reading both sites. If `extractRoleFlags` can in fact see the name, the spec is wrong.
- Does the stamp site see EVERY `ROLE_TOKEN_AUTOCORRECTED` warning, or can one escape the map and reach a surface with `subject: null`?
- Are there OTHER producers of these five codes beyond the five sites in §3.2? A missed producer means a card that silently falls back forever. Sweep for it.
- The field is jsonb-persisted with no migration, mirroring `roleToken` / `resolution` (`lib/parser/types.ts:66`, `lib/parser/types.ts:76`). Is that precedent accurate, and is the no-migration claim safe for rows persisted BEFORE this change?

### C. Placement conservation (§5.4)

The invariant: every crew-scoped warning renders exactly once — under its row, or in the group, never both, never neither.

- `CREW_CAP = 30` (`components/admin/wizard/step3ReviewSections.tsx:152`) bounds rendered rows. The spec says an over-cap member's warning falls back to the group. Trace whether the proposed mechanism actually achieves that, or whether a warning can be dropped.
- Duplicate crew names: the spec adopts the alert path's `consumedAttentionKeys` rule (`components/admin/wizard/step3ReviewSections.tsx:1379`) verbatim. Under that rule a second row with the same canonical name renders NO cards. For alerts that is pre-existing behavior; for warnings it is NEW. Is silently dropping the second member's warning acceptable, or is that a defect this spec introduces by inheritance?
- `canonicalCrewKey(m.name || "")` on an empty/blank name: what key results, and can two unnamed members collide?

### D. Interaction with #532, merged hours ago

`origin/main @ 2a868b132` merged PR #532 (warning-surface trim), which cut the published Parse warnings panel to info-severity rows (`lib/admin/visibleWarningRows.ts:21`) and added `followUpCopy` to the card component.

- Spec §2.4 claims crew-scoped autocorrect warnings (severity `warn`) now render in EXACTLY ONE place. Verify that against the live gating. If they can still render twice, or can now render ZERO times, that is a P0.
- #532's `followUpCopy` composes into the popover body (`components/admin/PerShowActionableWarnings.tsx:114`). Spec §4.4 claims it is unaffected by the new inline-guidance path. Verify.
- Does the §6 nesting change break anything #532 just built in `ShowReviewSurface.tsx` or `step3ReviewSections.tsx`?

### E. Test plan rigor (§10)

Anti-tautology is a project rule. For each of the 9 tests:

- Does it prove behavior, or merely that a function was called?
- Test 3 asserts conservation "by identity against the MODEL, not by counting DOM nodes in a container that renders both." Is that scoping actually sufficient?
- Are the §8 dimensional invariants (4 rows, real-browser `getBoundingClientRect`, 0.5px) the RIGHT four? Is any parent/child relationship missing? Note Tailwind v4 does not default `.flex` to `align-items: stretch` in this project.
- What defect class does this plan NOT catch?

## Also check

- Internal contradictions between sections; numeric literals that disagree.
- Any claim about existing code that is wrong (`file:line`, function signature, field name, class name). Cite the correct value.
- Guard conditions: any prop/input whose null/empty/zero behavior is unspecified.
- Scope: is this one coherent change or does it need decomposition?

## Output format

For each finding:

```
[SEVERITY: BLOCKING | HIGH | MEDIUM | LOW] <one-line title>
Location: <spec section / line>
Claim: <what the spec says>
Reality: <what the code says, with file:line>
Impact: <the concrete defect or wasted round this causes>
```

Enumerate ALL instances of each finding class you identify in THIS round. A repeated vector dripped one instance per round is a review defect, not thoroughness. If you find one wrong citation, sweep for every wrong citation and list them together.

If a section is sound, say so briefly rather than inventing findings. A short, correct review beats a padded one.

End your response with a final line, exactly:

`VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`
