# Share-link instant-rotate + success-banner dedup — design

**Date:** 2026-07-10
**Status:** Draft (brainstorming → spec) · rev 8 (post Codex R7)
**Scope:** Admin per-show page share-link surfaces. **UI-only** refactor. No DB, no advisory-lock, no server-action / RPC signature change.

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

A/B/C are **Server-Component-fed** — they update only after a full server round-trip. `RotateShareTokenButton` (D) is a client sibling nested in the card via the panel's `actions` prop (`page.tsx:819-837`). On rotate success (`RotateShareTokenButton.tsx:136-151`) the client sets local `result` (new token) → banner renders the new URL **instantly**, then calls `router.refresh()` → the page re-renders server-side → A/B/C re-read the new token.

Because A/B/C can only update via that server round-trip, banner D carries its own copy of the new URL to cover the **same-tab refresh-lag window** — the interval where the surfaces still show the OLD (now-dead) token but their Copy buttons are live. Comment `CurrentShareLinkPanel.tsx:21-27` documents this "banner is authoritative during refresh" contract.

**Consequences:**
1. Persistent duplicated URL/Copy/email between C and D in steady state (the user-visible complaint).
2. A real (sub-second) same-tab hazard: right after *this admin's own* rotate, before `router.refresh()` lands, they can copy the **dead** URL from A or C.

Codex R1 correctly flagged that removing D's URL while leaving A/C refresh-only would move the hazard, not remove it. The fix makes **all** same-tab token-derived surfaces update instantly from one client source, so D can safely drop its URL.

## 2. Goal & scope boundary

**In scope — same-tab instant update.** A single client token source, seeded by the server-read token, that **this admin's own rotate updates instantly** across every crew-URL surface (A, B, C) — closing the same-tab refresh-lag window so no surface can copy the dead URL in the sub-second after their own rotate. With A/C now instant, banner D becomes a **confirmation-only** status (no URL, no Copy, no email) pointing at the updated card.

**Out of scope — external-rotation freshness (pre-existing, parity, BACKLOG).** Making copy surfaces update when *another* admin/tab rotates while this tab stays open is **not solved here and is not a regression**:

- Today the surfaces are Server-Component-rendered from `token`. The page is `force-dynamic` (`page.tsx:74`) but has **no realtime subscription, no polling, no `revalidate` interval, and no visibility/focus refresh** (verified: no `supabase.channel` / `setInterval` / `refetchInterval` / `visibilitychange` under `app/admin/show/[slug]/`). An admin sitting on the page today, while another admin rotates, keeps a stale server-rendered token with a live Copy button until they navigate/refresh — **identical** staleness to the client-cached token this design introduces. The client cache is parity, not a regression.
- A **sound** external-rotation freshness fix requires either a realtime `picker_epoch` subscription or a copy-time epoch/token validation — and any *server-epoch-ordered* client gate needs the token and its epoch read from **one atomic DB snapshot**. Today the token comes from the `admin_read_share_token` RPC (`lib/data/loadShowShareToken.ts:13`, `show_share_tokens`) and the epoch from a separate `shows` row read — two snapshots. Making them atomic means changing the token RPC/DB layer, which is **outside this UI-only change's scope** (it would pull in a migration, schema-manifest regen, validation-parity apply, and RPC tests). Considered and deliberately deferred (Codex R2/R4/R7 explored the server-epoch-gate path; it is correct but disproportionate here). Filed as `BL-SHARE-LINK-EPOCH-FRESHNESS` (§7).
- **No freshness-trigger machinery** (visibility/focus/pageshow `router.refresh()`) is added — it would only serve multi-admin freshness, which today's page does not provide either. Note: the same-tab **stale-refresh** hazard is handled WITHOUT a server epoch, via a purely-local rotate latch keyed on the token minted by this admin's own rotate (§3.2) — that value is atomic from the rotate RPC result, so it does not need the atomic *read* the server-epoch path would.

**Non-goals:** no change to `rotateShareToken`, its telemetry, the advisory lock, or the token-read RPC. No realtime/epoch infra. No visual redesign beyond removing the duplicated block.

## 3. Approach (A-solid, same-tab)

A page-level client **token context** seeded by the server-read token; every crew-URL surface consumes it; the rotate button updates it directly, so a single `setToken` refreshes A/B/C with no server round-trip.

### 3.1 Component structure after

