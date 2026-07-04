# Phase P1 — Part-B App Layer (Tasks 4–6)

Depends on P0 (the RPC actor gate + its test migrations). These tasks swap the Server-Action gate, update the §12.4 copy that the swap invalidates, and hide the UI management controls for non-developers.

---

### Task 4: Server-action gate swap + `developerGatingContract` enforcement-2 flip + §4.2 action-suite migration

Implements spec §3.1, §4, §4.2. **One commit** — swapping the gate immediately breaks the action-level suites that mock `requireAdminIdentity` and assert `AdminInfraError`, and the enforcement-2 meta-test, so all of them move atomically. TDD order within the task: adjust the meta-test + the mocked suites to the developer contract FIRST (they go red because `actions.ts` still imports the admin gate), then swap the gate → all green.

**Files:**
- Modify: `app/admin/settings/admins/actions.ts`
- Modify: `tests/auth/developerGatingContract.test.ts` (enforcement 2)
- Modify: `tests/admin/admins-actions.test.ts`, `tests/app/admin/adminActionInfraError.test.ts`, `tests/app/admin/adminActionsRevalidate.test.ts`, `tests/app/admin/revokeHang.test.tsx`

**Interfaces:** `addAdminAction` + `revokeAdminAction` gate on `requireDeveloperIdentity()` (imported from `@/lib/auth/requireDeveloper`), first statement, boundary-throw posture preserved (a `forbidden()` digest for a non-developer / a `DeveloperInfraError` for an infra fault propagates to the boundary exactly as the admin gate did).

