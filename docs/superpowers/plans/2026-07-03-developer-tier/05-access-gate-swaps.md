# Phase 5 — Access Gate Swaps (Tasks 10–13)

Each surface swaps `requireAdmin*` → `requireDeveloper*`. Because `requireDeveloper` subsumes `requireAdmin` (developer ⟹ admin), it REPLACES (not stacks). Spec §6 matrix + §6.1.

---

### Task 10: `/admin/dev/*` — page, 6 server actions, 2 harnesses

Spec §6 rows 1–3. All are build-gated (renamed aside in normal builds); this is a runtime-gate swap that only matters in dev-flag builds, but must be complete for the `developerGatingContract` AST guard (Task 20).

**Files (all Modify):** `app/admin/dev/page.tsx:60`; `app/admin/dev/actions.ts` (`parseAndStage:122`, `parseAndStageFormAction:256`, `getStagedResult:281`, `resetDevSchema:393`, `resetDevSchemaFormAction:403`, `listFixtures:412`); `app/admin/dev/source-link-dim/page.tsx:86`; `app/admin/dev/observability-dim/page.tsx:107`.

- [ ] **Step 1: Failing test** — `tests/admin/dev-requires-developer.test.ts`: import each module with `requireDeveloper` mocked to throw a sentinel; assert every exported dev action + each page calls the sentinel (i.e. is developer-gated), and that `requireAdmin` is NOT called. (For the pages, assert the first-statement gate; for actions, assert each of the 6 rejects when `requireDeveloper` throws.) This is superseded structurally by Task 20 but gives a fast unit signal.

- [ ] **Step 2: Fails** — FAIL (still `requireAdmin`).

- [ ] **Step 3: Implement** — in each file, replace the import `requireAdmin` → `requireDeveloper` (from `@/lib/auth/requireDeveloper`) and the call `await requireAdmin()` → `await requireDeveloper()` as the first statement. In `actions.ts` do this for all 6 exported actions. (These are boundary-throw posture — gate is the first executable statement, outside any try.)

- [ ] **Step 4: Green + Commit**

```bash
git add app/admin/dev tests/admin/dev-requires-developer.test.ts
git commit --no-verify -m "feat(auth): gate /admin/dev surfaces on requireDeveloper"
```

---

### Task 11: Activity `/admin/observability` page

Spec §6 row 5. The data loaders (`loadCronHealth`, `loadAppEvents`) do NOT self-gate (service-role clients) — the page gate is the sole and sufficient access control, so only the page changes.

**Files (Modify):** `app/admin/observability/page.tsx:20` (`requireAdminIdentity()` → `requireDeveloperIdentity()`; update the import).

- [ ] **Step 1: Failing test** — `tests/admin/observability-requires-developer.test.ts`: render/import `ObservabilityPage` with `requireDeveloperIdentity` mocked to throw a sentinel; assert it is called (page is developer-gated) and `requireAdminIdentity` is not.

- [ ] **Step 2: Fails → Step 3: swap the gate → Step 4: green.**

- [ ] **Step 5: Commit**

```bash
git add app/admin/observability/page.tsx tests/admin/observability-requires-developer.test.ts
git commit --no-verify -m "feat(auth): gate Activity/observability page on requireDeveloper"
```

---

### Task 12: Reap route — gate swap + infra-error 500 mapping (R3/R7)

Spec §6 row 6 + §6.1. `app/api/admin/onboarding/reap-stale-sessions/route.ts`: injected gate (`:38` `routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity`), resolved call `:42`, catch `:43-49` (`if (code === "ADMIN_SESSION_LOOKUP_FAILED") return 500; else 403 ADMIN_FORBIDDEN`).

**Files:**
- Modify: `app/api/admin/onboarding/reap-stale-sessions/route.ts`
- Modify: `tests/admin/reap-stale-sessions.test.ts` (or create `reap-developer-gate.test.ts`)

- [ ] **Step 1: Failing test** — inject a `requireDeveloperIdentity` that throws `DeveloperInfraError` → assert HTTP **500** AND `body.code === "ADMIN_SESSION_LOOKUP_FAILED"` (cataloged; NOT the raw `DEVELOPER_SESSION_LOOKUP_FAILED`); inject one that calls `forbidden()` (confirmed non-developer) → assert **403** `ADMIN_FORBIDDEN`.

