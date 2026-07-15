# Share-link instant-rotate + success-banner dedup — design

**Date:** 2026-07-10 · **rev 12** (post Codex R11; user chose "do it right" → sound instant update via atomic epoch)
**Scope:** Admin per-show page share-link surfaces + the admin token-read RPC. UI + a token-read RPC/DB change (return the token's epoch atomically). No advisory-lock change, no mutation-surface change.

---

## 1. Problem

After rotating the share link on the admin per-show page (`app/admin/show/[slug]/page.tsx`) the UI shows the **same URL twice with two Copy buttons**: the persistent `CurrentShareLinkPanel` (URL + `ShareLinkCopyButton` + email buttons) and the `RotateShareTokenButton` success banner (an identical URL + Copy + email). Screenshot `scratchpad/shots/11-post-rotate-success.png`. Redundant.

### 1.1 Token-derived surfaces (root cause)

Every crew-URL surface renders from a single server-read `token` (`page.tsx:294-387` admin RPC → `page.tsx:495-498` derives `crewUrl`):

| # | Surface | Location | Copy? |
|---|---|---|---|
| A | Header share chip | `page.tsx:555-577` (`admin-show-share-chip`) — `ShareLinkCopyButton url={crewUrl}` | **yes** |
| B | "Open crew page" link | `page.tsx:693-707` (`admin-show-open-crew`) — `<a href={crewUrl}>` | no (nav) |
| C | Current-share-link card | `CurrentShareLinkPanel` → URL + `ShareLinkCopyButton` + email | **yes** |
| D | Rotate-success banner | `RotateShareTokenButton` — URL + Copy + email (the redundant duplicate) | **yes** |

A/B/C are Server-Component-fed; they update only after `router.refresh()` completes. On rotate, banner D shows the new URL instantly then `router.refresh()` re-renders A/B/C. Banner D carries its own URL to cover the **refresh-lag window** where A/C still show the OLD (dead) token with a live Copy button. Removing D's URL naively (leaving A/C refresh-only) just moves that hazard (Codex R1).

### 1.2 Why "sound instant update" needs an epoch (the 11-round result)

Making A/B/C update instantly from a client token cache is only safe if the cache can **order** token versions. A value-only cache cannot distinguish a *stale* refresh (a `router.refresh()` that started with the OLD token and resolves late — the admin page mounts many independent `router.refresh()` callers: `ReSyncButton` `components/admin/ReSyncButton.tsx:107`, `PublishedToggle` `components/admin/PublishedToggle.tsx:107`, `ArchiveShowButton`, `ParsePanel`, pending-panel buttons, nav badge hooks) from a *newer* token (another admin's rotation, or the token rotation that `archive_show`/`unarchive_show` perform). Rejecting "anything ≠ my token" reverts to the dead link on external rotation (Codex R11); accepting "any non-null" reverts to the dead link on a stale refresh (Codex R9). The clean resolution is a **monotonic epoch**: `shows.picker_epoch` is bumped atomically by every token rotation (`rotate_show_share_token`, `archive_show`, `unarchive_show` — all `picker_epoch = picker_epoch + 1`; `reset_picker_epoch_atomic` too), so "accept iff epoch ≥ mine" is total and order-independent. The keystone is reading the token **and** its epoch from **one atomic DB snapshot** (§3.0) — a value the rotate result already returns (`new_epoch`), but the initial read must also provide.

## 2. Goal

- **Single, instant, SOUND source of truth** for the crew URL across A/B/C: a client token+epoch cache, updated instantly by this admin's own rotate, and reconciled with every server refresh by a monotonic epoch gate so that **no ordering of refreshes/rotations can leave a copy surface showing a dead token** — same-tab (stale refresh) OR multi-admin (external rotation) OR lifecycle (archive/unarchive rotate the token).
- Rotate success banner D becomes **confirmation-only** (no URL/Copy/email), safe because A/C update instantly.
- **No regression** vs today's server-render on external rotation: a `router.refresh()` after another admin rotates carries a higher epoch → accepted (surfaces update), same as today.

Non-goals: no change to `rotateShareToken` (the mutating action), its telemetry, or the advisory lock. No realtime subscription (freshness still requires *a* refresh to fire; the epoch just makes whatever refresh arrives correct). No visual redesign beyond removing the duplicated block.

## 3. Approach (A-solid + atomic epoch)

### 3.0 Atomic token+epoch read (the keystone DB/RPC change)

The admin token-read RPC currently returns only the token (`supabase/migrations/20260523000010_admin_read_share_token.sql`: `returns text`, reads `show_share_tokens`). Change it to return the token **and** the show's `picker_epoch` from one snapshot.

**New migration** `supabase/migrations/2026071x_admin_read_share_token_with_epoch.sql`:
```sql
drop function if exists public.admin_read_share_token(uuid);
create function public.admin_read_share_token(p_show_id uuid)
  returns table(share_token text, picker_epoch int)
  language sql stable security definer
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
- `left join` so `picker_epoch` returns even when no token row exists; token stays `is_admin()`-gated (unchanged trust boundary). `picker_epoch` is a non-secret rotation counter (`int not null default 1`, `supabase/migrations/20260523000001_picker_epoch_columns.sql:7`); returning it to an authenticated admin is not an exposure. Return type mirrors `rotate_show_share_token` (`returns table(new_share_token text, new_epoch int)`).
- **Migration lifecycle:** `drop ... if exists` + `create` is apply-twice idempotent; the only in-repo `.rpc("admin_read_share_token")` caller is `lib/data/loadShowShareToken.ts` (verified), updated in the same PR, so the return-type change has no orphaned caller. DB tests `tests/db/admin_read_share_token.test.ts`, `tests/db/_b2Helpers.ts`, `tests/data/loadShowShareToken.test.ts` are updated for the row shape.
- **Validation parity (AGENTS.md):** apply locally + test; `pnpm gen:schema-manifest` + commit the manifest; apply the migration surgically to the validation project (`supabase db query --linked` / `psql "$TEST_DATABASE_URL"`), then `notify pgrst, 'reload schema'`. The `validation-schema-parity` gate enforces this.

**`lib/data/loadShowShareToken.ts`** → returns `{ token: string | null; epoch: number }`. A `RETURNS TABLE` RPC yields an array; destructure `{ data, error }` (invariant 9 — call-boundary discipline: distinguish returned-error from thrown), take `row = Array.isArray(data) ? data[0] : data`, `token = typeof row?.share_token === "string" ? row.share_token : null`, `epoch = Number.isFinite(row?.picker_epoch) ? Number(row.picker_epoch) : 1`. A thrown/`error` path still throws (page-level try/catch maps to `token=null`, fail-closed — unchanged).

### 3.1 Component structure after

| Component | Kind | Responsibility |
|---|---|---|
| `page.tsx` | server | Reads `{token, epoch}` (atomic RPC). Wraps returned content in `<ShareTokenProvider key={show.id} initialToken={isShowEligibleForCrewLink ? token : null} initialEpoch={epoch}>`. Replaces inline chip (A) with `<ShareChip>`, crew-page anchor (B) with `<CrewPageLink>`. Renders `<CurrentShareLinkPanel>` (C) with structured props + server-built `resetSlot`. |
| **`ShareTokenContext.tsx` (NEW)** | client | `ShareTokenProvider` owns `{token, epoch}` state; **monotonic-epoch-gated** sync (accept iff `serverEpoch ≥ local`); `applyRotated(token, epoch)`; `useShareToken()` → `{ token, applyRotated }`. Show-scoped via caller `key={show.id}`. |
| **`ShareChip.tsx` (NEW)** | client | Header chip (A). Props `slug`, `isEligible`. Reads `token`; renders chip-or-null (`isEligible && token != null`). Keeps `admin-show-share-chip`. |
| **`CrewPageLink.tsx` (NEW)** | client | Crew-page link (B). Props `slug`, `isEligible`. Reads `token`; `<a href>` or null. Keeps `admin-show-open-crew`, `target="_blank" rel="noreferrer"`, aria-label "Open crew page", classes. |
| **`ShareLinkBody.tsx` (NEW)** | client | Card body (C). Reads `token`. URL/Copy/email (token) or unavailable (null); hosts `RotateShareTokenButton` (wired `onRotated`) + `resetSlot`. |
| `CurrentShareLinkPanel.tsx` | server | Card chrome + heading; renders `<ShareLinkBody …/>`. Drops `token`/`actions`; gains `resetSlot`, `isCrewLinkActive`. |
| `RotateShareTokenButton.tsx` | client | Two-tap confirm + rotate. Success → `onRotated?.(newToken, newEpoch)` (gated §3.5) + `router.refresh()` backstop. Banner confirmation-only. |
| `ShareLinkCopyButton`, `PickerResetControl`, `crewLinkMailto`, `resolveOrigin` | unchanged | Reused; all client-safe. |

### 3.2 `ShareTokenContext` (new client module)

```ts
"use client";
// Consumers read `token`. `applyRotated(token, epoch)` installs the token THIS
// admin's rotate minted (atomic from the rotateShareToken result). Every update —
// server refresh AND rotate — is gated by the monotonic epoch (shows.picker_epoch,
// bumped by every rotation), so an out-of-order stale payload can never overwrite a
// newer token and a genuinely newer token (external rotation, lifecycle) is accepted.
type Ctx = { token: string | null; applyRotated: (token: string, epoch: number) => void };
const ShareTokenContext = createContext<Ctx | null>(null);

export function ShareTokenProvider({
  initialToken,
  initialEpoch,
  children,
}: { initialToken: string | null; initialEpoch: number; children: ReactNode }) {
  const [state, setState] = useState({ token: initialToken, epoch: initialEpoch });

  const applyRotated = useCallback(
    (token: string, epoch: number) => setState((p) => (epoch >= p.epoch ? { token, epoch } : p)),
    [],
  );

  useEffect(() => {
    setState((p) => {
      if (initialEpoch < p.epoch) return p; // stale refresh — reject (R9-1, order-independent)
      if (initialToken === null) {
        // Server says "no token" at initialEpoch (>= p.epoch).
        // If the epoch STRICTLY advanced, the null is authoritative (show went
        // ineligible / token genuinely absent at a newer generation) → FAIL CLOSED.
        // If SAME epoch, it is a transient read fault on the current generation
        // (an external rotation would have bumped the epoch) → keep the token (R7-2/R9-2).
        return initialEpoch > p.epoch ? { token: null, epoch: initialEpoch } : p;
      }
      return { token: initialToken, epoch: initialEpoch };
    });
  }, [initialToken, initialEpoch]);

  return <ShareTokenContext.Provider value={{ token: state.token, applyRotated }}>{children}</ShareTokenContext.Provider>;
}

export function useShareToken(): Ctx {
  const ctx = useContext(ShareTokenContext);
  if (!ctx) throw new Error("useShareToken must be used within ShareTokenProvider");
  return ctx;
}
```

**Why the epoch gate is total (covers R7/R9/R10/R11).** `picker_epoch` strictly increases on every token rotation. Enumerated:
- **Same-tab stale refresh (R9-1):** rotate → `{NEW, e2}`; a `ReSyncButton`/etc. refresh that started with OLD resolves late as `{OLD, e1}`, `e1 < e2` → **rejected**, any arrival order. The atomic read (§3.0) means the pair is never mismatched (fixes R7-1).
- **Transient null, same epoch (R7-2):** `{NEW, e2}` held; a refresh with a token-read fault returns `{null, e2}` (epoch unchanged) → `e2 > e2` false → **keep NEW**.
- **Fail-closed null, newer epoch (R9-2):** show archived/unpublished → `{null, e3}`, `e3 > e2` → **fail closed** (hide). A cached token is only preserved when the epoch did NOT advance (proof it wasn't rotated away).
- **Lifecycle rotate (R10):** `archive_show`/`unarchive_show` rotate the token AND bump epoch; the eligibility-gated seed makes `initialToken=null` while ineligible, `initialEpoch` advances → fail closed + hidden; re-publish delivers `{T_new, e_new}` (`e_new ≥ local`) → accepted. No separate latch/eligibility hack needed — the epoch subsumes it.
- **External rotation (R11):** another admin rotates → `picker_epoch` advances; this tab's next refresh delivers `{NEW2, e3}`, `e3 > e2` → **accepted** (surfaces update) — same as today's server render, no regression.

**Show-identity scoping (R8).** On App Router client nav between shows, the same provider type can reconcile without remounting, leaking show A's `{token,epoch}` into show B. `page.tsx` renders the provider with **`key={show.id}`** → show-identity change remounts, re-seeding state from B's props. Same-show refresh (same key) does not remount. The provider wraps server-rendered children (standard RSC pattern; no server code enters the client bundle).

### 3.3 Consumers A / B / C

Each derives its URL client-side from context `token` + props: `url = token ? ${resolveOrigin()}/show/${slug}/${token} : null`; visibility `isEligible && token != null` (`isEligible = isShowEligibleForCrewLink`, serializable prop). **A `ShareChip`** — markup identical to `page.tsx:555-577`. **B `CrewPageLink`** — anchor identical to `page.tsx:693-707`. **C `ShareLinkBody`** — §3.4. `page.tsx` no longer derives `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` for A/B (verified only A/B use them); still computes `isShowEligibleForCrewLink`.

### 3.4 `ShareLinkBody` (card body, new client)

Props: `slug`, `showId`, `crewEmails: readonly string[]`, `showTitle`, `isCrewLinkActive: boolean`, `resetSlot: ReactNode`. Reads `{ token, applyRotated } = useShareToken()`.
- **token present** → `url`; `<code data-testid="admin-current-share-link-url">{url}</code>` + `<ShareLinkCopyButton url={url}/>` + email note/buttons via `buildCrewLinkMailtos` (testids `admin-current-share-link-email-note`, `-email-button`).
- **token null** → unavailable notice (`admin-current-share-link-unavailable`).
- **Always** → divider actions (`border-t divide-y`): `<RotateShareTokenButton showId slug isCrewLinkActive onRotated={applyRotated} compact rowLabel="Rotate share link" rowDescription="Mint a new link; the old one stops working immediately."/>` then `{resetSlot}`.

### 3.5 `RotateShareTokenButton` changes

- **Add** prop **`onRotated?: (newToken: string, newEpoch: number) => void`** — single canonical signature. Both fields already exist on the result (`{ ok:true; new_share_token:string; new_epoch:number }`, `RotateShareTokenButton.tsx:32` / `lib/auth/picker/rotateShareToken.ts:12`) — **no rotate-action change**.
- **Success branch** (after `setResult(r)`): call `onRotated?.(r.new_share_token, r.new_epoch)` **only when `r.ok && isCrewLinkActive`** (inactive success must not surface a copyable URL). Then `router.refresh()` on any `r.ok` (backstop). `{ok:false}` → no `onRotated`.
- **Banner → confirmation-only:** `✓ New share-link ready. The old link no longer works and everyone will re-pick their name — the updated link is shown above.` Keep `data-testid="admin-rotate-share-token-ok"`, `role="status"`, `aria-live="polite"`.
- **Remove** the URL `<code>` + Copy + email note/buttons + sr-only copy-announce. **Delete dead code:** `onCopyClick`, `copied`, `copyResetRef`+`clearCopyReset`+cleanup, `emailMailtos`, `newUrl`-for-display, `buildCrewLinkMailtos` import, `Mail` import (verify no other use).
- **Drop props** `crewEmails`, `showTitle`.
- **Keep** `rotatedInactive` (`admin-rotate-share-token-ok-inactive`), `refused` (`admin-rotate-share-token-refused`), the two-tap state machine, `AUTO_REVERT_MS`, aria wiring, compact/rowLabel, `isCrewLinkActive`.

### 3.6 `CurrentShareLinkPanel` changes

Keep card chrome + `<h3>Current share-link</h3>` + description. Body → `<ShareLinkBody slug showId crewEmails showTitle isCrewLinkActive resetSlot/>`. **Props:** remove `token?`, `actions?`; add `resetSlot?: ReactNode`, `isCrewLinkActive?: boolean` (default true). Keep `slug, showId, crewEmails, showTitle`. Still a Server Component; token now flows from context. Drops its `loadShowShareToken` self-read import.

### 3.7 `page.tsx` changes

- Read `{token, epoch}` via the updated `loadShowShareToken` (still in the existing `Promise.all` wave; `readToken` returns both, `catch → {token:null, epoch:?}`; on a thrown read, seed `initialEpoch` from a best-effort `show.picker_epoch` — add `picker_epoch` to the show `.select` (`page.tsx:175`) + `ShowLookupRow`, used only as the epoch fallback when the RPC throws so the gate still has a baseline).
- Wrap the returned JSX in `<ShareTokenProvider key={show.id} initialToken={isShowEligibleForCrewLink ? token : null} initialEpoch={epoch}> … </ShareTokenProvider>`. **Eligibility-gate the token seed** (R4-1: an ineligible show's token is not serialized to the client; epoch is non-secret and always seeded).
- Replace inline chip (555-577) with `<ShareChip slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`; inline crew anchor (693-707) with `<CrewPageLink slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`.
- `<CurrentShareLinkPanel>` (813-838): remove `token`, `actions`; add `isCrewLinkActive={isShowEligibleForCrewLink}`, `resetSlot={<PickerResetControl showId={show.id} crew={crew}/>}`.
- Remove now-unused `RotateShareTokenButton` import; drop server `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` if no residual use (verify); keep `ShareLinkCopyButton` import only if still used directly (verify).

## 4. Guard conditions

| Input | edge | Behavior |
|---|---|---|
| context `token` | `null` | A/B hidden, C unavailable; rotate+reset still render. |
| server refresh | `epoch < local` (stale) | **rejected** — keep current token (R9-1), any arrival order. |
| server refresh | `epoch ≥ local`, non-null token | applied → A/B/C update. |
| server refresh | `null` token, **same epoch** (transient read fault) | **ignored** — keep current token (R7-2). |
| server refresh | `null` token, **epoch advanced** (ineligible / genuine absence) | **fail closed** — `token=null`, surfaces hide (R9-2). |
| lifecycle: rotate→archive→unarchive→publish | archive/unarchive bump epoch + rotate token | epoch advances each step; re-publish token accepted (R10). |
| external rotation (other admin) | this tab refreshes | delivered epoch > local → accepted; no regression (R11). |
| navigation to a different show | `show.id` changes | provider `key` remounts → fresh seed; no cross-show token leak (R8). |
| rotate `result` | `{ok:false}` | `refused`; token unchanged; no `onRotated`. |
| rotate `result` | `{ok:true}` & `!isCrewLinkActive` | `rotatedInactive`; no `onRotated`. |
| rotate `result` | `{ok:true}` & `isCrewLinkActive` | `onRotated(new_share_token, new_epoch)` → `applyRotated` (epoch-gated) → A/B/C instant. |
| `crewEmails` | `[]` / 1 | no email buttons / single button no batch note. |
| `useShareToken` | outside provider | throws. |

## 5. Transition inventory

Rotate button states `idle`(±banner)/`confirm`/`resolving` — unchanged except banner content. No `AnimatePresence`; all swaps instant. A/B/C URL updates are instant text/attr swaps.

## 6. Testing

TDD per task (invariant 1). Anti-tautology per project rules.

### 6.1 New — `tests/components/ShareTokenContext.test.tsx` (the sync-gate proof)
- Seed `{token:"OLD", epoch:5}`; `applyRotated("NEW", 6)` → consumers show NEW.
- **Stale reject (R9-1):** after the above, re-render `initialToken="OLD", initialEpoch=5` (stale refresh landing late) → **still NEW**. Also with the stale re-render arriving *after* a `{"NEW",6}` echo → still NEW (order-independent).
- **Newer accept / external rotation (R11):** seed `{OLD,5}`; re-render `{"NEW2",7}` → shows NEW2.
- **Transient null same epoch (R7-2):** `{"OLD",5}` then `applyRotated("NEW",6)`; re-render `initialToken=null, initialEpoch=6` → still NEW.
- **Fail-closed null newer epoch (R9-2):** `{"TOK",5}`; re-render `initialToken=null, initialEpoch=6` → surfaces hide (not TOK).
- **Lifecycle (R10):** `{"OLD",5}` → `applyRotated("NEW",6)`; re-render `initialToken=null,initialEpoch=7` (archived) → hidden; then `initialToken="T3",initialEpoch=8` (re-published, lifecycle-rotated) → shows T3, never NEW.
- **Show-identity (R8):** `<Provider key="A" initialToken="TA" initialEpoch=5>` (TA) → re-render `key="B" initialToken={null} initialEpoch=1` → neither TA nor `/show/…/TA`; `key="B" initialToken="TB" initialEpoch=1` → TB (a LOWER epoch is fine across a remount — fresh mount, no prior state).
- `useShareToken` outside provider throws.

### 6.2 New — `tests/components/shareTokenInstantUpdate.test.tsx` (load-bearing, real consumers)
- One `<ShareTokenProvider initialToken="OLD" initialEpoch={5}>` wrapping the **actual** `<ShareChip>`, `<CrewPageLink>`, AND `<ShareLinkBody>` together (no stand-ins). Assert every surface exposes `OLD` (card `admin-current-share-link-url` + its Copy target via mocked `navigator.clipboard.writeText`, chip `admin-show-share-chip` title/code/copy, `CrewPageLink` href).
- Drive `RotateShareTokenButton` success (`rotateShareToken` mocked `{ok:true,new_share_token:"NEW",new_epoch:6}`, `router.refresh` mocked no-op). Assert `OLD` appears **nowhere** (text/href/title/copy target) and every surface shows `NEW`. Catches any surface left server-fed/refresh-only.

### 6.3 New — `tests/components/ShareLinkBody.test.tsx`, `ShareChip.test.tsx`, `CrewPageLink.test.tsx`
- Body: token→URL/Copy/email; null→unavailable + rotate reachable; empty `crewEmails`→no email; `resetSlot` rendered. Chip/link: visibility gate `isEligible && token!=null`; url/href from context; update on `applyRotated`.

### 6.4 New/Update — DB + loader for the atomic read
- `tests/data/loadShowShareToken.test.ts`: RPC returns a row `{share_token, picker_epoch}`; loader returns `{token, epoch}`; array-shaped `data` handled; `error`/thrown → throws; missing token row → `{token:null, epoch>=1}`.
- `tests/db/admin_read_share_token.test.ts` + `tests/db/_b2Helpers.ts`: assert the RPC returns token + `picker_epoch`, admin-gated token, epoch present for a tokenless show (left join), epoch tracks after a rotate (`picker_epoch` bumped).

### 6.5 Update — `tests/components/RotateShareTokenButton.test.tsx`
- Remove `-url`/`-copy-button`/`-copy-announce`/`-email-note`/`-email-button` assertions. Success(active) → `admin-rotate-share-token-ok`, confirmation copy, **no URL/Copy**; `onRotated` called once with `(new_share_token, new_epoch)` (assert both). `{ok:false}`→`refused`, no `onRotated`. inactive-success→`rotatedInactive`, no `onRotated`.

### 6.6 New — inactive-token-exposure (`tests/app/admin/perShowPage.test.tsx` or dedicated)
- Ineligible show whose server read returns a real token → the token string is **absent** from rendered client output / provider payload (`isShowEligibleForCrewLink ? token : null`) (R4-1).

### 6.7 Update — `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/app/admin/perShowPage.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/app/admin/rotateShareToken.test.tsx`
- Wrap subtrees in `ShareTokenProvider` (with `initialEpoch`); fix panel prop shape (`resetSlot`/`isCrewLinkActive`, no `token`/`actions`); fix removed rotate-banner URL/Copy assertions; chip/link read from provider-seeded token; update any `loadShowShareToken` mock to the `{token, epoch}` shape.

## 7. Invariants / contracts

- **Inv 1 TDD**, **Inv 5** (refused copy is static prose — unaffected).
- **Inv 8 impeccable dual-gate:** UI surfaces changed → `/impeccable critique` + `/impeccable audit` on the diff before close-out.
- **Inv 9 Supabase call-boundary:** the updated `loadShowShareToken` destructures `{data, error}`, distinguishes thrown vs returned error (unchanged posture, new row shape).
- **Inv 10 telemetry:** no mutation surface added/changed; the token-read RPC is a read; `rotateShareToken` untouched.
- **Security:** token read stays server-side + `is_admin()`-gated; eligibility-gated seed (R4-1) + `key={show.id}` (R8) keep the token from serializing when ineligible or crossing shows. `picker_epoch` is a non-secret counter.
- **DB / validation parity:** migration applied locally + validation project + `pnpm gen:schema-manifest` committed, all in this PR (`validation-schema-parity` gate). Migration touches only `public.admin_read_share_token` (read RPC); no table DDL, no CHECK/enum, no advisory-lock surface.
- **Meta-test inventory:** none created/extended (no new Supabase call-boundary helper subject to `_metaInfraContract` — `loadShowShareToken` is a data loader, not an auth helper; no advisory lock, admin-alert catalog, or tile-sentinel surface). Declared per writing-plans rule.

## 8. Out of scope

- `rotateShareToken` action / advisory lock / epoch bump logic (already correct).
- Realtime push (freshness still needs a refresh to fire; epoch makes the arriving refresh correct — a realtime `picker_epoch` subscription remains a possible future enhancement, not built here).
- Crew-facing routes; help MDX (`app/help/admin/sharing-links`) — verify copy still accurate, no behavior change.
- Any surface not derived from the show share `token`.
