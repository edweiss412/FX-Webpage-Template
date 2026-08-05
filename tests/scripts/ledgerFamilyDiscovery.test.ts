/**
 * BL-LEDGER-DISCOVERY-FAMILY-SCOPED — a fifth ledger family, and the three
 * consumers that must not be blind to it.
 *
 * THE DEFECT THIS CATCHES. Discovery was a regex over two hardcoded family names
 * (`scripts/lib/ledger-fields.ts`), and two further consumers repeated the same
 * four filenames independently — the referential-integrity guard's own list and
 * the claim reader, which walks whatever `ledgerFiles()` returns. Add a
 * `WATCHLIST.md` alongside them and every one of the three would walk straight
 * past it: entries unparsed, citations unresolvable, in-flight claims invisible.
 * A ledger nobody discovers is worse than no ledger, because the guards report
 * green over it.
 *
 * WIDENED BY REGISTRATION, NOT BY LOOSENING THE REGEX. The accept-set is keyed
 * on structure — a registered family name plus `.md`, with an optional
 * `-archive` before the extension — and everything outside it is REPORTED BY
 * NAME rather than silently skipped. A looser regex would admit whatever it did
 * not model, which is the denylist failure the accept-set rule exists to stop:
 * `README.md` and `AGENTS.md` are all-caps markdown at the repo root too.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEDGER_FAMILIES,
  type LedgerFamily,
  ledgerFiles,
  ledgerItems,
  optsFor,
  unregisteredLedgerFiles,
} from "@/scripts/lib/ledger-fields";

/** The four real names, so the fixture root is a faithful stand-in for the repo. */
const REAL = ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"] as const;

/**
 * A fifth family with DEFERRED's grammar (level-3 headings, no id prefix), so
 * the test proves the registry carries per-family parse opts rather than
 * applying the backlog opts to everything — applying the wrong opts yields ZERO
 * entries, which is a whole ledger disappearing with no file being empty.
 */
const WATCHLIST: LedgerFamily = {
  name: "WATCHLIST",
  opts: { requirePrefix: null, levels: [3] },
};

function fixtureRoot(extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ledger-family-"));
  for (const f of REAL) writeFileSync(join(dir, f), "# stub\n");
  for (const [name, body] of Object.entries(extra)) writeFileSync(join(dir, name), body);
  return dir;
}

const WATCHLIST_BODY = `# Watchlist

### WL-SOMETHING — a watched thing

**Status:** OPEN.

Body.
`;

