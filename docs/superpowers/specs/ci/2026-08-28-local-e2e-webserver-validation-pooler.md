# Local e2e app servers resolve their database from the validation pooler

**Row:** `BL-LOCAL-E2E-APP-SERVER-QUERIES-VALIDATION` (BACKLOG.md).
**Branch:** `fix/local-e2e-validation-pooler`. **Facing:** process (`**Mint-exception:** product-blocked`).
**Direction ruled by bl-orch 2026-08-28:** ship candidates 1 and 2 together; candidate 3 declined (§6).

## 1. What is wrong

Under a local Playwright run, the Next server Playwright boots inherits `.env.local`, whose
`TEST_DATABASE_URL` is the **validation** deployment's session pooler
(`postgresql://postgres.vzakgrxqwcalbmagufjh:***@aws-1-us-east-2.pooler.supabase.com:5432/postgres`,
the only DB key `.env.local` sets). Route handlers resolve
`process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL`, falling back to loopback only when both
are absent (`app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:34-40`). That idiom is repo-wide:
**40 sites in 40 files** under `app/` and `lib/` (`rg -c 'TEST_DATABASE_URL \?\? process.env.DATABASE_URL' app lib`,
summed = 40). So every raw-`postgres` route the app server serves locally opens a transaction against
a shared remote deployment whose notify cron sends real email. (The `:3004` comment at
`playwright.config.ts:407` says "~19 inline twins"; it counts the twins of `lib/sync/_databaseUrl.ts`
specifically, where 40 counts every occurrence of the idiom across `app/` and `lib/`. Neither number
is wrong and nothing here turns on which is used.)

Everything *else* in a local e2e run is loopback, by three separate mechanisms
(`tests/e2e/helpers/supabaseAdmin.ts:11`, `tests/e2e/helpers/seedShowWithCrew.ts:192-211`,
`app/admin/_showReviewModal.tsx:78-81`). The seeder's own comment names this hazard and defends
against it: "honoring an ambient validation `TEST_DATABASE_URL` would seed one database and read
another." The helpers are hardened. The app server is not, and that asymmetry is this row.

### 1.1 Three incidents, not one

1. **`fix/published-attention-resolve-red`, run 1, 2026-08-28.** The arc's first run of
   `tests/e2e/published-show-attention.spec.ts` returned
   `POST /api/admin/show/picker-e2e-.../alerts/.../resolve 404` (`ADMIN_ALERT_NOT_FOUND` against a
   database that never held the seeded show). The arc burned that run plus a discriminating second
   run separating the artifact from the defect it was dispatched to attribute.
2. **The 2026-08-26 mail incident**, recorded in `playwright.config.ts:405-410`: forwarding the
   ambient value pointed a screenshot app server at validation and the notify cron sent **nine real
   alert emails between 01:10 and 03:10 CDT**. That is what bought the `:3004` entry its pin. The
   other four entries never got one.
3. **The preflight advice dead end** (§4). A reader who follows the printed remedy gets the same 404
   and no signal that they did anything wrong.

## 2. The discriminating probe (from the row, reproduced verbatim)

Two runs of one spec on one tree, differing only in `TEST_DATABASE_URL`. Unset, so `.env.local` wins:

```
pnpm heavy pnpm exec playwright test tests/e2e/published-show-attention.spec.ts --project=desktop-chromium --reporter=list
[WebServer] POST /api/admin/show/picker-e2e-07be4dc6/alerts/9d33af9d-0f13-40b6-8d36-445f7fd5584d/resolve 404 in 966ms
```

Set to the loopback DSN:

```
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy pnpm exec playwright test tests/e2e/published-show-attention.spec.ts --project=desktop-chromium --reporter=list
[WebServer] POST /api/admin/show/picker-e2e-81fb20e3/alerts/cafac661-8bcb-48b6-a7f1-763a75fcedf0/resolve 200 in 557ms
[WebServer] POST /api/admin/show/picker-e2e-81fb20e3/alerts/764123a7-f57c-4fe1-9f62-fcec1bb77672/resolve 200 in 32ms
```

