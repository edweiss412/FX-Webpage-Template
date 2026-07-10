# Share-link instant-rotate + success-banner dedup — design

**Date:** 2026-07-10
**Status:** Draft (brainstorming → spec) · rev 2 (post Codex R1)
**Scope:** Admin per-show page share-link surfaces. UI-only refactor. No DB, no advisory-lock, no server-action signature change.

---

## 1. Problem

On the admin per-show page (`app/admin/show/[slug]/page.tsx`), after rotating the share link the UI shows the **same URL twice with two Copy buttons**:

1. The persistent **`CurrentShareLinkPanel`** (top of the "Share & access" card) — URL + `ShareLinkCopyButton` + "Email this link to crew" buttons.
2. The **`RotateShareTokenButton`** post-rotate **success banner** — an identical URL + Copy button + "Email crew" buttons.

Screenshot: `scratchpad/shots/11-post-rotate-success.png`. Both blocks render the identical new URL, stacked ~2 rows apart. Redundant.

### 1.1 Token-derived surfaces on the page (root cause)

Every crew-URL surface renders from a single server-read `token` (`page.tsx:294-387`, admin-only `loadShowShareToken` RPC → `page.tsx:495-498` derives `hasCrewLinkUrl` / `crewUrl` / `crewPathDisplay`):

| # | Surface | Location | Kind | Copy? |
|---|---|---|---|---|
| A | Header share chip | `page.tsx:555-577` (`admin-show-share-chip`) — `title={crewUrl}` + `crewPathDisplay` `<code>` + `<ShareLinkCopyButton url={crewUrl}/>` | client leaf, server-fed url | **yes** |
| B | "Open crew page" link | `page.tsx:693-705` — `<a href={crewUrl}>` | server anchor | no (navigation) |
| C | Current-share-link card | `CurrentShareLinkPanel` → URL + `ShareLinkCopyButton` + email | server, `token` prop | **yes** |
| D | Rotate-success banner | `RotateShareTokenButton` banner — URL + Copy + email | client, own `result` token | **yes** (the redundant duplicate) |

All of A/B/C are **Server-Component-fed** — they update only after a full server round-trip. `RotateShareTokenButton` (D) is a client sibling nested in the card via the panel's `actions` prop (`page.tsx:819-837`). On rotate success (`RotateShareTokenButton.tsx:136-151`) the client sets local `result` (new token) → banner renders the new URL **instantly**, then calls `router.refresh()` → the whole page re-renders server-side → A/B/C re-read the new token.

Because A/B/C can only update via that server round-trip, banner D carries its own copy of the new URL to cover the **refresh-lag window** — the interval where the surfaces still show the OLD (now-dead) token but their Copy buttons are live. Comment `CurrentShareLinkPanel.tsx:21-27` documents this "banner is authoritative during refresh" contract.

**Consequences:**
1. Persistent duplicated URL/Copy/email between C and D in steady state (the user-visible complaint).
2. A real (sub-second) hazard: during the refresh window an admin can copy the **dead** URL from copy surfaces A or C and send it to crew.

Codex R1 correctly flagged that removing D's URL while leaving A refresh-only would move the hazard, not remove it. The fix must make **all** token-derived surfaces update instantly from one source.

## 2. Goal

- **Single instant source of truth** for the crew URL across every surface on the admin page (A, B, C), so that a rotate performed **in this tab** updates all of them **instantly** — closing the same-tab refresh-lag window that would otherwise let an admin copy the dead URL from A or C in the sub-second after their own rotate.
- Rotate success banner (D) becomes a **confirmation-only** status (no URL, no Copy, no email) that points at the updated card, safe to drop its own URL because A/C now update instantly.
- Plus a cheap freshness improvement (§3.2): `router.refresh()` on tab **visibility regain** (`visibilitychange`→visible), window **focus**, and **`pageshow`** (bfcache) so returning to the tab/window re-syncs the token — the realistic multi-admin path (admin switches away, another admin rotates, admin returns). Both triggers matter: a window can regain focus without the tab ever going `hidden`, so `visibilitychange` alone would miss a window switch.

### 2.1 Explicit scope boundary — external-rotation freshness (pre-existing, out of scope)

**Absolute** freshness against another admin/tab rotating while this tab stays open and focused (so copy surfaces can *never* expose an old token) is **NOT** solved here and is **not a regression** introduced by this change:

- Today the surfaces are Server-Component-rendered from `token`. The admin show page is `force-dynamic` (`page.tsx:74`) but has **no realtime subscription, no polling, no `revalidate` interval, and no visibility refresh** (verified: no `supabase.channel` / `setInterval` / `refetchInterval` / `visibilitychange` under `app/admin/show/[slug]/`). So an admin sitting on the page today, while another admin rotates, keeps a stale server-rendered token with a live Copy button until they navigate/refresh — identical staleness to the client-cached token this design introduces.
- The `useEffect` re-sync (§3.2) means **any** server refresh (`router.refresh()` from rotate/reset/publish actions, navigation, or the new visibility trigger) re-seeds the token — parity-or-better vs the server-only status quo.
- Making copy *provably* never expose an old token requires realtime epoch subscription or copy-time epoch validation — durable-signal infra disproportionate to this UI dedup, and orthogonal to the user's complaint. Filed as a BACKLOG follow-up (§7 note), not built here.

Non-goals: no change to `rotateShareToken` server action, its telemetry, the advisory lock, or the token-read RPC. No realtime/epoch-subscription infra. No visual redesign beyond removing the duplicated block.

## 3. Approach (A-solid + shared token context — chosen)

Introduce a client **token context** seeded by the server-read token, updated directly by rotate. Every crew-URL surface consumes it, so a single `setToken` updates them all with no server round-trip. Rejected: "A-lite" (banner→confirmation-only, rely on `router.refresh()`) — leaves the dead-URL race on A and C.

### 3.1 Component structure after

| Component | Kind | Responsibility |
|---|---|---|
| `page.tsx` | server | Reads `token` (admin RPC) + `picker_epoch` (show row). Wraps returned content in `<ShareTokenProvider initialToken={isShowEligibleForCrewLink ? token : null} initialEpoch={picker_epoch}>`. Replaces inline chip (A) with `<ShareChip>`, inline crew-page anchor (B) with `<CrewPageLink>`. Renders `<CurrentShareLinkPanel>` (C) with structured props + server-built `resetSlot`. |
| **`ShareTokenContext.tsx` (NEW)** | client | `ShareTokenProvider` owns `{token, epoch}` state, epoch-gated so a stale server-refresh can't overwrite a newer token; `useShareToken()` hook exposes `{ token, applyRotated(token, epoch) }`. Visibility/focus/pageshow → `router.refresh()`. |
| **`ShareChip.tsx` (NEW)** | client | Header chip (A). Props `slug`, `isEligible`. Reads `token` from context; renders chip-or-null (visibility = `isEligible && token != null`). |
| **`CrewPageLink.tsx` (NEW)** | client | "Open crew page" link (B). Props `slug`, `isEligible`, plus any static presentational props. Reads `token`; renders `<a href>` or nothing. |
| **`ShareLinkBody.tsx` (NEW)** | client | Card body (C). Reads `token` from context. Renders URL/Copy/email (token) OR unavailable notice (null); hosts `RotateShareTokenButton` (wired `onRotated`) + `resetSlot`. |
| `CurrentShareLinkPanel.tsx` | server | Card chrome + heading only; renders `<ShareLinkBody …/>`. Drops `token`/`actions` props; gains `resetSlot`, `isCrewLinkActive`. |
| `RotateShareTokenButton.tsx` | client | Two-tap confirm + rotate. Success → `onRotated?.(newToken)` (gated, §3.5) + `router.refresh()` backstop. Banner is confirmation-only. |
| `ShareLinkCopyButton`, `PickerResetControl`, `crewLinkMailto`, `resolveOrigin` | unchanged | Reused. All client-safe. |

### 3.2 `ShareTokenContext` (new client module)