- [ ] **Step 1: Flip `developerGatingContract` enforcement 2 (fail-first).** In `tests/auth/developerGatingContract.test.ts`, change `ADMIN_GATE = "requireAdminIdentity"` (`:133`) → `"requireDeveloperIdentity"`, rename the constants (`ADMIN_GATED_ACTION_FILE`/`ADMIN_GATED_ACTIONS`/`ADMIN_GATE` → `DEVELOPER_GATED_ACTION_FILE`/…/`DEVELOPER_GATE`), and update the `describe`/`test` names + body (`:288-289`) to assert `addAdminAction` + `revokeAdminAction` are `requireDeveloperIdentity`-gated first-statement (NOT admin, NOT ungated). Keep the AST first-statement + boundary-throw assertion shape. (Equivalent alternative: move a new `admins-actions` row into `DEVELOPER_GATED_SURFACES` with `gate:"requireDeveloperIdentity"`, `consumerKind:"server-action-file"`, `actions:["addAdminAction","revokeAdminAction"]`, and delete the standalone enforcement-2 block — pick whichever keeps enforcement 1's AST coverage non-duplicative. Do NOT leave both a `requireAdminIdentity` assertion and a `requireDeveloperIdentity` assertion for these actions.)

- [ ] **Step 2: Migrate the §4.2 action-level suites (fail-first).** In each, change the gate mock target `@/lib/auth/requireAdmin`'s `requireAdminIdentity` → `@/lib/auth/requireDeveloper`'s `requireDeveloperIdentity`; the success-path mock resolves to a developer identity (`{ email }`); the infra-arm assertion expects `DeveloperInfraError` (was `AdminInfraError`); update comments/contract prose. Sites (verified): `tests/admin/admins-actions.test.ts:29`, `tests/app/admin/adminActionInfraError.test.ts:27`, `tests/app/admin/adminActionsRevalidate.test.ts:22`, `tests/app/admin/revokeHang.test.tsx:39`. Re-grep to confirm completeness: `git grep -n "requireAdminIdentity" -- tests/ | rg "admins-actions|adminAction|revokeHang"` and inspect `tests/components/RevokeRowButton.test.tsx`, `tests/components/adminWriteFailSurfaces.test.tsx`, `tests/e2e/admin-settings-admins-refresh.spec.ts` — migrate any that mock the gate for these two actions; leave alone any that drive the button UI without mocking the gate. (There are NO actions in `admins/actions.ts` that stay admin-gated after Part B — both exported actions become developer-gated.)

- [ ] **Step 3: Run to verify red** — `pnpm vitest run tests/auth/developerGatingContract.test.ts tests/admin/admins-actions.test.ts tests/app/admin/adminActionInfraError.test.ts tests/app/admin/adminActionsRevalidate.test.ts tests/app/admin/revokeHang.test.tsx`. Expected: FAIL (actions.ts still imports/uses `requireAdminIdentity`).

- [ ] **Step 4: Swap the gate.** In `app/admin/settings/admins/actions.ts`: change the import at `:38` `import { requireAdminIdentity } from "@/lib/auth/requireAdmin";` → `import { requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";`. Change `addAdminAction`'s first statement `:76` `await requireAdminIdentity();` → `await requireDeveloperIdentity();`. Change `revokeAdminAction`'s `:158` `const identity = await requireAdminIdentity();` → `const identity = await requireDeveloperIdentity();`. Update the file docstring (`:7-13`) that references `requireAdminIdentity` → `requireDeveloperIdentity` (Part B: management is developer-only). `ReAddRowButton` reuses `addAdminAction` (`confirm_re_add=true`) → covered by the `addAdminAction` gate; no separate action.

- [ ] **Step 5: Run to verify green** — re-run the Step-3 command → PASS. Then run the broader auth + admin-action surface: `pnpm vitest run tests/auth/ tests/admin/admins-actions.test.ts tests/app/admin/` → green.

- [ ] **Step 6: Commit**

```bash
git add app/admin/settings/admins/actions.ts tests/auth/developerGatingContract.test.ts tests/admin/admins-actions.test.ts tests/app/admin/adminActionInfraError.test.ts tests/app/admin/adminActionsRevalidate.test.ts tests/app/admin/revokeHang.test.tsx
git commit --no-verify -m "feat(admin): admin-roster server actions require developer (gate swap + meta-test + suites)"
```

---

### Task 5: §12.4 3-way lockstep — two rows change semantics/copy (NO new code)

Implements spec §4 (Codex R6 HIGH). Part B adds no code but invalidates the prose/copy of two existing §12.4 rows, so the master-spec prose + `pnpm gen:spec-codes` (→ `lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts` update in lockstep. The x1 parity gate (`tests/cross-cutting/codes.test.ts`) compares runtime catalog ↔ generated spec-codes ↔ §12.4 prose — updating one without the others fails x1. **Do NOT run prettier on the master spec** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table rows `:2979`, `:3021` + helpfulContext appendix `:3236`, `:3279`)
- Modify: `lib/messages/__generated__/spec-codes.ts` (regenerated — do NOT hand-edit)
- Modify: `lib/messages/catalog.ts` (rows at `:2129` and `:2547`)

**Edits (each factual claim updated in BOTH the table row AND the appendix entry):**

- **`ADMIN_EMAIL_WRITE_FAILED`** — helpfulContext "…caught an AdminEmailsInfraError … after the **requireAdminIdentity** gate …" → **requireDeveloperIdentity**. Locations: master table row `:2979` (context column) + master appendix `:3236` + catalog `:2135` (helpfulContext). `dougFacing`/`title`/`longExplanation` unchanged.
- **`SELF_REVOKE_FORBIDDEN`** — three copy changes:
  1. helpfulContext "Other-revoke (a rogue admin revoking a peer, including the last peer) **stays allowed by design**; see amendment §5.5 + §11 anti-goal." → "Other-revoke is now **developer-only** (this milestone closes the §5.5 rogue-revoke risk); a non-developer actor is refused (42501 at the RPC / `forbidden()` at the Server Action)." Locations: master table row `:3021` (context column) + master appendix `:3279` + catalog `:2553`.
  2. `dougFacing` "…Ask another **admin** to do it if you need to be removed." → "…Ask another **developer** to do it…". Locations: master table row `:3021` (dougFacing column) + catalog `:2549`.
  3. `longExplanation` "…ask another **admin** to revoke you." → "…ask another **developer** to revoke you." AND `followUp` "Doug → ask another **admin** to revoke you" → "…**developer**…". Locations: master table row `:3021` (followUp column) + catalog `:2551`/`:2556`.
  - Rationale: after Part B only a developer can revoke; a developer self-revoking is the only way to reach this code, so "ask another developer" is the correct guidance. User-facing copy routed via `getRequiredDougFacing` — invariant 5 intact (no raw code).

- [ ] **Step 1: Edit the master spec** (targeted line edits ONLY — never prettier). Update the two table rows + the two appendix entries as above.
- [ ] **Step 2: Regenerate + verify fail-first** — `pnpm gen:spec-codes`; then `pnpm vitest run tests/cross-cutting/codes.test.ts` → FAIL (regenerated spec-codes now diverges from the stale `catalog.ts`). This proves the lockstep gate bites.
- [ ] **Step 3: Update `catalog.ts`** to match the regenerated copy for both rows.
- [ ] **Step 4: Run to green** — `pnpm vitest run tests/cross-cutting/codes.test.ts tests/messages/` → PASS. Confirm `git status` shows master spec + `spec-codes.ts` + `catalog.ts` all staged together.
- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit --no-verify -m "docs(messages): §12.4 — admin-roster mutation + self-revoke copy now developer-only (3-way lockstep)"
```

---

### Task 6: AdministratorsSection — hide management controls for non-developers (UI, Opus-owned)

Implements spec §3.3. Reuses the already-threaded `viewerIsDeveloper` prop (`AdministratorsSection.tsx:37`, threaded from `app/admin/settings/page.tsx:150` and the admins deep-link page — already covered by developer-tier). **UI surface** → invariant-8 impeccable dual-gate applies at close-out (Task 13). No dimensional change (this is visibility gating, mirroring the existing `DeveloperToggleButton` gate at `:198`) → a jsdom render test is sufficient; NO new real-browser layout task.

**Resolution of the §3.3 citation (see 00-overview "Plan-of-record deviations" #1 + #2):** gating the whole `AddAdminDisclosure` (`:149`) would hide the list (it wraps `{list}`), contradicting "non-developers keep the read-only list." So:
- `AddAdminDisclosure` renders only when `viewerIsDeveloper`; ELSE render an equivalent **read-only card** — the same `list` inside `<div data-testid="admin-settings-admins-card" className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">{list}</div>` preceded by `<header className="flex flex-wrap items-center justify-between gap-3">{heading}</header>` (mirrors `AddAdminDisclosure.tsx:54-62` verbatim, minus the `AddAdminTrigger` + disclosed `AddAdminForm`).
- `RevokeRowButton` (`:194`) — gate `{isActor ? null : <RevokeRowButton … />}` → `{isActor || !viewerIsDeveloper ? null : <RevokeRowButton … />}`.
- `ReAddRowButton` (`:220`) — thread `viewerIsDeveloper` into `RevokedRow` (call site `:135` + signature `:209-210`), then `{viewerIsDeveloper ? <ReAddRowButton … /> : null}`.
- Non-developers keep the read-only list (emails, added/revoked metadata, "You" badge, REVOKED disclosure) with NO management affordance. `viewerIsDeveloper` default `false` (`:37`) → a partial/failed developer-status read renders the safe read-only view.

**Files:**
- Modify: `components/admin/settings/AdministratorsSection.tsx`
- Modify: `tests/components/admin/settings/AdministratorsSection-developer.test.tsx` (extend)

- [ ] **Step 1: Extend the render test (fail-first).** In `AdministratorsSection-developer.test.tsx`, add cases (concrete failure mode: a non-developer admin currently sees Add/Revoke/Re-add controls — a privilege-surface leak). Render `AdministratorsSection` with a fixture result containing ≥1 active row (non-actor) and ≥1 revoked row:
  - `viewerIsDeveloper={false}`: assert `queryByTestId("admin-add-admin-trigger")` is null; no `RevokeRowButton` (query its testid/role); no `ReAddRowButton`; AND assert the read-only list IS present — `getByTestId("admin-settings-admins-card")`, the active row (`admin-allowlist-row`), the "You" badge on the actor row, and the revoked disclosure (`admin-revoked-list`) all render.
  - `viewerIsDeveloper={true}`: assert the add trigger, a non-actor RevokeRowButton, and a ReAddRowButton all render (current behavior).
  - Anti-tautology: derive the expected active/revoked counts from the fixture `result.rows`, not a hardcoded number. Run `pnpm vitest run tests/components/admin/settings/AdministratorsSection-developer.test.tsx` → FAIL (non-developer branch currently renders the controls).
- [ ] **Step 2: Implement the gating** in `AdministratorsSection.tsx` per the resolution above.
- [ ] **Step 3: Run to green** — re-run the test → PASS. Also run the existing `tests/components/admin/settings/AdministratorsSection.test.tsx` (non-developer-agnostic baseline) → still green.
- [ ] **Step 4: Commit**

```bash
git add components/admin/settings/AdministratorsSection.tsx tests/components/admin/settings/AdministratorsSection-developer.test.tsx
git commit --no-verify -m "feat(admin): hide add/revoke/re-add controls from non-developers (read-only roster view)"
```
