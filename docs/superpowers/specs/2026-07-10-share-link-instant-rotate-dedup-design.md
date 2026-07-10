# Share-link instant-rotate + success-banner dedup — design

**Date:** 2026-07-10
**Status:** Draft (brainstorming → spec)
**Scope:** Admin per-show page share-link card. UI-only refactor. No DB, no advisory-lock, no server-action signature change.

---

## 1. Problem

On the admin per-show page (`app/admin/show/[slug]/page.tsx`), after rotating the share link the UI shows the **same URL twice with two Copy buttons**:

1. The persistent **`CurrentShareLinkPanel`** (top of the "Share & access" card) — URL + `ShareLinkCopyButton` + "Email this link to crew" buttons.
2. The **`RotateShareTokenButton`** post-rotate **success banner** — an identical URL + Copy button + "Email crew" buttons.

Screenshot: `scratchpad/shots/11-post-rotate-success.png`. Both blocks render the identical new URL, stacked ~2 rows apart. Redundant.

### 1.1 Why the redundancy exists today (root cause)

`CurrentShareLinkPanel` is a **Server Component** — it renders the URL from a `token` prop read server-side (`app/admin/show/[slug]/page.tsx:294-387`, admin-only `loadShowShareToken` RPC). `RotateShareTokenButton` is a **client** sibling nested inside the panel via its `actions` prop (`page.tsx:819-837`).

On rotate success (`RotateShareTokenButton.tsx:136-151`) the client:
- sets local `result` (new token) → banner renders the new URL **instantly**, then
- calls `router.refresh()` → the whole page re-renders server-side → the panel re-reads the new token.

Because the panel can only update via a server round-trip, the banner carries its own copy of the new URL to cover the **refresh-lag window** — the interval where the panel still shows the OLD (now-dead) token but its Copy button is live. Comment `CurrentShareLinkPanel.tsx:21-27` documents this "banner is authoritative during refresh" contract.

**Consequence:** persistent duplicated URL/Copy/email in steady state, plus a real (if sub-second) hazard — during the refresh window an admin could copy the panel's dead URL and send it to crew.

## 2. Goal

- **Single source of truth** for the copyable share URL = the persistent card.
- Rotate success updates the displayed URL **instantly** (no refresh-lag window, no dead-URL copy hazard).
- Rotate success banner becomes a **confirmation-only** status (no URL, no Copy, no email buttons) that points at the updated card.

Non-goals: no change to `rotateShareToken` server action, its telemetry, the advisory lock, or the token-read RPC. No visual redesign of the card beyond removing the duplicated block.

## 3. Approach (A-solid — chosen)

Give the token display **client state** seeded by the server token, updated directly by rotate. Rejected alternative "A-lite" (banner→confirmation-only, rely on `router.refresh()`) leaves the theoretical dead-URL race; user chose the race-free path.

### 3.1 Component structure after

| Component | Kind | Responsibility |
|---|---|---|
| `page.tsx` | server | Reads `token` once (admin RPC). Renders `<CurrentShareLinkPanel>` with structured props (below). Builds `resetSlot={<PickerResetControl showId crew/>}` server-side (keeps `crew` off the client). |
| `CurrentShareLinkPanel.tsx` | server | Token resolution (prop or self-read fallback) + card chrome/heading. Renders client `<ShareLinkBody initialToken={token} …/>`. |
| **`ShareLinkBody.tsx` (NEW)** | client | Owns `token` state. Renders URL/Copy/email (token) OR unavailable notice (null); hosts `RotateShareTokenButton` (with `onRotated`) + `resetSlot`. |
| `RotateShareTokenButton.tsx` | client | Two-tap confirm + rotate action. Success → `onRotated?.(newToken)` + `router.refresh()` backstop. Banner is confirmation-only. |
| `ShareLinkCopyButton.tsx`, `PickerResetControl.tsx`, `crewLinkMailto.ts`, `resolveOrigin.ts` | unchanged | Reused. All client-safe. |

### 3.2 `ShareLinkBody` (new client component)

Props:
- `initialToken: string | null`
- `slug: string`
- `showId: string`
- `crewEmails: readonly string[]`
- `showTitle: string`
- `isCrewLinkActive: boolean`
- `resetSlot: ReactNode` (server-rendered `PickerResetControl`)

State:
```ts
const [token, setToken] = useState(initialToken);
useEffect(() => setToken(initialToken), [initialToken]);
```