```ts
test("developer infra fault -> 500 with cataloged ADMIN_SESSION_LOOKUP_FAILED code", async () => {
  const res = await handleReapStaleSessions(req, {
    requireAdminIdentity: async () => { throw new DeveloperInfraError("boom"); },
  });
  expect(res.status).toBe(500);
  expect((await res.json()).code).toBe("ADMIN_SESSION_LOOKUP_FAILED");
});
```

- [ ] **Step 2: Fails** — the current catch would 403 the `DEVELOPER_SESSION_LOOKUP_FAILED` code.

- [ ] **Step 3: Implement**
  - `defaultRequireAdminIdentity` (`:25-28`) → import + call `requireDeveloperIdentity` from `@/lib/auth/requireDeveloper` (rename the dep to `requireDeveloperIdentity` or keep the injected key but point default at the developer gate — keep the injection seam for tests).
  - Catch (`:46`): `if (code === "ADMIN_SESSION_LOOKUP_FAILED" || code === "DEVELOPER_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");` (body code stays the cataloged one), else `return errorResponse(403, "ADMIN_FORBIDDEN");`.

- [ ] **Step 4: Green + Commit**

```bash
git add app/api/admin/onboarding/reap-stale-sessions/route.ts tests/admin/reap-developer-gate.test.ts
git commit --no-verify -m "feat(auth): gate reap route on requireDeveloper; map developer infra to cataloged 500"
```

---

### Task 13: validationReset actions — inline-typed posture (R4/R8)

Spec §6 row (validationReset) + §6.1 "validationReset fix". `app/admin/settings/_actions/validationReset.ts`: `resetValidationDataAction` (`requireAdmin():50`, `destructiveResetAllowed():53`), `reseedValidationFixturesAction` (`requireAdmin():124`, `:127`). Contract `ValidationActionResult = { ok: true; count } | { ok: false; code: MessageCode }` (`:35`). **inline-typed-exception** posture: gate is the first side-effecting op INSIDE the top-level try; catch maps `DeveloperInfraError` → `{ ok: false, code: "VALIDATION_RESET_FAILED" }` (reseed: `"VALIDATION_RESEED_FAILED"`).

**Files:**
- Modify: `app/admin/settings/_actions/validationReset.ts`
- Create: `tests/admin/validationReset-developer-posture.test.ts`

- [ ] **Step 1: Failing test** — mock `requireDeveloper` to throw `DeveloperInfraError`; assert `resetValidationDataAction()` **returns** `{ ok: false, code: "VALIDATION_RESET_FAILED" }` (does NOT throw), and `reseedValidationFixturesAction()` returns `{ ok: false, code: "VALIDATION_RESEED_FAILED" }`. Also assert the gate is `requireDeveloper` not `requireAdmin`, and that a non-developer `forbidden()` digest is re-thrown (not converted to `{ok:false}`).

- [ ] **Step 2: Fails** — FAIL.

- [ ] **Step 3: Implement** — for each action: import `requireDeveloper` + `DeveloperInfraError`; wrap the body in a top-level `try`; place `await requireDeveloper()` as the FIRST statement inside the try (nothing before it — no `destructiveResetAllowed()`, no client construction); the `catch`:

```ts
} catch (err) {
  if (err instanceof DeveloperInfraError) return { ok: false, code: "VALIDATION_RESET_FAILED" }; // reseed: VALIDATION_RESEED_FAILED
  throw err; // Next forbidden() digest / unknown -> boundary (client catch -> generic denial)
}
```
  Keep the existing `destructiveResetAllowed()` env gate + DB `assert_destructive_reset_enabled` gate AFTER the developer gate. Keep the existing `{ ok: false, code: "VALIDATION_RESET_FAILED" }` returns for the data-layer errors.

- [ ] **Step 4: Green + Commit**

```bash
git add app/admin/settings/_actions/validationReset.ts tests/admin/validationReset-developer-posture.test.ts
git commit --no-verify -m "feat(auth): gate validationReset on requireDeveloper (inline-typed posture)"
```
