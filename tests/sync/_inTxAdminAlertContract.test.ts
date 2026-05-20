import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

type FunctionRecord = {
  name: string;
  file: string;
  node: ts.FunctionDeclaration;
  body: string;
};

const GLOBAL_FALLBACK_RE = /\?\?\s*default[A-Z][A-Za-z]*(?:Alert|Client)\b/g;
const ALLOW_FALLBACK_RE = /in-tx-allowed-fallback:\s*[^\n]+/;

function sourceText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return sourceFile.text.slice(node.getStart(sourceFile), node.getEnd());
}

function collectSyncFunctions(): Map<string, FunctionRecord> {
  const functions = new Map<string, FunctionRecord>();

  for (const file of walkSourceFiles(["lib/sync"])) {
    const text = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        functions.set(node.name.text, {
          name: node.name.text,
          file,
          node,
          body: sourceText(node.body, sourceFile),
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return functions;
}

function hasTxContract(record: FunctionRecord): boolean {
  const signature = record.node
    .getChildren()
    .filter((child) => !ts.isBlock(child))
    .map((child) => child.getText())
    .join(" ");
  return /\b(?:LockedShowTx|SyncPipelineTx)\b/.test(signature);
}

function calledFunctionNames(record: FunctionRecord, knownNames: ReadonlySet<string>): string[] {
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (knownNames.has(name)) names.add(name);
    }
    ts.forEachChild(node, visit);
  };

  if (record.node.body) visit(record.node.body);
  return [...names].sort();
}

function inTransactionFunctions(
  functions: Map<string, FunctionRecord>,
): Map<string, FunctionRecord> {
  const knownNames = new Set(functions.keys());
  const marked = new Set<string>();
  const queue: string[] = [];

  for (const record of functions.values()) {
    if (hasTxContract(record)) {
      marked.add(record.name);
      queue.push(record.name);
    }
  }

  while (queue.length > 0) {
    const name = queue.shift() as string;
    const record = functions.get(name);
    if (!record) continue;

    for (const callee of calledFunctionNames(record, knownNames)) {
      if (marked.has(callee)) continue;
      marked.add(callee);
      queue.push(callee);
    }
  }

  return new Map(
    [...marked]
      .map((name) => [name, functions.get(name)])
      .filter((entry): entry is [string, FunctionRecord] => Boolean(entry[1])),
  );
}

function fallbackFindings(): string[] {
  const functions = inTransactionFunctions(collectSyncFunctions());
  const findings: string[] = [];

  for (const record of functions.values()) {
    if (ALLOW_FALLBACK_RE.test(record.body)) continue;
    for (const match of record.body.matchAll(GLOBAL_FALLBACK_RE)) {
      const line =
        readFileSync(record.file, "utf8")
          .slice(0, record.node.body?.getStart() ?? 0)
          .split("\n").length +
        record.body.slice(0, match.index).split("\n").length -
        1;
      findings.push(`${record.file}:${line}:${record.name}:${match[0]}`);
    }
  }

  return findings.sort();
}

describe("META in-transaction admin alert contract", () => {
  test("sync functions running under a locked transaction do not fall back to global clients", () => {
    expect(fallbackFindings()).toEqual([]);
  });
});
