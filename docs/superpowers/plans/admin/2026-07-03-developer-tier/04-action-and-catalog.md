# Phase 4 — §12.4 Code + Developer Toggle Action (Tasks 8–9)

---

### Task 8: New §12.4 code `SELF_DEVELOPER_DEMOTE_FORBIDDEN`

Implements spec §8. Full lockstep (per "new §12.4 code = full CI touchpoints"): master spec prose + `gen:spec-codes` + `catalog.ts` + `gen:internal-code-enums` + help `_families`. Model on the existing `SELF_REVOKE_FORBIDDEN` row (`lib/messages/catalog.ts:2534`, `spec-codes.ts:995`).

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose) — **do NOT run prettier on this file**
- Regenerate: `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`)
- Modify: `lib/messages/catalog.ts`
- Regenerate: internal code enums (`pnpm gen:internal-code-enums`)
- Modify/verify: help `_families` (whichever file lists error-code families; grep `SELF_REVOKE_FORBIDDEN`)

- [ ] **Step 1: Failing test** — `tests/cross-cutting/codes.test.ts` (x1 catalog parity) already asserts catalog ↔ §12.4 prose. Add nothing new here; instead the failing state is: after adding the catalog row WITHOUT the prose (or vice-versa) the suite fails. Start by adding a focused assertion in a new/'`tests/messages/developer-demote-code.test.ts`' that `getDougFacing("SELF_DEVELOPER_DEMOTE_FORBIDDEN")` returns non-null cataloged copy.

```ts
import { getDougFacing } from "@/lib/messages/lookup";
test("SELF_DEVELOPER_DEMOTE_FORBIDDEN resolves to cataloged copy", () => {
  expect(getDougFacing("SELF_DEVELOPER_DEMOTE_FORBIDDEN")).toBeTruthy();
});
```

- [ ] **Step 2: Fails** — FAIL (code not in catalog).

- [ ] **Step 3: Add the §12.4 row** — insert a `SELF_DEVELOPER_DEMOTE_FORBIDDEN` row in master spec §12.4 (copy the column shape of the `SELF_REVOKE_FORBIDDEN` row). Draft copy: title "You can't remove your own developer access"; body "To keep at least one developer in control, you can't turn off your own developer access. Ask another developer to do it if you need to step down." `helpHref: /help/errors#SELF_DEVELOPER_DEMOTE_FORBIDDEN`.

- [ ] **Step 4: Regenerate + add catalog row** — `pnpm gen:spec-codes`; add the matching `SELF_DEVELOPER_DEMOTE_FORBIDDEN` object to `lib/messages/catalog.ts` (mirror `:2534-2545`); `pnpm gen:internal-code-enums`; add the code to the help error-code family list if `SELF_REVOKE_FORBIDDEN` is listed there.

- [ ] **Step 5: Green (full suite touchpoints)** — `pnpm vitest run tests/cross-cutting/codes.test.ts tests/messages` → PASS. Also run any help-families test that references error codes.

- [ ] **Step 6: Commit** (all lockstep files together)

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts lib/messages/__generated__ app/help tests/messages/developer-demote-code.test.ts
git commit --no-verify -m "feat(admin): SELF_DEVELOPER_DEMOTE_FORBIDDEN §12.4 code (3-way lockstep)"
```

---

### Task 9: `setDeveloperAction` (developer-only server action)

Implements spec §7 (server action). Dedicated file so `developerGatingContract`'s per-file "every export is `requireDeveloper*`-gated" invariant holds. Gate is `requireDeveloperIdentity()` as the **first executable statement outside the try** (boundary-throw posture — mirrors `addAdminAction:76`).

**Files:**
- Create: `app/admin/settings/admins/developerActions.ts`
- Create: `tests/app/admin/setDeveloperAction.test.ts`

**Interfaces:**
- Produces: `setDeveloperAction(prev: SetDeveloperActionResult | null, formData: FormData): Promise<SetDeveloperActionResult>` where `SetDeveloperActionResult = { kind: "ok"; email: string; isDeveloper: boolean } | { kind: "self_developer_demote_forbidden"; email: string } | { kind: "not_found"; email: string } | { kind: "invalid_email" } | { kind: "not_authorized" } | { kind: "infra_error" }`. FormData fields: `email` (string), `is_developer` (`"true"`/`"false"`).

- [ ] **Step 1: Failing test** — mock `requireDeveloperIdentity` + `setAdminDeveloper`:
  - gate throws `DeveloperInfraError` → the action re-throws (propagates to boundary), NOT caught → assert the promise rejects (boundary-throw posture);
  - `setAdminDeveloper` → `{kind:"ok",...}` → action returns `{kind:"ok",...}` and calls `revalidatePath("/admin/settings")` + `revalidatePath("/admin/settings/admins")`;
  - `setAdminDeveloper` throws `AdminEmailsInfraError` → `{kind:"infra_error"}`;
  - `setAdminDeveloper` → `{kind:"self_developer_demote_forbidden"}` → passthrough;
  - `setAdminDeveloper` → `{kind:"not_authorized"}` → passthrough.

- [ ] **Step 2: Fails** — FAIL.

- [ ] **Step 3: Implement** — `app/admin/settings/admins/developerActions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { setAdminDeveloper, AdminEmailsInfraError } from "@/lib/data/adminEmails";

export type SetDeveloperActionResult =
  | { kind: "ok"; email: string; isDeveloper: boolean }
  | { kind: "self_developer_demote_forbidden"; email: string }
  | { kind: "not_found"; email: string }
  | { kind: "invalid_email" }
  | { kind: "not_authorized" }
  | { kind: "infra_error" };

export async function setDeveloperAction(
  _prev: SetDeveloperActionResult | null,
  formData: FormData,
): Promise<SetDeveloperActionResult> {
  // Gate OUTSIDE the try (boundary-throw): a DeveloperInfraError propagates to
  // the catalog 500 boundary; the non-developer forbidden() digest propagates
  // too — mirrors addAdminAction (admins/actions.ts:76).
  await requireDeveloperIdentity();

  const rawEmail = formData.get("email");
  const isDeveloper = formData.get("is_developer") === "true";
  if (typeof rawEmail !== "string") return { kind: "invalid_email" };

  let outcome;
  try {
    outcome = await setAdminDeveloper({ rawEmail, isDeveloper });
  } catch (err) {
    if (err instanceof AdminEmailsInfraError) return { kind: "infra_error" };
    throw err;
  }
  if (outcome.kind === "ok") {
    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admins");
  }
  return outcome;
}
```

- [ ] **Step 4: Green + Commit**

```bash
git add app/admin/settings/admins/developerActions.ts tests/app/admin/setDeveloperAction.test.ts
git commit --no-verify -m "feat(admin): setDeveloperAction (developer-gated toggle server action)"
```
