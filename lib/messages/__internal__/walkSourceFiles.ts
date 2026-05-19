import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type WalkSourceFilesOptions = {
  extensions?: readonly string[];
};

export function walkSourceFiles(
  roots: readonly string[],
  options: WalkSourceFilesOptions = {},
): string[] {
  const files: string[] = [];
  const extensions = options.extensions ?? [".ts", ".tsx"];
  const walk = (path: string) => {
    if (!existsSync(path)) return;
    const stats = statSync(path);
    if (!stats.isDirectory()) {
      if (extensions.some((extension) => path.endsWith(extension))) files.push(path);
      return;
    }

    for (const entry of readdirSync(path)) {
      if (entry === "__generated__") continue;
      walk(join(path, entry));
    }
  };

  for (const root of roots) {
    walk(root);
  }
  return files.sort();
}
