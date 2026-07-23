# dev-modal-capture — handoff notes

## §12 Impeccable dual-gate record (invariant 8)

Run 2026-07-23, canonical v3 setup gates (context.mjs PRODUCT.md+DESIGN.md load, product register). Critique = two isolated subagents (A design review, B detector/evidence). Audit = scoped code-level pass over the diff surfaces.

### Critique (A + B synthesis)

- AI-slop verdict: NOT slop — idiom-faithful (popover section mirrors existing eyebrow/divider/row classes byte-for-byte), tokens only, dev chrome deliberately quiet (no accent — "orange means now" honored).
- Detector (B): exit 0, zero hits across all 7 files (in-diff AND pre-existing). Tap targets: every new interactive element carries `min-h-tap-min`/`size-tap-min` (44 px). Copy: no em-dash; no raw codes. Tokens: no raw hex/px colors.
- Browser overlay: skipped — auth-gated admin modal on a shared local DB under active sibling-session contention; static + jsdom + Playwright e2e evidence substitutes.

Findings and dispositions:

| Sev | Finding | Disposition |
| --- | --- | --- |
| P2 | ShareHub status line unbounded in no-wrap strip row; ~230 px error copy could collide at 390 px | FIXED — `max-w-48 truncate` + `title` (full text in console by contract) |
| P2 | Step3 header status squeezes the title in the shrink-0 actions row at 390 px for the 6 s error window | FIXED — `max-w-40 truncate` |
| P3 | ShareHub focus orphaned when the popover closes on capture activation | FIXED — focus rescued to the kebab trigger in `preCapture` |
| P3 | Busy-state presentation divergence: Step3 `disabled`+spinner+opacity vs ShareHub `aria-disabled` only | DEFERRED — deliberate: the kebab/share toggles are NOT the capture control and §2.2's lockout contract is `aria-disabled` + no-op (spec §7.1); a disabled-styling pass on non-capture toggles is cosmetic. Revisit if a third dev control ever lands (extract a shared `DevCaptureButton` then — A's provocation 1). |
| P3 | Two `role="status"` nodes can coexist if the popover is reopened during the 6 s error window | DEFERRED — both are polite live regions announcing distinct facts; SR double-announce is benign and the window is 6 s, dev-only. |

Heuristic scores (A): H1 3, H2 4, H3 3, H4 2, H5 4, H6 3, H7 3, H8 3, H9 3, H10 3.

### Audit (5-dimension, diff-scoped)

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 3 | `role="status"` + `aria-label`d icon + focus rescue; residual: dual live regions (deferred above) |
| 2 | Performance | 3 | html2canvas loads via dynamic `import()` only on capture click (360 kB never in the admin bundle otherwise); one-shot offscreen clone; main-thread raster ~600 ms acceptable for a dev-only action |
| 3 | Responsive | 3 | 44 px targets throughout; status truncation fixes landed; Step3 header row is busy-but-functional at 390 px |
| 4 | Theming | 4 | tokens only, both modes inherit via the token system |
| 5 | Anti-patterns | 4 | zero detector hits, no slop tells |

No P0/P1 in either gate; both P2s fixed in-run. Gate PASSED.

## Known local-environment caveat

`tests/e2e/dev-capture.spec.ts` staged case exercises the wizard Step3 modal via `app_settings` wizard-pending state — a shared-DB singleton. A concurrently running sibling worktree session (observed: `modal-state-coverage`, active onboarding e2e incl. Start Over) wipes that state mid-test; the helper re-asserts + retries ×4 but cannot win against continuous contention. CI is isolated and unaffected. Local reruns: wait for the sibling to go quiet.
