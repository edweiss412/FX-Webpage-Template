"use client";

/**
 * app/show/[slug]/p/Bootstrap.tsx (M5 §B Task 5.5 — Opus's portion)
 *
 * The only `'use client'` boundary on the bootstrap shell. Responsibilities:
 *
 *   1. On mount (useEffect, runs exactly once):
 *      a. Read `window.location.hash`. If it doesn't match `^#t=...$` →
 *         render the "no fragment" friendly message and stop. This branch
 *         covers the case where a user navigated to /show/<slug>/p
 *         directly (e.g., from history) — the shell is useless without
 *         the JWT in the fragment.
 *      b. Invoke `bootstrapMint(showId)` Server Action. The action runs
 *         inside `withShowAdvisoryLock(showId, 'try', ...)` and
 *         atomically: reads `app_settings.active_signing_key_id`, INSERTs
 *         a `bootstrap_nonces` row, appends a matching entry to the
 *         `__Host-fxav_bootstrap_v` cookie array (cap 5; evict oldest),
 *         and returns the fresh nonce.
 *      c. POST `{ token, nonce, show_id }` to `/api/auth/redeem-link`.
 *         The request is same-origin so the redeem-link route's
 *         Sec-Fetch-Site / Origin gate is satisfied; the cookie is sent
 *         automatically (browser default for same-origin fetch).
 *      d. On 200: `history.replaceState(null, '', location.pathname)` to
 *         strip the `#t=...` fragment from the URL bar (so it never
 *         appears in browser history or copy-paste'd links), then
 *         `router.replace('/show/<slug>')` to navigate to the now-
 *         authenticated crew page. Using `router.replace` (not `push`)
 *         keeps the bootstrap shell out of the back/forward history.
 *      e. On non-200: render the generic inline error fallback (no raw
 *         error code per AGENTS.md §1.5). The catalog message system
 *         (lib/messages/catalog.ts → ErrorExplainer) is §A territory and
 *         the redeem-link error codes (CSRF_DENIED / CSRF_NONCE_EXPIRED /
 *         CSRF_KEY_ROTATED / LINK_REDEEM_KEY_ROTATED / LINK_VERSION_MISMATCH /
 *         LINK_NO_CREW_MATCH / LINK_REVOKED_*) do not all have the
 *         catalog hook-up needed for ErrorExplainer's allowlist (the
 *         §B sign-in surface allowlists OAUTH_STATE_INVALID +
 *         OAUTH_REDIRECT_INVALID; redeem-link emits a different set).
 *         Until §A extends the catalog with redeem-link-facing copy,
 *         we render a single generic message that points the user at
 *         their original signed link. This matches the
 *         SignInButton.tsx:97-101 inline-error precedent.
 *
 * Why `useEffect` and not a render-time bootstrap call?
 *   - `location.hash` is browser-only — undefined during SSR. A
 *     render-time read would crash the SSR pass.
 *   - The Server Action mutates DB + cookies; running it during render
 *     would couple SSR to side-effect-heavy I/O. useEffect runs once on
 *     mount in the browser, which is the intended trigger.
 *   - StrictMode double-invocation in dev: the useEffect body uses a
 *     `didRunRef` guard so a second invocation is a no-op (avoids
 *     minting two nonces per page render in dev mode). Production
 *     builds run useEffect exactly once.
 *
 * State machine (UI):
 *   Three terminal states:
 *     - "no_fragment"   — user opened /show/<slug>/p without #t=... .
 *                         Friendly copy explains how to get a usable link.
 *     - "error"         — bootstrap mint OR redeem-link POST failed.
 *                         Generic inline error; user can navigate elsewhere.
 *     - "redirecting"   — implicitly handled by `router.replace()`; the
 *                         component unmounts before any UI shows.
 *   One transient state:
 *     - "connecting"    — initial render before useEffect runs OR while
 *                         the bootstrap mint + POST is in flight.
 *
 * No router.replace fallback if `next` is unsafe: the redirect target
 * is a hardcoded `/show/<slug>` — the slug is the route param this page
 * was mounted under (server-rendered, NOT user-controlled), so there's
 * no open-redirect risk.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { bootstrapMint } from "./actions";

type BootstrapProps = {
  /**
   * The resolved show_id (UUID) for this slug. Server-rendered by
   * page.tsx via `resolveShowIdFromSlug(slug)`; the client island echoes
   * it into the redeem-link POST body and into the bootstrapMint call.
   */
  showId: string;
  /**
   * The route's `[slug]` value. Used to construct the post-redeem
   * navigation target (`/show/<slug>`).
   */
  slug: string;
};

