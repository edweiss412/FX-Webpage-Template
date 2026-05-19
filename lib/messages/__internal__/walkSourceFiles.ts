import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function walkSourceFiles(roots: readonly string[]): string[] {
  const files: string[] = [];
  const walk = (path: string) => {
    const stats = statSync(path);
    if (!stats.isDirectory()) {
      if (/\.(ts|tsx)$/.test(path)) files.push(path);
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
