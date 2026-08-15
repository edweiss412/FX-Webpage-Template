# Auth-picker hardening — same-origin gate + legible switch-person failure

**Date:** 2026-08-15
**Branch:** `fix/auth-picker-hardening`
**Closes:** `BL-SERVER-ACTION-ORIGIN-GATE`, `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`
**Routing:** implementation is Opus + Claude Code (touches `components/auth/IdentityChip.tsx` and `components/auth/AvatarMenu.tsx`, both UI per the invariant-8 definition → impeccable dual-gate at implementation).

Two defects on one surface — the crew picker's identity-clear Server Actions (`lib/auth/picker/clearIdentity.ts`) and the avatar menu that submits them (`components/auth/IdentityChip.tsx` → `components/auth/AvatarMenu.tsx`). They ship as one coherent design because they touch the same request path and the same failure branches.

1. **A logout-CSRF hole (low severity).** The exported Server Actions rely on Next's built-in Origin validation, which permits a cross-site POST that carries **no** `Origin` header. Reproduced from framework source below. Fix: a proxy-independent same-origin gate on every destructive picker Server Action.
2. **A silent failure (MEDIUM severity).** When "Not you? Switch person" fails, the typed result is discarded, nothing re-renders, and the crew member believes they switched out of an identity they are still in. Fix: an in-menu error state.

---

## 1.1 Resolved scope — do not relitigate

Each row is a settled decision with its ratifying evidence. Reviewers verify the citation; they do not re-derive the decision.

| # | Decision | Ratified by |
| --- | --- | --- |
| 1 | **The same-origin gate is built on Fetch Metadata (`sec-fetch-site`) + an Origin-vs-`NEXT_PUBLIC_SITE_ORIGIN` fallback, and NEVER trusts `x-forwarded-host`/`host`.** This dissolves the trusted-proxy question that descoped the prior attempt — the gate depends on no forwardable header, so proxy overwrite behavior is irrelevant. It is NOT another attempt to derive the origin from `x-forwarded-host` (the vector that failed review three times). | §3.3; prior descope reasoning `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md:175` (§4.3a); in-repo precedent `app/api/observe/client-error/route.ts:43-48` |
| 2 | **The `sec-fetch-site: none`/absent and Origin-absent case is allowed (framework default preserved) and is a DOCUMENTED LIMIT, not a hole to patch.** It is reachable only by non-browser clients (which carry no victim cookies → cannot mount CSRF) or pre-Fetch-Metadata browsers. Do not file a review round on it; it is fenced in §7. | §3.3, §7; framework behavior at the vendor path in §2.1 |
| 3 | **Failure presentation for the menu is Option A — an in-menu error; the menu stays open on failure.** Chosen over a page-level banner. User decision, batched 2026-08-15. | §4.2 |
| 4 | **The failure copy is a NEW catalog code `PICKER_SWITCH_FAILED` = "Couldn't switch. Please try again."** Chosen over reusing the mismatched existing copy. User decision, batched 2026-08-15. Introduces the §12.4 three-lockstep (§4.4). | §4.4 |
| 5 | **The "Continue as guest" gate path (`clearIdentityAndSkip` in `_SignInOrSkipGate.tsx`) is NOT given a bespoke error state.** Its failure re-renders the mismatch gate, whose CTA is itself the retry — already documented as non-silent. User decision, batched 2026-08-15. It IS still covered by the same-origin gate (§3.2). | §4.5; `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a |
| 6 | **Menu-clear server-side failure telemetry is OUT OF SCOPE.** The `clearIdentityCore` catch stays silent and its pinning test (`tests/auth/picker/clearIdentity.test.ts:228`) is unchanged; the existing `// no-telemetry:` delegation exemption stands. The filed defect is that the USER is not told — this spec fixes that. Server-side observability of this branch remains tracked by `BL-CREW-PICKER-OBSERVABILITY`. | §5 invariant 10 |
| 7 | **Gating the other ~37 destructive Server Actions is OUT OF SCOPE for this arc and re-filed.** This arc builds the reusable helper and applies it to the `clearIdentity.ts` endpoint set (the filed surface). Class-sweep disposition exception (c): the peer sweep spans enough sites to blow review scope; the helper makes each peer a one-line call. | §3.5 |

