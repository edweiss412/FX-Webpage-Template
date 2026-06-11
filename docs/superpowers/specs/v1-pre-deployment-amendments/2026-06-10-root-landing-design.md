# Root `/` landing — design

**Date:** 2026-06-10
**Status:** Draft (pending self-review + cross-model adversarial review)
**Branch:** `spec/root-landing` (git worktree at `../FX-Webpage-Template-root-landing`; main checkout stays free for parallel feature work)
**Origin:** M12.3 follow-up — "Root `/` is a bare scaffold stub (`app/page.tsx` = just `<h1>FXAV Crew Pages</h1>`) — offered a real landing/redirect; pending owner." Owner picked it up 2026-06-10.
**Routing:** UI milestone → **Opus implements** (impeccable v3 dual-gate, external attestation), **Codex reviews**. No DB changes, no migrations, no new API routes.

---

## 1. Summary

Replace the root stub with a real front door. Signed-in visitors never see it — the page server-redirects them into the existing sign-in resolution, which already routes admin → `/admin` and non-admin → `/me`. Anonymous visitors get one calm branded card (option C of the explored variants, trimmed per owner): FXAV mark, "Sign in with Google" CTA, divider, one line of lost-link guidance for crew.

## 2. Resolved decisions (owner Q&A, 2026-06-10)

Ratified; do not relitigate.

| # | Decision |
|---|----------|
| D-1 | `/` = **branded landing + sign-in CTA** for anonymous visitors; **server redirect** for signed-in visitors. Not a pure redirect; not a session-inspecting smart router beyond what sign-in already does. |
| D-2 | Post-sign-in routing reuses the EXISTING `/auth/sign-in?next=/admin` resolution — confirmed admin keeps `/admin`, confirmed non-admin falls back to `/me` (`app/auth/sign-in/page.tsx:117-134` semantics). The landing adds ZERO new auth logic. |
| D-3 | Visual = **option C ("card on warm surface"), with the description line above the button removed**. Card contents exactly: mark row, Google CTA, divider, crew lost-link line. |
| D-4 | CTA is a plain `<Link>` to `/auth/sign-in?next=/admin` — no client JS on the page. Trade-off acknowledged: a signed-OUT visitor clicks "Sign in with Google" and lands on the sign-in page's own "Sign in with Google" button (two doors). Accepted: it keeps OAuth initiation, PKCE cookies, and the cataloged error block on the single existing surface (`app/auth/sign-in/page.tsx` + `SignInButton.tsx`). The rejected alternative (embedding `SignInButton` on `/` for one-click OAuth) would create a second OAuth entry surface whose failure modes render on a different page than the user initiated from. |

## 3. Current state (verified citations, 2026-06-10 @ `main` `3284a4cc`)

- `app/page.tsx` — the stub: `<main className="p-8"><h1 className="text-3xl font-bold">FXAV Crew Pages</h1></main>` (whole file, 7 lines).
- Sign-in already-authenticated guard: `app/auth/sign-in/page.tsx:74-116` — `createSupabaseServerClient()` + `supabase.auth.getUser()` BOTH wrapped in try/catch (R19 F4); throw ⇒ `ADMIN_SESSION_LOOKUP_FAILED` block; returned-error ⇒ fall through to CTA; valid user ⇒ redirect via the `next` resolution.
- Admin/crew split: `app/auth/sign-in/page.tsx:117-134` — `isAdminPath` (`:60-62`, regex `/^\/admin(?:\/|$)/`) gates an adminship check; confirmed admin keeps the `/admin` path; confirmed non-admin ⇒ `redirectPath = "/me"`.
- `validateNextParam` lives with the sign-in surface (consumed at `app/auth/sign-in/page.tsx:71`); `/admin` is a valid `next` (the regex above admits it).
- Sign-in page chrome to mirror: wordmark `img src="/brand/fxav-wordmark.png"` … `className="mx-auto mb-6 h-auto w-24 select-none"` (`app/auth/sign-in/page.tsx:181-188`), headline `text-3xl font-bold text-text-strong` (`:190-195`), OAuth initiation via `<SignInButton validatedNext={...} />` (`:202`, component `app/auth/sign-in/SignInButton.tsx`).
- `/me` = cross-show crew landing: identity gate + `listShowsForCrew` + empty state (`app/me/page.tsx` header block).
- Auth-chain audit walks `app/api`, `app/admin`, `app/show`, `app/me` only (`lib/audit/protectedRoutes.ts:43`) — root `app/page.tsx` is outside the walk; no `PROTECTED_ROUTES` row exists or is needed (public page).
- Tokens available: `--spacing-tap-min: 44px` (`app/globals.css:141`), card vocabulary `rounded-md border border-border bg-surface …` used across admin/sign-in surfaces; warm page background + `bg-surface-sunken`/`bg-surface` pairs in `app/globals.css` `@theme`.
- Root layout `app/layout.tsx` provides the html/body shell + theme; the landing renders inside it like every other public page.

