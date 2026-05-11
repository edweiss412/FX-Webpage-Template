# AGENTS.md — FXAV Crew Pages

Project-scoped instructions for any agent harness working in this repo (Codex CLI, Claude Code, or other). This file is the source of truth for project rules; if you are also reading global guidance (e.g. `~/.claude/CLAUDE.md`), this file extends and overrides it for this repo.

**Project:** Next.js 16 + Supabase web app turning Doug Larson's per-show Google Sheets into per-crew-member, mobile-first webpages. See `PRODUCT.md` (strategic), `DESIGN.md` (visual — created in M4), spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`, plan at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/`.

---

## Plan-wide invariants (non-negotiable)

These are hard constraints from the spec. Violating any of them is a P0 bug regardless of test status.

1. **TDD per task.** Every task: failing test → minimal implementation → passing test → commit. Never write implementation before the test that exercises it.
2. **Per-show advisory lock.** Every code path that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions` runs inside `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` (cron path) or `pg_advisory_xact_lock(...)` (admin/blocking path). Tests assert the lock is held. **Single-holder rule:** for any given hashkey, the lock is acquired at exactly one layer (JS-side wrapper, in-RPC, OR nested SECURITY DEFINER) — never two. Nested holders deadlock under burst (M5 R20 CRITICAL). Plans editing such code paths enumerate every existing holder and document the chosen layer; the structural guard test at `tests/auth/advisoryLockRpcDeadlock.test.ts` pins the topology and is the template for new lock surfaces.
3. **Email canonicalization at every boundary.** `lib/email/canonicalize.ts` is the only function that touches raw emails before they enter the system. Schema-level CHECK is the safety net, not the primary mechanism.
4. **No global sync cursor.** Per spec §3.2 / §5.2 / AC-X.4, no source file references `lastPollAt`. Each show is tracked via `shows.last_seen_modified_time`.
5. **No raw error codes in user-visible UI.** §12.4 is the catalog. UI reads codes through `lib/messages/lookup.ts` which returns the appropriate copy.
6. **Commit per task.** Use conventional-commits style: `<type>(<scope>): <summary>` OR `<type>: <summary>` for cross-cutting changes where no scope adds clarity. Common types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Common scopes/areas: `parser`, `db`, `sync`, `auth`, `crew-page`, `admin`, `report`, `onboarding`, `assets`, `infra`, `routing`, `plan`, `handoff`. The bare `infra:` form (no `feat()` wrapper) is the established convention for tooling/scaffolding/config commits — see the M0 commit history (`git log dcfd2cd..HEAD`). Don't batch multiple tasks into one commit, and don't allow the format to drift across milestones (e.g., M1 parser task commits should be `feat(parser):` or `test(parser):`, not bare `parser:`).
7. **Spec is canonical.** Three ratified amendments in `00-overview.md` are the only places where the plan supersedes the spec. Anywhere else the spec wins; open a question instead of silently fixing.
8. **UI quality gate (impeccable v3 critique + audit pair).** Every UI surface ships only after `/impeccable critique` AND `/impeccable audit` pass on the affected diff, with HIGH and CRITICAL findings either fixed or explicitly deferred via a `DEFERRED.md` entry. UI surface = any file under `app/` except `app/api/**`, any file under `components/`, any new `app/globals.css` `@theme` token block, and any change to `DESIGN.md` or `tailwind.config.*`. The dual-command run is part of milestone close-out, _before_ adversarial review (Codex) and _before_ the milestone is marked closed in its handoff doc. Both commands are run with the canonical v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight signal); see [reference/critique.md](https://www.npmjs.com/package/impeccable) and the cached plugin at `~/.claude/plugins/cache/impeccable/impeccable/3.0.6/skills/impeccable/`. Findings + dispositions go in §12 of the milestone's handoff doc. Reasons it's invariant 8 not 5: the no-raw-error-codes rule (5) is a UI-rendering contract; this rule is a UI-evaluation contract. Both apply.
9. **Supabase call-boundary discipline.** Every Supabase client call destructures `{ data, error }` (not bare `data`); returned-error and thrown-error paths are distinguished; infra faults surface as discriminable typed results (e.g., `{ kind: 'infra_error' }` or a typed `*InfraError` thrown), never as silent `continue` or benign auth signals. Every helper subject to this contract is registered in the relevant structural meta-test — `tests/auth/_metaInfraContract.test.ts` for auth helpers; an analogous registry-style meta-test for new surfaces. New call sites EITHER add a registry row OR carry an inline `// not-subject-to-meta: <reason>` comment. This is the M5 R3–R22 lesson distilled — six consecutive review rounds in M5 closed only once the meta-test landed; pre-emptively requiring the registry row at plan time eliminates the class.

---

## §13.2.3 amendments (must be followed verbatim in M8)

These three amendments were ratified after rounds 24–40 of cross-model adversarial review. They ARE in the spec file; the plan README documents them for visibility. Anyone implementing M8 must read them before touching `api/report/route.ts` or the reaper.

1. **Recovery uses `octokit.rest.issues.listForRepo`, not code search.** GitHub's code-search index lags tens of seconds; the list endpoint is immediately consistent with create writes. Filter by `creator: GITHUB_BOT_LOGIN, since: <T-24h>, state: 'all'`, scan page bodies for `<!-- fxav-report-id: <key> -->`, and additionally filter returned issues by `issue.created_at >= <T-24h>` client-side (since `since` filters by last-updated, not create-time). `LookupInconclusive` returns 502 and never authorizes `createIssue`.

2. **Retention horizon and reaper predicate align on `reports.created_at`, with lease-expired race fix.**
   - `expiredLeaseRetry`: rejects rows where `created_at < now - interval '24 hours'` (return 410 `REPORT_HORIZON_EXPIRED`, do NOT call `createIssue`). Lease-claim UPDATE additionally requires `created_at >= now - interval '24 hours'` to fence the boundary at the serialized step.
   - 8.3f reaper: deletes rows where `github_issue_url IS NULL AND created_at < now - interval '24 hours' AND processing_lease_until < now`. The third clause prevents the reaper removing a row a retry actively holds. A row whose `created_at` is past 24h but whose lease is still live is preserved; it becomes reapable only after the lease expires.

3. **`lease_holder uuid` ownership protocol.** Stamped at reservation, rotated on every lease re-acquisition. Required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE. A 0-row tail UPDATE triggers orphan cleanup: close GH issue with `state_reason: 'not_planned'`, add `fxav-orphan-lost-lease` label, INSERT `admin_alerts` `REPORT_ORPHANED_LOST_LEASE`. If re-SELECT returns null, return 410 `REPORT_HORIZON_EXPIRED`.

---

## Spec self-review additions (mirrors global guidance, project-scoped)

Run these checks during the self-review step in `superpowers:brainstorming` (or its Codex equivalent). They are derived from past adversarial-review findings on this project.

- **Guard conditions for every prop.** For each prop/input, specify what happens when it's null, empty, zero, or NaN. React components receive partial data during editing — the spec must say what renders.
- **Mode boundaries.** When a component has multiple modes or layouts, explicitly state which visual elements belong to which mode. "Shared elements" must name which modes share them.
- **Cap/truncation behavior.** Whenever a list could grow unbounded (schedule entries, zones, segments), state the max count and what happens at the boundary (ellipsis, note, truncation).
- **Rendered vs conceptual.** If something should be a rendered component element (not just a markdown description), say so with exact placement, styling, and text content.
- **Dimensional invariants.** Any component with a fixed-height or fixed-width parent containing flex/grid children MUST have a "Dimensional Invariants" section listing every parent→child dimension relationship and the exact class/style that guarantees it (`items-stretch`, `h-full`, `self-stretch`, explicit `style={{height:...}}`). **This project's Tailwind v4 does not default `.flex` to `align-items: stretch`** — every such relationship must be stated explicitly in the spec and verified in the plan with a real-browser Playwright assertion (jsdom is not sufficient).
- **Transition inventory.** Any component with multiple visual states MUST have a "Transition Inventory" table listing every state-transition pair and its animation treatment. For N states, enumerate all N\*(N-1)/2 pairs. Each pair gets either an explicit animation or an explicit "instant — no animation needed" declaration. Also enumerate compound transitions (state A changes while state B is mid-transition or in a non-default value).
- **Existing-code citations.** Every factual claim about current code — function signatures, parameter names, field names, CHECK constraint names, enum values, component APIs, URLs, DOM roles/shapes, test-fixture shapes — MUST cite `file:line`. Grep each cited name against the live codebase and confirm it exists and the claim matches. This is the #1 source of round-1 adversarial findings.
- **Tier × domain completeness matrix.** For any DB-touching change, include an explicit matrix covering every affected tier × domain × layer (table DDL, inline CHECK, RPC read path, RPC write path, propagation trigger function, cleanup function, frontend form, audit page, tests). Every cell gets a concrete action or "N/A — reason."
- **CHECK/enum migration matrix.** Whenever a CHECK or enum changes, enumerate (a) every method enum value × what the CHECK must accept, (b) NULL/disabled-method rows, (c) the transitional window where tables/ files run BEFORE migrations/ on every apply (so inline CHECKs must accept both old and new values), (d) apply-twice idempotency (`DROP ... IF EXISTS` + `ADD`), (e) one-shot migration lifecycle.
- **Flag lifecycle table.** For every boolean config field or toggle, state its **storage** | **write path(s)** | **read path(s)** | **actual effect on output**. If any column is empty (zombie flag), decide explicitly whether to wire it through or hide it.
- **Self-consistency sweep.** After drafting, grep the spec for every numeric literal, default value, and "out of scope" claim. Same value contradicted across Resolved Decisions / body / test section is the most common round-2 finding.
- **Disagreement-loop preempt.** Identify contracts the reviewer is likely to relitigate: fail-open vs fail-closed posture, intentional placeholders/stubs, scope-deferral decisions, "won't ship until M<n+1>" exemptions. For each, cite the precedent at `file:line` so the handoff §6 (Watchpoints) can pre-load the reviewer rather than discovering the contract in round-N. M4 burned three rounds (R13, R23, R26) re-litigating realtime fail-open before the spec citation closed it; the round-3 cap exists for this class but the cap costs three rounds, not zero.
- **Build-vs-runtime gate explicitness.** For every env-gated feature, state the gate's evaluation moment (build-time artifact decision / runtime check / both) and the test shape that proves the gate works at that moment (artifact built with flag UNSET vs SET, or runtime probe). M3 R1–R2 spent two rounds discovering this distinction wasn't pre-specified and that the canonical `pnpm build` bypassed the wrapper.

---

## Writing-plans additions (mirrors global guidance, project-scoped)

Run these when writing or revising any milestone plan in this repo.

- **Pre-draft code-verification pass (mandatory).** Before writing any task step that names a specific file, function, field, constraint, component prop, DOM role, URL, or test fixture, verify each against the live codebase with grep. Round-1 adversarial findings are dominated by plans that name APIs or fixtures that don't match reality. Budget ~10 min of verification up front — saves multiple review rounds.
- **Layout-dimensions task (mandatory for fixed-dimension parents).** Add a TDD task that writes a real-browser-rendered assertion (Playwright, or chrome-devtools `evaluate_script`) calling `getBoundingClientRect()` on every documented `data-testid` inside a fixed-dimension parent and asserting `child.height === parent.height` (and/or width) within 0.5px tolerance. Jest + jsdom is not sufficient. Body must include the spec's exact "Dimensional Invariants" list.
- **Transition-audit task (mandatory for components with Transition Inventory).** TDD task that lists every `AnimatePresence`, ternary render, and conditional block; asserts each has appropriate `exit`/`initial`/`animate` props (or is deliberately instant); tests compound transitions (toggle state A while state B is active/mid-animation). Body must include the spec's transition inventory table.
- **Anti-tautology rule for tests.**
  - When asserting a graphic matches a calc result, assert against the data source (e.g., `markdownVariables.shifts[-1].surchargedBuckets`), NOT the container that renders both.
  - When scanning rendered DOM for a label, first clone the tree and remove sibling elements that independently render that label.
  - Derive expected values from fixture dimensions, never hardcode. A 2-hour shift fixture cannot reach a 3.0× top-tier assertion regardless of configuration.
  - For every new test task, state the concrete failure mode it catches. If the only thing it proves is "the function is called," strengthen it.
- **Adversarial review (cross-model) is mandatory.** When creating the task checklist, add an "Adversarial review (cross-model)" task between "Self-review" and "Execution handoff." After plan self-review completes, invoke the cross-CLI review (Codex if implementer is Claude, Claude if implementer is Codex). Models iterate until convergence; only escalate genuine ambiguity to the user. Do not proceed to execution handoff without this step.
- **Meta-test inventory (mandatory).** Before drafting tasks, declare in the plan body which structural meta-tests this milestone CREATES or EXTENDS. Candidate registries: Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`); sentinel hiding in optional text (`tests/components/tiles/_metaSentinelHidingContract.test.ts`); `admin_alerts.upsert` catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`); advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`); no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). Most milestones touching auth, DB writes, admin alerts, or tile rendering will have at least one entry. "None applies because <reason>" is acceptable but must be declared explicitly. M4 §8.3 (8 rounds) and M5 R14–R18 (6 rounds) both became cheap once the meta-test landed; pre-declaring saves the rounds.
- **Advisory-lock holder topology (mandatory if the plan touches `pg_advisory*`).** Enumerate every existing lock holder for each hashkey the plan touches (JS-side wrapper, in-RPC, nested SECURITY DEFINER) and state which layer is the new code's holder. If multiple layers acquire the same key, the plan MUST resolve to a single layer or extend `tests/auth/advisoryLockRpcDeadlock.test.ts` to pin the topology. M5 R20 was a CRITICAL deadlock from this class; this rule catches it at plan time.
- **Fix-round regression budget.** When a fix in a review round patches surface S for class C, the next-round preparation must include: (a) re-grep class C across S after the patch, (b) confirm the relevant meta-test (if any) still passes, (c) note both in the round closure. M5 R19→R20 introduced a CRITICAL deadlock by patching an advisory-lock hole on a surface that already had a JS-side wrapper; this rule catches that class.
- **Same-vector recurrence triggers comprehensive re-analysis (mandatory).** If three adversarial-review rounds in a row identify findings on the same vector (HTTP semantics, advisory-lock topology, Supabase call-boundary, etc. — same conceptual surface, even if different files), the next round's preparation MUST include a comprehensive re-analysis of that vector: read the governing spec / RFC / contract end-to-end, enumerate every requirement as a checklist, and audit the diff against the full checklist BEFORE the next review fires. If the round after the comprehensive re-analysis STILL surfaces a finding on the same vector, the analysis was incomplete — stop patching, declare the vector unresolved, and deep-dive the spec + diff together until convergence is structural (not per-instance). Codified after M7 Task 7.9 R14→R22, which spent 9 rounds on incremental RFC 7233 / HTTP-semantics edge cases (Range parse → suffix Range → 416 unsatisfiable → Content-Length on 206 → 206 total-size cap-bypass) that a single up-front spec audit would have one-shotted. The class-sweep rule above catches "found one, find peers"; this rule catches "implementing a documented spec, audit the full surface."
- **`echo >>` discipline.** Never use `echo "X" >> .gitignore` (or any append-to-file shell idiom that doesn't guarantee a trailing newline on the previous line). M0 R1 + M4 R7 both shipped malformed gitignore entries this way. Use `printf '\n%s\n'` and verify with `git check-ignore -v <path>`.

---

## Codex-specific notes

These apply when this repo is being driven by Codex CLI (`codex exec`) rather than Claude Code. Skip if you're not running under Codex.

- **Sandbox + git.** Codex's sandbox mode restricts git operations. If you produce a commit-worthy patch under Codex, either (a) finish the patch, exit the sandbox, and run `git add` + `git commit` from outside, or (b) explicitly relax sandbox to allow git for this repo. Don't try `git commit` inside a default-sandboxed Codex run — it will fail or no-op silently.
- **Reasoning level.** Default to high (matches the published 56-task benchmark configuration). Treat `xhigh`/medium-low experiments as unverified anecdotes.
- **Companion-surface check.** Codex/GPT-5.5's known strength is broader integration footprint, but its risk is bigger patches. Before declaring a task done, grep the repo for parallel surfaces the change should also touch: `lib/parser/versions/v*.ts` mirrors, `supabase/migrations/` vs inline CHECKs in `tables/`, `app/show/[slug]/page.tsx` vs `app/show/[slug]/p/page.tsx` (signed-link path mirrors signed-in path).
- **Output verbosity.** Match the verbosity to the task. Don't narrate tool calls. Don't echo file contents the user just read. Keep explanations proportional to complexity.

---

## Routing convention

Every milestone has an assigned implementer model+harness, documented in `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/ROUTING.md`. When a milestone is delegated across harnesses, the handoff follows `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/HANDOFF-TEMPLATE.md`. Read both before starting any milestone.

### Hard rule: UI work is always Opus / Claude Code

Any task whose primary deliverable is UI code is owned by Opus, regardless of which harness owns the rest of the milestone. UI code means:

- Any file under `app/` **except** `app/api/**` (pages, layouts, loading/error/not-found components, route group folders)
- Any file under `components/`
- `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `DESIGN.md`, design-token / theme files

If you are running under Codex and a task you are about to start lands in any of those locations, **stop**. The task belongs to Opus + the **impeccable v3** skill (`/impeccable` slash command and its preflight gates: PRODUCT.md → DESIGN.md → register identification → preflight signal). Impeccable v3 superseded the legacy `frontend-design` skill as the canonical UI workflow on this project; do NOT load `frontend-design` for new UI work. Hand back to the orchestrator (Claude Code) for that task. The handoff doc records which tasks split which way.