---

## 2. Background — probed, not theorized

### 2.1 The CSRF bypass (reproduced from framework source)

Next 16's Server Action handler validates `Origin` against the host, but **explicitly lets a missing-`Origin` request through**. Source read from the bundled framework (the path below is deliberately plain text, not a code span: it lives under node_modules, which is untracked, and `pnpm spec:lint` resolves every code-span citation against `git ls-files`). The block is in next/dist/server/app-render/action-handler.js, at the `if (!originHost)` guard:

```js
if (!originHost) {
    // This is a handcrafted request without an origin or a request from an unsafe browser.
    // We'll let this through but log a warning.
    warning = 'Missing `origin` header from a forwarded Server Actions request.';
}
```

`originHost` is `undefined` when the `origin` header is absent, so the branch sets a `console.warn` and falls through, and the action executes. Next does **not** consult `sec-fetch-site` anywhere in this path. A cross-site POST that omits `Origin` therefore reaches the destructive action. That is the logout-CSRF primitive `BL-SERVER-ACTION-ORIGIN-GATE` records.

**Blast radius (unchanged from the prior filing):** an attacker who forces the call signs the victim out of *this app* on *that device* and deletes *one* picker entry for *one* show. `scope: "local"` means no other device is touched (`lib/auth/picker/clearIdentity.ts:98`). No data read, no privilege gain, no cross-account effect. Low severity — but a real gap, and now closable without the descoped trusted-proxy machinery.

### 2.2 The silent switch-person failure (probed)

`clearIdentity` resolves a typed result whose failure branch is reachable — `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }` from the `clearIdentityCore` catch (`lib/auth/picker/clearIdentity.ts:176-183`) or `{ ok: false, code: "PICKER_INVALID_INPUT" }` from validation (`lib/auth/picker/clearIdentity.ts:186-189`). The menu wrapper `clearIdentityFormAction` awaits it and returns `void` (`components/auth/IdentityChip.tsx:30-35`), so the result is discarded.

**Why the failure is invisible while success is visible.** On **success**, `clearIdentityCore` calls `revalidatePath` (`lib/auth/picker/clearIdentity.ts:219`); the page re-resolves access, no longer finds a picker entry for the show, and renders `<PickerInterstitial>` instead of the show body — the entire `AvatarMenu` unmounts. That disappearance IS the success signal. On **failure**, no `revalidatePath` runs (the catch returns before it), nothing re-renders, and because `AvatarMenu` owns its `open` state locally with no close-on-submit, the menu stays exactly as it was — same identity header, same "Not you?" item. Success and failure are visually identical minus the unmount that only success produces. The crew member reads "menu did something, page looks normal" as "switched."

---

## 3. Design A — same-origin gate for destructive picker Server Actions

### 3.1 The reachable endpoint set (render-path enumeration)

`lib/auth/picker/clearIdentity.ts` begins with a module-level `"use server"` directive (`lib/auth/picker/clearIdentity.ts:1`). Every **exported** async function in such a file is an independently addressable Server Action endpoint — reachable by a forged POST regardless of whether the app wires it to a form. The file exports three:

- `clearIdentity(formData)` — `lib/auth/picker/clearIdentity.ts:48`
- `clearIdentityAndSkip(formData)` — `lib/auth/picker/clearIdentity.ts:71`
- `clearIdentityCore(input)` — `lib/auth/picker/clearIdentity.ts:176` (exported for tests: `tests/auth/picker/clearIdentity.test.ts:10`, and used internally by the two above)

