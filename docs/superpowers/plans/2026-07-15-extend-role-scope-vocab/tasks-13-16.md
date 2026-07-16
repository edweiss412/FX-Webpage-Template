# Tasks 13–16 — UI, projection test, meta sweep, close-out gates

---

### Task 13: UI — recognize control, settings page, TRUST_DOMAINS

**OPUS-OWNED (routing hard rule).** Invariant 8 applies: `/impeccable critique` + `/impeccable audit` on the affected diff before the cross-model review (Task 16), P0/P1 findings fixed or `DEFERRED.md`-deferred. Visual source of truth: the committed mocks — `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Recognize Role Control.dc.html` (control: collapsed trigger exploration A neutral-outline, expanded panel, saving, saved, error, desktop two-up grid) and `Roles You've Added.dc.html` (settings rows, chips incl. amber financial + dashed "Standard page only", inline edit, two-step inline remove, empty state, desktop grid rows). Copy: spec §9 VERBATIM — banned-vocabulary rule covers every string in these components.

**Files:**
- Create: `components/admin/RoleRecognizeControl.tsx` (presentational), `components/admin/RoleRecognizeControlBoundary.tsx` (client glue; precedent `components/admin/UseRawControlBoundary.tsx` — same `SurfaceProps` discriminated-union shape `{ surface: "show"; showId } | { surface: "wizard"; wizardSessionId; driveFileId }`), `app/admin/settings/roles/page.tsx` (server component), `app/admin/settings/roles/RoleMappingRow.tsx` (client row: chips, inline edit, two-step remove)
- Modify: `app/admin/show/[slug]/page.tsx` (the `renderItemControls` slot already passing use-raw controls — add the recognize control for `w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string"`), `components/admin/wizard/step3ReviewSections.tsx` (`SectionFlagCallout` :566 region — same conditional, wizard surface props threaded exactly like `UseRawControlBoundary` at :566-570), `lib/audit/trustDomains.ts` (`PROTECTED_ROUTES`: `{ path: "app/admin/settings/roles/page.tsx", chain: ["requireAdmin"] }` — match the chain the settings pages actually use; read `app/admin/settings/page.tsx` first)
- Test: `tests/components/RoleRecognizeControl.test.tsx`, `tests/components/roleMappingSettingsRows.test.tsx`, plus `tests/cross-cutting/auth-chain-audit.test.ts` re-run

**Component contracts (from spec §8.1, all pre-verified in adversarial rounds):**
- Guard: no `roleToken` → render nothing (legacy warning). Blank token after canonicalization → nothing.
- States: collapsed / idle / saving / saved / error — plus the two benign result branches `stale` and `conflict` with their §9 pinned strings (distinct from the error state; NOT error styling).
- Transition inventory (spec §8.1 table): the two `rr-pop` entrances (collapsed→idle, saving→saved) and the spinner are the only animations; everything else instant; unreachable pairs enumerated in the spec — the transition-audit checklist below asserts each.
- Saved card: client-local until unmount; summary line branches applied vs apply_pending (§9 strings); "Change what they see" reopens panel in REVISE mode → submits via `updateRoleTokenMapping` (NOT the create action), pre-filled grants; no liveness guarantee (component-level test only, actions mocked).
- Component state keyed to warning identity (`code` + `roleToken` + `blockRef.index`) so list churn never migrates checkbox state between rows.

- [ ] **Step 1: Write failing component tests** — jsdom + Testing Library, actions mocked at module level (pattern: existing `tests/components/` use-raw control tests). Required cases, each derived from the §9 strings (import nothing hardcoded twice — assert against a shared strings module if you extract one):
  - renders nothing without `roleToken`
  - collapsed trigger text "Recognize this role"; expand shows heading + scope line with the token interpolated + 4 checkboxes + financial caution + "They'll get the standard show page." when none checked
  - saving disables all inputs, label "Recognizing…"
  - `applied` result → saved card with grant-summary join ("Audio and Video details"; empty → "the standard show page")
  - `apply_pending` result → the §9 pending summary line, same saved styling
  - `stale` / `conflict` results → their pinned benign notices, no error styling, own branches
  - infra error → "That didn't save, so nothing has changed yet. Check your connection and try again." + "Try again", selections kept
  - revise mode: reopen → submit calls `updateRoleTokenMapping` with the edited grants
  - async state assertions use `waitFor` on the settled DOM (async-focus memory)
