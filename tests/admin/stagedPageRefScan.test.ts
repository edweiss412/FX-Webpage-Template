/**
 * tests/admin/stagedPageRefScan.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §3.4, §5 tests 6-9)
 *
 * Synthetic-source units for the retired-staged-page scanner. The guard that
 * consumes these primitives (step3DeletionSafety.test.ts) runs only against the
 * live tree, where none of the bypasses below exist — so if a branch here were
 * fail-OPEN, the tree scan could not reveal it. Each case names the regression it
 * catches.
 */
import { describe, expect, test } from "vitest";

import {
  classifyRetiredPathOccurrences,
  hrefHitsRetiredPage,
  resolveNavHrefs,
} from "./stagedPageRefScan";

/** The retired page path, assembled here so this test file is not itself an occurrence. */
const RETIRED = "/admin/onboarding/" + "staged/";

function hrefValues(src: string): string[] {
  return resolveNavHrefs(src).map((h) => h.value);
}

function retiredHrefs(src: string): string[] {
  return hrefValues(src).filter(hrefHitsRetiredPage);
}

describe("classifyRetiredPathOccurrences (spec §3.3 Layer A + C)", () => {
  test("a comment occurrence classifies as comment, a code literal as string-literal", () => {
    expect(
      classifyRetiredPathOccurrences(`// see ${RETIRED}[session]/[file]\nconst x = 1;`),
    ).toEqual(["comment"]);
    expect(classifyRetiredPathOccurrences(`const u = "${RETIRED}a/b";`)).toEqual([
      "string-literal",
    ]);
  });

  test("an /api/ path is not an occurrence at all", () => {
    // components/admin/StagedReviewCard.tsx:277,282 build these legitimately.
    expect(classifyRetiredPathOccurrences(`const u = "/api${RETIRED}a/apply";`)).toEqual([]);
  });

  test("a comment turned into code changes the KIND at an unchanged count", () => {
    // This is the R1-5b bypass: an allow-list keyed on count alone accepts the swap.
    const asComment = classifyRetiredPathOccurrences(`// ${RETIRED}x\nexport const a = 1;`);
    const asCode = classifyRetiredPathOccurrences(`export const a = "${RETIRED}x";`);
    expect(asComment).toHaveLength(1);
    expect(asCode).toHaveLength(1);
    expect(asComment).not.toEqual(asCode);
  });

  test("a path assembled from segments is flagged even though no literal contains it", () => {
    // R1-5a: invisible to every per-literal and raw-text scan.
    const src = `const u = "/admin/onboarding/" + "staged/" + id;`;
    expect(classifyRetiredPathOccurrences(src)).toEqual(["assembled"]);
  });

  test("join() and concat() assembly is caught too (whole-diff R2 finding 3)", () => {
    // The two standard alternatives to `+`. Layer A sees no complete literal and
    // Layer B leaves a bare property-call unresolved, so without this both were green.
    expect(
      classifyRetiredPathOccurrences(`const u = ["/admin/onboarding", "/staged/", id].join("");`),
    ).toEqual(["assembled"]);
    expect(
      classifyRetiredPathOccurrences(`const u = "/admin/onboarding/".concat("staged/", id);`),
    ).toEqual(["assembled"]);
  });

  test("join() with the DEFAULT separator does not fabricate a match", () => {
    // ["/admin/onboarding", "staged/"].join() inserts a comma, so it is NOT the
    // retired path. A flattener that ignored the separator would report a hit.
    expect(
      classifyRetiredPathOccurrences(`const u = ["/admin/onboarding/", "staged/"].join();`),
    ).toEqual([]);
  });

  test("same-file CONSTANTS composed into the path are caught (whole-diff finding 3)", () => {
    // All four supported operators, each composing the path out of parts that no
    // single literal contains. An identifier-blind flattener renders A and B as
    // sentinels and reports nothing.
    const decls = 'const A = "/admin/onboarding/";\nconst B = "staged/";\n';
    expect(classifyRetiredPathOccurrences(`${decls}const u = A + B + id;`)).toContain("assembled");
    expect(classifyRetiredPathOccurrences(`${decls}const u = [A, B, id].join("");`)).toContain(
      "assembled",
    );
    expect(classifyRetiredPathOccurrences(`${decls}const u = A.concat(B, id);`)).toContain(
      "assembled",
    );
    const obj = 'const seg = { base: "/admin/onboarding/", leaf: "staged/" };\n';
    expect(classifyRetiredPathOccurrences(`${obj}const u = seg.base + seg.leaf + id;`)).toContain(
      "assembled",
    );
  });

  test("composed constants that do NOT form the retired path stay clean", () => {
    // No false positives from resolution: these constants compose a different path.
    const decls = 'const A = "/admin/onboarding/";\nconst B = "review/";\n';
    expect(classifyRetiredPathOccurrences(`${decls}const u = A + B + id;`)).toEqual([]);
  });

  test("an assembled /api/ path stays clean", () => {
    const src = `const u = "/api/admin/onboarding/" + "staged/" + id + "/apply";`;
    expect(classifyRetiredPathOccurrences(src)).toEqual([]);
  });

  test("a contiguous literal inside a template is counted ONCE, not twice", () => {
    // Guards against the assembled pass double-reporting what the raw pass already saw.
    const src = "const u = `" + RETIRED + "${a}/${b}`;";
    expect(classifyRetiredPathOccurrences(src)).toEqual(["string-literal"]);
  });
});

