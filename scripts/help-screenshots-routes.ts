import { Node, Project, ScriptTarget, SyntaxKind } from "ts-morph";

/** What an interpolated span renders as in a normalized route. */
export const INTERPOLATION = "${...}";

/**
 * Every `route:` value in a manifest source, in declaration order.
 *
 * Parsed from the AST rather than by pattern, because four of the seven live
 * routes are template literals and a quote-only reader sees only three. That
 * omission is invisible on this manifest — all seven route under `/admin`, so
 * both readers derive the same roots — which is exactly why the route SET is
 * asserted alongside the roots.
 *
 * Interpolated spans normalize to `${...}`: their values are computed at
 * runtime, and the derivation only needs the static leading segment.
 */
export function parseManifestRoutes(source: string): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { target: ScriptTarget.ESNext },
  });
  const file = project.createSourceFile("manifest.ts", source);

  const routes: string[] = [];
  for (const assignment of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    if (assignment.getName() !== "route") continue;

    const initializer = assignment.getInitializer();
    if (initializer === undefined) continue;

    if (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) {
      routes.push(initializer.getLiteralText());
      continue;
    }

    if (Node.isTemplateExpression(initializer)) {
      const head = initializer.getHead().getLiteralText();
      const spans = initializer
        .getTemplateSpans()
        .map((span) => `${INTERPOLATION}${span.getLiteral().getLiteralText()}`)
        .join("");
      routes.push(`${head}${spans}`);
    }
  }

  return routes;
}

/**
 * The directories a manifest-derived guard scans: `components`, plus one
 * `app/<segment>` per distinct leading route segment.
 */
export function deriveScanRoots(routes: string[]): string[] {
  const roots = new Set<string>(["components"]);
  for (const route of routes) {
    const segment = route.split("/").filter(Boolean)[0];
    if (segment !== undefined && !segment.startsWith(INTERPOLATION)) {
      roots.add(`app/${segment}`);
    }
  }
  return [...roots].sort();
}
