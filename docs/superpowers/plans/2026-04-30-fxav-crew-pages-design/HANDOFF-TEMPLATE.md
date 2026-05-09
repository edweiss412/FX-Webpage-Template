# Milestone Handoff Template

Use this template when starting any milestone, and especially when delegating a milestone across harnesses (e.g. Claude Code → Codex CLI). The handoff makes the artifact set explicit so the second implementer starts from the same context the first one had.

**How to use:** Copy the template below into a new file at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/handoffs/M<n>-<short-name>.md` (create the `handoffs/` subdir on first use). Fill every field. If a field is "N/A" say so explicitly — empty fields silently lie.

---

## Template

```markdown
# Handoff — M<n>: <milestone name>

**Handed off:** <YYYY-MM-DD> by <human-name>
**Implementer:** <model> / <harness> (per ROUTING.md) — OR for split milestones: **split-mode (manual / Level 1)** — backend = <model>, UI = <model>, two concurrent terminals coordinating through this doc
**Adversarial reviewer:** <model> / <harness>
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/<file>.md`

---

## 0. Implementer split (split-mode milestones only — DELETE this section if single-implementer)

If ROUTING.md routes this milestone to a single implementer, delete this entire section. Otherwise fill in:

### §A — backend tasks (ship first; UI consumes these contracts)

- **Task <n.m>** — <files> + <tests>. Description.
- ...

### §B — UI tasks (after §A pin-stops; consumes finalized contracts)

- **Task <n.m>** — <files> + <tests>. Description.
- ...

### Coordination protocol

- Disjoint by file path; neither implementer commits files outside their list without an explicit handoff note.
- Both sessions commit per task per AGENTS.md §1.6.
- Both sessions append to the convergence log; don't rebase or squash each other's commits.
- Per-session UI hard rule: §A NEVER touches `app/` outside `app/api/`, `components/`, design tokens. §B NEVER touches `lib/auth/`, `app/api/auth/`, or any backend module §A owns.

### Pin-stop sequence (§A → §B handshake gates)

Pin-stops are checkpoints where the backend implementer pauses, reports the pinned contract surface, and waits for orchestrator + UI-side confirmation before resuming. Most split milestones have one or two pin-stops; some have three. The number depends on the contract topology, NOT a fixed convention.

**Pin-stop heuristic:** a pin is justified at any contract boundary where (a) §B's next dependency cluster needs concrete signatures, AND (b) the §A work to produce those signatures is small enough to fail fast if the harness/sandbox/discipline is broken. The first pin in a milestone is usually narrow (verify the harness works); subsequent pins widen the contract surface.

**Pin-stop N**: <description of what's pinned at this stop>. Includes:

- `<module path>` — `<exported function/type>` shape
- ...

After this pin clears, <what §B work it unblocks>. <What §A work remains for the next pin or for parallel post-pin>.

**Codex's report at each pin-stop must include:**

1. The new contract-pin SHA (orchestrator passes this to §B as the rebase base for the next pin or for §B's start).
2. The exported type names + signatures the UI consumes — pasted as a `.d.ts`-style block under a `### Pinned contract @ <SHA>` subsection appended at the bottom of this §0.
3. Any deviations from the spec — flagged explicitly.
4. Verification gate: `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin-stop SHA.

**If a pin-stop reveals a missing surface §B needs:** treat it as a pin-stop extension, NOT a new pin number. Update this section's bullet list inline, have §A extend the contract, and re-pin at a new SHA. New pin numbers are reserved for fundamentally new surfaces that emerge during implementation, not for "we forgot a function."

**Anti-pattern:** §A resuming work past a pin-stop without orchestrator confirmation. The pin sequence is strictly ordered. If §A finds itself wanting to ship a post-pin task before §B has consumed the pin, that's a sign the dependency analysis was wrong; surface it.

### What is NOT in either list

- <items intentionally out of scope for this milestone>

---

## 1. Spec sections in scope

List every §-section the milestone touches. Cite verbatim from the plan file's "Spec context:" lines.

- §X.Y — <title>
- §X.Z — <title>
- ...

## 2. Acceptance criteria

List every AC the milestone must satisfy. Use AC IDs from the spec, not paraphrases.

- AC-<n>.<m> — <one-line summary>
- AC-<n>.<m> — <one-line summary>
- ...

## 3. Spec amendments in scope

Of the three ratified §13.2.3 amendments (see `00-overview.md` and `AGENTS.md`), which apply to this milestone? "None" is a valid answer for milestones that don't touch the report pipeline.

- [ ] Amendment 1 — listForRepo recovery contract (only M8)
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate (only M8)
- [ ] Amendment 3 — `lease_holder` ownership protocol (only M8)

If any apply, paste the relevant amendment text into the handoff so the implementer doesn't have to follow a chain of references mid-task.

## 4. Pre-handoff state

What must be true in the repo for this milestone to be startable?

- [ ] Previous milestone(s) committed: <list M numbers>
- [ ] Tests passing: <list test commands that should currently green>
- [ ] Specific files present: <list any prerequisite files like `PRODUCT.md`, `DESIGN.md`, `lib/parser/types.ts`, etc.>
- [ ] Specific env vars set in `.env.local`: <list>
- [ ] Database migrations applied: <list migration timestamps or "all migrations through M2">

If any of the above is not met, do NOT start the milestone. Open a question.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Tick each that this milestone touches and confirm test coverage:

- [ ] TDD per task (always applies)
- [ ] Per-show advisory lock — applies if milestone mutates `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`. Test command: `<pnpm test ...>`
- [ ] Email canonicalization at boundary — applies if milestone reads emails from external sources (Drive, Google OAuth, links). Test command: `<pnpm test ...>`
- [ ] No global cursor — applies if milestone touches sync. Verification: `! grep -r "lastPollAt" lib/ app/`
- [ ] No raw error codes in UI — applies if milestone renders errors. Verification: `<grep command>`
- [ ] Commit per task (always applies)

## 6. Watchpoints from prior adversarial review

What specific failure modes does past adversarial-review history flag for this milestone? Pull from any earlier rounds that touched the same surfaces. If the milestone is new, list "none — first run."

- <surface> — <known failure mode> — <mitigation>
- ...

## 7. Test commands

Every test command the implementer should be able to run cleanly during the milestone. Include:

- Unit / parser tests: `pnpm test <pattern>`
- Playwright: `pnpm test:e2e --project=mobile-safari` (or the specific spec)
- Layout-dimensions test (if applicable): `<command>`
- Transition-audit test (if applicable): `<command>`
- Linting / typecheck (always): `pnpm lint && pnpm typecheck`

## 8. Exit criteria

Concrete checklist that determines "milestone is done." Every item must be checkable, not a vibe.

- [ ] All tasks in `<plan file>` checked off (look for `- [x]` on every step)
- [ ] All AC IDs from §2 above have at least one test asserting them
- [ ] Adversarial review (per `superpowers:adversarial-review`) ran to convergence
- [ ] All commits follow `<area>: <summary>` format with one task per commit
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean
- [ ] Playwright suite green
- [ ] No new `// TODO` or `// FIXME` lines unless explicitly in the plan
- [ ] PR description (if applicable) lists all AC IDs satisfied

