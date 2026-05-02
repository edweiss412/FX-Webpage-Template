# Handoff — M0: Repository bootstrap, tooling, env

**Handed off:** 2026-05-02 by Eric Weiss
**Implementer:** Opus 4.7 / Claude Code (this session, via subagent-driven-development)
**Adversarial reviewer:** GPT-5.5 / Codex
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/01-foundation.md`

---

## 1. Spec sections in scope

- §14 — Tech stack & directory layout (the only spec section M0 touches; foundation milestone is scaffolding, not a §15 acceptance-criterion milestone).
- §14.1 — Frontend: Next.js 16 App Router, Tailwind v4, design tokens established by impeccable v3 flow (`PRODUCT.md` strategic + `DESIGN.md` visual; `DESIGN.md` itself is deferred to Task 4.1, NOT M0).
- §14.3 — Env-var table (full list authored into `.env.local.example` in Task 0.4, including the M8-required `GITHUB_BOT_LOGIN`).

## 2. Acceptance criteria

M0 is scaffolding-only and has no §15 AC IDs assigned. Exit criteria for M0 are the per-task checklists in `01-foundation.md` (Tasks 0.1–0.6) plus the "Exit criteria" section of this handoff (§8 below).

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8**
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — **N/A — only M8**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8**

M0 does, however, author the env var `GITHUB_BOT_LOGIN` into `.env.local.example` (Task 0.4 Step 2) because Amendment 1 requires it later. No code consumes it in M0.

## 4. Pre-handoff state

- [x] Previous milestone(s) committed: **none — M0 is the first milestone.**
- [x] Tests passing: **N/A — no test suite exists yet. Pre-existing repo is documentation only.**
- [x] Specific files present:
  - [x] `PRODUCT.md` at repo root (committed at `848fd4f`, verified 2026-05-02). M0 Task 0.5 Step 2 explicitly references this.
  - [x] `AGENTS.md` at repo root (committed at `0817081`).
  - [x] `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/` populated with `00-overview.md`, `01-foundation.md`, …, `ROUTING.md`, `HANDOFF-TEMPLATE.md`.
  - [x] `fixtures/` directory exists (carried over from earlier prep work). M0 does not touch it.
  - [x] `DESIGN.md` is **deliberately absent** at this stage and remains so until Task 4.1 (impeccable v3 design-context flow extracts visual tokens after first UI components exist). Do **not** create `DESIGN.md` in M0.
- [x] Specific env vars set in `.env.local`: **none required.** `.env.local.example` is authored in Task 0.4; the implementer is not expected to populate `.env.local` itself in M0.
- [x] Database migrations applied: **N/A — Supabase is initialized in Task 0.4 but no migrations exist until M2.**
- [x] `pnpm` available on PATH: **verified 2026-05-02 via `corepack enable pnpm` → pnpm 10.33.2** (satisfies the plan's `>= 9.0.0` requirement). Implementer should re-run `corepack enable pnpm` if the shell doesn't see pnpm at task start.

If any of the above is not met, do NOT start the milestone. Open a question.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** — applies. Tasks 0.2 and 0.3 are explicitly test-first (write a sample test, then run, then commit). Tasks 0.1, 0.4, 0.5, 0.6 are configuration-only and verify via "expected: command succeeds" rather than a unit test, per the plan as written.
- [ ] Per-show advisory lock — **N/A — M0 does not touch `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`** (those tables don't exist until M2). Verification command at end of M0: `! grep -rE "shows|crew_members|crew_member_auth|pending_syncs|pending_ingestions" lib/ app/ 2>/dev/null` should produce no SQL-mutation hits (only the `.env.local.example` will mention `ADMIN_EMAILS` etc.).
- [ ] Email canonicalization at boundary — **N/A — `lib/email/canonicalize.ts` is created in M1 (Task 1.2). M0 does not parse or read emails.**
- [ ] No global cursor — **N/A — sync code does not exist until M6. Verification reserved for M6 handoff.**
- [ ] No raw error codes in UI — **N/A — UI does not exist until M4. Verification reserved for M4 handoff.**
- [x] **Commit per task** — applies. Format: `infra: <one-line summary>` for all M0 tasks (the canonical area name for foundation per AGENTS.md §1.6). One commit per Task 0.1, 0.2, 0.3, 0.4, 0.5, 0.6 — six commits total expected at M0 completion.

## 6. Watchpoints from prior adversarial review

M0 is the first executed milestone, so there is no prior convergence-log evidence. The following watchpoints come from the plan-self-review and from generic Next.js 16 + Tailwind v4 + pnpm pitfalls flagged in the global CLAUDE.md feedback memory:

- **Tailwind v4 does not default `.flex` to `align-items: stretch`.** M0 establishes Tailwind v4 base only — it does not yet ship any flex/grid layouts — but the implementer must NOT add a `.flex { align-items: stretch }` reset to `app/globals.css` even as a "convenience." Future per-component invariant work (M4 onward) explicitly assumes the v4 default of `align-items: normal`. If you find yourself tempted to add a flex reset in `app/globals.css`, stop and open a question. Mitigation: review the final `app/globals.css` diff for any `align-items` global declaration before commit.
- **Next.js 16 `pnpm create next-app@latest` may bundle a starter `app/page.tsx` that uses Tailwind v3 utility classes** depending on which template version the CLI ships. After Task 0.1, before Task 0.5, scan `app/` for any `@tailwind base/components/utilities` directives — Tailwind v4 uses `@import "tailwindcss"` instead. Mitigation: in Task 0.5 Step 1, replace any v3 directives in `app/globals.css` with the single v4 import as written in the plan.
- **`pnpm create next-app` may write `eslint.config.mjs` (flat config) instead of the legacy `.eslintrc.json` the plan requests.** Next.js 16 ships with ESLint flat config by default. Decision: prefer the format the scaffolder produces (flat-config `eslint.config.mjs`) over forcing `.eslintrc.json`, since flat config is the v16 default and is what `next lint` understands without additional shims. Document the deviation in the Task 0.6 commit message body. Mitigation: if scaffolder produces `eslint.config.mjs`, extend it with `eslint-config-prettier` via the flat-config import pattern; only fall back to `.eslintrc.json` if the scaffolder did not author an ESLint config at all.
- **`pnpm dlx supabase@latest start` requires Docker.** If Docker Desktop isn't running on this Mac, Task 0.4 Step 4 will fail. Pre-flight not verified by this handoff (the orchestrator did not run Docker). Mitigation: implementer attempts the start; if it fails with a Docker-not-running error, the implementer's status becomes `BLOCKED — Docker required for Task 0.4 Step 4` and the human is paged before proceeding. Do **not** silently `--skip-supabase-start` — Task 0.4 Step 4 is the only check that the env vars resolve correctly.
- **`pnpm exec playwright install --with-deps chromium webkit`** downloads ~500MB of browser binaries and may take several minutes on first run. This is expected. The implementer should not interpret a 60–180s wait as a hung process. Mitigation: run Playwright install with a generous timeout (10 min). If it fails on `--with-deps` due to sudo prompts on this Mac, fall back to `pnpm exec playwright install chromium webkit` (without `--with-deps`) — `--with-deps` is Linux-only.
- **TypeScript strict-mode flags in Task 0.1 Step 4 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)** are stricter than what `pnpm create next-app` ships. The scaffolder's generated starter `app/page.tsx` may not type-check under these flags. Mitigation: if `pnpm build` (Task 0.1 Step 5) fails due to strict-mode errors in scaffolded files, fix the scaffolded files (they'll be rewritten in M4 anyway) — do NOT relax the strict-mode flags. The strict-mode flags are non-negotiable per the spec.

## 7. Test commands

- Vitest unit tests (after Task 0.2): `pnpm test`
- Playwright e2e (after Task 0.3): `pnpm test:e2e --project=mobile-safari`
- Lint (after Task 0.6): `pnpm lint`
- Typecheck (after Task 0.6): `pnpm typecheck`
- Build (always, smoke test): `pnpm build`
- Layout-dimensions test: **N/A — no UI components in M0.**
- Transition-audit test: **N/A — no animated components in M0.**

## 8. Exit criteria

- [ ] All six tasks in `01-foundation.md` (0.1–0.6) checked off (`- [x]` on every step in the plan file).
- [ ] All AC IDs from §2 above have at least one test asserting them — **N/A — M0 has no AC IDs.**
- [ ] Adversarial review (per `superpowers:adversarial-review`) ran to convergence — handoff sent to GPT-5.5 / Codex with the M0 diff after all six tasks are committed.
- [ ] All commits follow `infra: <summary>` format with one task per commit (six commits).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean.
- [ ] `pnpm build` clean.
- [ ] `pnpm test:e2e --project=mobile-safari` clean (sample home-page test passes).
- [ ] No new `// TODO` or `// FIXME` lines unless explicitly in the plan.
- [ ] `app/globals.css` contains exactly `@import "tailwindcss";` (Tailwind v4 base) and no `align-items` global resets.
- [ ] `.env.local.example` lists every var named in spec §14.3, including `GITHUB_BOT_LOGIN`, `ADMIN_EMAILS=dlarson@fxav.net,edweiss412@gmail.com`, and the comment "NB: WATCHED_DRIVE_FOLDER_ID is NOT an env var".
- [ ] `DESIGN.md` does NOT exist yet (correct — it is created in Task 4.1).

