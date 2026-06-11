# Root `/` Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root stub with a branded landing card for anonymous visitors and a server redirect into the existing sign-in resolution for signed-in visitors (admin → `/admin`, crew → `/me`).

**Architecture:** A discriminated session probe (`lib/auth/rootSessionProbe.ts`: `authenticated | anonymous | infra_error`, classified via `isAuthSessionMissingError`) drives `app/page.tsx`; fail-open render keeps a `console.error` operator signal. One-branch alignment in `app/auth/sign-in/page.tsx` makes RETURNED non-missing `getUser` errors surface `ADMIN_SESSION_LOOKUP_FAILED` like thrown ones. CTA is a plain Link into `/auth/sign-in?next=/admin`.

**Tech Stack:** Next.js 16 App Router server components, Tailwind v4 tokens, Vitest + Testing Library, Playwright.

**Spec (canonical, APPROVED R4):** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-root-landing-design.md`. D-1..D-4 + §7 watchpoints ratified.

**Workspace:** git worktree `/Users/ericweiss/FX-Webpage-Template-root-landing`, branch `spec/root-landing`. ALL work happens here — the main checkout is in use by parallel features. Every commit: verify `git branch --show-current` = `spec/root-landing`.

**Routing:** Opus implements (UI milestone; impeccable v3 dual-gate external before close-out); Codex reviews. No DB changes.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `lib/auth/rootSessionProbe.ts` | Create | Discriminated session probe (spec §4.1.1) |
| `app/page.tsx` | Replace | Probe consumption + landing card (spec §4.1.2, §4.2) |
| `app/auth/sign-in/page.tsx` | Modify (one branch) | Returned non-missing error ⇒ `ADMIN_SESSION_LOOKUP_FAILED` (spec §4.1.5) |
| `tests/auth/rootSessionProbe.test.ts` | Create | Probe state matrix |
| `tests/auth/_metaInfraContract.test.ts` | Modify | R41 source-regex row + constructor-list membership (`:132`, `:177+`) |
| `tests/auth/signInPageRedirect.test.ts` | Modify | §4.1.5 branch coverage (extend existing harness) |
| `tests/app/rootLanding.test.tsx` | Create | Page render/redirect/infra matrix |
| `tests/e2e/root-landing.spec.ts` | Create | Redirect chain + card + layout invariants |
| `playwright.config.ts` | Modify | Add `root-landing` to testMatch (both projects), as `needs-attention-page` was added |

Meta-test inventory (mandatory declaration): EXTENDS `tests/auth/_metaInfraContract.test.ts` only (spec §9.4). No PROTECTED_ROUTES row (public page outside the audit walk, `lib/audit/protectedRoutes.ts:43` — spec §7.4). No other registries.

---

### Task 1: `rootSessionProbe` + registry rows

**Files:**
- Create: `lib/auth/rootSessionProbe.ts`
- Test: `tests/auth/rootSessionProbe.test.ts` (create)
- Modify: `tests/auth/_metaInfraContract.test.ts` (same commit)

- [ ] **Step 1.1: Failing tests** — `tests/auth/rootSessionProbe.test.ts`, mocking `@/lib/supabase/server`:

```ts
import { describe, expect, test, vi } from "vitest";

const serverMock = vi.hoisted(() => ({
  impl: null as null | (() => Promise<unknown>),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => serverMock.impl!(),
}));

function clientWithGetUser(result: unknown) {
  return { auth: { getUser: async () => result } };
}

import { rootSessionProbe } from "@/lib/auth/rootSessionProbe";

