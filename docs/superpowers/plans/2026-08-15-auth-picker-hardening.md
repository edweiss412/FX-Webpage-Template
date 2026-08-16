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
- **Invariant-8 dual gate:** UI surfaces present (`AvatarMenu.tsx`, `IdentityChip.tsx`) — the impeccable critique + audit gate runs in the IMPLEMENTATION arc against the real UI diff, and the machine `impeccable-gate:` closeout marker is filled at THAT arc's closeout (see Closeout; the gate cannot run before UI code exists, and fabricating a marker is forbidden).

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
- **AC-7:** Backlog reconciliation lands correctly: the two closed entries are archived with their IN PROGRESS markers removed **in the PR's last commit** (after the impeccable dual-gate and whole-diff review, invariant 12), and the two follow-up entries (`BL-SERVER-ACTION-ORIGIN-GATE-SWEEP`, `BL-SWITCH-PERSON-GOOGLE-LOOPBACK`) are filed; `_metaLedgerInProgress` and `_metaLedgerReferentialIntegrity` pass.

## File structure

- lib/auth/sameOriginServerAction.ts (new) — the `isSameOriginServerAction()` helper.
- `lib/auth/picker/clearIdentity.ts` (modify) — prepend the gate to 3 exported actions via a co-located `rejectCrossOrigin` helper (forensic `log.warn` `PICKER_ORIGIN_REJECTED` + returns catalogued `PICKER_INVALID_INPUT`); export `ClearIdentityResult` (type).
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (modify) — §12.4 row + helpfulContext.
- `lib/messages/__generated__/spec-codes.ts` (regen) + `lib/messages/catalog.ts` (modify) — the new code.
- `components/auth/IdentityChip.tsx` (modify, UI) — widen `clearIdentityFormAction` return type (name preserved).
- `components/auth/AvatarMenu.tsx` (modify, UI) — local `useState`+`useTransition` switch state (reset-on-open), alert node as sibling of `role="menu"`, pending disable, widened prop type.
- tests/auth/sameOriginServerAction.test.ts (new), `tests/auth/picker/clearIdentity.test.ts` (modify), `tests/components/auth/avatarMenu.test.tsx` (modify), `tests/components/IdentityChip.test.tsx` (modify), `tests/components/identityChipSrSeparator.test.tsx` (modify).
- `tests/components/auth/_probeSwitchCloseRace.test.tsx` (committed probe) — empirical close/pending/reopen evidence (spec §2.3), 4/4 pass; Task 4 folds its assertions onto the real `AvatarMenu`.
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
  // PRECEDENCE both directions (R2-F8): sec-fetch-site wins over origin whenever present.
  ["sfs cross-site + matching origin (sfs wins → reject)", { "sec-fetch-site": "cross-site", origin: SITE }, false],
  ["sfs same-origin + MISMATCHING origin (sfs wins → allow)", { "sec-fetch-site": "same-origin", origin: "https://evil.example.com" }, true],
  ["sfs none + MISMATCHING origin (sfs wins → allow)", { "sec-fetch-site": "none", origin: "https://evil.example.com" }, true],
  ["sfs same-site + matching origin (sfs wins → reject)", { "sec-fetch-site": "same-site", origin: SITE }, false],
  // origin fallback consulted ONLY when sec-fetch-site is absent:
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

RED premise: the file lib/auth/sameOriginServerAction.ts does not exist yet, so the import fails to resolve. The production line whose absence makes each row fail is the helper body itself. Anti-tautology (R2-F8): the precedence rows pin BOTH directions of "sec-fetch-site wins over origin" — `cross-site`/`same-site` + matching origin must still REJECT (a naive `origin===site` fallback would wrongly allow), and `same-origin`/`none` + mismatching origin must still ALLOW (an implementation that lets a mismatching Origin override the Fetch-Metadata verdict would wrongly reject). An implementation that consults origin before, or instead of, sec-fetch-site fails at least one of these four rows.

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

- [ ] **Step 1a: Extend the existing test harness so the gate is controllable.** The suite already mocks `next/headers` as `vi.mock("next/headers", () => ({ cookies: vi.fn() }))` (`tests/auth/picker/clearIdentity.test.ts:23`) and mocks `@/lib/log` as `logMock` (`tests/auth/picker/clearIdentity.test.ts:25-31`). `isSameOriginServerAction` (Task 1) reads `headers()` from `next/headers`, so extend the SAME mock and add a mutable header map, defaulting to same-origin so every EXISTING case still passes the gate. Do NOT import a `../helpers/headerMock` — no such file exists; the mock is inline:

```ts
// widen the existing next/headers mock (was `{ cookies: vi.fn() }`):
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

// module-level, beside the other consts:
import { headers } from "next/headers";
const headerMap = new Map<string, string>();
const setHeaders = (h: Record<string, string>): void => {
  headerMap.clear();
  for (const [k, v] of Object.entries(h)) headerMap.set(k.toLowerCase(), v);
};

// inside the top-level beforeEach (default = same-origin, so existing cases pass the gate):
setHeaders({ "sec-fetch-site": "same-origin" });
vi.mocked(headers).mockResolvedValue({
  get: (k: string) => headerMap.get(k.toLowerCase()) ?? null,
} as unknown as Awaited<ReturnType<typeof headers>>);
logMock.warn.mockClear(); // R2-F4: the harness clears info+error but NOT warn (tests/auth/picker/clearIdentity.test.ts:19-20);
                          // without this, one endpoint's emit satisfies the next endpoint's assertion, so per-endpoint AC-2 proof is not independent.
```

- [ ] **Step 1b: Write failing tests** — a new `describe` block; a gate-reject case for EACH of the three exported actions (each asserting no mutation AND the forensic emit — AC-2 for all three, R2-F3/F2), plus the documented-bypass regression. Uses the existing `fd({...})` FormData helper (`tests/auth/picker/clearIdentity.test.ts:63-69`), `logMock`, `cookieSet`, and `supabaseMock.signOut` — all already exposed by the harness. The file imports `test` (not `it`), so use `test(`:

```ts
describe("same-origin gate (BL-SERVER-ACTION-ORIGIN-GATE)", () => {
  test("clearIdentity refuses cross-site, writes no cookie, emits the forensic code", async () => {
    setHeaders({ "sec-fetch-site": "cross-site" });
    const r = await clearIdentity(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }));
    expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(cookieSet).not.toHaveBeenCalled();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_ORIGIN_REJECTED" }),
    );
  });

  test("clearIdentityAndSkip refuses cross-site WITHOUT signing out, writes no cookie, emits", async () => {
    setHeaders({ "sec-fetch-site": "cross-site" });
    const r = await clearIdentityAndSkip(fd({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID }));
    expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(supabaseMock.signOut).not.toHaveBeenCalled(); // R1-F6: external mutation untouched
    expect(cookieSet).not.toHaveBeenCalled();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_ORIGIN_REJECTED" }),
    );
  });

  test("clearIdentityCore refuses cross-site, writes no cookie, emits", async () => {
    setHeaders({ "sec-fetch-site": "cross-site" });
    const r = await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
    expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
    expect(cookieSet).not.toHaveBeenCalled();
    expect(logMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: "PICKER_ORIGIN_REJECTED" }),
    );
  });

  test("documented bypass: cross-site with NO Origin header is refused", async () => {
    setHeaders({ "sec-fetch-site": "cross-site" }); // origin deliberately absent (§2.1)
    const r = await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
    expect(r).toEqual({ ok: false, code: "PICKER_INVALID_INPUT" });
  });
});
```

The `tests/auth/picker/clearIdentity.test.ts:228` no-emit pin is unchanged (it runs under the same-origin default, so the gate passes and it exercises the real body).

