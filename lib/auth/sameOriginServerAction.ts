import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { log } from "@/lib/log";
import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

/**
 * True iff the current Server Action request is same-origin.
 *
 * WHY THIS EXISTS. Next's built-in Server Action origin check validates `Origin`
 * against the host but explicitly lets a request with NO `Origin` header through
 * (`if (!originHost)` in next/dist/server/app-render/action-handler.js sets a
 * console warning and falls through). A cross-site POST that simply omits
 * `Origin` therefore reaches a destructive action — the logout-CSRF primitive
 * this gate closes.
 *
 * WHAT IT DEPENDS ON, AND WHAT IT DELIBERATELY DOES NOT. Only browser-stamped
 * Fetch Metadata (`sec-fetch-site`, a forbidden request header page JavaScript
 * cannot set) and a build-time trusted constant (`NEXT_PUBLIC_SITE_ORIGIN`, read
 * through `resolveSiteOrigin`). NEVER `x-forwarded-host` or `host`: those are
 * forwardable, so a gate built on them inherits every proxy's rewrite behavior.
 * Because nothing here is forwardable, "which headers does the platform
 * overwrite" does not arise — the question is dissolved, not answered.
 *
 * PRECEDENCE. `sec-fetch-site` wins whenever present; `Origin` is consulted only
 * in its absence. Reversing that would let a matching `Origin` launder a
 * `cross-site` request.
 *
 * DOCUMENTED LIMIT (spec §7). Neither signal present ⇒ allowed, preserving the
 * framework default. Reachable only by non-browser clients (which carry no
 * victim cookies, so cannot mount CSRF) or pre-Fetch-Metadata browsers. Strictly
 * no weaker than today, and strictly stronger on the filed bypass.
 *
 * DOCUMENTED LIMIT (spec §7, origin-sweep §3.2). No request scope ⇒ allowed.
 * See the scoped catch below.
 */
export async function isSameOriginServerAction(): Promise<boolean> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    // No request scope: a direct server-side invocation (a suite calling the
    // action as a function, an internal server-to-server call). Not a browser
    // request, so there are no victim cookies and no CSRF surface — refusing
    // here would buy nothing and would force a `next/headers` mock into 72
    // suites (origin-sweep spec §2.3). Documented limit, spec §7.
    //
    // The catch wraps ONLY this call, deliberately. Widening it to the body
    // would turn a fault in `resolveSiteOrigin` or in the decision logic into a
    // silent ALLOW; the negative sibling in the truth-table suite pins that.
    return true;
  }
  const secFetchSite = h.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = h.get("origin");
  if (origin !== null) {
    const site = resolveSiteOrigin();
    return site.ok && origin === site.origin;
  }
  return true;
}

/**
 * THE FOUR DESIGNATED REFUSAL EXPORTS (origin-sweep spec §3.6).
 *
 * The structural walk (tests/auth/_metaServerActionOriginGate.test.ts) resolves
 * a gate's refusal position BY NAME against exactly these four exports of
 * exactly this module. It never analyses the callee's body, because the
 * question that analysis has to answer — "can this author-written body mutate?"
 * — does not terminate: two consecutive spec review rounds defeated predicates
 * that tried, the second with a module-local refusal helper edited to write a
 * cookie while satisfying every clause. So the safety of a refusal is
 * established ONCE, here, by review plus this module's own truth-table suite
 * plus its enrolment in the source-mutation guard gate — not re-derived per call
 * site by a scanner that cannot decide it.
 *
 * Four names rather than one because the refusal VALUE differs by surface and a
 * `Promise<void>` action cannot `return` a typed literal. Four is the number of
 * distinct return shapes in the census, not room to grow: a fifth is a spec
 * change with a review.
 *
 * No emit carries a secret. Each is the action name and a source tag, both
 * author-written string literals pinned by the walk.
 */

