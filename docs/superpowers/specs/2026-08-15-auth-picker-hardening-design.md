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
| 4 | **The failure copy is a NEW catalog code `PICKER_SWITCH_FAILED`; the crew-facing string is EXACTLY "Couldn't switch. Please try again."** Chosen over reusing the mismatched existing copy. User decision, batched 2026-08-15 — the crew string is ratified and fixed, not tunable at implementation (only the dev-facing fields are drafted). Introduces the §12.4 three-lockstep (§4.4). | §4.4 |
| 5 | **The "Continue as guest" gate path (`clearIdentityAndSkip` in `_SignInOrSkipGate.tsx`) is NOT given a bespoke error state.** Its failure re-renders the mismatch gate, whose CTA is itself the retry — already documented as non-silent. User decision, batched 2026-08-15. It IS still covered by the same-origin gate (§3.2). | §4.5; `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a |
| 6 | **Menu-clear server-side failure telemetry is OUT OF SCOPE.** The `clearIdentityCore` catch stays silent and its pinning test (`tests/auth/picker/clearIdentity.test.ts:228`) is unchanged; the existing `// no-telemetry:` delegation exemption stands. The filed defect is that the USER is not told — this spec fixes that. Server-side observability of this branch remains tracked by `BL-CREW-PICKER-OBSERVABILITY`. | §5 invariant 10 |
| 7 | **Gating the other ~37 destructive Server Actions is OUT OF SCOPE for this arc and re-filed.** This arc builds the reusable helper and applies it to the `clearIdentity.ts` endpoint set (the filed surface). Class-sweep disposition exception (c): the peer sweep spans enough sites to blow review scope; the helper makes each peer a one-line call. | §3.5 |
| 8 | **The menu "Switch person" is INEFFECTIVE for a Google-authenticated crew member, and fixing that is OUT OF SCOPE here.** `clearIdentity` deletes the picker cookie entry but does not end the Google session, so for a viewer resolved via a Google `success` session the next resolve returns `needs_picker_bootstrap` and re-mints the SAME identity (`lib/auth/picker/resolveShowPageAccess.ts:246`). This is a pre-existing efficacy gap, NOT the filed silent-**failure** defect (which is the `{ ok: false }` branch reporting success). It is fixed neither here nor claimed away: it is a documented limit (§7) and re-filed as `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` (§4.7). Making menu-switch sign a Google viewer out is a product decision (class-sweep exception (a)). | §2.2, §4.7, §7 |
| 9 | **The same-origin gate RETURNS an existing catalogued code and emits the forensic `PICKER_ORIGIN_REJECTED` via `log.warn`.** A returned `code:` literal is a §12.4 producer under `PRODUCER_RE` (`lib/messages/__internal__/codeProducers.ts:14`) and an uncatalogued one fails `x1` (`tests/cross-cutting/codes.test.ts:125`). So the rejection returns catalogued `PICKER_INVALID_INPUT`, and `PICKER_ORIGIN_REJECTED` rides a `log.warn` emission span (stripped by `stripLogEmissionCalls`, scanner-exempt), mirroring `AUTH_SIGNOUT_FAILED`. NO new returned literal, NO orphan producer. | §3.2 |

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

**Why the failure is invisible.** On **failure** (`{ ok: false }`), no `revalidatePath` runs (the catch returns before it), nothing re-renders, and because `AvatarMenu` owns its `open` state locally with no close-on-submit, the menu stays exactly as it was — same identity header, same "Not you?" item. The crew member reads "menu did something, page looks normal" as "switched." This `{ ok: false }` branch is the filed defect, and §4 makes it legible.

**The success branch is NOT uniformly "reaches the picker" — the model split by identity source (R1-F1 correction).** On `{ ok: true }` the page re-resolves access, and the outcome depends on how the viewer was resolved:

- **Cookie-only viewer (share-link path, no Google session):** the deleted entry is gone, so the re-resolve falls to `first_contact` and renders `<PickerInterstitial>` — the entire `AvatarMenu` unmounts. That disappearance IS the success signal, and the switch is effective.
- **Google-session viewer (resolved `source: "cookie"` after a bootstrap mint):** deleting the cookie entry does NOT end the Google session. The next resolve hits the Google `success` branch, finds no matching entry, and returns `needs_picker_bootstrap` (`lib/auth/picker/resolveShowPageAccess.ts:246`), which re-mints the SAME identity. The same person reappears; the menu-switch is INEFFECTIVE for them.

The Google-session case is a pre-existing efficacy gap, distinct from the filed silent-**failure** defect, and out of scope here (Resolved scope #8). It is a documented limit (§7) and re-filed (§4.7). `AvatarMenu` receives no identity-source discriminator today, so it cannot branch on this — which is exactly why fixing it is a separate design, not a line in this one. This spec's success-path claims are therefore scoped to the `{ ok: false }` signaling change; §6C's component test asserts the source-agnostic `{ ok: false } → alert` and `idle → no-alert` behavior and makes no claim about reaching the picker.

### 2.3 Empirical probe — the close/pending/reopen lifecycle (R2-F2)

Per the mandatory empirical-spike rule for stateful/close-race designs, the failure-state lifecycle (§4.2: local `useState` + `useTransition`, state owned by the always-mounted `AvatarMenu`, alert rendered only inside `{open ? … }`, reset-on-open) was verified with a probe harness replicating the exact pattern before the design was ratified. Probe: `tests/components/auth/_probeSwitchCloseRace.test.tsx` (a Harness, not the shipped component — design evidence; Task 4 folds the same assertions against the real `AvatarMenu`). Result — **4/4 pass**:

1. **Failure while open → alert shows.** The transition resolves and `setSwitchStatus("error")` renders the `role="alert"` node.
2. **Close while pending, then resolve-failure → no throw, nothing rendered.** `AvatarMenu` stays mounted, so `setSwitchStatus("error")` after close is a benign state update on a mounted node (no React warning); the alert lives inside `{open ? … }`, so nothing renders while closed. This is the branch R2-F1 flags: that user is NOT shown a retry — the copy (§4.4) must not claim otherwise.
3. **Reopen after a close-while-pending failure (promise already settled) → NO stale alert.** `openAt`'s `setSwitchStatus("idle")` clears it, so a reopen never surfaces the prior error.
4. **Reopen WHILE STILL PENDING (Closed→Open-pending, R3-F1) → submit disabled, no alert; then failure surfaces.** Submit, close, reopen BEFORE the promise settles: the `useTransition` pending persists on the mounted parent, so the reopened popover shows the submit `disabled` and no alert (idle); when the promise then settles failed, the alert appears in the open menu and the submit re-enables. This is the compound transition R3-F1 flagged as untested — now measured.

The probe pins the non-obvious framework behaviors the design leans on (setState-after-close on a mounted node is benign; reset-on-open clears a hidden error; `useTransition` pending survives close/reopen so a reopened-while-pending menu is correctly disabled), so the transition inventory (§4.6) is grounded in measurement, not prose.

---

## 3. Design A — same-origin gate for destructive picker Server Actions

### 3.1 The reachable endpoint set (render-path enumeration)

`lib/auth/picker/clearIdentity.ts` begins with a module-level `"use server"` directive (`lib/auth/picker/clearIdentity.ts:1`). Every **exported** async function in such a file is an independently addressable Server Action endpoint — reachable by a forged POST regardless of whether the app wires it to a form. The file exports three:

- `clearIdentity(formData)` — `lib/auth/picker/clearIdentity.ts:48`
- `clearIdentityAndSkip(formData)` — `lib/auth/picker/clearIdentity.ts:71`
- `clearIdentityCore(input)` — `lib/auth/picker/clearIdentity.ts:176` (exported for tests: `tests/auth/picker/clearIdentity.test.ts:10`, and used internally by the two above)

All three perform or lead to the destructive cookie deletion, so **all three are gated**. Enumerating the full exported set — not just the form-wired ones — is the point: a gate on `clearIdentity` alone leaves `clearIdentityCore` as an ungated deletion endpoint.

### 3.2 Where the gate runs

The gate is the **first statement** of each of the three exported actions, before any validation or mutation — matching the sign-out route's "refuse before any teardown" ordering (`app/auth/sign-out/route.ts:88-97`). On rejection the action emits a forensic `log.warn` and returns a non-exposing **catalogued** typed result, performing no mutation:

```ts
export async function clearIdentity(formData: FormData): Promise<ClearIdentityResult> {
  if (!(await isSameOriginServerAction())) return rejectCrossOrigin("clearIdentity");
  // ...existing body
}
```

where the shared helper (co-located in `clearIdentity.ts`) is:

```ts
function rejectCrossOrigin(action: string): ClearIdentityResult {
  log.warn("cross-origin picker action refused", {
    source: "auth.picker.sameOriginGate",
    code: "PICKER_ORIGIN_REJECTED", // forensic, rides the emit, stripped by stripLogEmissionCalls
    action,
  });
  return { ok: false, code: "PICKER_INVALID_INPUT" }; // catalogued returned code (§12.4)
}
```

`clearIdentityAndSkip` and `clearIdentityCore` get the identical opening line. Because a legitimate in-app submission always passes, the internal call chain (`clearIdentityAndSkip` → `clearIdentityCore`) simply passes the check twice with the same header read — idempotent, no lock, no side effect.

**Why the returned code is `PICKER_INVALID_INPUT`, not a new literal (R1-F2 correction).** A returned `code:` literal is a §12.4 producer under `PRODUCER_RE` (`lib/messages/__internal__/codeProducers.ts:14`); `stripLogEmissionCalls` exempts only codes inside `log.*`/`logAdminOutcome` spans, and `x1` fails on any orphan producer (`tests/cross-cutting/codes.test.ts:125`). So the *returned* code must be catalogued — `PICKER_INVALID_INPUT` fits ("the request was rejected before any cookie was written"). The distinguishing forensic code `PICKER_ORIGIN_REJECTED` rides the `log.warn` span (scanner-exempt, exactly as `AUTH_SIGNOUT_FAILED` does at `lib/auth/picker/clearIdentity.ts:111-123`), giving security-monitoring visibility of a CSRF attempt without a catalog row. The crew UI never renders this branch (a cross-site request does not originate from our own menu); if it somehow surfaced in the menu path, §4's client maps *any* failure to the generic `PICKER_SWITCH_FAILED` copy, so no raw code leaks (invariant 5 holds). This emit also newly instruments the origin-rejection branch (invariant 10, §5).

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

### 4.2 The change — a returned-result action + local reset-on-open state

`useActionState` is the established client-error pattern elsewhere (`_PickerInterstitial.tsx`), but it is the WRONG tool here: React 19 gives it no reset API, and the avatar menu's open/close lifecycle needs the error CLEARED on reopen (R1-F4: `open=false` only hides the popover; `AvatarMenu` stays mounted, so a `useActionState` error would persist and reappear on the next open). So the failure state is a plain local `useState` that the menu resets when it opens.

- **`IdentityChip`** keeps the wrapper NAME `clearIdentityFormAction` (the role-chip contract pins `clearAction={clearIdentityFormAction}` — `tests/components/_metaPickerRoleChipContract.test.ts:21`, R1-F7) and only widens its return type from `Promise<void>` to `Promise<ClearIdentityResult>`:

  ```ts
  async function clearIdentityFormAction(formData: FormData): Promise<ClearIdentityResult> {
    "use server";
    // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker clearIdentity,
    // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
    return clearIdentity(formData);
  }
  ```

  `ClearIdentityResult` is exported (type-only) from `clearIdentity.ts` so the client island can `import type` it (types are erased — no server code crosses the boundary).

- **`AvatarMenu`** consumes the result through a client-side action closure with local state:

  ```ts
  const [switchStatus, setSwitchStatus] = useState<"idle" | "error">("idle");
  const [switchPending, startSwitch] = useTransition();
  // clearAction prop type widens: (formData: FormData) => Promise<ClearIdentityResult>

  const onSwitchSubmit = (formData: FormData): void => {
    setSwitchStatus("idle");                        // clear a prior error before the retry
    startSwitch(async () => {
      const result = await clearAction(formData);   // invokes the server action
      if (!result.ok) setSwitchStatus("error");     // success path re-renders/unmounts server-side
    });
  };
  ```

  The form binds `action={onSwitchSubmit}` (keeping its hidden `slug`/`shareToken`/`showId` inputs — R1-F7 role inputs preserved). **Reset-on-open (R1-F4 fix):** `openAt(...)` and the trigger's open path call `setSwitchStatus("idle")`, so every reopen starts clean and a stale error can never reappear. Closing mid-pending is safe: the transition resolves on the still-mounted `AvatarMenu`, but the alert lives inside the `{open ? … }` popover, so nothing is shown while closed, and the next open has already reset to idle.

### 4.3 Rendered elements (exact placement, guard conditions)

- **Error node (exact contract, R3-F2).** When `switchStatus === "error"`, render, as the LAST child of the popover `<div>` and a SIBLING placed immediately AFTER the `role="menu"` element (not inside it, not after `</form>` which sits within the menu):

  ```tsx
  <div
    role="alert"
    data-testid="avatar-menu-switch-error"
    className="mt-1 rounded-sm border border-border-strong bg-warning-bg px-3 py-2 text-xs/relaxed text-warning-text"
  >
    {messageFor("PICKER_SWITCH_FAILED").crewFacing}
  </div>
  ```

  This is the repo's canonical crew/admin inline-error idiom, copied verbatim from `components/admin/ShowRowActions.tsx:859` (`role="alert"` + `border border-border-strong bg-warning-bg … text-xs/relaxed text-warning-text`). It uses the `warning-*` token family, which matches the catalog's `warningClass: "general"`; the earlier draft named `text-danger`/`border-danger`, which do NOT exist — only `--color-danger-bg` is defined (`app/globals.css:94`), and no danger text/border token exists (R3-F2). Placement mirrors the identity header, which is deliberately a sibling of the menu, not one of its items (`components/auth/AvatarMenu.tsx:271-297`; pinned by `tests/components/auth/avatarMenu.test.tsx:97`, `menu.contains(header) === false`). `mt-1` gives it separation from the menu within the popover's `p-1.5`; `px-3` aligns with the menu items' horizontal rhythm. The alert is not a `menuitem`, not focusable, not in arrow-key traversal. Contrast for `warning-text` on `warning-bg` is already established (used across `ShowRowActions`, `PreviewBanner`); the impeccable dual-gate re-verifies on the diff.
- **Guard conditions.** `switchStatus === "idle"` (initial, after reopen, and after a successful clear that has not yet unmounted) renders **no** error node. Partial identity (blank name/role) is unchanged by this feature — the error node does not depend on name/role.
- **Pending.** While `switchPending`, the "Not you?" submit button is `disabled`; the error node is already cleared by `setSwitchStatus("idle")` at the start of `onSwitchSubmit`, so the retry shows no stale error. This prevents a double-submit and gives the retry visible feedback.
- **Menu stays open on failure.** No code sets `open = false` on submit. So on failure the menu is unchanged except the error node appears as a sibling of the menu. (Ratified Resolved scope #3.)

### 4.4 New catalog code `PICKER_SWITCH_FAILED` (three-lockstep)

Per `AGENTS.md` "§12.4 catalog row edits require three lockstep updates," all in one commit:

1. **Master spec §12.4 prose** — add the `PICKER_SWITCH_FAILED` row to the catalog table (near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3084`) **and** the matching `helpfulContext` line (near `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3330`). The master spec is never run through Prettier.
2. **`pnpm gen:spec-codes`** (`scripts/extract-spec-codes.ts`) regenerates `lib/messages/__generated__/spec-codes.ts`.
3. **`lib/messages/catalog.ts`** — add the `PICKER_SWITCH_FAILED` entry.

Catalog content. The `crewFacing` string is the **ratified, fixed** copy (Resolved scope #4) — it is not tunable at implementation. The dev-facing fields (`dougFacing`/`helpfulContext`/`longExplanation`) are drafted here and may be reworded for voice; no em-dash anywhere, straight apostrophes matching sibling PICKER rows:

| field | value |
| --- | --- |
| `code` | `PICKER_SWITCH_FAILED` |
| `warningClass` | `general` |
| `crewFacing` (fixed) | `Couldn't switch. Please try again.` |
| `dougFacing` (drafted) | `A crew member's switch person clear did not land.` |
| `followUp` | `Crew → try again; Eric if repeated` |
| `title` | `Switch person failed` |
| `helpfulContext` / `longExplanation` (drafted) | short, matching sibling PICKER rows |
| `helpHref` | `/help/errors#PICKER_SWITCH_FAILED` |

The dev-facing copy asserts ONLY the server-observable fact ("the clear did not land"). It deliberately claims neither "the identity was not cleared" (R1-F3: a reachable branch stages the cookie deletion before `revalidatePath` throws, returning `{ ok: false }` with the deletion already staged — `lib/auth/picker/clearIdentity.ts:199`, proven by `tests/auth/picker/clearIdentity.test.ts:327`) NOR "they were shown a retry" (R2-F1: if the viewer closed the menu while the clear was pending, the alert is never rendered and reopening resets it — §2.3 probe case 2). Both are client-UI outcomes the server code cannot guarantee, so the catalog copy stays to what is always true.

The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts`) fails the build if any of the three drift. The UI reads the copy via `messageFor("PICKER_SWITCH_FAILED")` (`lib/messages/lookup.ts:100`), satisfying invariant 5 (no raw code in UI).

### 4.5 Gate path left as-is (ratified)

`clearIdentityAndSkip` in `_SignInOrSkipGate.tsx` keeps its `(formData) => void` wrapper (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:34-39`). Its failure re-renders the mismatch gate (a visible retry — `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md` §4.3a), so it is not silent the way the menu is. It IS still covered by the §3 same-origin gate (the gate lives in `clearIdentityAndSkip` itself). No copy or state change here.

### 4.6 Transition inventory

Four states: **Closed**, **Open-idle**, **Open-pending**, **Open-error** (success ⇒ unmount, not a state). All N·(N−1)/2 = **6 unordered pairs** enumerated, both directions, each reachable-with-treatment or declared impossible (R2-F2):

| Pair | Direction & treatment |
| --- | --- |
| Closed ↔ Open-idle | **Closed→Open-idle:** `avatar-menu-in` animation (`components/auth/AvatarMenu.tsx:267`); `openAt` resets `switchStatus` to idle first (R1-F4/R2-F1). **Open-idle→Closed:** existing close (Escape / outside-pointer / Tab); unchanged. |
| Closed ↔ Open-pending | **Open-pending→Closed:** close mid-flight (§2.3 probe case 2) — the transition still resolves on the mounted `AvatarMenu`, but the alert is inside `{open ? … }`, so nothing renders. **Closed→Open-pending: REACHABLE (R3-F1)** — submit, close while the clear is still in flight, then reopen BEFORE the promise settles. `openAt` resets `switchStatus` to idle but does NOT cancel `switchPending` (the `useTransition` pending persists on the always-mounted `AvatarMenu`), so the reopened popover shows the submit `disabled={switchPending}` and no alert; when the promise settles, success unmounts (cookie-only) or the alert appears in the now-open menu (failure). Verified by §2.3 probe case 4. |
| Closed ↔ Open-error | **Open-error→Closed:** existing close; the alert (inside the popover) unmounts with it. **Closed→Open-error: IMPOSSIBLE** — `openAt` resets `switchStatus` to idle, so a reopen never lands directly in Open-error even if a prior clear failed while closed; the earliest it can re-enter error is after a fresh submit resolves failed (Closed→Open-pending→Open-error). |
| Open-idle ↔ Open-pending | **Open-idle→Open-pending:** submit; instant, button becomes `disabled`. **Open-pending→Open-idle:** the action resolves `{ ok: true }` without unmount (a Google-session viewer or a test mock; the cookie-only success unmounts instead) — instant, alert never appeared. |
| Open-idle ↔ Open-error | **Open-idle→Open-error: IMPOSSIBLE directly** — reaching error requires a submit, i.e. it always passes through Open-pending (idle→pending→error). **Open-error→Open-idle:** the first step of a retry — `onSwitchSubmit` sets idle before starting the transition — then proceeds to Open-pending; a direct rest-at-idle also occurs if that retry then succeeds without unmount. |
| Open-pending ↔ Open-error | **Open-pending→Open-error:** `{ ok: false }` resolves; instant, `role="alert"` node appears as a sibling of `role="menu"` (immediate, reduced-motion irrelevant). **Open-error→Open-pending:** retry; instant, `onSwitchSubmit` clears the error at the start. |

Also enumerated: **Open-pending → unmount (success, cookie-only viewer)** — the whole header unmounts via `revalidatePath`; no local transition (the Google-session viewer re-mints the same identity, §4.7 limit, not a state). Compound "close mid-pending, then reopen" is §2.3 probe case 3 — safe, verified. No animation collides with another.

### 4.7 Google-authenticated switch is a documented limit (R1-F1)

For a viewer resolved via a Google `success` session, `clearIdentity` deletes the cookie entry but not the session, so the next resolve returns `needs_picker_bootstrap` and re-mints the same identity (`lib/auth/picker/resolveShowPageAccess.ts:246`) — the menu-switch does not reach the picker for them. This spec does not fix it (that needs a product decision about whether menu-switch should sign a Google viewer out, and an identity-source discriminator `AvatarMenu` does not receive today). It is fenced in §7 and re-filed as `BL-SWITCH-PERSON-GOOGLE-LOOPBACK`. The `{ ok: false }` signaling fix in §4.2–4.3 is orthogonal and applies to every viewer.

### 4.8 Dimensional invariants

N/A — the error node is a normal-flow block inside the popover (`w-max min-w-56 max-w-[calc(100vw-2rem)]`, `components/auth/AvatarMenu.tsx:262`), which sizes to content; no fixed-height/width parent gains a flex/grid child through this change. The popover already scrolls its own width via `max-w`. No new parent→child dimension coupling is introduced.

---

## 5. Plan-wide invariants touched

- **Invariant 2 (advisory lock):** untouched. Neither the origin gate nor the failure state mutates `shows`/`crew_members`/etc.; `clearIdentity` writes only the picker cookie and takes no advisory lock (unchanged).
- **Invariant 5 (no raw error codes in UI):** upheld. `PICKER_SWITCH_FAILED` copy renders via `messageFor` (`lib/messages/lookup.ts:100`); the origin-rejection returns the catalogued `PICKER_INVALID_INPUT` and the forensic `PICKER_ORIGIN_REJECTED` lives only in a `log.warn` span, never rendered.
- **Invariant 8 (UI quality gate):** `IdentityChip.tsx` and `AvatarMenu.tsx` are UI surfaces → impeccable `critique` + `audit` dual-gate on the diff at milestone close-out, before adversarial review. Closeout marker `impeccable-gate:` recorded in the plan.
- **Invariant 9 (Supabase call-boundary):** the file is already registered (`tests/auth/_metaInfraContract.test.ts:227`). The origin gate adds no Supabase client call; `isSameOriginServerAction` reads only `next/headers`. No registry change.
- **Invariant 10 (mutation-surface observability):** `clearIdentity`/`clearIdentityAndSkip` keep their existing `// no-telemetry:` delegation exemptions (`lib/auth/picker/clearIdentity.ts:49`, `lib/auth/picker/clearIdentity.ts:72-74`); the success emit `PICKER_IDENTITY_CLEARED` is unchanged; the origin-rejection now carries a code-carrying `log.warn` (`PICKER_ORIGIN_REJECTED`, §3.2), which newly instruments a branch that was previously dark and is pinned by the §6A emit-spy test (R2-F3). The `IdentityChip` wrapper `clearIdentityFormAction` is the SAME function-scoped inline action as today (name preserved), keeping its delegation exemption; its return type widening does not change its observability class. No admin surface is added. (Resolved scope #6: the `clearIdentityCore` catch stays out of scope.)

---

## 6. Testing strategy

**A — same-origin gate (`isSameOriginServerAction`):** a table-driven unit suite over every `{sec-fetch-site} × {origin}` row of §3.3, mocking `next/headers` `headers()` and `NEXT_PUBLIC_SITE_ORIGIN`. Each row asserts allow/reject. Plus, per action: `clearIdentity`/`clearIdentityAndSkip`/`clearIdentityCore` each return `{ ok: false, code: "PICKER_INVALID_INPUT" }` (the catalogued rejection code, §3.2) **and perform no mutation** when the gate rejects — the cookie-store `set` spy is NOT called, and for `clearIdentityAndSkip` the `signOut` spy is NOT called either (R1-F6: the external `supabase.auth.signOut` mutation must be proven untouched, not just the cookie; the existing harness already exposes `createClient`/`signOut` spies at `tests/auth/picker/clearIdentity.test.ts`). **Emit proof (R2-F3):** a spy on `log.warn` asserts the rejection emits `code: "PICKER_ORIGIN_REJECTED"` — omitting the forensic emit must fail a test, so the security-monitoring signal is pinned, not just described. Anti-tautology: assert *no mutation happened* and *the emit fired*, not merely that a rejection value returned; a guard-order regression that revoked before refusing, or a silent rejection with no emit, fails these.

**B — bypass regression:** a test that drives the action with `sec-fetch-site: cross-site` and **no** `Origin` header (the exact §2.1 bypass) and asserts rejection — the case Next's default lets through.

**C — silent-failure fix:** a component test on the real `AvatarMenu` (folding the §2.3 probe's assertions onto the shipped component) — pass a `clearAction` mock resolving `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }`; open the menu, submit "Not you?", and assert the `role="alert"` node (a SIBLING of `role="menu"` — assert `screen.getByRole("menu").contains(alert) === false`, mirroring `avatarMenu.test.tsx:97`) renders `PICKER_SWITCH_FAILED`'s crew copy, the popover stays open, and the submit re-enables. Pass a mock resolving `{ ok: true }`, assert no alert node. **R1-F4 / R2-F2 / R3-F1 lifecycle cases:** (i) after a failure, close and reopen — assert no stale alert (reset-on-open); (ii) submit, close the menu WHILE the clear is still pending, then resolve failure — assert no throw and no alert; reopen — assert no alert; (iii) **reopen WHILE STILL PENDING (Closed→Open-pending):** submit, close, reopen BEFORE resolving — assert the submit is `disabled` (pending persists) and no alert; then resolve failure — assert the alert appears in the open menu and the submit re-enables. These three exercise the close/reopen-while-pending paths the §2.3 probe verified on the Harness (cases 2–4). Anti-tautology: derive the expected string from `messageFor("PICKER_SWITCH_FAILED").crewFacing`, not a hardcoded literal; scope the query to `role="alert"` so the identity header's text cannot satisfy it. Four string-presence mutants recorded in the commit (empty copy; appended suffix; copy present but in a `title` attribute / inside `role="menu"`; `ok` true↔false varied).

**D — catalog parity:** `x1-catalog-parity` (existing) covers the three-lockstep automatically once the row lands, and rejects an orphan producer — which is why the origin rejection returns a catalogued code (§3.2, R1-F2).

**E — existing suites (R1-F7 enumerated).** The `clearAction` prop widens from `() => void | Promise<void>` to `(formData) => Promise<ClearIdentityResult>`, and `tsconfig` includes these files, so each void mock is a deterministic typecheck failure until updated:
- `tests/components/auth/avatarMenu.test.tsx:37` — `const clearAction = (): void => {}` → return `{ ok: true }`.
- `tests/components/IdentityChip.test.tsx:42` — same void mock → return `{ ok: true }`.
- `tests/components/identityChipSrSeparator.test.tsx:34` — `clearAction: (): void => {}` → return `{ ok: true }`.
- `tests/components/_metaPickerRoleChipContract.test.ts:21` — pins `clearAction={clearIdentityFormAction}`; the wrapper NAME is preserved (§4.2), so this passes unchanged. (If the name ever changes, this contract must change in lockstep.)
- `tests/auth/picker/clearIdentity.test.ts` — the origin gate is prepended, so add a `same-origin` default to the suite's `headers()` mock; existing cases pass through. The no-emit pin at `tests/auth/picker/clearIdentity.test.ts:228` is unchanged (Resolved scope #6).

All TDD per invariant 1: failing test → minimal impl → passing → commit, one task per commit.

## 7. Documented limits

- **Neither-signal requests are allowed.** A request carrying neither `sec-fetch-site` nor `Origin` passes the gate (framework default preserved). Reachable only by (a) non-browser clients — which cannot carry a victim's cookies, so cannot mount CSRF — or (b) pre-Fetch-Metadata browsers (roughly pre-2020). This is strictly no weaker than today's behavior, and strictly stronger on the `sec-fetch-site: cross-site` + missing-`Origin` path that is the filed bypass. Fenced both directions: it is not a hole to patch (Resolved scope #2) and not a regression.
- **`same-site` is rejected.** A same-site cross-origin request (e.g. a sibling subdomain) is refused, matching the sign-out route's strictness. The app is single-origin on Vercel, so no legitimate same-site-cross-origin caller exists; if one is ever added, this is the line to revisit.
- **Menu "Switch person" is ineffective for a Google-authenticated viewer** (R1-F1, §4.7). Clearing the cookie entry re-mints the same identity via bootstrap because the Google session survives. Not a regression (pre-existing), not the filed silent-failure defect, and out of scope; re-filed as `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` for a product decision on whether menu-switch should sign a Google viewer out.

## 8. Files touched

| File | Change |
| --- | --- |
| lib/auth/sameOriginServerAction.ts (new) | `isSameOriginServerAction()` helper (§3.3) |
| `lib/auth/picker/clearIdentity.ts` | prepend the gate to the 3 exported actions via `rejectCrossOrigin` (forensic `log.warn` `PICKER_ORIGIN_REJECTED` + returns catalogued `PICKER_INVALID_INPUT`, §3.2); export `ClearIdentityResult` (type) |
| `components/auth/IdentityChip.tsx` | widen `clearIdentityFormAction` return type to `Promise<ClearIdentityResult>` (NAME preserved, §4.2) — **UI** |
| `components/auth/AvatarMenu.tsx` | local `useState`+`useTransition` switch state (reset-on-open), error `role="alert"` node as a SIBLING of `role="menu"`, pending disable, widened `clearAction` prop type (§4.2–4.8) — **UI** |
| `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` | §12.4 `PICKER_SWITCH_FAILED` row + helpfulContext (§4.4) |
| `lib/messages/__generated__/spec-codes.ts` | regen via `pnpm gen:spec-codes` |
| `lib/messages/catalog.ts` | `PICKER_SWITCH_FAILED` entry |
| tests/components/auth/_probeSwitchCloseRace.test.tsx (new, probe) | empirical spike for the close/pending/reopen lifecycle, 3/3 pass (§2.3) |
| tests/auth/sameOriginServerAction.test.ts (new) | gate truth table + bypass regression + emit-spy (§6 A/B) |
| `tests/auth/picker/clearIdentity.test.ts` | same-origin default in `headers()` mock; gate-reject cases incl. `signOut`-untouched for `clearIdentityAndSkip` (§6 A/E) |
| `tests/components/auth/avatarMenu.test.tsx` | in-menu error state incl. reopen-reset; void-mock → `{ ok: true }` (§6 C/E) |
| `tests/components/IdentityChip.test.tsx` | void-mock → `{ ok: true }` (§6 E) |
| `tests/components/identityChipSrSeparator.test.tsx` | void-mock → `{ ok: true }` (§6 E) |
| `BACKLOG.md` / `BACKLOG-archive.md` | archive `BL-SERVER-ACTION-ORIGIN-GATE` + `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`; file `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` (§3.5) and `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` (§4.7) |

`impeccable-gate:` — UI surfaces present (`IdentityChip.tsx`, `AvatarMenu.tsx`); dual gate runs at implementation close-out.
