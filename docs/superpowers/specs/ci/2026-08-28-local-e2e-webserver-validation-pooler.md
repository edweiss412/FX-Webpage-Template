# Local e2e app servers resolve their database from the validation pooler

<!-- spec-lint: not-ui — the only app/ paths cited are read-only context (app/admin/_showReviewModal.tsx names the loopback mechanism this defect contrasts with); the diff is playwright.config.ts, scripts/preflight-env.mjs, tests and docs. Invariant 8 N/A per §9. -->

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
a shared remote deployment whose notify cron sends real email. (The port 3004 comment at
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
   alert emails between 01:10 and 03:10 CDT**. That is what bought the port 3004 entry its pin. The
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
explicit value in the child env survives that load.

**Which `@next/env` this is measured against is load-bearing, and the obvious `require` is the wrong
one.** Under pnpm the root `@next/env` is 16.2.4 while `next` 16.3.0 resolves its own 16.3.0 copy;
they are different files with different loader bytes, and only the second ever runs inside the
server. Every probe below, and every arm of T2, resolves the loader the way Next does:

```js
const nextDir = path.dirname(require.resolve("next/package.json"));
const { loadEnvConfig } = require(require.resolve("@next/env", { paths: [nextDir] }));
```

The binding gap, measured on this branch:

```
next version              : 16.3.0
root @next/env version    : 16.2.4
next-resolved @next/env   : 16.3.0
same package              : false
root loader hash          : 44e84a28e712
next-resolved loader hash : c3100f65b607
```

The precedence itself is unchanged on 16.3.0 — the finding moved what the guard measures, not what
the repair does. Probed against the next-resolved package, both modes, both arms:

```
development  unset  : postgresql://u:p@remote.sentinel.invalid:5432/postgres | files=.env.local | pkg=16.3.0
development  preset : postgresql://postgres:postgres@127.0.0.1:54322/postgres | files=.env.local | pkg=16.3.0
production   unset  : postgresql://u:p@remote.sentinel.invalid:5432/postgres | files=.env.local | pkg=16.3.0
production   preset : postgresql://postgres:postgres@127.0.0.1:54322/postgres | files=.env.local | pkg=16.3.0
```

The `unset` rows are the negative controls: with nothing pre-set the fixture's remote value lands, so
the `preset` rows are asserting something that could have failed rather than reading back a value
that was already in place. The fixture is a tmpdir carrying its own `.env.local`, so none of this
depends on the developer's real one.

So the working form is **pin the key to a loopback value**, never drop it. The port 3004 entry already
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

- **The remedy cannot work.** `TEST_DATABASE_URL` is the LEFT operand of the `??` at every site
  §1 enumerates, and always wins. Exporting `DATABASE_URL` changes nothing a route handler reads.
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
| port 3001 dev-build | 282 | `pnpm build && next start` | **unpinned** |
| port 3002 prod-build | 307 | `pnpm build && next start` | **unpinned** |
| port 3003 prod-runtime-flip | 330 | `pnpm build && next start` | **unpinned** |
| port 3004 screenshots/help | 354 | `pnpm build && next start` | pinned, `env:` at 358 |

The four unpinned entries are one shape with one prior-art repair, in one file, at near-zero marginal
cost, so all four are repaired in this PR per the class-sweep default. Deferring any of them would
need class-sweep exception (a), (b), or (c) and none applies.

ports 3001-3003 are *production* builds and so are not saved by the production throw: the throw fires
only when both variables are absent, and `.env.local` supplies one. Their exposure is the same as
port 3000's, and the row's framing of this as a `pnpm dev` problem understates it.

The pin is the port 3004 form verbatim, both keys, resolving from `DATABASE_URL`:

```ts
DATABASE_URL:
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
TEST_DATABASE_URL:
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
```

Entries ports 3000-3003 carry their env as inline `VAR=value` prefixes on the command string and have
no `env:` key; each gains one. The existing inline prefixes stay as they are — moving them is a
larger diff with no bearing on this defect.

### 5.1 CI posture is untouched, verified live

**Three** workflows that boot a Playwright webServer supply **`DATABASE_URL`** and deliberately not
`TEST_DATABASE_URL` (`app-e2e.yml:187`, `published-modal-e2e.yml:177`,
`lifecycle-layout-e2e.yml:222` and `lifecycle-layout-e2e.yml:257`), each with a comment saying so in
as many words: "DATABASE_URL, not TEST_DATABASE_URL: the latter is this repo's name for..." Under the
pin those three resolve `process.env.DATABASE_URL` — the same loopback DSN the resolver reaches today
by falling through — so their behavior is identical.

**They are not the whole set, and an earlier draft of this section said they were.** That claim was
reached by grepping for workflows that MENTION the variable and generalising from the ones that
turned up, which cannot see the workflows that mention neither. Four workflows boot a newly-pinned
server while setting no DB key, and for them the pin is a real change rather than a no-op. The full
derivation — by `webServer` filter env var, by which config each job passes to Playwright, and by
whether that config declares a `webServer` at all — plus the reachability argument for those four,
lives in the plan's Task 1 under "What this does to CI, derived rather than assumed". It is kept in
one place rather than restated here, because two copies of a four-group derivation drift.

The only workflow that sets `TEST_DATABASE_URL` to the validation secret is `x-audits.yml` (lines
325, 363, 411, 484), and it runs **no** Playwright at all (`rg -c playwright .github/workflows/x-audits.yml`
→ no matches). No job both sets the validation DSN and boots a server this change touches, so nothing
can be overridden out from under a job that wanted it.

`.env.local` sets no `DATABASE_URL`, so locally the `??` falls to the loopback literal. A developer
who exports `DATABASE_URL` for a custom local port still wins, exactly as at port 3004.

## 6. Resolved scope — do not relitigate

Each item below is ratified. Verify the citation if you doubt it; do not re-argue it.

**Candidate 3, reworking the `??` idiom itself, is out of scope.**
Reordering the operands or introducing a shared resolver across those sites (§1) is **out of scope**,
declined by bl-orch's ruling in this arc's brief and by the row's own "wants its own arc". Repair B
fixes every one of those sites for the local-e2e case at the config boundary, without touching them.
The residue candidate 3 would address — that a *non-Playwright* local process (a hand-started
`pnpm dev`, a script) still resolves to validation — is a **documented limit** of this arc, recorded
in §8, not a finding against it.

**Pinning rather than scrubbing** is settled by the probe in §3 and its negative control. Deleting
the variable from the parent environment is a no-op: Next re-reads `.env.local` inside the server.

**The inline `VAR=value` command prefixes stay on their command strings.** Migrating them into
`env:` blocks is a larger diff with no bearing on this defect.

**`playwright.screenshots.config.ts` needs no pin ADDED, but it IS inside the guard's walk.**
Its single webServer is already pinned (lines 177-180), so this PR changes nothing in that file —
that much is settled. What is separate, and easy to conflate, is the
guard's scope: T1 walks that file too, so a future unpinned entry there fails rather than passing on
the strength of the existing entry. Do not read "no change needed" as "out of scope for T1".

**Invariant 8 (impeccable dual gate) is N/A**, per §9.

## 7. Tests

Three, all real reds on the pre-change tree.

**T1 — every local webServer entry pins both DB keys, in every Playwright config.** Derived cover
on two axes, neither of them an enumeration: the test DISCOVERS config files from disk
(`playwright*.config.ts` at the repo root) and, within each, walks `config.webServer`. So both a new
entry AND a new config file are covered by default rather than silently exempt. For each entry,
assert `env.TEST_DATABASE_URL` and `env.DATABASE_URL` are present and loopback-hosted.

**Both files, and scoping to one is not an option.** A walk of `playwright.config.ts` alone leaves
`playwright.screenshots.config.ts` guarded by nothing but the file-wide substring oracle in
`tests/help/playwright-config.test.ts`, which its one correctly-pinned entry satisfies for the whole
file. Probed: adding a plain unpinned entry to that config leaves every other guard green. That is
the same satisfied-by-one-occurrence defect this spec identifies in that test, so applying the
critique to one file and not the other would reproduce it.

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

**T1 needs two executable premises, and both were found by probing rather than reasoning.**

*Premise 1 — the config's own filter.* `config.webServer` is `[...].filter(...)`
(`playwright.config.ts:425-467`), and five environment variables shrink it:
`HELP_DOCS_WALKER_ONLY`, `CREW_E2E_ONLY`, `BASELINE_SERVER_ONLY`, `DEV_GATE_ONLY`,
`STEP3_LIVE_BUNDLE_ONLY`. With any set the walked array is a subset, and `STEP3_LIVE_BUNDLE_ONLY`
empties it outright — a per-entry assertion over an empty array passes while proving nothing. T1
asserts all five are unset before walking.

*Premise 2 — every discovered file actually yielded entries.* Discovery introduces a failure mode a
single static import does not have: a config that is found but read as empty. Probed on this branch,
and it is real rather than theoretical. Under a static `import`, the config's `webServer` is at
`mod.default.webServer`; under the dynamic `import()` that disk discovery requires, tsx's interop
double-wraps it and the same expression is `undefined`:

```
module keys        : [ 'default' ]
default keys       : [ 'default' ]
default.webServer  : undefined
dd.webServer       : 5
```

A test that unwrapped only one level would discover two config files, walk zero entries, and pass
green having measured nothing. So T1 unwraps defensively (descend through `default` until `webServer`
is present) and then asserts **each discovered file contributed at least one entry**, plus more than
one entry in total. A file read as empty fails loud.

A count assertion (`length === 6`) is deliberately NOT used: it would need editing whenever an entry
is added, which is the enumeration shape this project's class-sweep rule rejects.

*Failure mode caught:* a new webServer entry, or a future edit dropping a pin, silently handing the
app server a remote database. This is the exact defect that sent nine emails on 2026-08-26.

**T2 — the override survives Next's own env load, in BOTH modes the servers run in.** Hermetic: a
tmpdir fixture with its own `.env.local` holding a sentinel *remote* DSN. Four arms — two load modes,
each with a negative control and a positive assertion.

**Why two modes rather than one.** `@next/env` chooses its file list from `NODE_ENV`, and the entries
this spec pins run in both: `pnpm dev` on port 3000 is development; `pnpm build && pnpm start` on the
CI port 3000 and on 3001-3004, plus the screenshots config's server, are production. A
development-only T2 stays green through a production-only precedence regression, which is failure
mode (b) — a guard passing while an app server takes a remote DSN.

**`NODE_ENV` is set explicitly per arm and never inherited, and this is the trap.** Vitest runs with
`NODE_ENV=test`, and in test mode `@next/env` does not read `.env.local` **at all**. A child
inheriting it loads nothing, so the negative control has no remote value to beat and the arm measures
nothing. Probed on this branch, all three modes, both arms each:

```
development  unset   : postgresql://u:p@remote.sentinel.invalid:5432/postgres | files=.env.local
development  preset  : postgresql://postgres:postgres@127.0.0.1:54322/postgres | files=.env.local
production   unset   : postgresql://u:p@remote.sentinel.invalid:5432/postgres | files=.env.local
production   preset  : postgresql://postgres:postgres@127.0.0.1:54322/postgres | files=.env.local
test         unset   : (unset)                                                | files=(none)
test         preset  : postgresql://postgres:postgres@127.0.0.1:54322/postgres | files=(none)
```

The `test` row is why the premise below is not optional: without it, that row is
indistinguishable from a pass.

**Every arm loads the package Next executes, not the root one.** T2 resolves `@next/env` through
`next`'s own directory (§3). Binding it to the hoisted root copy is the trap: the root is 16.2.4,
`next` 16.3.0 ships its own, and a Next upgrade could change the server's precedence while a
root-bound T2 stayed green against a package no server runs.

**Two executable premises.**

*Premise 1 — the right package.* T2 asserts the loader path it required is the one `next` itself
resolves, and is NOT the root resolution. Without this the binding silently reverts the first time
someone simplifies the `require` back to `require("@next/env")`, which is the form anyone would
reach for.

*Premise 2 — the fixture was actually read.* Each child reports `loadEnvConfig`'s own
`loadedEnvFiles`, and T2 asserts `.env.local` is among them before trusting any arm. If a future
change lets the child inherit `NODE_ENV=test` — or the fixture stops being read for any other
reason — `loadedEnvFiles` is empty and the premise fails loud instead of the arms passing vacuously.

The mode set is closed, not open: it is the two modes the two Playwright configs actually boot, read
off their own commands. `test` is asserted against rather than covered, because no webServer runs in
it.

No dependency on the developer's real `.env.local`, so all four arms pass on a bare runner.

**Each arm runs in its own child process, and that is load-bearing rather than stylistic.**
`@next/env` snapshots the environment on its first call and a reload restores that snapshot, so two
arms sharing one process do not measure two independent loads — the second is contaminated by the
first. Probed on this branch, both shapes:

```
# WRONG — two loadEnvConfig calls in ONE process. Arm 2's pre-set loopback is CLOBBERED
# back to the fixture's remote value, and the test would read as "the override does not hold".
arm1 (unset)   : postgresql://u:p@remote.sentinel.invalid:5432/postgres
arm2 (preset)  : postgresql://u:p@remote.sentinel.invalid:5432/postgres

# RIGHT — one loadEnvConfig call per fresh child process, which is also what a booting
# Next server actually is.
arm1 fresh proc, nothing pre-set : postgresql://u:p@remote.sentinel.invalid:5432/postgres
arm2 fresh proc, loopback preset : postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

The child-process shape follows `tests/scripts/preflightClaims.test.ts`, which spawns for the same
reason. Had the in-process shape shipped, T2 would have failed on correct code and the natural repair
would have been to weaken or delete the assertion.

*Failure mode caught:* a Next upgrade flipping `.env.local` precedence to override the parent
environment — in EITHER load mode, in the package the server ACTUALLY runs — which would re-expose
validation through a config that still *looks* pinned. Nothing in the repo would otherwise notice; a
single-mode guard would notice half of it, and a root-bound guard none of it.

**T3 — the preflight remedy is executable advice.** Extend `tests/scripts/`'s existing spawn-based
preflight coverage: run the script with a non-loopback `TEST_DATABASE_URL` and assert the emitted
warning names `TEST_DATABASE_URL` as the variable to set, and does not assert that only the
`_validationEnvAllowlist.ts` rows honour it. Premise arm: assert the warning fired at all, so a
refactor that stops printing it cannot pass by absence.

*Failure mode caught:* the message drifting back to advice that cannot work — the state this row was
filed against.

**Anti-tautology.** T1 reads each config's own `webServer` array rather than grepping the file for a
substring, so a pin written in a comment or in an unrelated entry cannot satisfy it — which is
precisely the hole in today's `tests/help/playwright-config.test.ts:33-54`, whose
`expect(config).toMatch(...)` is satisfied by a single occurrence anywhere in the file and has been
passing green over four unpinned servers since it was written. T1 covers BOTH config files for that
same reason; scoping it to one would have reproduced the defect it exists to close. T2's negative-control arm precedes its positive
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
  so it needs no repair, but it is inside T1's walk so a later entry cannot escape.
- **T2 follows `next`'s resolution, so it tracks whatever loader `next` ships.** It asserts the two
  resolutions differ today, which is true under pnpm's layout; a future hoisting change that made
  the root and next-resolved paths identical would fail that premise loudly rather than silently
  measuring the wrong package. That is the intended direction: the premise is about binding, and a
  changed layout is a fact worth surfacing.
  *Re-file trigger:* the premise failing because the two resolutions converged.
- **T1 discovers configs by declaration, anywhere in the repo, so the subdirectory case is covered
  rather than deferred.** An earlier draft scoped discovery to `playwright*.config.ts` at the root
  and recorded the subdirectory case as a limit on the ground that no such file existed. That ground
  was false: `tests/e2e/visual.config.ts` and `tests/e2e/standalone.config.ts` are both Playwright
  configs outside the root. Neither declares a `webServer` today, so there was no live gap, but the
  limit's stated reason was wrong and the scope was one commit from being wrong too. Discovery now
  walks the repo for `*.config.ts` whose source declares a `webServer`, which finds exactly the two
  that do (out of eleven `*.config.ts` files) and would find a third the day one appears.
  What remains a limit is narrower: a config that builds its `webServer` key dynamically, so the
  source-level `webServer:` grep does not see it. Nothing in the repo does this.
  *Re-file trigger:* a config assembling its `webServer` key programmatically.

## 9. Invariants

Invariant 8 (impeccable dual gate): **N/A** — no file under `app/` outside `app/api/**`, none under
`components/`, no `@theme` block, no `DESIGN.md` or Tailwind config change. The diff is
`playwright.config.ts`, `scripts/preflight-env.mjs`, tests, and docs.

Invariants 1 (TDD), 6 (commit per task), 11 (worktree), 12 (ledger marker) apply and are honoured.
Invariants 2, 3, 4, 5, 9, 10 do not reach this diff: no mutation surface, no schema, no email
boundary, no user-visible copy, no Supabase call site, no new route or action.
