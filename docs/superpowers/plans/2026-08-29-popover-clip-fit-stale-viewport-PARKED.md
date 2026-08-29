# PARKED — the stale fitted cap that flaps popover-clip-fit on CI

**Status:** parked 2026-08-29 by bl-orch ruling, split out of `fix/attention-autoopen-suppress-phone`. Nothing here is implemented; this branch preserves the diagnosis and the design so the work can be picked up on its own review budget.

## Why it was split

It rode along in a product arc as "Task 5" and accounted for **5 of that stage's 18 plan-review findings**, including two of the final round's four, on a plan whose actual design went uncontested across eight rounds. The reason is structural rather than sloppiness, and it is the thing to carry forward:

**This is a TEST-ONLY repair, so no production surface can be defective, and plan-wide invariant 1's red-then-green cycle does not reach it.** A red was argued three times before the honest answer surfaced. It depended on winning a race; then on an unresolved import, which `docs/agents/writing-plans.md:15` rejects because writing the test helper is what makes it green; then on a viewport-only settle contract that an implementation returning before the `ResizeObserver` re-fit still satisfies. Only one assertion is genuinely red against the tree — the structural cover, because every call site is unrouted today and that is a text scan, not a schedule. The other two are regression assertions and must be labelled as such.

The repair direction is the documented one: `AGENTS.md`, the `2d9d0ba11`-style kill, split the hardening out of the shipping PR.

## Where the work is

The full diagnosis, the site census, the settle inventory, the class-form cover and the three acceptance criteria are in this branch's copy of `docs/superpowers/plans/2026-08-29-attention-auto-open-phone-suppression.md`, under "Task 5 — the stale fitted cap that flaps popover-clip-fit on CI" and the AC-REFIT-* entries in §4. That section is DELETED on the product branch, so this branch is its only home.

## What was measured, in one place

- The failing site is `tests/e2e/popover-clip-fit.spec.ts:341`, in `settled fit at 390x${height}` over `[844, 667, 560]`.
- The constant 20px is `CSS_CAP` (384, a file constant at `tests/e2e/popover-clip-fit.spec.ts:143`) minus the 390x667 room (364). A stale CAPPED cell judged by the UNCAPPED branch. Both numbers are fixed, which is why it never varies by runner.
- Only TWO reads are exposed: the loop above, and the anchor-room census at `tests/e2e/popover-clip-fit.spec.ts:1400` with its bare `waitForTimeout(80)`. The two `expect.poll(settledGeometry)` sites already settle correctly.
- Pass pattern: 3 failures in 7 full-file runs, 0 in 6 isolated runs, 0 in 3 under deliberate 8-core load. The trigger is cell adjacency, not load — which is why a `-g` filtered red cannot fire.
- Scoping to this one file is probed, not assumed: `tests/e2e/wizard-attention-menu.spec.ts` has the same set-viewport-then-navigate shape but no cap constant, no room arithmetic and no fixed sleep, and that branch is what turns a stale viewport into a wrong NUMBER.

## What does NOT come with it

The P-1 probe deletion stays on the PRODUCT arc. That probe asserts `aria-expanded="true"` on arrival at the three phone widths, and the product arc's suppression change is what makes it false, so the product arc must delete it or break its own gate. The `standalone-e2e` red it causes rides the product arc too. Only the popover-clip-fit FLAP rides this branch.

## Ledger

No row. The defect is process-facing and the 2026-08-25 mint freeze admits a process row only under `invariant` or `product-blocked`; neither applies. This document is the record.
