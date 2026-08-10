/**
 * tests/sync/_metaVariantStageCensus.test.ts
 *
 * Plan Task 4 step 2 — spec `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` §3.
 *
 * THE PROBLEM:
 *   Variant generation (`generateDiagramVariants`, `lib/sync/diagramVariants.ts`)
 *   is a stage that runs BESIDE an original-byte upload. Nothing about uploading
 *   original bytes forces the stage to run: a NEW upload path that forgets it
 *   still produces a valid snapshot, still renders, and degrades only in
 *   performance — invisibly, forever. Per-path unit tests cannot catch the path
 *   nobody wrote a test for.
 *
 * THE GUARD:
 *   Every `upload(`-class call site under `lib/sync/**` — discovered by walking
 *   the directory FROM DISK, so a file added tomorrow is in scope by default and
 *   fails closed — must be one of:
 *
 *     (1) CENSUS-REGISTERED in `STAGE_RUNNING_FILES`, in which case a LIVE CALL
 *         to `generateDiagramVariants` must be reachable from the call site's
 *         enclosing function through the real call graph (directly, or via a
 *         helper the enclosing function calls — `lib/sync/snapshotAssets.ts`
 *         reaches it through `variantFieldsFor`); or
 *
 *     (2) EXEMPT, because the call site merely IMPLEMENTS a storage interface
 *         and passes bytes through — declared either by the inline marker
 *
 *             // no-variant-stage: <reason>
 *
 *         on the call's statement or on its enclosing function, or by an
 *         `EXEMPT_SITES` row here.
 *
 *   Marker convention follows the repo's established inline-exemption shape
 *   (`// not-subject-to-meta: <reason>` in `tests/notify/_metaInfraContract.test.ts:63`,
 *   `// no-telemetry: <reason>` in `tests/log/_metaMutationSurfaceObservability.test.ts`):
 *   a POSITIVE marker with a MANDATORY non-empty reason. A bare `// no-variant-stage:`
 *   does not exempt anything.
 *
 *   `EXEMPT_SITES` exists alongside the inline marker because the two adapter
 *   impls that need it predate this guard; either mechanism is accepted, and a
 *   registry row must match EXACTLY ONE live site, so converting a row to an
 *   inline marker is safe while a second same-named adapter appearing under one
 *   row is not (it fails as ambiguous rather than riding the row silently).
 *
 * WHY A CALL GRAPH AND NOT A TOKEN SCAN:
 *   A `source.includes("generateDiagramVariants")` guard passes on all four of
 *   the mutants below. Each has a test in this file, run against a temp copy of
 *   the REAL `lib/sync` tree with the mutation applied on disk:
 *
 *     (a) the stage call deleted from a registered site       → red
 *     (b) a new `lib/sync/**` file with `.upload(` and no stage → red
 *     (c) the callee renamed `generateDiagramVariantsX`        → red (suffix near-miss)
 *     (d) the token present but NOT LIVE — inside a block
 *         comment, and separately behind an `if (false)`       → red
 *
 * WHAT THIS GUARD DOES NOT CLAIM:
 *   It pins that the stage is REACHED, not that it is reached for the right
 *   bytes, in the right order, or that its output is persisted — those are the
 *   producer/hop suites' job (`tests/sync/snapshotAssets.test.ts`,
 *   `tests/sync/assetRecovery.test.ts`). Threat model: an ordinary contributor
 *   adding an upload path and not knowing about the stage. Deliberate
 *   obfuscation (aliasing the stage through an unrelated object, computing a
 *   callee name at runtime) is out of scope and files to documented limits.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";

// ---------------------------------------------------------------------------
// CENSUS (verified against the live tree 2026-08-09)
// ---------------------------------------------------------------------------

/** Directory walked from disk. Every `.ts`/`.tsx` under it is in scope. */
const SCAN_DIR = "lib/sync";

/** The stage the census is about. */
const STAGE_FILE = "lib/sync/diagramVariants.ts";
const STAGE_EXPORT = "generateDiagramVariants";