describe("resolveNavHrefs (spec §3.3 Layer B)", () => {
  test("a literal href resolves", () => {
    expect(retiredHrefs(`const A = () => <Link href="${RETIRED}a/b">go</Link>;`)).toEqual([
      `${RETIRED}a/b`,
    ]);
  });

  test("a template href resolves through its substitutions", () => {
    const src = "const A = () => <Link href={`" + RETIRED + "${s}/${f}`}>go</Link>;";
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("a same-file function helper resolves — THE bypass the old guard missed", () => {
    const src = [
      `function buildStagedUrl(id) { return \`${RETIRED}\${id}/x\`; }`,
      "const A = () => <Link href={buildStagedUrl(id)}>go</Link>;",
    ].join("\n");
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("an ARROW helper resolves too (R1-5)", () => {
    const src = [
      `const buildStagedUrl = (id) => \`${RETIRED}\${id}/x\`;`,
      "const A = () => <a href={buildStagedUrl(id)}>go</a>;",
    ].join("\n");
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("a const binding resolves (two hops)", () => {
    const src = [
      `const BASE = "${RETIRED}a/b";`,
      "const TARGET = BASE;",
      "const A = () => <Link href={TARGET}>go</Link>;",
    ].join("\n");
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("an object-literal property + concatenation resolves (R1-5b)", () => {
    const src = [
      `const routes = { staged: "${RETIRED}" };`,
      "const A = () => <Link href={routes.staged + id}>go</Link>;",
    ].join("\n");
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("a segmented concatenation resolves", () => {
    const src = `const A = () => <Link href={"/admin/onboarding/" + "staged/" + id}>go</Link>;`;
    expect(retiredHrefs(src)).toHaveLength(1);
  });

  test("an href assembled with join() or concat() resolves (whole-diff R2 finding 3)", () => {
    const joined = `const A = () => <Link href={["/admin/onboarding", "/staged/", id].join("")}>go</Link>;`;
    const concatenated = `const A = () => <Link href={"/admin/onboarding/".concat("staged/", id)}>go</Link>;`;
    expect(retiredHrefs(joined)).toHaveLength(1);
    expect(retiredHrefs(concatenated)).toHaveLength(1);
  });

  test("an href composed from same-file constants resolves (whole-diff finding 3)", () => {
    const decls = 'const A = "/admin/onboarding/";\nconst B = "staged/";\n';
    expect(retiredHrefs(`${decls}const C = () => <Link href={A + B + id}>go</Link>;`)).toHaveLength(
      1,
    );
    expect(
      retiredHrefs(`${decls}const C = () => <Link href={[A, B, id].join("")}>go</Link>;`),
    ).toHaveLength(1);
    expect(
      retiredHrefs(`${decls}const C = () => <Link href={A.concat(B, id)}>go</Link>;`),
    ).toHaveLength(1);
  });

  test("an /api/ href is resolved but does NOT hit the retired page", () => {
    const src = `const A = () => <Link href={"/api${RETIRED}a/apply"}>go</Link>;`;
    expect(hrefValues(src)).toHaveLength(1);
    expect(retiredHrefs(src)).toEqual([]);
  });

  test("an unresolvable href is skipped, not guessed", () => {
    // No false positives: a dynamic href and a spread carry no static value.
    expect(hrefValues("const A = ({ url }) => <Link href={url}>go</Link>;")).toEqual([]);
    expect(hrefValues("const A = (props) => <Link {...props}>go</Link>;")).toEqual([]);
  });

  test("a non-nav element with an href-like prop is ignored", () => {
    const src = `const A = () => <Card href="${RETIRED}a/b" />;`;
    expect(hrefValues(src)).toEqual([]);
  });
});

describe("KNOWN LIMITS — pinned so they are not silent (spec §7)", () => {
  // These are recorded, not fixed. Resolving them needs interprocedural argument
  // binding, which is a different tool than a positional scanner. The tests exist so
  // the boundary is executable: if a future change starts catching one of these, the
  // test fails and the residual list gets updated deliberately.
  test("a PARAMETERIZED helper is not resolved", () => {
    const src = [
      "function joinPath(a, b) { return a + b; }",
      `const u = joinPath("/admin/onboarding/", "staged/");`,
    ].join("\n");
    expect(classifyRetiredPathOccurrences(src)).toEqual([]);
  });

  test("CROSS-MODULE assembly is not resolved (the residual spec §7 names first)", () => {
    // The segments live in another module; a single-file scanner cannot see them.
    // Layer A still flags the OTHER module, where the literals are written — this
    // pins that the consuming file alone reports nothing.
    const consumer = [
      'import { BASE, LEAF } from "@/lib/routes";',
      "const u = BASE + LEAF + id;",
      "const C = () => <Link href={BASE + LEAF + id}>go</Link>;",
    ].join("\n");
    expect(classifyRetiredPathOccurrences(consumer)).toEqual([]);
    expect(retiredHrefs(consumer)).toEqual([]);
  });

  test("a deep same-file chain IS resolved (the hop budget is not two)", () => {
    // Pins the raised budget: a four-link chain must still resolve, so restoring a
    // small ceiling fails here rather than silently reopening the bypass.
    const src = [
      'const A = "/admin/onboarding/";',
      "const B = A;",
      "const C = B;",
      "const D = C;",
      'const u = D + "staged/" + id;',
    ].join("\n");
    expect(classifyRetiredPathOccurrences(src)).toContain("assembled");
  });

  test("a REASSIGNED binding is not tracked", () => {
    const src = [
      'let base = "/safe/";',
      'base = "/admin/onboarding/";',
      'const u = base + "staged/";',
    ].join("\n");
    expect(classifyRetiredPathOccurrences(src)).toEqual([]);
  });

  test("a BLOCK-SCOPED constant is not resolved (module scope only)", () => {
    // Deliberate: name-keyed resolution across scopes produces both false negatives
    // and false positives, which is worse than a documented gap.
    const src = [
      "function f() {",
      '  const A = "/admin/onboarding/";',
      '  return A + "staged/" + id;',
      "}",
    ].join("\n");
    expect(classifyRetiredPathOccurrences(src)).toEqual([]);
  });
});

describe("the retired same-line predicate vs the new guard (spec §5 test 9)", () => {
  // The exact predicate step3DeletionSafety.test.ts used before this change.
  function oldSameLinePredicate(src: string): number {
    return src
      .split("\n")
      .filter((line) => line.includes("href") && line.includes(RETIRED) && !line.includes("/api/"))
      .length;
  }

  const HELPER_BUILT = [
    `function buildStagedUrl(id) { return \`${RETIRED}\${id}/x\`; }`,
    "const A = () => <Link href={buildStagedUrl(id)}>go</Link>;",
  ].join("\n");

  test("the old predicate is blind to it; the new resolver is not", () => {
    expect(oldSameLinePredicate(HELPER_BUILT)).toBe(0);
    expect(retiredHrefs(HELPER_BUILT)).toHaveLength(1);
  });
});
