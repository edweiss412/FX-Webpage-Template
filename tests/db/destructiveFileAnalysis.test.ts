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
 * WHY DISCOVERY MATCHES THIS FILE, and what exempts it. The mutant sources below quote
 * `select public.prune_sync_log()` — the very string the guard hunts — so the filesystem
 * walk finds this file, as it should. It is exempted by NAME, through GUARD_OWN_FILES in
 * tests/db/_destructiveStatements.ts, checked before any analysis runs. The inline
 * `// not-subject-to-destructive-target-guard:` comment that used to sit here is GONE with
 * the regex that read it: that mechanism exempted the meta-test by accident, because its
 * own failure message happened to match the pattern.
 *
 * Blanking string bodies during discovery is not the alternative — it would un-discover the
 * REAL destructive files too, which execute their SQL as string literals as well.
 */
import { describe, expect, it } from "vitest";
import { analyseDestructiveFile } from "./_destructiveFileAnalysis";
import { DESTRUCTIVE_STATEMENT_PATTERNS } from "./_destructiveStatements";

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
  notImported: /the guard name is not imported from/,
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
    const v = analyseDestructiveFile(P, src);
    expect(v.ok).toBe(false);
    // The exact explanation, not just its class: `sql` here comes from a call to
    // something that is not a local factory at all, and a mutant reporting it as an
    // unchecked FACTORY sends the author looking for a function that does not exist.
    if (!v.ok) {
      expect(v.reason).toBe("unchecked execution site at line 7: `sql` is not a checked client");
    }
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

  /**
   * The mutation-enrolment family. Each of these was written to kill a specific
   * surviving mutant the source-mutation gate reported on first enrolment
   * (chore/guard-completeness-wave): a suite that passes while a mutant lives is a suite
   * whose claim is wider than its coverage.
   */
  it("(ak) rejects a guard imported as a DEFAULT binding, not a named one", () => {
    // Kills `named && ts.isNamedImports(named)` -> `||`: with `||`, an import clause
    // carrying no named bindings reaches `named.elements` and throws.
    const src = `import postgres from "postgres";
import assertLocalDbUrl from "./_localDbUrl";
const url = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    // A default binding is not a named import, so the guard never enters `imported` and
    // the file reads as "not imported" — which is the correct instruction here.
    expectRejected(src, REASON.notImported);
  });

  it("(al) rejects a guard shadowed by a FUNCTION DECLARATION", () => {
    // Kills the shadow walk's `(isFunctionDeclaration(n) || isClassDeclaration(n))` ->
    // `&&` (no node is both, so function shadowing stops being seen) and the
    // `out.add(...)` removal at the same site. Fixture (c) shadows with a `const`, which
    // takes a different branch.
    const src = `${IMPORT}
function assertLocalDbUrl(u: string | undefined) {
  return u!;
}
const url = assertLocalDbUrl(process.env.TEST_DATABASE_URL);
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.provenance);
  });

  it("(am) says NOT IMPORTED, not SHADOWED, when the guard is neither", () => {
    // Kills `shadowed.size > 0` -> `>= 0`, which reports every unimported guard as a
    // local shadow — a wrong instruction to the reader, and invisible to an `ok:false`
    // assertion.
    const src = `import postgres from "postgres";
const url = assertLocalDbUrl(process.env.TEST_DATABASE_URL);
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    const v = analyseDestructiveFile(P, src);
    expect(v.ok).toBe(false);
    if (!v.ok)
      expect(v.reason).toMatch(/the guard name is not imported from tests\/db\/_localDbUrl/);
  });

  it("(an) reports the LINE of the offending node, not an offset of it", () => {
    // Kills the `line + 1` -> `line + 2` mutant. The reason's line is the only thing
    // pointing an author at the site, and every other assertion in this file is blind
    // to it.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const target = getDbClient(process.env.TEST_DATABASE_URL);
const { unsafe } = target;
await unsafe("select public.prune_sync_log()");`;
    const v = analyseDestructiveFile(P, src);
    expect(v.ok).toBe(false);
    // IMPORT is two lines, so the destructive literal is on line 6.
    if (!v.ok) expect(v.reason).toContain("at line 6");
  });

  it("(ao) accepts a BLOCK-BODY factory whose only return is a checked connection", () => {
    // Kills the two return-collector mutants that make a block body yield no returns at
    // all (`ts.forEachChild(body, walk)` removed) and the one that stops the walk at the
    // first child (`n !== body &&` -> `||`).
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => {
  return postgres(DB_URL, { max: 1 });
};
const sql = make();
sql\`select 1\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(ap) accepts a factory whose return is nested inside a block", () => {
    // Kills the inner `ts.forEachChild(n, walk)` removal: without it the collector sees
    // only the block's direct children, so a return one level down vanishes and the
    // factory is wrongly unchecked.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => {
  if (process.env.CI) {
    return postgres(DB_URL, { max: 1 });
  }
  throw new Error("unreachable in this fixture");
};
const sql = make();
sql\`select 1\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(aq) does not read a NESTED function's returns as the factory's own", () => {
    // Kills `n !== body` -> `===` and `(isFunctionLike(n) || isClassLike(n))` -> `&&`:
    // both make the collector descend into nested functions, so this factory's summary
    // would pick up the inner arrow's return and go unchecked.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => {
  function describeIt() {
    return process.env.TEST_DATABASE_URL;
  }
  void describeIt;
  return postgres(DB_URL, { max: 1 });
};
const sql = make();
sql\`select 1\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(ar) rejects a factory that returns NOTHING", () => {
    // Kills `returns.length > 0` -> `>= 0`, under which a factory with no returns at all
    // satisfies `every()` vacuously and becomes a checked connection source.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => {
  postgres(DB_URL, { max: 1 });
};
const sql = make();
sql\`select 1\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(as) tolerates an ordinary helper arrow that is not a transaction callback", () => {
    // Kills the two beginParamReceiver guards (`!isCallExpression(call) ||` -> `&&`, and
    // `!isPropertyAccessExpression(callee) ||` -> `&&`): each dereferences a shape it
    // just proved absent, so an ordinary helper parameter throws during analysis.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
const label = (n: number) => String(n);
void label;
withRetries(async (attempt) => attempt + 1);
sql\`select 1\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(at) rejects a client bound with let, even from a checked connection", () => {
    // Kills `!d.isConst || !init` -> `&&`, under which a reassignable binding holding a
    // checked connection becomes a checked client — the hole the connection leg's const
    // invariant closes, one level up.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
let sql = postgres(DB_URL, { max: 1 });
sql\`select 1\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(au) resolves a transaction client whose receiver is checked LATER in the file", () => {
    // Kills the fixpoint's `grew = true` removal. Candidate order follows the AST, so
    // `tx` is seen before the `sql` it depends on: a single-pass resolution leaves `tx`
    // unchecked and rejects a legitimate file.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
function run() {
  return sql.begin(async (tx) => {
    await tx\`select public.prune_sync_log()\`;
  });
}
const sql = postgres(DB_URL, { max: 1 });
void run;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(av) explains an unchecked tag whose declaration has no initializer", () => {
    // Kills `!isVariableDeclaration(d.node) || !d.node.initializer` -> `&&`, which
    // dereferences the initializer it just proved absent.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
void DB_URL;
let sql;
sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(aw) anchors a destructive TEMPLATE literal, not only a string one", () => {
    // Kills `isNoSubstitutionTemplateLiteral(n) ||` -> `&&`: a backticked statement is a
    // different node kind, and the recognizer must range over all three.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const target = getDbClient(process.env.TEST_DATABASE_URL);
const { unsafe } = target;
await unsafe(\`select public.prune_sync_log()\`);`;
    expectRejected(src, REASON.unanchoredStatement);
  });

  it("(ax) accepts a destructive statement ASSERTED ON rather than executed", () => {
    // The documented limit, pinned as behavior: a literal whose nearest enclosing call is
    // a non-execution method on a call RESULT is an assertion about a stored command, not
    // an execution — live at tests/db/syncLogIndexesAndPrune.db.test.ts:219. Kills
    // `anc !== undefined &&` -> `===`, which collapses the exemption and rejects it.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
const [job] = await sql\`select command from cron.job\`;
expect(job.command).toBe("select public.prune_sync_log();");`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(ay) rejects a checked client used as a parameter DEFAULT", () => {
    // Kills `(isParameter(p) && p.name === n)` -> `||`, under which any parameter-parented
    // use counts as the client's own binding — laundering it into a callee's hands.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
function run(client = sql) {
  return client;
}
void run;`;
    expectRejected(src, REASON.containment);
  });

  it("(az) treats a CLASS declaration of the connected name as a declaration", () => {
    // Kills `(isFunctionDeclaration(n) || isClassDeclaration(n))` -> `&&` in
    // declarationsOf and the `out.push` removal beside it: without them the name looks
    // undeclared, and "has no declaration" is a different, wrong instruction.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
void safe;
class url {}
const sql = postgres(url, { max: 1 });
${PRUNE}`;
    expectRejected(src, REASON.notConst);
  });

  it("(ba) tolerates a catch clause with no binding", () => {
    // Kills `isCatchClause(n) && n.variableDeclaration` -> `||`: an optional-binding catch
    // then dereferences the declaration it does not have.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
try {
  sql\`select 1\`;
} catch {
  void 0;
}`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(bb) treats a CATCH binding of the connected name as a declaration", () => {
    // Kills the `fromBindingName(n.variableDeclaration...)` removal: a caught binding IS
    // a declaration, and dropping it reports the name as undeclared instead of as
    // reassignable by construction.
    const src = `${IMPORT}
const safe = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
void safe;
try {
  void 0;
} catch (url) {
  const sql = postgres(url, { max: 1 });
  ${PRUNE}
}`;
    expectRejected(src, REASON.letVar);
  });

  it("(bc) tolerates a side-effect-only import", () => {
    // Kills `isImportDeclaration(n) && n.importClause` -> `||`: a clause-less import then
    // dereferences the clause it does not have.
    const src = `import "./_setupHooks";
${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
${PRUNE}`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(bd) pins the wipe-gate recognizer's 120-character window", () => {
    // Kills `{0,120}` -> `{0,121}`. The window is the only thing separating "this file
    // enables the destructive gate" from "these two tokens appear near each other", and
    // it is shared with FILE DISCOVERY — so a silently widened bound changes which files
    // are analyzed at all. the gap counts the spaces too, so 119 fillers is 121 characters — one
    // past the boundary, unmatched by the shipped pattern and matched by the mutant.
    const justPast = `destructive_reset_gate ${"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} enabled = true`;
    expect(DESTRUCTIVE_STATEMENT_PATTERNS.enablesWipeGate.test(justPast)).toBe(false);
    const justInside = `destructive_reset_gate ${"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} enabled = true`;
    expect(DESTRUCTIVE_STATEMENT_PATTERNS.enablesWipeGate.test(justInside)).toBe(true);
  });

  /**
   * Diff review R1's finding, and the class around it. Each of these returned `ok:true`
   * against the reviewed tree, on a file discovery DOES pick up — a whole-database wipe
   * blessed by a factory name whose binding the analyzer never proved immutable.
   */
  it("(be) rejects a client from a SHADOWED factory name (unchecked declared FIRST)", () => {
    const src = `${IMPORT}
function run() {
  const make = () => getDbClient(process.env.TEST_DATABASE_URL);
  const sql = make();
  sql\`select public.prune_sync_log()\`;
}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => postgres(DB_URL);
void run;`;
    expectRejected(src, REASON.uncheckedFactory);
  });

  it("(bf) rejects the same shape with the CHECKED declaration first", () => {
    // Order independence: the escape was source-order dependent, so both orders are
    // pinned. One of them passed before the repair and the other did not.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => postgres(DB_URL);
function run() {
  const make = () => getDbClient(process.env.TEST_DATABASE_URL);
  const sql = make();
  sql\`select public.prune_sync_log()\`;
}
void run;`;
    expectRejected(src, REASON.uncheckedFactory);
  });

  it.each([
    ["let", "let make = () => postgres(DB_URL);"],
    ["var", "var make = () => postgres(DB_URL);"],
    ["function declaration", "function make() { return postgres(DB_URL); }"],
  ])("(bg) rejects a factory whose %s binding is REASSIGNED", (_label, decl) => {
    // `const` answers the mutability question for the connected URL and for clients; it
    // never covered the factory binding, and a function declaration is a mutable binding
    // even without let or var.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
${decl}
make = () => getDbClient(process.env.TEST_DATABASE_URL);
const sql = make();
sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bh) rejects a transaction callback parameter that is REASSIGNED", () => {
    // The same escape one surface over: a parameter is not a `const` either, so a
    // checked `tx` could be swapped for an unchecked client before the statement runs.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  tx = getDbClient(process.env.TEST_DATABASE_URL);
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bi) rejects a checked client whose name is reassigned anywhere in the file", () => {
    // Completes the class at the client surface: `const` makes this unparseable in real
    // TypeScript, but the analyzer reads syntax, and a name it can see being assigned is
    // a name it cannot claim is still the client it checked.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
sql = getDbClient(process.env.TEST_DATABASE_URL);
sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bj) rejects a factory name that is ALSO a parameter", () => {
    // Third instance of R1's class, found by sweeping it rather than the named case:
    // `summarize` only ever sees function declarations and function-valued consts, so a
    // same-named PARAMETER was invisible to it and the checked outer factory blessed a
    // client the parameter supplied. Probed ok:true before the repair.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => postgres(DB_URL, { max: 1 });
function run(make) {
  const sql = make();
  sql\`select public.prune_sync_log()\`;
}
void run;`;
    expectRejected(src, REASON.uncheckedFactory);
  });

  it("(bk) rejects a factory name that is also an IMPORT binding", () => {
    // The neighbouring declaration kind, pinned as a regression rather than claimed as a
    // kill: an imported `make` was never summarized at all, so Rule 1 already rejected it.
    // It is here because the repair above makes the two cases one rule, and a later edit
    // that "simplifies" the rule should have to notice both.
    const src = `${IMPORT}
import { make } from "./fixtures/factories";
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = make();
sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  /**
   * Diff review R2: a NAMED FUNCTION EXPRESSION binds its own name inside its own body, and
   * all three name walkers were blind to that form — the shadow census, `declarationsOf`,
   * and the factory summary each handled `function f(){}` but not `const x = function f(){}`.
   * The guard variant probed `ok:true` on a discovered whole-database wipe. One predicate,
   * `isNamedFunctionLike`, now answers it for all three, because three copies of a binding
   * rule is how this one drifted in the first place.
   */
  it("(bl) rejects a guard shadowed by a NAMED FUNCTION EXPRESSION", () => {
    const src = `${IMPORT}
const run = function assertLocalDbUrl(u: string | undefined) {
  const url = assertLocalDbUrl(process.env.TEST_DATABASE_URL);
  const sql = postgres(url);
  sql\`select public.prune_sync_log()\`;
  return url;
};
void run;`;
    expectRejected(src, REASON.provenance);
  });

  it("(bm) rejects a driver shadowed by a NAMED FUNCTION EXPRESSION", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const run = function postgres(u: string | undefined) {
  const sql = postgres(process.env.TEST_DATABASE_URL);
  sql\`select public.prune_sync_log()\`;
  return sql;
};
void run;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bn) rejects a checked factory shadowed by a NAMED FUNCTION EXPRESSION", () => {
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => postgres(DB_URL);
const run = function make() {
  const sql = make();
  sql\`select public.prune_sync_log()\`;
  return sql;
};
void run;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bo) rejects a guard shadowed by a NAMED CLASS EXPRESSION", () => {
    // The neighbour of the same binding form: a named class expression binds its name in
    // its own body too, and the predicate covers both rather than just the one probed.
    const src = `${IMPORT}
const Holder = class assertLocalDbUrl {
  run() {
    const url = assertLocalDbUrl(process.env.TEST_DATABASE_URL);
    const sql = postgres(url);
    sql\`select public.prune_sync_log()\`;
    return url;
  }
};
void Holder;`;
    expectRejected(src, REASON.provenance);
  });

  it("(bp) rejects a LATER .begin parameter defaulted to an unchecked client", () => {
    // Diff review R3, verbatim probe. `.begin(fn)` calls fn(tx), so only parameter 0 is the
    // transaction client; parameter 1 is undefined and takes its default — here a client
    // the analyzer never checked, executing a wipe.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx, other = getDbClient(process.env.TEST_DATABASE_URL)) => {
  await other\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bq) rejects a .begin parameter 0 that carries a default", () => {
    // Conservative, and labelled as such: argument 0 is always supplied, so this default can
    // never be the value that runs. The analyzer reasons about the value `.begin` passes, and
    // a second possible source of that binding is not worth modelling for a degenerate shape.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx = getDbClient(process.env.TEST_DATABASE_URL)) => {
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  /**
   * (br)-(bz) pin the assignment-target census and the factory-declaration sweep, both added
   * by diff review R1's class sweep. CI's whole-gate mutation run found TWELVE unaccepted
   * survivors across them — every one in code this branch introduced.
   *
   * The census cases share a shape worth stating once. Breaking a census leg does NOT make
   * the file pass: the name simply becomes a checked client instead, and the containment
   * rule rejects the write rather than Rule 1 rejecting the execution. So `ok:false` is true
   * either way and proves nothing; the REASON is the discriminator, which is precisely the
   * discipline this file's header sets out. Each case below therefore pins
   * `REASON.uncheckedExecution` and would see `REASON.containment` under its mutant.
   */
  it("(br) rejects a POSTFIX-incremented .begin parameter", () => {
    // `tx++` is a write, so `tx` can never be a checked client. Kills the postfix leg of
    // the unary test, the `++` half of the operator test, and the census's noteTarget call.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  tx++;
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bs) rejects a PREFIX-incremented .begin parameter", () => {
    // The prefix leg, pinned separately so deleting either disjunct is caught on its own.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  ++tx;
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bt) rejects a DECREMENTED .begin parameter", () => {
    // The `--` half of the operator test: `++` alone leaves it unpinned.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  tx--;
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bu) rejects a .begin parameter written with the LAST assignment operator", () => {
    // The census accepts the whole FirstAssignment..LastAssignment range rather than `=`
    // alone. `^=` IS LastAssignment, so it is the only operator that pins the upper bound —
    // `<=` and `<` agree on every other operator in the range. Nobody writes `tx ^= 1` at a
    // client; the fixture exists to pin the RANGE, and the range is what makes the census
    // cover the compound assignments (`+=`, `||=`, `??=`) an author really would write.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  tx ^= 1;
  await tx\`select public.prune_sync_log()\`;
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bv) rejects a .begin parameter rebound by a for-OF loop", () => {
    // A for-of whose initializer is a bare identifier rebinds it on every iteration. This
    // one is not a contrived shape: it is how an author would sweep several clients.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  for (tx of [getDbClient(process.env.TEST_DATABASE_URL)]) {
    await tx\`select public.prune_sync_log()\`;
  }
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bw) rejects a .begin parameter rebound by a for-IN loop", () => {
    // The for-in leg, pinned separately from for-of for the same reason (br)/(bs) are split.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql.begin(async (tx) => {
  for (tx in { a: 1 }) {
    await tx\`select public.prune_sync_log()\`;
  }
});`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(bx) rejects a checked client used under a unary operator, by CONTAINMENT", () => {
    // The census must notice `++`/`--` and nothing else about unary expressions. Were it to
    // fire for every unary, `!sql` would mark `sql` written-to and the rejection would come
    // from Rule 1 instead of containment.
    //
    // A DOCUMENTED LIMIT rides along here, stated rather than hidden: `if (!sql) throw` is
    // ordinary defensive code and this analyzer rejects it. That is a loud false rejection an
    // author repairs by dropping the check or restructuring, never a silent acceptance of a
    // wipe, so it is a limit and not a defect — the consequence bound this surface is
    // reviewed against.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
if (!sql) throw new Error("no client");
await sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.containment);
  });

  it("(by) ACCEPTS a factory written as a function DECLARATION", () => {
    // `isFactoryDeclaration` admits three forms; a function declaration is the one an author
    // reaches for first. Under the mutant that conjoins its two function tests, no node is
    // both a declaration and an expression, so every function-declaration factory would stop
    // counting as a factory and this ordinary file would be rejected.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
function make() {
  return postgres(DB_URL, { max: 1 });
}
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(bz) rejects a factory NAME that is also declared as a plain variable", () => {
    // Every declaration of a factory name must itself be a factory. The mutant that loosens
    // the variable-declaration leg to a disjunction lets ANY variable declaration count, so
    // an inner `const make = getDbClient(TEST_DATABASE_URL)` would leave the outer factory
    // trusted and this file would pass.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const make = () => postgres(DB_URL, { max: 1 });
function other() {
  const make = getDbClient(process.env.TEST_DATABASE_URL);
  return make;
}
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedFactory);
  });

  it("(ca) rejects `.file()` on an unchecked client", () => {
    // Diff review R6 finding 1, verbatim probe. postgres.js reads the path and submits its
    // contents as a query, so `.file()` executes caller-supplied SQL exactly as `unsafe`
    // does -- and it was the ONE method returning a query that EXECUTION_METHODS omitted.
    // The checked client above it is what makes this a silent acceptance rather than a
    // rejection for some unrelated reason: the file looks correct until the last line.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
await sql\`select public.prune_sync_log()\`;
const remote = getDbClient(process.env.TEST_DATABASE_URL);
await remote.file("./destructive.sql");`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(cb) keeps `.json()` and `.array()` OUT of the execution set", () => {
    // The other half of finding 1's class, pinned so a later widening cannot quietly add
    // them: they return a Parameter, not a query, and they collide with Response and
    // Object members that real destructive files call on non-clients. A file whose only
    // `.json()` call is on a fetch Response must still pass.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
const sql = postgres(DB_URL, { max: 1 });
const res = await fetch("https://example.invalid/x");
const body = await res.json();
await sql\`select public.prune_sync_log()\`;`;
    expect(analyseDestructiveFile(P, src)).toEqual({ ok: true });
  });

  it("(cc) rejects a factory reassigned through an `as` assertion", () => {
    // Diff review R6 finding 2. The census must see through every wrapper TypeScript
    // allows around an assignment target, or a checked factory can be swapped for an
    // unchecked one in a file that typechecks cleanly. Verified to compile under `strict`.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
let make = () => postgres(DB_URL, { max: 1 });
(make as any) = () => getDbClient(process.env.TEST_DATABASE_URL);
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(cd) rejects a factory reassigned through an angle-bracket assertion", () => {
    // Diff review R6 finding 2. The census must see through every wrapper TypeScript
    // allows around an assignment target, or a checked factory can be swapped for an
    // unchecked one in a file that typechecks cleanly. Verified to compile under `strict`.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
let make = () => postgres(DB_URL, { max: 1 });
(<any>make) = () => getDbClient(process.env.TEST_DATABASE_URL);
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(ce) rejects a factory reassigned through a non-null assertion", () => {
    // Diff review R6 finding 2. The census must see through every wrapper TypeScript
    // allows around an assignment target, or a checked factory can be swapped for an
    // unchecked one in a file that typechecks cleanly. Verified to compile under `strict`.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
let make = () => postgres(DB_URL, { max: 1 });
(make!) = () => getDbClient(process.env.TEST_DATABASE_URL);
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
    expectRejected(src, REASON.uncheckedExecution);
  });

  it("(cf) rejects a factory reassigned through a `satisfies` expression", () => {
    // Diff review R6 finding 2. The census must see through every wrapper TypeScript
    // allows around an assignment target, or a checked factory can be swapped for an
    // unchecked one in a file that typechecks cleanly. Verified to compile under `strict`.
    const src = `${IMPORT}
const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL);
let make = () => postgres(DB_URL, { max: 1 });
(make satisfies unknown) = () => getDbClient(process.env.TEST_DATABASE_URL);
const sql = make();
await sql\`select public.prune_sync_log()\`;`;
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
