# Shape brief — Auth flow polish (Cluster C3)

**Date:** 2026-05-14
**Cluster:** C3
**Items:** M5-D1 (/me anchor), M5-D2 (Bootstrap liveness + timeout), M5-D5 (self-serve fallbacks)
**Implementer:** Opus / Claude Code
**Status:** Awaiting confirmation

---

## 1. Feature Summary

Polish the three auth-adjacent surfaces (`/me`, `/show/[slug]/p` bootstrap shell, `/auth/sign-in`) so crew can confidently recover from any failure path without paging Doug. Three coordinated moves: a featured "Next up" card on `/me`, a sequenced-dots liveness signal + 6s retry timeout on Bootstrap, and three self-serve fallback paths across the bootstrap-error / no-fragment / sign-in surfaces.

## 2. Primary User Action

- **/me:** "Where am I going next?" — answered in <2 seconds by the featured card at the top.
- **Bootstrap:** "Is this loading or stuck?" — answered within the first 1-2 seconds (sequenced dots animate) and definitively by 6 seconds (Retry button materialises).
- **Sign-in:** "I'm stuck — what now?" — answered without needing to find Doug's number.

## 3. Design Direction

- **Color strategy:** Restrained. Orange remains ≤10% — used on the "Next up" relative-time chip on `/me` (the singular brand moment on that page) and on the Retry button after Bootstrap timeout. Nowhere else in this cluster.
- **Theme scene sentence:** Crew member opens `/me` on a hotel-lobby couch the night before load-in, scrolling once to confirm tomorrow's call; OR crew taps a signed link on a venue loading dock with one bar of LTE and waits to see if it's actually working. Both scenes drive the same answer: instant clarity in the first second, escalation paths if it's not.
- **Anchor references:**
  - Apple Calendar's "Next event" widget (a single featured row with relative time, the rest in a calmer list).
  - Linear's loading state (subtle, named-state language, never spinners-as-decoration).
  - Stripe's checkout "having trouble?" footer (small, calm, never desperate).
- **Anti-references:** GitHub's loading bar (too SaaS-y). Slack's "Trying to reconnect..." reload prompt (panicky). Bootstrappy modal "An error occurred."

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** Three files materially changed — `app/me/page.tsx`, `app/show/[slug]/p/Bootstrap.tsx`, `app/auth/sign-in/page.tsx`. Plus one new shared util (`lib/time/relativeDays.ts` — relative-day helper for the "Next up" chip).
- **Interactivity:** Two new interactive paths — the Bootstrap Retry button (after timeout) and the `/me` "Past (N) ▸" expand/collapse.
- **Time intent:** Polish-until-it-ships. C3 is the auth-trust foundation; if these surfaces feel uncertain, every downstream crew experience suffers.

## 5. Layout Strategy

### 5.1 `/me` page — featured card + grouped lists (M5-D1)

```
┌─────────────────────────────────┐
│  Signed in as eric@fxav.net     │  ← unchanged header strip
│  [Sign out]                     │
└─────────────────────────────────┘

NEXT UP                                ← text-xs uppercase tracking-eyebrow
┌─────────────────────────────────────┐
│ [Tomorrow] Spring Tour 2026         │ ← featured: 2x vertical padding,
│ Hilton Anatole · Apr 17, 2026       │   text-lg title, accent chip for
│                                     │   relative-time
└─────────────────────────────────────┘

UPCOMING                               ← only renders if ≥1 upcoming after the featured
┌──────────────────────────────────────┐
│ Brand Summit       In 12 days      ▸ │ ← regular list row, 56px tap target
│ Hilton Anatole, Apr 29, 2026         │
├──────────────────────────────────────┤
│ Annual Gala        In 28 days      ▸ │
│ Convention Center, May 15, 2026      │
└──────────────────────────────────────┘

PAST  (3) ▸                            ← collapsed by default; click to expand
  ┌─ Brand Summit '25 ...─┐
```

**Grouping rules:**
- "Most soonest" = the show with the earliest `dates.set ?? dates.travelIn ?? dates.showDays[0]` that is **>= today**. If all shows are in the past, NEXT UP shows the most recent past show with an "Ended N days ago" chip, and UPCOMING + the implicit-empty handling are skipped.
- "Upcoming" = all shows future-dated, sorted ascending, EXCLUDING the featured show.
- "Past" = all shows ended (`dates.set < today` AND no upcoming show-day), sorted descending. Default collapsed; click `(N) ▸` reveals.

**Relative-time chip:**
- `In 0 days` → `Today` (orange chip background, `text-accent-text` on `bg-accent`).
- `In 1 day` → `Tomorrow` (orange chip).
- `In 2-7 days` → `In N days` (neutral chip — `bg-info-bg`, `text-text` — no accent).
- `In 8+ days` → `In N days` or `In N weeks` if >= 14 (neutral).
- Past: `Ended N days ago` / `Ended` (no chip background, `text-text-subtle`).

**Empty state:** if `shows.length === 0`, current empty-state copy remains; no featured card. ("You're not listed on any shows yet. Doug will share a link when you are.")

