# Share-link instant-rotate + success-banner dedup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant URL/Copy/email block from the rotate-success banner by making all crew-URL surfaces (header chip, "Open crew page" link, share-link card) update instantly and soundly from a shared client token+epoch cache.

**Architecture:** Read the share token AND its `shows.picker_epoch` from one atomic RPC snapshot; seed a client `ShareTokenProvider` whose `{token,epoch}` state is gated by a monotonic epoch (accept iff `serverEpoch ≥ local`); the header chip, crew-page link, and card body consume it; the rotate button calls `applyRotated(token,epoch)` on success and its banner becomes confirmation-only.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Supabase Postgres (SECURITY DEFINER RPC), Vitest + React Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-10-share-link-instant-rotate-dedup-design.md` (APPROVED, Codex, 12 rounds).

## Global Constraints

- **TDD per task** (invariant 1): failing test → run-fail → minimal impl → run-pass → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`); one task per commit; `--no-verify` (shared hooks belong to the main checkout).
- **Invariant 8 (impeccable dual-gate):** UI surfaces changed (`app/admin/**`, new `app/admin/show/[slug]/*` client files) → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- **Invariant 9 (Supabase call-boundary):** `loadShowShareToken` destructures `{data, error}`, distinguishes thrown vs returned error.
- **Invariant 10:** no mutation surface added/changed (token-read RPC is a read; `rotateShareToken` untouched).
- **Validation-schema-parity (AGENTS.md):** the migration lands with (a) local apply + tests, (b) `pnpm gen:schema-manifest` committed, (c) surgical apply to the validation project — all in this PR.
- **No epoch-atomicity shortcuts:** token + `picker_epoch` MUST come from one RPC statement (single snapshot). The rotate result's `new_epoch` is already atomic.
- Meta-test inventory: **none** created/extended (`loadShowShareToken` is a data loader, not an auth helper subject to `_metaInfraContract`; no advisory-lock/admin-alert/tile surface).
- Worktree: `/Users/ericweiss/fxav-worktrees/share-link-instant-rotate` (branch `feat/share-link-instant-rotate-dedup`). All paths below are relative to it.

---

### Task 1: Atomic token+epoch read RPC (migration)

**Files:**
- Create: `supabase/migrations/20260714000000_admin_read_share_token_with_epoch.sql`
- Test: `tests/db/admin_read_share_token.test.ts` (modify), `tests/db/_b2Helpers.ts` (modify if it calls the RPC)

**Interfaces:**
- Produces: RPC `public.admin_read_share_token(p_show_id uuid) returns table(share_token text, picker_epoch int)`.

- [ ] **Step 1: Write/adjust the failing DB test.** In `tests/db/admin_read_share_token.test.ts`, assert the RPC now returns a row shape. Add cases: (a) admin caller on a show WITH a token → row `{ share_token: <hex>, picker_epoch: <int≥1> }`; (b) admin on a show with NO token row → `{ share_token: null, picker_epoch: <int≥1> }` (left join still returns epoch); (c) non-admin → `share_token: null` (epoch may be present, non-secret); (d) after a `rotate_show_share_token`, `picker_epoch` is strictly greater than before. Read the existing test first and adapt its harness (self-signed admin JWT + Supabase-issued `apikey` per AGENTS.md gateway rule).

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/db/admin_read_share_token.test.ts` → FAIL (RPC still returns scalar `text`).

- [ ] **Step 3: Write the migration.**
```sql
-- 20260714000000_admin_read_share_token_with_epoch.sql
-- Return the admin-gated share token AND the show's monotonic picker_epoch from
-- ONE snapshot, so the client can order token versions (spec §3.0).
drop function if exists public.admin_read_share_token(uuid);
create function public.admin_read_share_token(p_show_id uuid)
  returns table(share_token text, picker_epoch int)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case when public.is_admin() then t.share_token else null end as share_token,
         s.picker_epoch
    from public.shows s
    left join public.show_share_tokens t on t.show_id = s.id
   where s.id = p_show_id
   limit 1