## 3. Override, not scrub — the fact the repair turns on

Removing `TEST_DATABASE_URL` from the parent environment accomplishes nothing: Next loads
`.env.local` *inside* the server it boots, so the validation value walks straight back in. An
explicit value in the child env survives that load. Probed on this branch at `@next/env` 16.2.4,
both arms, in the worktree:

```
$ node -e 'process.env.TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const b=process.env.TEST_DATABASE_URL; require("@next/env").loadEnvConfig(process.cwd(),true,{info(){},error(){}});
  console.log("before          :",b);
  console.log("after env load  :",process.env.TEST_DATABASE_URL);
  console.log("OVERRIDE_HELD   :",b===process.env.TEST_DATABASE_URL)'
before          : postgresql://postgres:postgres@127.0.0.1:54322/postgres
after env load  : postgresql://postgres:postgres@127.0.0.1:54322/postgres
OVERRIDE_HELD   : true
```

Negative control on the same tree, proving the probe discriminates rather than asserting a value that
was already there — with nothing pre-set, `.env.local` supplies the remote host:

```
$ node -e 'delete process.env.TEST_DATABASE_URL;
  require("@next/env").loadEnvConfig(process.cwd(),true,{info(){},error(){}});
  console.log("unset -> host:", new URL(process.env.TEST_DATABASE_URL).host)'
unset -> host: aws-1-us-east-2.pooler.supabase.com:5432
```

So the working form is **pin the key to a loopback value**, never drop it. The `:3004` entry already
says exactly this in prose (`playwright.config.ts:412-414`): "The key is PINNED rather than dropped:
`next dev` loads `.env.local` itself and an explicit value in this env wins, where an absent one
would let the remote value straight back in."

## 4. Repair A — the preflight warning

`scripts/preflight-env.mjs:181-190` prints, when `TEST_DATABASE_URL` is non-loopback:

```
      Since 2026-08-26 no test helper or suite honours it
except the two rows in tests/db/_validationEnvAllowlist.ts, so this line is
      informational. Export DATABASE_URL (loopback) to point local DB runs at a
specific local Postgres.
```

Two defects in one message, and they compound:

- **The remedy cannot work.** `TEST_DATABASE_URL` is the LEFT operand of the `??` at all 40 sites and
  always wins. Exporting `DATABASE_URL` changes nothing a route handler reads.
- **The reassurance is false.** "No test helper or suite honours it ... so this line is
  informational" is what makes a reader stop reading. The app server under local e2e honours it, via
  those 40 sites; §2 is the proof. The sentence was true of *helpers* and was written as if it were
  true of the *system*.

Both are repaired together: they are one message, one shape (the warning misdescribes who honours the
variable and what to do about it), and fixing the remedy while leaving the reassurance would leave the
reader with a correct instruction they have just been told they do not need.

Replacement names the working override, and names the app server as an honourer. Exact copy in the
plan; the assertions are that the printed text contains `TEST_DATABASE_URL=` as the remedy's variable
and no longer claims nothing but the allowlist honours it.

## 5. Repair B — pin the local webServer entries

`playwright.config.ts` declares **five** webServer entries. Exactly one is pinned:

| entry | line | posture | `TEST_DATABASE_URL` today |
| --- | --- | --- | --- |
| `:${E2E_PORT}` (3000) | 236 | `pnpm dev` (non-CI) / `build && start` (CI) | **unpinned** |
| `:3001` dev-build | 282 | `pnpm build && next start` | **unpinned** |
| `:3002` prod-build | 307 | `pnpm build && next start` | **unpinned** |
| `:3003` prod-runtime-flip | 330 | `pnpm build && next start` | **unpinned** |
| `:3004` screenshots/help | 354 | `pnpm build && next start` | pinned, `env:` at 358 |

