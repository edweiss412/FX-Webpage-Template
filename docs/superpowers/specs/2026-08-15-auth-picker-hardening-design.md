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
4. **Reopen WHILE STILL PENDING (Closed→Open-pending, R3-F1) → submit `aria-disabled`, no alert; then failure surfaces.** Submit, close, reopen BEFORE the promise settles: the phase lives on the always-mounted parent (AMENDED 2026-08-27; it used to be `useTransition`'s flag), so the reopened popover shows the submit `aria-disabled` (still focusable, R4-F1) and no alert (idle); when the promise then settles failed, the alert appears in the open menu and the submit re-enables. This is the compound transition R3-F1 flagged as untested — now measured.

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

`IdentityChip` (Server Component) declares `clearIdentityFormAction(formData): Promise<void>` and passes it to `AvatarMenu` (client island) as the `clearAction` prop (`components/auth/IdentityChip.tsx:30-35`, `71`; `components/auth/AvatarMenu.tsx:102`). `AvatarMenu` renders `<form action={clearAction}>` with hidden `slug`/`shareToken`/`showId` inputs (`components/auth/AvatarMenu.tsx:475-478`). The typed result never reaches the client — the whole defect.

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

- **`AvatarMenu`** consumes the result through a client-side action closure with local state. **AMENDED 2026-08-27** (`fix/avatar-menu-switch-pending-watchdog`): the snippet below used to derive busy from `useTransition`'s pending flag and to guard re-entry inside `onSwitchSubmit`. Neither is true of the shipped component. The flag is entangled across concurrent transitions from one hook, so anything rendered from it is wrong the moment a retry exists; and React holds updates scheduled inside a form action until that action settles, so a clear that never settles never commits its own pending state. The component owns a three-valued phase, and the phase write and the re-entry guard live in the submit button's `onClick`:

  ```ts
  const [switchStatus, setSwitchStatus] = useState<"idle" | "error">("idle");
  const [switchPhase, setSwitchPhase] = useState<"idle" | "pending" | "timedout">("idle");
  const [, startSwitch] = useTransition(); // scheduling only; its flag is not read
  const switchBusy = switchPhase === "pending";

  // onClick, a discrete event that commits immediately.
  const beginSwitch = (event) => {
    if (switchBusy) { event.preventDefault(); return; }
    switchAttempt.current += 1;
    setSwitchStatus("idle");
    setSwitchPhase("pending");
  };

  // the form action: the async work and the result seam.
  const onSwitchSubmit = (formData: FormData): void => { … };
  ```

  This is the repo's canonical crew/admin inline-error idiom, copied verbatim from `components/admin/ShowRowActions.tsx:859` (`role="alert"` + `border border-border-strong bg-warning-bg … text-xs/relaxed text-warning-text`). It uses the `warning-*` token family, which matches the catalog's `warningClass: "general"`; the earlier draft named `text-danger`/`border-danger`, which do NOT exist — only `--color-danger-bg` is defined (`app/globals.css:94`), and no danger text/border token exists (R3-F2). Placement mirrors the identity header, which is deliberately a sibling of the menu, not one of its items (`components/auth/AvatarMenu.tsx:401-427`; pinned by `tests/components/auth/avatarMenu.test.tsx:97`, `menu.contains(header) === false`). `mt-1` gives it separation from the menu within the popover's `p-1.5`; `px-3` aligns with the menu items' horizontal rhythm. The alert is not a `menuitem`, not focusable, not in arrow-key traversal. Contrast for `warning-text` on `warning-bg` is already established (used across `ShowRowActions`, `PreviewBanner`); the impeccable dual-gate re-verifies on the diff.
- **Guard conditions.** `switchStatus === "idle"` (initial, after reopen, and after a successful clear that has not yet unmounted) renders **no** error node. Partial identity (blank name/role) is unchanged by this feature — the error node does not depend on name/role.
- **Pending (R4-F1 — `aria-disabled`, NOT native `disabled`).** While busy (`switchPhase === "pending"`, AMENDED 2026-08-27 from `switchPending`), the "Not you?" submit button carries `aria-disabled={switchBusy}` and a visual disabled style (`aria-disabled:opacity-60 aria-disabled:cursor-not-allowed`), NOT the native `disabled` attribute. Native `disabled` removes the element from focus, which breaks this menu's roving-tabindex contract: `focusItem` calls `.focus()` on the fixed item index (`components/auth/AvatarMenu.tsx:220-223`), so a disabled switch item would swallow ArrowDown / ArrowUp-wrap / End / reopen-with-ArrowUp and strand focus outside the menu (the four commands R4-F1's sweep named). Per the WAI-ARIA menu pattern a disabled item stays focusable and is skipped only for activation, so `aria-disabled` keeps arrow navigation intact. Re-entry is prevented in the handler instead. AMENDED 2026-08-27: the guard is `if (switchBusy) { event.preventDefault(); return; }` in the submit button's `onClick`, not an early return in `onSwitchSubmit`. Both statements are load-bearing, because `aria-disabled` does not stop activation and returning does not cancel a submit button's default action; and the guard sits on the click rather than the action because React holds updates scheduled inside a form action until that action settles, so a clear that never settles would never commit its own pending state. The error node is cleared by `setSwitchStatus("idle")` in `beginSwitch` (AMENDED 2026-08-27; it used to sit at the head of `onSwitchSubmit`), so the retry shows no stale error. The location is load-bearing rather than incidental: React defers updates scheduled inside a form action until that action settles, so a reset moved back into `onSwitchSubmit` would leave the old error on screen for the whole of a retry that hangs.
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

