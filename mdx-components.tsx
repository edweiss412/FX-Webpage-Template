// mdx-components.tsx
import type { MDXComponents } from "mdx/types";

/**
 * M11 Phase A — required by @next/mdx App Router integration.
 *
 * Returns the global MDX component overrides used by every .mdx file under
 * app/help/. Phase D will add the help-specific components (Callout, Step,
 * Screenshot, etc.) by extending the returned object.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    // Phase D will register Callout / Step / Screenshot / RefAnchor / TipFromSheets here.
  };
}