| Component | Kind | Responsibility |
|---|---|---|
| `page.tsx` | server | Reads `token` once (admin RPC). Wraps returned content in `<ShareTokenProvider key={show.id} initialToken={isShowEligibleForCrewLink ? token : null}>` (**keyed by show identity**, §3.2). Replaces inline chip (A) with `<ShareChip>`, inline crew-page anchor (B) with `<CrewPageLink>`. Renders `<CurrentShareLinkPanel>` (C) with structured props + server-built `resetSlot`. |
| **`ShareTokenContext.tsx` (NEW)** | client | `ShareTokenProvider` owns `token` state + a local **rotate latch** (`rotatedRef`); server-refresh sync rejects stale/non-matching tokens after a local rotate and fails closed on null (§3.2); `useShareToken()` → `{ token, applyRotated }`. Show-scoped via the caller's `key={show.id}` (remounts on show change). |
| **`ShareChip.tsx` (NEW)** | client | Header chip (A). Props `slug`, `isEligible`. Reads `token`; renders chip-or-null (visibility = `isEligible && token != null`). |
| **`CrewPageLink.tsx` (NEW)** | client | "Open crew page" link (B). Props `slug`, `isEligible`. Reads `token`; renders `<a href>` or nothing. |
| **`ShareLinkBody.tsx` (NEW)** | client | Card body (C). Reads `token`. Renders URL/Copy/email (token) OR unavailable notice (null); hosts `RotateShareTokenButton` (wired `onRotated`) + `resetSlot`. |
| `CurrentShareLinkPanel.tsx` | server | Card chrome + heading only; renders `<ShareLinkBody …/>`. Drops `token`/`actions` props; gains `resetSlot`, `isCrewLinkActive`. |
| `RotateShareTokenButton.tsx` | client | Two-tap confirm + rotate. Success → `onRotated?.(newToken)` (gated, §3.5) + `router.refresh()` backstop. Banner is confirmation-only. |
| `ShareLinkCopyButton`, `PickerResetControl`, `crewLinkMailto`, `resolveOrigin` | unchanged | Reused. All client-safe. |

### 3.2 `ShareTokenContext` (new client module)

```ts
"use client";
// Consumers read `token` for display. `applyRotated(newToken)` is how the rotate
// button installs the token IT just minted (via a successful rotateShareToken RPC).
// That minted value is authoritative + proven-current, so it also arms a local
// LATCH that makes the server-refresh sync ignore any non-matching token — the
// same-tab stale-refresh defense (Codex R9-1), with no server epoch needed.
type Ctx = { token: string | null; applyRotated: (newToken: string) => void };
const ShareTokenContext = createContext<Ctx | null>(null);

export function ShareTokenProvider({ initialToken, children }: { initialToken: string | null; children: ReactNode }) {
  const [token, setToken] = useState(initialToken);
  // `rotatedRef` = the token this admin locally rotated to (null until they do).
  // Once armed, it is the ONLY token the server may echo; everything else is
  // stale or an out-of-scope external rotation and is ignored.
  const rotatedRef = useRef<string | null>(null);

  const applyRotated = useCallback((newToken: string) => {
    rotatedRef.current = newToken; // proven-current (we just minted it)
    setToken(newToken);
  }, []);

  useEffect(() => {
    if (initialToken === null) {
      // Token-read fault (or ineligible) → server says "no token".
      // FAIL CLOSED (match today's page.tsx: hide surfaces, never a dead URL)
      // UNLESS we hold a locally-minted token — that one is proven-current, so a
      // transient null read must not blank it (Codex R7-2 vs R9-2 reconciled).
      if (rotatedRef.current === null) setToken(null);
      return;
    }
    // Non-null server token. AFTER a local rotate, accept ONLY the echo of our
    // minted token; reject a stale in-flight refresh (e.g. a ReSyncButton
    // router.refresh that started with OLD and resolved after our rotate) and any
    // out-of-scope external rotation — regardless of arrival order (Codex R9-1).
    // BEFORE any local rotate (ref null), track server truth normally.
    if (rotatedRef.current !== null && initialToken !== rotatedRef.current) return;
    setToken(initialToken);
  }, [initialToken]);

  return (
    <ShareTokenContext.Provider value={{ token, applyRotated }}>{children}</ShareTokenContext.Provider>
  );
}

export function useShareToken(): Ctx {
  const ctx = useContext(ShareTokenContext);
  if (!ctx) throw new Error("useShareToken must be used within ShareTokenProvider");
  return ctx;
}
```