> **AMENDED 2026-08-27** (`fix/avatar-menu-switch-pending-watchdog`, closing
> `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG`). This section used to enumerate four
> states and six pairs, all on one axis. It is replaced rather than extended,
> for two reasons that arrived in the same arc.
>
> A hung `clearIdentity` left the row dimmed and inert until a reload, because
> `switchPending` had no watchdog and `onSwitchSubmit`'s re-entry guard refused
> every tap that would have recovered it. Probed rather than inferred: held
> unresolved past 60s, the row stayed `aria-disabled="true"` and
> `aria-busy="true"`, the announcer kept reading `Switching person`, and a
> second tap never reached the action.
>
> And the old model collapsed CLOSED into one state, which it is not: the
> announcer sits outside the popover and is always mounted, so
> closed-while-pending and closed-while-timed-out differ observably, with a
> reachable transition between them that nobody has to open the menu to see.

Two independent axes, not one. The MENU is `closed` or `open`. The SWITCH is
`idle`, `pending`, `timedout` or `error`. Seven observable configurations:
`closed × {idle, pending, timedout}` and `open × {idle, pending, timedout,
error}`. Success still unmounts and is still not a state.

`timedout` is the new one: a clear is still in flight, the row is enabled again,
the status region is announcing, and a visible note carrying the same sentence
renders as a sibling of `role="menu"` (`aria-hidden`, so exactly one node speaks
to assistive tech). The visible half is the invariant-8 critique's P1: without it
a sighted crew member watches the row silently un-dim after eight seconds with
nothing explaining why it is tappable again. The mechanism is a three-valued
`switchPhase` the component owns; React's `useTransition` pending flag is not
read by anything rendered, and `PENDING_TIMEOUT_MS` (8,000 ms) is the same
constant the same-route `_ClaimedRowButton` uses, now shared at
`components/shared/pendingTimeout.ts`.

**Switch-axis transitions**, identical whether the menu is open or closed:

| Pair | Direction and treatment |
| --- | --- |
| idle ↔ pending | **idle→pending:** submit; instant, the row becomes `aria-disabled` and stays focusable, the announcer says `Switching person`. **pending→idle:** the clear settles ok without unmount; instant, the announcer empties |
| pending ↔ timedout | **pending→timedout:** the watchdog fires; instant, `aria-disabled` false, `aria-busy` removed, the announcer swaps to `Still switching. Try again.` No animation: the row is returning to its resting appearance. **timedout→pending:** a retry; instant, busy again, and a fresh window arms |
| idle ↔ timedout | **timedout→idle:** the hung clear finally settles ok; instant, the announcer empties, the row was already enabled. **idle→timedout: IMPOSSIBLE** — reaching timed-out needs a clear in flight |
| idle ↔ error | **idle→error: IMPOSSIBLE directly** — error is only reachable through a submit. **error→idle:** two live paths. A retry that SUCCEEDS without unmount, and a CLOSE-then-REOPEN, because `openAt` resets `switchStatus` without submitting anything (pinned by `tests/components/auth/avatarMenu.test.tsx:592`). A retry itself moves error→pending with no observable idle render between |
| pending ↔ error | **pending→error:** the clear settles `{ ok: false }`; instant, and the row is enabled by the time the alert is readable. **error→pending:** retry; instant, the error clears at the start |
| timedout ↔ error | **timedout→error:** the hung clear settles `{ ok: false }` with no retry in flight; instant, the alert appears and the announcer empties. **error→timedout: IMPOSSIBLE directly** — a retry out of error goes to pending first |

**Menu-axis transitions**, which carry the switch state untouched:

| Pair | Direction and treatment |
| --- | --- |
| closed ↔ open | **closed→open:** `avatar-menu-in` enter per DESIGN §5, `motion-reduce` instant; `openAt` resets `switchStatus` to idle and touches no other switch state. **open→closed:** the popover unmounts; the phase, its timer and the announcer all survive |

The axes are independent and the independence is tested rather than asserted:
the window expires while the menu is CLOSED and the announcer reports it without
anyone reopening. The single coupling is `openAt`'s reset of `switchStatus`,
which is why closed-while-error is not observable: the alert lives inside the
popover, and the reopen that would reveal it clears it first.

Compounds, which is where this class of bug lives: the settle landing after the
watchdog re-enabled the row; a retry starting while the first clear is in
flight; the first attempt failing after the retry started; the window expiring
while the menu is closed; a theme flip while timed out; both settlement orders
when a retry and a hung first attempt are in flight together; the settle and the
watchdog coming due in one flush; and a rejection, which reports inline unless
it is Next control flow, in which case it reaches the error boundary untouched.

