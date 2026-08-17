/**
 * The fail-closed residue of surface discovery (invariant 10, spec §3.4).
 *
 * `collectSurfaceUnits` accepts two derived domains — D1, every exported value
 * name of a `"use server"` module; D2, every function-like whose block body
 * opens with the directive. This module reconciles both against the units that
 * were actually produced and REFUSES the remainder BY NAME. There is no third
 * outcome: a construct is a keyed unit, or it is a named diagnostic. Nothing is
 * silently absent from both sides, which is the dark-mutation-surface hole
 * invariant 10 exists to prevent.
 *
 * A refusal is the DESIGNED outcome for an unnameable or statically
 * unresolvable form, not a gap — it is how such a form "becomes a nameable
 * unit": the contributor gives it a name. Every message therefore states the
 * rewrite, because a diagnostic that only reports is a diagnostic somebody
 * suppresses.
 */

import { basename } from "node:path";
import ts from "typescript";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import {
  exportedValueNames,
  functionBodyHasUseServer,
  moduleHasUseServer,
  parse,
  type SurfaceUnit,
} from "./enumerate";

/**
 * How many function-scoped `"use server"` bodies a file holds — the D2 domain.
 *
 * Total by CONSTRUCTION rather than by enumeration, in both directions, because
 * diff review round 2 of the origin arc defeated the enumerated version twice:
 *
 * - `ts.isFunctionLike` instead of a four-way kind check, so a getter, a
 *   setter, a static class method, and any function-like TypeScript grows later
 *   are all counted without this file naming them.
 * - the whole leading run of string-literal statements instead of index 0,
 *   because Next reads the full directive prologue — `"use strict"; "use
 *   server";` is a Server Action, and a statement-zero check called it nothing.
 */
export function inlineDirectiveBearingCount(sf: ts.SourceFile): number {
  let n = 0;
  const visit = (node: ts.Node): void => {
    // `isFunctionLike` is the TOTAL predicate — every function-like kind, named
    // or not, including ones TypeScript grows later — so the count is not an
    // enumeration this file has to keep current. It also admits call /
    // construct / index signatures, which carry no body; those read `undefined`
    // here and are skipped, which is why the cast is safe rather than a widening.
    const body = ts.isFunctionLike(node)
      ? ((node as ts.FunctionLikeDeclaration).body ?? undefined)
      : undefined;
    if (body && ts.isBlock(body)) {
      for (const st of body.statements) {
        // The prologue ends at the first non-string-literal statement.
        if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
        if (st.expression.text === "use server") {
          n += 1;
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** True when this unit's own node IS a D2 body — a module export whose
 * resolved function also carries the directive. Such a node is counted by
 * `inlineDirectiveBearingCount` but produced NO inline-action unit (Task 1's
 * node-identity dedupe claimed it for the module side), so the D2 ledger has to
 * credit it or every such file would refuse itself. A `SourceFile` node — route
 * units — never reaches here; routes are skipped before this is called. */
function bodyHasDirective(node: ts.Node): boolean {
  return ts.isFunctionLike(node) && functionBodyHasUseServer(node as ts.FunctionLikeDeclaration);
}

/**
 * Every construct discovery could not turn into a unit — one message per
 * offender, empty when discovery was total over `roots`.
 *
 * PER-KIND, not pooled (spec §3.4): D1 names reconcile against MODULE-ACTION
 * units only; the D2 count reconciles against inline-action units plus
 * module-action units whose resolved node is itself a directive-bearing body. A
 * pooled projection over all of a file's unit names lets an inline unit MASK an
 * unresolved export that happens to share its name — probed in spec review R1
 * against the origin test's private copy, which read `found.map((u) => u.fn)`
 * across all kinds and reported zero problems for exactly that file.
 */
export function discoveryGaps(roots: string[], units: readonly SurfaceUnit[]): string[] {
  const problems: string[] = [];
  const byFile = new Map<string, SurfaceUnit[]>();
  for (const u of units) byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);

  for (const file of walkSourceFiles(roots).filter(
    (f) => !f.includes("/node_modules/") && !f.includes("/.next/") && !f.includes("/.git/"),
  )) {
    if (basename(file) === "route.ts") continue;
    const sf = parse(file);
    const found = byFile.get(file) ?? [];
    const moduleUnits = found.filter((u) => u.kind === "module-action");
    const inlineUnits = found.filter((u) => u.kind === "inline-action");

    if (moduleHasUseServer(sf)) {
      const discovered = new Set(moduleUnits.map((u) => u.fn));
      for (const name of exportedValueNames(sf))
        if (!discovered.has(name))
          problems.push(
            `${file}: "use server" module export \`${name}\` produced no module-action unit - ` +
              `bind \`${name}\` directly to an async function declaration or arrow; discovery ` +
              `cannot statically locate the body behind this initializer`,
          );
    }

    const directiveBodies = inlineDirectiveBearingCount(sf);
    const accounted =
      inlineUnits.length + moduleUnits.filter((u) => bodyHasDirective(u.node)).length;
    if (directiveBodies > accounted)
      problems.push(
        `${file}: holds ${directiveBodies} function-scoped "use server" bodies but discovery ` +
          `accounted for ${accounted} - bind each action to a named const or named function; ` +
          `anonymous actions cannot be keyed`,
      );

    const seen = new Map<string, number>();
    for (const u of found) seen.set(u.fn, (seen.get(u.fn) ?? 0) + 1);
    for (const [fn, n] of seen)
      if (n > 1)
        problems.push(
          `${file}: ${n} units share the key \`${fn}\` - rename so every unit has a unique ` +
            `file+fn key; registries cannot address two surfaces with one key`,
        );
  }
  return problems;
}