- [ ] **Step 2: Verify failures.**
- [ ] **Step 3: Implement the control + boundary** to the mock's visual spec (Tailwind classes matching the project's token system — check `DESIGN.md` + neighboring admin components for the canonical class vocabulary; `min-h-tap-min`-style tap targets ≥44px; no red/green sole carrier; no modal).
- [ ] **Step 4: Wire both surfaces** (show page slot + `SectionFlagCallout`), mirroring the use-raw wiring including the `wizardSessionId` conditional spread (`step3ReviewSections.tsx:712`).
- [ ] **Step 5: Settings page + rows** per the second mock: server component loads rows via the service-role server client (`{data, error}` destructured; registry row in `_metaInfraContract` or `// not-subject-to-meta:` per that test's scope rules), renders `RoleMappingRow` list + empty state; row client component implements view/edit/confirm-remove states with the pinned copy and calls the Task 12 actions.
- [ ] **Step 6: TRUST_DOMAINS row**; run `pnpm exec vitest run tests/cross-cutting/auth-chain-audit.test.ts` — green.
- [ ] **Step 7: Transition-audit checklist (mandatory):** enumerate every conditional render/ternary in both new components against the spec §8.1 inventory; assert the two animated entrances have their animation classes and every other pair is instant; test the compound case (toggle one row's edit while another row's remove-confirm is open — state stays per-row).
- [ ] **Step 8: Run** `pnpm exec vitest run tests/components tests/cross-cutting` → PASS. `pnpm build` (RSC action-wiring breaks only surface in build — server actions passed as DIRECT refs, never inline closures).
- [ ] **Step 9: Run `/impeccable critique` then `/impeccable audit`** on the UI diff (canonical v3 setup gates). Fix P0/P1 or defer via `DEFERRED.md`.
- [ ] **Step 10: Commit** — `feat(admin): recognize-role control + roles settings page (impeccable dual-gate run)`.

---

### Task 14: Financials projection test + end-to-end integration test

**Files:**
- Test: `tests/data/financialsEntitlement.test.ts` (new), extend `tests/sync/phase2RoleMappings.test.ts`

- [ ] **Step 1: Projection test (spec §4.1/§13)** — follow the existing `getShowForViewer` test harness in `tests/data/` (mocked service-role client):
  - FINANCIALS-only (non-LEAD, non-admin) viewer: the `shows_internal.financials` read ISSUES and `financials` is present on the result.
  - Viewer with neither entitlement: ZERO financials reads issue (assert the mock's `from("shows_internal")` financials select was never called — the existing contract).
  - LEAD viewer unchanged.
- [ ] **Step 2: Integration test through phase2** — mapped token end-to-end: crew row upserted with the grant, warning absent from persisted `parseWarnings`, `ROLE_FLAGS_NOTICE` delta present (the existing changes-feed assertion pattern), `appliedRoleMappings` carries the per-token entry.
- [ ] **Step 3: Undo-interplay regression test (spec §12 matrix row)** — the undo RPC rebuilds `role_flags` from JSONB snapshots (`supabase/migrations/20260608000003_undo_change_rpc.sql:250-259`); snapshots are taken AFTER the overlay, so undo restores overlay-applied flags and the next sync re-applies the unchanged mapping. Test (DB-bound, follow the existing undo test file's harness): apply a mapping via phase2 → snapshot a change → undo it → the restored row still carries the granted flag; a subsequent phase2 run converges without emitting (steady state).
- [ ] **Step 4: Run + commit** — `test(sync): financials entitlement projection + role-mapping e2e + undo interplay`.

---

### Task 15: Meta-test sweep + mutation harness

- [ ] **Step 1: Re-run every structural meta-test this feature touches** (single command):

```bash
pnpm exec vitest run \
  tests/log/_metaMutationSurfaceObservability.test.ts \
  tests/log/adminOutcomeBehavior.test.ts \
  tests/auth/_metaInfraContract.test.ts \
  tests/auth/advisoryLockRpcDeadlock.test.ts \
  tests/admin/no-inline-email-normalization.test.ts \
  tests/parser/_metaKnownSectionsWalker.test.ts \
  tests/messages/_metaCatalogCopyHygiene.test.ts \
  tests/cross-cutting/auth-chain-audit.test.ts \
  tests/cross-cutting/codes.test.ts
```

Expected: ALL PASS. Any failure names a missing registry row/exemption — add the row (never weaken the meta-test).

- [ ] **Step 2: Mutation harness local run** (parser output changed — the `roleToken` field):

```bash
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation
```

Green → nothing to do. Red with fingerprint-only drift (same siteIds — BACKLOG.md:39 semantics): DEFERRABLE per the ledger discipline — file the BACKLOG follow-up entry naming the drifted fixtures, do NOT regenerate the 7912-row ledger in-PR. Red with NEW siteIds or fixed holes: stop, that is not benign — investigate before proceeding.

- [ ] **Step 3: Commit** any registry additions — `test(log): meta-test registry rows for role-mapping surfaces`.

---

### Task 16: Close-out gates

- [ ] **Step 1: Full local gates** (foreground, NEVER piped through `tail` — the failed-file list flushes at end):

```bash
pnpm test        # full suite
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

All green (known env-bound exceptions: psql-backed suites need the local stack; CI fresh-DB is the arbiter for those two known files).

- [ ] **Step 2: Rebase check** — `git fetch origin && git rev-list --count HEAD..origin/main`; if origin/main advanced, rebase and re-run Step 1 (stale-base memory; sibling-worktree DB pollution memory if mass env failures appear).

- [ ] **Step 3: Adversarial review (cross-model)** — whole-diff Codex review, fresh-eyes posture, REVIEWER ONLY, iterate to APPROVE, no round budget. Class-sweep every finding before patching; structural defense on 3rd same-vector round. (Companion wedged during the spec reviews — the working fallback is the fully-inlined `codex exec -o <verdict-file>` no-tool pattern; reuse it.)

- [ ] **Step 4: Push + PR + real CI green** — push branch; `gh pr create` (body ends with the Claude Code footer); watch checks via PR NUMBER (`gh pr checks <PR#> --watch`), confirm `mergeStateStatus == CLEAN`; validation-schema-parity green proves Task 3 Step 6 landed.

- [ ] **Step 5: Merge** — `gh pr merge <PR#> --merge` (never squash); fast-forward local main; verify `git rev-list --left-right --count main...origin/main` = `0  0`.

- [ ] **Step 6: Record** — BACKLOG.md status line for `BL-EXTEND-ROLE-SCOPE-VOCAB` (✅ SHIPPED + PR#), memory index update.
