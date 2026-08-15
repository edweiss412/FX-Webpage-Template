# Auth-picker hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the crew picker's logout-CSRF hole with a proxy-independent same-origin gate, and make a failed "Not you? Switch person" legible instead of silently reporting success.

**Architecture:** A new `isSameOriginServerAction()` helper (Fetch-Metadata `sec-fetch-site` + `NEXT_PUBLIC_SITE_ORIGIN` fallback, never trusting `x-forwarded-host`) guards all three exported Server Actions in `lib/auth/picker/clearIdentity.ts`; a cross-origin request emits a forensic `log.warn` (`PICKER_ORIGIN_REJECTED`) and returns the catalogued `PICKER_INVALID_INPUT`. The avatar menu's clear form gains a client action closure with local `useState`+`useTransition` (reset-on-open) so a failed clear renders an in-menu `role="alert"` error — placed as a sibling of `role="menu"` — with the new `PICKER_SWITCH_FAILED` catalog code, while the menu stays open. For a cookie-only viewer a successful clear unmounts the control via `revalidatePath`; for a Google-authed viewer the clear re-mints via bootstrap (a documented limit, not fixed here).

**Tech Stack:** Next.js 16 (React 19 Server Actions + `useTransition`), TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + Testing Library, Supabase auth (`scope: "local"` sign-out), Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md`

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → passing test → commit. One task per commit; conventional-commits (`feat(auth):`, `fix(auth):`, `test(auth):`, `docs:`).
- **No raw error codes in UI** (invariant 5): all crew copy renders via `messageFor(code)` (`lib/messages/lookup.ts:100`).
- **UI quality gate** (invariant 8): `components/auth/IdentityChip.tsx` and `components/auth/AvatarMenu.tsx` are UI surfaces → impeccable `critique` + `audit` dual-gate on the diff at close-out, before adversarial review.
- **§12.4 three-lockstep** (one commit): master-spec prose + `pnpm gen:spec-codes` + `lib/messages/catalog.ts`; `x1-catalog-parity` (`tests/cross-cutting/codes.test.ts`) gates it. Master spec is never Prettier'd.
- **Copy rules:** no em-dash in crew copy; straight apostrophes matching existing catalog rows; no jargon (PRODUCT.md §5).
- **Worktree only** (invariant 11); commit per task (invariant 6).
- **impeccable-gate:** UI surfaces present — dual gate runs at close-out (marker in `## Closeout`).

## Meta-test inventory (declared)

- **CREATES:** none.
- **EXTENDS:** `tests/cross-cutting/codes.test.ts` (`x1-catalog-parity`) gains the `PICKER_SWITCH_FAILED` row automatically once the three-lockstep lands (no test edit needed; it walks the catalog vs §12.4 prose).
- **`tests/log/_metaMutationSurfaceObservability.test.ts`:** the inline `clearIdentityFormAction` in `IdentityChip.tsx` (NAME preserved; only its return type widens) keeps its existing `// no-telemetry:` delegation exemption (`components/auth/IdentityChip.tsx:32-33`) — no registry row. The origin-rejection `log.warn` (`PICKER_ORIGIN_REJECTED`) in `clearIdentity.ts` newly instruments a previously-dark branch (invariant 10 positive), but the exported actions keep their delegation exemptions.
- **`tests/cross-cutting/codes.test.ts` orphan-producer guard:** the origin rejection RETURNS the catalogued `PICKER_INVALID_INPUT` (not a new literal); `PICKER_ORIGIN_REJECTED` appears only inside the `log.warn` span (stripped by `stripLogEmissionCalls`), so it is not an orphan producer. No change to the guard.
- **`tests/auth/_metaInfraContract.test.ts`:** `lib/auth/picker/clearIdentity.ts` is already registered (`tests/auth/_metaInfraContract.test.ts:227`); the helper reads only `next/headers` (no Supabase client), so no registry change. The new file lib/auth/sameOriginServerAction.ts (plain text: created by Task 1) constructs no Supabase client and is outside the constructor-regex, so it needs no row (verified: the walker only flags files matching the client-constructor regex).
- **"None applies" declarations:** no advisory-lock surface touched (invariant 2 N/A — no `pg_advisory*`, no mutation of `shows`/`crew_members`/etc.); no new e2e spec (component tests only, §6); no `admin_alerts` catalog row; no tile sentinel.