RED premise (production line, not scaffolding): the gate call `if (!(await isSameOriginServerAction())) return rejectCrossOrigin(...)` is ABSENT from all three actions (Step 3 adds it), so a cross-site request currently falls through to the real body, mutates, and returns `{ ok: true }` / redirects — the `{ ok: false, code: "PICKER_INVALID_INPUT" }` assertion fails, `cookieSet`/`signOut` fire, and `logMock.warn` never sees `PICKER_ORIGIN_REJECTED`. Every failure is caused by the missing production gate line, not by an unresolved import or undefined symbol (Step 1a supplies every symbol the tests use). Anti-tautology: per endpoint the mutation spy proves NO write happened AND the emit spy proves the forensic code FIRED — a guard-order regression that revoked before refusing, or a silent rejection with no emit, fails on that endpoint specifically (all three are pinned independently, so rejecting only one action cannot pass the suite — F2).

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
| `PICKER_SWITCH_FAILED` | M13 — a crew member's switch person clear did not land. | "A crew member's switch person clear did not land." | "Couldn't switch. Please try again." | Crew → try again; Eric if repeated |
```
```
PICKER_SWITCH_FAILED: "The picker clear action failed for a crew member's switch-person tap."
```
(No em-dash; straight apostrophes. The dev copy asserts ONLY the server fact — it claims neither "the identity was not cleared" (R1-F3: deletion may be staged before revalidatePath throws, `lib/auth/picker/clearIdentity.ts:199`, `tests/auth/picker/clearIdentity.test.ts:327`) nor "they were shown a retry" (R2-F1: false on close-while-pending, §2.3 probe case 2). Crew copy is the fixed ratified string.)

- [ ] **Step 2: Regen + run parity, verify RED→GREEN** — Run `pnpm gen:spec-codes && pnpm vitest run tests/cross-cutting/codes.test.ts`. Before adding the `catalog.ts` row (Step 3), parity FAILS (prose has a row the catalog lacks) — observe that failure first. RED premise: the catalog is missing the row the §12.4 prose now declares.

- [ ] **Step 3: Add the catalog entry** to `lib/messages/catalog.ts` (place among the `PICKER_*` rows):

```ts
PICKER_SWITCH_FAILED: {
  code: "PICKER_SWITCH_FAILED",
  warningClass: "general",
  dougFacing: "A crew member's switch person clear did not land.",
  crewFacing: "Couldn't switch. Please try again.",
  followUp: "Crew → try again; Eric if repeated",
  helpfulContext: "The picker clear action failed for a crew member's switch-person tap.",
  title: "Switch person failed",
  longExplanation: "A crew member tapped switch person and the clear did not land.",
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

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx tests/components/_metaPickerRoleChipContract.test.ts` ac=AC-5 -->

- [ ] **Step 1: Write failing tests** — extend `tests/components/auth/avatarMenu.test.tsx`. The file already imports `it`, `act`, `fireEvent`, `render`, `screen`, `waitFor` (add `waitFor` + `vi` to the `@testing-library/react` / `vitest` import lines), `jest-dom/vitest`, and provides `ROUTE`, `renderMenu`, and `openMenu` (`tests/components/auth/avatarMenu.test.tsx:23-45`). Add two local helpers (`closeMenu`, `deferred`) and import the result type; do NOT reference a `baseProps` — render with `ROUTE` spread, matching the file's own `renderMenu`:

```tsx
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";
import { messageFor } from "@/lib/messages/lookup";

// R2-F3: crewFacing is `string | null` (lib/messages/catalog.ts:50), so coalesce to "" for strict typecheck;
// the non-empty assertion below then fails loudly if the catalog copy is ever null/empty.
const EXPECTED = messageFor("PICKER_SWITCH_FAILED").crewFacing ?? ""; // derive, never hardcode

// closing: clicking the trigger while open calls close() (AvatarMenu.tsx:232).
function closeMenu(): void {
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-trigger")); });
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
// render with an explicit clearAction, matching renderMenu's prop shape:
const renderWith = (action: (fd: FormData) => Promise<ClearIdentityResult>) =>
  render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);

it("EXPECTED copy is a non-empty catalog string (kills the empty-copy tautology)", () => {
  expect(EXPECTED.length).toBeGreaterThan(0); // an emptied catalog copy fails HERE, not silently
});

it("passes the route inputs (slug/shareToken/showId) to the clear action (F3)", async () => {
  // R3-F1: type the mock param so `.mock.calls[0]![0]` indexes tuple `[FormData]`, not `[]` (TS2493/TS2352).
  const action = vi.fn(async (_formData: FormData) => ({ ok: true as const }));
  renderWith(action);
  openMenu();
  // submit the FORM so React builds FormData from the hidden inputs (AvatarMenu.tsx:350-352)
  act(() => { fireEvent.submit(screen.getByTestId("avatar-menu-switch-person").closest("form")!); });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const received = action.mock.calls[0]![0]; // typed FormData (no cast needed)
  expect(received.get("slug")).toBe(ROUTE.slug);        // mutant clearAction(new FormData()) fails here
  expect(received.get("shareToken")).toBe(ROUTE.shareToken);
  expect(received.get("showId")).toBe(ROUTE.showId);
});

it("renders an in-menu alert on failure, as a sibling of role=menu, and keeps the menu open", async () => {
  const action = vi.fn(async () => ({ ok: false as const, code: "PICKER_RESOLVER_LOOKUP_FAILED" as const }));
  renderWith(action);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent?.trim()).toBe(EXPECTED); // EXACT match: a rendered suffix fails (not substring)
  const menuEl = screen.getByRole("menu");
  const popover = screen.getByTestId("avatar-menu-popover");
  // R3-F3: pin the EXACT spec §4.3 contract; the alert is the DIRECT next sibling of role=menu
  // AND the popover's last child. `contains`/`compareDocumentPosition` alone let a wrapped-alert
  // or an alert-followed-by-another-child mutant survive.
  expect(menuEl.contains(alert)).toBe(false);        // not a child of role=menu (avatar-menu-items)
  expect(popover.contains(alert)).toBe(true);        // inside the popover (an outside-popover mutant fails)
  expect(menuEl.nextElementSibling).toBe(alert);     // IMMEDIATELY after the menu (a wrapped or non-adjacent mutant fails)
  expect(popover.lastElementChild).toBe(alert);      // and the popover's LAST child (a trailing-sibling mutant fails)
  expect(popover).toBeInTheDocument(); // stayed open
});