**Same-tab stale-refresh defense (Codex R9-1) — why a local token latch, not a server epoch.** The admin page mounts MANY independent `router.refresh()` callers besides rotate — verified: `ReSyncButton` (`page.tsx:940,1049` → `components/admin/ReSyncButton.tsx:116`), `PublishedToggle`, `ArchiveShowButton`, `ParsePanel`, the pending-panel buttons, and nav badge hooks (`useBellBadge`, `useNeedsAttentionBadge`). Any of these can have a refresh **in flight that started with the OLD token and resolves after** the admin's rotate installed NEW. The latch defeats this without a server-read epoch: `applyRotated(NEW)` (fed the token from the atomic `rotateShareToken` result — no separate read, so the R7-1 non-atomic-pair problem does not arise) arms `rotatedRef=NEW`; thereafter the sync effect applies a server token **only if it equals NEW**, so a late `OLD` payload is rejected no matter the arrival order. A subsequent local rotate to `NEW2` re-arms the latch (`applyRotated` always wins). Since within one show the token changes ONLY via the admin's own rotate (external rotation is out of scope, §2), locking to the last locally-minted token loses nothing in scope.

**Fail-closed on token-read fault (Codex R9-2).** Today `page.tsx` renders `token=null` on a `loadShowShareToken` failure and hides all crew-link surfaces (no dead URL). The provider preserves that: a `null` seed with an un-armed latch → `setToken(null)` → surfaces hide (fail closed). The ONLY null we ignore is a transient one *after* a local rotate, where the retained token is the one we just minted and proved current — not a fail-open on an unverified cached token.

**Show-identity scoping (Codex R8).** On App Router client navigation between two shows the same `ShareTokenProvider` type can be **reconciled without remounting**, so show A's `useState` token (and its armed latch) could survive into show B — consumers would build `/show/${slugB}/${tokenA}`, a wrong-token exposure. Fix: `page.tsx` renders the provider with **`key={show.id}`**. A show-identity change ⇒ new key ⇒ React unmounts A and mounts B fresh, re-seeding `useState` and resetting `rotatedRef` from B's props. Same-show refresh (same `key`) does not remount, so the sync effect handles the same-tab rotate. The provider wraps server-rendered children (standard RSC pattern — no server code enters the client bundle).

### 3.3 Consumers A / B / C

Each computes its URL client-side from context `token` + props:
- `url = token ? ${resolveOrigin()}/show/${slug}/${token} : null`.
- Visibility: `isEligible && token != null` (mirrors current `hasCrewLinkUrl`; `isEligible` = `isShowEligibleForCrewLink`, a serializable prop). Gating on `isEligible` too means an unpublished/archived show renders none of A/B/C even if a token value lingers in context.
- **A `ShareChip`** — markup identical to `page.tsx:555-577`; `title`, `<code>` path, `<ShareLinkCopyButton url>` from context url. Keeps `data-testid="admin-show-share-chip"`.
- **B `CrewPageLink`** — anchor identical to `page.tsx:693-705`; `href` from context url. Same aria-label "Open crew page".
- **C `ShareLinkBody`** — see §3.4.

Server-side `page.tsx` no longer derives `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` for A/B/C (moved client-side); it still computes `isShowEligibleForCrewLink` (`published && !archived`) and passes it down. Verified only A/B use those three derived vars today — no other residual server use.

### 3.4 `ShareLinkBody` (card body, new client)

Props: `slug`, `showId`, `crewEmails: readonly string[]`, `showTitle`, `isCrewLinkActive: boolean`, `resetSlot: ReactNode`. Reads `{ token, applyRotated } = useShareToken()`.

Render:
- **`token` present** → `url = ${resolveOrigin()}/show/${slug}/${token}`; `<code data-testid="admin-current-share-link-url">{url}</code>` + `<ShareLinkCopyButton url={url}/>` + email note/buttons via `buildCrewLinkMailtos({emails:crewEmails,url,showTitle})` (testids `admin-current-share-link-email-note`, `admin-current-share-link-email-button`).
- **`token` null** → "unavailable" notice (`admin-current-share-link-unavailable`).
- **Always** → divider actions block (`border-t divide-y`): `<RotateShareTokenButton showId slug isCrewLinkActive onRotated={applyRotated} compact rowLabel="Rotate share link" rowDescription="Mint a new link; the old one stops working immediately."/>` then `{resetSlot}`.

### 3.5 `RotateShareTokenButton` changes

