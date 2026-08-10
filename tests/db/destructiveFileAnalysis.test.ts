/**
 * tests/db/destructiveFileAnalysis.test.ts
 *
 * Fixture-driven proof for `analyseDestructiveFile`. Asserting only that the real
 * destructive files PASS proves nothing about the holes it exists to close — every real
 * file is already correct, so an analyzer returning `ok` unconditionally satisfies all
 * of them. Each mutant below is a file an ordinary contributor could plausibly write.
 *
 * The first three are the plan's declared operators (binding, ordering, provenance).
 * The last four were demonstrated ESCAPING the shipped analyzer by the whole-diff
 * review; they are pinned here so the repair cannot silently regress.
 *
 * The exemption below is the line-comment form the guard's EXEMPTION regex requires.
 */
// not-subject-to-destructive-target-guard: this file contains destructive SQL only as
// FIXTURE TEXT handed to a pure function. It imports no `postgres`, opens no connection,
// and reads no database URL. Discovery matches it because the mutant sources quote
// `select public.prune_sync_log()` - the very string the guard exists to find. Blanking
// string bodies during discovery would un-discover the REAL destructive files too, since
// they execute that SQL as a string literal as well, so the exemption is the honest
// resolution rather than a widened recognizer.
import { describe, expect, it } from "vitest";
import { analyseDestructiveFile } from "./_destructiveFileAnalysis";

const P = "tests/db/fixture.test.ts";
const IMPORT = [
  `import postgres from "postgres";`,
  `import { assertLocalDbUrl } from "./_localDbUrl";`,
].join("\n");
const PRUNE = `await sql.unsafe("select public.prune_sync_log()");`;