## 4. Design

### 4.1 `app/page.tsx` (full replacement, server component)

1. **Session probe — discriminated, observable (R1 amendment):** a small shared helper `lib/auth/rootSessionProbe.ts`:

```ts
export type RootSessionProbeResult =
  | { kind: "authenticated" }
  | { kind: "anonymous" }                       // no user, or RETURNED auth-session-missing error only
  | { kind: "infra_error"; message: string };   // construction/getUser THROW, or RETURNED non-missing error

export async function rootSessionProbe(): Promise<RootSessionProbeResult>;
```

   Construction + `auth.getUser()` both inside try/catch (`app/auth/sign-in/page.tsx:74-116` pattern); `const { data, error } = await supabase.auth.getUser()` destructured (invariant 9). **Returned-error classification (R2 amendment) follows the shipped `isAdminSession` discipline exactly (`lib/auth/isAdminSession.ts:30-35`):** returned `error` with `isAuthSessionMissingError(error)` true (`lib/auth/supabaseAuthError.ts:7-11`) ⇒ `anonymous`; ANY OTHER returned error ⇒ `infra_error` (a returned Auth-outage error is infrastructure, not a benign auth signal); success with no user ⇒ `anonymous`; any THROW ⇒ `infra_error` with a descriptive message. The three states are never collapsed inside the helper.