```ts
"use client";
// Consumers read `token` for display. `applyRotated(token, epoch)` is how the
// rotate button installs a new token WITH its epoch. All updates — server-refresh
// AND rotate — are gated by a monotonic epoch so an out-of-order stale payload can
// never overwrite a newer token (Codex R4). `epoch` = shows.picker_epoch, bumped
// atomically by rotate (R40) and by picker-reset; strictly increasing.
type Ctx = { token: string | null; applyRotated: (token: string, epoch: number) => void };
const ShareTokenContext = createContext<Ctx | null>(null);

export function ShareTokenProvider({
  initialToken,
  initialEpoch,
  children,
}: { initialToken: string | null; initialEpoch: number; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState({ token: initialToken, epoch: initialEpoch });
  // Server refresh delivered (initialToken, initialEpoch). Accept ONLY if its epoch
  // is >= the epoch we currently hold — rejecting a stale in-flight refresh that
  // resolves after a local rotate already installed a newer token (Codex R4).
  useEffect(() => {
    setState((prev) => (initialEpoch >= prev.epoch ? { token: initialToken, epoch: initialEpoch } : prev));
  }, [initialToken, initialEpoch]);
  const applyRotated = useCallback(
    (token: string, epoch: number) =>
      setState((prev) => (epoch >= prev.epoch ? { token, epoch } : prev)),
    [],
  );
  // Freshness improvement: when this tab regains visibility OR the window
  // regains focus (switching windows/apps can re-focus without the tab ever
  // going `hidden`, so `visibilitychange` alone misses it), pull fresh server
  // state so a rotation performed elsewhere while the tab was away is picked up
  // (→ new initialToken → the effect above re-syncs). `pageshow` covers bfcache
  // restore. Bounded, debounce-free (admin-only low-traffic page); a soft
  // refresh does NOT remount client state, so the rotate two-tap confirm
  // survives a tab/window switch.
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
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

**Why epoch-gated:** our own rotate calls `applyRotated(NEW, e_new)` instantly (e_new > current); the follow-up `router.refresh()` re-delivers `(NEW, e_new)` (effect applies, no-op). A **stale** refresh that started before the rotate resolves later carrying `(OLD, e_old)` with `e_old < e_new` → **rejected** by the epoch gate, so copy surfaces never revert to the dead URL (Codex R4). A genuinely newer external rotation carries `e > e_new` → applied. Both the server-refresh path and the rotate path funnel through the same monotonic gate, so arrival order is irrelevant. The provider wraps server-rendered children (standard RSC pattern — no server code enters the client bundle). **Bound:** a rotation by another admin while this tab stays open-and-focused is not *pushed* here (§2.1 — pre-existing, BACKLOG); the visibility/focus/pageshow triggers pull it on tab/window return.

### 3.3 Consumers A / B / C

Each computes its URL client-side from context `token` + props:
- `url = token ? ${resolveOrigin()}/show/${slug}/${token} : null` (only where eligible).
- Visibility: `isEligible && token != null` (mirrors current `hasCrewLinkUrl`; `isEligible` = `isShowEligibleForCrewLink`, passed as a serializable prop).
- **A `ShareChip`** — chip markup identical to current `page.tsx:555-577`; `title`, `<code>` path, and `<ShareLinkCopyButton url>` all from context url. Keeps `data-testid="admin-show-share-chip"`.
- **B `CrewPageLink`** — anchor identical to `page.tsx:693-705`; `href` from context url. Same aria-label "Open crew page".
- **C `ShareLinkBody`** — see §3.4.

Server-side `page.tsx` no longer derives `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` for A/B/C (moved client-side). It still computes `isShowEligibleForCrewLink` (server, from `published && !archived`) and passes it down. Any OTHER server use of those three derived vars is migrated or removed (verify at implementation: grep confirms only A, B, C use them).

### 3.4 `ShareLinkBody` (card body, new client)

Props: `slug`, `showId`, `crewEmails: readonly string[]`, `showTitle`, `isCrewLinkActive: boolean`, `resetSlot: ReactNode`. Reads `{ token, applyRotated } = useShareToken()`.

Render:
- **`token` present** → `url = ${resolveOrigin()}/show/${slug}/${token}`; `<code data-testid="admin-current-share-link-url">{url}</code>` + `<ShareLinkCopyButton url={url}/>` + email note/buttons via `buildCrewLinkMailtos({emails:crewEmails,url,showTitle})` (testids `admin-current-share-link-email-note`, `admin-current-share-link-email-button`).
- **`token` null** → "unavailable" notice (`admin-current-share-link-unavailable`).
- **Always** → divider actions block (`border-t divide-y`): `<RotateShareTokenButton showId slug isCrewLinkActive onRotated={applyRotated} compact rowLabel="Rotate share link" rowDescription="Mint a new link; the old one stops working immediately."/>` then `{resetSlot}`.

### 3.5 `RotateShareTokenButton` changes

- **Add** prop **`onRotated?: (newToken: string, newEpoch: number) => void`** — the single, canonical signature (carries the epoch so the context's monotonic gate (§3.2) can order it). This exact two-arg shape is the one referenced by every consumer, the guard table, and every test below; there is no one-arg variant.
- **Success branch** (`onConfirmClick`, after `setResult(r)`): call `onRotated?.(r.new_share_token, r.new_epoch)` **only when `r.ok && isCrewLinkActive`** (resolves the R1 finding-2 contradiction — inactive success must not surface a copyable URL). Then `router.refresh()` on any `r.ok` (backstop for server-derived data). `{ok:false}` → no `onRotated`.
- **Banner (current lines 221-285) → confirmation-only:**
  ```
  ✓ New share-link ready. The old link no longer works and everyone will
    re-pick their name — the updated link is shown above.
  ```
  Keep `data-testid="admin-rotate-share-token-ok"`, `role="status"`, `aria-live="polite"`.
- **Remove:** URL `<code>` + Copy button + email note + email buttons + sr-only copy-announce span. **Delete now-dead code:** `onCopyClick`, `copied` state, `copyResetRef` + `clearCopyReset` + its cleanup, `emailMailtos`, the `newUrl`-for-display use, `buildCrewLinkMailtos` import, `Mail` import (used only by the removed email buttons — verify no other use).
- **Drop props** `crewEmails`, `showTitle`.
- **Keep:** `rotatedInactive` branch (`admin-rotate-share-token-ok-inactive`), `refused` branch (`admin-rotate-share-token-refused`), the two-tap confirm/cancel state machine, `AUTO_REVERT_MS`, aria wiring, compact/rowLabel layout, `isCrewLinkActive` prop.

### 3.6 `CurrentShareLinkPanel` changes

- Keep: card outer chrome, `<h3>Current share-link</h3>` + the "Send this URL…" description.
- Body → single `<ShareLinkBody slug={slug} showId={showId} crewEmails={crewEmails} showTitle={showTitle} isCrewLinkActive={isCrewLinkActive} resetSlot={resetSlot}/>`.
- **Props:** remove `token?`, remove opaque `actions?`; add `resetSlot?: ReactNode`, `isCrewLinkActive?: boolean` (default `true`). Keep `slug, showId, crewEmails, showTitle`. Remains a Server Component. Token now comes from context (provider seeded server-side in `page.tsx`) — the admin-only token read stays server-side; no change to who can read the token.

### 3.7 `page.tsx` changes

- Add `picker_epoch` to the show `.select(...)` (`page.tsx:175`) and to the `ShowLookupRow` type; `const initialEpoch = show.picker_epoch ?? 0` (coalesce for safety — verify NOT NULL in schema; the column is a `+1`-bumped counter so a default is expected).
- Wrap the returned JSX body in `<ShareTokenProvider initialToken={isShowEligibleForCrewLink ? token : null} initialEpoch={initialEpoch}> … </ShareTokenProvider>`. **Eligibility-gate the token seed** so an unpublished/archived show's token is NOT serialized into the client provider payload — matching today's behavior where no token-derived client surface mounts for ineligible shows (Codex R4 finding-1; preserves the `No new token exposure` claim). `initialEpoch` is always seeded (a non-secret counter).
- Replace inline chip (555-577) with `<ShareChip slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`.
- Replace inline crew-page anchor (693-705) with `<CrewPageLink slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`.
- `<CurrentShareLinkPanel>` call (813-838): remove `token` + `actions`; add `isCrewLinkActive={isShowEligibleForCrewLink}` and `resetSlot={<PickerResetControl showId={show.id} crew={crew}/>}`.
- Remove the now-unused `RotateShareTokenButton` import (verify no other use). Keep `ShareLinkCopyButton` import only if still used directly in page.tsx after A/B/C move to leaf components (verify; drop if unused).
- Drop the server-side `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` derivations if no residual server use remains after A/B/C move client-side (verify).

## 4. Guard conditions (per-input)

| Input | null / empty / edge | Behavior |
|---|---|---|
| `token` (context) | `null` | A hidden, B hidden, C shows unavailable notice; rotate + reset still render (rotate reachable to recover — R1/R27). |
| show ineligible (`!published \|\| archived`) | server has a token | provider seeded `initialToken=null` → token NOT serialized to client (parity with today; no exposure widening — Codex R4-1). |
| stale server refresh (epoch `e_old` < local `e_new`) | resolves after a local rotate installed `e_new` | epoch gate **rejects** it; context keeps the newer token — no revert to dead URL (Codex R4-2). |
| newer external rotation (epoch `e` > local) | delivered via refresh | epoch gate accepts → surfaces update. |
| `token` | new value delivered via `initialToken` (server refresh from any action/nav or the visibility trigger) | provider `useEffect` re-syncs → A/B/C all update. |
| external rotation while tab open + focused | no server refresh fires | A/C keep the old token until the next refresh/nav/visibility-regain — **pre-existing**, parity with today's server render (§2.1), BACKLOG. |
| `crewEmails` | `[]` | No email note/buttons (`.length` guards, unchanged). |
| `crewEmails` | 1 addr | Single "Email this link to crew" button, no batch note. |
| rotate `result` | `{ok:false}` | `refused` banner; token unchanged; `onRotated` NOT called. |
| rotate `result` | `{ok:true}` & `isCrewLinkActive===false` | `rotatedInactive` banner; `onRotated` NOT called; token unchanged (no copyable URL surfaces). |
| rotate `result` | `{ok:true}` & `isCrewLinkActive===true` | `onRotated(new_share_token, new_epoch)` → context `applyRotated` (epoch-gated) → A/B/C update instantly; confirmation banner. |
| `useShareToken` | outside provider | throws (dev guard) — every consumer is inside the page-level provider. |

## 5. Transition inventory (rotate button visual states)

States: `idle` (± persistent confirmation banner), `confirm`, `resolving`. Unchanged except the success banner content. No `AnimatePresence` in scope; all state swaps remain instant (existing behavior). The URL updates on A/B/C are instant text/attr swaps (no animation).

## 6. Testing

TDD per task (invariant 1). Anti-tautology per project rules.

### 6.1 New — `tests/components/ShareTokenContext.test.tsx`
- Provider seeds `token` from `initialToken`; `applyRotated(NEW, e+1)` updates consumers.
- Re-render with new `initialToken` + higher `initialEpoch` → consumers reflect it (server-refresh sync).
- **Epoch gate — stale reject (Codex R4-2):** seed `{OLD, epoch:5}`; call `applyRotated("NEW", 6)` → shows NEW; then re-render with `initialToken="OLD", initialEpoch=5` (a stale in-flight refresh landing late) → **still NEW** (not reverted). Failure mode caught: a blind `setToken(initialToken)` reverts to OLD.
- **Epoch gate — newer accept:** seed `{OLD,5}`; re-render `{NEWER, 7}` → shows NEWER.
- `useShareToken` outside provider throws.
- **Visibility/focus freshness:** with `next/navigation` `router.refresh` mocked, assert each trigger fires it: window `focus` event → `router.refresh` called; `pageshow` → called; `visibilitychange` with `document.visibilityState==="visible"` → called; **`visibilitychange` with state `"hidden"` → NOT called** (the discriminating case — a naive "any visibilitychange" impl fails here); and a window `focus` while `visibilityState` is already `"visible"` → still called (the R3 window-switch gap — a `visibilitychange`-only impl fails this). All listeners removed on unmount. Proves the refresh *fires* on tab/window return (which in prod re-pulls the fresh token); absolute never-expose-OLD-while-focused is out of scope per §2.1.

### 6.2 New — `tests/components/shareTokenInstantUpdate.test.tsx` (the load-bearing test)
- Render **one** `ShareTokenProvider` (seeded `initialToken="OLD"`, `initialEpoch=5`) wrapping the **actual** A/B/C consumers **together** — `<ShareChip>`, `<CrewPageLink>`, AND `<ShareLinkBody>` (which itself hosts `RotateShareTokenButton`). No substitute/stand-in consumer is permitted; the point is to catch a real surface being left refresh-only.
- Assert every surface exposes `OLD`: `ShareLinkBody`'s `admin-current-share-link-url` code + its Copy-button URL, the `admin-show-share-chip` `title`/`<code>`/copy-button URL, and the `CrewPageLink` `href`.
- Drive `RotateShareTokenButton` success with `rotateShareToken` mocked → `{ok:true,new_share_token:"NEW",new_epoch:6}` **and `next/navigation` `router.refresh` mocked to a no-op**.
- Assert **`OLD` appears nowhere** — not in any visible text, not in any `href`/`title` attribute, not in any copy-button target URL — and every surface now shows `NEW`. **Failure mode caught:** any surface left server-fed/refresh-only (the Codex R1 header-chip / R5 open-link hazard) still exposes `OLD` with `refresh` stubbed. Expected values derived from the mock token, not hardcoded.

### 6.3 New — `tests/components/ShareLinkBody.test.tsx`
- token present → URL/Copy/email; token null → unavailable + rotate reachable; empty `crewEmails` → no email buttons; `resetSlot` rendered.

### 6.4 New — `tests/components/ShareChip.test.tsx`, `tests/components/CrewPageLink.test.tsx`
- Visibility gates on `isEligible && token != null`; url/href derived from context token; update on `setToken`.

### 6.5 Update — `tests/components/RotateShareTokenButton.test.tsx`
- Remove assertions for `admin-rotate-share-token-url`, `-copy-button`, `-copy-announce`, `-email-note`, `-email-button`.
- Success (active) → `admin-rotate-share-token-ok` present, confirmation copy, **no URL, no Copy**; `onRotated` called once with **both args** `(new_share_token, new_epoch)` (assert the second arg is the epoch, not undefined).
- `{ok:false}` → `refused`; `onRotated` not called.
- inactive-success → `rotatedInactive`; `onRotated` not called.

### 6.6 New — `tests/app/admin/perShowPage.inactiveTokenExposure.test.tsx` (or a case in perShowPage)
- Render the admin page for an **ineligible** show (`published:false` or `archived:true`) whose server token read returns a real token. Assert the token string does **not** appear anywhere in the rendered client output / serialized provider payload (`isShowEligibleForCrewLink ? token : null` seed). Failure mode caught: unconditional `initialToken={token}` leaks the token for inactive shows (Codex R4-1).

### 6.7 Update — `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/app/admin/perShowPage.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/app/admin/rotateShareToken.test.tsx`
- Wrap rendered subtrees in `ShareTokenProvider` (with `initialEpoch`) where needed. Fix panel prop shape (`resetSlot`/`isCrewLinkActive`, no `token`/`actions`). Fix removed rotate-banner URL/Copy assertions. Chip/crew-link assertions read from provider-seeded token.

## 7. Invariants / contracts touched

- **Inv 1 (TDD):** every task failing-test-first.
- **Inv 5 (no raw error codes in UI):** unaffected — `refused` copy is static prose.
- **Inv 8 (impeccable dual-gate):** UI surfaces changed (`app/admin/**`, new `app/admin/show/[slug]/*` client files) → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- **Inv 10 (mutation telemetry):** no mutation surface added/changed. The mutating surface `rotateShareToken` (`lib/auth/picker/`, emits `epoch_<n>`, never the token) is untouched. New context/leaf components are non-mutating UI.
- **Security:** the admin-only token read stays server-side in `page.tsx` (`loadShowShareToken`). `ShareTokenProvider` is seeded with the already-authorized token string ONLY for eligible shows (`isShowEligibleForCrewLink ? token : null`, §3.7) — identical trust boundary to today's eligible-only client surfaces; an ineligible show's token is never serialized to the client (Codex R4-1). `initialEpoch` is a non-secret monotonic counter. No new token exposure; no token read moves to the client.
- **Meta-test inventory:** none created/extended. No Supabase call boundary, advisory lock, admin-alert catalog, or tile-sentinel surface touched. Declared explicitly per writing-plans rule.
- **BACKLOG follow-up (absolute external-rotation freshness):** a `BL-SHARE-LINK-EPOCH-FRESHNESS` entry — subscribe the admin per-show page to the show's `picker_epoch` change signal (realtime) or validate token/epoch at copy-time — so copy surfaces can never expose a token rotated by another admin even while this tab stays focused. Out of scope here (§2.1); pre-existing gap, not a regression from this change.

## 8. Out of scope

- `rotateShareToken` action, RPC, advisory lock, epoch bump.
- Crew-facing routes.
- Help MDX (`app/help/admin/sharing-links`) — verify copy still accurate; no behavior change expected.
- Any surface NOT derived from the show share `token` (unaffected by the context).
