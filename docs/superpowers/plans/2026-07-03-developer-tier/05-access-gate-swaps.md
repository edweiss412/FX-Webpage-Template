# Phase 5 — Access Gate Swaps (Tasks 10–13)

Each surface swaps `requireAdmin*` → `requireDeveloper*`. Because `requireDeveloper` subsumes `requireAdmin` (developer ⟹ admin), it REPLACES (not stacks). Spec §6 matrix + §6.1.

---

### Task 10: `/admin/dev/*` — recognizer capability + page, 6 server actions, 2 harnesses

Spec §6 rows 1–3. All are build-gated (renamed aside in normal builds); this is a runtime-gate swap that only matters in dev-flag builds, but must be complete for the `developerGatingContract` AST guard (Task 20).

**ORDERING (every-commit-green + `x3-trust-domain` required gate):** `tests/cross-cutting/auth-chain-audit.test.ts` runs in `x3-trust-domain`. Its recognizer (`lib/audit/authPrimitives.ts` + `lib/audit/trustDomains.ts`) only understands `requireAdmin`/`validateGoogle*`, and `PROTECTED_ROUTES` lists these dev routes with `chain: ["requireAdmin"]`. If a route's gate is swapped to `requireDeveloper` WITHOUT (a) teaching the recognizer about `requireDeveloper` and (b) flipping that route's `PROTECTED_ROUTES` chain, `auditProjectAuthChains()` fails → x3 red. So the recognizer capability + the 4 dev-route chain flips + the gate swaps ALL land in THIS one commit. (This is why the former "Task 19 auth-chain-audit extension" is pulled forward — Task 19 is now verification only.)

**Files (all Modify):**
- Recognizer: `lib/audit/trustDomains.ts` (`ChainStep`, the 4 dev-route `PROTECTED_ROUTES` chains), `lib/audit/authPrimitives.ts` (`normalizeValidator`, `kindChecked`, the discard-check, `AUTH_LIB_ALLOWLIST`).
- Gates: `app/admin/dev/page.tsx:60`; `app/admin/dev/actions.ts` (`parseAndStage:122`, `parseAndStageFormAction:256`, `getStagedResult:281`, `resetDevSchema:393`, `resetDevSchemaFormAction:403`, `listFixtures:412`); `app/admin/dev/source-link-dim/page.tsx:86`; `app/admin/dev/observability-dim/page.tsx:107`.

- [ ] **Step 0: Extend the auth-chain-audit recognizer for `requireDeveloper` (green no-op first).** Make the recognizer UNDERSTAND `requireDeveloper` WITHOUT changing any route or any `PROTECTED_ROUTES` chain yet, and confirm `pnpm test:audit:x3-trust-domain` stays GREEN (the new capability is unused, so existing findings are unchanged). Touchpoints (verify each against live code; the hard correctness gate is a green x3, so if a touchpoint is missing/extra, the failing audit will tell you):
  1. `lib/audit/trustDomains.ts` `ChainStep` (`:12`) — add `"requireDeveloper"` to the union.
  2. `lib/audit/authPrimitives.ts` `normalizeValidator` (`:134`) — `if (name === "requireDeveloper" || name === "requireDeveloperIdentity") return "requireDeveloper";` (this is what makes `collectEvents` emit a validator event for `requireDeveloper()` at `:513`).
  3. `kindChecked` (`:588`) — exempt `requireDeveloper` alongside `requireAdmin` (both throw/redirect; neither returns a discriminated `.kind` result): `if (event.name === "requireAdmin" || event.name === "requireDeveloper") return true;`.
  4. Discard-check (`:639`) — `if (!event.binding && event.name !== "requireAdmin" && event.name !== "requireDeveloper")` (so a bare `await requireDeveloper()` is not flagged "result discarded").
  5. `AUTH_LIB_ALLOWLIST` (`:67`) — add `"lib/auth/requireDeveloper.ts"` so the audit does NOT flag `requireDeveloper`'s OWN internal RPC sinks (`is_session_live`, `is_developer`) when a route calls `requireDeveloper()` (recursion at `:553-568`; `requireAdmin.ts` is allow-listed at `:70` for the same reason).
  6. Precedence guard (`:622`, `:666`) — keyed on `requireAdmin` + `isAdminSession` admin-predicate. `requireDeveloper` is a DISTINCT gate NOT subject to the isAdminSession precedence guard (its developer-precedence is enforced internally + covered by `_metaInfraContract`/`developerGatingContract`); a `["requireDeveloper"]` chain does not hit these branches, so NO edit here — but VERIFY x3 is green (no false "must be under isAdminSession admin precedence guard" finding appears for the swapped routes in Step 3).
  - Run `pnpm test:audit:x3-trust-domain` → GREEN (no route changed yet). This isolates recognizer bugs from route/registry bugs.