/** The forensic code for the non-picker surfaces. Rides the log span only — never returned, never rendered, so no §12.4 row (`stripLogEmissionCalls` strips it before `PRODUCER_RE` runs). */
const SERVER_ACTION_ORIGIN_REJECTED = "SERVER_ACTION_ORIGIN_REJECTED";
/** The picker family's shipped forensic code, so picker CSRF stays one query. */
const PICKER_ORIGIN_REJECTED = "PICKER_ORIGIN_REJECTED";
/** The picker family's shipped source tag, carried here rather than passed per site. */
const PICKER_SOURCE = "auth.picker.sameOriginGate";

/**
 * First statement of every admin-gated Server Action (class A).
 *
 * Allows a same-origin request; on a cross-origin one it emits the forensic
 * code and interrupts with `forbidden()` — the refusal channel these surfaces
 * already use for an authed-but-not-admin caller (`resolveAdminIdentity`,
 * lib/auth/requireAdmin.ts) — BEFORE any auth I/O, any lock, and any mutation.
 *
 * `forbidden()` returns `never`, which is what lets one helper compose with
 * every class-A return type (`Promise<void>`, `Promise<never>`, and each typed
 * result union) with no union widened and no client change.
 */
export async function assertSameOriginServerAction(action: string, source: string): Promise<void> {
  if (await isSameOriginServerAction()) return;
  log.warn("cross-origin server action refused", {
    source,
    code: SERVER_ACTION_ORIGIN_REJECTED,
    action,
  });
  forbidden();
}

/**
 * Classes B and D, and the one `Promise<ClearIdentityResult>` inline wrapper.
 *
 * The RETURNED code is the catalogued `PICKER_INVALID_INPUT` — a `code:` literal
 * in a returned object reads as a §12.4 producer to the scanner, and an
 * uncatalogued one fails x1. The distinguishing forensic code rides the
 * `log.warn` span instead.
 *
 * The return type is the structural literal rather than an imported alias on
 * purpose: `CleanupStaleEntryResult` is module-private, so no named import
 * could serve all four class-B call sites, and `as const` is structurally
 * assignable to the `{ ok: false; code: string }` arm of each union.
 *
 * `action` is not decoration: it is what makes each endpoint's own guard
 * load-bearing. Deleting a wrapper's guard makes it fall through to its core's,
 * which emits a different `action`, and the per-endpoint tests catch it.
 */
export function rejectCrossOriginPicker(action: string): { ok: false; code: string } {
  log.warn("cross-origin picker action refused", {
    source: PICKER_SOURCE,
    code: PICKER_ORIGIN_REJECTED,
    action,
  });
  return { ok: false as const, code: "PICKER_INVALID_INPUT" as const };
}

/**
 * Class C — `confirmUnpublishAction`, the one `useActionState` surface.
 *
 * `neutral` is the value that action already returns for a missing field, so the
 * refusal introduces no new state and no new copy, and no token is consumed
 * because the pre-check is never reached. The source tag is the file's own; the
 * census holds exactly one class-C unit, so it is carried here rather than
 * passed, keeping the accept-set's argument list one string literal wide.
 */
export function rejectCrossOriginNeutral(action: string): { status: "neutral" } {
  log.warn("cross-origin server action refused", {
    source: "show.unpublish.confirmAction",
    code: SERVER_ACTION_ORIGIN_REJECTED,
    action,
  });
  return { status: "neutral" as const };
}

/**
 * The two `Promise<void>` inline form-action wrappers.
 *
 * They are GATED rather than exempted (spec Resolved scope #9r): each delegates
 * to a gated action, but the delegate returns a TYPED refusal rather than
 * throwing, so a wrapper keeps executing after a rejected cross-site request.
 * Async because the accept-set's return position must hold a call and the
 * wrappers return `Promise<void>`.
 */
export async function rejectCrossOriginVoid(action: string): Promise<void> {
  log.warn("cross-origin picker action refused", {
    source: PICKER_SOURCE,
    code: PICKER_ORIGIN_REJECTED,
    action,
  });
}