type UiState =
  | { kind: "connecting" }
  /**
   * M9 C3 / M5-D2: 6s elapsed in connecting without resolution. The
   * original bootstrapMint + redeem-link fetch are STILL IN FLIGHT —
   * still_working is a presentation flip, not an abort. The Retry
   * button calls runBootstrap() again from the top, which mints a
   * fresh nonce; the original in-flight fetch's success unmounts the
   * component before either retry result lands.
   */
  | { kind: "still_working" }
  | { kind: "no_fragment" }
  | { kind: "error" };

const STILL_WORKING_TIMEOUT_MS = 6_000;

// M9 C7 / M5-D8 — These two inline strings remain inline by deliberate
// scope decision, NOT by oversight:
//
//   GENERIC_ERROR_COPY is a catch-all rendered when the bootstrap layer
//   has caught a §A error from multiple underlying codes (CSRF_DENIED,
//   CSRF_NONCE_EXPIRED, LINK_REVOKED_FLOOR, LINK_REDEEM_KEY_ROTATED,
//   LINK_VERSION_MISMATCH, LINK_NO_CREW_MATCH, …). The bootstrap state
//   machine intentionally collapses them so the user-visible copy stays
//   stable across the variants — but no single catalog code semantically
//   covers "any of the above bootstrap §A failures." Adding a dedicated
//   BOOTSTRAP_GENERIC catalog row requires a spec amendment per
//   AGENTS.md §1.7; deferred to a spec-amendment session.
//
//   NO_FRAGMENT_COPY is NOT an error — it's a wayfinding message when
//   the user lands at /show/<slug>/p without `#t=<jwt>`. No §12.4
//   catalog code covers "wayfinding fragment-missing".
//
// not-subject:M5-D8 — both strings are deliberate inline catch-alls,
// per the above. The meta-test below treats inline literal-string copy
// in this file as exempt via the `not-subject:` annotation.
// not-subject:M5-D8 (callsite-scoped — applies to both literals below)
//
// M9 C3 / M5-D5 (shape brief 2026-05-14-auth-flow-polish.md §5.2):
// the brief replaced both copy strings to align with the M5-D5 self-serve
// fallback path. Error → 'sign in instead' nudge points the user at the
// page-level [Sign in with Google instead] CTA below; no_fragment uses
// 'go to your shows' wayfinding that pairs with the [Go to my shows] link.
const GENERIC_ERROR_COPY = "Couldn't reach the server. Try signing in instead.";

// not-subject:M5-D8 — wayfinding, not an error
const NO_FRAGMENT_COPY =
  "This link is incomplete. If you already have a session, go to your shows.";

