import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { collectSurfaceUnits } from "./enumerate";
import { discoveryGaps } from "./totality";

function makeFixture(relPath: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), "totality-"));
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents, "utf8");
  return root;
}

const gapsFor = (rel: string, src: string): string[] => {
  const root = makeFixture(rel, src);
  return discoveryGaps([root], collectSurfaceUnits([root]));
};

/** A fixture tree of several files, for the cases one file cannot express. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "totality-tree-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  return root;
}

const gapsForTree = (files: Record<string, string>): string[] => {
  const root = makeTree(files);
  return discoveryGaps([root], collectSurfaceUnits([root]));
};

describe("discoveryGaps — the fail-closed residue (spec §3.4)", () => {
  test("anonymous JSX action → D2 refusal naming the file and the rewrite (spec §3.6 row 3)", () => {
    const gaps = gapsFor(
      "components/x/F.tsx",
      'export function F() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
    );
    expect(gaps).toHaveLength(1);
    // END-ANCHORED so an appended-suffix mutant dies (four-mutant discipline,
    // docs/agents/writing-plans.md). The path prefix is the tmpdir fixture
    // root, hence the leading wildcard.
    expect(gaps[0]).toMatch(
      /^.*components\/x\/F\.tsx: holds 1 function-scoped "use server" bodies but discovery accounted for 0 - bind each action to a named const or named function; anonymous actions cannot be keyed$/,
    );
  });

  test("anonymous action behind a directive PROLOGUE → D2 refusal (spec §3.6 row 8)", () => {
    const gaps = gapsFor(
      "components/x/H.tsx",
      'export function H() {\n  return <form action={async () => { "use strict"; "use server"; await db.from("t").delete(); }} />;\n}\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(/components\/x\/H\.tsx: holds 1 function-scoped "use server" bodies/);
  });

  test("unresolvable D1 export → refusal naming the export (spec §7 higher-order limit)", () => {
    const gaps = gapsFor(
      "lib/x/hof.ts",
      '"use server";\nexport const x = withFoo(async () => {});\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /^.*lib\/x\/hof\.ts: "use server" module export `x` produced no module-action unit - bind `x` directly to an async function declaration or arrow; discovery cannot statically locate the body behind this initializer$/,
    );
  });

  test("CROSS-DOMAIN COLLISION: unresolvable D1 export sharing a D2 inline unit's name still REFUSES (AC-7, spec-review R1)", () => {
    const gaps = gapsFor(
      "lib/x/e.ts",
      '"use server";\nexport const nested = withFoo(async () => {});\n' +
        'export async function outer() {\n  const nested = async () => { "use server"; await db.from("t").delete(); };\n  return nested;\n}\n',
    );
    // per-kind: the inline unit `nested` must NOT satisfy the module-side name.
    // END-ANCHORED on a DIFFERENT export name than the `x` above, so a message
    // that hardcodes its export name instead of interpolating it dies here
    // (that mutant survived the `x` fixture alone — pre-dispatch mutant 5).
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /^.*lib\/x\/e\.ts: "use server" module export `nested` produced no module-action unit - bind `nested` directly to an async function declaration or arrow; discovery cannot statically locate the body behind this initializer$/,
    );
  });

  test("duplicate file+fn key refuses by name (AC-6)", () => {
    const gaps = gapsFor(
      "lib/x/dup.ts",
      'export function A() {\n  const doIt = async () => { "use server"; };\n  return doIt;\n}\n' +
        'export function B() {\n  const doIt = async () => { "use server"; };\n  return doIt;\n}\n',
    );
    expect(
      gaps.some((g) =>
        /^.*lib\/x\/dup\.ts: 2 units share the key `doIt` - rename so every unit has a unique file\+fn key; registries cannot address two surfaces with one key$/.test(
          g,
        ),
      ),
    ).toBe(true);
  });

  test("a module-exported action whose body ALSO carries the directive is QUIET (the D2 side counts it)", () => {
    // Without the module-side directive-bearing count, the dedupe of Task 1
    // would leave this file reading 1 directive body against 0 inline units.
    expect(
      gapsFor(
        "lib/x/dd.ts",
        '"use server";\nexport const mutate = async () => { "use server"; await db.from("t").delete(); };\n',
      ),
    ).toEqual([]);
  });

  test("a fully discoverable module is QUIET (negative half)", () => {
    expect(
      gapsFor(
        "lib/x/ok.ts",
        '"use server";\nexport async function mutate() { await db.from("t").delete(); }\n',
      ),
    ).toEqual([]);
  });

  test("an ordinary file with no directive at all is QUIET", () => {
    expect(
      gapsFor("components/x/Plain.tsx", "export function Plain() {\n  return null;\n}\n"),
    ).toEqual([]);
  });

  test("a type-only export does not trip the D1 side", () => {
    expect(
      gapsFor(
        "lib/x/types.ts",
        '"use server";\nexport type Result = { ok: true };\nexport async function mutate() { await db.from("t").delete(); }\n',
      ),
    ).toEqual([]);
  });

  test("route files are exempt from the reconciliation (routes are D-neither)", () => {
    expect(gapsFor("app/api/x/route.ts", "export async function POST(){}\n")).toEqual([]);
  });

  // ── the counting contract, pinned where a plausible edit would move it ────

  test("a REPEATED directive in one prologue counts ONE body, not two", () => {
    // The prologue scan stops at the first match. Without that stop, a
    // copy-pasted duplicate directive inflates the count past the units and the
    // file refuses ITSELF — a false advisory on correct code, which is the one
    // outcome the consequence bound forbids.
    expect(
      gapsFor(
        "lib/x/dupdir.ts",
        '"use server";\nexport async function mutate() { "use server"; "use server"; await db.from("t").delete(); }\n',
      ),
    ).toEqual([]);
  });

  test("module units credit the D2 ledger ONLY when their own body carries the directive", () => {
    // Two module actions with NO body directive, plus one anonymous action. The
    // anonymous body must still refuse: crediting every module unit to the D2
    // side (or counting non-inline units as inline) would cover it and the
    // refusal would silently vanish.
    const gaps = gapsFor(
      "lib/x/mix.ts",
      '"use server";\nexport async function outer() { await db.from("t").delete(); }\n' +
        'export async function host() { register(async () => { "use server"; await db.from("t").delete(); }); }\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /lib\/x\/mix\.ts: holds 1 function-scoped "use server" bodies but discovery accounted for 0/,
    );
  });

  test("two export names resolving to ONE body credit the D2 ledger ONCE", () => {
    // `export { impl as one, impl as two }` yields two module units sharing one
    // node. Counting UNITS credited that body twice, which covered the unrelated
    // anonymous action below and made its refusal vanish (round-1 finding 2).
    const gaps = gapsFor(
      "lib/x/aliasdup.ts",
      '"use server";\nconst impl = async () => { "use server"; await db.from("t").delete(); };\n' +
        "export { impl as one, impl as two };\n" +
        'export async function host() { register(async () => { "use server"; await db.from("t").delete(); }); }\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /lib\/x\/aliasdup\.ts: holds 2 function-scoped "use server" bodies but discovery accounted for 1/,
    );
  });

  test("vendored and build-output trees are NOT walked (node_modules, .next, .git)", () => {
    // `walkSourceFiles` itself skips none of these, so the filter here is the
    // only thing standing between the reconciliation and every dependency in
    // node_modules — which would refuse by the thousand on code nobody here wrote.
    expect(
      gapsForTree({
        "lib/x/ok3.ts":
          '"use server";\nexport async function mutate() { await db.from("t").delete(); }\n',
        "node_modules/pkg/dark.tsx":
          'export function D() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
        ".next/server/dark.tsx":
          'export function D() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
        ".git/hooks/dark.tsx":
          'export function D() {\n  return <form action={async () => { "use server"; await db.from("t").delete(); }} />;\n}\n',
      }),
    ).toEqual([]);
  });
});

describe("round-2 refusals reach the ledger by NAME, not silently (diff review round 2)", () => {
  test("a reassigned `let` export is REFUSED by name, not resolved to the stale body", () => {
    const gaps = gapsFor(
      "lib/x/reassigned.ts",
      '"use server";\nlet doIt = async () => {};\ndoIt = async () => { await db.from("t").delete(); };\nexport { doIt };\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /^.*lib\/x\/reassigned\.ts: "use server" module export `doIt` produced no module-action unit - bind `doIt` directly to an async function declaration or arrow; discovery cannot statically locate the body behind this initializer$/,
    );
  });

  test("a mutated object holder is REFUSED by name", () => {
    const gaps = gapsFor(
      "lib/x/holder.ts",
      '"use server";\nconst bag = { doIt: async () => {} };\nbag.doIt = async () => { await db.from("t").delete(); };\nexport const { doIt } = bag;\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("`doIt` produced no module-action unit");
  });

  test("`export { m as default }` is refused under the name `default`", () => {
    // The ratified default contract: NO unit, and refused by name. Before the
    // repair this produced a unit keyed `default` and no gap at all.
    const gaps = gapsFor(
      "lib/x/clausedefault.ts",
      '"use server";\nconst doIt = async () => { await db.from("t").delete(); };\nexport { doIt as default };\n',
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(
      /^.*lib\/x\/clausedefault\.ts: "use server" module export `default` produced no module-action unit - bind `default` directly to an async function declaration or arrow; discovery cannot statically locate the body behind this initializer$/,
    );
  });
});