it("renders NO alert when the clear succeeds (awaits the transition before asserting absence, F5)", async () => {
  const action = vi.fn(async () => ({ ok: true as const }));
  renderWith(action);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  await waitFor(() => expect(action).toHaveBeenCalled());        // let the transition settle
  await act(async () => { await Promise.resolve(); });           // flush the post-resolve microtask/commit
  expect(screen.queryByRole("alert")).toBeNull();                // a late alert (settled microtask) would now be present
});

it("clears a stale error when the menu is reopened (R1-F4)", async () => {
  const action = vi.fn(async () => ({ ok: false as const, code: "PICKER_RESOLVER_LOOKUP_FAILED" as const }));
  renderWith(action);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  await screen.findByRole("alert");
  closeMenu();          // click trigger toggles closed
  openMenu();           // reopen
  expect(screen.queryByRole("alert")).toBeNull(); // reset-on-open, no stale error
});

it("close WHILE PENDING then resolve-failure: no throw, no alert; reopen stays clean (R2-F2)", async () => {
  // The §2.3 probe verified this lifecycle on a Harness; here it is pinned on the real AvatarMenu.
  const d = deferred<ClearIdentityResult>();
  renderWith(() => d.promise);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  closeMenu();                       // close before the clear resolves
  await act(async () => { d.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }); await d.promise; });
  expect(screen.queryByRole("alert")).toBeNull(); // nothing rendered while closed, no throw
  openMenu();
  expect(screen.queryByRole("alert")).toBeNull(); // reopen is idle
});

it("reopen WHILE STILL PENDING (Closed→Open-pending): submit aria-disabled, no alert; failure then surfaces (R3-F1)", async () => {
  const d = deferred<ClearIdentityResult>();
  renderWith(() => d.promise);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  closeMenu();
  openMenu();                        // reopen BEFORE the promise settles
  expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe("true"); // pending persists, focusable
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { d.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }); await d.promise; });
  expect(await screen.findByRole("alert")).toBeTruthy(); // failure surfaces in the open menu
  expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe("false"); // re-enabled
});

