import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CREW_SCOPED_WARNING_CODES, AUTOCORRECT_CODES } from "@/lib/parser/autocorrectCodes";

// Structural meta-test this milestone CREATES (spec §10.10 / plan Task 2 Test B).
//
// It walks lib/parser/** for every `code: "<X>_AUTOCORRECTED"` object-literal producer
// and asserts each such warning object ALSO carries an `autocorrect:` key. §3.2's failure
// mode is invisible at runtime — an unpopulated producer silently renders today's generic
// copy and breaks no other test — so a NEW producer fails BY DEFAULT here.
//
// LIMITATION (stated deliberately): the walk keys on the literal `code: "..._AUTOCORRECTED"`.
// A producer that constructs the code by any non-literal means (alias, computed string,
// helper) is NOT discovered, so such a producer must be added to this test deliberately.

const PARSER_ROOT = join(process.cwd(), "lib", "parser");

type Site = { file: string; line: number; code: string; hasAutocorrect: boolean };

/** Find each autocorrect `code:` literal and whether its enclosing object literal (scanned
 *  forward to the first object-closing line) also declares `autocorrect:`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function discoverSites(): Site[] {
  const files = walk(PARSER_ROOT);
  const sites: Site[] = [];
  const codeRe = /code:\s*"(\w+_AUTOCORRECTED)"/;
  const closeRe = /^\s*\}\)?;?\s*$/; // `});`, `};`, `}` — first object/statement close after code:
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = codeRe.exec(lines[i] ?? "");
      if (!m) continue;
      // A PRODUCER emits a ParseWarning (has `severity:`, on the line just before `code:`).
      // Non-producer references — e.g. the dataGaps GAP_CLASSES registry `{ code, label }` —
      // have no severity and are skipped.
      const isProducer = [lines[i - 1], lines[i - 2], lines[i - 3]].some((l) =>
        /\bseverity:/.test(l ?? ""),
      );
      if (!isProducer) continue;
      let hasAutocorrect = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
        const l = lines[j] ?? "";
        if (/\bautocorrect:/.test(l)) hasAutocorrect = true;
        if (closeRe.test(l)) break; // object closed; stop scanning
      }
      sites.push({ file, line: i + 1, code: m[1]!, hasAutocorrect });
    }
  }
  return sites;
}

describe("_metaAutocorrectProducers", () => {
  const sites = discoverSites();

  it("discovers exactly 13 producer sites", () => {
    expect(sites).toHaveLength(13);
  });

  it("every producer populates autocorrect", () => {
    const missing = sites.filter((s) => !s.hasAutocorrect);
    expect(missing, `sites missing autocorrect: ${missing.map((s) => `${s.file}:${s.line}`).join(", ")}`).toEqual([]);
  });

  it("the 13 sites cover the five codes with the expected multiplicity", () => {
    const counts: Record<string, number> = {};
    for (const s of sites) counts[s.code] = (counts[s.code] ?? 0) + 1;
    expect(counts).toEqual({
      STAGE_WORD_AUTOCORRECTED: 1,
      ROLE_TOKEN_AUTOCORRECTED: 1,
      SECTION_HEADER_AUTOCORRECTED: 1,
      COLUMN_HEADER_AUTOCORRECTED: 2,
      FIELD_LABEL_AUTOCORRECTED: 8,
    });
  });

  it("CREW_SCOPED_WARNING_CODES is exactly the two crew-scoped codes and a subset of the five", () => {
    expect([...CREW_SCOPED_WARNING_CODES].sort()).toEqual([
      "ROLE_TOKEN_AUTOCORRECTED",
      "STAGE_WORD_AUTOCORRECTED",
    ]);
    for (const c of CREW_SCOPED_WARNING_CODES) expect(AUTOCORRECT_CODES).toContain(c);
  });
});