### 5.2 Bootstrap shell — sequenced dots + 6s timeout (M5-D2)

```
[ 0-6 seconds — connecting ]

Connecting  • • •           ← three dots pulse in sequence

[ 6+ seconds — still_working ]

Still working…
This is taking longer than usual.

[ Retry ]   Sign in with Google instead   ← M5-D5 self-serve fallback

[ on error after retry or initial fetch fail ]

Couldn't reach the server. Try signing in instead.

[ Sign in with Google instead ]
```

**State machine additions:**
| State | Trigger | What renders |
|---|---|---|
| `connecting` (existing) | initial | "Connecting" + 3 sequenced dots |
| `still_working` (NEW) | 6s elapsed in `connecting` | "Still working… / This is taking longer than usual." + dots continue + [Retry] button + 'Sign in with Google instead' link |
| `error` (existing) | fetch failure OR retry exhausts | "Couldn't reach the server. Try signing in instead." + [Sign in with Google instead] button |
| `no_fragment` (existing, M5-D5 extension) | URL has no `#token` | "This link is incomplete. If you already have a session, go to your shows." + [Go to my shows] link |

**Dot animation:**
- Three dots, each `2px × 2px` (matches `--icon-sm` reduced).
- Color: `text-text-subtle` (not orange — orange reserved for Retry button).
- Each dot pulses opacity 0.3 → 1.0 → 0.3 over `--duration-normal` (220ms).
- Stagger: dot 1 starts at 0ms, dot 2 at `--duration-normal / 3` (~70ms), dot 3 at `--duration-normal * 2 / 3` (~150ms). Loop continuously.
- `@media (prefers-reduced-motion: reduce)`: all dots stay at opacity 1.0 (no animation), spaced horizontally. The dots present as static "•••" to signify connection is in progress.

**6s timeout:**
- Single `setTimeout(() => { if (ui.kind === 'connecting') setUi({ kind: 'still_working' }) }, 6000)` in the existing bootstrap useEffect. Cleared on unmount or state transition.
- Retry button calls the same fetch path the initial connecting state ran. On retry success → `router.replace`. On retry failure → `error` state.
- The 6s window is **liveness signal, not abort timeout**. The original bootstrap fetch continues to run; if it succeeds before retry is clicked, the connecting state resolves normally and the still_working render unmounts.

### 5.3 Sign-in page — secondary path + help disclosure (M5-D5)

```
[ existing FXAV wordmark + "Sign in with your work email" headline ]

[ Sign in with Google ]   ← existing primary button

────────────────────────  ← hairline divider, text-text-faint
        OR
View show list           ← secondary link, text-sm text-text-subtle,
                            href="/me", small text

[ at page bottom, after inline-error region ]

Need help signing in?
Contact your project manager.   ← text-xs text-text-subtle
```