it("keyboard reaches the pending switch item by all four commands (aria-disabled, focusable) and re-activation is a no-op (R4-F1)", async () => {
  const action = vi.fn(() => new Promise<ClearIdentityResult>(() => {})); // never resolves; stays pending
  renderWith(action);
  openMenu();
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); }); // one real activation → pending
  const submit = screen.getByTestId("avatar-menu-switch-person");
  const menu = screen.getByTestId("avatar-menu-popover");
  expect(submit.getAttribute("aria-disabled")).toBe("true");
  expect((submit as HTMLButtonElement).disabled).toBe(false); // NOT native disabled (native disabled would strand focus)
  // All FOUR R4-F1 commands (ArrowDown, in-menu ArrowUp-wrap, End, reopen-with-ArrowUp) must reach the pending item.
  // R3-F2: `theme.focus()` fires onFocus→setActiveIndex(0); that state MUST commit before the key handler
  // reads activeIndex, so focus and the keyDown go in SEPARATE act() calls (same-act batches them and the
  // handler sees the stale index). Helper: focus the first item, flush, then send one key, flush.
  const fromFirst = (key: string): void => {
    act(() => { screen.getByTestId("avatar-menu-theme").focus(); }); // commit setActiveIndex(0)
    act(() => { fireEvent.keyDown(menu, { key }); });                 // handler now reads index 0
  };
  // (a) ArrowDown from the first item lands focus on the pending switch item…
  fromFirst("ArrowDown");
  expect(document.activeElement).toBe(submit);
  // (b) in-menu ArrowUp from the FIRST item wraps to the last (pending switch item); R2-F6 (was missing)…
  fromFirst("ArrowUp");
  expect(document.activeElement).toBe(submit);
  // (c) End also lands on it (last item)…
  fromFirst("End");
  expect(document.activeElement).toBe(submit);
  // (d) reopen-with-ArrowUp opens the menu at the last item…
  closeMenu();
  act(() => { fireEvent.keyDown(screen.getByTestId("avatar-menu-trigger"), { key: "ArrowUp" }); });
  expect(document.activeElement).toBe(screen.getByTestId("avatar-menu-switch-person"));
  // re-activation while pending is a no-op: click the submit (real form activation), assert no extra call
  const calls = action.mock.calls.length;
  act(() => { fireEvent.click(screen.getByTestId("avatar-menu-switch-person")); });
  expect(action.mock.calls.length).toBe(calls); // guard: onSwitchSubmit early-returns while pending
});
```

Anti-tautology + mutant-to-layer mapping (F4). `EXPECTED` is derived from `messageFor`, so a wrong-code or copy-drift render fails; the alert assertion uses **exact** equality on `textContent` (not `toHaveTextContent`'s substring match), so a rendered suffix fails at the component layer. The four string-presence mutants are killed at the layer that actually observes them, NOT all claimed against one assertion:
- **(a) empty crew copy** and **(b) suffixed crew copy** at the SOURCE are killed by `x1-catalog-parity` (Task 3): the catalog copy must equal the §12.4 prose, so emptying/suffixing the catalog reds `tests/cross-cutting/codes.test.ts`. The `EXPECTED.length > 0` test above is a second, component-suite guard against an emptied copy (it would otherwise make `expect("").toBe("")` a tautology here).
- **(c) placement** (copy in a `title` attribute, inside `role="menu"`, wrapped in another element, before the menu, or not the last popover child) is killed by the scoped `getByRole("alert")` + the full placement pins: `menu.contains(alert)===false`, `popover.contains(alert)===true`, `menu.nextElementSibling===alert`, `popover.lastElementChild===alert` (R3-F3).
- **(d) rendered suffix** (component appends to the rendered text) is killed by the exact-equality assertion (`textContent.trim() === EXPECTED`).
- **ok true↔false** is killed by the success case (no alert) vs the failure case (alert present).

RED premise (production line): Step 2 widens the prop type AND rebinds the form to a void-returning `onSwitchSubmit` wrapper (R4-F1: `<form action={clearAction}>` cannot compile once `clearAction` returns `Promise<ClearIdentityResult>`, since React 19's form-action slot requires `void | Promise<void>`; the wrapper is the only type-compatible binding, so it is a compile prerequisite, not deferrable). After Step 2 the suite compiles, but `AvatarMenu` renders no alert node, sets no `aria-disabled`, and does not reset on open, so at Step 3 the failure test's `findByRole("alert")` throws and the keyboard test's `aria-disabled` assertion fails. The FormData-seam test passes even at RED because the wrapper already forwards the form's inputs. Every RED failure traces to missing production BEHAVIOR that Step 4 adds (the alert node, the `aria-disabled` attribute, reset-on-open), never to an unresolved import or type error (all resolved in Step 2).

- [ ] **Step 2: Make the suite compile — widened types + the type-required `onSwitchSubmit` wrapper + form rebind (R4-F1).** Widening `clearAction`'s return type forces the form binding to change in the SAME step, because `<form action={clearAction}>` needs a `void | Promise<void>` return (React 19) and the widened `clearAction` no longer satisfies it; the void-returning `onSwitchSubmit` wrapper is the only type-compatible binding, so it and its state hooks are compile prerequisites (NOT behavior). The USER-VISIBLE behavior (alert node, `aria-disabled`, reset-on-open) is still deferred to Step 4, so the behavior tests still fail at Step 3.
  - In `IdentityChip.tsx`, keep the wrapper name, widen ONLY its return type:
    ```ts
    import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

    async function clearIdentityFormAction(formData: FormData): Promise<ClearIdentityResult> {
      "use server";
      // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker clearIdentity,
      // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
      return clearIdentity(formData);
    }
    ```
  - In `AvatarMenu.tsx`: widen the prop type to `clearAction: (formData: FormData) => Promise<ClearIdentityResult>` (`import type { ClearIdentityResult }`); add `useTransition` to the `react` import (`components/auth/AvatarMenu.tsx:54`); add the state + wrapper and REBIND the form to it (this is what keeps the file compiling):
    ```tsx
    const [switchStatus, setSwitchStatus] = useState<"idle" | "error">("idle");
    const [switchPending, startSwitch] = useTransition();
    const onSwitchSubmit = (formData: FormData): void => {
      if (switchPending) return; // re-entry guard (aria-disabled item stays focusable; guard here)
      setSwitchStatus("idle");
      startSwitch(async () => {
        const result = await clearAction(formData);
        if (!result.ok) setSwitchStatus("error");
      });
    };
    ```
    Change `<form action={clearAction}>` to `<form action={onSwitchSubmit}>` (keep the hidden `slug`/`shareToken`/`showId` inputs). Do NOT yet add the alert node, the `aria-disabled` attribute, or reset-on-open.
  - Fix the 3 void mocks (`tests/components/auth/avatarMenu.test.tsx:37`, `tests/components/IdentityChip.test.tsx:42`, `tests/components/identityChipSrSeparator.test.tsx:34`): change `clearAction: (): void => {}` to an async mock returning `{ ok: true as const }` so each typechecks against the widened prop.
  - Run `pnpm typecheck` — expected PASS (form-action slot now receives the void-returning `onSwitchSubmit`; `_metaPickerRoleChipContract.test.ts:21` still matches `clearAction={clearIdentityFormAction}`, name preserved).

- [ ] **Step 3: Run tests, verify they fail (RED)** — Run `pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx tests/components/_metaPickerRoleChipContract.test.ts` (scoped file list → NOT a heavy phase, no `pnpm heavy`). Expected: the failure-alert test FAILS (`findByRole("alert")` throws — no alert node) and the keyboard test FAILS (no `aria-disabled` attribute); the success, FormData-seam, existing, and 3 fixed void-mock files PASS. This is the SAME command Step 5 reruns green (R3-F4).

- [ ] **Step 4: Implement the remaining behavior** in `AvatarMenu.tsx` (add `import { messageFor } from "@/lib/messages/lookup"`; the state + `onSwitchSubmit` + form rebind already landed in Step 2):
  - reset on open: add `setSwitchStatus("idle")` in `openAt(...)` and the trigger's open branch;
  - set the submit `aria-disabled={switchPending}` (NOT native `disabled`, R4-F1: native disabled removes the item from focus and breaks the roving-tabindex `.focus()` at `AvatarMenu.tsx:106-109`) plus `aria-disabled:opacity-60 aria-disabled:cursor-not-allowed` for the visual; re-entry is already guarded by `onSwitchSubmit`;
  - render the alert as the LAST child of the popover, a SIBLING placed immediately AFTER the `role="menu"` element (NOT inside it, NOT after `</form>`), when `switchStatus === "error"`, using the repo's canonical inline-error idiom (verbatim from `components/admin/ShowRowActions.tsx:859`; `warning-*` tokens; `text-danger`/`border-danger` do NOT exist, R3-F2):
    ```tsx
    <div role="menu" ...>{/* theme item + form */}</div>
    {switchStatus === "error" ? (
      <div
        role="alert"
        data-testid="avatar-menu-switch-error"
        className="mt-1 rounded-sm border border-border-strong bg-warning-bg px-3 py-2 text-xs/relaxed text-warning-text"
      >
        {messageFor("PICKER_SWITCH_FAILED").crewFacing}
      </div>
    ) : null}
    ```
  The alert is NOT a `menuitem` (not focusable, not in arrow traversal), mirroring the identity header (`components/auth/AvatarMenu.tsx:271-297`). It is the popover's last child and the menu's direct next sibling (pinned by the Step-1 placement test, R3-F3).

- [ ] **Step 5: Run tests, verify they pass (GREEN)** — Run the SAME command as Step 3: `pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx tests/components/_metaPickerRoleChipContract.test.ts`; expected PASS. Then `pnpm typecheck` — PASS.

- [ ] **Step 6: Transition audit (writing-plans transition-inventory rule — enumerate EVERY conditional render/attribute in `AvatarMenu`, not only the new ones).** Confirm each against spec §4.6 with an explicit disposition:
  1. `{open ? (<popover/>) : null}` (`AvatarMenu.tsx:248`) — mount/unmount on open toggle; instant (no `AnimatePresence`), pre-existing, unchanged.
  2. `{hasIdentity ? (<identity header/>) : null}` (`AvatarMenu.tsx:271`) — pre-existing, unchanged; instant.
  3. `{name.trim() !== "" && role.trim() !== "" && (<sr-separator/>)}` (`AvatarMenu.tsx:285`) — the SR name/role separator; pre-existing, unchanged; instant. (R1-F7.)
  4. `{name.trim() !== "" && role.trim() !== "" && (<role suffix/>)}` (`AvatarMenu.tsx:290`) — the visible role suffix; pre-existing, unchanged; instant. (R1-F7.)
  5. `mounted && isDark ? "visible" : "invisible"` on the theme check (`AvatarMenu.tsx:336`) — a className visibility TOGGLE (not a mount), `suppressHydrationWarning`; pre-existing, unchanged; instant. (R1-F7.)
  6. **NEW** `aria-disabled={switchPending}` on the switch submit — an attribute toggle (not a mount), instant; keyboard-focusable throughout (R4-F1).
  7. **NEW** `{switchStatus === "error" ? (<alert/>) : null}` — the alert node, direct next sibling of `role="menu"` + popover last child, instant (`role="alert"`), reset to idle on open.
  8. `{...menuNameProps}` naming ternary on the `role="menu"` element (`AvatarMenu.tsx:207` computed, spread at `AvatarMenu.tsx:299`) — an aria-name attribute selection; pre-existing, unchanged; non-visual. (R2-F7.)
  9. `tabIndex={activeIndex === 0 ? 0 : -1}` on the theme item (`AvatarMenu.tsx:315`) — roving-tabindex attribute toggle; pre-existing, unchanged; non-visual. (R2-F7.)
  10. `tabIndex={activeIndex === 1 ? 0 : -1}` on the switch item (`AvatarMenu.tsx:363`) — roving-tabindex attribute toggle; pre-existing, unchanged; non-visual. (R2-F7.)
  11. `aria-expanded={open}` on the trigger (`AvatarMenu.tsx:230`) — state-dependent rendered attribute; pre-existing, unchanged; non-visual. (Named per R3-F5.)
  12. `aria-checked={isDark}` on the theme item (`AvatarMenu.tsx:313`) — state-dependent rendered attribute; pre-existing, unchanged; non-visual. (Named per R3-F5.)
  This is the complete set (grep `AvatarMenu.tsx` for `? `, `&&`, and every `aria-*={`/`tabIndex={` attribute to confirm none is omitted). Confirm the compound "close mid-pending then reopen" shows no stale error (the R2-F2 / R3-F1 tests in Step 1 cover it). Items 1-5 and 8-12 are pre-existing and change no behavior; items 6-7 are the only new states, both instant, matching the "instant, no animation needed" entries in §4.6.

- [ ] **Step 7: Commit** — `git add components/auth/IdentityChip.tsx components/auth/AvatarMenu.tsx tests/components/auth/avatarMenu.test.tsx tests/components/IdentityChip.test.tsx tests/components/identityChipSrSeparator.test.tsx && git commit -m "feat(crew-page): legible in-menu failure for switch person"`

<!-- tasks: end -->

## Backlog reconciliation (not a TDD task — split across plan-time and closeout)

There is deliberately no "Task 5": backlog reconciliation has no production RED, so forcing it into the TDD task list produced an invalid manufactured-RED cycle and an empty commit (R2-F2). It splits into two commits at two different times:

- **Filed at PLAN TIME (this spec+plan arc, already committed):** the two ADDITIVE follow-up entries `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` and `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` (`BACKLOG.md`). They carry no IN PROGRESS marker, and the spec/plan cite them, so the ledger referential-integrity guard requires them to exist — hence they are filed now, not deferred. At implementation time, confirm both are still present and accurate (update wording only if the helper name or the `resolveShowPageAccess.ts:246` line moved); no new filing.
- **Archived at CLOSEOUT (implementation arc, the PR's LAST commit — see Closeout step 5):** `BL-SERVER-ACTION-ORIGIN-GATE` and `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT` move to `BACKLOG-archive.md` with a resolution note, their IN PROGRESS markers removed in the SAME commit (archives reject in-progress entries; the marker must never reach `main`, invariant 12). This is the sole post-review commit and contains only invariant-12-mandated ledger-status changes (AC-7).

The two entries stay `**Status:** IN PROGRESS · **Branch:** fix/auth-picker-hardening` for the entire implementation until that final commit.

## Closeout

Ordered; each item gates the next. All of Closeout runs in the IMPLEMENTATION arc (this spec+plan arc stops at plan-APPROVE — see Execution handoff). The ordering is set so the whole-diff review covers exactly what merges (R2-F1): the impeccable marker is filled BEFORE review, and the ONLY commit after review is the invariant-12-mandated ledger-status removal, which invariant 12 requires to be last and which carries no code.

1. **Impeccable dual-gate.** `components/auth/IdentityChip.tsx` and `components/auth/AvatarMenu.tsx` are UI surfaces. Run the impeccable critique gate AND the impeccable audit gate on the diff (v3 setup gates: the context.mjs load of PRODUCT.md + DESIGN.md, then the register-reference read); P0/P1 fixed or `DEFERRED.md`'d; findings + dispositions recorded here.
2. **Fill the machine closeout marker (BEFORE review, so review covers it — R2-F1).** After step 1 has actually run, the implementer adds the bare-anchored marker line to this plan. The grammar (quoted here mid-line inside backticks so this instruction is NOT itself a marker line, per the closeout guard's line-initial rule): the implementer writes a line reading `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` with the REAL counts (`RAN-DEGRADED` if a gate half degraded; `dispositions=recorded` iff `p0+p1>0`, else `none`), as its own line in this section. **Not filled now, and never fabricated:** the invariant-8 closeout design's HONEST CEILING (`docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md` §7) states a fabricated marker is a deliberate lie; the gate has not run in this spec+plan arc, so no `RAN` claim is honest yet. Consequently `tests/docs/_metaInvariant8Closeout.test.ts` reds on this unmerged branch by design (a declaring plan with no completed marker is correctly gated out of `main`); it goes green when this step fills the marker in the implementation arc, before merge.
3. **Full local gates before push:** `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
4. **Whole-diff cross-model review to APPROVE.** Covers ALL code plus the filled invariant-8 marker (step 2) — i.e. everything that merges EXCEPT the mechanical ledger-status removal in step 5. Any repair from this review is re-reviewed here, so no code change escapes review.
5. **Backlog archive — the PR's LAST commit.** Archive `BL-SERVER-ACTION-ORIGIN-GATE` and `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT` to `BACKLOG-archive.md` with a resolution note, removing their IN PROGRESS markers in the SAME commit (archives reject in-progress entries). This is the SOLE post-review commit; it contains ONLY invariant-12-mandated ledger-status changes (an entry move + marker removal + a one-line resolution note — no code, no behavior). Invariant 12 REQUIRES the marker to come off in "the PR's last commit, before the merge", so a post-review commit here is not a "review covers what merges" violation but the narrow, invariant-mandated exception: the reviewed CODE equals the merged CODE. Re-run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts` after it.
6. **Real CI green**, then `gh pr merge --merge`, then FF local `main` to `0  0`.

## Self-review checklist (author, pre-adversarial)

- [ ] **Spec coverage:** every spec section maps to a task (§3 gate → Tasks 1-2; §4 UX → Tasks 3-4; §3.5 sweep + archive → plan-time backlog filing + Closeout step 5). Documented limits §7 need no task.
- [ ] **Placeholder scan:** no TBD/TODO; every code step has real content.
- [ ] **Type consistency:** `ClearIdentityResult`, `isSameOriginServerAction`, `rejectCrossOrigin`, `clearIdentityFormAction` (name preserved), `PICKER_ORIGIN_REJECTED` (log-borne), `PICKER_INVALID_INPUT` (returned), `PICKER_SWITCH_FAILED` spelled identically across tasks.
- [ ] **Anti-tautology:** Task 2 asserts no-mutation-on-reject AND the forensic emit, independently per all three endpoints (F2); Task 4 derives copy from `messageFor`, asserts the alert by EXACT `textContent` equality (not substring) scoped to `role="alert"`, proves the FormData route inputs reach the action (F3), awaits the transition before asserting success-has-no-alert (F5), and drives the pending re-entry guard by real form activation (F6); the four string-presence mutants are mapped to the layer that observes each (empty/suffix → `x1-catalog-parity`; placement → scoped `role="alert"` + sibling; rendered-suffix → exact match; ok true/false → success vs failure case) (F4).
- [ ] **RED validity + same-command cycle:** every `red=` names the production line whose absence makes it fail (Tasks 1-4); Task 4 Step 2 widens the types AND adds the type-required `onSwitchSubmit` wrapper + form rebind (R4-F1: `<form action={clearAction}>` cannot compile once the return type widens), so the suite compiles; RED (Step 3) and GREEN (Step 5) run the IDENTICAL multi-file command, and every RED is a behavioral red (missing alert/aria-disabled/reset), not a scaffolding/type red (R1-F1, R3-F1, R3-F4, R4-F1); backlog reconciliation is NOT a TDD task so it carries no `red=` (R2-F2). Every pasted test typechecks under strict tsconfig (`EXPECTED` coalesces `string | null` R2-F3; the seam mock's param is typed so `.mock.calls[0]![0]` indexes `[FormData]` R3-F1).
- [ ] **Transition inventory:** Task 4 Step 6 enumerates ALL twelve `AvatarMenu` conditional renders/attributes (open, hasIdentity, two name/role separators, mounted/dark check, aria-disabled, alert, menuNameProps, two tabIndex, aria-expanded, aria-checked) with a disposition each (R1-F7 + R2-F7 + R3-F5), and states the grep that confirms completeness.
- [ ] **Per-endpoint independence:** Task 2 clears `logMock.warn` in beforeEach so each of the three endpoints' emit assertions is independent (R2-F4); the truth table pins precedence both directions (R2-F8).
- [ ] **Placement + keyboard rigor:** the alert is pinned inside-popover, not-inside-menu, DIRECT next sibling of the menu, AND the popover's last child (R2-F5 + R3-F3); all four R4-F1 keyboard commands (ArrowDown, in-menu ArrowUp-wrap, End, reopen-ArrowUp) are exercised while pending with focus committed in a separate `act()` before each key so the handler reads the fresh index (R2-F6 + R3-F2), and success is asserted only after the transition settles (R1-F5).
- [ ] **Invariant 12 + review-covers-what-merges:** the marker is filled BEFORE the whole-diff review (Closeout step 2), the archive + marker removal is the PR's LAST and ONLY post-review commit carrying only ledger-status changes (Closeout step 5), so reviewed code == merged code (R2-F1, R1-F9); entries stay IN PROGRESS until then.
- [ ] **Invariant 8 marker:** deferred to the implementation arc's closeout (the gate cannot run before UI code; no fabricated `RAN`, per the closeout design HONEST CEILING); `_metaInvariant8Closeout` reds on this unmerged branch by design (R1-F8). AC-7 covers backlog reconciliation traceability (R1-F10).

## Adversarial review (cross-model)

Between self-review and execution handoff: dispatch a Codex adversarial-review of this plan (stage=plan) to APPROVE. Round-economy: consequence bound + threat fence + do-not-relitigate in the brief; round-5 cap → fence → escalate.

## Execution handoff

This arc STOPS at plan-APPROVE (spec/plan owner, no implementation). Implementation is a separate Opus + Claude Code session (UI surfaces → impeccable dual-gate). Recommended: subagent-driven-development, fresh subagent per task.