/**
 * Files whose upload call sites are LOGICAL upload surfaces: they own the
 * decision to persist original diagram bytes, so they own running the stage.
 *
 *   lib/sync/snapshotAssets.ts   — the embedded-image loop and the linked-folder
 *                                  loop, both reaching the stage through the
 *                                  shared `variantFieldsFor` helper, plus that
 *                                  helper's own upload of each generated variant.
 *   lib/sync/assetRecovery.ts    — the recovery upload of a recovered original.
 */
const STAGE_RUNNING_FILES = ["lib/sync/snapshotAssets.ts", "lib/sync/assetRecovery.ts"] as const;

/**
 * Call sites that merely IMPLEMENT the storage interface and forward bytes to
 * Supabase Storage. They are handed bytes by a registered surface above; running
 * the stage here would generate variants of variants.
 *
 * Keyed by file + the innermost enclosing function name. A row must match
 * exactly one discovered site.
 */
const EXEMPT_SITES: ReadonlyArray<{ file: string; fn: string; reason: string }> = [
  // Empty by design: both adapter impls carry the INLINE marker instead, where the
  // next person editing that upload call actually sees it. The registry form stays
  // available (and pinned by the tests below) for a site an inline comment cannot
  // reach.
];

/** Inline form of the same exemption. POSITIVE marker, MANDATORY reason. */
const EXEMPT_MARKER = /(?:^|\s)no-variant-stage:\s+\S/;

/**
 * Method names that write BYTES to storage. `upload` alone was not the closure:
 * the installed Supabase storage client also writes through `uploadToSignedUrl`,
 * so a new original-byte path could have used it and gone undiscovered — found by
 * cross-model review, probed against @supabase/storage-js (StorageFileApi).
 *
 * The client's third writer, `update`, is deliberately NOT here. The name is
 * indistinguishable at this level from `hash.update(...)` and the stream
 * `update` calls in lib/sync/boundedBytes.ts — adding it produced ten false
 * positives on the current tree, and a guard that cries wolf teaches people to
 * add exemptions, which is a worse outcome than the gap. Closing it properly
 * needs the callee's TYPE, not its name.
 *
 * DOCUMENTED LIMIT, deliberately not closed: reachability is computed from the
 * innermost enclosing FUNCTION, so adding a second, stage-less upload branch
 * inside a function that already calls the stage elsewhere satisfies the census.
 * Closing that needs per-call-site dataflow from the uploaded bytes back to a
 * stage result. Against the threat model here — an ordinary contributor adding a
 * new upload path, who overwhelmingly adds it as a new function or a new file —
 * the function-level relation catches the realistic shapes, and the tighter
 * analysis is a spec of its own.
 */
const BYTE_WRITE_CALLEES = new Set(["upload", "uploadToSignedUrl"]);

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

/** Recursive, from disk, sorted. A new file (or a new subdirectory) is covered
 *  by default — there is no file list to forget to update. */
function walkTsFiles(repoRoot: string, relDir: string): string[] {
  const abs = join(repoRoot, ...relDir.split("/"));
  if (!statSync(abs, { throwIfNoEntry: false })?.isDirectory()) return [];
  const out: string[] = [];
  const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const child = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkTsFiles(repoRoot, child));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(child);
  }
  return out;
}

// ---------------------------------------------------------------------------
// AST primitives
// ---------------------------------------------------------------------------

/** See through the wrappers that change nothing about the value. */
function unwrap(node: ts.Expression): ts.Expression {
  let cur: ts.Expression = node;
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur))
      cur = cur.expression;
    else return cur;
  }
}

/** The bare name of the thing being called, or undefined when unreadable. */
function calleeName(expr: ts.Expression): string | undefined {
  const c = unwrap(expr);
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  if (ts.isElementAccessExpression(c)) {
    const arg = c.argumentExpression;
    return ts.isStringLiteralLike(arg) ? arg.text : undefined;
  }
  return undefined;
}

/** `true`/`false` when the expression is a statically-known literal condition,
 *  `null` when the walker cannot know — deliberately conservative: an unknown
 *  condition is LIVE, so this can never silently erase a real call. */
