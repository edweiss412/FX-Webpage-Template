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
const IMPORT = `import { assertLocalDbUrl } from "./_localDbUrl";`;
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