## Advisory-lock holder topology

N/A. Neither the origin gate nor the failure state calls `pg_advisory*` or mutates a lock-guarded table. `clearIdentity` writes only the picker cookie and takes no advisory lock (unchanged from current code).

## Acceptance criteria

- **AC-1:** `isSameOriginServerAction()` returns the §3.3 truth-table result for every `{sec-fetch-site} × {origin}` combination.
- **AC-2:** Each of `clearIdentity`, `clearIdentityAndSkip`, `clearIdentityCore` refuses a gate-failing request with `{ ok: false, code: "PICKER_INVALID_INPUT" }` (catalogued), emits a `PICKER_ORIGIN_REJECTED` `log.warn`, and performs **no** mutation — no cookie `set`, and for `clearIdentityAndSkip` no `signOut`.
- **AC-3:** The documented bypass (`sec-fetch-site: cross-site`, no `Origin`) is refused.
- **AC-4:** `PICKER_SWITCH_FAILED` exists in the catalog with crew copy "Couldn't switch. Please try again." and passes `x1-catalog-parity`; no orphan producer is introduced.
- **AC-5:** On a failed clear, `AvatarMenu` renders a `role="alert"` node (sibling of `role="menu"`) with `PICKER_SWITCH_FAILED`'s crew copy, the menu stays open, and the submit re-enables; on `ok:true`/idle no alert renders; reopening after a failure shows no stale alert.
- **AC-6:** Existing `clearIdentity` suites pass with a same-origin default header context; the `tests/auth/picker/clearIdentity.test.ts:228` no-emit pin is unchanged; the 3 void-mock component test files are updated to return `{ ok: true }`.

## File structure

- lib/auth/sameOriginServerAction.ts (new) — the `isSameOriginServerAction()` helper.
- `lib/auth/picker/clearIdentity.ts` (modify) — prepend the gate to 3 exported actions via a co-located `rejectCrossOrigin` helper (forensic `log.warn` `PICKER_ORIGIN_REJECTED` + returns catalogued `PICKER_INVALID_INPUT`); export `ClearIdentityResult` (type).
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (modify) — §12.4 row + helpfulContext.
- `lib/messages/__generated__/spec-codes.ts` (regen) + `lib/messages/catalog.ts` (modify) — the new code.
- `components/auth/IdentityChip.tsx` (modify, UI) — widen `clearIdentityFormAction` return type (name preserved).
- `components/auth/AvatarMenu.tsx` (modify, UI) — local `useState`+`useTransition` switch state (reset-on-open), alert node as sibling of `role="menu"`, pending disable, widened prop type.
- tests/auth/sameOriginServerAction.test.ts (new), `tests/auth/picker/clearIdentity.test.ts` (modify), `tests/components/auth/avatarMenu.test.tsx` (modify), `tests/components/IdentityChip.test.tsx` (modify), `tests/components/identityChipSrSeparator.test.tsx` (modify).
- `BACKLOG.md` / `BACKLOG-archive.md` (modify) — archive two entries, file two sweep/limit entries.

<!-- tasks: depth=3 -->

### Task 1: `isSameOriginServerAction()` helper

**Files:**
- Create: lib/auth/sameOriginServerAction.ts
- Test: tests/auth/sameOriginServerAction.test.ts

**Interfaces:**
- Produces: `export async function isSameOriginServerAction(): Promise<boolean>` — reads `next/headers` `headers()`; returns true iff same-origin per the §3.3 truth table.
- Consumes: `resolveSiteOrigin` from `@/lib/notify/siteOrigin` (`{ ok: true; origin } | { ok: false }`).

<!-- task: red=`pnpm vitest run tests/auth/sameOriginServerAction.test.ts` ac=AC-1 -->

- [ ] **Step 1: Write the failing test** — table-driven over the §3.3 rows, mocking `next/headers` and `NEXT_PUBLIC_SITE_ORIGIN`.

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const headerMap = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerMap.get(k.toLowerCase()) ?? null }),
}));

