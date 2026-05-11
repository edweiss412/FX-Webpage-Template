# Deferred Work

## M6-D12 — Amendment 9 first-seen auto-publish + 24h unpublish undo

Status: deferred from M6 §A after adversarial review round 3 (2026-05-09).

Carrier: M6 coda or the next orchestrator-assigned backend pin before final M6 close.

Scope:

- Retire live-path `FIRST_SEEN_REVIEW` emission for first-seen sheets in `cron`, `push`, and `manual` modes.
- Auto-apply first-seen live sheets when MI-1..MI-14 all pass; continue hard-failing MI-1..MI-5b to `pending_ingestions` and staging MI-6..MI-14 trips with the specific MI sentinel.
- Add `shows.unpublish_token` and `shows.unpublish_token_expires_at`.
- Emit `SHOW_FIRST_PUBLISHED` after auto-publish.
- Implement `POST /api/show/[slug]/unpublish?token=...` with token consumed, expired, and success branches; emit `SHOW_UNPUBLISHED` and revoke affected links on success.
- Keep onboarding-scan first-seen sheets in explicit-review mode with `ONBOARDING_SCAN_REVIEW`.

Reason: Amendment 9 was ratified after the Pin-stop 2 extension code path and is larger than the Tasks 6.8-6.10 review-repair scope. The current M6 backend still follows the pre-amendment live first-seen staging behavior and must not be reported as satisfying amended AC-6.11.

Blocking note: M6 final close cannot claim Amendment 9 / amended AC-6.11 behavior until this item ships and passes its own adversarial review.

---

## M7-D1 — Gallery + agenda lightbox entry/exit motion

Status: deferred from M7 Task 7.9 §12 impeccable critique (round 1, 2026-05-11).

Carrier: M9 polish.

Scope:

- Wrap `GalleryLightbox` and `AgendaSheet` openings in a `framer-motion` `AnimatePresence` transition: opacity 0→1 and `scale: 0.96 → 1` enter / reverse exit. Duration consumes `--duration-normal` (220ms) and easing consumes `--ease-out-quart` from DESIGN.md §5.
- Gate motion via `prefers-reduced-motion` so the existing `app/globals.css` reduction sets duration to 0ms.

Reason: shipping the lightbox + sheet without an entry crossfade is a perceptible "first-pass implementation" tell against native phone galleries (Apple Photos / Google Photos both use a brief shared-element scale). v1 ships functional + accessible (focus trap, page counter, swipe carries information about position) but the polish moment is M9's job to land alongside the other motion-touch tasks.

Blocking note: AC-7.1 / AC-7.2 / AC-7.7 do not require entry motion; M7 close is not blocked.

---

## M7-D2 — AgendaPdfViewer error states routed through messageFor

Status: deferred from M7 Task 7.9 §12 impeccable audit (G.3, 2026-05-11).

Carrier: M9 polish OR earlier if a §12.4 catalog row for crew-facing PDF errors lands.

Scope:

- Replace the single "couldn't open the agenda right now" copy in `components/agenda/AgendaPdfViewer.tsx` with a `messageFor(...)` lookup so 410 / 401 / 500 surface distinct crew-facing copy (per AGENTS.md §1.5 — no raw error codes, but also: distinct user-facing messages should map to distinct catalog entries).
- Inspect `react-pdf`'s `onLoadError` payload to derive an HTTP status hint. If `react-pdf` doesn't expose status, run a HEAD fetch against the proxy URL first and route on its status.
- Add new §12.4 catalog rows where needed: `AGENDA_GONE_FOR_CREW` (410) and `AGENDA_UNAUTHENTICATED` (401) with crew-facing copy that suggests reopening Doug's link.

Reason: v1 collapses every PDF load failure to a single retry-able message. The retry-able framing is correct for transient infra faults but wrong for permanent 410 (file removed / non-PDF / drift) where retrying spins. The fix needs new catalog rows and the X.1 spec extractor parity test pinned, which is more scope than the M7 close-out can absorb.

Blocking note: AC-7.1 closes at M7 — the proxy route + inline embed works; only the failure-state copy is deferred.

---

## M7-D3 — Diagrams gallery `<img>` → `next/image`

Status: deferred from M7 Task 7.9 §12 impeccable audit (`@next/next/no-img-element` lint warnings, 2026-05-11).

Carrier: M9 polish.

Scope:

- Migrate `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` from `<img>` to `next/image`. Asset URLs are proxied through `/api/asset/diagram/...` which already returns auth-checked bytes with `private, max-age=0, must-revalidate` — `next/image`'s `/_next/image` optimizer would either need to bypass the auth proxy OR add a second redirect layer.
- Most likely path: declare the proxy origin as a `next.config.ts` remote pattern (same origin) and let `next/image` proxy through it; verify the resulting Cache-Control is still `private` so revocation propagates.

Reason: the current `<img loading="lazy" decoding="async">` is the manual equivalent and works fine on the mobile crew page (390px, single column at the right density). The lint warning is informational, not a ban. The `next/image` migration needs a careful interaction-test against the proxy's auth + cache contract — too much scope for the close-out.

Blocking note: AC-7.4 closes at M7 — the bytes go through the proxy route, no Drive URL leaks; the LCP optimization is the only deferral.

---

## M7-D4 — Pinch-zoom inside lightbox figures

Status: deferred from M7 Task 7.9 §12 impeccable critique (LD persona red flag, 2026-05-11).

Carrier: M9 polish.

Scope:

- Add `react-zoom-pan-pinch` (or equivalent) inside each `<figure>` of `GalleryLightbox.tsx` so a crew member can pinch-zoom a diagram for detail (truss positions, stage plot dimensions). Embla's swipe gesture must be temporarily disabled while a zoom is in flight; restore on pinch-end.
- Verify gesture priority: pinch wins over swipe when two fingers are down; single-finger swipe still navigates between images.

Reason: LD persona explicitly needs pinch-zoom on diagrams. v1 ships native browser image rendering inside the swipe carousel — Embla intercepts touch events, so pinch-zoom on iOS doesn't work reliably. Crew workaround: long-press → "Open image in new tab" → use Safari's native zoom. Acceptable for v1; native-feeling in v2.

Blocking note: AC-7.2 closes at M7 — the gallery + swipe behavior works; pinch-zoom is a deferred polish.

---

## M7-D5 — Sentinel-hiding helper for diagrams + agenda emptiness

Status: deferred from M7 Task 7.9 §12 impeccable audit (G.5, 2026-05-11).

Carrier: M9 polish.

Scope:

- Add `shouldHideDiagrams(diagrams, agendaLinks)` to `lib/visibility/emptyState.ts` so the §8.3 generic-optional sentinel-hiding contract has a single source of truth for diagram-tile emptiness.
- Register the new helper in `tests/components/tiles/_metaSentinelHidingContract.test.ts` so the meta-contract walks DiagramsTile alongside the other sentinel-bearing tiles.

Reason: DiagramsTile currently uses inline boolean checks (`items.length > 0`, `agendaLinks.some((link) => Boolean(link.fileId))`). Both are MEDIA-presence checks, not text-sentinel checks — they don't pattern-match the existing `shouldHideGenericOptional` (which hides "TBD" / "N/A" / "TBA"). The audit flagged this as a §1.9 meta-test coverage gap rather than a bug. v1 works correctly; the helper extraction is a discipline polish.

Blocking note: AC-7.2 + AC-7.7 close at M7 — DiagramsTile returns null on whole-tile-missing per §8.3 already.
