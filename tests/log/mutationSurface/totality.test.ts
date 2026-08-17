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
});
