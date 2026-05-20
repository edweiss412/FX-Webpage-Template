// Ambient module declaration for `.mdx` imports.
//
// M11 Phase E per-page smoke tests `await import("@/app/help/<slug>/page")`,
// resolving to a `.mdx` file via `vitest.config.ts` resolve.extensions +
// `@mdx-js/rollup`. The Vite/Vitest graph compiles them at runtime; TypeScript
// has no view into that pipeline, so without this declaration `tsc --noEmit`
// emits TS2307 ("Cannot find module") for every `.mdx` import.
//
// Production runtime is unchanged — Next.js's `@next/mdx` pipeline supplies its
// own typing via `mdx-components.tsx` + `next-env.d.ts`. This declaration is
// the test-graph counterpart.
declare module "*.mdx" {
  import type { ComponentType } from "react";
  const MDXComponent: ComponentType<Record<string, unknown>>;
  export default MDXComponent;
}