All three perform or lead to the destructive cookie deletion, so **all three are gated**. Enumerating the full exported set — not just the form-wired ones — is the point: a gate on `clearIdentity` alone leaves `clearIdentityCore` as an ungated deletion endpoint.

### 3.2 Where the gate runs

The gate is the **first statement** of each of the three exported actions, before any validation or mutation — matching the sign-out route's "refuse before any teardown" ordering (`app/auth/sign-out/route.ts:88-97`). On rejection the action returns a non-exposing typed result and performs no mutation:

```ts
export async function clearIdentity(formData: FormData): Promise<ClearIdentityResult> {
  if (!(await isSameOriginServerAction())) return { ok: false, code: "PICKER_ORIGIN_REJECTED" };
  // ...existing body
}
```

`clearIdentityAndSkip` and `clearIdentityCore` get the identical opening line. Because a legitimate in-app submission always passes, the internal call chain (`clearIdentityAndSkip` → `clearIdentityCore`) simply passes the check twice with the same header read — idempotent, no lock, no side effect.

`PICKER_ORIGIN_REJECTED` is a **forensic-only** returned code with no §12.4 catalog row and no crew copy, following the established pattern for `AUTH_SIGNOUT_FAILED` (`lib/auth/picker/clearIdentity.ts:118-123` explains why a returned code that is never rendered stays out of the catalog). The crew UI never renders this branch: a cross-site request does not originate from our own menu. If it somehow surfaced in the menu path, §4's client maps *any* failure to the generic `PICKER_SWITCH_FAILED` copy, so no raw code leaks (invariant 5 holds).

### 3.3 The helper — `isSameOriginServerAction()`

A new file, lib/auth/sameOriginServerAction.ts (plain text: it does not exist yet, so it is not a code-span citation), exporting one function. It reads request headers through `next/headers` `headers()` (a Server Action has no `NextRequest`), and mirrors the two in-repo precedents (`app/auth/sign-out/route.ts:70-87`, `app/api/observe/client-error/route.ts:43-48`):

```ts
import { headers } from "next/headers";
import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

/**
 * True iff the current Server Action request is same-origin. Depends ONLY on
 * browser-stamped Fetch Metadata and a build-time trusted origin, never on a
 * forwardable header (x-forwarded-host/host), so proxy behavior cannot weaken it.
 */
export async function isSameOriginServerAction(): Promise<boolean> {
  const h = await headers();
  const secFetchSite = h.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" || secFetchSite === "none";
  }
  const origin = h.get("origin");
  if (origin !== null) {
    const site = resolveSiteOrigin();
    return site.ok && origin === site.origin;
  }
  return true; // neither signal: framework default preserved (documented limit §7)
}
```

**Truth table** (the executable contract the unit tests pin):

| `sec-fetch-site` | `origin` | Result | Why |
| --- | --- | --- | --- |
| `same-origin` | any | **allow** | browser says same origin |
| `none` | any | **allow** | user-initiated (typed URL, bookmark) |
| `same-site` | any | **reject** | different origin, same site — matches sign-out route's strictness |
| `cross-site` | any | **reject** | the CSRF case; browser stamps this even when `Origin` is omitted |
| absent | `=== NEXT_PUBLIC_SITE_ORIGIN` | **allow** | proxy-independent origin match |
| absent | present, `!==` site origin | **reject** | cross-origin by trusted constant |
| absent | absent | **allow** | documented limit (§7) — framework default; no victim-cookie CSRF reachable |

`sec-fetch-site` is a browser-set forbidden request header: page JavaScript cannot set or alter it (`fetch`/`XHR`/form submission all leave it to the UA), and a modern browser stamps `cross-site` on any cross-site request carrying the victim's cookies. That is why the primary check closes the hole without any host derivation.

**Consequence bound.** Every request is either allowed or refused; a refused request performs no mutation and returns a non-exposing typed result. The gate reads no forwardable header, so a spoofed `x-forwarded-host`/`host` cannot weaken it. The only allowed-and-unverified case is "neither `sec-fetch-site` nor `Origin` present," which is strictly the framework's existing behavior (§7).