import { isSameOriginServerAction } from "@/lib/auth/sameOriginServerAction";

const SITE = "https://crew.example.com";
beforeEach(() => {
  headerMap.clear();
  vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", SITE);
});

const cases: Array<[string, Record<string, string>, boolean]> = [
  ["sfs same-origin", { "sec-fetch-site": "same-origin" }, true],
  ["sfs none", { "sec-fetch-site": "none" }, true],
  ["sfs same-site", { "sec-fetch-site": "same-site" }, false],
  ["sfs cross-site", { "sec-fetch-site": "cross-site" }, false],
  ["sfs cross-site + matching origin (sfs wins)", { "sec-fetch-site": "cross-site", origin: SITE }, false],
  ["no sfs, origin === site", { origin: SITE }, true],
  ["no sfs, origin !== site", { origin: "https://evil.example.com" }, false],
  ["neither signal", {}, true],
];

describe("isSameOriginServerAction", () => {
  it.each(cases)("%s", async (_label, hdrs, expected) => {
    for (const [k, v] of Object.entries(hdrs)) headerMap.set(k, v);
    expect(await isSameOriginServerAction()).toBe(expected);
  });
});
```

RED premise: the file lib/auth/sameOriginServerAction.ts does not exist yet, so the import fails to resolve. The production line whose absence makes each row fail is the helper body itself. Anti-tautology: the `cross-site + matching origin` row proves `sec-fetch-site` is consulted BEFORE the origin fallback (a naive `origin===site` implementation would wrongly allow it).

- [ ] **Step 2: Run test, verify it fails** — Run `pnpm vitest run tests/auth/sameOriginServerAction.test.ts`; expected FAIL (module not found).

- [ ] **Step 3: Minimal implementation**

```ts
import { headers } from "next/headers";
import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

export async function isSameOriginServerAction(): Promise<boolean> {
  const h = await headers();
  const secFetchSite = h.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = h.get("origin");
  if (origin !== null) {
    const site = resolveSiteOrigin();
    return site.ok && origin === site.origin;
  }
  return true;
}
```

- [ ] **Step 4: Run test, verify it passes** — Run `pnpm vitest run tests/auth/sameOriginServerAction.test.ts`; expected PASS (all 8 rows).

- [ ] **Step 5: Commit** — `git add lib/auth/sameOriginServerAction.ts tests/auth/sameOriginServerAction.test.ts && git commit -m "feat(auth): same-origin gate helper for Server Actions"`

### Task 2: Gate the three exported clear actions

**Files:**
- Modify: `lib/auth/picker/clearIdentity.ts`
- Test: `tests/auth/picker/clearIdentity.test.ts`

**Interfaces:**
- Consumes: `isSameOriginServerAction` (Task 1).
- Produces: `clearIdentity`, `clearIdentityAndSkip`, `clearIdentityCore` each refuse with `{ ok: false, code: "PICKER_INVALID_INPUT" }` (catalogued) before any mutation when the gate fails, via a co-located `rejectCrossOrigin(action)` helper that emits a forensic `log.warn` (`code: "PICKER_ORIGIN_REJECTED"`, rides the emit → scanner-exempt, mirrors `AUTH_SIGNOUT_FAILED` at `lib/auth/picker/clearIdentity.ts:111-123`). Also exports the `ClearIdentityResult` type. Returning a NEW uncatalogued literal would be an x1 orphan producer (`tests/cross-cutting/codes.test.ts:125`) — hence the catalogued return + log-borne forensic code.

<!-- task: red=`pnpm vitest run tests/auth/picker/clearIdentity.test.ts` ac=AC-2,AC-3,AC-6 -->

- [ ] **Step 1: Write failing tests.** Add a gate-reject case per exported action, a bypass regression, and (for `clearIdentityAndSkip`) a no-`signOut` assertion:

```ts
import { setSameOrigin, setHeaders } from "../helpers/headerMock"; // extend existing mock

