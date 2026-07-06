# Admin-alert auto-resolution — handoff notes

Feature branch: `feat/admin-alert-auto-resolution` · Spec: `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` (Codex APPROVE R7) · Plan: `plan.md` in this dir (Codex APPROVE R8).

## §12 UI-gate findings & dispositions (invariant 8 / AC11)

Scope: the only UI-surface file in the diff — `app/show/[slug]/[shareToken]/_CrewShell.tsx` (commits `d3d6dac1` + `de7549d0`; non-visual else-branch scheduling the TILE_PROJECTION_FETCH_FAILED resolve via `after()`).

**`/impeccable critique`** (2026-07-03, dual independent assessments):

- Assessment A (LLM design review, external subagent): **no rendered-output delta** (diff walked line-by-line; JSX/copy/classes untouched); perceived-perf safe (`after()` defers off the response path; fallback is fire-and-forget); failure states fail-quiet server-side only. Heuristics: error prevention 4/4; all visual heuristics N/A-unchanged. One **LOW**: every healthy render issues a resolve attempt (idempotent UPDATE against the `resolved_at IS NULL` partial index). **Disposition: accepted** — documented spec decision (spec S6 cost note: the raise path already pays an equivalent per-render write when unhealthy).
- Assessment B (deterministic detector, `npx impeccable --json` on the file): **zero findings** (`[]`, exit 0).

**`/impeccable audit`** (2026-07-03, external subagent): **PASS, no findings.** A11y/theming/responsive N/A-unchanged (no markup/style surface); performance 3/4 (no new client-construction cost; no unhandled-rejection risk — rejection caught inside `doResolve` before the `void`); code quality 4/4 (posture mirrors raise path; `not-subject-to-meta` exemption justified; distinct forensic code registered in `_metaAdminOutcomeContract.test.ts`). Render-regression evidence: crewShellAlert + crewShell suites 25/25.

**HIGH/CRITICAL findings: none. DEFERRED.md entries required: none.**

## Watchpoints for the whole-diff review (do not relitigate)

- S1 is a `published`-flip DB trigger, not per-writer RPC hooks — settled spec R6 (three successive rounds each found another writer; trigger closes the class).
- `CREW_PROJECTION_ALERT_RESOLVE_FAILED` is a NEW forensic-only code replacing the plan's "reuse + phase field" instruction: the plan's premise (new code trips §12.4 gates) was factually wrong — the code has zero catalog/enum/help footprint (verified: `gen:internal-code-enums` zero diff), and reuse broke the pre-existing forensic-code-uniqueness meta-test (`_metaAdminOutcomeContract.test.ts:583`). Registered per that meta-test's registry (35→36).
- Spec §3's "18 EVENT" aggregate = the lifecycle registry's 17 `event-manual` + 1 `state-manual-justified` (TILE_SERVER_RENDER_FAILED, the asterisked row). Per-code class sets match the spec table exactly; the aggregate label difference is documented in-file.
- Schema manifest intentionally NOT regenerated on this branch: the trigger-only migration adds no public tables/columns; the only regen delta (`admin_emails.is_developer`) is sibling-worktree drift owned by another PR.
- Validation project state: migration applied surgically + pgrst reloaded (2026-07-03); the historical stale East Coast alert row no longer existed (cascaded/cleaned before apply — repair `UPDATE 0` is correct); trigger proven live via rolled-back throwaway-show transaction (resolved=t, resolved_by NULL); validation-schema-parity 6/6 green.
