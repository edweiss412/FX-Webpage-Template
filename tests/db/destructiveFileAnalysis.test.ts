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

/**
 * Every rejection fixture pins the reason CLASS it is supposed to trip, not merely
 * `ok:false`. Without that, a fixture passes by tripping some UNRELATED check — which is
 * exactly what happened to the acquisition family when the rules it discriminated were
 * deleted: each still rejected, none for its own reason. The classes are named once here
 * so a reason-text edit shows up as one diff rather than thirty.
 */
const REASON = {
  binding: /is not bound to a trusted guard call/,
  letVar: /is declared with let\/var/,
  provenance: /the guard name resolves to a local declaration/,
  noGuard: /no loopback guard is called/,
  unguardedArg: /postgres\(\) receives an expression that is not a guarded binding/,
  notConst: /is declared as a \w+, not a guarded const/,
  uncheckedExecution: /unchecked execution site/,
  unanchoredStatement: /destructive statement outside a checked execution/,
  containment: /checked client `\w+` may only be used as/,
  uncheckedFactory: /factory `\w+` does not return a checked connection/,
} as const;

function expectRejected(src: string, reason: RegExp, label?: string): void {
  const v = analyseDestructiveFile(P, src);
  expect(v.ok, label).toBe(false);
  if (!v.ok) expect(v.reason, label).toMatch(reason);
}

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
    expectRejected(src, REASON.binding);
  });

  it("(b) ordering — the guard runs AFTER the connection opens", () => {
    // `let` is required to express this: with a `const` binding, using it before its
    // declaration is a temporal-dead-zone error, not a mutant.
    const src = `${IMPORT}
let url = process.env.TEST_DATABASE_URL!;
const sql = postgres(url, { max: 1 });
url = assertLocalDbUrl(url);
${PRUNE}`;
    expectRejected(src, REASON.letVar);
  });

  it("(c) provenance — the name resolves to a local no-op, not the imported guard", () => {
    const src = `const assertLocalDbUrl = (u: string | undefined) => u!;
const sql = postgres(assertLocalDbUrl(process.env.TEST_DATABASE_URL), { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.provenance);
  });

  it("(d) the guard exists only inside a comment", () => {
    // whole-diff r1 finding 2: `commented_guard` returned ok:true against the shipped
    // analyzer. A guard that is commented out is not a guard.
    const src = `${IMPORT}
// assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.noGuard);
  });

  it("(e) the guard exists only inside a BLOCK comment", () => {
    const src = `${IMPORT}
/* const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL); */
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.noGuard);
  });

  it("(f) the guarded binding is REASSIGNED before the connection", () => {
    // whole-diff r1 finding 2: `reassigned_after_guard`. Binding equality and ordering
    // both still hold; the VALUE does not.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
url = process.env.TEST_DATABASE_URL!;
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.letVar);
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
    expectRejected(src, REASON.provenance);
  });

  it("(i) the guarded binding is rebound via ARRAY destructuring", () => {
    // whole-diff r2 finding 4: `array_rebind`. Not a simple `url = ...`, so a
    // regex for that form misses it entirely.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
[url] = [process.env.TEST_DATABASE_URL!];
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.letVar);
  });

  it("(j) the guarded binding is rebound via OBJECT destructuring", () => {
    // whole-diff r2 finding 4: `object_rebind`. Same class, third syntax - which is
    // why the check now asks the parser for assignments rather than matching text.
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
({ url } = { url: process.env.TEST_DATABASE_URL! });
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.letVar);
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
    expectRejected(src, REASON.binding);
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
    expectRejected(src, REASON.binding);
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
    expectRejected(src, REASON.notConst);
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
    expectRejected(src, REASON.letVar);
  });

  it("(o) a for-of head that rebinds an existing guarded name is rejected", () => {
    const src = `${IMPORT}
let url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
for (url of [process.env.TEST_DATABASE_URL!]) {
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expectRejected(src, REASON.letVar);
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
    expectRejected(src, REASON.binding);
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
    expectRejected(src, REASON.binding);
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
    expectRejected(src, REASON.unguardedArg);
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
    expectRejected(src, REASON.uncheckedExecution);
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
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(u) a second connection loaded via require is rejected", () => {
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const pg2 = require("postgres");
const target = pg2(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
    expectRejected(src, REASON.uncheckedExecution);
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
      expectRejected(src, REASON.uncheckedExecution, acquire);
    }
  });

  it("(w) named-default and namespace imports of the driver are rejected", () => {
    // whole-diff r10: `import { default as pg2 } from "postgres"` and
    // `import * as pg2 from "postgres"` are ordinary static ECMAScript, both yield a
    // callable driver, and both were invisible - so a guarded first connection covered
    // an unguarded second. One permitted import form now; the rest are rejected rather
    // than traced.
    for (const imp of [
      'import { default as pg2 } from "postgres";',
      'import * as pg2 from "postgres";',
    ]) {
      const src = `import postgres from "postgres";
${imp}
import { assertLocalDbUrl } from "./_localDbUrl";
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const target = pg2(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
      expectRejected(src, REASON.uncheckedExecution, imp);
    }
  });

  it("(x) createRequire is rejected — importing module-loading capability at all", () => {
    // whole-diff r11: `createRequire(import.meta.url)("postgres")` yields a callable
    // driver, and this repo already uses createRequire elsewhere, so it is ordinary.
    // Node's ways to load a module are a CLOSED set - static import, import(),
    // require, createRequire - which is why forbidding the remaining three terminates
    // where enumerating ALIASING forms did not.
    const src = `import { createRequire } from "node:module";
${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const req = createRequire(import.meta.url);
const target = req("postgres")(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(y) process.getBuiltinModule is rejected", () => {
    // whole-diff r12: the FIFTH acquisition route, and the one that disproved r11's
    // claim that the set was closed at four. The module header now records that the
    // acquisition question is not closed and names the sound framing that would close
    // it (BL-DESTRUCTIVE-GUARD-EXECUTION-SITE).
    for (const spec of ['"module"', '"node:module"']) {
      const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const local = postgres(url, { max: 1 });
const req = process.getBuiltinModule(${spec}).createRequire(import.meta.url);
const target = req("postgres")(process.env.TEST_DATABASE_URL!);
await target.unsafe("select public.prune_sync_log()");`;
      expectRejected(src, REASON.uncheckedExecution, spec);
    }
  });

  it("(z) an IMPORTED target url is rejected, even beside a guarded same-named const", () => {
    // whole-diff r14: declarationsOf ignored import bindings, so an imported
    // `targetUrl` connected directly - with an unrelated guarded const of the same
    // name inside an unused function - satisfied the analyzer. That is a BINDING
    // failure, not the documented acquisition limit: the invariant claims every
    // declaration of the connected name is a const from a guard call, and an import
    // is a declaration.
    for (const imp of [
      'import { targetUrl } from "./fixtures/urls";',
      'import targetUrl from "./fixtures/urls";',
      'import targetUrl = require("./fixtures/urls");',
    ]) {
      const src = `${IMPORT}
${imp}
function unused() {
  const targetUrl = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
  return targetUrl;
}
const sql = postgres(targetUrl, { max: 1 });
${PRUNE}`;
      expectRejected(src, REASON.notConst, imp);
    }
  });

  /**
   * The execution-site family. Everything above discriminates a BINDING property of
   * the connection; these discriminate the property the redesign added — that a
   * destructive statement must RUN on a client the analyzer checked. Acquisition is
   * deliberately unmodeled in each of them: the client arrives by a route nobody
   * enumerated, and the file is rejected anyway.
   */
  it("(aa) rejects a destructive string executed through a detached method of an unknown client", () => {
    // Spec review R1 F1's probe, verbatim: no tagged template and no property call,
    // so a client-shaped rule alone returns ok:true. The STATEMENT is what is caught.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const target = getDbClient(process.env.TEST_DATABASE_URL);
const { unsafe } = target;
await unsafe("select public.prune_sync_log()");`;
    expectRejected(src, REASON.unanchoredStatement);
  });

  it("(ab) rejects destructuring a checked client", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
const { unsafe } = sql;
await unsafe("select 1");`;
    expectRejected(src, REASON.containment);
  });

  it("(ac) rejects a stored method reference on a checked client", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
const u = sql.unsafe;
await u("select 1");`;
    expectRejected(src, REASON.containment);
  });

  it("(ad) rejects a computed member on a checked client", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
await sql["unsafe"]("select 1");`;
    expectRejected(src, REASON.containment);
  });

  it("(ae) rejects passing a checked client as a function argument", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
await helper(sql);`;
    expectRejected(src, REASON.containment);
  });

  it("(af) rejects a factory whose body is not a checked-connection expression", () => {
    // One level, non-recursive by design: a factory returning another factory's call
    // is not summarized, and the failure is a LOUD rejection the author repairs by
    // inlining -- never a silent pass.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const inner = () => postgres(DB_URL);
const outer = () => inner();
const sql = outer();
sql\`select 1\`;`;
    expectRejected(src, REASON.uncheckedFactory);
  });

  it("(ag) accepts a one-level factory returning a checked connection", () => {
    // The live shape from resetValidationDataConcurrency.test.ts, which is why the
    // execution-site framing was reverted the first time it was attempted.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const newConn = () => postgres(DB_URL, { max: 1 });
const a = newConn();
const b = newConn();
a\`select 1\`;
b\`select 1\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(ah) rejects an execution on a client acquired by an unenumerated route", () => {
    // `Function("return require")()` is in none of the deleted acquisition rules.
    // It does not need to be: the client it produces is simply not in the checked set.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const req = Function("return require")();
const pg = req("postgres");
const sql = pg(process.env.TEST_DATABASE_URL);
sql\`select 1\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(ai) accepts a transaction callback parameter of a checked client", () => {
    // `.begin(async (tx) => ...)` is how five of the seven real destructive files run
    // their statements, so the checked set has to reach the callback's parameter.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL);
await sql.begin(async (tx) => {
  await tx\`select public.prune_sync_log()\`;
});`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(aj) rejects a transaction callback parameter of an UNCHECKED client", () => {
    // The negative twin of (ai): without it, "tx is checked" could be granted to any
    // parameter named in any `.begin` call, which would re-open the whole class.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const target = getDbClient(process.env.TEST_DATABASE_URL);
await target.begin(async (tx) => {
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(g) a guarded client followed by a SECOND, unguarded client", () => {
    // whole-diff r1 finding 2: `second_unguarded_client`. Checking only the first
    // connection blesses the file; the prune runs on the second.
    const src = `${IMPORT}
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const safe = postgres(url, { max: 1 });
const other = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
await other.unsafe("select public.prune_sync_log()");`;
    expectRejected(src, REASON.unguardedArg);
  });
});