export function Bootstrap({ showId, slug }: BootstrapProps) {
  const router = useRouter();
  const [ui, setUi] = useState<UiState>({ kind: "connecting" });

  // StrictMode double-invocation guard. In dev, React mounts → unmounts →
  // remounts every component once on first render to surface effect-cleanup
  // bugs. We MUST mint at most one nonce per real page load; a second
  // invocation would silently consume a second `bootstrap_nonces` row +
  // cookie array slot (and in the worst case race the first POST). The
  // ref persists across the dev-mode double-invoke without re-running the
  // effect body.
  const didRunRef = useRef(false);

  // M9 C3 / M5-D2: ref for the still_working timer so the Retry button
  // can clear it and start fresh.
  const stillWorkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // M9 C3 / R3 (codex finding): the brief §11 anti-goal "no timeout-as-
  // abort" requires the original bootstrap fetch to KEEP RUNNING when
  // the user clicks Retry — Retry races the original, doesn't kill it.
  // Track ALL in-flight controllers so unmount can abort them, but
  // runBootstrap does NOT abort prior controllers. Whichever attempt
  // resolves first navigates the user away (router.replace is idempotent
  // — both attempts target the same /show/<slug>). The attempt-id ref
  // remains for stale-FAILURE guarding so a late rejection from an
  // older attempt can't overwrite a newer attempt's UI; SUCCESS paths
  // are intentionally NOT guarded (any attempt's success is a win).
  const inflightControllersRef = useRef<Set<AbortController>>(new Set());
  // M9 C3 / R1 F2 (codex finding): monotonic attempt id used to guard
  // post-await setUi calls so a stale attempt's late FAILURE can't
  // overwrite a fresher attempt's UI. Incremented on every runBootstrap
  // call (initial mount + each Retry click). bootstrapMint is a Server
  // Action and isn't cancellable, so this guard is the only protection
  // against a late stale rejection painting setUi({kind:'error'}) over
  // the current retry's connecting state.
  const attemptIdRef = useRef(0);

  /**
   * runBootstrap — extracted from the original useEffect IIFE so the
   * Retry button can re-invoke it from scratch (mints a fresh nonce,
   * re-POSTs to redeem-link). On every call: aborts any prior in-flight
   * controller, clears the still_working timer, sets state to connecting,
   * arms a new 6s timer, and runs the bootstrap fetch sequence.
   *
   * NOTE: this function does NOT consume `didRunRef` — the StrictMode
   * guard is on the useEffect's first invocation only. Retry must run
   * regardless of whether the dev-mode double-invoke already fired.
   */

  const runBootstrap = useCallback(() => {
    // R3 (codex finding): do NOT abort prior controllers. Brief §11
    // anti-goal "no timeout-as-abort" — the original fetch races the
    // retry. Whichever resolves first navigates; stale failures are
    // suppressed via the attempt-id guard below.
    if (stillWorkingTimerRef.current !== null) {
      clearTimeout(stillWorkingTimerRef.current);
      stillWorkingTimerRef.current = null;
    }
    // R1 F2: bump attempt generation. Every setUi branch below captures
    // this id and only writes UI if it still matches the latest attempt.
    // SUCCESS paths (router.replace) intentionally do NOT consult the
    // guard — any attempt's success is a win for the user.
    attemptIdRef.current += 1;
    const myAttempt = attemptIdRef.current;
    setUi({ kind: "connecting" });
    // Arm the 6s still_working flip. Per brief §5.2 this is a presentation
    // flip, NOT an abort — the in-flight bootstrapMint + redeem-link fetch
    // continue. If they resolve before Retry is clicked, the connecting
    // state's success path navigates away and the still_working render
    // unmounts. Guarded by attempt id so a stale timer (cleared but
    // already queued by the runtime) can't flip a fresher attempt.
    stillWorkingTimerRef.current = setTimeout(() => {
      if (attemptIdRef.current !== myAttempt) return;
      setUi((prev) => (prev.kind === "connecting" ? { kind: "still_working" } : prev));
    }, STILL_WORKING_TIMEOUT_MS);

    // Capture an AbortController so the in-flight POST is cancelled if
    // the component unmounts (e.g., user navigates away mid-request).
    // R3 (codex finding): each attempt has its OWN controller. Prior
    // attempts are NOT aborted on Retry — they keep racing. The unmount
    // cleanup walks inflightControllersRef and aborts every entry.
    const controller = new AbortController();
    inflightControllersRef.current.add(controller);
    controller.signal.addEventListener("abort", () => {
      inflightControllersRef.current.delete(controller);
    });

    // The async IIFE below performs all DB / network I/O. EVERY setState
    // call is awaited (inside the IIFE) — there are NO synchronous
    // setState calls in the effect body, so React's "cascading renders"
    // lint rule is satisfied. The async boundary defers state updates
    // off the effect-execution microtask, matching the
    // /react.dev/learn/you-might-not-need-an-effect contract.
    (async () => {
      // R1 F2: every setUi/router.replace below MUST first verify
      // attemptIdRef.current === myAttempt. The bootstrapMint Server
      // Action is NOT cancellable via AbortController, so a Retry click
      // bumps attemptIdRef but the older attempt's awaited mint can
      // still resolve later — without this guard its catch/error path
      // would overwrite the fresher attempt's UI. The
      // synchronousChecks below the immediate fragment reads are also
      // guarded for symmetry; they're cheap and correct for the case
      // where Retry fires before the no-fragment branch even reads.
      const stale = () => attemptIdRef.current !== myAttempt;
      const safeSetUi = (next: UiState) => {
        if (stale()) return;
        setUi(next);
      };
      // Read the URL fragment client-side. Fragments are browser-only —
      // never sent to the server — so this read is the FIRST place the
      // JWT enters the application.
      const hash = window.location.hash;
      const match = hash.match(/^#t=(.+)$/);
      if (!match) {
        safeSetUi({ kind: "no_fragment" });
        return;
      }
      const tokenRaw = match[1];
      if (!tokenRaw || tokenRaw.length === 0) {
        safeSetUi({ kind: "no_fragment" });
        return;
      }
      // Decode the URL-encoded JWT (Doug's signed-link generator may
      // have percent-encoded special chars). JWTs themselves are
      // URL-safe (Base64URL alphabet) but the surrounding URL may still
      // encode them.
      let token: string;
      try {
        token = decodeURIComponent(tokenRaw);
      } catch {
        // Malformed URL encoding — treat as a generic error (the user
        // can re-open the original link to retry).
        safeSetUi({ kind: "error" });
        return;
      }

      try {
        // (1) Mint the bootstrap nonce + cookie entry via the Server
        // Action. This runs inside the per-show advisory lock and writes
        // both the DB row and the cookie atomically.
        //
        // R9 #2 + R10 #4 burst-load resilience: the lock is held in 'try'
        // mode server-side (R8 #2 briefly switched to 'block' but round-8 §B
        // caught that blocking-mode held a DB connection per waiter and
        // exhausted the connection pool). When 50+ crew arrive at a venue
        // simultaneously, contention on the same show lock throws
        // ShowAdvisoryLockUnavailableError on losers.
        //
        // Retry with JITTERED EXPONENTIAL backoff (round-9 §B finding:
        // R9 #2's deterministic 100/250ms delays caused a thundering
        // herd — every loser woke at the same time and re-collided).
        // Each attempt waits baseMs * 2^attempt plus uniform jitter in
        // [0, baseMs * 2^attempt]; with baseMs=80 and 3 total attempts,
        // typical losers see ~80–160ms (1st retry) and ~160–320ms (2nd
        // retry), distributing wakeups across a contention window
        // proportional to the burst size.
        const BASE_DELAY_MS = 80;
        const MAX_ATTEMPTS = 3;
        let nonce: string | undefined;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            const result = await bootstrapMint(showId);
            nonce = result.nonce;
            break;
          } catch (mintErr) {
            if (controller.signal.aborted) {
              throw mintErr;
            }
            if (attempt === MAX_ATTEMPTS - 1) {
              throw mintErr;
            }
            // Exponential base + uniform jitter in [0, base) so colliding
            // clients pick distinct wake times.
            const exponentialBase = BASE_DELAY_MS * 2 ** attempt;
            const jittered = exponentialBase + Math.random() * exponentialBase;
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, jittered);
              controller.signal.addEventListener("abort", () => {
                clearTimeout(timer);
                resolve();
              });
            });
            if (controller.signal.aborted) {
              throw mintErr;
            }
          }
        }
        if (nonce === undefined) {
          // Defensive — loop above either assigns nonce or throws.
          throw new Error("bootstrapMint: nonce unset after retry loop");
        }

        // (2) POST to redeem-link. Same-origin fetch sends the
        // __Host-fxav_bootstrap_v cookie automatically; the redeem-link
        // route gates on Sec-Fetch-Site=same-origin (modern browsers
        // always set this for fetch from a same-origin context).
        //
        // R22 F3 (round-22 §B MEDIUM): the server-side advisory lock
        // changed from "block" to "try" mode (block held a postgres
        // connection per blocked waiter — venue-scale bursts could
        // exhaust the pool). Losers now receive 503 + SHOW_BUSY_RETRY
        // and the client retries with jittered exponential backoff,
        // mirroring the bootstrapMint retry pattern above.
        let res: Response | null = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const r = await fetch("/api/auth/redeem-link", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, nonce, show_id: showId }),
            credentials: "same-origin",
            signal: controller.signal,
          });
          if (r.status !== 503) {
            res = r;
            break;
          }
          // Probe the body for the SHOW_BUSY_RETRY signal. Other 503s
          // (e.g. transient infra) are NOT retry-eligible — surface as
          // generic error like before.
          let busyRetry = false;
          try {
            const body: unknown = await r.clone().json();
            if (
              typeof body === "object" &&
              body !== null &&
              (body as { code?: unknown }).code === "SHOW_BUSY_RETRY"
            ) {
              busyRetry = true;
            }
          } catch {
            // Body wasn't JSON; treat as non-retry.
          }
          if (!busyRetry || attempt === MAX_ATTEMPTS - 1) {
            res = r;
            break;
          }
          const exponentialBase = BASE_DELAY_MS * 2 ** attempt;
          const jittered = exponentialBase + Math.random() * exponentialBase;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, jittered);
            controller.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              resolve();
            });
          });
          if (controller.signal.aborted) {
            return;
          }
        }
        if (!res || !res.ok) {
          // Render the generic error fallback. We deliberately don't
          // surface the §A error code (per invariant 5: no raw error
          // codes in user-visible UI). The error code is read by the
          // browser's network tab if Doug needs to debug.
          safeSetUi({ kind: "error" });
          return;
        }

        // (3) Strip the fragment from the URL bar so it never lands in
        // the user's history / clipboard. `replaceState` is a no-op for
        // the back-button history but mutates the address bar in place.
        try {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch {
          // history API can throw in edge cases (e.g., restricted iframe
          // contexts). The redirect below still fires; the fragment may
          // remain in the URL bar but won't be re-evaluated since the
          // bootstrap shell unmounts immediately after.
        }

        // (4) Navigate to the auth-gated crew page. router.replace (not
        // push) keeps the bootstrap shell out of the back-button
        // history; the user's "Back" should land them on whatever they
        // were on before clicking the signed link, NOT on the
        // bootstrap shell. R3 (codex finding): SUCCESS paths
        // intentionally do NOT consult the stale-attempt guard. Both
        // attempts target the same /show/<slug> — whichever resolves
        // first wins; the brief §11 "no timeout-as-abort" contract
        // requires the original attempt's success to still navigate
        // even if the user has since clicked Retry.
        router.replace(`/show/${slug}`);
      } catch (err) {
        // Suppress AbortError — it's the unmount-on-navigate path, not
        // a real failure.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        // Server Action throw OR fetch network error → generic inline
        // error. The user can re-open the original link to retry.
        safeSetUi({ kind: "error" });
      }
    })();
  }, [router, showId, slug]);

  // Mount-only useEffect that fires runBootstrap once (StrictMode-guarded)
  // and cleans up on unmount. R3: cleanup walks every in-flight
  // controller (initial + each Retry attempt) so unmount aborts the
  // whole racing set, not just the latest.
  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    runBootstrap();
    return () => {
      const controllers = inflightControllersRef.current;
      for (const c of Array.from(controllers)) {
        c.abort();
      }
      controllers.clear();
      if (stillWorkingTimerRef.current !== null) clearTimeout(stillWorkingTimerRef.current);
    };
  }, [runBootstrap]);

  // Retry handler — invoked from the still_working state's [Retry] button.
  // Re-invokes runBootstrap to mint a fresh nonce + re-POST. Per brief
  // §5.2 + §11 anti-goal "no timeout-as-abort", the original in-flight
  // fetch may STILL succeed and navigate away before retry resolves; the
  // component handles whichever lands first.
  //
  // R1 F2 (codex finding): single-flight rapid double-clicks via a 500ms
  // debounce ref. The attempt-id guard above already serializes async
  // races at the data layer — this debounce is UX defense-in-depth so a
  // venue-floor double-tap doesn't bombard the server with three+
  // concurrent bootstrapMint calls.
  const lastRetryAtRef = useRef(0);
  const handleRetry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryAtRef.current < 500) return;
    lastRetryAtRef.current = now;
    runBootstrap();
  }, [runBootstrap]);

  // M9 C8 / M5-D6 #4: wrap the state-transition region in a single
  // aria-live="polite" container so screen readers announce each
  // state change (connecting → still_working → no_fragment / error)
  // as the same logical region updates. Without a stable live region,
  // the separate elements mount/unmount and the announcement is lost.
  // M9 C3 / M5-D5: the [Sign in with Google instead] fallback link
  // points at /auth/sign-in?next=/show/<slug> so a successful Google
  // sign-in lands the crew member on the show they were trying to
  // reach. Same target across error + still_working states; the
  // no_fragment state uses [Go to my shows] (→ /me) instead since
  // there's no specific show to land on.
  const signInFallbackHref = `/auth/sign-in?next=${encodeURIComponent(`/show/${slug}`)}`;

  return (
    <div data-testid="bootstrap-live-region" aria-live="polite">
      {ui.kind === "no_fragment" ? (
        <div data-testid="bootstrap-no-fragment-block" className="flex flex-col gap-3">
          <p data-testid="bootstrap-no-fragment" className="text-base text-text-subtle">
            {NO_FRAGMENT_COPY}
          </p>
          <Link
            data-testid="bootstrap-no-fragment-fallback"
            href="/me"
            className="inline-flex min-h-tap-min items-center text-sm text-text underline underline-offset-2 hover:text-text-strong"
          >
            Go to my shows
          </Link>
        </div>
      ) : ui.kind === "error" ? (
        // M9 C8 R1 P2: removed inner role="alert" — the outer
        // aria-live="polite" wrapper now announces the error state
        // change once. Nested live regions / alert + polite double-
        // fire is a known screen-reader anti-pattern.
        //
        // M9 C3 / M5-D5: error state pairs the cataloged copy with a
        // [Sign in with Google instead] primary CTA so the crew member
        // can self-recover without re-opening the original link.
        <div data-testid="bootstrap-error-block" className="flex flex-col gap-3">
          <p data-testid="bootstrap-error" className="text-base text-warning-text">
            {GENERIC_ERROR_COPY}
          </p>
          <Link
            data-testid="bootstrap-error-fallback"
            href={signInFallbackHref}
            className="inline-flex min-h-tap-min items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            Sign in with Google instead
          </Link>
        </div>
      ) : ui.kind === "still_working" ? (
        // M9 C3 / M5-D2: 6s elapsed in connecting; the original fetch
        // is still in flight. Render the named-state escalation +
        // [Retry] button per shape brief §5.2. Dots continue from the
        // connecting state — they ARE the loading affordance.
        // M9 C3 / M5-D5: the secondary "Sign in with Google instead"
        // link sits beside Retry so a user who'd rather not wait can
        // peel off to the sign-in flow without reloading.
        <div data-testid="bootstrap-still-working" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium text-text-strong">Still working&hellip;</p>
            <p className="text-sm text-text-subtle">This is taking longer than usual.</p>
          </div>
          <BootstrapDots />
          <div className="flex flex-wrap items-center gap-4">
            <button
              data-testid="bootstrap-retry"
              type="button"
              onClick={handleRetry}
              className="inline-flex min-h-tap-min items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Retry
            </button>
            <Link
              data-testid="bootstrap-still-working-fallback"
              href={signInFallbackHref}
              className="inline-flex min-h-tap-min items-center text-sm text-text-subtle underline underline-offset-2 hover:text-text"
            >
              Sign in with Google instead
            </Link>
          </div>
        </div>
      ) : (
        // ui.kind === "connecting"
        <div className="flex flex-col gap-2">
          <p data-testid="bootstrap-connecting" className="text-base text-text-subtle">
            Connecting
          </p>
          <BootstrapDots />
        </div>
      )}
    </div>
  );
}

