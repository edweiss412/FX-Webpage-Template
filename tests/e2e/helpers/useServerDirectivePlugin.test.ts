// Contract test for the shared "use server" directive plugin (PR-C / C1).
//
// The BUILD BOUNDARY is the contract (plan-R1 F13): every fixture is bundled
// through a REAL esbuild.build with the plugin installed, and we assert on the
// emitted bundle text / build errors — not on analyzeModule's return value in
// isolation. A directive-carrying server module must be replaced by a stub that
// throws for each export (never shipping the server body to the browser); a
// module with no directive must bundle its real body unchanged; an unsupported
// export shape or a parse diagnostic in a directive module must FAIL the build.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeModule, useServerDirectivePlugin } from "./useServerDirectivePlugin.mjs";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

const FIX = resolve(__dirname, "__fixtures__/directive");
const fixture = (name: string) => join(FIX, `${name}.ts`);

/**
 * Bundle a single fixture through real esbuild with the plugin. Returns the
 * emitted text (on success) or the joined build-error text (on failure).
 */
async function bundleFixture(
  name: string,
  pluginOpts?: { disabled?: boolean },
): Promise<{ ok: boolean; output: string; errors: string }> {
  const dir = mkdtempSync(join(tmpdir(), "directive-fix-"));
  const entry = join(dir, "entry.ts");
  writeFileSync(entry, `import * as m from ${JSON.stringify(fixture(name))};\nconsole.log(m);\n`);
  try {
    const r = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "iife",
      logLevel: "silent",
      // Not a React hook — an esbuild plugin factory that the spec/plan names
      // useServerDirectivePlugin; the "use" prefix trips react-hooks/rules-of-hooks.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      plugins: [useServerDirectivePlugin(pluginOpts)],
    });
    return { ok: true, output: r.outputFiles.map((f) => f.text).join("\n"), errors: "" };
  } catch (e: unknown) {
    const err = e as { errors?: Array<{ text?: string }>; message?: string };
    const errors = Array.isArray(err.errors)
      ? err.errors.map((m) => m.text ?? "").join("\n")
      : String(err.message ?? e);
    return { ok: false, output: "", errors };
  }
}

// name -> { exports it stubs (runtime), its body sentinel }
const SUPPORTED: Record<string, { exports: string[]; sentinel: string }> = {
  namedDecl: { exports: ["f"], sentinel: "NAMED_BODY_SENTINEL" },
  defaultNamed: { exports: ["default"], sentinel: "DEFN_BODY_SENTINEL" },
  defaultAnon: { exports: ["default"], sentinel: "DEFA_BODY_SENTINEL" },
  arrowConst: { exports: ["h"], sentinel: "ARROW_BODY_SENTINEL" },
  fnExprConst: { exports: ["k"], sentinel: "FNEX_BODY_SENTINEL" },
  singleQuote: { exports: ["f"], sentinel: "SQ_BODY_SENTINEL" },
  escapedSpace: { exports: ["f"], sentinel: "ESC_BODY_SENTINEL" },
};

const UNSUPPORTED = [
  "reexportFrom",
  "starExport",
  "aliasedLocal",
  "syncConst",
  "classDecl",
  "syncFn",
  "octalEscape",
  "trailingGarbage",
];

describe("useServerDirectivePlugin — supported server modules are stubbed at the build boundary", () => {
  for (const [name, { exports, sentinel }] of Object.entries(SUPPORTED)) {
    it(`${name}: bundle throws for each export and drops the server body`, async () => {
      const { ok, output } = await bundleFixture(name);
      expect(ok, `${name} should build`).toBe(true);
      for (const ex of exports) {
        expect(output, `${name} stub must name export ${ex}`).toContain(
          `server action export ${ex} is not callable`,
        );
      }
      expect(output, `${name} server body must NOT ship`).not.toContain(sentinel);
    });
  }

  it("typeOnly: empty stub — neither a throw nor a body ships", async () => {
    const { ok, output } = await bundleFixture("typeOnly");
    expect(ok).toBe(true);
    expect(output).not.toContain("server action export");
    expect(output).not.toContain("BODY_SENTINEL");
  });
});

describe("useServerDirectivePlugin — modules without a real directive bundle unchanged", () => {
  it("noDirective: real body ships", async () => {
    const { ok, output } = await bundleFixture("noDirective");
    expect(ok).toBe(true);
    expect(output).toContain("PLAIN_BODY_SENTINEL");
  });

  it("nestedString: 'use server' inside a value/comment is NOT a directive; real body ships", async () => {
    const { ok, output } = await bundleFixture("nestedString");
    expect(ok).toBe(true);
    expect(output).toContain("NESTED_BODY_SENTINEL");
  });
});

describe("useServerDirectivePlugin — unsupported shapes and parse diagnostics FAIL the build", () => {
  for (const name of UNSUPPORTED) {
    it(`${name}: build fails and the error names the module`, async () => {
      const { ok, errors } = await bundleFixture(name);
      expect(ok, `${name} should fail the build`).toBe(false);
      expect(errors, `${name} error must name the module`).toContain(name);
    });
  }
});

describe("useServerDirectivePlugin — the positive assertions can fail (mutation guard)", () => {
  it("disabled:true lets the server body leak — proving the stub is what removes it", async () => {
    const { ok, output } = await bundleFixture("namedDecl", { disabled: true });
    expect(ok).toBe(true);
    expect(output).toContain("NAMED_BODY_SENTINEL");
    expect(output).not.toContain("server action export f is not callable");
  });
});

describe("step3 bundler consumes the shared plugin (C3 behavioral pin)", () => {
  it("the step3 child stubs an escape-spelled directive the OLD regex resolver missed", () => {
    // The deleted regex resolver raw-matched /^["']use server["']/ and did NOT
    // stub "use\\x20server"; the shared plugin cooks the escape and does. Running
    // the ACTUAL step3 child (not the plugin in isolation) proves the swap landed
    // — a behavioral pin, not an identifier pin that a rename would survive.
    const work = mkdtempSync(join(tmpdir(), "step3-directive-"));
    const entry = join(work, "entry.tsx");
    writeFileSync(
      entry,
      `import * as m from ${JSON.stringify(fixture("escapedSpace"))};\nconsole.log(m);\n`,
    );
    const outFile = join(work, "bundle.js");
    execFileSync(
      "node",
      [
        join(REPO_ROOT, "tests/e2e/_step3ReviewModalBundle.mjs"),
        entry,
        outFile,
        join(REPO_ROOT, "tsconfig.json"),
      ],
      { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
    );
    const bundle = readFileSync(outFile, "utf8");
    expect(bundle).toContain("server action export f is not callable");
    expect(bundle).not.toContain("ESC_BODY_SENTINEL");
  }, 120_000);
});

describe("analyzeModule — pure core classification (spec §5.1-§5.2)", () => {
  it("classifies a named async export as a directive stub", () => {
    const r = analyzeModule("x.ts", '"use server";\nexport async function f() { return 1; }\n');
    expect(r.directive).toBe(true);
    expect("stub" in r && typeof r.stub === "string").toBe(true);
  });

  it("classifies a module with no directive as directive:false", () => {
    const r = analyzeModule("x.ts", "export const a = 1;\n");
    expect(r).toEqual({ directive: false });
  });

  it("classifies an octal-escape directive (parse diagnostic) as an error, not a stub", () => {
    const r = analyzeModule("x.ts", '"use\\040server";\nexport async function f() {}\n');
    expect(r.directive).toBe(true);
    expect("error" in r).toBe(true);
  });
});