describe("rootSessionProbe", () => {
  test("valid user → authenticated", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    expect(await rootSessionProbe()).toEqual({ kind: "authenticated" });
  });
  test("no user, no error → anonymous", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: null }, error: null });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned AuthSessionMissingError (name shape) → anonymous", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: null }, error: { name: "AuthSessionMissingError", message: "x" } });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned missing-session (message shape, supabaseAuthError.ts:10) → anonymous", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: null }, error: { name: "AuthApiError", message: "Auth session missing!" } });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned NON-missing error (status-500 AuthApiError shape) → infra_error", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: null }, error: { name: "AuthApiError", message: "Database error", status: 500 } });
    const r = await rootSessionProbe();
    expect(r.kind).toBe("infra_error");
  });
  test("getUser THROW → infra_error (resolves, never rejects)", async () => {
    serverMock.impl = async () => ({ auth: { getUser: async () => { throw new Error("network reset"); } } });
    await expect(rootSessionProbe()).resolves.toMatchObject({ kind: "infra_error" });
  });
  test("construction THROW → infra_error (resolves, never rejects)", async () => {
    serverMock.impl = async () => { throw new Error("missing env"); };
    await expect(rootSessionProbe()).resolves.toMatchObject({ kind: "infra_error" });
  });
});
```

- [ ] **Step 1.2: Run, verify FAIL** — `pnpm vitest run tests/auth/rootSessionProbe.test.ts` → "Cannot find module … rootSessionProbe".

- [ ] **Step 1.3: Implement:**

```ts
// lib/auth/rootSessionProbe.ts
//
// Session probe for the public root landing (spec §4.1). Three states,
// never collapsed (AGENTS.md invariant 9): returned missing-session
// errors are anonymous (the isAdminSession discipline,
// lib/auth/isAdminSession.ts:30-35); returned NON-missing errors and
// any throw are infra faults — the caller decides the render posture,
// this helper only classifies.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";

export type RootSessionProbeResult =
  | { kind: "authenticated" }
  | { kind: "anonymous" }
  | { kind: "infra_error"; message: string };

export async function rootSessionProbe(): Promise<RootSessionProbeResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return { kind: "infra_error", message: `client construction threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isAuthSessionMissingError(error)) return { kind: "anonymous" };
      return { kind: "infra_error", message: `getUser returned non-missing error: ${error.message ?? String(error)}` };
    }
    if (data?.user) return { kind: "authenticated" };
    return { kind: "anonymous" };
  } catch (err) {
    return { kind: "infra_error", message: `getUser threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}
