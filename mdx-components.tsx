// mdx-components.tsx
import type { MDXComponents } from "mdx/types";
import { Callout } from "@/app/help/_components/Callout";
import { Step } from "@/app/help/_components/Step";
import { Screenshot } from "@/app/help/_components/Screenshot";
import { ScreenshotPlaceholder } from "@/app/help/_components/ScreenshotPlaceholder";
import { RefAnchor } from "@/app/help/_components/RefAnchor";
import { TipFromSheets } from "@/app/help/_components/TipFromSheets";

/**
 * M11 Phase A — required by @next/mdx App Router integration.
 *
 * Returns the global MDX component overrides used by every .mdx file under
 * app/help/. Phase D registers the help-specific components (Callout, Step,
 * Screenshot, ScreenshotPlaceholder, RefAnchor, TipFromSheets) so that .mdx
 * files can use them by name without per-file imports.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Callout,
    Step,
    Screenshot,
    ScreenshotPlaceholder,
    RefAnchor,
    TipFromSheets,
  };
}
