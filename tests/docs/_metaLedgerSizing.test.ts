/**
 * Sizing guard — every NEW open ledger entry carries an effort (AC-B2).
 *
 * Spec: `docs/superpowers/specs/2026-08-04-backlog-convergence-design.md` §3.3.
 *
 * WHY. An unsized entry is invisible to `pnpm ledger:mass`: it is reported as a
 * count and contributes nothing to the weighted total. A queue that keeps
 * accepting unsized rows therefore reads as shrinking debt while the debt is
 * merely unmeasured. This guard makes the omission fail at filing time, which is
 * the only moment the author still knows what the entry is worth.
 *
 * ACCEPT-SET, KEYED ON STRUCTURE RATHER THAN SPELLING. An entry PASSES if its
 * `**Effort:**` field parses to `XS|S|M|L` under the canonical leading-token
 * rule — the SAME `parseEffort` the metric uses, imported rather than
 * re-implemented, so the guard and the metric can never disagree about what
 * counts as sized. Everything else (absent field, hedged value, unrecognized
 * token) is rejected BY NAME: file, id, and the offending value. There is no
 * denylist to keep current.
 *
 * CONSEQUENCE BOUND. The worst case of any parse disagreement is a false
 * FAILURE naming one specific entry, repaired either by sizing that entry or by
 * adding a registry row with a reason. A silent PASS on an unsized new entry is
 * not reachable: the walker returns no `Effort` key for such an entry, and no
 * key is the reject branch. Parser-grammar drift is pinned by
 * `tests/scripts/ledgerFields.test.ts`, not re-tested here.
 *
 * THREAT-MODEL FENCE. This defends against accidental omission by an ordinary
 * contributor filing a row. Adversarial spellings against the bold-run field
 * grammar are OUT OF SCOPE, the same fence the claim reader carries: an author
 * spelling `**Effort:**` to dodge the walker is hiding, not forgetting, and
 * review owns that class.
 *
 * DELIBERATELY NOT ENROLLED in the source-mutation registry (spec §3.3): the
 * guard's substance is set membership over parser output plus a frozen data
 * array, and the shipped operator families target computational logic. Deferred
 * with a reason rather than silently.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ledgerFiles, ledgerItems } from "@/scripts/lib/ledger-fields";
import { parseEffort } from "@/scripts/ledger-mass";

import { LEDGER_SIZING_GRANDFATHERED } from "./_ledgerSizingGrandfather";

const ROOT = join(__dirname, "..", "..");

/** Open queues only. An archived entry is a record; sizing it changes nothing. */
const openLedgers = () => ledgerFiles(ROOT).filter((f) => !/-archive\.md$/.test(f));

type Row = { file: string; id: string; effort: string | undefined };

function openEntries(): Row[] {
  return openLedgers().flatMap((file) =>
    ledgerItems(file, readFileSync(join(ROOT, file), "utf8")).map((item) => ({
      file,
      id: item.id,
      effort: item.fields.Effort,
    })),
  );
}

const grandfathered = new Set(LEDGER_SIZING_GRANDFATHERED);

