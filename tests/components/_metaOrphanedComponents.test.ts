// tests/components/_metaOrphanedComponents.test.ts
//
// Structural meta-test for the zero-production-importer class. Core + ledger
// live in tests/components/_orphanedComponents.ts; that file explains why test
// importers do not count and why both halves of the question come from the
// compiler rather than from a rule of ours.
//
// Discovery is a filesystem walk, so a NEW orphan fails by default rather than
// needing to be listed first. The allowlist is a debt ledger owned by
// BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS, not a mute button.
//
// Mutation families closed (spec 2026-08-02-copy-deadcode-sweep-design §3.3):
//   (a) a new orphaned component added with no allowlist row
//   (b) an allowlist row whose file no longer exists (stale row)
//   (c) a component that becomes orphaned when its last production importer goes
//   (d) an allowlist row for a file that DOES have production importers
//   (e) resolution fidelity — the cases that escaped seven rounds of home-made
//       rules, kept so that reintroducing one fails loudly. Every case is
//       end-to-end against real files, including the per-site resolution mode.
// (a)-(d) run against synthetic inputs so each proof stands whether or not the
// real tree contains an instance. (e) needs real files, because it asserts
// properties of the compiler's parser and resolver rather than of a map.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ORPHAN_ALLOWLIST,
  ROOT,
  compilerOptions,
  componentFiles,
  importedFiles,
  orphanScan,
  orphansOf,
  productionSourceFiles,
} from "@/tests/components/_orphanedComponents";

describe("orphaned-component guard (zero production importers)", () => {
  const { components, imported, orphans } = orphanScan();
  const allowed = new Set(ORPHAN_ALLOWLIST.map((row) => row.file));

  it("walks a non-trivial tree (so a green here is never vacuous)", () => {
    expect(components.length).toBeGreaterThan(100);
    expect(productionSourceFiles().length).toBeGreaterThan(100);
    expect(imported.size).toBeGreaterThan(100);
  });

  it("(a)+(c) every orphaned component is on the allowlist", () => {
    const unlisted = orphans.filter((file) => !allowed.has(file));
    expect(
      unlisted,
      "Component files no file under app/, components/, or lib/ imports. Delete them, " +
        "wire them up, or add an ORPHAN_ALLOWLIST row with a reason and a backlog id.",
    ).toEqual([]);
  });

  it("(b) no allowlist row points at a file that no longer exists", () => {
    const stale = ORPHAN_ALLOWLIST.filter((row) => !existsSync(join(ROOT, row.file))).map(
      (row) => row.file,
    );
    expect(stale, "Allowlist rows for deleted files — remove them.").toEqual([]);
  });

  it("(d) no allowlist row covers a file that now HAS production importers", () => {
    const live = ORPHAN_ALLOWLIST.filter((row) => existsSync(join(ROOT, row.file)))
      .filter((row) => imported.has(row.file))
      .map((row) => row.file);
    expect(
      live,
      "Allowlist rows no longer needed (the file is imported again) — remove them.",
    ).toEqual([]);
  });

  it("every allowlist row carries a reason and a backlog id, and no row repeats", () => {
    const thin = ORPHAN_ALLOWLIST.filter(
      (row) => row.reason.trim().length === 0 || !/^BL-[A-Z0-9-]+$/.test(row.backlog),
    ).map((row) => row.file);
    expect(thin, "Allowlist rows need a non-empty reason and a BL- backlog id.").toEqual([]);
    expect(new Set(ORPHAN_ALLOWLIST.map((r) => r.file)).size).toBe(ORPHAN_ALLOWLIST.length);
  });
});

describe("orphan bookkeeping (mutation families a-d, synthetic input)", () => {
  const target = "components/admin/Widget.tsx";

  it("(a) a component nothing imports is reported", () => {
    expect(orphansOf([target], new Set<string>())).toEqual([target]);
  });

  it("a component something imports is not reported", () => {
    expect(orphansOf([target], new Set([target]))).toEqual([]);
  });

  it("(c) it becomes reported when the last importer drops the import", () => {
    expect(orphansOf([target], new Set([target]))).toEqual([]);
    expect(orphansOf([target], new Set<string>())).toEqual([target]);
  });

  it("(d) a file with importers is not an orphan, which is what retires a row", () => {
    const other = "components/admin/Other.tsx";
    expect(orphansOf([target, other], new Set([other]))).toEqual([target]);
  });
});