## 9. Sandbox / git protocol

Tick the row that matches the implementer harness:

- [ ] **Claude Code:** commits run in-session, no sandbox issue. Use `Bash` for `git add` + `git commit`.
- [ ] **Codex CLI default sandbox:** git operations may fail silently inside the sandbox. Protocol:
  1. Implementer produces patch files, runs tests inside the sandbox.
  2. Implementer prints the per-task commit message in the response.
  3. Human (or this session) does `git add` + `git commit` outside the sandbox after each task.
  4. If you need cross-task commits in one session, relax sandbox explicitly with `--full-auto` or equivalent for this repo only.
- [ ] **Codex CLI with relaxed sandbox:** commits run in-session. Verify before starting that the sandbox is actually relaxed (run `git status` first; if it errors with permission-denied, switch to the bullet above).

## 10. Adversarial review handoff

After the implementer finishes:

1. Implementer summarizes what was built and what AC IDs are satisfied.
2. The adversarial reviewer (per ROUTING.md) is invoked via `superpowers:adversarial-review` with the milestone's spec sections, AC list, and the diff as input.
3. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision.
4. Convergence is logged at the bottom of this handoff file:
```

## Convergence log

- Round 1 (<date>): <reviewer> raised <n> issues. <m> resolved, <k> deferred to <where>.
- Round 2 (<date>): ...
- Converged at round <r> on <date>.

```