$$;
revoke all on function public.admin_read_share_token(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_read_share_token(uuid) to authenticated;
```

- [ ] **Step 4: Apply locally + verify test passes.**
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260714000000_admin_read_share_token_with_epoch.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "notify pgrst, 'reload schema';"
pnpm vitest run tests/db/admin_read_share_token.test.ts
```
Expected: PASS.

- [ ] **Step 5: Regenerate schema manifest.** `pnpm gen:schema-manifest` → confirm `supabase/**generated**/schema-manifest.json` reflects the new function signature.

- [ ] **Step 6: Commit.**
```bash
git add supabase/migrations/20260714000000_admin_read_share_token_with_epoch.sql tests/db/admin_read_share_token.test.ts tests/db/_b2Helpers.ts supabase/**/schema-manifest.json
git commit --no-verify -m "feat(db): admin_read_share_token returns (share_token, picker_epoch) atomically"
```

- [ ] **Step 7: Apply to the validation project** (before push; the `validation-schema-parity` gate asserts it). Using the `TEST_DATABASE_URL` from the MAIN checkout `.env.local`:
```bash
psql "$TEST_DATABASE_URL" -f supabase/migrations/20260714000000_admin_read_share_token_with_epoch.sql
psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"
```
(If `supabase db query --linked` is the established path, use it instead — either applies the same SQL.)

---

### Task 2: `loadShowShareToken` returns `{token, epoch}`

**Files:**
- Modify: `lib/data/loadShowShareToken.ts`
- Test: `tests/data/loadShowShareToken.test.ts`

**Interfaces:**
- Consumes: RPC from Task 1.
- Produces: `loadShowShareToken(showId: string): Promise<{ token: string | null; epoch: number }>`.

- [ ] **Step 1: Rewrite the failing test.** Replace the scalar assertions in `tests/data/loadShowShareToken.test.ts`. The `rpc` mock now resolves `{ data: [{ share_token, picker_epoch }], error }`. Cases:
```ts
// happy: array row
state.rpc.mockResolvedValue({ data: [{ share_token: "a".repeat(64), picker_epoch: 7 }], error: null });
await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: "a".repeat(64), epoch: 7 });
// object (non-array) row tolerated
state.rpc.mockResolvedValueOnce({ data: { share_token: "b".repeat(64), picker_epoch: 3 }, error: null });
await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: "b".repeat(64), epoch: 3 });
// null token row (tokenless show) → token null, epoch preserved
state.rpc.mockResolvedValueOnce({ data: [{ share_token: null, picker_epoch: 5 }], error: null });
await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: null, epoch: 5 });
// empty data → token null, epoch fallback 1
state.rpc.mockResolvedValueOnce({ data: [], error: null });
await expect(loadShowShareToken("show-id")).resolves.toEqual({ token: null, epoch: 1 });
// returned error → throws
state.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
await expect(loadShowShareToken("show-id")).rejects.toThrow("admin_read_share_token returned error: permission denied");
// thrown → throws
state.rpc.mockRejectedValueOnce(new Error("network down"));
await expect(loadShowShareToken("show-id")).rejects.toThrow("admin_read_share_token threw: network down");
// still calls requireAdmin + passes p_show_id
expect(state.rpc).toHaveBeenCalledWith("admin_read_share_token", { p_show_id: "show-id" });
```

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/data/loadShowShareToken.test.ts` → FAIL (loader returns a string).

- [ ] **Step 3: Rewrite the loader.**
```ts
export async function loadShowShareToken(showId: string): Promise<{ token: string | null; epoch: number }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  let result: { data: unknown; error: unknown };
  try {
    result = (await supabase.rpc("admin_read_share_token", { p_show_id: showId })) as {
      data: unknown;
      error: unknown;
    };
  } catch (error) {
    throw new Error(`admin_read_share_token threw: ${errorMessage(error)}`);
  }
  const { data, error } = result;
  if (error) {
    throw new Error(`admin_read_share_token returned error: ${errorMessage(error)}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { share_token?: unknown; picker_epoch?: unknown }
    | undefined
    | null;
  const token = typeof row?.share_token === "string" ? row.share_token : null;
  const epoch =
    typeof row?.picker_epoch === "number" && Number.isFinite(row.picker_epoch) ? row.picker_epoch : 1;
  return { token, epoch };
}
```

- [ ] **Step 4: Run to verify it passes.** `pnpm vitest run tests/data/loadShowShareToken.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/data/loadShowShareToken.ts tests/data/loadShowShareToken.test.ts
git commit --no-verify -m "feat(db): loadShowShareToken returns { token, epoch }"
```

> NOTE: `page.tsx` and `CurrentShareLinkPanel.tsx` call this loader and will not typecheck until Tasks 8–9 update them. That is expected; those tasks land in the same PR. Do not run a full `pnpm build` until Task 9.

---

### Task 3: `ShareTokenContext` (provider + epoch gate + hook)

**Files:**
- Create: `app/admin/show/[slug]/ShareTokenContext.tsx`
- Test: `tests/components/ShareTokenContext.test.tsx`

**Interfaces:**
- Produces:
  - `ShareTokenProvider({ initialToken: string | null; initialEpoch: number; children: ReactNode })`
  - `useShareToken(): { token: string | null; applyRotated: (token: string, epoch: number) => void }`

- [ ] **Step 1: Write the failing test** (`tests/components/ShareTokenContext.test.tsx`). Use a tiny probe consumer that renders `token ?? "∅"` and a button calling `applyRotated`. Cover the spec §6.1 cases:
```tsx
function Probe() {
  const { token, applyRotated } = useShareToken();
  return (
    <>
      <span data-testid="tok">{token ?? "∅"}</span>
      <button onClick={() => applyRotated("NEW", 6)}>rot</button>
    </>
  );
}
const P = (props: { initialToken: string | null; initialEpoch: number }) => (
  <ShareTokenProvider {...props}><Probe /></ShareTokenProvider>
);

test("applyRotated updates token", async () => {
  render(<P initialToken="OLD" initialEpoch={5} />);
  await userEvent.click(screen.getByText("rot"));
  expect(screen.getByTestId("tok")).toHaveTextContent("NEW");
});
test("stale refresh (lower epoch) rejected after rotate, order-independent", async () => {
  const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
  await userEvent.click(screen.getByText("rot")); // {NEW,6}
  rerender(<P initialToken="OLD" initialEpoch={5} />); // stale
  expect(screen.getByTestId("tok")).toHaveTextContent("NEW");
  rerender(<P initialToken="NEW" initialEpoch={6} />); // echo
  rerender(<P initialToken="OLD" initialEpoch={5} />); // stale after echo
  expect(screen.getByTestId("tok")).toHaveTextContent("NEW");
});
test("newer epoch accepted (external rotation)", () => {
  const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
  rerender(<P initialToken="NEW2" initialEpoch={7} />);
  expect(screen.getByTestId("tok")).toHaveTextContent("NEW2");
});
test("transient null same epoch after rotate keeps token", async () => {
  const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
  await userEvent.click(screen.getByText("rot")); // {NEW,6}
  rerender(<P initialToken={null} initialEpoch={6} />);
  expect(screen.getByTestId("tok")).toHaveTextContent("NEW");
});
test("null at higher epoch fails closed", () => {
  const { rerender } = render(<P initialToken="TOK" initialEpoch={5} />);
  rerender(<P initialToken={null} initialEpoch={6} />);
  expect(screen.getByTestId("tok")).toHaveTextContent("∅");
});
test("lifecycle archive→republish accepts re-rotated token", async () => {
  const { rerender } = render(<P initialToken="OLD" initialEpoch={5} />);
  await userEvent.click(screen.getByText("rot")); // {NEW,6}
  rerender(<P initialToken={null} initialEpoch={7} />); // archived (hidden)
  rerender(<P initialToken="T3" initialEpoch={8} />); // republished
  expect(screen.getByTestId("tok")).toHaveTextContent("T3");
});
test("cross-show key remount resets state (lower epoch fine)", () => {
  const { rerender } = render(
    <ShareTokenProvider key="A" initialToken="TA" initialEpoch={5}><Probe /></ShareTokenProvider>,
  );
  expect(screen.getByTestId("tok")).toHaveTextContent("TA");
  rerender(<ShareTokenProvider key="B" initialToken="TB" initialEpoch={1}><Probe /></ShareTokenProvider>);
  expect(screen.getByTestId("tok")).toHaveTextContent("TB");
});
test("useShareToken outside provider throws", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/within ShareTokenProvider/);
  spy.mockRestore();
});
```

- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/components/ShareTokenContext.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement** (verbatim from spec §3.2):
```tsx
"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { token: string | null; applyRotated: (token: string, epoch: number) => void };
const ShareTokenContext = createContext<Ctx | null>(null);

export function ShareTokenProvider({
  initialToken,
  initialEpoch,
  children,
}: {
  initialToken: string | null;
  initialEpoch: number;
  children: ReactNode;
}) {
  const [state, setState] = useState({ token: initialToken, epoch: initialEpoch });

  const applyRotated = useCallback(
    (token: string, epoch: number) => setState((p) => (epoch >= p.epoch ? { token, epoch } : p)),
    [],
  );

  useEffect(() => {
    setState((p) => {
      if (initialEpoch < p.epoch) return p; // stale refresh — reject
      if (initialToken === null) {
        return initialEpoch > p.epoch ? { token: null, epoch: initialEpoch } : p; // fail closed vs keep
      }
      return { token: initialToken, epoch: initialEpoch };
    });
  }, [initialToken, initialEpoch]);

  return (
    <ShareTokenContext.Provider value={{ token: state.token, applyRotated }}>
      {children}
    </ShareTokenContext.Provider>
  );
}

export function useShareToken(): Ctx {
  const ctx = useContext(ShareTokenContext);
  if (!ctx) throw new Error("useShareToken must be used within ShareTokenProvider");
  return ctx;
}
```

- [ ] **Step 4: Run to verify it passes.** `pnpm vitest run tests/components/ShareTokenContext.test.tsx` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/ShareTokenContext.tsx tests/components/ShareTokenContext.test.tsx
git commit --no-verify -m "feat(crew-page): ShareTokenProvider with monotonic epoch gate"
```

---

### Task 4: `ShareChip` (header chip consumer)

**Files:**
- Create: `app/admin/show/[slug]/ShareChip.tsx`
- Test: `tests/components/ShareChip.test.tsx`

**Interfaces:**
- Consumes: `useShareToken`, `resolveOrigin`, `ShareLinkCopyButton`.
- Produces: `ShareChip({ slug: string; isEligible: boolean })`.

- [ ] **Step 1: Write the failing test.** Render inside a provider; assert: (a) eligible + token → `admin-show-share-chip` present, `<code>` shows `/show/<slug>/<token>`, `title` = full url; (b) `applyRotated` updates the shown path; (c) `isEligible=false` → renders nothing; (d) token null → nothing.
```tsx
const wrap = (isEligible: boolean, initialToken: string | null, initialEpoch = 5) =>
  render(
    <ShareTokenProvider initialToken={initialToken} initialEpoch={initialEpoch}>
      <ShareChip slug="2024-05-x" isEligible={isEligible} />
    </ShareTokenProvider>,
  );
test("shows chip with path when eligible + token", () => {
  wrap(true, "TOK");
  expect(screen.getByTestId("admin-show-share-chip")).toHaveTextContent("/show/2024-05-x/TOK");
});
test("hidden when ineligible", () => {
  wrap(false, "TOK");
  expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
});
test("hidden when token null", () => {
  wrap(true, null);
  expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm vitest run tests/components/ShareChip.test.tsx`.

- [ ] **Step 3: Implement.** Copy the chip JSX from `app/admin/show/[slug]/page.tsx:555-577` verbatim into the component, driving `url`/path from context:
```tsx
"use client";
import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";

export function ShareChip({ slug, isEligible }: { slug: string; isEligible: boolean }) {
  const { token } = useShareToken();
  if (!isEligible || token == null) return null;
  const url = `${resolveOrigin()}/show/${slug}/${token}`;
  const path = `/show/${slug}/${token}`;
  return (
    <div
      data-testid="admin-show-share-chip"
      title={url}
      className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-text-subtle"
    >
      {/* svg link icon — copy exactly from page.tsx:561-573 */}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 text-text-subtle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <code className="min-w-0 truncate font-mono text-text-strong">{path}</code>
      <ShareLinkCopyButton url={url} compact />
    </div>
  );
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/ShareChip.tsx tests/components/ShareChip.test.tsx
git commit --no-verify -m "feat(crew-page): ShareChip header chip consumes ShareTokenProvider"
```

---

### Task 5: `CrewPageLink` ("Open crew page" consumer)

**Files:**
- Create: `app/admin/show/[slug]/CrewPageLink.tsx`
- Test: `tests/components/CrewPageLink.test.tsx`

**Interfaces:**
- Consumes: `useShareToken`, `resolveOrigin`.
- Produces: `CrewPageLink({ slug: string; isEligible: boolean })`.

- [ ] **Step 1: Write the failing test.** Provider-wrapped: (a) eligible+token → `admin-show-open-crew` anchor, `href` = full url, aria-label "Open crew page"; (b) `applyRotated` updates href; (c) ineligible or null token → nothing.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Copy the anchor from `page.tsx:693-707`, href from context:
```tsx
"use client";
import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";

export function CrewPageLink({ slug, isEligible }: { slug: string; isEligible: boolean }) {
  const { token } = useShareToken();
  if (!isEligible || token == null) return null;
  const url = `${resolveOrigin()}/show/${slug}/${token}`;
  return (
    <a
      data-testid="admin-show-open-crew"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open crew page"
      className="inline-flex min-h-tap-min items-center text-sm font-semibold text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      Open crew page →
    </a>
  );
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/CrewPageLink.tsx tests/components/CrewPageLink.test.tsx
git commit --no-verify -m "feat(crew-page): CrewPageLink consumes ShareTokenProvider"
```

---

### Task 6: `RotateShareTokenButton` → confirmation-only banner + `onRotated`

**Files:**
- Modify: `app/admin/show/[slug]/RotateShareTokenButton.tsx`
- Test: `tests/components/RotateShareTokenButton.test.tsx`

**Interfaces:**
- Produces: adds prop `onRotated?: (newToken: string, newEpoch: number) => void`; drops props `crewEmails`, `showTitle`.

- [ ] **Step 1: Update the failing test.** In `tests/components/RotateShareTokenButton.test.tsx`: remove assertions for `admin-rotate-share-token-url`, `-copy-button`, `-copy-announce`, `-email-note`, `-email-button`. Add:
```ts
// success (active) → confirmation only, no URL/Copy, onRotated(token,epoch)
const onRotated = vi.fn();
// mock rotateShareToken → { ok:true, new_share_token:"NEW", new_epoch: 9 }
// render with isCrewLinkActive, onRotated; two-tap confirm
expect(screen.getByTestId("admin-rotate-share-token-ok")).toBeInTheDocument();
expect(screen.queryByTestId("admin-rotate-share-token-url")).toBeNull();
expect(screen.queryByTestId("admin-rotate-share-token-copy-button")).toBeNull();
expect(onRotated).toHaveBeenCalledTimes(1);
expect(onRotated).toHaveBeenCalledWith("NEW", 9);
// {ok:false} → refused, onRotated NOT called
// {ok:true} + isCrewLinkActive=false → rotatedInactive, onRotated NOT called
```

- [ ] **Step 2: Run → FAIL.** `pnpm vitest run tests/components/RotateShareTokenButton.test.tsx`.

- [ ] **Step 3: Implement.** In `RotateShareTokenButton.tsx`:
  - Add `onRotated?: (newToken: string, newEpoch: number) => void`; remove `crewEmails`, `showTitle` from the props type + destructure.
  - In `onConfirmClick` success branch, after `setResult(r)`:
    ```ts
    if (r.ok) {
      if (isCrewLinkActive) onRotated?.(r.new_share_token, r.new_epoch);
      router.refresh();
    }
    ```
  - Replace the `newUrl` banner block (current ~lines 221-285) with a confirmation-only banner:
    ```tsx
    {result?.ok === true && isCrewLinkActive && (
      <div data-testid="admin-rotate-share-token-ok" role="status" aria-live="polite" className="w-full max-w-md rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong">
        <span aria-hidden="true" className="mr-1 font-semibold text-accent">✓</span>
        New share-link ready. The old link no longer works and everyone will re-pick their name — the updated link is shown above.
      </div>
    )}
    ```
  - Delete now-dead code: `onCopyClick`, `copied` state, `copyResetRef` + `clearCopyReset` + its cleanup in the unmount effect, `emailMailtos`, `newUrl` (the display use), the `buildCrewLinkMailtos` import, and the `Mail` import (grep the file first: `Mail` is used only by the removed email buttons — confirm before deleting). Keep `AlertTriangle`, `RotateCcw`.
  - Keep the `rotatedInactive` and `refused` branches and the whole confirm/cancel state machine unchanged.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/RotateShareTokenButton.tsx tests/components/RotateShareTokenButton.test.tsx
git commit --no-verify -m "feat(crew-page): rotate-success banner confirmation-only; onRotated(token,epoch)"
```

---

### Task 7: `ShareLinkBody` (card body consumer)

**Files:**
- Create: `app/admin/show/[slug]/ShareLinkBody.tsx`
- Test: `tests/components/ShareLinkBody.test.tsx`

**Interfaces:**
- Consumes: `useShareToken`, `resolveOrigin`, `buildCrewLinkMailtos`, `ShareLinkCopyButton`, `RotateShareTokenButton`.
- Produces: `ShareLinkBody({ slug, showId, crewEmails, showTitle, isCrewLinkActive, resetSlot })`.

- [ ] **Step 1: Write the failing test.** Provider-wrapped: (a) token → `admin-current-share-link-url` shows url, Copy present, email buttons per `crewEmails`; (b) token null → `admin-current-share-link-unavailable`, rotate still present; (c) empty `crewEmails` → no email buttons; (d) `resetSlot` rendered (pass a sentinel node); (e) driving rotate success updates the shown url (uses the real `RotateShareTokenButton` with `rotateShareToken` mocked + `router.refresh` no-op).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Port the token-present/null bodies from `CurrentShareLinkPanel.tsx:103-147` (URL `<code>`, `ShareLinkCopyButton`, email note/buttons, unavailable notice), reading `token` from context, and render the actions block:
```tsx
"use client";
import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { useShareToken } from "./ShareTokenContext";
import { resolveOrigin } from "./resolveOrigin";
import { buildCrewLinkMailtos } from "./crewLinkMailto";
import { ShareLinkCopyButton } from "./ShareLinkCopyButton";
import { RotateShareTokenButton } from "./RotateShareTokenButton";

export function ShareLinkBody({
  slug, showId, crewEmails = [], showTitle = "", isCrewLinkActive, resetSlot,
}: {
  slug: string; showId: string; crewEmails?: readonly string[]; showTitle?: string;
  isCrewLinkActive: boolean; resetSlot: ReactNode;
}) {
  const { token, applyRotated } = useShareToken();
  const url = token ? `${resolveOrigin()}/show/${slug}/${token}` : null;
  const emailMailtos = url ? buildCrewLinkMailtos({ emails: crewEmails, url, showTitle }) : [];
  return (
    <>
      {url ? (
        <>
          <div className="flex items-start gap-2">
            <code data-testid="admin-current-share-link-url" className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong">{url}</code>
            <ShareLinkCopyButton url={url} />
          </div>
          {emailMailtos.length > 1 && (
            <p data-testid="admin-current-share-link-email-note" className="text-xs text-text-subtle">
              Your crew list needs {emailMailtos.length} separate emails. Send each one; addresses go in Bcc.
            </p>
          )}
          {emailMailtos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {emailMailtos.map((m) => (
                <a key={m.batch} href={m.href} data-testid="admin-current-share-link-email-button" className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                  <Mail aria-hidden="true" size={14} />
                  {m.batchCount === 1 ? "Email this link to crew" : `Email this link to crew (${m.batch} of ${m.batchCount})`}
                </a>
              ))}
            </div>
          )}
        </>
      ) : (
        <p data-testid="admin-current-share-link-unavailable" role="status" className="text-sm text-text-subtle">
          The share-link is unavailable right now. Refresh the page; if the problem repeats, rotate to mint a new link.
        </p>
      )}
      <div className="flex flex-col divide-y divide-border border-t border-border">
        <RotateShareTokenButton
          showId={showId}
          slug={slug}
          isCrewLinkActive={isCrewLinkActive}
          onRotated={applyRotated}
          compact
          rowLabel="Rotate share link"
          rowDescription="Mint a new link; the old one stops working immediately."
        />
        {resetSlot}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/ShareLinkBody.tsx tests/components/ShareLinkBody.test.tsx
git commit --no-verify -m "feat(crew-page): ShareLinkBody card body consumes ShareTokenProvider"
```

---

### Task 8: `CurrentShareLinkPanel` delegates to `ShareLinkBody`

**Files:**
- Modify: `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`
- Test: `tests/components/CurrentShareLinkPanel.test.tsx`

**Interfaces:**
- Produces: `CurrentShareLinkPanel({ slug, showId, crewEmails, showTitle, isCrewLinkActive?, resetSlot? })` — server component; drops `token`/`actions` props; no longer imports `loadShowShareToken`.

- [ ] **Step 1: Update the failing test.** Wrap renders in `ShareTokenProvider`. Assert the panel renders chrome + `<h3>Current share-link</h3>` + the description, and the `ShareLinkBody` content (URL via provider token, Copy, unavailable branch) plus the `resetSlot`. Remove `token`/`actions`-prop and self-read assertions.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.** Reduce the panel to chrome + delegation:
```tsx
import type { ReactNode } from "react";
import { ShareLinkBody } from "./ShareLinkBody";

export function CurrentShareLinkPanel({
  slug, showId, crewEmails = [], showTitle = "", isCrewLinkActive = true, resetSlot,
}: {
  slug: string; showId: string; crewEmails?: readonly string[]; showTitle?: string;
  isCrewLinkActive?: boolean; resetSlot?: ReactNode;
}) {
  return (
    <div data-testid="admin-current-share-link-panel" className="flex w-full max-w-md flex-col gap-2 rounded-sm border border-border bg-surface p-tile-pad">
      <h3 className="text-sm font-semibold text-text-strong">Current share-link</h3>
      <p className="text-xs text-text-subtle">Send this URL to the crew. Rotate to mint a new one if it leaks.</p>
      <ShareLinkBody slug={slug} showId={showId} crewEmails={crewEmails} showTitle={showTitle} isCrewLinkActive={isCrewLinkActive} resetSlot={resetSlot} />
    </div>
  );
}
```
Remove the `loadShowShareToken`, `resolveOrigin`, `buildCrewLinkMailtos`, `ShareLinkCopyButton`, `Mail` imports now unused (grep to confirm). The panel is no longer `async`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit.**
```bash
git add app/admin/show/[slug]/CurrentShareLinkPanel.tsx tests/components/CurrentShareLinkPanel.test.tsx
git commit --no-verify -m "refactor(crew-page): CurrentShareLinkPanel delegates to ShareLinkBody"
```

---

### Task 9: Wire `page.tsx` (provider, chip, link, panel, atomic read)

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx`
- Test: `tests/app/admin/perShowPage.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`

**Interfaces:**
- Consumes: `ShareTokenProvider`, `ShareChip`, `CrewPageLink`, updated `CurrentShareLinkPanel`, `loadShowShareToken` (`{token,epoch}`).

- [ ] **Step 1: Update the failing tests.** In `tests/app/admin/perShowPage.test.tsx`: update the `loadShowShareToken` mock (line ~117) to return `{ token, epoch }`; update the `CurrentShareLinkPanel` mock (line ~55) to the new prop shape (no `token`/`actions`; `resetSlot`/`isCrewLinkActive`); if the test asserts on the header chip / open-crew link, keep those testids (`admin-show-share-chip`, `admin-show-open-crew`) — they now come from `ShareChip`/`CrewPageLink` under the real provider. In `per-show-lifecycle.test.tsx`, update any share-token/panel assertions similarly. Run first to see the failures.

- [ ] **Step 2: Run → FAIL.** `pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/components/admin/per-show-lifecycle.test.tsx`.

- [ ] **Step 3: Implement page wiring.**
  - Add `picker_epoch` to the show `.select(...)` (`page.tsx:175`) and to `ShowLookupRow` (`page.tsx:83`).
  - Change `readToken` to return `{ token, epoch }` from the updated loader; on catch, `{ token: null, epoch: show.picker_epoch ?? 1 }` (best-effort epoch baseline). Update the `Promise.all` destructure (`token` → `{ token, epoch: tokenEpoch }` or read `.token`/`.epoch`).
  - Compute `const initialEpoch = tokenEpoch;` (from the atomic read; the catch fallback uses `show.picker_epoch`).
  - Import `ShareTokenProvider`, `ShareChip`, `CrewPageLink`. Remove the `RotateShareTokenButton` import.
  - Wrap the returned `<main>…</main>` in `<ShareTokenProvider key={show.id} initialToken={isShowEligibleForCrewLink ? token : null} initialEpoch={initialEpoch}> … </ShareTokenProvider>`.
  - Replace the `chip` variable's inline JSX (555-577) with `const chip = <ShareChip slug={show.slug} isEligible={isShowEligibleForCrewLink} />;` (still passed to `AdminPageHeader rightSlot={chip}`; `ShareChip` returns null when hidden).
  - Replace the inline "Open crew page" anchor block (693-707) with `<CrewPageLink slug={show.slug} isEligible={isShowEligibleForCrewLink} />`. Delete the surrounding `{hasCrewLinkUrl && crewUrl ? (…) : null}` wrapper (the component self-gates).
  - Update the `<CurrentShareLinkPanel>` call (813-838): remove `token` and `actions`; add `isCrewLinkActive={isShowEligibleForCrewLink}` and `resetSlot={<PickerResetControl showId={show.id} crew={crew} />}`.
  - Remove the now-unused server derivations `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` IF nothing else uses them (grep the file after editing; the crew-link chip/anchor were their only consumers). Keep `isShowEligibleForCrewLink`. Remove `ShareLinkCopyButton` import if no longer used directly in page.tsx.

- [ ] **Step 4: Run → PASS.** `pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/components/admin/per-show-lifecycle.test.tsx`.

- [ ] **Step 5: Build gate (RSC boundary).** `pnpm build` (Server→Client wiring + provider-wraps-server-children only fails at `next build`, per project lessons). Expected: success. Fix any client/server import boundary issues.

- [ ] **Step 6: Commit.**
```bash
git add app/admin/show/[slug]/page.tsx tests/app/admin/perShowPage.test.tsx tests/components/admin/per-show-lifecycle.test.tsx
git commit --no-verify -m "feat(crew-page): wire ShareTokenProvider + ShareChip/CrewPageLink/panel in per-show page"
```

---

### Task 10: Integration tests — instant-update (real consumers) + inactive-token exposure

**Files:**
- Create: `tests/components/shareTokenInstantUpdate.test.tsx`
- Create/Modify: inactive-token-exposure case in `tests/app/admin/perShowPage.test.tsx` (or a dedicated file)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the load-bearing instant-update test** (spec §6.2). One provider, real `ShareChip` + `CrewPageLink` + `ShareLinkBody` together, `initialToken="OLD"`, `initialEpoch=5`. Mock `@/lib/auth/picker/rotateShareToken` → `{ ok:true, new_share_token:"NEW", new_epoch:6 }`; mock `next/navigation` `router.refresh` no-op; mock `navigator.clipboard.writeText`.
```tsx
// assert OLD everywhere first: card url text, chip title/code, crew href
// click each Copy → clipboard called with a URL containing OLD
// drive rotate two-tap confirm
// assert OLD appears NOWHERE (queryAllByText + href/title scan), all show NEW,
// and clicking each Copy now writes a URL containing NEW
```
Concretely for copy targets: after rotate, click `admin-current-share-link-copy-button` (scope to the card container) and the chip's copy button; assert `navigator.clipboard.writeText` last-called with the NEW url each time.

- [ ] **Step 2: Run → FAIL** (until all wiring present — it should PASS now given Tasks 3–9; if red, fix the surface it exposes).

- [ ] **Step 3: Write the inactive-token-exposure test** (spec §6.6). Render the real page (perShowPage harness) for an ineligible show (`published:false`) whose `loadShowShareToken` mock returns a real token + epoch. Assert the token string does NOT appear anywhere in the rendered output (`container.innerHTML` scan) — the provider seed is `null` when ineligible.

- [ ] **Step 4: Run → PASS both.** `pnpm vitest run tests/components/shareTokenInstantUpdate.test.tsx tests/app/admin/perShowPage.test.tsx`.

- [ ] **Step 5: Commit.**
```bash
git add tests/components/shareTokenInstantUpdate.test.tsx tests/app/admin/perShowPage.test.tsx
git commit --no-verify -m "test(crew-page): instant-update across real A/B/C consumers + inactive-token non-exposure"
```

---

### Task 11: Impeccable dual-gate (invariant 8)

**Files:** the UI diff (all `app/admin/show/[slug]/*` + `page.tsx`).

- [ ] **Step 1: Run `/impeccable critique`** on the diff (per its v3 preflight gates: PRODUCT.md → DESIGN.md → register → preflight). Record findings.
- [ ] **Step 2: Run `/impeccable audit`** on the diff. Record findings.
- [ ] **Step 3: Triage.** Fix HIGH/CRITICAL inline (with tests if behavior changes). Anything deferred → a `DEFERRED.md` entry with rationale. Record dispositions for the milestone handoff §12.
- [ ] **Step 4: Commit** any fixes:
```bash
git add -A && git commit --no-verify -m "fix(crew-page): impeccable critique/audit dispositions"
```

---

### Task 12: Full verification + close-out

- [ ] **Step 1: Full suite.** `pnpm test` (scoped gates miss cross-file regressions). Expected: green.
- [ ] **Step 2: Typecheck.** `pnpm typecheck` (or the project's `quality` tsc). Green.
- [ ] **Step 3: Lint + format.** `pnpm lint` and `pnpm format:check` (CI `quality` runs both; `--no-verify` skipped the hooks). Fix canonical-Tailwind/prettier issues.
- [ ] **Step 4: Build.** `pnpm build`. Green (RSC boundary + provider wrapping).
- [ ] **Step 5: Validation parity.** Confirm the migration was applied to the validation project (Task 1 Step 7) and the manifest is committed; the `validation-schema-parity` job will assert it.
- [ ] **Step 6: Confirm no meta-test regressions.** `pnpm vitest run tests/auth/_metaInfraContract.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` (should be unaffected — no auth-helper or mutation surface added). Green.
- [ ] **Step 7: Commit** any lint/format fixups; ensure the tree is clean.

---

## Self-review notes (author)

- **Spec coverage:** §3.0 → T1/T2; §3.2 → T3; §3.3 A/B → T4/T5; §3.4 → T7; §3.5 → T6; §3.6 → T8; §3.7 → T9; §6.1 → T3; §6.2 → T10; §6.3 → T4/T5/T7; §6.4 → T1/T2; §6.5 → T6; §6.6 → T10; §6.7 → T8/T9; §7 invariants → T11/T12.
- **Type consistency:** loader `{token,epoch}` (T2) matches page read (T9) + provider seed props `initialToken/initialEpoch` (T3/T9); `onRotated(newToken,newEpoch)` (T6) matches `applyRotated(token,epoch)` (T3) wired in T7.
- **Ordering/deps:** T1→T2; T3 before T4/T5/T7/T9; T6 before T7; T7 before T8; T8+T2 before T9; T3–T9 before T10; UI tasks before T11; T11 before T12.
- **Anti-tautology:** T10 asserts OLD absent across text/href/title/copy-target (not a container that renders both); T3 stale-reject is order-independent; DB test T1 asserts epoch strictly increases after a real rotate (derived from live rotation, not hardcoded).