describe("ledger discovery is family-scoped by registration", () => {
  it("the registry is the single grammar holder, and it is not empty", () => {
    // PREMISE. Every assertion below compares against the registry; an empty or
    // one-family registry would make the "registered families are discovered"
    // rows vacuously true on a fixture that happens to contain nothing else.
    expect(LEDGER_FAMILIES.length).toBeGreaterThanOrEqual(2);
    expect(LEDGER_FAMILIES.map((f) => f.name)).toEqual(
      expect.arrayContaining(["BACKLOG", "DEFERRED"]),
    );
  });

  it("discovers a REGISTERED fifth family, both live and archive", () => {
    const root = fixtureRoot({
      "WATCHLIST.md": WATCHLIST_BODY,
      "WATCHLIST-archive.md": WATCHLIST_BODY,
    });
    const found = ledgerFiles(root, [...LEDGER_FAMILIES, WATCHLIST]);
    expect(found).toContain("WATCHLIST.md");
    expect(found).toContain("WATCHLIST-archive.md");
    expect(found).toEqual([...found].sort());
  });

  it("parses the fifth family under ITS OWN declared opts, not the default", () => {
    const root = fixtureRoot({ "WATCHLIST.md": WATCHLIST_BODY });
    const families = [...LEDGER_FAMILIES, WATCHLIST];
    const items = ledgerItems("WATCHLIST.md", WATCHLIST_BODY, families);
    expect(
      items.map((i) => i.id),
      "WATCHLIST declares requirePrefix:null + level 3; under the BACKLOG opts " +
        "(requirePrefix BL-, levels 2+3) this entry is invisible and the file reads as empty",
    ).toEqual(["WL-SOMETHING"]);
    expect(optsFor("WATCHLIST.md", families)).toEqual(WATCHLIST.opts);
    expect(ledgerFiles(root, families)).toContain("WATCHLIST.md");
  });

  it("does NOT discover an unregistered ledger-shaped file, and reports it BY NAME", () => {
    const root = fixtureRoot({ "WATCHLIST.md": WATCHLIST_BODY });
    // Registry unchanged: WATCHLIST is NOT registered in this row.
    expect(ledgerFiles(root)).toEqual([...REAL].sort());
    expect(
      unregisteredLedgerFiles(root),
      "an all-caps ledger-shaped markdown file outside the registry must be named, " +
        "not silently skipped — silence is how a ledger goes dark",
    ).toEqual(["WATCHLIST.md"]);
  });

  it("reports an unregistered ARCHIVE too, since that is the same blind spot", () => {
    const root = fixtureRoot({ "WATCHLIST-archive.md": WATCHLIST_BODY });
    expect(unregisteredLedgerFiles(root)).toEqual(["WATCHLIST-archive.md"]);
  });

  it("does not report ordinary all-caps repo files as ledgers", () => {
    // The accept-set is keyed on structure, and this is the row that keeps the
    // report USEFUL: a scan that names README.md every run is one people learn
    // to ignore, which is the same dark outcome by another route.
    const root = fixtureRoot({
      "README.md": "# readme\n",
      "AGENTS.md": "# agents\n",
      "CLAUDE.md": "# claude\n",
      "MEMORY.md": "# memory\n",
    });
    expect(unregisteredLedgerFiles(root)).toEqual([]);
  });

  it("the parse cache keys on the OPTS, not the family name", () => {
    // Codex R1 MEDIUM. Two registries can share a family name and declare
    // DIFFERENT parse opts. Keying the cache on the name served the first
    // parse to the second — silently, and precisely in a test written to prove
    // opts are honoured, which is the worst possible place for it to be wrong.
    const permissive: LedgerFamily = {
      name: "WATCHLIST",
      opts: { requirePrefix: null, levels: [3] },
    };
    const restrictive: LedgerFamily = {
      name: "WATCHLIST",
      opts: { requirePrefix: "BL-", levels: [2] },
    };
    const first = ledgerItems("WATCHLIST.md", WATCHLIST_BODY, [permissive]).map((i) => i.id);
    const second = ledgerItems("WATCHLIST.md", WATCHLIST_BODY, [restrictive]).map((i) => i.id);
    expect(first, "the permissive opts see the level-3, unprefixed entry").toEqual([
      "WL-SOMETHING",
    ]);
    expect(
      second,
      "the restrictive opts must see NOTHING; a name-keyed cache returns the permissive result",
    ).toEqual([]);
  });

  it("the referential-integrity consumer takes its ledger list from the registry", () => {
    // Consumer 2. Its list was four hand-written filenames; it now derives from
    // `ledgerFiles()`, so a registered family is covered without a second edit.
    //
    // A WIRING pin, and it says so. Driving that guard end to end from here
    // means importing its module, which executes its own suite against this
    // file — tried, and it reported a fixture id as a dangling citation. The
    // property worth pinning is that no second list exists to drift.
    const src = readFileSync(
      join(__dirname, "..", "docs", "_metaLedgerReferentialIntegrity.test.ts"),
      "utf8",
    );
    expect(src, "the guard must derive its ledgers from the registry holder").toMatch(
      /const LEDGERS[^=]*=\s*ledgerFiles\(\)/,
    );
    expect(
      src.match(/const LEDGERS[^=]*=\s*\[/),
      "a literal filename array here would be a second grammar holder, which is the defect this " +
        "entry closed",
    ).toBeNull();
  });

  it("the claim reader takes its file list from the registry, not its own list", () => {
    // Consumer 3. Its walk is driven by `ledgerFiles()` called with no
    // arguments, so it cannot be pointed at a fixture root without mutating
    // module state — which is why this is a WIRING assertion and says so.
    // What it pins is the property that matters: the claim reader has no list of
    // its own to drift from the registry.
    const src = readFileSync(
      join(__dirname, "..", "..", "scripts", "lib", "ledger-claims-core.ts"),
      "utf8",
    );
    expect(src, "the claim reader must import discovery from the registry holder").toMatch(
      /import\s*\{[^}]*\bledgerFiles\b[^}]*\}\s*from\s*"\.\/ledger-fields"/,
    );
    expect(
      src.match(/^\s*(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*\[[^\]]*"BACKLOG\.md"/m),
      "a hardcoded ledger filename list in the claim reader would be a second grammar holder",
    ).toBeNull();
  });

  it("leaves discovery on the REAL repo root byte-identical", () => {
    // The widening must admit new families without changing what the four real
    // files resolve to — the entry's own bound on this change.
    expect(ledgerFiles()).toEqual([...REAL].sort());
    expect(unregisteredLedgerFiles()).toEqual([]);
  });
});
