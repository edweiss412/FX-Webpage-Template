/**
 * scripts/execution-methods/lib.ts
 *
 * Pure derivation of postgres.js execution methods from a type-declaration
 * SOURCE STRING (spec docs/superpowers/specs/2026-08-16-execution-methods-driver-derived-design.md §2.1).
 * Walk domain: interface declarations only -- a method signature inside a type
 * literal (the driver's toJSON node) is deliberately never a candidate.
 * Consumers: scripts/generate-execution-methods.ts and the guard suite.
 * Enrolled in tests/mutation/source/registry.ts (executionMethodsDerivation).
 */
import ts from "typescript";

export type ExecutionMethodDerivation = {
  /** Method members whose declared return-type head is PendingQuery | PendingRequest | ListenRequest. */
  core: string[];
  /** Method members whose declared return-type head is Parameter | ArrayParameter. */
  parameterMembers: string[];
};

const CORE_HEADS = new Set(["PendingQuery", "PendingRequest", "ListenRequest"]);
const PARAMETER_HEADS = new Set(["Parameter", "ArrayParameter"]);

/** Rightmost identifier of a type reference's name; null for any other annotation shape. */
function headIdentifier(type: ts.TypeNode | undefined): string | null {
  if (type === undefined || !ts.isTypeReferenceNode(type)) return null;
  let name: ts.EntityName = type.typeName;
  while (ts.isQualifiedName(name)) name = name.right;
  return name.text;
}

export function deriveExecutionMethods(dtsSource: string): ExecutionMethodDerivation {
  const sf = ts.createSourceFile(
    "driver.d.ts",
    dtsSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const core = new Set<string>();
  const parameterMembers = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isInterfaceDeclaration(n)) {
      for (const member of n.members) {
        if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) continue;
        const head = headIdentifier(member.type);
        if (head === null) continue;
        if (CORE_HEADS.has(head)) core.add(member.name.text);
        else if (PARAMETER_HEADS.has(head)) parameterMembers.add(member.name.text);
      }
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return { core: [...core].sort(), parameterMembers: [...parameterMembers].sort() };
}