- **Add** prop **`onRotated?: (newToken: string) => void`** — the single, canonical signature. (No epoch — the same-tab scope needs no client ordering gate, §3.2.)
- **Success branch** (`onConfirmClick`, after `setResult(r)`): call `onRotated?.(r.new_share_token)` **only when `r.ok && isCrewLinkActive`** (R1 finding-2 — inactive success must not surface a copyable URL). Then `router.refresh()` on any `r.ok` (backstop for server-derived data). `{ok:false}` → no `onRotated`. (`r.new_share_token` is the existing result field, `RotateShareTokenButton.tsx:32` / `lib/auth/picker/rotateShareToken.ts:12`; no server-action change.)
- **Banner (current lines 221-285) → confirmation-only:**
  ```
  ✓ New share-link ready. The old link no longer works and everyone will
    re-pick their name — the updated link is shown above.
  ```
  Keep `data-testid="admin-rotate-share-token-ok"`, `role="status"`, `aria-live="polite"`.
- **Remove:** URL `<code>` + Copy button + email note + email buttons + sr-only copy-announce span. **Delete now-dead code:** `onCopyClick`, `copied` state, `copyResetRef` + `clearCopyReset` + its cleanup, `emailMailtos`, the `newUrl`-for-display use, `buildCrewLinkMailtos` import, `Mail` import (used only by the removed email buttons — verify no other use).
- **Drop props** `crewEmails`, `showTitle`.
- **Keep:** `rotatedInactive` (`admin-rotate-share-token-ok-inactive`), `refused` (`admin-rotate-share-token-refused`), the two-tap confirm/cancel state machine, `AUTO_REVERT_MS`, aria wiring, compact/rowLabel layout, `isCrewLinkActive` prop.

### 3.6 `CurrentShareLinkPanel` changes

- Keep: card outer chrome, `<h3>Current share-link</h3>` + the "Send this URL…" description.
- Body → single `<ShareLinkBody slug={slug} showId={showId} crewEmails={crewEmails} showTitle={showTitle} isCrewLinkActive={isCrewLinkActive} resetSlot={resetSlot}/>`.
- **Props:** remove `token?`, remove opaque `actions?`; add `resetSlot?: ReactNode`, `isCrewLinkActive?: boolean` (default `true`). Keep `slug, showId, crewEmails, showTitle`. Remains a Server Component; token now comes from context (provider seeded server-side in `page.tsx`) — the admin-only token read stays server-side.

### 3.7 `page.tsx` changes

- Wrap the returned JSX body in `<ShareTokenProvider key={show.id} initialToken={isShowEligibleForCrewLink ? token : null}> … </ShareTokenProvider>`. **`key={show.id}`** scopes provider state to show identity — navigating A→B remounts, so no cross-show token can leak (Codex R8, §3.2). **Eligibility-gate the seed** so an unpublished/archived show's token is NOT serialized into the client provider payload — matching today's behavior where no token-derived client surface mounts for ineligible shows (Codex R4-1; preserves "No new token exposure").
- Replace inline chip (555-577) with `<ShareChip slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`.
- Replace inline crew-page anchor (693-705) with `<CrewPageLink slug={show.slug} isEligible={isShowEligibleForCrewLink}/>`.
- `<CurrentShareLinkPanel>` call (813-838): remove `token` + `actions`; add `isCrewLinkActive={isShowEligibleForCrewLink}` and `resetSlot={<PickerResetControl showId={show.id} crew={crew}/>}`.
- Remove the now-unused `RotateShareTokenButton` import (verify no other use). Drop the server-side `crewUrl`/`crewPathDisplay`/`hasCrewLinkUrl` derivations if no residual server use remains after A/B/C move client-side (verify). Keep `ShareLinkCopyButton` import only if still used directly in page.tsx (verify; drop if unused).

## 4. Guard conditions (per-input)