2. **Page consumption:** `authenticated` ⇒ `redirect("/auth/sign-in?next=/admin")` — the sign-in page's session-present branch resolves admin → `/admin`, non-admin → `/me` (D-2; one extra 302 on a rare path, zero duplicated logic). `anonymous` ⇒ render the landing. `infra_error` ⇒ `console.error("[root-landing] session probe infra fault:", message)` **then render the landing** — the ratified fail-open UI (D-1/§7.3) with an operator-observable signal (Vercel function logs); the fault is a discriminable typed result end-to-end and only the RENDER decision converges with anonymous. A signed-in user during an Auth outage sees the landing card whose CTA leads into sign-in, which surfaces its own cataloged `ADMIN_SESSION_LOOKUP_FAILED` block (`app/auth/sign-in/page.tsx:107-112`) — the outage is not hidden from them either.
3. **Structural pin (no bare exemption):** `rootSessionProbe` registers in the auth boundary registry `tests/auth/_metaInfraContract.test.ts` ("R41 Supabase boundary source registry", `:177+`): a source-regex row pinning the destructured `getUser` boundary + membership in the constructor-inside-try contract list, plus behavioral rows (construction throw ⇒ `infra_error`; getUser throw ⇒ `infra_error`; returned AuthSessionMissingError ⇒ `anonymous`; returned NON-missing error ⇒ `infra_error`) following the file's existing patterns.
4. `redirect()` is called OUTSIDE any try/catch (Next's `NEXT_REDIRECT` control flow must propagate — probe first into a local, then branch, exactly as sign-in does).

### 4.2 The card (D-3)

Page: full-viewport centered flex (`min-h-dvh items-center justify-center`), page background `bg-surface-sunken` (the warm neutral), padding `p-page-pad-mobile sm:p-page-pad-desktop`.

Card (`data-testid="root-landing-card"`): `w-full max-w-sm rounded-md border border-border bg-surface p-tile-pad flex flex-col gap-3` —

1. **Mark row:** FXAV wordmark image (same asset + sizing class as sign-in, `/brand/fxav-wordmark.png`, `w-24`) is NOT reused here — at card scale the icon mark reads better: `<img src="/brand/fxav-icon.png" … className="size-7">` + `FXAV` (`text-lg font-semibold tracking-tight text-text-strong`) + `Crew Pages` accented (`text-accent-on-bg font-semibold`) — mirroring the admin nav brand row vocabulary (`components/admin/nav/AdminNav.tsx:44-61`). Plain `<img>`/`Image` per surrounding convention; alt `"FXAV"` on the icon is decorative-adjacent — use `alt="" aria-hidden` with the text carrying the name, exactly like AdminNav (`:49-56`).
2. **CTA:** `<Link href="/auth/sign-in?next=/admin" data-testid="root-landing-signin">` styled as the primary dark button (`inline-flex min-h-tap-min items-center justify-center gap-2 rounded-md bg-text-strong px-4 font-semibold text-surface …` — exact classes resolved at plan time against the sign-in button's shipped styles so the two doors look identical), label **"Sign in with Google"**, `self-start`.
3. **Divider + crew line:** `border-t border-border pt-3` … `<p className="text-sm text-text-subtle">On a crew? The link Doug sent goes straight to your show.</p>`.

No headline `<h1>` inside the card beyond the mark row — but the PAGE must still have an `h1` for a11y/landmarks: the mark row's text renders inside an `<h1 className="…">` (visually identical to the mark-row spec above; `text-lg` h1 is fine — size is presentation, the landmark is structure).

### 4.3 Guard conditions / mode boundaries

| Input/state | Behavior |
|---|---|
| No session / returned `AuthSessionMissingError` | probe ⇒ `anonymous`; render landing |
| `getUser` RETURNED non-missing error (Auth outage class) | probe ⇒ `infra_error`; `console.error` signal, then render landing |
| `getUser` or client construction THROWS | probe ⇒ `infra_error`; `console.error` signal, then render landing (fail-open UI, §4.1.2) |
| Valid session | `redirect("/auth/sign-in?next=/admin")` (never renders) |
| Any viewport | same single card, centered; no mode boundaries, no responsive variants beyond padding |
| Dark mode | token pairs handle it (no raw colors); verify with the theme toggle in e2e spot-check |

### 4.4 Transition inventory

Static server-rendered page; zero client state, zero conditional client renders, no AnimatePresence. The only "transition" is route-level and outside scope (root is not under the admin `PageTransition` wrapper). **All states: instant — no animation needed.** No compound transitions possible.

### 4.5 Dimensional invariants

One fixed-relationship set: CTA `min-h-tap-min` (≥44px) at 390/720/1280; card horizontally centered (`|card.center.x − viewport.center.x| ≤ 1px`) and `max-w-sm` respected; no horizontal overflow at 390px. Real-browser asserted (Playwright), not jsdom.

### 4.6 Copy (verbatim; DESIGN.md §9 register, no em-dashes)

- CTA: `Sign in with Google`
- Crew line: `On a crew? The link Doug sent goes straight to your show.`
- Page `<title>` stays the root default from `app/layout.tsx` metadata (no change).

## 5. Error handling

No user-visible failure states exist (§4.3). No catalog rows touched; no §12.4 lockstep. Invariant 5 trivially satisfied (no codes anywhere).

## 6. DB / migration matrices

**N/A — declared explicitly:** no tables, columns, CHECKs, enums, RPCs, triggers, migrations, validation-project applies, or schema-manifest regen. `validation-schema-parity` unaffected.

## 7. Watchpoints / do-not-relitigate

1. **Two-door CTA is ratified** (D-4, with the rejected one-click alternative documented). Do not propose embedding `SignInButton` on `/`.
2. **Signed-in `/` visitors take two hops** (`/` → `/auth/sign-in?next=/admin` → destination). Ratified D-2: zero duplicated auth logic beats one saved 302 on a rare path.
3. **Fail-open RENDER posture** (§4.1) is deliberate and safe — the page is public; there is nothing to fail closed TO. The R1 amendment keeps the fault discriminated and observable (`infra_error` + console.error + registry pins); do not relitigate the render decision itself.
4. **No `PROTECTED_ROUTES` row** — root is public and outside the audit walk (`lib/audit/protectedRoutes.ts:43`). Adding one would make the audit fail (path not in walked trees ⇒ "listed but not live" class).
5. **No screenshot-manifest entry** — root is not a help-documented surface (YAGNI; can be added if a help page ever references it).
6. Card visual language intentionally mirrors AdminNav brand row + sign-in button — consistency findings should point THERE, not invent a third vocabulary.

## 8. Out of scope

Marketing content, SEO beyond existing metadata, per-session deep links beyond sign-in's resolution, crew "find my show" search, screenshot baseline, changes to `/auth/sign-in` or `/me`.

## 9. Testing

1. **Unit (jsdom)** — probe helper: returned `AuthSessionMissingError` (name OR message form, both `supabaseAuthError.ts:10` shapes) ⇒ `{ kind: "anonymous" }`; returned NON-missing error (e.g. status-500 AuthApiError shape) ⇒ `infra_error`; no-user success ⇒ `anonymous`; valid user ⇒ `authenticated`; construction throw ⇒ `infra_error` (resolves, never rejects); `getUser` throw ⇒ `infra_error` — returned-missing vs returned-infra vs thrown all explicitly distinguished; *catches: states collapsing inside the probe (R1/R2 class)*. Page: `anonymous` ⇒ card renders with exact CTA href `/auth/sign-in?next=/admin`, crew line verbatim, h1 present; *catches: wrong next param silently breaking the admin/crew split*. `authenticated` ⇒ `redirect` called with exactly that path, card NOT rendered; *catches: landing flashing for signed-in users*. `infra_error` ⇒ card renders AND `console.error` spy called with the probe message; *catches: fail-open regression (R19 F4 class) AND silent-outage regression (the spy assertion fails if observability is dropped)*. Anti-tautology: href asserted via the link element's attribute, scoped to `root-landing-card`.
2. **E2E (Playwright, prod build)** — signed-in admin fixture hits `/` → final URL `/admin`; signed-in non-admin crew fixture → final URL `/me`; anonymous → card visible, CTA tap lands on `/auth/sign-in?next=%2Fadmin` (or unencoded — assert the sign-in page rendered with its headline). *Catches: the full redirect chain breaking at either hop.*
3. **Layout dimensions (real browser, §4.5 invariants verbatim)** — CTA ≥44px, card centered ±1px, no horizontal overflow, at 390/720/1280.
4. Meta-test inventory (declared): EXTENDS `tests/auth/_metaInfraContract.test.ts` — R41 source-regex row + constructor-inside-try membership + behavioral throw/returned-error rows for `lib/auth/rootSessionProbe.ts` (§4.1.3). No other registries apply (no DB writes, no alerts, no locks, no protected route).

## 10. Implementation shape

Single small milestone on `spec/root-landing` (worktree): 1 page file + tests + e2e; impeccable v3 dual-gate (external) before close-out; Codex adversarial review (spec now, whole-milestone at end); real CI; merge. Standing directive: autonomous through merge.
