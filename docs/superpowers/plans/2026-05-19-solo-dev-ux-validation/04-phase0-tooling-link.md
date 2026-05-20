# Phase 0.D — `validation:mint-link` + `validation:revoke-link`

> Per spec §5.3 + §9.1.2. Estimate: 0.5–1 day.
>
> Goal: ship the JWT-signing + revocation CLIs. Critical contracts: three-env-var mapping (R22), two-token architecture (R20), structured JSON stdout (R18/R19/R20), revoke via `revoked_links` INSERT from JWT payload (R20/R22), localhost guard (R9).

---

### Task 0.D.1: Implement the env-mapping wrapper

**Files:**
- Create: `scripts/lib/validation-signing-env.ts`
- Create: `tests/scripts/validation-signing-env.test.ts`

Per spec §5.3 R22: mint-link MUST map ALL THREE env vars (`JWT_SIGNING_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) from VALIDATION_-prefixed variants for the process that calls `signLinkJwt()`. Mismatched local-and-validation values abort.

- [ ] **Step 1: Write failing test** for `applyValidationSigningEnv()`:
  - aborts if `process.env.JWT_SIGNING_SECRET` is set AND differs from `VALIDATION_JWT_SIGNING_SECRET`
  - aborts if `process.env.SUPABASE_URL` differs from `VALIDATION_SUPABASE_URL`
  - aborts if `process.env.SUPABASE_SECRET_KEY` differs from `VALIDATION_SUPABASE_SECRET_KEY`
  - aborts if any VALIDATION_* var is missing
  - on success: sets the three process.env vars from their VALIDATION_ counterparts

- [ ] **Step 2: Run — expect FAIL** (no implementation).

- [ ] **Step 3: Implement** `scripts/lib/validation-signing-env.ts`:

```ts
// scripts/lib/validation-signing-env.ts — per M12 spec §5.3 + R22 amendment.
export function applyValidationSigningEnv(): void {
  const validationKeys = {
    JWT_SIGNING_SECRET: process.env.VALIDATION_JWT_SIGNING_SECRET,
    SUPABASE_URL: process.env.VALIDATION_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.VALIDATION_SUPABASE_SECRET_KEY,
  } as const;
  for (const [name, value] of Object.entries(validationKeys)) {
    if (!value) {
      throw new Error(`Missing required env var: VALIDATION_${name}`);
    }
    const existing = process.env[name];
    if (existing && existing !== value) {
      throw new Error(
        `process.env.${name} is already set and differs from VALIDATION_${name}; refusing to overwrite — set ${name} to match or unset locally`,
      );
    }
    process.env[name] = value;
  }
}
```

- [ ] **Step 4: Run — expect PASS.** Commit.

---

### Task 0.D.2: Implement `validation-mint-link`

**Files:**
- Create: `scripts/validation-mint-link.ts`
- Create: `tests/scripts/validation-mint-link.test.ts`

Per spec §9.1.2 R20 amendment: mint-link calls `signLinkJwt()` from `lib/auth/jwt.ts` DIRECTLY. No link_sessions INSERT (that happens at redemption with a fresh randomUUID() opaque token). Emits structured JSON: `{url, expires_at, show_id, crew_name, jwt_token_version, signing_kid}`.

- [ ] **Step 1: Write failing test** that runs mint-link and asserts:
  - stdout is parseable JSON with the 6 required fields
  - `url` matches `/show/<slug>/p#t=<jwt>` shape
  - `expires_at` is ISO format
  - `signing_kid` is non-empty

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
#!/usr/bin/env tsx
// scripts/validation-mint-link.ts — per M12 spec §5.3 + §9.1.2.
import { parseArgs } from "node:util";
import { applyValidationSigningEnv } from "./lib/validation-signing-env";
import { assertProdEquivalentTarget } from "./lib/validation-target";

const args = parseArgs({
  options: {
    combo: { type: "string" },
    alias: { type: "string" },
    "expires-in": { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (args.values.help) {
  console.log(`Usage: pnpm validation:mint-link --combo <combo> --alias <alias> --expires-in <seconds-relative-to-now>

Mints a signed-link JWT for the given combo/alias. Emits JSON: {url, expires_at, show_id, crew_name, jwt_token_version, signing_kid}.
--expires-in negative = pre-expired (J3 expired-link path).
--expires-in positive = future expiry.

Required env vars: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY, VALIDATION_SUPABASE_PROJECT_REF, VALIDATION_JWT_SIGNING_SECRET.
`);
  process.exit(0);
}

assertProdEquivalentTarget(process.env.VALIDATION_SUPABASE_URL, false);
applyValidationSigningEnv();

// Now process.env.{JWT_SIGNING_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY} are set
// from VALIDATION_ variants. Import signLinkJwt AFTER applyValidationSigningEnv() so its
// internal env-reads see the mapped values.
const { signLinkJwt } = await import("@/lib/auth/jwt");
const { createClient } = await import("@supabase/supabase-js");

// 1. Resolve combo + alias to crew_id, crew_name, show_id via validation_state.alias_map + crew_members + crew_member_auth
// 2. Read active_signing_key_id from app_settings (signLinkJwt does this internally via createSupabaseServiceRoleClient)
// 3. Call signLinkJwt({showId, crewMemberKey: {name: crew_name}, tokenVersion})
// 4. Compute the URL: /show/<slug>/p#t=<jwt> (slug from shows.slug)
// 5. Print JSON to stdout
```

- [ ] **Step 4: Implement steps 1-5 above.** Use the `assertProdEquivalentTarget` guard.

- [ ] **Step 5: Wire `expires-in` as the expiry override** — negative values mint JWTs whose `exp` claim is in the past. `signLinkJwt`'s default TTL is 90 days; override per the spec contract.

- [ ] **Step 6: Run — expect PASS.** Commit:

```bash
git add scripts/validation-mint-link.ts scripts/lib/validation-signing-env.ts tests/scripts/validation-mint-link.test.ts tests/scripts/validation-signing-env.test.ts
git commit -m "feat(validation): implement mint-link with three-env-var mapping + signLinkJwt direct call"
```

---

### Task 0.D.3: Implement `validation-revoke-link`

**Files:**
- Create: `scripts/validation-revoke-link.ts`
- Create: `tests/scripts/validation-revoke-link.test.ts`

Per spec §9.1.2 R20/R22 amendments: revoke-link accepts `<url|jwt>` positional. Verifies + decodes the JWT (using `VALIDATION_JWT_SIGNING_SECRET` + active kid). Extracts `{show_id, crew_name, jwt_token_version}` from payload. INSERTs into `revoked_links (show_id, crew_name, token_version, revoked_at, revoked_reason)` with `revoked_reason = 'validation:j3-revoked-link-leg'`. Does NOT touch `link_sessions`.

- [ ] **Step 1: Write failing test:**
  - revoke-link with a valid URL succeeds and writes a revoked_links row
  - revoke-link with a bare JWT (no URL wrapper) also succeeds (script extracts the fragment)
  - revoke-link is idempotent: re-revoking the same (show_id, crew_name, token_version) is a no-op
  - revoke-link with a malformed URL exits 1

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement:**

```ts
#!/usr/bin/env tsx
// scripts/validation-revoke-link.ts — per M12 spec §5.3 + §9.1.2 R20/R22.
import { parseArgs } from "node:util";
import { applyValidationSigningEnv } from "./lib/validation-signing-env";
import { assertProdEquivalentTarget } from "./lib/validation-target";

const args = parseArgs({
  allowPositionals: true,
  options: { help: { type: "boolean", default: false } },
});

if (args.values.help) {
  console.log(`Usage: pnpm validation:revoke-link <url|jwt>

Verifies the JWT, extracts (show_id, crew_name, jwt_token_version) from payload,
INSERTs into revoked_links with revoked_reason='validation:j3-revoked-link-leg'.
Idempotent via ON CONFLICT DO NOTHING.

Required env vars: VALIDATION_SUPABASE_URL, VALIDATION_SUPABASE_SECRET_KEY,
VALIDATION_SUPABASE_PROJECT_REF, VALIDATION_JWT_SIGNING_SECRET.
`);
  process.exit(0);
}

assertProdEquivalentTarget(process.env.VALIDATION_SUPABASE_URL, false);
applyValidationSigningEnv();

const positional = args.positionals[0];
if (!positional) {
  throw new Error("missing positional argument: <url|jwt>");
}

// Extract JWT from input:
// - if input matches /^https?:.*#t=(.*)$/ → extract group 1
// - else if input matches /^[A-Za-z0-9\-_.]+$/ → assume it's a bare JWT
// - else error
function extractJwt(input: string): string {
  const m = input.match(/#t=([A-Za-z0-9\-_.]+)$/);
  if (m) return m[1];
  if (/^[A-Za-z0-9\-_.]+$/.test(input) && input.split(".").length === 3) return input;
  throw new Error(`Cannot extract JWT from input: ${input.slice(0, 80)}...`);
}

const jwt = extractJwt(positional);

const { verifyLinkJwt } = await import("@/lib/auth/jwt");
const { createClient } = await import("@supabase/supabase-js");

const verified = await verifyLinkJwt(jwt);  // throws if signature/expiry bad
const { showId, crewMemberKey, tokenVersion } = verified.payload;

const supabase = createClient(process.env.VALIDATION_SUPABASE_URL!, process.env.VALIDATION_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const { error } = await supabase
  .from("revoked_links")
  .upsert(
    {
      show_id: showId,
      crew_name: crewMemberKey.name,
      token_version: tokenVersion,
      revoked_at: new Date().toISOString(),
      revoked_reason: "validation:j3-revoked-link-leg",
    },
    { onConflict: "show_id,crew_name,token_version" },
  );

if (error) {
  console.error(`[validation-revoke-link] failed: ${error.message}`);
  process.exit(1);
}

console.log(`revoked ${showId} ${crewMemberKey.name} token_version=${tokenVersion}`);
```

- [ ] **Step 4: Run — expect PASS.** Commit.

---

### Task 0.D.4: End-to-end Phase 0.D verification — round-trip mint + redeem

- [ ] **Step 1: Mint a 15-minute valid link:**

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead --expires-in 900 | jq -r .url)
echo $URL
```

Expected: full URL in `/show/<slug>/p#t=<jwt>` form.

- [ ] **Step 2: Open the URL on the dev's iPhone Safari** (or curl-fetch the redemption endpoint with the JWT). Expect crew page renders.

- [ ] **Step 3: Mint a fresh URL for `alias_5a_lead_for_revoke`** (not the baseline), then revoke:

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead_for_revoke --expires-in 900 | jq -r .url)
pnpm validation:revoke-link "$URL"
```

Expected: revoke prints `revoked <show_id> <crew_name> token_version=1`.

- [ ] **Step 4: Open the revoked URL on iPhone.** Expect 401 "not on crew list" surface.

- [ ] **Step 5: Mint a pre-expired link:**

```bash
URL=$(pnpm -s validation:mint-link --combo R1 --alias alias_5a_lead --expires-in -3600 | jq -r .url)
```

Open on iPhone. Expect `LINK_EXPIRED` 401 surface.

- [ ] **Step 6: Move to Phase 0.E** (`05-phase0-tooling-report.md`).

---

## Phase 0.D failure modes

- **mint-link succeeds but redemption fails with `LINK_VERSION_MISMATCH`.** crew_member_auth's `current_token_version` differs from the JWT's `tokenVersion` claim. Investigate: re-seed may not have set `current_token_version = 1` (or whatever mint-link assumed).
- **mint-link succeeds but redemption fails with `INVALID_SIGNATURE`.** Three-env-var mapping is off. Verify `VALIDATION_JWT_SIGNING_SECRET` equals Vercel's `JWT_SIGNING_SECRET` for the Production scope.
- **revoke-link succeeds but the link still works.** The redemption path checks `revoked_links` on every request; if the link STILL works after revoke, either (a) the `(show_id, crew_name, token_version)` tuple doesn't match, or (b) the redemption code path isn't checking revoked_links correctly — file as a P0 against the live code (not M12's problem).