function staticTruthiness(expr: ts.Expression): boolean | null {
  const e = unwrap(expr);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (e.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (e.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isNumericLiteral(e)) return Number(e.text) !== 0;
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text.length > 0;
  if (ts.isIdentifier(e) && e.text === "undefined") return false;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = staticTruthiness(e.operand as ts.Expression);
    return inner === null ? null : !inner;
  }
  return null;
}

/**
 * Mutant (d): the token is there, the code is not. A call inside `if (false)`,
 * `false && …`, `cond ? … : …` with a literal condition, or `while (false)` is
 * present in the AST but can never execute, so it must not satisfy the census.
 * (A call inside a COMMENT never reaches the AST at all — that half of (d) is
 * killed by parsing rather than by this function.)
 */
function isStaticallyDead(node: ts.Node): boolean {
  let child: ts.Node = node;
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isIfStatement(cur)) {
      const t = staticTruthiness(cur.expression);
      if (t === false && child === cur.thenStatement) return true;
      if (t === true && cur.elseStatement && child === cur.elseStatement) return true;
    } else if (ts.isConditionalExpression(cur)) {
      const t = staticTruthiness(cur.condition);
      if (t === false && child === cur.whenTrue) return true;
      if (t === true && child === cur.whenFalse) return true;
    } else if (ts.isBinaryExpression(cur)) {
      const op = cur.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken &&
        child === cur.right &&
        staticTruthiness(cur.left) === false
      )
        return true;
      if (
        op === ts.SyntaxKind.BarBarToken &&
        child === cur.right &&
        staticTruthiness(cur.left) === true
      )
        return true;
    } else if (ts.isWhileStatement(cur)) {
      if (staticTruthiness(cur.expression) === false && child === cur.statement) return true;
    }
    child = cur;
    cur = cur.parent;
  }
  return false;
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

/** The name a function-like is known by — its own, or the binding it is
 *  assigned to (`const f = () => {}`, `{ upload(…) {} }`). */
function functionName(node: FunctionLike, sf: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) {
    return node.name.getText(sf);
  }
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) {
    return parent.name.getText(sf);
  }
  return "<anonymous>";
}

/** Innermost function-like ancestor, or undefined at module scope. */
function enclosingFunction(node: ts.Node): FunctionLike | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (isFunctionLike(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/** Innermost statement ancestor — where a leading exemption comment would sit. */
function enclosingStatement(node: ts.Node): ts.Statement | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isStatement(cur)) return cur as ts.Statement;
    cur = cur.parent;
  }
  return undefined;
}

function commentTexts(text: string, node: ts.Node): string[] {
  const ranges = [
    ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
    ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
  ];
  return ranges.map((r) => text.slice(r.pos, r.end));
}

// ---------------------------------------------------------------------------
// Module graph
// ---------------------------------------------------------------------------

type ImportBinding = { specifier: string; exportName: string | null }; // null => namespace

type ModuleInfo = {
  file: string;
  text: string;
  sf: ts.SourceFile;
  /** local binding name -> imported module + export ("null" export = namespace) */
  imports: Map<string, ImportBinding>;
  /** top-level function-likes by declared name */
  functions: Map<string, FunctionLike>;
};

function collectModule(file: string, text: string): ModuleInfo {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Map<string, ImportBinding>();
  const functions = new Map<string, FunctionLike>();

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      // `import type { … }` conveys no runtime call edge and must not satisfy
      // the census.
      if (!clause || clause.isTypeOnly) continue;
      const specifier = stmt.moduleSpecifier.text;
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, { specifier, exportName: null });
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (el.isTypeOnly) continue;
          imports.set(el.name.text, {
            specifier,
            exportName: (el.propertyName ?? el.name).text,
          });
        }
      }
      if (clause.name) imports.set(clause.name.text, { specifier, exportName: "default" });
    }
  }

  // Top-level function declarations and `const f = () => {}` / `= function () {}`.
  const visitTop = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.getText(sf), node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (isFunctionLike(init)) functions.set(node.name.text, init);
    }
    ts.forEachChild(node, visitTop);
  };
  ts.forEachChild(sf, visitTop);

  return { file, text, sf, imports, functions };
}