```

- [ ] **Step 1.4: Run, verify PASS** — 7/7.

- [ ] **Step 1.5: Registry rows (same commit) in `tests/auth/_metaInfraContract.test.ts`:**
  1. Add `"lib/auth/rootSessionProbe.ts"` to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`:132`).
  2. Add a source-regex test in the "R41 Supabase boundary source registry" describe (`:177+`), following the siblings:

```ts
test("rootSessionProbe destructures getUser and classifies via isAuthSessionMissingError", () => {
  const source = readFileSync("lib/auth/rootSessionProbe.ts", "utf8");
  expect(source).toMatch(/const\s+\{\s*data,\s*error\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)/);
  expect(source).toMatch(/isAuthSessionMissingError\(error\)/);
});
```

  3. **Behavioral registry rows (spec §4.1.3 — IN the meta-test file, not only the unit file; R1-P-F1):** add a `describe("rootSessionProbe behavioral contract")` block in `tests/auth/_metaInfraContract.test.ts` using that file's own mocking harness (read how its existing behavioral assertions mock `@/lib/supabase/server`), with the four spec-required cases — construction throw ⇒ `infra_error`; `getUser` throw ⇒ `infra_error`; returned `AuthSessionMissingError` ⇒ `anonymous`; returned NON-missing error ⇒ `infra_error`. These duplicate four unit cases BY DESIGN: the registry gate must fail on a collapse regression even if the helper's unit file is renamed/skipped.

  Run `pnpm vitest run tests/auth/_metaInfraContract.test.ts` → PASS (the constructor-inside-try scan must accept the new file as written; if it flags, the probe's construction try placement is wrong — fix the probe, not the scan).

- [ ] **Step 1.6: Typecheck + commit**

```bash
pnpm typecheck
git add lib/auth/rootSessionProbe.ts tests/auth
git commit -m "feat(auth): rootSessionProbe — discriminated session probe for the root landing"
```

### Task 2: Sign-in returned-error alignment (spec §4.1.5)

**Files:**
- Modify: `app/auth/sign-in/page.tsx` (guard region `:113-116`)
- Test: `tests/auth/signInPageRedirect.test.ts` (extend — read its existing harness/mocks first and follow them)

- [ ] **Step 2.1: Failing test** — in the existing file's harness style: mock `getUser` to RETURN `{ data: { user: null }, error: { name: "AuthApiError", message: "Database error", status: 500 } }` → rendering the sign-in page shows the error block (`sign-in-error-block`) with `ADMIN_SESSION_LOOKUP_FAILED` copy (resolve expected copy via the CREW-facing field — `messageFor("ADMIN_SESSION_LOOKUP_FAILED").crewFacing` (or the crew-facing getter if one exists in `lib/messages/lookup.ts`) — NOT `getRequiredDougFacing`: this catalog row has `dougFacing: null` and the sign-in page renders `ErrorExplainer` with `surface="crew"`, so the Doug-facing path would throw before proving anything (R1-P-F2); never hardcode the string) and does NOT redirect. Also a guard-keeping test: returned `{ name: "AuthSessionMissingError" }` still falls through to the plain CTA with NO error block (pins that only non-missing errors trip the code).
- [ ] **Step 2.2: Verify FAIL** (the non-missing case renders a bare CTA today).
- [ ] **Step 2.3: Implement the one branch** — in `app/auth/sign-in/page.tsx` after `const error = getUserResult?.error;` (`:115`):

```ts
// Spec §4.1.5 (root-landing R3): a RETURNED non-missing getUser error is
// auth infrastructure failing, not "no session" — surface the same
// cataloged block the thrown path gets (isAdminSession discipline,
// lib/auth/isAdminSession.ts:30-35). Missing-session returned errors
// keep the existing fall-through-to-CTA behavior.
if (!infraThrew && error && !isAuthSessionMissingError(error)) {
  forcedErrorCode = "ADMIN_SESSION_LOOKUP_FAILED";
}
```

  Import `isAuthSessionMissingError` from `@/lib/auth/supabaseAuthError`. Note `forcedErrorCode` is declared at `:110` — this assignment must come AFTER that declaration; place the branch accordingly.
- [ ] **Step 2.4: Run** — `pnpm vitest run tests/auth/signInPageRedirect.test.ts tests/auth` → PASS, no regressions (if an existing test pinned the silent fall-through for non-missing returned errors, it pinned the gap — update it citing spec §4.1.5).
- [ ] **Step 2.5: Commit** — `git commit -m "fix(auth): sign-in surfaces ADMIN_SESSION_LOOKUP_FAILED for returned non-missing getUser errors (spec §4.1.5)"`

### Task 3: The landing page

**Files:**
- Replace: `app/page.tsx`
- Test: `tests/app/rootLanding.test.tsx` (create; copy jsdom harness conventions from `tests/app/admin/needsAttentionPage.test.tsx`)

- [ ] **Step 3.1: Failing tests** — mock `@/lib/auth/rootSessionProbe` + `next/navigation`'s `redirect` (throwing sentinel, the Next semantic):
  - `anonymous` → `root-landing-card` renders; CTA link (`root-landing-signin`) has EXACT href `/auth/sign-in?next=/admin`; crew line text exactly `On a crew? The link Doug sent goes straight to your show.`; an `h1` exists containing `FXAV`; assertions scoped `within(card)`.
  - `authenticated` → `redirect` called with exactly `/auth/sign-in?next=/admin`; card NOT rendered.
  - `infra_error` → card renders AND `console.error` spy called with a first arg containing `[root-landing]`; *fails if observability is dropped*.
  - No raw catalog-code shapes anywhere in rendered text (`/[A-Z][A-Z_]{5,}/` scan).
- [ ] **Step 3.2: Verify FAIL.**
- [ ] **Step 3.3: Implement `app/page.tsx`:**

```tsx
// app/page.tsx — public root landing (spec §4.2). Signed-in visitors
// redirect into the existing sign-in resolution (admin → /admin,
// crew → /me; spec D-2). Fail-open render with operator signal (§4.1.2).
import Link from "next/link";
import { redirect } from "next/navigation";
import { rootSessionProbe } from "@/lib/auth/rootSessionProbe";