**Threat fence.** Defends against a cross-site web attacker who forces a signed-in crew member's browser to POST a destructive picker action (logout CSRF). Out of scope: a non-browser attacker forging headers on their own request (no victim credentials → not CSRF); TLS-layer MITM; a compromised reverse proxy that rewrites request headers (a deployment trust-boundary failure the gate deliberately does not depend on). Adversarial header-forgery by a client that already controls its own request is not a finding — it carries no victim cookies.

### 3.4 Deployment topology (documented, not escalated)

On Vercel the app runs behind Vercel's edge. The gate needs exactly two inputs and neither is a forwardable host header:

- **`sec-fetch-site`** — set by the crew member's browser, forwarded to the function runtime as an ordinary request header; JS-unforgeable.
- **`NEXT_PUBLIC_SITE_ORIGIN`** — a build/deploy-time constant already configured in this repo (`.env.local.example:77`) and consumed elsewhere via `resolveSiteOrigin` (`lib/notify/siteOrigin.ts:3-21`), which rejects blank/localhost values.

Because the gate never reads `x-forwarded-host` or `host`, the "which headers are authoritative per deployment / does the platform overwrite them" question that `BL-SERVER-ACTION-ORIGIN-GATE` flagged **does not arise**. It is dissolved, not answered — no security posture depends on proxy trust. (Localhost dev: `resolveSiteOrigin` returns `{ ok: false }`, so the Origin fallback is unavailable in dev — but dev browsers always send `sec-fetch-site`, which is evaluated first, so legitimate dev flows pass on the primary check. A non-browser dev client omitting `sec-fetch-site` but sending an `Origin` is rejected, which is correct.)

### 3.5 Class-sweep disposition

`BL-SERVER-ACTION-ORIGIN-GATE` asks to "gate every destructive Server Action, not just this one." There are roughly three dozen module-level `"use server"` files repo-wide (`grep -rl '"use server"' lib app` at authoring time returned 38, of which not all are destructive and several admin ones sit behind require-gates). This arc:

- ships the reusable `isSameOriginServerAction()` helper (§3.3),
- applies it to the filed surface (the `clearIdentity.ts` endpoint set),
- re-files the remaining destructive Server Actions (the peer surfaces among those ~37 non-`clearIdentity` files) as a new backlog entry `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP`, naming class-sweep disposition exception (c) (spans enough sites to blow review scope) and noting the helper reduces each peer to a one-line guard. Admin actions under require-gates have separate identity checks; the sweep entry records that origin-gating is still additive there.

`BL-SERVER-ACTION-ORIGIN-GATE` is archived with a resolution note pointing at this spec and the sweep entry.

---

## 4. Design B — legible switch-person failure (Option A, in-menu)

### 4.1 The seam today

`IdentityChip` (Server Component) declares `clearIdentityFormAction(formData): Promise<void>` and passes it to `AvatarMenu` (client island) as the `clearAction` prop (`components/auth/IdentityChip.tsx:30-35`, `71`; `components/auth/AvatarMenu.tsx:87`). `AvatarMenu` renders `<form action={clearAction}>` with hidden `slug`/`shareToken`/`showId` inputs (`components/auth/AvatarMenu.tsx:349-352`). The typed result never reaches the client — the whole defect.

### 4.2 The change — `useActionState`