function resolveSpecifier(fromFile: string, specifier: string, corpus: Set<string>): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1);
    for (const part of specifier.split("/")) {
      if (part === "." || part === "") continue;
      else if (part === "..") dir.pop();
      else dir.push(part);
    }
    base = dir.join("/");
  } else {
    return null; // package / node builtin — outside the corpus
  }
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (corpus.has(candidate)) return candidate;
  }
  return null;
}

type FnKey = string; // `${file}#${name}`

const STAGE_KEY: FnKey = `${STAGE_FILE}#${STAGE_EXPORT}`;

/**
 * Every function this body calls, resolved to a corpus function where the
 * callee is readable. Dead calls are dropped (mutant d); an unreadable callee
 * (`args.storage.upload`, a computed member) is simply not an edge.
 */
function liveCallTargets(body: ts.Node, mod: ModuleInfo, corpus: Set<string>): Set<FnKey> {
  const out = new Set<FnKey>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !isStaticallyDead(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee)) {
        const imported = mod.imports.get(callee.text);
        if (imported && imported.exportName !== null) {
          const target = resolveSpecifier(mod.file, imported.specifier, corpus);
          if (target) out.add(`${target}#${imported.exportName}`);
        } else if (mod.functions.has(callee.text)) {
          out.add(`${mod.file}#${callee.text}`);
        }
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const ns = mod.imports.get(callee.expression.text);
        if (ns && ns.exportName === null) {
          const target = resolveSpecifier(mod.file, ns.specifier, corpus);
          if (target) out.add(`${target}#${callee.name.text}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

type UploadSite = {
  file: string;
  line: number;
  fn: string;
  chain: string;
  exemptBy: "inline-marker" | "registry" | null;
  registered: boolean;
  reachesStage: boolean;
};

type ScanResult = {
  files: string[];
  sites: UploadSite[];
  registeredSites: UploadSite[];
  stageDeclared: boolean;
  violations: string[];
};

function scanRepo(
  repoRoot: string,
  exemptSites: ReadonlyArray<{ file: string; fn: string; reason: string }> = EXEMPT_SITES,
): ScanResult {
  const files = walkTsFiles(repoRoot, SCAN_DIR);
  const corpus = new Set(files);
  const modules = new Map<string, ModuleInfo>();
  for (const file of files) {
    modules.set(
      file,
      collectModule(file, readFileSync(join(repoRoot, ...file.split("/")), "utf8")),
    );
  }

  const stageModule = modules.get(STAGE_FILE);
  const stageDeclared = Boolean(stageModule?.functions.has(STAGE_EXPORT));

  // Call graph over the corpus, built lazily per function key.
  const edgeCache = new Map<FnKey, Set<FnKey>>();
  const edgesOf = (key: FnKey): Set<FnKey> => {
    const cached = edgeCache.get(key);
    if (cached) return cached;
    const [file = "", name = ""] = key.split("#");
    const mod = modules.get(file);
    const fn = mod?.functions.get(name);
    const edges = mod && fn ? liveCallTargets(fn, mod, corpus) : new Set<FnKey>();
    edgeCache.set(key, edges);
    return edges;
  };
  const reaches = (seeds: Set<FnKey>): boolean => {
    const seen = new Set<FnKey>();
    const queue = [...seeds];
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (key === STAGE_KEY) return true;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const next of edgesOf(key)) queue.push(next);
    }
    return false;
  };

  const sites: UploadSite[] = [];
  for (const file of files) {
    const mod = modules.get(file)!;
    const { sf, text } = mod;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && BYTE_WRITE_CALLEES.has(calleeName(node.expression) ?? "")) {
        const fnNode = enclosingFunction(node);
        const chainParts: string[] = [];
        for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
          if (isFunctionLike(cur)) chainParts.unshift(functionName(cur, sf));
        }
        const stmt = enclosingStatement(node);
        const marked = [
          ...(stmt ? commentTexts(text, stmt) : []),
          ...(fnNode ? commentTexts(text, fnNode) : []),
        ].some((c) => EXEMPT_MARKER.test(c));
        const registryRow = exemptSites.find(
          (row) => row.file === file && row.fn === (chainParts.at(-1) ?? "<module>"),
        );
        sites.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          fn: chainParts.at(-1) ?? "<module>",
          chain: chainParts.length > 0 ? chainParts.join(" > ") : "<module scope>",
          exemptBy: marked ? "inline-marker" : registryRow ? "registry" : null,
          registered: (STAGE_RUNNING_FILES as readonly string[]).includes(file),
          reachesStage: fnNode
            ? reaches(liveCallTargets(fnNode, mod, corpus))
            : reaches(liveCallTargets(sf, mod, corpus)),
        });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }

  const violations: string[] = [];
  for (const site of sites) {
    if (site.exemptBy) continue;
    const where = `${site.file}:${site.line} (upload call in \`${site.chain}\`)`;
    if (!site.registered) {
      violations.push(
        `${where} — upload surface is neither census-registered in STAGE_RUNNING_FILES ` +
          `nor exempt via a // no-variant-stage: <reason> comment or an EXEMPT_SITES row.`,
      );
    } else if (!site.reachesStage) {
      violations.push(
        `${where} — census-registered as a stage-running surface, but no LIVE call to ` +
          `${STAGE_EXPORT} (${STAGE_FILE}) is reachable from \`${site.fn}\`. ` +
          `A token in a comment, behind a false condition, or a near-miss name does not count.`,
      );
    }
  }

  // Stale-row checks: a census that outlives its subject stops meaning anything.
  for (const file of STAGE_RUNNING_FILES) {
    if (!sites.some((s) => s.file === file)) {
      violations.push(
        `${file} — STAGE_RUNNING_FILES row matches no discovered upload call site (stale census row).`,
      );
    }
  }
  for (const row of exemptSites) {
    const matched = sites.filter((s) => s.file === row.file && s.fn === row.fn);
    if (matched.length !== 1) {
      violations.push(
        `EXEMPT_SITES row {file: "${row.file}", fn: "${row.fn}"} matched ${matched.length} ` +
          `upload call sites (expected exactly 1) — a stale row, or an ambiguous one covering ` +
          `more sites than it was written for.`,
      );
    }
  }

  return {
    files,
    sites,
    registeredSites: sites.filter((s) => s.registered && !s.exemptBy),
    stageDeclared,
    violations: violations.sort(),
  };
}

// ---------------------------------------------------------------------------
// Mutation harness — a temp copy of the REAL tree, mutated on disk
// ---------------------------------------------------------------------------

function withMutatedTree(
  mutate: (root: string) => void,
  exemptSites: ReadonlyArray<{ file: string; fn: string; reason: string }> = EXEMPT_SITES,
): ScanResult {
  const root = mkdtempSync(join(tmpdir(), "variant-stage-census-"));
  try {
    mkdirSync(join(root, "lib"), { recursive: true });
    cpSync(join(process.cwd(), "lib", "sync"), join(root, "lib", "sync"), { recursive: true });
    mutate(root);
    return scanRepo(root, exemptSites);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SNAPSHOT_ASSETS = "lib/sync/snapshotAssets.ts";
const ASSET_RECOVERY = "lib/sync/assetRecovery.ts";

function readIn(root: string, rel: string): string {
  return readFileSync(join(root, ...rel.split("/")), "utf8");
}
function writeIn(root: string, rel: string, text: string): void {
  writeFileSync(join(root, ...rel.split("/")), text, "utf8");
}

/**
 * The mutation messages below are matched WITHOUT their line number: several
 * mutants shift the lines they are asserting about, and pinning the shifted
 * number would make the mutant test pass for the wrong reason.
 */
function unsatisfied(file: string, fn: string): RegExp {
  return new RegExp(
    `${file.replace(/[.]/g, "\\.")}:\\d+ \\(upload call in \`[^\`]*${fn}\`\\) — census-registered ` +
      `as a stage-running surface, but no LIVE call to ${STAGE_EXPORT}`,
  );
}

/** The first `generateDiagramVariants(...)` call in a source, as spans. */
function stageCallSpans(text: string): {
  call: [number, number];
  callee: [number, number];
  statement: [number, number];
} {
  const sf = ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === STAGE_EXPORT
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  if (!found) throw new Error(`no ${STAGE_EXPORT}(...) call found to mutate`);
  const stmt = enclosingStatement(found)!;
  return {
    call: [found.getStart(sf), found.getEnd()],
    callee: [found.expression.getStart(sf), found.expression.getEnd()],
    statement: [stmt.getStart(sf), stmt.getEnd()],
  };
}

function splice(text: string, [start, end]: [number, number], replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("variant-stage census (spec §3)", () => {
  test("every lib/sync upload surface runs the variant stage or declares an exemption", () => {
    const scan = scanRepo(process.cwd());

    // Premises: a walk that silently found nothing must fail loudly, not pass.
    premise("the filesystem walk over lib/sync/** found TypeScript sources", scan.files.length, 0);
    premise("the walk discovered upload call sites to classify", scan.sites.length, 0);
    premise(
      "the walk discovered census-registered (non-exempt) upload sites to check the stage against",
      scan.registeredSites.length,
      0,
    );
    premiseHolds(
      `${STAGE_EXPORT} is declared in ${STAGE_FILE} (the call graph has a stage node to reach)`,
      scan.stageDeclared,
    );

    expect(scan.violations).toEqual([]);
  });

  test("the walk recurses into subdirectories and covers a brand-new file by default", () => {
    const scan = withMutatedTree((root) => {
      mkdirSync(join(root, "lib", "sync", "nested", "deeper"), { recursive: true });
      writeFileSync(
        join(root, "lib", "sync", "nested", "deeper", "brandNew.ts"),
        "export const noop = 1;\n",
        "utf8",
      );
    });
    expect(scan.files).toContain("lib/sync/nested/deeper/brandNew.ts");
  });

  // -- Mutants ---------------------------------------------------------------

  test("(a) removing the stage call from a registered site reds the guard", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, SNAPSHOT_ASSETS);
      const spans = stageCallSpans(text);
      writeIn(root, SNAPSHOT_ASSETS, splice(text, spans.call, "STAGE_CALL_REMOVED_BY_MUTANT_A"));
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toMatch(unsatisfied(SNAPSHOT_ASSETS, "variantFieldsFor"));
    // The two ORIGINAL-byte uploads reach the stage only through that helper, so
    // deleting it strands them too — the reachability edge is real, not incidental.
    expect(scan.violations.join("\n")).toMatch(unsatisfied(SNAPSHOT_ASSETS, "snapshotAssets"));
  });

  test("(a') removing the stage call from the recovery site reds the guard", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, ASSET_RECOVERY);
      const spans = stageCallSpans(text);
      writeIn(root, ASSET_RECOVERY, splice(text, spans.call, "STAGE_CALL_REMOVED_BY_MUTANT_A"));
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toMatch(unsatisfied(ASSET_RECOVERY, "assetRecovery"));
  });

  test("(b) a new lib/sync file with an upload call, no stage and no exemption reds the guard", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      writeFileSync(
        join(root, "lib", "sync", "feed", "mutantNewUploadSurface.ts"),
        [
          "export async function persistOriginal(storage: { upload(p: string, b: Uint8Array): Promise<void> }) {",
          "  await storage.upload('diagram-snapshots/shows/x/y.png', new Uint8Array());",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toContain(
      "lib/sync/feed/mutantNewUploadSurface.ts:2 (upload call in `persistOriginal`) — " +
        "upload surface is neither census-registered",
    );
  });

  test("(c) a suffixed near-miss callee does not satisfy the census", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, SNAPSHOT_ASSETS);
      const spans = stageCallSpans(text);
      writeIn(root, SNAPSHOT_ASSETS, splice(text, spans.callee, `${STAGE_EXPORT}X`));
    });
    // The exact token `generateDiagramVariants` is still present in the file (the
    // import survives) — a substring scan passes here and this guard does not.
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toMatch(unsatisfied(SNAPSHOT_ASSETS, "variantFieldsFor"));
  });

  test("(c') renaming the import binding too does not satisfy the census either", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, SNAPSHOT_ASSETS).split(STAGE_EXPORT).join(`${STAGE_EXPORT}X`);
      writeIn(root, SNAPSHOT_ASSETS, text);
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
  });

  test("(d) the stage call inside a block comment does not satisfy the census", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, SNAPSHOT_ASSETS);
      const spans = stageCallSpans(text);
      const callText = text.slice(spans.call[0], spans.call[1]);
      writeIn(
        root,
        SNAPSHOT_ASSETS,
        splice(text, spans.call, `/* ${callText} */ STAGE_CALL_COMMENTED_OUT`),
      );
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toMatch(unsatisfied(SNAPSHOT_ASSETS, "variantFieldsFor"));
  });

  test("(d) the stage call behind an if (false) branch does not satisfy the census", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      const text = readIn(root, SNAPSHOT_ASSETS);
      const spans = stageCallSpans(text);
      const stmtText = text.slice(spans.statement[0], spans.statement[1]);
      writeIn(
        root,
        SNAPSHOT_ASSETS,
        splice(
          text,
          spans.statement,
          `if (false) {\n${stmtText}\n}\nconst result = { variants: [] };`,
        ),
      );
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toMatch(unsatisfied(SNAPSHOT_ASSETS, "variantFieldsFor"));
  });

  // -- Exemption mechanism ---------------------------------------------------

  test("an inline // no-variant-stage: <reason> marker exempts a new upload surface", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      writeFileSync(
        join(root, "lib", "sync", "mutantExemptSurface.ts"),
        [
          "export async function forward(storage: { upload(p: string, b: Uint8Array): Promise<void> }) {",
          "  // no-variant-stage: adapter impl, forwards bytes handed to it by a registered surface",
          "  await storage.upload('p', new Uint8Array());",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
    });
    expect(scan.violations).toEqual(baseline.violations);
  });

  test("a bare // no-variant-stage: with no reason does NOT exempt", () => {
    const baseline = withMutatedTree(() => {});
    const scan = withMutatedTree((root) => {
      writeFileSync(
        join(root, "lib", "sync", "mutantBareMarker.ts"),
        [
          "export async function forward(storage: { upload(p: string, b: Uint8Array): Promise<void> }) {",
          "  // no-variant-stage:",
          "  await storage.upload('p', new Uint8Array());",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
    });
    expect(scan.violations.length).toBeGreaterThan(baseline.violations.length);
    expect(scan.violations.join("\n")).toContain("lib/sync/mutantBareMarker.ts:3");
  });

  test("an EXEMPT_SITES row that matches a second same-named site fails as ambiguous", () => {
    // Supplies its OWN registry: both production adapters carry the inline marker, so
    // the live registry is empty and this row would otherwise assert nothing at all.
    const scan = withMutatedTree(
      (root) => {
        const path = join(root, "lib", "sync", "defaultSnapshotAssetsForApply.ts");
        const text = readFileSync(path, "utf8");
        writeFileSync(
          path,
          `${text}\nexport const second = {\n  async upload(p: string, b: Uint8Array) {\n    await other.upload(p, b);\n  },\n};\n`,
          "utf8",
        );
      },
      [
        {
          file: "lib/sync/defaultSnapshotAssetsForApply.ts",
          fn: "upload",
          reason: "registry-form exemption, exercised only by this row",
        },
      ],
    );
    expect(scan.violations.join("\n")).toContain(
      'EXEMPT_SITES row {file: "lib/sync/defaultSnapshotAssetsForApply.ts", fn: "upload"} matched 2',
    );
  });

  test("a STAGE_RUNNING_FILES row whose upload sites all vanished fails as stale", () => {
    const scan = withMutatedTree((root) => {
      const path = join(root, "lib", "sync", "snapshotAssets.ts");
      const text = readFileSync(path, "utf8").split(".upload(").join(".notUpload(");
      writeFileSync(path, text, "utf8");
    });
    expect(scan.violations.join("\n")).toContain(
      "lib/sync/snapshotAssets.ts — STAGE_RUNNING_FILES row matches no discovered upload call site",
    );
  });
});