| Input | null / empty / edge | Behavior |
|---|---|---|
| `token` (context) | `null` | A hidden, B hidden, C shows unavailable notice; rotate + reset still render (rotate reachable to recover — R1/R27). |
| `token` | new non-null server refresh, **no local rotate yet** (latch un-armed) | `useEffect` applies it → A/B/C track server truth. |
| `token` | server refresh delivers a token **≠ locally-rotated token** after a local rotate (stale in-flight refresh, e.g. ReSync started with OLD; or external rotation) | **rejected** by the latch — context keeps the rotated token; no revert to dead URL, any arrival order (Codex R9-1). |
| `token` | server refresh delivers `null`, **no local rotate** (latch un-armed) | `setToken(null)` → surfaces hide — **fail closed**, matches today's `page.tsx` token-read-fault behavior (Codex R9-2). |
| `token` | server refresh delivers `null`, **after a local rotate** (latch armed) | **ignored** — retains the just-minted, proven-current token; no blank on a transient read fault (Codex R7-2). |
| navigation to a **different show** (`show.id` changes), incl. B ineligible / B token-read null | provider `key={show.id}` changes | provider **remounts** → fresh seed from B's `initialToken` (or `null`); show A's token cannot survive into B (Codex R8). No wrong-token exposure. |
| show ineligible (`!published \|\| archived`) | server has a token | provider seeded `initialToken=null` → token NOT serialized to client (parity with today; no exposure widening — Codex R4-1). A/B/C also gate on `isEligible`. |
| `crewEmails` | `[]` | No email note/buttons (`.length` guards, unchanged). |
| `crewEmails` | 1 addr | Single "Email this link to crew" button, no batch note. |
| rotate `result` | `{ok:false}` | `refused` banner; token unchanged; `onRotated` NOT called. |
| rotate `result` | `{ok:true}` & `isCrewLinkActive===false` | `rotatedInactive` banner; `onRotated` NOT called; token unchanged (no copyable URL surfaces). |
| rotate `result` | `{ok:true}` & `isCrewLinkActive===true` | `onRotated(new_share_token)` → context `setToken` → A/B/C update instantly; confirmation banner. |
| external rotation while tab open | no server refresh fires | A/C keep the old token until the next navigation/action-refresh — **pre-existing**, parity with today's server render (§2), BACKLOG. |
| `useShareToken` | outside provider | throws (dev guard). |

## 5. Transition inventory (rotate button visual states)

States: `idle` (± persistent confirmation banner), `confirm`, `resolving`. Unchanged except the success banner content. No `AnimatePresence` in scope; all state swaps remain instant (existing behavior). The URL updates on A/B/C are instant text/attr swaps (no animation).

## 6. Testing

TDD per task (invariant 1). Anti-tautology per project rules.

### 6.1 New — `tests/components/ShareTokenContext.test.tsx`
- Provider seeds `token` from `initialToken`; `applyRotated(NEW)` updates consumers.
- Re-render with a new non-null `initialToken` **before any rotate** → consumers reflect it (server-refresh tracks truth when latch un-armed).
- **Stale-refresh rejected after rotate (Codex R9-1):** seed `initialToken="OLD"`; `applyRotated("NEW")` → shows NEW; then re-render (same `key`) with `initialToken="OLD"` (a ReSync-style refresh that started before the rotate, resolving late) → consumers **still show `NEW`** (latch rejects OLD). Repeat with the stale re-render arriving *after* a `initialToken="NEW"` echo re-render → still NEW (order-independent). Failure mode caught: a blind `setToken(initialToken)` reverts to the dead OLD URL.
- **Fail-closed on null, un-armed (Codex R9-2):** seed `initialToken="TOK"` (no rotate); re-render (same `key`) `initialToken={null}` (token-read fault) → consumers **hide / show unavailable** (NOT `TOK`). Failure mode caught: fail-open preserving an unverified cached token that another admin may have invalidated.
- **Null-preserve after rotate (Codex R7-2):** seed `"OLD"`; `applyRotated("NEW")`; re-render `initialToken={null}` → **still `NEW`** (just-minted token preserved through a transient read fault).
- **Show-identity scoping (Codex R8):** render under `<ShareTokenProvider key="showA" initialToken="TA">` (assert `TA`), then re-render `<ShareTokenProvider key="showB" initialToken={null}>` (navigated to ineligible/failed show B) → consumer shows **neither `TA`** nor a `/show/…/TA` URL; unavailable/hidden. Also `key="showB" initialToken="TB"` → `TB`, never `TA`. Also: `applyRotated` on show A must NOT leak its latch into show B (changed `key` remounts, resetting `rotatedRef`). (RTL re-render with a changed `key` remounts, exercising real navigation semantics.)
- `useShareToken` outside provider throws.