describe("analyseDestructiveFile — accepted forms", () => {
  it("accepts the two-step form: guard, bind, connect", () => {
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("accepts the inline form: postgres(guard(...))", () => {
    const src = `${IMPORT}
const sql = postgres(assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL), { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });
});

describe("analyseDestructiveFile — mutants that MUST be rejected", () => {
  /**
   * Read as a set, these discriminate one property at a time. An analyzer implementing
   * only the import check accepts (a) and (b); only ordering accepts (a) and (c); only
   * binding equality accepts (b) and (c). No single check catches more than one.
   */
  it("(a) binding — the guard runs on a DIFFERENT string than the one connected", () => {
    const src = `${IMPORT}
const url = process.env.TEST_DATABASE_URL!;
assertLocalDbUrl("postgresql://localhost:54322/postgres");
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(b) ordering — the guard runs AFTER the connection opens", () => {
    // `let` is required to express this: with a `const` binding, using it before its
    // declaration is a temporal-dead-zone error, not a mutant.
    const src = `${IMPORT}
let url = process.env.TEST_DATABASE_URL!;
const sql = postgres(url, { max: 1 });
url = assertLocalDbUrl(url);
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(c) provenance — the name resolves to a local no-op, not the imported guard", () => {
    const src = `const assertLocalDbUrl = (u: string | undefined) => u!;
const sql = postgres(assertLocalDbUrl(process.env.TEST_DATABASE_URL), { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(d) the guard exists only inside a comment", () => {
    // whole-diff r1 finding 2: `commented_guard` returned ok:true against the shipped
    // analyzer. A guard that is commented out is not a guard.
    const src = `${IMPORT}
// assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(e) the guard exists only inside a BLOCK comment", () => {
    const src = `${IMPORT}
/* const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL); */
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(f) the guarded binding is REASSIGNED before the connection", () => {
    // whole-diff r1 finding 2: `reassigned_after_guard`. Binding equality and ordering
    // both still hold; the VALUE does not.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
url = process.env.TEST_DATABASE_URL!;
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(h) the guard is shadowed by a FUNCTION PARAMETER whose default is a no-op", () => {
    // whole-diff r2 finding 3: `parameter_shadow` returned ok:true against the
    // regex analyzer. A parameter is a declaration like any other; the AST sees it.
    const src = `${IMPORT}
async function run(assertLocalDbUrl = (u: string | undefined) => u!) {
  const url = assertLocalDbUrl(process.env.TEST_DATABASE_URL);
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(i) the guarded binding is rebound via ARRAY destructuring", () => {
    // whole-diff r2 finding 4: `array_rebind`. Not a simple `url = ...`, so a
    // regex for that form misses it entirely.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
[url] = [process.env.TEST_DATABASE_URL!];
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(j) the guarded binding is rebound via OBJECT destructuring", () => {
    // whole-diff r2 finding 4: `object_rebind`. Same class, third syntax - which is
    // why the check now asks the parser for assignments rather than matching text.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
({ url } = { url: process.env.TEST_DATABASE_URL! });
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(k) a safe same-named binding in ANOTHER FUNCTION does not bless this one", () => {
    // whole-diff r3 finding 1: `cross_function`. Matching declarations by name
    // anywhere in the file blessed an unsafe connection because a guarded `url`
    // existed elsewhere. Resolution is lexical now.
    const src = `${IMPORT}
function safe() {
  const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
  return url;
}
async function unsafe() {
  const url = process.env.TEST_DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(l) a safe same-named binding in a SIBLING BLOCK does not bless this one", () => {
    // whole-diff r3 finding 1: `cross_block`.
    const src = `${IMPORT}
{
  const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
  void url;
}
{
  const url = process.env.TEST_DATABASE_URL!;
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(m) an outer guarded binding shadowed by a PARAMETER does not bless the inner use", () => {
    // whole-diff r3 finding 1: `parameter_collision`. The connection reads the
    // parameter, not the outer guarded const, so the outer one is irrelevant.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
async function run(url: string) {
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}
void url;`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(n) `&&=` and loop-head assignment cannot bypass the const invariant", () => {
    // whole-diff r4 findings 2 and 3 listed `&&=`, for-of, for-in, and switch-case
    // declarations as further escapes. None is enumerated any more: a `let` is
    // rejected outright, so every assignment form it enables is unreachable.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
url &&= process.env.TEST_DATABASE_URL!;
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(o) a for-of head that rebinds an existing guarded name is rejected", () => {
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
for (url of [process.env.TEST_DATABASE_URL!]) {
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(p) a for-of DECLARATION shadowing the guarded name is rejected", () => {
    // r4 finding 2: for-of / for-in / case blocks were scope forms the walker missed.
    // The invariant does not walk scopes, so the class is closed rather than listed.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
for (const url of [process.env.TEST_DATABASE_URL!]) {
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(q) a switch-case declaration shadowing the guarded name is rejected", () => {
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
switch (process.env.MODE) {
  case "x":
    const url2 = process.env.TEST_DATABASE_URL!;
    const sql = postgres(url2, { max: 1 });
    ${PRUNE}
}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(r) a LOCAL wrapper named `postgres` around a differently-imported driver", () => {
    // whole-diff r5: `postgres(url)` looked guarded while the wrapper discarded its
    // argument and connected to TEST_DATABASE_URL through an aliased driver. Trusting
    // a call because of its NAME was the same mistake the guard side already made, so
    // it gets the same answer: the driver is resolved by import, not by spelling.
    const src = `import rawPostgres from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";
function postgres(_url: string, _opts?: unknown) {
  return rawPostgres(process.env.TEST_DATABASE_URL!);
}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(s) an ALIAS of the driver cannot open an unchecked connection", () => {
    // whole-diff r6: `const connect = postgres; connect(remote)`. A safe first
    // connection satisfied the count while the aliased one was never inspected.
    // Enumerating alias forms is the same losing game as enumerating rebinds, so the
    // driver name may now appear only in call position - no alias can exist.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const connect = postgres;
const target = connect(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(t) a second connection loaded via dynamic import is rejected", () => {
    // whole-diff r7: `(await import("postgres")).default` opened an unchecked second
    // connection. That form is ordinary here - validation-schema-parity.test.ts already
    // uses it - so the rule is not to trace it but to forbid it in a DESTRUCTIVE file,
    // where every connection has to be visible to be checked.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const pg2 = (await import("postgres")).default;
const target = pg2(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(u) a second connection loaded via require is rejected", () => {
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const pg2 = require("postgres");
const target = pg2(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });

  it("(v) template-literal and computed dynamic acquisition are rejected too", () => {
    // whole-diff r9: `import(`postgres`)` is a NoSubstitutionTemplateLiteral, not a
    // StringLiteral - the same enumeration mistake one node type down. The check now
    // reads literal TEXT, and rejects an argument it cannot read at all, since a
    // module specifier this analyzer cannot evaluate is itself the hazard.
    for (const acquire of [
      "(await import(`postgres`)).default",
      "require(`postgres`)",
      "require(pkgName)",
    ]) {
      const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const pg2 = ${acquire};
const target = pg2(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
      expect(analyseDestructiveFile(P, src).ok, acquire).toBe(false);
    }
  });

  it("(g) a guarded client followed by a SECOND, unguarded client", () => {
    // whole-diff r1 finding 2: `second_unguarded_client`. Checking only the first
    // connection blesses the file; the prune runs on the second.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const safe = postgres(url, { max: 1 });
const other = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
await other.unsafe("select public.prune_sync_log()");`;
    expect(analyseDestructiveFile(P, src).ok).toBe(false);
  });
});