The four unpinned entries are one shape with one prior-art repair, in one file, at near-zero marginal
cost, so all four are repaired in this PR per the class-sweep default. Deferring any of them would
need class-sweep exception (a), (b), or (c) and none applies.

`:3001`-`:3003` are *production* builds and so are not saved by the production throw: the throw fires
only when both variables are absent, and `.env.local` supplies one. Their exposure is the same as
`:3000`'s, and the row's framing of this as a `pnpm dev` problem understates it.

The pin is the `:3004` form verbatim, both keys, resolving from `DATABASE_URL`:

```ts
DATABASE_URL:
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
TEST_DATABASE_URL:
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
```

Entries `:3000`-`:3003` carry their env as inline `VAR=value` prefixes on the command string and have
no `env:` key; each gains one. The existing inline prefixes stay as they are — moving them is a
larger diff with no bearing on this defect.

### 5.1 CI posture is untouched, verified live

Every workflow that boots a Playwright webServer supplies **`DATABASE_URL`** and deliberately not
`TEST_DATABASE_URL` (`app-e2e.yml:187`, `published-modal-e2e.yml:177`,
`lifecycle-layout-e2e.yml:222` and `:257`), each with a comment saying so in as many words:
"DATABASE_URL, not TEST_DATABASE_URL: the latter is this repo's name for..." Under the pin those jobs
resolve `process.env.DATABASE_URL` — the same loopback DSN the resolver reaches today by falling
through to `DATABASE_URL`. Identical value, so identical behavior.

The only workflow that sets `TEST_DATABASE_URL` to the validation secret is `x-audits.yml` (lines
325, 363, 411, 484), and it runs **no** Playwright at all (`rg -c playwright .github/workflows/x-audits.yml`
→ no matches). No job both sets the validation DSN and boots a server this change touches, so nothing
can be overridden out from under a job that wanted it.

`.env.local` sets no `DATABASE_URL`, so locally the `??` falls to the loopback literal. A developer
who exports `DATABASE_URL` for a custom local port still wins, exactly as at `:3004`.

## 6. Declined: revisiting the `??` idiom (candidate 3)

Reordering the operands or introducing a shared resolver across the 40 sites is **out of scope**,
declined by bl-orch's ruling in this arc's brief and by the row's own "wants its own arc". Repair B
fixes every one of those sites for the local-e2e case at the config boundary, without touching them.
The residue candidate 3 would address — that a *non-Playwright* local process (a hand-started
`pnpm dev`, a script) still resolves to validation — is a **documented limit** of this arc, recorded
in §8, not a finding against it.

## 7. Tests

Three, all real reds on the pre-change tree.

**T1 — every local webServer entry pins both DB keys.** Derived cover, not enumeration: the test
imports `playwright.config.ts` and walks `config.webServer`, so an entry added later is covered by
default rather than silently exempt. For each entry, assert `env.TEST_DATABASE_URL` and
`env.DATABASE_URL` are present and loopback-hosted.

The oracle was probed on this branch before this spec was written, and the red is exactly as claimed:

