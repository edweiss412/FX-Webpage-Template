# Close-out — stacked mobile control band (feat/strip-mobile-reflow)

## §1 Shipped scope

Spec `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` (5
adversarial rounds to APPROVE) via plan
`docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` (6 rounds to
APPROVE). Below `sm` the review-modal subheader strip renders the 1B stacked
band (badge / publish settings row / divider / meta+Sync / divider / split
actions); the skeleton mirrors it row-for-row; parity spec E asserts ≤4px at
BOTH viewports (measured 215 == 215 at 390). Desktop unchanged. Resolves
`STRIP-MOBILE-WRAP-1` + `STRIP-SKELETON-MOBILE-BAND-1` (graduated to
DEFERRED-archive.md).

Implementation-measured spec correction (recorded in spec §3 R2): sync-age
clip mechanism is `max-sm:basis-0 max-sm:grow` — under `flex-wrap` an item
wraps at its hypothetical main size before shrink applies, so the drafted
`max-sm:shrink` produced a wrapped trigger instead of a clipped tail.

## §12 Impeccable dual-gate findings + dispositions

Critique (dual-agent, 2026-07-24): **32/40, 0×P0, 0×P1**; detector exit 0,
zero findings. Snapshot:
`.impeccable/critique/2026-07-24T17-38-08Z__components-admin-showpage-statusstrip-tsx.md`.

| Finding | Sev | Disposition |
| --- | --- | --- |
| Publish-state redundancy (badge + heading + sublabel + switch) | P2 | DEFERRED — badge state set is §1.1-ratified (user answer 2026-07-24); revisit on user feedback |
| Three bordered control treatments in one band | P2 | RATIFIED — "32px look, 44px hit" is the user's explicit answer (§1.1) |
| Divider/zone density (two full-bleed dividers) | P2 | RATIFIED — dividers are the user's 1B design source (§1.1) |
| Worst-case Edited-tail clip may read as a bug | P3 | DEFERRED — accepted in spec §3 R2; follow-up idea: mobile-abbreviated relative copy ("59m") |
| Sync affordance confidence (sub-hitbox skin) | P3 | RATIFIED with row 2 |

Audit (agent, 2026-07-24): **19/20** (A11y 4, Perf 4, Theming 3, Responsive
4, Anti-patterns 4). Zero P0/P1/P2.

| Finding | Sev | Disposition |
| --- | --- | --- |
| `text-subtle` on `surface-sunken` pill pair not pinned in DESIGN.md §1.2 | P3 | FIXED — §1.2 row added (6.09:1 / 6.94:1) + pinned in tests/styles/status-token-contrast.test.ts |
| SR "Published" 3× at <sm (badge + heading + aria-label) | P3 | RATIFIED — same redundancy class as critique row 1; badge states user-approved |

Audit positives recorded: breakpoint-correct accName swap; finalize-only
describedby holds on both arms; 44px real rects verified; zero desktop leak;
motion-reduce escape on the only new animation.

## Transition audit — conditional inventory (plan Task 9)

Diff animation surface: exactly `animate-spin motion-reduce:animate-none`
(ReSyncButton mobile icon, pending only). All other grep hits are
pre-existing `transition-colors` context lines.

| Conditional (added) | Maps to |
| --- | --- |
| `stateBadge` precedence arms (4) | spec §3 R0 states; §8 B pairs (instant) |
| D1 `{!archived ? (` | §3 presence rule; scanner registered 6→8 |
| D2 `{lastSyncedAt != null \|\| !archived ? (` | §3 presence rule; scanner registered |
| `isSettings` container/label/chip ternaries (4) | §5 breakpoint boundary (instant CSS swap) |
| `settingsSublabel` ternary | §3 R1 copy (instant) |
| spin `pending ?` className | §8 S idle↔pending |
| primary trigger arms (pre-existing, classes extended) | §5 |

## Adversarial-review triage log

Whole-diff review ran as two tight-scope dispatches (split-default rule).

**Components scope (codex, R1): NEEDS-ATTENTION, 1 finding.**
- P2 archived DEFERRED entries kept "Accepted, not fixed" prose verbatim,
  contradicting the resolution note. FIXED: superseded-historical preamble +
  RESOLVED-dated headings in DEFERRED-archive.md.

**Tests scope: codex died 3x (`no_o_file`, no verdict) — same-harness
fresh-eyes fallback per the #568 precedent. Verdict: NEEDS-ATTENTION, 3
findings, all fixed:**
- P2 §9.2(d) Sync-trigger HEIGHT assertion did not execute (only width).
  FIXED: admin-resync-button added to the >=44-tall loop
  (stackedBandLayout.spec.ts).
- P3 badge matrix used toContain. FIXED: exact trim().toBe.
- P3 Published/Draft pill tokens unlinked to the contrast pin. FIXED: jsdom
  recipe test asserting bg-surface-sunken/text-text-subtle + dot tokens.

Reviewer-verified sound (recorded so future rounds do not re-derive): worst
strings genuinely producer-derived; 18/18 testids exist; CI wiring real
end-to-end; determinism/containment/anchor-datum assertions non-vacuous;
flake surface clean (ephemeral port, workers:1, fonts.ready+rAF, static
HTML).
