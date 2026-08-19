/**
 * An in-memory stand-in for the fixture splice seam (fixture spec §4.2), for
 * the CliDeps fakes of suites whose subject is NOT the fixture arm.
 *
 * These suites lint documents that carry no fixture marker, so the splice plan
 * is empty and `runFixtureSplice` returns before touching any member. The seam
 * is implemented rather than stubbed with throws so that adding a marker to one
 * of those fixtures exercises the arm instead of exploding inside a test double.
 */
export function memSpliceSeam(): {
  mkdirExclusive(relPath: string): boolean;
  write(relPath: string, body: string): void;
  readFile(relPath: string): string;
  rm(relPath: string): void;
} {
  const dirs = new Set<string>();
  const files = new Map<string, string>();
  return {
    mkdirExclusive: (relPath) => {
      if (dirs.has(relPath)) return false;
      dirs.add(relPath);
      return true;
    },
    write: (relPath, body) => void files.set(relPath, body),
    readFile: (relPath) => {
      const body = files.get(relPath);
      if (body === undefined) throw new Error(`ENOENT ${relPath}`);
      return body;
    },
    rm: (relPath) => {
      dirs.delete(relPath);
      for (const key of [...files.keys()]) if (key.startsWith(relPath + "/")) files.delete(key);
    },
  };
}