describe("(e) resolution fidelity, against real files", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  });

  /** Build a throwaway project and return which of its components read as orphaned. */
  function scan(files: Record<string, string>): string[] {
    const root = mkdtempSync(join(tmpdir(), "orphan-guard-"));
    roots.push(root);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          module: "esnext",
          target: "esnext",
          jsx: "preserve",
          allowJs: true,
          resolveJsonModule: true,
          paths: { "@/*": ["./*"] },
        },
      }),
    );
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const options = compilerOptions(root);
    const imported = importedFiles(productionSourceFiles(root), options, root);
    return orphansOf(componentFiles(root), imported);
  }

  it("two components sharing a basename: importing one leaves the other reported", () => {
    expect(
      scan({
        "components/admin/Strip.tsx": "export const Strip = () => null;",
        "components/ghost/Strip.tsx": "export const Strip = () => null;",
        "app/page.tsx": 'import { Strip } from "@/components/admin/Strip";\nexport default Strip;',
      }),
    ).toEqual(["components/ghost/Strip.tsx"]);
  });

  it("a same-stem .ts/.tsx pair: only the one TypeScript picks is imported", () => {
    expect(
      scan({
        "components/Foo.ts": "export const Foo = 1;",
        "components/Foo.tsx": "export const Foo = () => null;",
        "app/page.tsx": 'import { Foo } from "@/components/Foo";\nexport default Foo;',
      }),
    ).toEqual(["components/Foo.tsx"]);
  });

  it("a file beside a same-named directory index: only the file is imported", () => {
    expect(
      scan({
        "components/Bar.tsx": "export const Bar = () => null;",
        "components/Bar/index.tsx": "export const Bar = () => null;",
        "app/page.tsx": 'import { Bar } from "@/components/Bar";\nexport default Bar;',
      }),
    ).toEqual(["components/Bar/index.tsx"]);
  });

  it("a substituted-extension specifier resolves the way the compiler resolves it", () => {
    // Under bundler resolution a .jsx specifier names the .tsx file.
    expect(
      scan({
        "components/Baz.tsx": "export const Baz = () => null;",
        "app/page.tsx": 'import { Baz } from "@/components/Baz.jsx";\nexport default Baz;',
      }),
    ).toEqual([]);
  });

  it("an import that exists only in a comment is not an import", () => {
    expect(
      scan({
        "components/Ghost.tsx": "export const Ghost = () => null;",
        "app/page.tsx":
          '// import { Ghost } from "@/components/Ghost";\nexport default () => null;',
      }),
    ).toEqual(["components/Ghost.tsx"]);
  });

  it("an import spelled inside a string literal is not an import", () => {
    expect(
      scan({
        "components/Ghost.tsx": "export const Ghost = () => null;",
        "app/page.tsx":
          "const s = 'import { Ghost } from \"@/components/Ghost\";';\nexport default () => s;",
      }),
    ).toEqual(["components/Ghost.tsx"]);
  });

  it("a dynamic-import call spelled as JSX text is not an import", () => {
    // ts.preProcessFile reports this one; the AST does not. It is the difference
    // between the compiler's scanner and the compiler's parser, and it is a
    // false-green direction, so it is the case this guard most needs to hold.
    expect(
      scan({
        "components/Ghost.tsx": "export const Ghost = () => null;",
        "app/page.tsx":
          'export default () => <div>{"x"}import("@/components/Ghost")</div>;'.replace('{"x"}', ""),
      }),
    ).toEqual(["components/Ghost.tsx"]);
  });

  it("a real dynamic import IS an import", () => {
    expect(
      scan({
        "components/Late.tsx": "export const Late = () => null;",
        "app/page.tsx": 'export default async () => (await import("@/components/Late")).Late;',
      }),
    ).toEqual([]);
  });

  it("a namespace re-export is an import", () => {
    expect(
      scan({
        "components/Ns.tsx": "export const Ns = () => null;",
        "components/barrel.ts": 'export * as Ns from "@/components/Ns";',
        "app/page.tsx": 'import { Ns } from "@/components/barrel";\nexport default Ns;',
      }),
    ).toEqual([]);
  });

  it("per-site resolution mode decides which local component an import lands on", () => {
    // The load-bearing case for ts.getModeForUsageLocation, end-to-end. A root
    // package.json `imports` map with require/import conditions points one
    // specifier at two DIFFERENT local components. A site annotated
    // `with { "resolution-mode": "require" }` must land on the require arm; drop
    // the per-site mode from the core and it lands on the import arm instead,
    // reversing which component is reported orphaned. Whole-diff review R1
    // flagged this as unpinned and R2 supplied this construction after a
    // seam-only pin proved too weak.
    expect(
      scan({
        "package.json": JSON.stringify({
          name: "orphan-guard-fixture",
          imports: {
            "#target": { require: "./components/Cjs.tsx", import: "./components/Esm.tsx" },
          },
        }),
        "components/Cjs.tsx": "export const X = () => null;",
        "components/Esm.tsx": "export const X = () => null;",
        "app/page.ts":
          'import type { X } from "#target" with { "resolution-mode": "require" };\n' +
          "export default null as unknown as X;",
      }),
    ).toEqual(["components/Esm.tsx"]);
  });

  it("a self-import does not rescue a component", () => {
    expect(
      scan({
        "components/Self.tsx": 'export * from "@/components/Self";',
        "app/page.tsx": "export default () => null;",
      }),
    ).toEqual(["components/Self.tsx"]);
  });
});