describe("ledger sizing guard", () => {
  it("premise: the walked ledgers are non-empty, so the assertions below can fail", () => {
    // Without this, deleting both open ledgers would make every assertion pass.
    const files = openLedgers();
    expect(files).toEqual(["BACKLOG.md", "DEFERRED.md"]);
    // Per FILE, never on the flat sum: an emptied BACKLOG.md beside a populated
    // DEFERRED.md must still fail here, and a total floor cannot express that.
    //
    // This replaced `openEntries().length > 50`, which was the right intent in the
    // wrong shape. The OPEN queue is the one ledger population that SHRINKS -- a
    // graduated row moves to an archive rather than vanishing -- so a magic floor
    // drifts toward the live count until some arc crosses it. It sat at >50 while
    // the count was 52, and a two-row graduation reached 50 and redded a guard whose
    // subject was untouched. Non-emptiness is what the premise actually needs, and
    // it cannot erode.
    const rows = openEntries();
    for (const file of files) {
      expect(
        rows.filter((row) => row.file === file).length,
        `${file} yielded no entries — the walker or the parser stopped seeing it`,
      ).toBeGreaterThan(0);
    }
  });

  it("every open entry is sized, or grandfathered by id", () => {
    const unsized = openEntries()
      .filter((row) => parseEffort(row.effort) === null)
      .filter((row) => !grandfathered.has(row.id))
      .map((row) => `${row.file} ${row.id} — Effort: ${row.effort ?? "(absent)"}`);
    expect(
      unsized,
      unsized.length === 0
        ? ""
        : `${unsized.length} open ledger entr(ies) carry no parseable **Effort:**.\n` +
            `Size the entry (XS | S | M | L as the LEADING token), or — with a stated reason in the PR — ` +
            `add its id to LEDGER_SIZING_GRANDFATHERED in tests/docs/_ledgerSizingGrandfather.ts.\n` +
            unsized.map((u) => `  ${u}`).join("\n"),
    ).toEqual([]);
  });

  it("the registry holds no id that is already satisfied, and none that vanished", () => {
    // The other half of ratchet-only. Without this the registry silently
    // accumulates: an entry gets sized and its exemption lives on, so the next
    // author sees a 45-row allowlist and reads it as normal.
    const rows = openEntries();
    const byId = new Map(rows.map((row) => [row.id, row]));

    const satisfied = LEDGER_SIZING_GRANDFATHERED.filter((id) => {
      const row = byId.get(id);
      return row !== undefined && parseEffort(row.effort) !== null;
    });
    expect(
      satisfied,
      `${satisfied.length} grandfathered id(s) are now sized — prune them from the registry in the same commit that sized them.`,
    ).toEqual([]);

    const vanished = LEDGER_SIZING_GRANDFATHERED.filter((id) => !byId.has(id));
    expect(
      vanished,
      `${vanished.length} grandfathered id(s) are in no open ledger any more (archived or renamed) — drop their rows.`,
    ).toEqual([]);
  });

  it("the registry is a set of plausible ids, not a place to park prose", () => {
    expect(new Set(LEDGER_SIZING_GRANDFATHERED).size).toBe(LEDGER_SIZING_GRANDFATHERED.length);
    for (const id of LEDGER_SIZING_GRANDFATHERED) {
      expect(id, `${id} is not shaped like a ledger id`).toMatch(/^[A-Z][A-Z0-9-]{3,}$/);
    }
  });
});

describe("the guard fails BY NAME on an unsized entry (AC-B2)", () => {
  // Scratch fixtures rather than the real tree: planting an unsized entry in
  // BACKLOG.md to prove the guard works would leave the plant in the ledger.
  const scan = (files: Record<string, string>, exempt: readonly string[]) => {
    const rows = Object.entries(files).flatMap(([file, text]) =>
      ledgerItems(file, text).map((item) => ({
        file,
        id: item.id,
        effort: item.fields.Effort,
      })),
    );
    const set = new Set(exempt);
    return rows
      .filter((row) => parseEffort(row.effort) === null && !set.has(row.id))
      .map((row) => `${row.file} ${row.id} — Effort: ${row.effort ?? "(absent)"}`);
  };

  const entry = (id: string, meta: string | null) =>
    `## ${id} — planted\n\n${meta === null ? "" : `${meta}\n\n`}Body.\n`;

  it("names the file, the id, and the offending value", () => {
    const found = scan(
      {
        "BACKLOG.md":
          `# B\n\n` +
          entry("BL-PLANTED-SIZED", "**Effort:** S") +
          entry("BL-PLANTED-UNSIZED", null) +
          entry("BL-PLANTED-HEDGED", "**Effort:** likely L"),
      },
      [],
    );
    expect(found).toEqual([
      "BACKLOG.md BL-PLANTED-UNSIZED — Effort: (absent)",
      "BACKLOG.md BL-PLANTED-HEDGED — Effort: likely L",
    ]);
  });

  it("a grandfathered id is exempt, and only that id", () => {
    const found = scan(
      {
        "BACKLOG.md": `# B\n\n` + entry("BL-OLD-UNSIZED", null) + entry("BL-NEW-UNSIZED", null),
      },
      ["BL-OLD-UNSIZED"],
    );
    // The exemption is BY ID, so a second unsized entry is not covered by the
    // first one's row — the fail-by-default property for anything new.
    expect(found).toEqual(["BACKLOG.md BL-NEW-UNSIZED — Effort: (absent)"]);
  });

  it("accepts every canonical tier spelling and no near-miss", () => {
    const found = scan(
      {
        "BACKLOG.md":
          `# B\n\n` +
          entry("BL-XS", "**Effort:** XS") +
          entry("BL-S", "**Effort:** s") +
          entry("BL-M", "**Effort:** M — the whole surface") +
          entry("BL-L", "**Effort:** L") +
          entry("BL-RANGE", "**Effort:** S–M depending on scope") +
          entry("BL-SMALL", "**Effort:** Small") +
          entry("BL-TBD", "**Effort:** TBD"),
      },
      [],
    );
    expect(found).toEqual([
      "BACKLOG.md BL-SMALL — Effort: Small",
      "BACKLOG.md BL-TBD — Effort: TBD",
    ]);
  });
});