it("clearIdentity refuses a gate-failing request and writes no cookie", async () => {
  setHeaders({ "sec-fetch-site": "cross-site" });
  const fd = new FormData();
  fd.set("slug", SLUG); fd.set("shareToken", TOKEN); fd.set("showId", SHOW_ID);
  const r = await clearIdentity(fd);
  expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
  expect(cookieSet).not.toHaveBeenCalled(); // no cookie mutation on reject
});

it("clearIdentityAndSkip refuses cross-site WITHOUT signing out (no external mutation)", async () => {
  setHeaders({ "sec-fetch-site": "cross-site" });
  const r = await clearIdentityAndSkip(fdFull());
  expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
  expect(supabaseMock.signOut).not.toHaveBeenCalled(); // R1-F6: external mutation untouched
  expect(cookieSet).not.toHaveBeenCalled();
});

it("bypass regression: cross-site with NO Origin header is refused", async () => {
  setHeaders({ "sec-fetch-site": "cross-site" }); // origin deliberately absent
  const r = await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
  expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
});
```

Also: add a `same-origin` default to the suite's `headers()` mock so all EXISTING cases (which do not set fetch-metadata) still pass through the gate. The `tests/auth/picker/clearIdentity.test.ts:228` no-emit pin is unchanged. (`supabaseMock.signOut` and `cookieSet` are already exposed by the existing harness.)

RED premise: the gate line is absent from the three actions, so a cross-site request currently mutates and returns `{ ok: true }` — the assertion `{ ok: false, code: "PICKER_INVALID_INPUT" }` fails, and for `clearIdentityAndSkip` a pre-gate `signOut` would have fired. Anti-tautology: the `cookieSet` AND `signOut` spies assert NO mutation happened — a guard-order regression that revoked before refusing fails here.

- [ ] **Step 2: Run tests, verify they fail** — Run `pnpm vitest run tests/auth/picker/clearIdentity.test.ts`; expected FAIL on the new cases (gate absent), existing cases green.

- [ ] **Step 3: Minimal implementation** — add the co-located helper and prepend the gate to each of the three exported actions:

```ts
function rejectCrossOrigin(action: string): ClearIdentityResult {
  log.warn("cross-origin picker action refused", {
    source: "auth.picker.sameOriginGate",
    code: "PICKER_ORIGIN_REJECTED", // forensic, rides the emit, stripped by stripLogEmissionCalls
    action,
  });
  return { ok: false, code: "PICKER_INVALID_INPUT" };
}
// first statement of each exported action:
if (!(await isSameOriginServerAction())) return rejectCrossOrigin("clearIdentity"); // /AndSkip /Core
```

Import `isSameOriginServerAction`; `log` is already imported (`lib/auth/picker/clearIdentity.ts:16`). Export `ClearIdentityResult` (change `type ClearIdentityResult` at line 35 to `export type`). Gate is the first statement of each exported action (before `parseFormData` / the validity check). No other body change.

- [ ] **Step 4: Run tests, verify they pass** — Run `pnpm vitest run tests/auth/picker/clearIdentity.test.ts`; expected PASS (new + existing).

- [ ] **Step 5: Commit** — `git add lib/auth/picker/clearIdentity.ts tests/auth/picker/clearIdentity.test.ts && git commit -m "fix(auth): gate picker clear Server Actions on same-origin"`

### Task 3: `PICKER_SWITCH_FAILED` catalog code (three-lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table row near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3084` + helpfulContext near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3330`)
- Regen: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)
- Modify: `lib/messages/catalog.ts`
- Test: `tests/cross-cutting/codes.test.ts` (existing `x1-catalog-parity`, no edit)

**Interfaces:**
- Produces: `messageFor("PICKER_SWITCH_FAILED").crewFacing === "Couldn't switch. Please try again."`

<!-- task: red=`pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts` ac=AC-4 -->

- [ ] **Step 1: Add the §12.4 prose** — insert the table row (columns matching the sibling PICKER rows near line 3084 of the master spec) and the helpfulContext line near line 3330:

```
| `PICKER_SWITCH_FAILED` | M13 — a crew member's switch person clear failed; an in-menu retry was shown. | "A crew member's switch person action failed; they were shown an in-menu retry." | "Couldn't switch. Please try again." | Crew → try again; Eric if repeated |
```
```
PICKER_SWITCH_FAILED: "The picker clear action failed for a crew member's switch-person tap; an in-menu retry was shown."
```
(No em-dash; straight apostrophes. The dev copy deliberately does NOT claim "the identity was not cleared" — a reachable branch stages the deletion before revalidatePath throws, `lib/auth/picker/clearIdentity.ts:199`, proven by `tests/auth/picker/clearIdentity.test.ts:327`. Crew copy is the fixed ratified string.)

- [ ] **Step 2: Regen + run parity, verify RED→GREEN** — Run `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts`. Before adding the `catalog.ts` row (Step 3), parity FAILS (prose has a row the catalog lacks) — observe that failure first. RED premise: the catalog is missing the row the §12.4 prose now declares.

- [ ] **Step 3: Add the catalog entry** to `lib/messages/catalog.ts` (place among the `PICKER_*` rows):

```ts
PICKER_SWITCH_FAILED: {
  code: "PICKER_SWITCH_FAILED",
  warningClass: "general",
  dougFacing: "A crew member's switch person action failed; they were shown an in-menu retry.",
  crewFacing: "Couldn't switch. Please try again.",
  followUp: "Crew → try again; Eric if repeated",
  helpfulContext: "The picker clear action failed for a crew member's switch-person tap; an in-menu retry was shown.",
  title: "Switch person failed",
  longExplanation: "A crew member tapped switch person and the clear did not land. An in-menu error offered a retry.",
  helpHref: "/help/errors#PICKER_SWITCH_FAILED",
},
```

- [ ] **Step 4: Run parity, verify PASS** — Run `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts`; expected PASS. Confirm all three staged in ONE commit.

- [ ] **Step 5: Commit** — `git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts && git commit -m "feat(crew-page): PICKER_SWITCH_FAILED catalog code"`

### Task 4: In-menu failure state — UI

**Files:**
- Modify: `components/auth/IdentityChip.tsx` (widen wrapper return type; NAME preserved)
- Modify: `components/auth/AvatarMenu.tsx`
- Test: `tests/components/auth/avatarMenu.test.tsx` (extend), plus void-mock fixups in `tests/components/IdentityChip.test.tsx` and `tests/components/identityChipSrSeparator.test.tsx`

**Interfaces:**
- Consumes: `clearIdentity` + `ClearIdentityResult` (Task 2), `messageFor` (`lib/messages/lookup.ts:100`).
- Produces: `IdentityChip`'s wrapper stays named `clearIdentityFormAction` (role-chip contract, `tests/components/_metaPickerRoleChipContract.test.ts:21`) with return type widened to `Promise<ClearIdentityResult>`. `AvatarMenu`'s `clearAction` prop type widens to `(formData: FormData) => Promise<ClearIdentityResult>`.

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` ac=AC-5 -->

