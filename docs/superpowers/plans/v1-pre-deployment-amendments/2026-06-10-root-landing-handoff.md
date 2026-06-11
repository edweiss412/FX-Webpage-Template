# Root `/` landing — close-out handoff

Executed 2026-06-10/11 on branch `spec/root-landing` (git worktree, main checkout untouched for parallel features). Spec APPROVED R4; plan APPROVED R2; subagent-driven with two-stage review per task.

## 1. Scope shipped

- `lib/auth/rootSessionProbe.ts` — discriminated session probe (`authenticated | anonymous | infra_error`; returned errors classified via `isAuthSessionMissingError`, the `isAdminSession` discipline); registered in `tests/auth/_metaInfraContract.test.ts` (constructor list + R41 source-regex row + 4 behavioral rows).
- `app/page.tsx` — replaced the stub: signed-in → `redirect("/auth/sign-in?next=/admin")` (existing resolution routes admin → `/admin`, crew → `/me`); `infra_error` → `console.error("[root-landing] …")` then fail-open render; anonymous → branded card (mark-row h1, official Google image-button Link CTA reusing SignInButton vocabulary with three documented deltas, divider, crew lost-link line).
- `app/auth/sign-in/page.tsx` — §4.1.5 one-branch alignment: RETURNED non-missing `getUser` errors now surface `ADMIN_SESSION_LOOKUP_FAILED` (returned missing-session keeps fall-through).
- Tests: probe matrix (7), sign-in branch (+2 incl. guard-keeping), page matrix (4), e2e (5 flows × 2 projects: redirect chain pathname-exact, CTA chain, layout invariants at 390/720/1280, dark spot-check).

## 6. Watchpoints / execution lessons

- E2E final-URL assertions are pathname-exact (`new URL(page.url()).pathname`) — a substring regex false-passes on a stranded hop-2 URL ending in `/admin` (T4 review catch).
- The e2e prod server must override `TEST_DATABASE_URL` to local 54322 (`.env.local` points at the validation pooler) and `.next` must be rebuilt after any `app/` fix before re-running e2e (a stale-artifact run was caught and redone at 8531c8c9).
- Full-suite baseline at this branch: 5 failures, ALL reproducing at `origin/main` (`layoutIdentityFault`, `revokeHang`, + 3 env-dependent `test-auth-gate` Layer-2 HTTP cases) — verified in a throwaway detached worktree, zero milestone regressions.
- Transition audit: zero client state/animation in `app/page.tsx` + probe; all states instant (spec §4.4).

## 12. Impeccable findings + dispositions (invariant 8)

External attestors (fresh subagents, not the implementing session); v3 preflight gates passed; audit 20/20, critique design-health 35/40.

| Gate     | #   | Sev  | Finding                                                                                                         | Disposition                                                                                                              |
| -------- | --- | ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| critique | 1   | HIGH | CTA Link missing spec'd `self-start` — stretched full card width (invisible focus-ring box + dead-click flanks) | **FIXED** @ `8531c8c9`; critique re-attested PASS; audit re-attested the hunk PASS                                       |
| critique | 2   | LOW  | Verbatim-copy comment omitted the ring-offset delta                                                             | **FIXED** @ `8531c8c9` (all three deltas documented)                                                                     |
| critique | 3   | LOW  | Brand icon plain `<img>` vs AdminNav's `next/image`                                                             | **FIXED** @ `8531c8c9`                                                                                                   |
| critique | 4   | LOW  | `min-h-screen` vs `min-h-dvh` inconsistency lives on the SIGN-IN page                                           | **REJECTED for this milestone** (out of scope per attestor's own note — belongs to a future sign-in touch)               |
| audit    | 1   | P3   | Google img remains in-tree as a same-named graphic under the aria-label                                         | **REJECTED with citation** — identical to shipped `SignInButton` pattern; consistency wins (attestor concurs, note-only) |

**Gate-fixpoint status:** the only post-attestation UI mutation is `8531c8c9`, and BOTH attestors re-attested it (critique PASS, audit PASS). No UI mutations after the re-attestations.

## 13. Adversarial review record

- **Spec:** Codex R1-R4 → APPROVED R4 (R1 discriminated observable probe; R2 `isAuthSessionMissingError` returned-error classification; R3 sign-in §4.1.5 alignment closing the outage-visibility chain).
- **Plan:** Codex R1-R2 → APPROVED R2 (R1 behavioral registry rows in the meta-test itself; crew-facing catalog copy in the sign-in regression test).
- **Per-task:** two-stage subagent reviews; substantive catches: T3 focus-ring offset (`56422413`), T4 stranded-hop-2 substring false-pass (`a36389c4`).
- **Whole-milestone:** (filled at convergence)
