# Theme persist-failure note removal — record and close-out

**Branch:** `fix/theme-note-polish` · **Merge base:** `b30413cf5` · **PR:** #903 · **Date:** 2026-08-26 · **Spec:** `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md` §2.2, "Amendment, 2026-08-26"

This arc had no plan when it started, and this file is not a plan in the usual sense. It began as a two-row polish arc (`BL-THEME-NOTE-BUBBLE-TEXT-ALIGN`, `BL-THEME-NOTE-NO-DISMISS-AFFORDANCE`) and became a removal mid-flight when the owner ruled the note should not exist. It exists so the invariant-8 gate run has somewhere to live and so the ruling's consequences are recorded outside a PR description.

## What shipped

| Surface | Change |
| --- | --- |
| `components/layout/ThemeToggle.tsx` | The `role="status"` container, the bubble, and the positioning wrapper that only anchored it. Returns its button directly. |
| `components/auth/AvatarMenu.tsx` | Both nodes of the 2026-08-16 split shape: the `aria-hidden` visible paragraph and the root-level screen-reader-only announcer. |
| `components/layout/useAppliedTheme.ts` | The shared copy const and the persist-failure field, off the public shape and off internal state. The try/catch absorb stays, now silent by ruling. |
| `app/admin/settings/admins/RevokeRowButton.tsx` | Alignment class dropped from the self-last hint (class sweep). |
| `components/admin/settings/DeveloperToggleButton.tsx` | Alignment class dropped from the error alert (class sweep). |
| `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md` | Removal amendment at §2.2, doc-level retirement banner, §2.1 and §4 limit 5 marked retired. |
| `scripts/check-crew-e2e-executed.mjs` | Executed-count floor 4 to 5 for the rewritten e2e, and the comment above it rewritten to the cases that ship. |
| `tests/help/_renderFaultScan.ts` | Declared census figures re-derived after the removal changed the population: 719 to 717 ternaries, 79 to 77 vocab-guarded, 70 to 68 client. |

## Test evidence

- **Unit.** The three note suites inverted to pin ABSENCE. Every case carries a premise only a working control satisfies (the applied theme actually changes), because `queryBy...` returning null is also what a broken render returns. The hook's absence uses an `in` check, not `toBeUndefined()`, since an absent key and a key set to `undefined` are indistinguishable to the latter. `tests/components/Header.test.tsx` gains the structural pin for the third consumer.
- **Real browser**, 5 cases, desktop-chromium, theme storage key blocked surgically: a blocked write applies the theme and renders no note in the help header and the admin nav at 320px; the toggle keeps a 44px-plus target and the page does not overflow; the help header's trailing link still sits clear of the toggle. That last case is the wrapper-removal regression check.
- `tests/e2e/appHealthIndicator.layout.spec.ts` green **UNMODIFIED**, as the independent regression check on the admin cluster row.
- The mechanical UI guards (em-dash copy, tap-target floor, control-outline fill, canonical class callee, live-region mounting) run green: 360 cases.

## 12 — impeccable dual gate (invariant 8)

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=0 dispositions=none

**⚠️ DEGRADED: single-context (both isolated sub-agents were dispatched and went idle without delivering a report; each was pinged once and re-dispatched once, then run inline).** Recording it rather than presenting the run as clean, per the command's own rule that a silent degraded critique is a failed critique. What that costs: Assessment A and Assessment B were not blind to each other, so the detector output could anchor the design judgment. The deterministic half is unaffected, and it is the half that carries the evidence.

**Detector (Assessment B, deterministic).** `detect.mjs --json` over the five touched UI files: **exit 0, zero findings.** `eslint` over every changed source file: **exit 0, no messages.** Browser evidence came from this arc's own Playwright run rather than an injected overlay: 5 shipped cases plus an 8-reading probe across two consumers, two widths (320px, 390px) and both palettes.

**Critique (Assessment A).** No AI-slop tells: the diff removes UI rather than adding it, and what remains is a plain icon button on design tokens. Heuristic scores, 0-4, honestly against the shipped state rather than against the ruling:

| # | Heuristic | Score |
| --- | --- | --- |
| 1 | Visibility of system status | 2 |
| 2 | Match with the real world | 4 |
| 3 | User control and freedom | 4 |
| 4 | Consistency and standards | 4 |
| 5 | Error prevention | 3 |
| 6 | Recognition over recall | 4 |
| 7 | Flexibility and efficiency | 4 |
| 8 | Aesthetic and minimalist design | 4 |
| 9 | Recognize, diagnose, recover from errors | 2 |
| 10 | Help and documentation | 3 |

Heuristics 1 and 9 score 2, and that is the ruling's cost stated plainly rather than scored around: a device that cannot persist gets the theme for the visit and is never told the choice will not survive. That is a product decision the owner made, not a defect this diff introduced, and it is carried as documented limit 3 below.

**Audit dimensions:**

| # | Dimension | Score | Note |
| --- | --- | --- | --- |
| 1 | Accessibility | 4 | A live region was deleted, but sighted and assistive parity holds: both get silence. The unrelated `avatar-menu-switch-announcer` survives and a test names it, so the removal cannot be satisfied by deleting the wrong region. |
| 2 | Performance | 4 | Strictly fewer nodes, one less state field, one less re-render trigger, no wrapper element. |
| 3 | Theming | 4 | Token classes only, no hex literals. Both palettes measured to identical geometry. The `text-subtle` on `surface-raised` contrast pin was kept and re-anchored rather than deleted with the note. |
| 4 | Responsive | 3 | Measured at 320px and 390px in two of three consumers. The crew header branch is unmeasured in a real browser (limit 1). |
| 5 | Anti-patterns | 4 | Nothing added; an out-of-flow bubble that overlaid content was removed. |
| | **Total** | **19/20** | Excellent |

**Dispositions.** No P0 and no P1, which is why the marker reads `dispositions=none`: there is nothing at those tiers to disposition, and the guard's cross-check refuses `recorded` on a zero count. Both halves are marked `RAN-DEGRADED` rather than `RAN` because the run was single-context, per the banner above. The two P2/P3-tier observations are the documented limits below, both recorded rather than filed: this arc files no `BL-`/`DEF-` row of any facing, per the owner's 2026-08-25 directive.

## Documented limits carried forward

1. **The crew header branch has no real-browser coverage.** `components/layout/Header.tsx` mounts the standalone toggle only when no identity resolves, and reaching that in e2e needs a seeded show, a share token, and no picked identity. It is pinned structurally in jsdom instead (`tests/components/Header.test.tsx`), which proves the wrapper is gone but not that the row lays out. **Re-file trigger:** any report of the crew header's right slot misaligning, or the next arc that already has that fixture standing up.
2. **`pnpm spec:lint` reports two `CITATION_SYMBOL_ABSENT` advisories** on the spec's retired sections, which necessarily name symbols the code no longer has. Exit code stays 0, and the spec's own banner records it. **Re-file trigger:** the advisory count moving for any reason other than these two.
3. **A permanently storage-blocked device is now silent by design.** The user picks a theme, gets it for the visit, and finds it reverted on the next load with no explanation ever offered. That is the ruling, recorded here as its accepted cost rather than as an open question. **Re-file trigger:** a real report of a crew member confused by the revert, which is the evidence the original entry `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` never had.

## No mutation score

`tests/mutation/source/registry.ts` holds 53 `sourcePath` rows and none names a path under `components/` or `app/`. No surface here is enrolled, the registry cannot express a rendered-geometry claim, and enrolling a component surface under review pressure is declined: the step3-a11y probe already measured what happens when someone tries. This arc states no score and owes none.