- [ ] **Step 1: Write failing tests** — extend `tests/components/auth/avatarMenu.test.tsx`; `clearAction` now returns `ClearIdentityResult`:

```tsx
import { messageFor } from "@/lib/messages/lookup";
const EXPECTED = messageFor("PICKER_SWITCH_FAILED").crewFacing; // derive, never hardcode

it("renders an in-menu alert on failure, as a sibling of role=menu, and keeps the menu open", async () => {
  const action = vi.fn(async () => ({ ok: false as const, code: "PICKER_RESOLVER_LOOKUP_FAILED" }));
  render(<AvatarMenu {...baseProps} clearAction={action} />);
  openMenu();
  fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(EXPECTED);
  expect(screen.getByRole("menu").contains(alert)).toBe(false); // R1-F5: sibling, not child
  expect(screen.getByTestId("avatar-menu-popover")).toBeInTheDocument(); // stayed open
});

it("renders NO alert when the clear succeeds", async () => {
  render(<AvatarMenu {...baseProps} clearAction={vi.fn(async () => ({ ok: true as const }))} />);
  openMenu();
  fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears a stale error when the menu is reopened (R1-F4)", async () => {
  const action = vi.fn(async () => ({ ok: false as const, code: "PICKER_RESOLVER_LOOKUP_FAILED" }));
  render(<AvatarMenu {...baseProps} clearAction={action} />);
  openMenu();
  fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
  await screen.findByRole("alert");
  closeMenu();          // Escape / outside pointer
  openMenu();           // reopen
  expect(screen.queryByRole("alert")).toBeNull(); // reset-on-open, no stale error
});
```