**Residual, ratified rather than eliminated.** Past the timeout a second tap
issues a second `clearIdentity`, which lands on an already-cleared entry and an
already-ended session. That is `_ClaimedRowButton`'s R10 in this menu's terms
and the accepted price of not stranding the row.

### 4.7 Google-authenticated switch is a documented limit (R1-F1)

For a viewer resolved via a Google `success` session, `clearIdentity` deletes the cookie entry but not the session, so the next resolve returns `needs_picker_bootstrap` and re-mints the same identity (`lib/auth/picker/resolveShowPageAccess.ts:246`) — the menu-switch does not reach the picker for them. This spec does not fix it (that needs a product decision about whether menu-switch should sign a Google viewer out, and an identity-source discriminator `AvatarMenu` does not receive today). It is fenced in §7 and re-filed as `BL-SWITCH-PERSON-GOOGLE-LOOPBACK`. The `{ ok: false }` signaling fix in §4.2–4.3 is orthogonal and applies to every viewer.

### 4.8 Dimensional invariants

N/A — the error node is a normal-flow block inside the popover (`w-max min-w-56 max-w-[calc(100vw-2rem)]`, `components/auth/AvatarMenu.tsx:381`), which sizes to content; no fixed-height/width parent gains a flex/grid child through this change. The popover already scrolls its own width via `max-w`. No new parent→child dimension coupling is introduced.

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

**C — silent-failure fix:** a component test on the real `AvatarMenu` (folding the §2.3 probe's assertions onto the shipped component) — pass a `clearAction` mock resolving `{ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" }`; open the menu, submit "Not you?", and assert the `role="alert"` node (a SIBLING of `role="menu"` — assert `screen.getByRole("menu").contains(alert) === false`, mirroring `avatarMenu.test.tsx:97`) renders `PICKER_SWITCH_FAILED`'s crew copy, the popover stays open, and the submit re-enables. Pass a mock resolving `{ ok: true }`, assert no alert node. **R1-F4 / R2-F2 / R3-F1 lifecycle cases:** (i) after a failure, close and reopen — assert no stale alert (reset-on-open); (ii) submit, close the menu WHILE the clear is still pending, then resolve failure — assert no throw and no alert; reopen — assert no alert; (iii) **reopen WHILE STILL PENDING (Closed→Open-pending):** submit, close, reopen BEFORE resolving — assert the submit is `aria-disabled="true"` (pending persists; still focusable, NOT native `disabled`, per R4-F1) and no alert; then resolve failure — assert the alert appears in the open menu and the submit re-enables. These three exercise the close/reopen-while-pending paths the §2.3 probe verified on the Harness (cases 2–4). **R4-F1 keyboard-nav-during-pending case:** with a switch clear pending (submit, do not resolve), assert the submit item carries `aria-disabled="true"` and NOT the native `disabled` attribute, and that arrow navigation still reaches it — from the theme item, `ArrowDown` moves focus to the switch item (`document.activeElement` is the switch button), and `End` / reopen-with-`ArrowUp` also land on it — proving focus stays inside the menu (the four commands R4-F1 named). Then a second Enter on the focused pending item is a no-op (`clearAction` call count unchanged). Anti-tautology: derive the expected string from `messageFor("PICKER_SWITCH_FAILED").crewFacing`, not a hardcoded literal; scope the alert query to `role="alert"` so the identity header's text cannot satisfy it; assert the keyboard case against `document.activeElement`, not a class. Four string-presence mutants recorded in the commit (empty copy; appended suffix; copy present but in a `title` attribute / inside `role="menu"`; `ok` true↔false varied).

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
| tests/components/auth/_probeSwitchCloseRace.test.tsx (new, probe) | empirical spike for the close/pending/reopen lifecycle, 4/4 pass (§2.3) |
| tests/auth/sameOriginServerAction.test.ts (new) | gate truth table + bypass regression + emit-spy (§6 A/B) |
| `tests/auth/picker/clearIdentity.test.ts` | same-origin default in `headers()` mock; gate-reject cases incl. `signOut`-untouched for `clearIdentityAndSkip` (§6 A/E) |
| `tests/components/auth/avatarMenu.test.tsx` | in-menu error state incl. reopen-reset; void-mock → `{ ok: true }` (§6 C/E) |
| `tests/components/IdentityChip.test.tsx` | void-mock → `{ ok: true }` (§6 E) |
| `tests/components/identityChipSrSeparator.test.tsx` | void-mock → `{ ok: true }` (§6 E) |
| `BACKLOG.md` / `BACKLOG-archive.md` | archive `BL-SERVER-ACTION-ORIGIN-GATE` + `BL-IDENTITY-CLEAR-FAILURE-IS-SILENT`; file `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` (§3.5) and `BL-SWITCH-PERSON-GOOGLE-LOOPBACK` (§4.7) |

`impeccable-gate:` — UI surfaces present (`IdentityChip.tsx`, `AvatarMenu.tsx`); dual gate runs at implementation close-out.