Render:
- **`token` present** → `url = ${resolveOrigin()}/show/${slug}/${token}`; render `<code data-testid="admin-current-share-link-url">{url}</code>` + `<ShareLinkCopyButton url={url}/>` + email note/buttons via `buildCrewLinkMailtos({emails:crewEmails,url,showTitle})` (same testids as today's panel: `admin-current-share-link-email-note`, `admin-current-share-link-email-button`).
- **`token` null** → existing "unavailable" notice (`admin-current-share-link-unavailable`).
- **Always** → divider actions block (`border-t divide-y`): `<RotateShareTokenButton showId slug isCrewLinkActive onRotated={setToken} compact rowLabel="Rotate share link" rowDescription="Mint a new link; the old one stops working immediately."/>` then `{resetSlot}`.

**Why `useEffect` sync:** our own rotate sets `token` instantly; the follow-up `router.refresh()` delivers the same value as a new `initialToken` (effect no-op). An **external** rotation (another admin/tab) arrives only via server refresh → new `initialToken` → effect syncs the display. `token` state is the single render source in all cases.

### 3.3 `CurrentShareLinkPanel` changes

- Keep: token resolution (`tokenProp !== undefined ? tokenProp : try loadShowShareToken`), card outer chrome, `<h3>Current share-link</h3>` + the "Send this URL…" description.
- Replace the inline URL/Copy/email/unavailable/`{actions}` body with a single `<ShareLinkBody initialToken={token} slug={slug} showId={showId} crewEmails={crewEmails} showTitle={showTitle} isCrewLinkActive={isCrewLinkActive} resetSlot={resetSlot}/>`.
- **Props:** remove opaque `actions?: ReactNode`; add `resetSlot?: ReactNode` and `isCrewLinkActive?: boolean` (default `true`). Keep `showId, slug, token?, crewEmails, showTitle`.
- The `token`-null branch's "unavailable" copy + the `admin-current-share-link-panel` wrapper testid move into `ShareLinkBody` (panel still wraps the card border). The panel remains a Server Component (token read stays server-side — security invariant).

### 3.4 `RotateShareTokenButton` changes

- **Add** prop `onRotated?: (newToken: string) => void`. Default omitted (standalone/legacy uses unaffected).
- **`onConfirmClick` success branch:** after `setResult(r)`, if `r.ok` call `onRotated?.(r.new_share_token)` **then** `router.refresh()` (backstop for the header chip + other server-derived data).
- **Banner (`newUrl` block, current lines 221-285) → confirmation-only:**
  ```
  ✓ New share-link ready. The old link no longer works and everyone will
    re-pick their name — the updated link is shown above.
  ```
  Keep `data-testid="admin-rotate-share-token-ok"`, `role="status"`, `aria-live="polite"`.
- **Remove:** the URL `<code>`, the Copy button, email note, email buttons, the sr-only copy-announce span. **Delete now-dead code:** `onCopyClick`, `copied` state, `copyResetRef` + its `clearCopyReset`/cleanup, `emailMailtos`, the `newUrl`-for-display use, `buildCrewLinkMailtos` + `Mail` imports (verify `Mail` unused elsewhere in file first).
- **Drop props** `crewEmails`, `showTitle` (email affordance now lives solely in `ShareLinkBody`).
- **Keep:** `rotatedInactive` branch (`admin-rotate-share-token-ok-inactive`), `refused` branch (`admin-rotate-share-token-refused`), the whole two-tap confirm/cancel state machine, `AUTO_REVERT_MS`, aria wiring, compact/rowLabel layout.
- **Note:** `isCrewLinkActive` prop is retained — the `rotatedInactive` message still depends on it. In the page path it is always `true` (the panel only renders when the show is crew-link-eligible, `page.tsx:799`), but the branch is kept for standalone/test use per the original R27 intent.

### 3.5 `page.tsx` changes

Replace the `<CurrentShareLinkPanel>` call (`page.tsx:813-838`):
- Remove `actions={<div className="…divide-y…"><RotateShareTokenButton …/><PickerResetControl …/></div>}`.
- Add `isCrewLinkActive={isShowEligibleForCrewLink}` and `resetSlot={<PickerResetControl showId={show.id} crew={crew}/>}`.
- Keep `showId, slug, token, crewEmails, showTitle`.
- Remove the now-unused `RotateShareTokenButton` import if no other use in the file (verify).

## 4. Guard conditions (per-input)

| Input | null / empty / edge | Behavior |
|---|---|---|
| `initialToken` | `null` | `ShareLinkBody` renders unavailable notice; rotate + reset still render (rotate reachable to recover — original R1/R27 contract). |
| `initialToken` | new value from refresh | `useEffect` resyncs `token` state. |
| `crewEmails` | `[]` | No email note, no email buttons (both `.length` guards, unchanged from today). |
| `crewEmails` | 1 addr | Single "Email this link to crew" button, no batch note (`emailMailtos.length === 1`). |
| rotate `result` | `{ok:false}` | `refused` banner; `token` state unchanged; no `onRotated` call. |
| rotate `result` | `{ok:true}` while `isCrewLinkActive===false` | `rotatedInactive` banner; **no** `onRotated` call (no live URL to show); `token` state unchanged. |
| `onRotated` | omitted | Rotate falls back to `router.refresh()`-only (legacy behavior); banner still confirmation-only. |

## 5. Transition inventory (rotate button visual states)

States: `idle` (± persistent banner), `confirm`, `resolving`. Unchanged by this work except the success banner's content. No new animated transitions introduced; all state swaps remain instant (existing behavior — no `AnimatePresence` in this component). The URL-display update in `ShareLinkBody` is an instant text swap (no animation).

## 6. Testing

TDD per task (invariant 1). Anti-tautology per project rules.

### 6.1 New — `tests/components/ShareLinkBody.test.tsx`
- **Key behavior (the whole point):** render `<ShareLinkBody initialToken="OLD" …/>`; assert `admin-current-share-link-url` contains `OLD`. Simulate rotate success by driving `RotateShareTokenButton` with `rotateShareToken` mocked to `{ok:true,new_share_token:"NEW",new_epoch:n}` **and `next/navigation` `router.refresh` mocked to a no-op**. Assert `admin-current-share-link-url` now contains `NEW`. **This proves the instant, refresh-independent update** — the failure mode it catches: reverting to refresh-only leaves the URL at `OLD`. Assert expected values derived from the mock token, not hardcoded elsewhere.
- Unavailable path: `initialToken={null}` → `admin-current-share-link-unavailable`; rotate + resetSlot still present.
- External sync: rerender with a new `initialToken` prop → URL reflects it.
- Empty `crewEmails` → no email buttons.

### 6.2 Update — `tests/components/RotateShareTokenButton.test.tsx`
- Remove assertions for `admin-rotate-share-token-url`, `-copy-button`, `-copy-announce`, `-email-note`, `-email-button`.
- Success → `admin-rotate-share-token-ok` present, contains confirmation copy, **contains no URL** and no Copy button.
- Success → `onRotated` called once with the new token.
- `{ok:false}` → `refused`, `onRotated` not called.
- inactive-success → `rotatedInactive`, `onRotated` not called.

### 6.3 Update — `tests/components/CurrentShareLinkPanel.test.tsx`
- Panel now renders `ShareLinkBody`; assert URL/Copy still reachable via `admin-current-share-link-url` / copy button through the child.
- Panel forwards `resetSlot` (reset control present) and `isCrewLinkActive`.
- token-null → unavailable notice + rotate reachable.

### 6.4 Update — `tests/app/admin/perShowPage.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/app/admin/rotateShareToken.test.tsx`
- Fix call sites / assertions for the new panel prop shape (`resetSlot`/`isCrewLinkActive` instead of `actions`) and the removed rotate-banner URL/Copy.

## 7. Invariants / contracts touched

- **Inv 1 (TDD):** every task failing-test-first.
- **Inv 5 (no raw error codes in UI):** unaffected — `refused` copy is already static prose, not a code.
- **Inv 8 (impeccable dual-gate):** UI surfaces changed (`app/admin/**`, new `components`/`app` client file) → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`'d.
- **Inv 10 (mutation telemetry):** no mutation surface added/changed. The mutating surface is `rotateShareToken` (`lib/auth/picker/`), already instrumented (emits `epoch_<n>`, never the token) — untouched. `ShareLinkBody`/panel/button are non-mutating UI.
- **Security:** admin-only token read stays server-side (`page.tsx` → `loadShowShareToken`). `ShareLinkBody` receives an already-authorized token string, identical to today's `ShareLinkCopyButton` client boundary. No new token exposure.
- **Meta-test inventory:** none created/extended. No Supabase call boundary, advisory lock, admin-alert catalog, or tile-sentinel surface touched. Declared explicitly per writing-plans rule.

## 8. Out of scope

- `rotateShareToken` action, RPC, advisory lock, epoch bump.
- Any change to the header share-chip (`page.tsx:575` `ShareLinkCopyButton`) beyond it continuing to update via `router.refresh()`.
- Crew-facing routes; help MDX (`app/help/admin/sharing-links`) — verify copy still accurate but no behavior change expected.