Anti-tautology: `EXPECTED` is derived from `messageFor` (a copy edit can't pass a stale literal); the query is scoped to `role="alert"` (the identity header can't satisfy it); the sibling assertion mirrors the existing header contract (`avatarMenu.test.tsx:97`). RED premise: `AvatarMenu` currently discards the result (no alert node, no local switch state), so `findByRole("alert")` throws and the reopen-reset path does not exist.

String-presence guard — run all four pre-dispatch mutants, record in the commit: (a) empty the crew copy → alert empty, test fails; (b) append a suffix → `toHaveTextContent` exact-match fails; (c) render the copy in a `title` attribute / inside `role="menu"` → the scoped `role="alert"` + sibling assertions miss it; (d) vary `ok` true↔false → the success case asserts no alert.

- [ ] **Step 2: Run tests, verify they fail** — Run `pnpm heavy pnpm vitest run tests/components/auth/avatarMenu.test.tsx`; expected FAIL (no alert node).

- [ ] **Step 3: Implement.** In `IdentityChip.tsx`, keep the wrapper name, widen its return type:

```ts
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

async function clearIdentityFormAction(formData: FormData): Promise<ClearIdentityResult> {
  "use server";
  // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker clearIdentity,
  // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
  return clearIdentity(formData);
}
```

In `AvatarMenu.tsx`:
- widen the `clearAction` prop type to `(formData: FormData) => Promise<ClearIdentityResult>` (use `import type { ClearIdentityResult }`);
- add local state and a transition:
  ```tsx
  const [switchStatus, setSwitchStatus] = useState<"idle" | "error">("idle");
  const [switchPending, startSwitch] = useTransition();
  const onSwitchSubmit = (formData: FormData): void => {
    setSwitchStatus("idle");
    startSwitch(async () => {
      const result = await clearAction(formData);
      if (!result.ok) setSwitchStatus("error");
    });
  };
  ```
- reset on open: add `setSwitchStatus("idle")` in `openAt(...)` and the trigger's open branch;
- bind the form `action={onSwitchSubmit}` (keep the hidden `slug`/`shareToken`/`showId` inputs); set the submit `disabled={switchPending}`;
- render the alert as a SIBLING of the `role="menu"` element (inside the popover, like the identity header — NOT after `</form>`), when `switchStatus === "error"`:
  ```tsx
  <div role="menu" ...>{/* theme item + form */}</div>
  {switchStatus === "error" ? (
    <div role="alert" data-testid="avatar-menu-switch-error" className={/* danger tokens per DESIGN.md */}>
      {messageFor("PICKER_SWITCH_FAILED").crewFacing}
    </div>
  ) : null}
  ```

The alert is NOT a `menuitem` (not focusable, not in arrow traversal), mirroring the identity header (`components/auth/AvatarMenu.tsx:271-297`).

- [ ] **Step 4: Fix the widened-prop void mocks (R1-F7)** — in `tests/components/auth/avatarMenu.test.tsx:37`, `tests/components/IdentityChip.test.tsx:42`, and `tests/components/identityChipSrSeparator.test.tsx:34`, change `clearAction: (): void => {}` to an async mock returning `{ ok: true }` so it typechecks against the widened prop. Run `pnpm typecheck` to confirm no other caller breaks; confirm `tests/components/_metaPickerRoleChipContract.test.ts:21` still matches `clearAction={clearIdentityFormAction}` (name preserved).

- [ ] **Step 5: Run tests, verify they pass** — Run `pnpm heavy pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx tests/components/_metaPickerRoleChipContract.test.ts`; expected PASS.

- [ ] **Step 6: Transition audit** — confirm every conditional render in `AvatarMenu` matches spec §4.6: `{open ? ...}` (existing `avatar-menu-in`), `{hasIdentity ? ...}`, the new `{switchStatus === "error" ? ...}` alert (instant, `role="alert"`, sibling of menu), the pending disable, and the reset-on-open path (Closed→Open-idle-after-failure). Verify the compound "close mid-pending then reopen" shows no stale error (the reopen test in Step 1 covers it).