```
$ pnpm exec tsx -e 'import cfg from "./playwright.config.ts"; ...'
isArray: true len: 5
  url: http://127.0.0.1:3000 | has env: false | TDU: (none)
  url: http://localhost:3001 | has env: false | TDU: (none)
  url: http://localhost:3002 | has env: false | TDU: (none)
  url: http://localhost:3003 | has env: false | TDU: (none)
  url: http://localhost:3004 | has env: true  | TDU: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**The premise T1 must state executably is the config's own filter, not a count.** `config.webServer`
is `[...].filter(...)` (`playwright.config.ts:425-467`), and five environment variables can shrink it:
`HELP_DOCS_WALKER_ONLY`, `CREW_E2E_ONLY`, `BASELINE_SERVER_ONLY`, `DEV_GATE_ONLY`,
`STEP3_LIVE_BUNDLE_ONLY`. With any of them set the walked array is a subset, and a per-entry assertion
over a one-element subset passes while saying nothing — `STEP3_LIVE_BUNDLE_ONLY` empties it entirely
and the test would then assert over nothing at all. So T1 asserts, before walking, that none of those
five is set in the test environment, and that the array holds more than one entry. Both arms fail loud
rather than passing vacuously. A count assertion (`length === 5`) is deliberately NOT used: it would
have to be edited every time an entry is added, which is the enumeration shape this project's
class-sweep rule rejects.

*Failure mode caught:* a new webServer entry, or a future edit dropping a pin, silently handing the
app server a remote database. This is the exact defect that sent nine emails on 2026-08-26.

**T2 — the override survives Next's own env load.** Hermetic: a tmpdir fixture with its own
`.env.local` holding a sentinel *remote* DSN, `loadEnvConfig` run against it twice. Arm 1 (negative
control, and it runs first): nothing pre-set, the fixture's remote value lands — proving the fixture
is live and the assertion can fail. Arm 2: a loopback value pre-set, and it survives. No dependency on
the developer's real `.env.local`, so it passes on a bare CI runner.

*Failure mode caught:* a Next upgrade flipping `.env.local` precedence to override the parent
environment, which would re-expose validation through a config that still *looks* pinned. Nothing in
the repo would otherwise notice.

**T3 — the preflight remedy is executable advice.** Extend `tests/scripts/`'s existing spawn-based
preflight coverage: run the script with a non-loopback `TEST_DATABASE_URL` and assert the emitted
warning names `TEST_DATABASE_URL` as the variable to set, and does not assert that only the
`_validationEnvAllowlist.ts` rows honour it. Premise arm: assert the warning fired at all, so a
refactor that stops printing it cannot pass by absence.

*Failure mode caught:* the message drifting back to advice that cannot work — the state this row was
filed against.

**Anti-tautology.** T1 reads the config's own `webServer` array rather than grepping the file for a
substring, so a pin written in a comment or in an unrelated entry cannot satisfy it — which is
precisely the hole in today's `tests/help/playwright-config.test.ts:33-54`, whose
`expect(config).toMatch(...)` is satisfied by the single `:3004` occurrence and has been passing
green over four unpinned servers since it was written. T2's negative-control arm precedes its positive
one for the same reason. T3 asserts on the child process's real stdout, not on the source text.

## 8. Documented limits

- **A local process outside Playwright is unchanged.** A hand-started `pnpm dev`, a one-off script, or
  any local `node` that imports one of the 40 sites still resolves `TEST_DATABASE_URL` to validation.
  Repair A is what addresses that reader; candidate 3 (§6) is the mechanical fix and is another arc's.
  *Re-file trigger:* an incident where a non-Playwright local process writes to validation.
- **The pin is per-entry, and T1 is what keeps it that way.** Nothing prevents a future entry from
  being written without an `env:` block; T1 fails it. That is the guard, and its own completeness is
  bounded by `config.webServer` being the array Playwright actually boots.
- **`playwright.screenshots.config.ts` is already correct** — one webServer, pinned at lines 177-180 —
  so it is out of the class rather than deferred from it.

## 9. Invariants

Invariant 8 (impeccable dual gate): **N/A** — no file under `app/` outside `app/api/**`, none under
`components/`, no `@theme` block, no `DESIGN.md` or Tailwind config change. The diff is
`playwright.config.ts`, `scripts/preflight-env.mjs`, tests, and docs.

Invariants 1 (TDD), 6 (commit per task), 11 (worktree), 12 (ledger marker) apply and are honoured.
Invariants 2, 3, 4, 5, 9, 10 do not reach this diff: no mutation surface, no schema, no email
boundary, no user-visible copy, no Supabase call site, no new route or action.
