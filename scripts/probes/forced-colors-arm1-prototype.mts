import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { scanInteractiveElements } from "../../tests/styles/interactiveScanCore";

const ROOT = "/Users/ericweiss/FX-worktrees/forcedcolors";
const CSS = join(ROOT, "app/globals.css");

// Properties forced onto the palette or dropped entirely (probe M1-M12).
const NOT_AUTHOR_CONTROLLED = new Set([
  "color",
  "background-color",
  "border-color",
  "outline-color",
  "fill",
  "stroke",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "column-rule-color",
  "text-decoration-color",
  "-webkit-text-fill-color",
  "box-shadow",
  "text-shadow",
  "--tw-ring-color",
  "--tw-ring-shadow",
  "--tw-shadow",
  "--tw-shadow-color",
  "--tw-ring-offset-color",
  "--tw-ring-offset-shadow",
  "--tw-inset-shadow",
  "--tw-inset-ring-shadow",
  "--tw-inset-ring-color",
  "accent-color",
  "caret-color",
  "background-image",
]);

async function main() {
  const ds = await __unstable__loadDesignSystem(readFileSync(CSS, "utf8"), {
    base: dirname(CSS),
    loadStylesheet: async (id: string, base: string) => {
      // Same shape as tests/styles/controlOutlineResidue.ts:150-155; the design
      // system requires `path` on the returned stylesheet.
      const path =
        id.startsWith(".") || id.startsWith("/")
          ? resolve(base, id)
          : createRequire(import.meta.url).resolve(id.includes("/") ? id : `${id}/index.css`);
      return { base: dirname(path), content: readFileSync(path, "utf8"), path };
    },
  });

  const els = scanInteractiveElements(ROOT, { textEntry: true, paintedChildren: true });
  const allTokens = [
    ...new Set(
      els
        .flatMap((e) => e.paths.flat())
        .flatMap((s) => s.split(/\s+/))
        .filter(Boolean),
    ),
  ];
  const css = ds.candidatesToCss(allTokens);

  // A token SURVIVES if the CSS it emits declares at least one property that is not
  // in NOT_AUTHOR_CONTROLLED. A token emitting nothing (unknown) survives, conservatively.
  const survives = new Map<string, boolean>();
  allTokens.forEach((t, i) => {
    const emitted = css[i];
    if (!emitted) {
      survives.set(t, true);
      return;
    }
    const props = [...emitted.matchAll(/(^|[{;\s])([-a-zA-Z]+)\s*:/g)]
      .map((m) => m[2])
      .filter((x): x is string => x !== undefined);
    survives.set(t, props.length === 0 || props.some((p) => !NOT_AUTHOR_CONTROLLED.has(p)));
  });
  console.log(
    "tokens:",
    allTokens.length,
    " surviving:",
    [...survives.values()].filter(Boolean).length,
  );

  const project = (path: string[]) =>
    path
      .flatMap((s) => s.split(/\s+/))
      .filter((t) => t && survives.get(t) !== false)
      .sort()
      .join(" ");

  const collapses: { file: string; line: number; tag: string; paths: number; as: string }[] = [];
  for (const el of els) {
    const uniq = new Set(el.paths.map((p) => p.join(" ")));
    if (uniq.size < 2) continue;
    const projs = new Set(el.paths.map(project));
    if (projs.size < uniq.size)
      collapses.push({
        file: el.file,
        line: el.line,
        tag: el.tag,
        paths: uniq.size,
        as: el.admittedAs,
      });
  }
  console.log(
    "multi-path elements:",
    els.filter((e) => new Set(e.paths.map((p) => p.join(" "))).size > 1).length,
  );
  console.log("COLLAPSING (oracle projection):", collapses.length);
  for (const c of collapses)
    console.log(`  ${c.file}:${c.line} <${c.tag}> paths=${c.paths} ${c.as}`);
}
main();
