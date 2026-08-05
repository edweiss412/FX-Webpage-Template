# Backlog convergence — Unit C docs/comment-drift closeout

Branch `docs/sweep-comment-drift`. Plan: `docs/superpowers/plans/2026-08-04-backlog-convergence.md` Tasks 21–22.

impeccable-gate: N/A — no UI surface

`components/admin/BellPanel.tsx` is edited, which is a `components/` path — but the diff there is COMMENT TEXT only, no rendered output and no class changes. Recorded here rather than left for a reviewer to work out.

## 1. All four claimed entries closed

| Entry | Kind | Outcome |
| --- | --- | --- |
| `DESTRUCT-DURATION-TOKENS-1` | graduation-verify | **RESOLVED** — fix confirmed live, both halves |
| `BL-CI-STALE-BRANCH-PROTECTION-COMMENT` | graduation-verify | **GRADUATED** — correction confirmed live, plus its sibling sweep |
| `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` | comment drift | **CLOSED** — eight comments, not the six the entry counted |
| `BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND` | generator fidelity | **CLOSED** — comment-aware predicate; six codes reverted |

## 2. The graduation-verifies were verified, not trusted

Both entries asserted a fix had already landed. The task's stated failure mode is archiving an unfixed row, so each was checked against the tree first.

**`DESTRUCT-DURATION-TOKENS-1`** — `app/globals.css:249-252` aliases `--transition-duration-*` to `var(--duration-*)`, which is what Tailwind v4's `duration-*` utilities resolve, so they emit real CSS. And the half the entry said would actually need re-verifying afterwards — that `@media (prefers-reduced-motion: reduce)` never reached any Tailwind transition — closes transitively: the override zeroes `--duration-*`, the aliases resolve through those same variables.

**`BL-CI-STALE-BRANCH-PROTECTION-COMMENT`** — the comment is corrected, and the sibling sweep the entry claims also holds (`BL-E2E-LIFECYCLE-SPECS-CI-DARK` carries the correction). The only surviving instance of the old phrasing outside the frozen fixture is inside the correction sentence quoting it.

**One forward-looking note that entry could not carry:** its comment records a DATED measurement of twelve required contexts. `BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT` is an approved, verified-green flip that takes the set to thirteen. Whoever lands it re-measures and updates that comment in the same commit, or it goes stale exactly as this entry was filed for.

## 3. Where the entries were wrong

Two of the four under-described or mis-prescribed their own fix:

- **BellPanel named six comments; there were eight.** Sweeping the shape rather than the listed instances found the module header offering `"Dismiss"/"Retry"` as its example of uncataloged UI chrome, and the scrim comment describing a hypothetical focusable `"Dismiss"` button — quoted like a label, in a place where no control exists at all. The entry also asked whether `DESIGN.md` §16 still named a Dismiss affordance: it does not, except historically, so it was the source the comments had drifted FROM.
- **The provenance entry's prescription was half wrong, and its own regression suite caught it.** It asked to strip "comments and string literals". Literal stripping was implemented and failed the real-call cases: `sb.from("admin_alerts")` and `sb.rpc("upsert_admin_alert")` reach the table THROUGH a string, so blanking literals made two of the four write shapes invisible — strictly worse than the recognizer being replaced. Reverted, with the residual limit pinned as a test rather than left unstated.

## 4. Verification

- Six codes reverted on regeneration, matching the entry's named six exactly and only those; code membership unchanged, which is what confirms the fix touched provenance only.
- `pnpm typecheck` clean. 1148 tests green across 63 files (messages, docs, parser anchor); 2770 green across 218 admin component files for the BellPanel edit.
- The sizing guard caught both archived ids leaving stale `LEDGER_SIZING_GRANDFATHERED` rows (42 → 40) — dropped in the same commits.
- Real CI green on the PR is the gate that counts.