## 9. Sandbox / git protocol

- [x] **Claude Code:** commits run in-session, no sandbox issue. Each task ends with `git add <specific files>` (NOT `git add -A`) followed by `git commit -m "infra: <summary>"`.
- [ ] **Codex CLI default sandbox:** N/A for M0 — implementer is Claude Code per ROUTING.md.
- [ ] **Codex CLI with relaxed sandbox:** N/A for M0.

## Deferred items

- **Task 0.4 Step 4 — `pnpm dlx supabase@latest start` boot smoke test.** Deferred 2026-05-02 because Docker is not installed on the implementer's machine. Does not block M0 closure or M1 parser work. Re-run the smoke test before any M2 task that relies on `supabase start` for local schema iteration. M2 migrations targeting a remote Supabase project via `supabase db push --db-url ...` do NOT require Docker, so M2 can begin without this verification — just don't claim local-dev parity until the smoke test runs. Track via a TODO at the end of M0 commit `be4f7bc`.

## Resolved local-dev warts

- **`next-env.d.ts` mode flap (resolved 2026-05-02 by gitignoring the file).** Next 16 writes routes-types to either `.next/types/` (build mode) or `.next/dev/types/` (dev mode), and the `next-env.d.ts` import line tracks whichever mode last ran. The file is auto-regenerated on every `pnpm dev`/`pnpm build`; tracking it in git produced spurious diffs on every local e2e run. The fix: `next-env.d.ts` is now in `.gitignore`. `tsconfig.json` globs both `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`, so route-segment types resolve regardless of mode. CI's `pnpm build && pnpm start` (per Task 0.3) regenerates the file before `pnpm typecheck`, so a cold checkout always typechecks cleanly after one Next.js invocation.

## 10. Adversarial review handoff

After all six M0 tasks are committed:

1. Implementer (this session, via the spec-reviewer + code-quality-reviewer subagent loop) summarizes what was built and confirms each per-task checklist is `- [x]`.
2. The adversarial reviewer (GPT-5.5 / Codex per ROUTING.md) is invoked via `superpowers:adversarial-review` with §14 of the spec, the M0 plan file (`01-foundation.md`), and `git diff $(git rev-list --max-parents=0 HEAD)..HEAD -- ':!docs' ':!*.md'` as input.
3. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision.
4. Convergence is logged at the bottom of this file.

## Convergence log

_(populated after adversarial review)_
