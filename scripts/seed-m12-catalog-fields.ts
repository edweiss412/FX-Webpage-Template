// M11 Phase B.1 one-shot.
//
// Reads lib/messages/catalog.ts and adds `title: null`, `longExplanation: null`,
// and `helpHref: null` to every entry that doesn't already have them.
// Idempotent: re-running on an already-seeded catalog is a no-op.
//
// This parses the file line-by-line and inserts the three new fields immediately
// before each entry's closing `  },` line, so multiline field values are handled.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "lib/messages/catalog.ts");
const lines = readFileSync(path, "utf8").split("\n");

const ENTRY_OPEN_RE = /^ {2}(?:"[A-Z][A-Za-z0-9_-]*"|[A-Z][A-Z0-9_]*): \{$/;
const ENTRY_CLOSE = "  },";
const TITLE_RE = /^ +title:/;
const ALREADY_LAST_CLOSE = "  }";

const out: string[] = [];
let inEntry = false;
let entryHasTitle = false;

for (const line of lines) {
  if (!inEntry && ENTRY_OPEN_RE.test(line)) {
    inEntry = true;
    entryHasTitle = false;
    out.push(line);
    continue;
  }

  if (inEntry) {
    if (TITLE_RE.test(line)) entryHasTitle = true;
    if (line === ENTRY_CLOSE || line === ALREADY_LAST_CLOSE) {
      if (!entryHasTitle) {
        out.push("    title: null,");
        out.push("    longExplanation: null,");
        out.push("    helpHref: null,");
      }
      out.push(line);
      inEntry = false;
      continue;
    }
    out.push(line);
    continue;
  }

  out.push(line);
}

writeFileSync(path, out.join("\n"), "utf8");
console.log("Seeded title / longExplanation / helpHref on catalog entries.");
