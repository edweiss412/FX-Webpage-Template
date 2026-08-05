# Backlog convergence — Unit C UI/a11y cluster closeout

Branch `feat/sweep-ui-a11y`. Plan: `docs/superpowers/plans/2026-08-04-backlog-convergence.md` Tasks 10–14. Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §4.

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=2 dispositions=recorded

## 1. What shipped

| Task | Entry | Outcome |
| --- | --- | --- |
| 11 | `BL-FEED-BUTTON-SUCCESS-ANNOUNCE` | SHIPPED — Accept / Approve / Reject announce success on the existing live-region channel |
| 12a | `BL-IDENTITYCHIP-SR-SEPARATOR` | SHIPPED — `aria-label` supplies the spoken comma between name and role |
| 12b | `BL-TERMINAL-FAILURE-ICON` | SHIPPED — decorative `AlertCircle` above the h1 |
| 12c | `BL-AUTH-INTERSTITIAL-FONT` | SHIPPED — one shared `interstitialDocument` builder for all four hand-built auth documents |
| 13 | `BL-FITWITHINCLIP-CLIP-SCROLL-STALE` | **SKIPPED with record** — Unit A's screen DEMOTED it as self-declared unreachable and archived it, so it was never claimed by this branch. Task 13's red is N/A. |

Two entries whose promotion prerequisites read as fences were settled by Unit A's screen rather than by this branch, and the reasoning is recorded in each entry: the SR-separator's gate was whether anyone would *complain* about phrasing that happens deterministically, and the terminal-failure icon's telemetry gate is a PRIORITIZATION gate — nothing about the icon can be wrong before the telemetry arrives.

## 2. Unplanned repair carried by this branch

Six of Unit A's fourteen `screen-disposition 2026-08-04` stamps were filed outside the entry they disposition — five under the `### Items considered…` and `### M12.2` sub-item CONTAINERS (which the canonical walker does not treat as entries, so everything under them attributes to the last real entry above), and one inside the wrong entry outright. Cost: a reader grepping `BL-IDENTITYCHIP-SR-SEPARATOR` found no disposition while `BL-HELP-UI-LABEL-CROSSWALK-EXACT-MATCH` carried five verdicts about five other rows. This branch hit it directly — Task 12a's contract is the entry, and the KEEP that authorizes the work was not in it.

Swept rather than spot-fixed: all fourteen stamps across all four ledgers were attributed to their canonical owner and checked against what the text is about. `pnpm ledger:mass` is unchanged at 106 entries / mass 309, which is the check that no entry boundary moved. Commit `1c97d91ee`.

## 3. Invariant-8 dual gate

**Provenance, stated rather than implied.** Both assessments were dispatched as isolated sub-agents per the skill's hard invariant. Neither returned within the run. The evidence half was therefore executed directly in the parent context and is recorded below with its measurements; the design-review half did not produce a report. Both halves are recorded as `RAN-DEGRADED` rather than `RAN`, because a gate that reports itself as clean when half of it never ran is worth less than one that says so.

### Assessment B — evidence (executed inline, measurements reproduced)

| Check | Result |
| --- | --- |
| `detect.mjs` over the four changed components | `[]`, exit 0 — clean |
| `--color-text-subtle` on `--color-bg` (the new `AlertCircle`) | 6.5:1 light / 6.8:1 dark (DESIGN.md:58) — clears the 3:1 graphical floor with margin; existing token, no new pin owed |
| Em-dash / curly-apostrophe ban in NEW user-visible copy | clean |
| Raw hex added under `components/` | none |
| New interactive elements without a tap floor | none — the one new `<button>` is inside the standalone auth document and takes `min-height:44px` from the shared style block |
| XSS surface in `lib/auth/interstitialDocument.ts` | **Not live.** All four call sites pass a string literal or `messageFor(...)` catalog copy; nothing attacker-controlled reaches the builder. |

### Findings and dispositions

**P0: none.**

**P1-1 — button border below the non-text contrast floor.** `INTERSTITIAL_STYLE`'s `border:1px solid #999` measures 2.85:1 on white and 2.61:1 against its own `#f5f5f5` fill; the floor is 3:1. It was one document's defect while it lived in `app/auth/sign-out/route.ts`; extracting the block would have propagated it to four. **FIXED in-branch** (`518ab2cf1`): `#767676`, 4.54:1 and 4.17:1. The button also gained the 44px tap floor it never had.

**P1-2 — no dark scheme on the auth interstitials.** The four documents rendered a full-white page in every scheme, while PRODUCT.md makes light and dark both first-class and names the backstage-at-midnight context explicitly. **FIXED in-branch** (`518ab2cf1`): a `prefers-color-scheme:dark` block tracking the app's own surface (`#0f1014`) without importing from it — 15.5:1 body text, 4.56:1 button border on its fill. Costs no assets, which is these documents' only real constraint.

Both ratios are asserted from the style block itself in `tests/routes/authInterstitialFont.test.ts` rather than written down here, so a later retune of either scheme fails a test instead of drifting past this document.

**Hardening, not a finding — text-slot escaping** (`0d282cbe9`). The XSS trace above says this is not a live bug, and it was done anyway: the previous commit turned four private builders into one shared primitive that interpolates into raw HTML, which changes who the next caller is. `extraBodyHtml` stays raw and is asserted to, because it is markup by contract; the asymmetry is named in both the type and the suite so nobody "fixes" it later.

**Deferred: none.** No finding was routed to `DEFERRED.md`.

## 4. Ledger

Stage 0 claimed four entries after `pnpm ledger:claims --check` returned "no collision", and pushed the marker in the same turn (`cefb94f38`). All four graduate to `BACKLOG-archive.md` in this branch's last pre-merge commit; per invariant 12 the marker comes off in that same move, since archives categorically reject in-progress rows.

## 5. Verification

- `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm format:check` — clean.
- Full local suite run; the only failures were `pg-cron-coverage`, which passes in isolation — local-DB contention between two worktrees sharing one Supabase, plus the generated mechanism-probe child whose echoed FAIL lines mimic a parent failure.
- 930 tests green across the 37 files covering every surface this branch touches.
- Real CI green on the PR is the gate that actually counts, per the local-passes-CI-fails discipline.