`useActionState` is already the established client-error pattern on this exact surface (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` imports it). Apply it here:

- **`IdentityChip`** replaces the `(formData) => void` wrapper with an action of the `useActionState` shape:

  ```ts
  export type SwitchActionState = { status: "idle" | "error" };

  async function clearIdentitySwitchAction(
    _prev: SwitchActionState,
    formData: FormData,
  ): Promise<SwitchActionState> {
    "use server";
    const result = await clearIdentity(formData);
    return result.ok ? { status: "idle" } : { status: "error" };
  }
  ```

  The `// no-telemetry:` delegation comment is retained (§5, invariant 10). The forensic returned code is not carried into state — the UI shows one copy for any failure (§4.4), and the server-side forensic detail is unchanged (Resolved scope #6).

- **`AvatarMenu`** consumes it:

  ```ts
  const [switchState, switchFormAction, isSwitching] = useActionState(clearAction, { status: "idle" });
  ```

  `clearAction`'s prop type widens from `(formData: FormData) => void | Promise<void>` to `(prev: SwitchActionState, formData: FormData) => Promise<SwitchActionState>`. The form binds `action={switchFormAction}`.

### 4.3 Rendered elements (exact placement, guard conditions)

- **Error node.** When `switchState.status === "error"`, render, immediately **after** the `</form>` and still inside the `role="menu"` container's popover (below the "Not you?" item, above the popover's bottom padding): a block with `role="alert"` so assistive tech announces it on appearance, containing the text `messageFor("PICKER_SWITCH_FAILED").crewFacing`. It is NOT a `menuitem` (it is not focusable and not part of arrow-key traversal), consistent with the identity header's non-item treatment (`components/auth/AvatarMenu.tsx:271-297`). Styling uses existing danger tokens (`text-danger`/`bg-danger-bg`/`border-danger` families — the implementation resolves the exact token names against `DESIGN.md` at build time; impeccable dual-gate verifies contrast).
- **Guard conditions.** `status: "idle"` (initial, and after a successful clear that has not yet unmounted) renders **no** error node. On success the component unmounts via `revalidatePath` (§2.2), so the idle-after-success state is transient and renders nothing extra. Partial identity (blank name/role) is unchanged by this feature — the error node does not depend on name/role.
- **Pending.** While `isSwitching`, the "Not you?" submit button is `disabled` and the stale error node (if any) is removed (the in-flight retry clears it). This prevents a double-submit and gives the retry visible feedback.
- **Menu stays open on failure.** No code sets `open = false` on submit; `useActionState` does not touch `open`. So on failure the menu is unchanged except the error node appears. (Ratified Resolved scope #3.)

### 4.4 New catalog code `PICKER_SWITCH_FAILED` (three-lockstep)

Per `AGENTS.md` "§12.4 catalog row edits require three lockstep updates," all in one commit:

1. **Master spec §12.4 prose** — add the `PICKER_SWITCH_FAILED` row to the catalog table (near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3084`) **and** the matching `helpfulContext` line (near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3330`). The master spec is never run through Prettier.
2. **`pnpm gen:spec-codes`** (`scripts/extract-spec-codes.ts`) regenerates `lib/messages/__generated__/spec-codes.ts`.
3. **`lib/messages/catalog.ts`** — add the `PICKER_SWITCH_FAILED` entry.

Proposed catalog content (final copy tuned during implementation against `PRODUCT.md` voice; no em-dash, straight apostrophes):

| field | value |
| --- | --- |
| `code` | `PICKER_SWITCH_FAILED` |
| `warningClass` | `general` |
| `crewFacing` | `Couldn't switch. Please try again.` |
| `dougFacing` | `A crew member's "switch person" action failed; the identity was not cleared and they were shown a retry.` |
| `followUp` | `Crew → try again; Eric if repeated` |
| `title` | `Switch person failed` |
| `helpfulContext` / `longExplanation` | short, matching sibling PICKER rows |
| `helpHref` | `/help/errors#PICKER_SWITCH_FAILED` |

The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`) fails the build if any of the three drift. The UI reads the copy via `messageFor("PICKER_SWITCH_FAILED")` (`lib/messages/lookup.ts:100`), satisfying invariant 5 (no raw code in UI).

### 4.5 Gate path left as-is (ratified)

`clearIdentityAndSkip` in `_SignInOrSkipGate.tsx` keeps its `(formData) => void` wrapper (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:34-39`). Its failure re-renders the mismatch gate (a visible retry — `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a), so it is not silent the way the menu is. It IS still covered by the §3 same-origin gate (the gate lives in `clearIdentityAndSkip` itself). No copy or state change here.

### 4.6 Transition inventory

States of the menu + switch action: **Closed**, **Open-idle**, **Open-pending**, **Open-error**. (Success ⇒ unmount, not a state.) Enumerated pairs:

| From → To | Treatment |
| --- | --- |
| Closed → Open-idle | existing `avatar-menu-in` animation (`components/auth/AvatarMenu.tsx:267`); unchanged |
| Open-idle → Open-pending | instant — button becomes `disabled`; no animation needed |
| Open-pending → Open-error | instant — error node appears with `role="alert"`; deliberately instant so the alert is immediate (reduced-motion irrelevant) |
| Open-pending → unmount (success) | the whole header unmounts via `revalidatePath`; no local transition |
| Open-error → Open-pending (retry) | instant — error node removed while `isSwitching` |
| Open-error → Closed | existing close (Escape/outside-pointer/Tab); error node unmounts with the popover |
| Open-idle → Closed | existing close paths; unchanged |
| Open-pending → Closed | possible if the user Escapes mid-flight; the pending action still resolves server-side but its state update lands on an unmounted tree (React no-ops it) — no error surfaces, matching "closed the menu, moved on" |

Compound: "close the menu while a switch is pending" is the last row — safe, React discards the post-unmount state update. No animation collides with another.

### 4.7 Dimensional invariants

N/A — the error node is a normal-flow block inside the popover (`w-max min-w-56 max-w-[calc(100vw-2rem)]`, `components/auth/AvatarMenu.tsx:262`), which sizes to content; no fixed-height/width parent gains a flex/grid child through this change. The popover already scrolls its own width via `max-w`. No new parent→child dimension coupling is introduced.

---

## 5. Plan-wide invariants touched

- **Invariant 2 (advisory lock):** untouched. Neither the origin gate nor the failure state mutates `shows`/`crew_members`/etc.; `clearIdentity` writes only the picker cookie and takes no advisory lock (unchanged).
- **Invariant 5 (no raw error codes in UI):** upheld. `PICKER_SWITCH_FAILED` copy renders via `messageFor` (`lib/messages/lookup.ts:100`); the forensic `PICKER_ORIGIN_REJECTED` is never rendered.
- **Invariant 8 (UI quality gate):** `IdentityChip.tsx` and `AvatarMenu.tsx` are UI surfaces → impeccable `critique` + `audit` dual-gate on the diff at milestone close-out, before adversarial review. Closeout marker `impeccable-gate:` recorded in the plan.
- **Invariant 9 (Supabase call-boundary):** the file is already registered (`tests/auth/_metaInfraContract.test.ts:227`). The origin gate adds no Supabase client call; `isSameOriginServerAction` reads only `next/headers`. No registry change.
- **Invariant 10 (mutation-surface observability):** `clearIdentity`/`clearIdentityAndSkip` keep their existing `// no-telemetry:` delegation exemptions (`lib/auth/picker/clearIdentity.ts:49`, `lib/auth/picker/clearIdentity.ts:72-74`); the success emit `PICKER_IDENTITY_CLEARED` is unchanged; the new `clearIdentitySwitchAction` inline action is a thin non-admin wrapper delegating to a registered surface, carrying the same delegation exemption. No admin surface is added. (Resolved scope #6: menu-clear failure telemetry stays out of scope.)

---

## 6. Testing strategy

**A — same-origin gate (`isSameOriginServerAction`):** a table-driven unit suite over every `{sec-fetch-site} × {origin}` row of §3.3, mocking `next/headers` `headers()` and `NEXT_PUBLIC_SITE_ORIGIN`. Each row asserts allow/reject. Plus: `clearIdentity`/`clearIdentityAndSkip`/`clearIdentityCore` each return `{ ok: false, code: "PICKER_ORIGIN_REJECTED" }` **and perform no cookie mutation** when the gate rejects (spy the cookie store) — the anti-tautology point is asserting *no mutation happened*, not merely that a rejection value returned.

**B — bypass regression:** a test that drives the action with `sec-fetch-site: cross-site` and **no** `Origin` header (the exact §2.1 bypass) and asserts rejection — the case Next's default lets through.

**C — silent-failure fix:** a component/integration test on `AvatarMenu` — force `clearAction` to resolve `{ status: "error" }`, assert the `role="alert"` node renders `PICKER_SWITCH_FAILED`'s crew copy, the menu stays `open`, and the submit is re-enabled after. Force `{ status: "idle" }`, assert no alert node. Anti-tautology: derive the expected string from `messageFor("PICKER_SWITCH_FAILED").crewFacing`, not a hardcoded literal, so a copy edit cannot pass a stale assertion; scope the query to the alert node so the identity header's text cannot satisfy it.

**D — catalog parity:** `x1-catalog-parity` (existing) covers the three-lockstep automatically once the row lands.

**E — existing suites:** `tests/auth/picker/clearIdentity.test.ts` must still pass — the origin gate is prepended, so tests that call the actions directly must supply a passing header context (add a `same-origin` default to their `headers()` mock). The no-emit pin at `tests/auth/picker/clearIdentity.test.ts:228` is unchanged (Resolved scope #6).

All TDD per invariant 1: failing test → minimal impl → passing → commit, one task per commit.

## 7. Documented limits

- **Neither-signal requests are allowed.** A request carrying neither `sec-fetch-site` nor `Origin` passes the gate (framework default preserved). Reachable only by (a) non-browser clients — which cannot carry a victim's cookies, so cannot mount CSRF — or (b) pre-Fetch-Metadata browsers (roughly pre-2020). This is strictly no weaker than today's behavior, and strictly stronger on the `sec-fetch-site: cross-site` + missing-`Origin` path that is the filed bypass. Fenced both directions: it is not a hole to patch (Resolved scope #2) and not a regression.
- **`same-site` is rejected.** A same-site cross-origin request (e.g. a sibling subdomain) is refused, matching the sign-out route's strictness. The app is single-origin on Vercel, so no legitimate same-site-cross-origin caller exists; if one is ever added, this is the line to revisit.

## 8. Files touched

| File | Change |
| --- | --- |
| lib/auth/sameOriginServerAction.ts (new) | `isSameOriginServerAction()` helper (§3.3) |
| `lib/auth/picker/clearIdentity.ts` | prepend the gate to the 3 exported actions; add `PICKER_ORIGIN_REJECTED` forensic returned code (§3.2) |
| `components/auth/IdentityChip.tsx` | wrapper → `useActionState`-shaped `clearIdentitySwitchAction` (§4.2) — **UI** |
| `components/auth/AvatarMenu.tsx` | `useActionState`, error `role="alert"` node, pending disable, widened `clearAction` prop type (§4.2–4.6) — **UI** |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 `PICKER_SWITCH_FAILED` row + helpfulContext (§4.4) |
| `lib/messages/__generated__/spec-codes.ts` | regen via `pnpm gen:spec-codes` |
| `lib/messages/catalog.ts` | `PICKER_SWITCH_FAILED` entry |
| tests/auth/sameOriginServerAction.test.ts (new) | gate truth table + bypass regression (§6 A/B) |
| `tests/auth/picker/clearIdentity.test.ts` | add same-origin default to `headers()` mock; gate-reject cases (§6 E) |
| `components/auth/AvatarMenu.tsx` test(s) | in-menu error state (§6 C) |
| `BACKLOG.md` | archive `BL-SERVER-ACTION-ORIGIN-GATE` + `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`; file `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` (§3.5) |

`impeccable-gate:` — UI surfaces present (`IdentityChip.tsx`, `AvatarMenu.tsx`); dual gate runs at implementation close-out.