5. Only after convergence does the milestone move to "completed" status.
```

## 11. Cross-milestone dependencies

List any code paths, fixtures, helpers, or migrations the implementer needs that are owned by a different milestone. For each: name what the implementer needs, name the recommended disposition (create minimal stub vs. wait vs. extend), and name the milestone that owns the full implementation. Example: "M3 references `enrichWithDrivePins` which is owned by M6/M7 — recommended disposition: minimal stub created in M3 with a `mockDriveClient`, M6/M7 layers the real Drive API over the same interface."

If "None," say so explicitly.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

**Required only when the milestone ships any UI surface** (any file under `app/` except `app/api/**`, any file under `components/`, any new `app/globals.css` `@theme` block, any change to `DESIGN.md` or `tailwind.config.*`). For backend-only milestones, mark this section "N/A — no UI surface" and skip.

The dual run happens AFTER per-task implementation closes and BEFORE adversarial review. Both commands run with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal). Each surface reviewed:

- [ ] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs, AI-slop test, absolute-ban scan.
  - Score sheet attached: visual hierarchy, IA, cognitive load, emotional resonance, a11y floor, persona-specific scan-speed rule (e.g., "five-second answer rule" for the FXAV crew page).
  - HIGH findings fixed OR logged in `DEFERRED.md` with a target milestone.
  - MEDIUM findings triaged: fix-now / defer to in-milestone polish / defer to a future polish milestone.

- [ ] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). Scored P0-P3.
  - P0/P1 findings fixed before adversarial review (these are spec-blocking).
  - P2/P3 findings triaged: fix-now / defer.

- [ ] DEFERRED.md updated with any retrospective deferrals.
- [ ] Dispositions inline below or referenced by SHA:

```
critique findings: <Finding ID> — <severity> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
audit findings: <P0-P3> — <one-line> — disposition: <fixed at <SHA> | deferred to <milestone> via <DEFERRED.md ID>>
```

If the milestone splits UI ownership across implementers (e.g., M5 backend = Codex, M5 UI = Opus per ROUTING.md), the impeccable evaluation runs ONLY on the UI portion (Opus side) and a single dispositions block covers the whole milestone's UI surface.

The convergence log proper (below) appends ONLY after impeccable evaluation closes AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged.

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

What structural meta-tests does this milestone CREATE or EXTEND? Required by AGENTS.md "Writing-plans additions" — declare before drafting tasks. The point: when a bug class recurs in 3+ review rounds, the cure is a structural registry test, not another patch. Pre-declaring the registry at handoff time eliminates the rounds before they happen.

For each candidate class below, mark **create / extend / N/A — <reason>**. Then list the new registry rows (or extension SHAs) the milestone will land.

- [ ] **Supabase call-boundary discipline** — `tests/auth/_metaInfraContract.test.ts` (auth helpers) — required if the milestone adds auth helpers, admin RPCs, or any `{ data, error }`-returning external call. New rows: `<list>`.
- [ ] **Sentinel hiding in optional text** — `tests/components/tiles/_metaSentinelHidingContract.test.ts` — required if the milestone renders optional/nullable text fields where a sentinel value (`'TBD'`, `'—'`, `'FALSE'`) could leak. New rows: `<list>`.
- [ ] **admin_alerts catalog completeness** — `tests/messages/_metaAdminAlertCatalog.test.ts` — required if the milestone adds any `admin_alerts` row (every catalog code MUST have non-null `dougFacing`). New rows: `<list>`.
- [ ] **Advisory-lock topology** — `tests/auth/advisoryLockRpcDeadlock.test.ts` — required if the milestone adds any `pg_advisory*` caller. Single-holder rule per AGENTS.md §1.2. New surfaces: `<list>`.
- [ ] **No-inline-email-normalization** — `tests/admin/no-inline-email-normalization.test.ts` — required if the milestone reads emails from external surfaces. New surfaces covered: `<list>`.

If "None applies because <reason>," say so explicitly — empty cells silently lie.

---

## Field discipline notes

These trip up first-time uses of this template, based on prior plan-execution experience:

- **"Spec sections in scope" is exhaustive, not representative.** If the milestone touches §6.4, §6.6, and §6.8 — list all three. Missing a section here means the implementer never reads it, which means companion behavior gets dropped.
- **"AC list" uses canonical AC IDs.** Re-read the plan file and pick out every `AC-<n>.<m>` reference. Don't paraphrase ("acceptance criteria for tile rendering") — the IDs are the contract.
- **"Pre-handoff state" is verified by command, not assertion.** "Tests passing" alone isn't enough; write the test command. The next implementer should be able to copy/paste it.
- **"Watchpoints" sometimes is the most valuable section.** A surface that broke in adversarial review during the _plan_ phase will tend to break again during _implementation_ unless the implementer is forewarned. Prior round findings live in the convergence logs of earlier handoffs once you have them; for the first milestone, there's no log yet.
- **"Exit criteria" must include the convergence step.** A milestone is not done at "tests pass." It's done at "tests pass AND adversarial review converged."
