# Close-out — Show Alert Compact

Spec: `docs/superpowers/specs/2026-07-20-show-alert-compact.md`. Plan: `00-plan.md`. PR #509.

Recorded unconditionally, including the gates that surfaced nothing — a clean run is a result.

## 1. Review rounds

| Gate | Outcome |
|------|---------|
| Spec adversarial R1 | 11 findings, ALL verified true against live code before repair, all repaired |
| Class sweep (self) | 2 further source-scanning constraints found and added to §10 |
| Spec adversarial R2 (inlined) | 30 findings; document rewritten whole rather than patched |
| Spec adversarial R3 | 3 dispatches, all `no_verdict` — proceeded on the AGENTS.md self-review ladder |
| Plan adversarial R1 (inlined) | 5 BLOCKING + 18 more; task list rewritten |
| Impeccable critique | AI-slop verdict low-moderate; 3 P1s (all contrast/affordance), fixed |
| Impeccable audit | 16/20; 3 NEW P1s fixed, P2/P3 dispositioned below |

**Dispatch reliability:** tool-using `codex exec` reviews died silently (`no_verdict`, `no_o_file`) on 15 of 18 attempts across whole-document, tight-scope, and post-cache-fix variants. The INLINED no-tool variant succeeded on the runs that produced R2 and the plan review. Recorded so a later session does not re-derive this ladder. Related memory: `feedback_codex_inlined_review_survives_tool_death.md`.

## 2. Findings fixed in this branch

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| C-P1a | P1 | `?` trigger's hover tint used `group-hover` with no `group` ancestor — never rendered | tint moved onto the glyph |
| C-P1b | P1 | trigger border `border-warning-text/40` ≈ 2.0:1, under the 3:1 non-text floor, on the only route to help | full-strength `border-warning-text` (8.79:1) |
| C-P1c | P1 | 10px caps micro-labels at `/70` = 4.01:1, under the 4.5:1 body floor (10px uppercase is NOT WCAG large text) | full-strength token + source-scan guard |
| A-P1.1 | P1 | Learn-more link announced "Learn more about what does this mean?" — `HoverHelp` strips a literal `Help: ` prefix to name it | `helpTriggerLabel(subject)` |
| A-P1.2 | P1 | every trigger in a stack shared one accessible name | same fix; subject disambiguates |
| A-P1.3 | P1 | `!` glyph 3.58:1 in LIGHT mode only (`bg-status-review`/`text-warning-bg`) at 10px bold | `bg-warning-text`/`text-warning-bg`, 8.79 light / 9.64 dark |
| A-P3.7 | P3 | trigger slot mounted even when the popover resolved to null, leaving an empty flex child and its gap | adapters consult `buildHelpPopoverBody` first |

Structural defense (AGENTS.md: ship it in the FIRST repair commit): `tests/components/admin/compactAlertCard.test.tsx` now source-scans all four compact-card surfaces for sub-threshold `warning-text` alpha. `status-token-contrast.test.ts` pins full-strength tokens only, so alpha variants were invisible to it. Proven by mutation: restoring the `/70` label fails the guard.

## 3. Deferred, with reasons

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| A-P2.4 | P2 | confirmed swap has no `aria-live` announcement and drops focus to `<body>` | PRE-EXISTING (published-show-alerts §5.4, R11 keeps the swap contract unchanged). Relocated by this diff, not introduced. Belongs with a focused a11y pass on the resolve flow |
| A-P2.5 | P2 | resolve button's `border-border-strong` on the amber card = 1.44:1, under 1.4.11 | PRE-EXISTING in `PerShowAlertResolveButton`, shared with other surfaces; fixing it here would change buttons outside this diff |
| A-P2.6 | P2 | AttentionBanner stack is loose siblings, not `ul`/`li` | PRE-EXISTING structure (the retired banner was also a bare div). The sibling surfaces get it right; worth a follow-up that changes `PublishedReviewModal`, which is outside this spec's scope |
| A-P3.8 | P3 | `aria-expanded` without `aria-controls` in tooltip mode | PRE-EXISTING `HoverHelp` contract, shared by all eight consumers |
| A-P3.9 | P3 | `text-[10px]` arbitrary value | no token below `--text-xs` (12px) exists; 11 repo-wide uses. Contrast passes |
| A-P3.10 | P3 | `usePathname()` per banner | required by the route gate (A4); the alternative reintroduces the client-hook coupling removed in Task 7 |
| C-P2 | P2 | micro-labels restate their values in 2 of 5 cases ("Seen · 2 occurrences") | copy judgement, not a defect; revisit if the band grows |
| — | — | popover clipping inside the modal's scroll container | descoped at spec time (A6), filed as `BL-HOVERHELP-PORTAL` |

## 4. Things this work discovered about the codebase

Recorded because each cost real time and would cost it again:

1. **jsdom loads no CSS here**, and the repo has zero `toBeVisible()` usages. A visibility assertion on a Tailwind `hidden` element is vacuous. Unit tests assert `aria-expanded` + the class; real visibility belongs to Playwright.
2. **`ReviewModalShell` fires `onClose` at the END of an exit transition.** A negative assertion made immediately after a popover closes passes even while the modal IS closing — the first version of the Escape test did exactly that.
3. **The motion scanner missed Tailwind's `animate-in`/`fade-in` utilities**, matching only arbitrary `animate-[…]`. Extended while proving the new rows load-bearing.
4. **With a real mouse, `HoverHelp` opens on `pointerenter` and the ensuing click toggles it SHUT.** The pointer-type gate guards the touch race, not the mouse one. Click-to-open lands on a closed popover in Playwright.
5. **`standalone.config.ts`'s `testMatch` is an explicit allow-list.** An unregistered spec runs nowhere and silently proves nothing.
6. **A multi-word long label never truncates** — flex-wrap gives it its own line first. Only a single unbreakable token proves `truncate` does any work.
7. **The affordance matrix's parity gate matches literal testids** and separately requires each concrete id to occur exactly once, and the shape test bans concrete parse-warning rows. Per-item popovers must register as a template family with call-site exemptions.
