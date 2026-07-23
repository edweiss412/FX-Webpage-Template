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

## Known local-environment caveats

- **Run the dev-capture e2e locally with `TEST_DATABASE_URL` overridden to loopback** (`TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm exec playwright test tests/e2e/dev-capture.spec.ts --project=desktop-chromium`). This machine's `.env.local` points `TEST_DATABASE_URL` at the remote validation pooler (deliberate — validation creds live in the main env), and the app's postgres.js paths (`lib/onboarding/sessionLifecycle.ts:95` `TEST_DATABASE_URL ?? DATABASE_URL`) then read the REMOTE `app_settings` while the e2e helpers seed the LOCAL one — the wizard branch renders the remote dashboard and the staged case can never mount. CI sets a loopback `TEST_DATABASE_URL` and is unaffected.
- Shared-DB singleton contention: sibling worktree sessions running onboarding e2e (Start Over/finalize) mutate `app_settings` mid-test; the staged helper re-asserts + retries ×10 to ride out bursts.
- Sentinel pixel scan tolerance is ±30/channel: html2canvas renders through the window color profile (observed drift `255,0,254 → 255,25,254`).

## Whole-diff review record (Stage 4.1)

Two scoped Codex reviews (split-review default): CORE (capture pipeline) NEEDS-ATTENTION, 5 findings — all repaired (fail-closed read-core filters incl. `.or()` injection guard, TOCTOU-safe exact-shape request guard, `__proto__`-safe redaction rebuild, allSettled single-flight, explicit null feed). HOSTS+TESTS BLOCKING, 8 findings — triage:
- F3 "deleted focus suites" REFUTED: origin/main had moved (PR #558 added those suites post-branch); rebase restored them, all 67 pass with this diff's ShareHub changes. Recorded so later reviewers do not re-derive.
- F1 call-boundary: 5 claimed sites — 4 already destructured `{ error }` (confabulated from diff-only view); the 1 real diagnostic-read gap fixed.
- F2 published sentinel-retry re-mounts the kebab row per attempt; comment corrected.
- F4 teardown failure-safety: collect-errors-throw-at-end cleanup, rows-before-settings seeding, afterAll try/finally, maps cleared.
- F5 dummy-panel leak: tagged + torn down per test; threading test drops it and asserts the raster target is not the dummy.
- F6 exact published-allowlist key-set pin added.
- F7 concurrency tautology removed; timer proof now `vi.getTimerCount()` before/after unmount.
- F8 env-stub hygiene: afterEach unstub, no hard delete of runner env.
Verification round: re-dispatch of both scopes → see below.

Verification rounds: R2 NEEDS-ATTENTION (4 -> repaired), R3 NEEDS-ATTENTION (2 -> repaired), R4 **APPROVE**.