### 6.2 New — `tests/components/shareTokenInstantUpdate.test.tsx` (the load-bearing test)
- Render **one** `ShareTokenProvider` (seeded `initialToken="OLD"`) wrapping the **actual** A/B/C consumers **together** — `<ShareChip>`, `<CrewPageLink>`, AND `<ShareLinkBody>` (which hosts `RotateShareTokenButton`). No substitute/stand-in consumer permitted.
- Assert every surface exposes `OLD`: `admin-current-share-link-url` code + its Copy-button target, the `admin-show-share-chip` `title`/`<code>`/copy target, and the `CrewPageLink` `href`.
- Drive `RotateShareTokenButton` success with `rotateShareToken` mocked → `{ok:true,new_share_token:"NEW",new_epoch:6}` **and `next/navigation` `router.refresh` mocked to a no-op**.
- Assert **`OLD` appears nowhere** — not in visible text, not in any `href`/`title`, not in any copy-button target URL (assert copy targets by mocking `navigator.clipboard.writeText` and clicking each Copy button, expecting the `NEW` URL) — and every surface now shows `NEW`. **Failure mode caught:** any surface left server-fed/refresh-only (the R1 chip / R5 open-link hazard) still exposes `OLD` with `refresh` stubbed. Expected values derived from the mock token, not hardcoded.

### 6.3 New — `tests/components/ShareLinkBody.test.tsx`
- token present → URL/Copy/email; token null → unavailable + rotate reachable; empty `crewEmails` → no email buttons; `resetSlot` rendered.

### 6.4 New — `tests/components/ShareChip.test.tsx`, `tests/components/CrewPageLink.test.tsx`
- Visibility gates on `isEligible && token != null`; url/href derived from context token; update on `setToken`.

### 6.5 Update — `tests/components/RotateShareTokenButton.test.tsx`
- Remove assertions for `admin-rotate-share-token-url`, `-copy-button`, `-copy-announce`, `-email-note`, `-email-button`.
- Success (active) → `admin-rotate-share-token-ok` present, confirmation copy, **no URL, no Copy**; `onRotated` called once with the new token.
- `{ok:false}` → `refused`; `onRotated` not called.
- inactive-success → `rotatedInactive`; `onRotated` not called.

### 6.6 New — inactive-token-exposure case (`tests/app/admin/perShowPage.test.tsx` or a dedicated file)
- Render the admin page for an **ineligible** show (`published:false` or `archived:true`) whose server token read returns a real token. Assert the token string does **not** appear anywhere in the rendered client output / serialized provider payload (`isShowEligibleForCrewLink ? token : null` seed). Failure mode caught: unconditional `initialToken={token}` leaks the token for inactive shows (Codex R4-1).

### 6.7 Update — `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/app/admin/perShowPage.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/app/admin/rotateShareToken.test.tsx`
- Wrap rendered subtrees in `ShareTokenProvider` where needed. Fix panel prop shape (`resetSlot`/`isCrewLinkActive`, no `token`/`actions`). Fix removed rotate-banner URL/Copy assertions. Chip/crew-link assertions read from provider-seeded token.

## 7. Invariants / contracts touched

- **Inv 1 (TDD):** every task failing-test-first.
- **Inv 5 (no raw error codes in UI):** unaffected — `refused` copy is static prose.
- **Inv 8 (impeccable dual-gate):** UI surfaces changed (`app/admin/**`, new `app/admin/show/[slug]/*` client files) → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- **Inv 10 (mutation telemetry):** no mutation surface added/changed. The mutating surface `rotateShareToken` (`lib/auth/picker/`, emits `epoch_<n>`, never the token) is untouched. New context/leaf components are non-mutating UI.
- **Security:** the admin-only token read stays server-side in `page.tsx` (`loadShowShareToken`). `ShareTokenProvider` is seeded with the already-authorized token string ONLY for eligible shows (`isShowEligibleForCrewLink ? token : null`, §3.7) — identical trust boundary to today's eligible-only client surfaces; an ineligible show's token is never serialized to the client (Codex R4-1). The provider is **keyed by `show.id`** so a token never crosses show identity into another show's URL (Codex R8). No new token exposure; no token read moves to the client.
- **Meta-test inventory:** none created/extended. No Supabase call boundary, advisory lock, admin-alert catalog, or tile-sentinel surface touched. Declared explicitly per writing-plans rule.
- **BACKLOG follow-up:** `BL-SHARE-LINK-EPOCH-FRESHNESS` — give the admin per-show page true external-rotation freshness (realtime `picker_epoch` subscription, or copy-time token/epoch validation, seeded from an **atomic** token+epoch read — which requires extending the token RPC/DB layer, out of this UI-only change's scope). Pre-existing gap (§2), not a regression from this change.

## 8. Out of scope

- `rotateShareToken` action, RPC, advisory lock, epoch bump; the token-read RPC.
- External-rotation freshness / realtime / atomic token+epoch read (§2, BACKLOG).
- Crew-facing routes.
- Help MDX (`app/help/admin/sharing-links`) — verify copy still accurate; no behavior change expected.
- Any surface NOT derived from the show share `token`.