- [ ] **Step 1: Failing test** — `tests/admin/dev-requires-developer.test.ts`: import each module with `requireDeveloper` mocked to throw a sentinel; assert every exported dev action + each page calls the sentinel (i.e. is developer-gated), and that `requireAdmin` is NOT called. (For the pages, assert the first-statement gate; for actions, assert each of the 6 rejects when `requireDeveloper` throws.) This is superseded structurally by Task 20 but gives a fast unit signal.

- [ ] **Step 2: Fails** — FAIL (still `requireAdmin`).

- [ ] **Step 3: Implement the swap + flip the 4 dev-route chains (same commit).** In each dev file, replace the import `requireAdmin` → `requireDeveloper` (from `@/lib/auth/requireDeveloper`) and the call `await requireAdmin()` → `await requireDeveloper()` as the first statement. In `actions.ts` do this for all 6 exported actions. (Boundary-throw posture — gate is the first executable statement, outside any try.) THEN in `lib/audit/trustDomains.ts` flip the `PROTECTED_ROUTES` chains for the 4 dev routes to `["requireDeveloper"]`: `app/admin/dev/page.tsx` (`:40`), `app/admin/dev/source-link-dim/page.tsx` (`:43`), `app/admin/dev/observability-dim/page.tsx` (`:46`). (The dev page + 2 harnesses = 3 route rows; the 6 server actions in `actions.ts` are non-route and covered by `developerGatingContract` in Task 20, not `PROTECTED_ROUTES`.)

- [ ] **Step 4: Green + Commit** — `pnpm vitest run tests/admin/dev-requires-developer.test.ts` PASS, `pnpm test:audit:x3-trust-domain` GREEN, `pnpm typecheck` clean.

```bash
git add lib/audit/authPrimitives.ts lib/audit/trustDomains.ts app/admin/dev tests/admin/dev-requires-developer.test.ts
git commit --no-verify -m "feat(auth): gate /admin/dev surfaces on requireDeveloper + audit recognizer"
```

---

### Task 11: Activity `/admin/observability` page

Spec §6 row 5. The data loaders (`loadCronHealth`, `loadAppEvents`) do NOT self-gate (service-role clients) — the page gate is the sole and sufficient access control, so only the page changes.

**Files (Modify):** `app/admin/observability/page.tsx:20` (`requireAdminIdentity()` → `requireDeveloperIdentity()`; update the import); `lib/audit/trustDomains.ts` (flip the observability `PROTECTED_ROUTES` chain — same commit, else x3 goes red). The recognizer capability already exists from Task 10.

- [ ] **Step 1: Failing test** — `tests/admin/observability-requires-developer.test.ts`: render/import `ObservabilityPage` with `requireDeveloperIdentity` mocked to throw a sentinel; assert it is called (page is developer-gated) and `requireAdminIdentity` is not.

- [ ] **Step 2: Fails → Step 3: swap the gate AND flip the chain (same commit)** — swap `app/admin/observability/page.tsx` gate to `requireDeveloperIdentity`, and in `lib/audit/trustDomains.ts` change the `app/admin/observability/page.tsx` `PROTECTED_ROUTES` row (`:36`) from `chain: ["requireAdmin"]` to `chain: ["requireDeveloper"]`. → **Step 4: green** — unit test PASS AND `pnpm test:audit:x3-trust-domain` GREEN AND `pnpm typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add app/admin/observability/page.tsx lib/audit/trustDomains.ts tests/admin/observability-requires-developer.test.ts
git commit --no-verify -m "feat(auth): gate Activity/observability page on requireDeveloper"
```

---

### Task 12: Reap route — gate swap + infra-error 500 mapping (R3/R7)

Spec §6 row 6 + §6.1. `app/api/admin/onboarding/reap-stale-sessions/route.ts`: injected gate (`:38` `routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity`), resolved call `:42`, catch `:43-49` (`if (code === "ADMIN_SESSION_LOOKUP_FAILED") return 500; else 403 ADMIN_FORBIDDEN`).

**Files:**
- Modify: `app/api/admin/onboarding/reap-stale-sessions/route.ts`
- Modify: `lib/audit/trustDomains.ts` (flip the reap route `PROTECTED_ROUTES` chain — same commit, else x3 red). The reap route is at `PROTECTED_ROUTES` `:101-102` with `chain: ["requireAdmin"]`.
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

Also flip the reap route's `PROTECTED_ROUTES` chain (`lib/audit/trustDomains.ts:101-102`) from `["requireAdmin"]` to `["requireDeveloper"]` in this same commit.

- [ ] **Step 4: Green + Commit** — unit test PASS AND `pnpm test:audit:x3-trust-domain` GREEN AND `pnpm typecheck` clean.

```bash
git add app/api/admin/onboarding/reap-stale-sessions/route.ts lib/audit/trustDomains.ts tests/admin/reap-developer-gate.test.ts
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
