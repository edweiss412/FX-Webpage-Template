// spec:lint CLI adapter (spec docs/superpowers/specs/2026-07-19-spec-lint.md §2/§7).
// All I/O lives here; the core under lib/specLint/** is pure and injected.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { splitLines } from "../lib/specLint/parse";
import { exitCodeForResult, runLint } from "../lib/specLint/run";
import type { FileResolver, LintResult } from "../lib/specLint/types";

export interface CliDeps {
  cwd(): string;
  repoRoot(): string;
  listTrackedFiles(): string[];
  lstatKind(p: string): "file" | "dir" | "symlink" | "missing";
  readFileBytes(p: string): Buffer;
  realpath(p: string): string;
}

interface CliOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// fs error codes that mean "this file is unreadable" (file-local, expected class);
// anything else thrown by readFileBytes on a cited read is an infra fault → exit 2.
const UNREADABLE_FS_CODES = new Set(["EACCES", "EPERM", "ENOENT", "EISDIR", "ELOOP", "ENOTDIR"]);

const contained = (real: string, root: string): boolean =>
  real === root || real.startsWith(root + sep);

function usage(json: boolean, msg: string): CliOutput {
  return {
    stdout: "",
    stderr: json ? JSON.stringify({ error: msg }) : msg,
    exitCode: 2,
  };
}

function renderText(result: LintResult): string {
  const out: string[] = [];
  out.push(`spec:lint ${result.doc}`);
  out.push(`kind: ${result.kind} (${result.kindSource})`);
  out.push("");
  const checks = ["document", "citations", "numerics", "copy", "sections"] as const;
  for (const check of checks) {
    const fs = result.findings.filter((f) => f.check === check);
    if (fs.length === 0) continue;
    out.push(`${check}:`);
    for (const f of fs) {
      out.push(
        `  ${f.severity === "fail" ? "FAIL" : "ADVISORY"} ${f.code} ${f.docLine}:${f.column} ${f.message}`,
      );
      if (f.detail !== undefined) out.push(`    detail: ${f.detail}`);
    }
  }
  if (result.inventory.length > 0) {
    out.push("INVENTORY");
    for (const g of result.inventory) {
      const n = g.occurrences.length;
      out.push(`  ${g.raw}: ${n} occurrence${n === 1 ? "" : "s"}`);
      for (const o of g.occurrences) out.push(`    ${o.docLine}:${o.column} ${o.snippet}`);
    }
  }
  const hard = result.findings.filter((f) => f.severity === "fail").length;
  const advisory = result.findings.length - hard;
  out.push(`summary: ${hard} hard, ${advisory} advisory`);
  return out.join("\n") + "\n";
}