/**
 * Sequenced-dots loading affordance per shape brief §5.2. Three dots
 * pulse opacity 0.3 → 1.0 → 0.3 over `--duration-normal` (220ms),
 * staggered by `--duration-normal / 3` so the dots cascade left-to-right.
 *
 * `prefers-reduced-motion: reduce` is honored via a CSS @media query in
 * `app/globals.css` — the keyframes resolve to `none` and the dots
 * present as static "•••" spaced horizontally. This component renders
 * the same DOM regardless; the motion is CSS-driven so the
 * accessibility contract lives entirely in the stylesheet.
 */
function BootstrapDots() {
  return (
    <span
      data-testid="bootstrap-dots"
      role="presentation"
      aria-hidden="true"
      className="inline-flex items-center gap-1"
    >
      <span
        data-testid="bootstrap-dot"
        className="bootstrap-dot inline-block size-1.5 rounded-full bg-text-subtle"
        style={{ animationDelay: "0ms" }}
      />
      <span
        data-testid="bootstrap-dot"
        className="bootstrap-dot inline-block size-1.5 rounded-full bg-text-subtle"
        style={{ animationDelay: "73ms" }}
      />
      <span
        data-testid="bootstrap-dot"
        className="bootstrap-dot inline-block size-1.5 rounded-full bg-text-subtle"
        style={{ animationDelay: "146ms" }}
      />
    </span>
  );
}