- [ ] **Step 7: Commit** — `git add components/auth/IdentityChip.tsx components/auth/AvatarMenu.tsx tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx && git commit -m "feat(crew-page): legible in-menu failure for switch person"`

### Task 5: Backlog reconciliation

**Files:**
- Modify: `BACKLOG.md`, `BACKLOG-archive.md`

**Interfaces:** none (docs).

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` ac=AC-1 -->

- [ ] **Step 1: Archive the two closed entries** — move `BL-SERVER-ACTION-ORIGIN-GATE` and `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT` from `BACKLOG.md` to `BACKLOG-archive.md` with a resolution note citing this plan and spec. Their `**Status:** IN PROGRESS · **Branch:** fix/auth-picker-hardening` markers come OFF in the same edit (archives reject in-progress entries; the marker must not reach main — invariant 12).

- [ ] **Step 2: File the sweep + limit entries** — add to `BACKLOG.md`: (a) `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` — gate the remaining destructive Server Actions with `isSameOriginServerAction()`, class-sweep disposition exception (c), noting the helper reduces each peer to a one-line guard and that admin actions behind require-gates get it additively; (b) `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` — menu switch-person is ineffective for a Google-authed viewer (bootstrap re-mints, `lib/auth/picker/resolveShowPageAccess.ts:246`); needs a product decision on whether menu-switch should sign a Google viewer out (class-sweep exception (a)); reachability PROBED via the resolve order.

- [ ] **Step 3: Run ledger meta-tests, verify PASS** — Run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts`; expected PASS. RED premise: an archive holding an in-progress marker fails `_metaLedgerInProgress`; observe by staging the archive move WITH the marker still on, then removing it.

- [ ] **Step 4: Commit** — `git add BACKLOG.md BACKLOG-archive.md && git commit -m "docs: archive picker-hardening entries, file origin-gate sweep"`

<!-- tasks: end -->

## Closeout

- **impeccable-gate:** `components/auth/IdentityChip.tsx` and `components/auth/AvatarMenu.tsx` are UI surfaces. Run `/impeccable critique` AND `/impeccable audit` on the diff; P0/P1 fixed or DEFERRED.md'd; findings + dispositions recorded here. Runs BEFORE whole-diff adversarial review.
- **Whole-diff cross-model review** to APPROVE.
- **Full local gates before push:** `pnpm test` (heavy → `pnpm heavy pnpm test`), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
- **Real CI green**, then merge, then FF local main to `0  0`.

## Self-review checklist (author, pre-adversarial)

- [ ] **Spec coverage:** every spec section maps to a task (§3 gate → Tasks 1-2; §4 UX → Tasks 3-4; §3.5 sweep + archive → Task 5). Documented limits §7 need no task.
- [ ] **Placeholder scan:** no TBD/TODO; every code step has real content.
- [ ] **Type consistency:** `ClearIdentityResult`, `isSameOriginServerAction`, `rejectCrossOrigin`, `clearIdentityFormAction` (name preserved), `PICKER_ORIGIN_REJECTED` (log-borne), `PICKER_INVALID_INPUT` (returned), `PICKER_SWITCH_FAILED` spelled identically across tasks.
- [ ] **Anti-tautology:** Task 2 asserts no-mutation-on-reject; Task 4 derives copy from `messageFor` and scopes to `role="alert"`, with four string-presence mutants recorded.
- [ ] **RED validity:** every `red=` names the production line whose absence makes it fail (Tasks 1-5).

## Adversarial review (cross-model)

Between self-review and execution handoff: dispatch a Codex adversarial-review of this plan (stage=plan) to APPROVE. Round-economy: consequence bound + threat fence + do-not-relitigate in the brief; round-5 cap → fence → escalate.

## Execution handoff

This arc STOPS at plan-APPROVE (spec/plan owner, no implementation). Implementation is a separate Opus + Claude Code session (UI surfaces → impeccable dual-gate). Recommended: subagent-driven-development, fresh subagent per task.