export function runCli(argv: string[], deps: CliDeps): CliOutput {
  // ---- flag parse (full pass: --json registers as a flag even when a --kind value is missing) ----
  let json = false;
  let kindFlag: string | null = null;
  const positionals: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--json") {
      if (json) errors.push("duplicate --json");
      json = true;
    } else if (tok === "--kind") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        errors.push("--kind requires a value (spec|plan)"); // do NOT consume the next token
      } else {
        if (kindFlag !== null) errors.push("duplicate --kind");
        kindFlag = next;
        i++;
      }
    } else if (tok.startsWith("--")) {
      errors.push(`unknown flag: ${tok}`);
    } else {
      positionals.push(tok);
    }
  }
  if (kindFlag !== null && kindFlag !== "spec" && kindFlag !== "plan") {
    errors.push(`invalid --kind value: ${kindFlag}`);
  }
  if (positionals.length !== 1) {
    errors.push(`expected exactly one document path, got ${positionals.length}`);
  }
  if (errors.length > 0) return usage(json, errors.join("; "));

  try {
    const docArg = positionals[0]!;
    if (!docArg.endsWith(".md")) return usage(json, `not a markdown file: ${docArg}`);

    // Root discovery: EXACTLY ONCE, from the CLI's cwd — never from the doc's directory.
    const root = deps.repoRoot();

    const docAbs = isAbsolute(docArg) ? docArg : resolve(deps.cwd(), docArg);
    const kind = deps.lstatKind(docAbs);
    if (kind !== "file") return usage(json, `not a regular file (${kind}): ${docArg}`);
    let realDoc: string;
    try {
      realDoc = deps.realpath(docAbs);
    } catch {
      return usage(json, `cannot resolve document path: ${docArg}`);
    }
    if (!contained(realDoc, root)) {
      return usage(json, `document is outside the repository: ${docArg}`);
    }
    const repoRelPath = realDoc.slice(root.length + 1);

    let docKind: "spec" | "plan";
    let kindSource: "inferred" | "explicit";
    if (kindFlag !== null) {
      docKind = kindFlag as "spec" | "plan";
      kindSource = "explicit";
    } else {
      const inSpecs = ("/" + repoRelPath).includes("/specs/");
      const inPlans = ("/" + repoRelPath).includes("/plans/");
      if (inSpecs === inPlans) {
        return usage(
          json,
          inSpecs
            ? "path contains both /specs/ and /plans/; pass --kind spec|plan"
            : "cannot infer kind from path; pass --kind spec|plan",
        );
      }
      docKind = inSpecs ? "spec" : "plan";
      kindSource = "inferred";
    }

    let text: string;
    try {
      text = deps.readFileBytes(docAbs).toString("utf8"); // replacement decode
    } catch {
      return usage(json, `cannot read document: ${docArg}`);
    }

    const tracked = deps.listTrackedFiles();
    const resolver: FileResolver = {
      listTrackedFiles: () => tracked,
      readFileLines: (relPath: string): string[] | null => {
        const abs = join(root, relPath);
        if (deps.lstatKind(abs) !== "file") return null; // symlink, dir, missing
        let real: string;
        try {
          real = deps.realpath(abs);
        } catch {
          return null;
        }
        // §1.1 item 11 hard guarantee: cited content is NEVER read outside the repo
        // (a tracked child reached through a symlinked parent realpaths outside).
        if (!contained(real, root)) return null;
        try {
          return splitLines(deps.readFileBytes(abs).toString("utf8"));
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== undefined && UNREADABLE_FS_CODES.has(code)) return null;
          throw e; // infra fault → exit 2
        }
      },
    };

    const result = runLint(
      { text, repoRelPath, kind: docKind, kindSource },
      resolver,
    );
    return {
      stdout: json ? JSON.stringify(result) + "\n" : renderText(result),
      stderr: "",
      exitCode: exitCodeForResult(result),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      stdout: "",
      stderr: json ? JSON.stringify({ error: msg }) : msg,
      exitCode: 2,
    };
  }
}

// ---- Direct-run entry (not exercised by unit tests) ----
const isEntry = (() => {
  const a = process.argv[1];
  if (!a) return false;
  try {
    return import.meta.url === pathToFileURL(a).href;
  } catch {
    return false;
  }
})();

if (isEntry) {
  const deps: CliDeps = {
    cwd: () => process.cwd(),
    repoRoot: () =>
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: process.cwd(),
        encoding: "utf8",
      }).trim(),
    listTrackedFiles: () =>
      // ":/" pathspec = whole repo regardless of the cwd subdir
      execFileSync("git", ["ls-files", "-z", "--full-name", "--", ":/"], {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      })
        .split("\0")
        .filter((p) => p.length > 0),
    lstatKind: (p) => {
      const st = lstatSync(p, { throwIfNoEntry: false });
      if (!st) return "missing";
      if (st.isSymbolicLink()) return "symlink";
      if (st.isDirectory()) return "dir";
      return st.isFile() ? "file" : "missing";
    },
    readFileBytes: (p) => readFileSync(p),
    realpath: (p) => realpathSync(p),
  };
  const r = runCli(process.argv.slice(2), deps);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr + "\n");
  process.exit(r.exitCode);
}