export default async function Home() {
  const probe = await rootSessionProbe(); // redirect() stays OUTSIDE any try/catch (NEXT_REDIRECT)
  if (probe.kind === "authenticated") {
    redirect("/auth/sign-in?next=/admin");
  }
  if (probe.kind === "infra_error") {
    console.error("[root-landing] session probe infra fault:", probe.message);
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken p-page-pad-mobile sm:p-page-pad-desktop">
      <div
        data-testid="root-landing-card"
        className="flex w-full max-w-sm flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-text-strong">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fxav-icon.png" alt="" aria-hidden width={28} height={28} className="size-7 shrink-0 select-none" />
          FXAV <span className="text-accent-on-bg">Crew Pages</span>
        </h1>
        <Link
          href="/auth/sign-in?next=/admin"
          data-testid="root-landing-signin"
          className="..." /* resolved in Step 3.3a below */
        >
          ...
        </Link>
        <p className="border-t border-border pt-3 text-sm text-text-subtle">
          On a crew? The link Doug sent goes straight to your show.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3.3a: CTA visual = the sign-in door's button, exactly.** The sign-in page's CTA is the OFFICIAL Google-branded image button (`app/auth/sign-in/SignInButton.tsx:50-59`: transparent button + Google sign-in image + `min-h-tap-min` + the `#1a73e8` Google focus ring). Read `SignInButton.tsx`, copy its image element (same `src`, dimensions, `block select-none`) and its className verbatim onto the Link (dropping the `disabled:` utilities — Links don't disable), so door 1 and door 2 are pixel-identical. The Link's accessible name comes from the image's existing alt (`Sign in with Google` — verify the exact alt in the file and keep it). NOTE: the existing `focus-visible:ring-[#1a73e8]` arbitrary value is shipped, pre-existing vocabulary from SignInButton — reusing it verbatim is consistency, not a new arbitrary value; cite `SignInButton.tsx:50` in a comment.
- [ ] **Step 3.4: Run tests** → PASS. Also `pnpm vitest run tests/app tests/auth` → no new failures.
- [ ] **Step 3.5: Commit** — `git commit -m "feat(crew-page): root landing card + signed-in redirect through sign-in resolution"`

### Task 4: E2E — redirect chain, card, layout invariants

**Files:**
- Create: `tests/e2e/root-landing.spec.ts` (harness: `signInAs`, `ADMIN_FIXTURE`, `NON_ADMIN_CREW_FIXTURE` from `tests/e2e/helpers/fixtures.ts:25-31`; conventions from `tests/e2e/sign-in-page.spec.ts`)
- Modify: `playwright.config.ts` (add `root-landing` to mobile-safari + desktop-chromium testMatch, exactly as `needs-attention-page` was added)

- [ ] **Step 4.1: Write the spec:**
  - signed-in admin (`signInAs(page, ADMIN_FIXTURE)`) → `page.goto("/")` → `await expect(page).toHaveURL(/\/admin(?:$|\?)/)`. *Catches: hop 1 or 2 breaking for admins.*
  - signed-in crew (`NON_ADMIN_CREW_FIXTURE`) → `/` → final URL `/me`. *Catches: the non-admin fallback breaking.*
  - anonymous (signed out) → `/` → `root-landing-card` visible; click `root-landing-signin` → sign-in page rendered (`sign-in-headline` visible) with `next=/admin` in the URL. *Catches: CTA href/encode breakage.*
  - layout invariants (spec §4.5 verbatim) at 390/720/1280: CTA bounding height ≥ 44 − 0.5; `|card.center.x − viewport/2| ≤ 1`; `document.documentElement.scrollWidth − clientWidth === 0`. Real browser, `getBoundingClientRect`.
  - dark-mode spot check: toggle `prefers-color-scheme: dark` (playwright `colorScheme`) → card still visible, no raw-color regressions expected (token pairs).
- [ ] **Step 4.2: Run** — prod build per project convention (build + start with TEST_DATABASE_URL overridden to local 127.0.0.1:54322 per the needs-attention milestone's e2e procedure; reuse the existing playwright webServer wiring) → ALL PASS.
- [ ] **Step 4.3: Commit** — `git commit -m "test(crew-page): root landing e2e — redirect chain, card, layout invariants"`

### Task 5: Transition audit + full local gate

- [ ] **Step 5.1: Transition audit (spec §4.4):** grep `app/page.tsx` + `lib/auth/rootSessionProbe.ts` for `AnimatePresence|motion\.|useState|useEffect` → expect ZERO client state/animation (pure server render; all states instant). Record the result in the Step 5.4 commit message.
- [ ] **Step 5.2:** `pnpm vitest run` (full suite) → only pre-existing failures (verify any failure reproduces on `origin/main`); `pnpm typecheck` → 0.
- [ ] **Step 5.3:** `pnpm exec prettier --check` on every touched file → clean (format new files; leave pre-existing drift in modified files untouched per the prior milestone's convention).
- [ ] **Step 5.4: Commit** any stragglers — `git commit -m "chore: root-landing local gates green (transition audit: zero client state, all instant)"`

### Task 6: Impeccable v3 dual-gate (invariant 8 — EXTERNAL attestation)

- [ ] **Step 6.1:** Fresh external subagent runs `/impeccable critique` on the milestone UI diff (`app/page.tsx`, the sign-in one-branch change) with v3 preflight gates.
- [ ] **Step 6.2:** Fresh external `/impeccable audit` likewise.
- [ ] **Step 6.3:** Fix or defer HIGH/CRITICAL (DEFERRED/BACKLOG per discipline); spec-check copy rewrites; re-run gates after any UI fix commit.
- [ ] **Step 6.4:** Handoff doc `docs/superpowers/plans/v1-pre-deployment-amendments/2026-06-10-root-landing-handoff.md` with §12 findings + dispositions, committed BEFORE Task 7.

### Task 7: Adversarial review (cross-model) + gate fixpoint

- [ ] **Step 7.1:** `codex-companion adversarial-review --background --fresh --base origin/main --scope branch` from the WORKTREE dir; REVIEWER-ONLY framing; do-not-relitigate = spec §2 D-1..D-4 + §7 + handoff §12 dispositions. Iterate `--resume-last` to APPROVE; class-sweep before patching; verify each fix commit with `git merge-base --is-ancestor`.
- [ ] **Step 7.2: Gate-ordering fixpoint:** if any post-attestation fix touched `app/**` (non-api)/`components/**` → re-run both external gates + append §12 + one more fresh-eyes adversarial round; repeat to fixpoint.

### Task 8: CI + merge

- [ ] **Step 8.1:** Push `spec/root-landing`; open PR to `main`; if DIRTY/behind, merge base in.
- [ ] **Step 8.2:** Real CI green (x1-x6, screenshots-drift — no baselines touched, must stay green; validation-schema-parity no-op; Vercel; traceability).
- [ ] **Step 8.3:** Merge (merge-commit), delete branch, `git worktree remove` the worktree, update memory + close-out.

---

## Plan self-review

- Spec coverage: §4.1→T1, §4.1.5→T2, §4.2+D-3/D-4→T3, §4.3 guard table→T1/T3 tests, §4.4→T5.1, §4.5→T4 invariants, §9.1→T1/T2/T3, §9.2/2b→T4/T2, §9.3→T4, §9.4 meta inventory→T1.5; §5/§6 N/A declared.
- No placeholders (the one deliberate `...` in Task 3's code block is resolved by Step 3.3a's explicit procedure with file:line source).
- Type consistency: `RootSessionProbeResult` kinds match across T1/T3; testids `root-landing-card`/`root-landing-signin` consistent; fixture names verified (`ADMIN_FIXTURE`, `NON_ADMIN_CREW_FIXTURE` at `tests/e2e/helpers/fixtures.ts:25-31`).
