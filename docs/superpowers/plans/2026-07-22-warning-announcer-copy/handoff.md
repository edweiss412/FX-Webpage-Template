# Warning announcer + elsewhere-copy polish — handoff

Spec: `docs/superpowers/specs/2026-07-22-warning-announcer-copy-design.md`
(APPROVED after 6 adversarial rounds; triage logs in spec §8-8.4).
Plan: `docs/superpowers/plans/2026-07-22-warning-announcer-copy/plan.md`
(APPROVED after 3 adversarial rounds).

## Task → commit table

| Task | Commit | Notes |
| --- | --- | --- |
| 0 e2e RED pins | `c0de5b5ad` + `0174e8c5a` | Announcer red: region held derived text. Reveal red: reveal button absent. Infra: `E2E_PORT` sibling-server escape hatch + `BASELINE_SERVER_ONLY` filter made port-aware. |
| 1 pointer-first copy | `e082b6865` | 8 pinned strings flipped; stale adjacency comment in ShowReviewSurface updated. |
| 2 parts shape | `8bffab78c` | `{ named, extra, missCount }`; render site shimmed (`moreCount = extra + miss`). |
| 3 tap-to-reveal | `b80157461` | `ElsewherePointerSentence` extraction; one-shot focus flag; sticky-preference matrix tests. |
| 4 announce log region | `e86d04ac1` | `warningAnnounceContext` + `role="log"` append-only region; `warningsPanelStatus` lib + unit test deleted; MutationObserver test contract (takeRecords drain). |
| 5 producers | `c84215657` | Both controls announce pinned clauses pre-refresh; chip-region value-set observer; no-provider probe; composed-tree wiring tests. |
| 6 e2e green re-run | (no code change) | See §Run record. |
| 7 docs + audit | (this commit) | DEFERRED graduation, VOICEOVER-ANNOUNCER-SPOTCHECK owner action, spec F10 wording amendment. |

## Transition-audit sweep (plan Task 7 Step 1)

`grep -rn "framer|motion|AnimatePresence"` over
`warningAnnounceContext.ts`, `BulkIgnoreControls.tsx`,
`DataQualityWarningControls.tsx` → zero hits;
`git diff origin/main` over `step3ReviewSections.tsx` +
`ShowReviewSurface.tsx` → zero `AnimatePresence`/`motion.` additions. Every
conditional render added by this diff (log children append/trim; reveal
button ↔ full list; expanded-preference matrix rows) is deliberately instant
per spec §2.6 + §4.3; compound rows (append-during-refresh, tap-while-data-
drop) are covered by the Task 4/3 test suites.

## Run record

- Task 0 RED: announcer test failed on `toHaveText("")` against the derived
  sentence; reveal test failed on the absent reveal button (after the
  `transportation`-kind seed fix; the first attempt failed for the wrong
  reason — `transport` is not an emitter kind).
- Mid-run infra incidents: (1) Docker daemon died during the first Task 6
  attempt (Supabase :54321 refused). Recovered via Docker restart only (no
  `db reset`, per the standing recovery rule); `pnpm preflight` re-verified
  env + local DB before the re-run. (2) The announcer test's ignore POST
  404'd even with a healthy DB: the data-quality routes' `withTx` prefers
  `TEST_DATABASE_URL` (route.ts `databaseUrl()`), which the shared
  `.env.local` points at the REMOTE pooler — the locally seeded show does
  not exist there. Local e2e runs of mutating data-quality flows must set
  `TEST_DATABASE_URL` to the loopback DB on the playwright command (process
  env beats `.env.local`); CI is unaffected (its TEST_DATABASE_URL is the
  loopback service).
- Task 6 GREEN: `BASELINE_SERVER_ONLY=1 E2E_PORT=3010 TEST_DATABASE_URL=<loopback> pnpm playwright test tests/e2e/warning-panel-polish.spec.ts --project=desktop-chromium` → 4 passed (1.3m): both shipped polish tests + both Task 0 pins.

## §12 Impeccable findings + dispositions

(Filled by the Task 8 dual-gate run.)