**Implementation notes:**
- "View show list" link sits between the Google button and the inline-error region. It's a quieter `<Link href="/me">` styled as `text-sm text-text-subtle underline-offset-2 hover:text-text`. Acts as the escape hatch for already-signed-in crew who hit the page accidentally.
- "Need help signing in?" disclosure: literal static copy, no email exposed in v1. (Doug's email lives in env vars / the admin allow-list; surfacing it on the public sign-in page is a footgun.) If/when a `SUPPORT_EMAIL` env var ships, the copy upgrades to `Contact <support@…>`. For now, plain language tells crew that someone other than the page itself can help — which is the gap M5-D5 actually fills.

## 6. Key States

### /me states
| State | What renders |
|---|---|
| Default (≥2 shows, mix of past/future) | Featured + Upcoming list + Past collapsed |
| Only 1 future show | Featured only; no UPCOMING section, no PAST section unless past shows exist |
| Only past shows | Featured = most recent past with "Ended" chip; PAST section collapsed below |
| Empty | Existing empty-state copy ("You're not listed on any shows yet…") |
| Single past show only | Featured = that show with "Ended" chip; no PAST section |

### Bootstrap states
Already enumerated in §5.2 table. Additions: `still_working` and the M5-D5 fallback links in `no_fragment` / `error` states.

### Sign-in states
| State | What renders |
|---|---|
| Default (unauthenticated, no error) | Wordmark + headline + Google button + OR divider + View show list + Need help disclosure |
| Inline-error (auth failed) | Above + existing inline-error region between Google button and OR divider |
| Already signed in (race-condition arrival) | Existing redirect to `/me` — no UI render. |

## 7. Interaction Model

- **/me Past expand/collapse:** server-rendered details/summary disclosure. No JS required. On expand, focus stays on the disclosure summary. ARIA: `<details>` + `<summary>` with `aria-expanded` reflected automatically.
- **Bootstrap Retry button:** orange CTA. On click: clears the still_working state, sets back to connecting, re-runs the bootstrap fetch. Disabled during in-flight retry (existing fetch's `controller.signal`). Re-disable styling via `disabled:opacity-50 disabled:cursor-not-allowed`.
- **Bootstrap "Sign in with Google instead":** Link to `/auth/sign-in?next=/show/${slug}` so successful Google sign-in lands the crew member on the show they were trying to reach. `Link` (not `<a>`) for App Router prefetch.
- **Sign-in "View show list":** Link to `/me`. Triggers normal Next.js navigation; auth gate redirects to sign-in if no session, which is the no-op self-recovery loop.

## 8. Content Requirements

| Surface | Literal copy |
|---|---|
| /me NEXT UP eyebrow | `NEXT UP` |
| /me UPCOMING eyebrow | `UPCOMING` |
| /me PAST eyebrow | `PAST  (N)` where N = past show count |
| /me empty state | `You're not listed on any shows yet. When Doug adds you to a crew, you'll see it here.` (existing copy preserved) |
| /me chip: today | `Today` |
| /me chip: tomorrow | `Tomorrow` |
| /me chip: in N days | `In N days` |
| /me chip: in N weeks | `In N weeks` (>= 14 days) |
| /me chip: past | `Ended` (today) / `Ended N days ago` / `Ended N weeks ago` |
| Bootstrap connecting | `Connecting` + animated dots (no ellipsis suffix — the dots ARE the ellipsis) |
| Bootstrap still_working | `Still working…` (heading) / `This is taking longer than usual.` (body) |
| Bootstrap retry button | `Retry` |
| Bootstrap signin-fallback link | `Sign in with Google instead` |
| Bootstrap error (existing replaced) | `Couldn't reach the server. Try signing in instead.` |
| Bootstrap no_fragment (existing replaced) | `This link is incomplete. If you already have a session, go to your shows.` |
| Bootstrap no_fragment fallback | `Go to my shows` |
| Sign-in OR divider | `OR` |
| Sign-in secondary | `View show list` |
| Sign-in help disclosure heading | `Need help signing in?` |
| Sign-in help disclosure body | `Contact your project manager.` |

## 9. Recommended References

- DESIGN.md §2.6 — eyebrow tracking tokens (NEXT UP / UPCOMING / PAST all consume `tracking-eyebrow`).
- DESIGN.md §5 — motion tokens (`--duration-normal`, `prefers-reduced-motion` discipline).
- Spec §7.3 — /me page contract.
- Spec §A redeem-link route — Bootstrap state machine.
- Memory `feedback_tailwind_v4_flex_items_stretch.md`.

## 10. Open Questions

1. **`lib/time/relativeDays.ts` placement** — does an existing helper already cover this? `lib/time/relative.ts` exists (M9 C0 Task 9.1 stale-footer helper) — extend it rather than create a new file. Implementation will check and reuse.
2. **"Ended" timing precision** — "Ended" vs "Ended 2 days ago": at what wall-clock moment does today's-show flip from "Today" to "Ended"? Use end-of-day UTC for simplicity (matches existing `pickShowDate` boundary).
3. **PAST disclosure default-state** — collapsed by default per brief. Implementation may discover that an auto-expand when no upcoming shows is cleaner; that's a build-time refinement.
4. **Retry button retry count cap** — 3 retries before locking the button? Or infinite? Default to infinite; the user can re-open the original link. (Aligns with existing bootstrapMint retry semantics — the helper itself has a retry loop; the UI retry just re-enters the whole flow.)

## 11. Anti-goals

- **No spinner.** Spinners signal "we don't know how long this takes." The sequenced dots signal "we know what we're waiting for."
- **No timeout-as-abort.** The 6s timer is a presentation flip, not an abort. Killing the in-flight fetch on timeout would make the retry-on-6s race the original fetch's success.
- **No "press if you don't see anything" backup.** That's a panic UX. The dots and the still_working state are sufficient.
- **No Doug-email-on-sign-in-page.** The page is publicly indexable; Doug's email isn't.
- **No new tokens.** Chip backgrounds reuse `--color-info-bg` / `--color-accent` / `--color-accent-text` / `--color-text-subtle`.

## 12. Definition of done

- `app/me/page.tsx` renders featured card + UPCOMING list + PAST disclosure per §5.1.
- `lib/time/relative.ts` extended with `relativeDayChip(iso)` helper that returns the chip label.
- `app/show/[slug]/p/Bootstrap.tsx` renders sequenced-dots animation in `connecting`; transitions to `still_working` at 6s; Retry button re-enters the fetch.
- `app/show/[slug]/p/Bootstrap.tsx` `error` and `no_fragment` states render M5-D5 fallback links per §5.2.
- `app/auth/sign-in/page.tsx` renders OR divider + View show list link + Need help disclosure per §5.3.
- Reduced-motion media query disables dot animation (dots present statically).
- Server-rendered focus posture: details/summary on /me; no JS focus management needed for Bootstrap (state changes are within a single aria-live region established by C8).
- All affected unit + e2e tests updated.
- `pnpm typecheck` + `pnpm lint` clean.
- `/impeccable critique` + `/impeccable audit` dual gate pass on the C3 diff.
- Codex adversarial review converges to APPROVE.
