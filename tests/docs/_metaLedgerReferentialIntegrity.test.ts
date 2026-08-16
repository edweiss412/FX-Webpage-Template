// Referential-integrity guard over the BL- backlog namespace.
//
// WHY THIS EXISTS. `BL-` ids are the repo's cross-document join key: plans,
// specs, handoffs, and structural tests all cite them to say "this decision is
// tracked." Nothing enforced that a cited id resolves to an entry anywhere, so
// the join key drifted silently — an id could be cited by a plan and defined in
// no ledger at all, and the only way to find out was to grep by hand.
//
// The failure this catches, concretely: an author writes "deferred, filed as
// BL-FOO-BAR" in a handoff, never adds the entry, and the reference reads as
// tracked work forever. That is worse than no reference, because it retires the
// thought. This guard makes the dangling citation fail at CI time instead.
//
// SCOPE. Definition-side is the BL--prefixed heading ids of the ledger files
// listed in LEDGERS. Citation-side is every `BL-` token in tracked `.md`/`.ts`/
// `.tsx` files except those in NOT_CITATIONS — chiefly this file, since scanning
// it would let KNOWN_DANGLING justify its own rows, the exact tautology the
// ratchet exists to prevent.
//
// Three things are not citations even inside a scanned file, each narrowed so
// it cannot swallow a real reference: a FAMILY reference, where a real id
// extends the token by a whole segment (isFamilyReference); a WORKED EXAMPLE,
// declared per file and per id (NOT_A_CITATION); and a KNOWN_DANGLING row,
// which is recorded debt rather than an exemption. All three are ratcheted —
// nothing here goes quiet without a test noticing when it stops being true.
//
// This guard deliberately does NOT check field schemas or item shape. Those are
// a separate change: the ledgers have no universal field set today (across 43
// BACKLOG entries, Status appears on 34, Severity on 29, Class on 26, and ~20
// labels appear once), so a schema assertion would be a rewrite, not a guard.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { bodyDefinedIds, ledgerIds, type ExtractOpts } from "./_ledgerMdast";
import { ledgerFiles, unregisteredLedgerFiles } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");

/** Same options the graduation guard uses for the backlog pair. */
const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };

/**
 * Every file whose headings DEFINE a BL- id — the complete registry.
 *
 * There used to be a second one at `docs/superpowers/plans/BACKLOG.md`: 53
 * entries under the same `BL-` prefix, sharing exactly one id with this pair and
 * cross-referenced from neither side. It was merged into the root pair on
 * 2026-08-02 and deleted, because two registries under one namespace means a
 * citation has no single place to resolve — which is precisely what this guard
 * asserts. Keeping this list SHORT is the point: a new ledger file added here
 * should be a deliberate, reviewed decision, not a way to make a red run green.
 */
/**
 * DERIVED FROM THE REGISTRY, not repeated here (BL-LEDGER-DISCOVERY-FAMILY-SCOPED).
 *
 * This was four hand-written filenames, which meant a new ledger family stayed
 * invisible to THIS guard even once discovery learned about it — three
 * consumers, three chances to forget. `LEDGER_FAMILIES` in
 * `scripts/lib/ledger-fields.ts` is the single grammar holder now, so adding a
 * family there covers this guard too. The "keep it short, adding one is a
 * deliberate reviewed decision" intent above is unchanged; it lives at the
 * registry, which is one place instead of three.
 */
const LEDGERS: readonly string[] = ledgerFiles();

// The unregistered half of the accept-set, asserted where the citation guard
// runs: a ledger-shaped file no family claims would have its entries walked by
// nobody, and its citations resolvable from nowhere.
it("has no ledger-shaped file outside the registry", () => {
  expect(unregisteredLedgerFiles(), "add a LEDGER_FAMILIES row or rename the file").toEqual([]);
});

/**
 * An id never ends in `-`. Allowing it would capture the head of a soft-wrapped
 * id (`BL-ADMIN-\nEYEBROW-…` -> `BL-ADMIN-`) and report a fragment as a distinct
 * dangling reference.
 */
const CITATION = /BL-[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?/g;

/**
 * Files excluded from the citation scan, each for a reason that would otherwise
 * make the guard lie:
 *  - this file, because KNOWN_DANGLING would justify its own rows;
 *  - the ledger-guard tests, because they build SYNTHETIC ledgers whose ids
 *    (`BL-X`, `BL-Y`, …) are fixtures, not references to real work.
 */
const NOT_CITATIONS = new Set([
  "tests/docs/_metaLedgerReferentialIntegrity.test.ts",
  "tests/docs/_ledgerMdast.walker.test.ts",
  // Same reason: its `BL-MENTIONED` / `BL-TYPOO` / `BL-REAL` and friends are
  // planted markdown proving condition 4 separates a definition from a mention.
  // The entry that drove it (BL-LEDGER-BODY-DEFINED-ID-OVERMINT) predicted this
  // exact collision, which is why its own probe was kept out of the ledger.
  "tests/docs/ledgerBodyIdOvermint.test.ts",
  "tests/docs/_metaDeferralLedgerGraduation.test.ts",
  "tests/docs/_ledgerMdast.ts",
  // Same reason: its `BL-PLANT*` entries are planted violations used to prove the
  // in-progress rules catch what they claim to, not references to real work.
  "tests/docs/_metaLedgerInProgress.test.ts",
  // Same reason: its scratch ledgers plant `BL-OPEN-ONE`, `BL-PLANTED-*` and
  // friends to prove archives are skipped and an unrecognized severity is
  // reported by id. They are fixtures, not references to real work.
  "tests/scripts/ledgerMass.test.ts",
  // Same reason: its scratch ledgers plant `BL-PLANTED-*`, `BL-NEW-UNSIZED`
  // and the four tier spellings to prove the sizing guard fails by name.
  "tests/docs/_metaLedgerSizing.test.ts",
]);

/**
 * Citations that resolve to no ledger entry, recorded at the time this guard
 * landed. Every row is debt, not an exemption: the id is either a real untracked
 * item that needs an entry, or prose that should stop looking like an id.
 *
 * Rows are removed, never added, unless the addition is deliberate and reviewed.
 * Two ratchets keep the list honest — a row that starts resolving fails as
 * stale, and a row nobody cites any more fails as dead.
 */
const KNOWN_DANGLING: Record<string, string> = {
  // The eight BL-MUTATION-* / BL-SYNCFEED-UI-* rows that used to live here were
  // never debt: they are sub-items their parent entry defines as body bullets,
  // which the guard could not see until bodyDefinedIds landed. They are removed,
  // not exempted — the stale-row ratchet below is what proves that.
  "BL-RESOLVED":
    "cited in docs/audits/pr-38-217-bug-audit-2026-07-02.md — no entry as of 2026-08-02",
  // L-wave forward references (spec 2026-08-06-l-wave-design.md + its plan): ids the
  // wave's W-LDOCS branch FILES as part of its ratified decompositions/filings. Each
  // row is debt that the filing commit repays — the stale-row ratchet forces removal
  // of the row in the same change that creates the entry.
  // SETTLED 2026-08-06 by L-wave task L4d, and the row STAYS. The plan offered two
  // branches — refile under this id, or keep BL-RESURRECT-MOBILE-SAFARI-E2E and rewrite
  // its body — and the second was taken, so this id is deliberately never filed. Its own
  // "remove when W-LDOCS lands either way" was wrong for that branch: the id is still
  // cited by the wave's spec as the rejected alternative, so deleting the row would leave
  // that citation dangling. This is genuine debt of the intended kind — prose that looks
  // like an id — and both ratchets hold: it never resolves, and it is still cited.
  "BL-MOBILE-SAFARI-TILE-SPECS-CI-DARK":
    "rejected refile id, L-wave L4d (2026-08-06): the id decision kept BL-RESURRECT-MOBILE-SAFARI-E2E and rewrote its body in place, so this id is never filed. Cited only as the rejected alternative in docs/superpowers/specs/2026-08-06-l-wave-design.md.",
};

type Cited = { id: string; files: string[] };

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "*.md", "*.ts", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f !== "" && !NOT_CITATIONS.has(f));
}

/**
 * Definition side: heading ids UNION ids a parent entry defines in its body.
 *
 * `ledgers` and `read` are parameters, not constants, for the same reason
 * `citedIds` takes an injectable `read` — the "only ledger files define" property
 * is otherwise untestable, since `bodyDefinedIds(text, opts)` sees markdown and
 * cannot tell a ledger from a plan. The defaults ARE the production values, and
 * the plants below pin both the defaults and the live call.
 */
export const readLedgerFile = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

export function definedIds(
  ledgers: readonly string[] = LEDGERS,
  read: (rel: string) => string = readLedgerFile,
): Set<string> {
  const ids = new Set<string>();
  for (const rel of ledgers) {
    const text = read(rel);
    for (const id of ledgerIds(text, BACKLOG_OPTS)) ids.add(id);
    for (const id of bodyDefinedIds(text, BACKLOG_OPTS)) ids.add(id);
  }
  return ids;
}

/**
 * Prose routinely names a FAMILY of ids rather than one id — "the other
 * `BL-ADMIN-*` entries", "`BL-FLOW4-\*`", "§2.6 / BL-PARSER #3", "see
 * BL-MUTATION-LEDGER status above". The citation regex stops before whatever
 * followed the stem, so the stem gets reported as its own dangling id.
 *
 * WHICH SIDE CARRIES THE EVIDENCE. The first version of this predicate keyed
 * on the character AFTER the stem, admitting only `-`, `*`, `\` — it was
 * written for globs, and a space defeated it. That is the wrong side to read:
 * whether `BL-PARSER` names a family is a fact about the LEDGERS, not about
 * the punctuation the sentence reached for. Nine of this guard's original
 * KNOWN_DANGLING rows were prose family references matched out of sentences.
 *
 * So the load-bearing condition is the definition side: a real id extends the
 * stem BY A WHOLE SEGMENT (`stem + "-" + …`). That is what keeps the widening
 * from swallowing typos — `BL-ADMEN` extends nothing, stays dangling, still
 * fails, whatever punctuation follows it. The segment boundary matters on its
 * own: plain `startsWith` made `BL-X` a "family stem" of
 * `BL-X5-INTROSPECTION-GAP`, which share a character run and no family, and
 * under the widened boundary that would have silently swallowed an
 * illustrative `BL-X`.
 *
 * The next-character test survives only to reject a lowercase suffix
 * (`BL-ADMINs`) — the citation regex is maximal-munch over `[A-Z0-9-]`, so a
 * letter there means the author wrote a token that is neither id nor glob.
 */
export function isFamilyReference(text: string, end: number, stem: string, defined: Set<string>): boolean {
  if (/[A-Za-z0-9]/.test(text.charAt(end))) return false;
  const segment = `${stem}-`;
  for (const id of defined) {
    if (id.startsWith(segment)) return true;
  }
  return false;
}

/**
 * Ids a named file writes as a WORKED EXAMPLE rather than as a reference:
 * `file -> id -> why`. Specs about the ledger format quote id-shaped tokens to
 * show what the format looks like, and a token quoted to illustrate a grammar
 * resolves to nothing by construction. The sharpest case is this guard's own
 * neighbour — `docs/…-ledger-guard-mdast-rewrite-design.md` documents the
 * walker's id-extraction plants, so the ledger guard's spec tripped the ledger
 * guard.
 *
 * WHY PER-FILE ROWS AND NOT A RESERVED PREFIX. A reserved prefix (`BL-EG-…`
 * skipped everywhere) is the cheaper convention and the wrong one here, on the
 * property the brief asks for — not silently swallowing a real id. A prefix is
 * a global, permanent hole: any file may dodge the guard forever by naming a
 * genuinely untracked item under it, and nothing can tell that from a worked
 * example. A row here names BOTH the file and the id, so the identical token
 * in any other file is still a dangling citation (probed below), and adding a
 * hole costs a reviewed diff — the same posture as KNOWN_DANGLING.
 *
 * The prefix convention also cannot be adopted by the files that need it,
 * because renaming these tokens would falsify what they record. `BL-904` is a
 * measured case number. `BL-X` / `BL-STRUCK` / `BL-REAL-ID` are verbatim
 * quotations of walker plants that must keep matching
 * `tests/docs/_ledgerMdast.walker.test.ts`. `## BL-NAME — title` is a
 * row-format template, and renaming it teaches the wrong format.
 *
 * Two ratchets, mirroring KNOWN_DANGLING: a row whose occurrence is gone fails
 * as dead, and a row whose id becomes real fails as stale.
 */
const NOT_A_CITATION: Record<string, Record<string, string>> = {
  "tests/docs/_metaLedgerClaimCollision.test.ts": {
    "BL-PLANTED-COLLISION": "planted declared claim proving the backstop reads one",
    "BL-PLANTED-OPEN": "planted OPEN entry proving it does not read one",
    "BL-PLANTED-DEEP": "planted out-of-window marker, the shape that started this",
    "BL-E2E-CONTROL-PLANTED": "planted in a temp-dir ledger copy by the end-to-end control",
    "BL-X": "planted id in the findCollisions comparison fixtures",
    "BL-OTHER": "the non-colliding control in those fixtures",
  },
  "scripts/ledger-claims.ts": {
    "BL-A": "usage example in the CLI docstring",
    "BL-B": "usage example in the CLI docstring",
  },
  "tests/scripts/ledgerClaimsCheck.test.ts": {
    "BL-X": "planted declared claim in the exit-code fixtures",
    "BL-Z": "planted inferred-only claim",
    "BL-DEEP": "the collision planted past the 100-branch display cap",
    "BL-NOT-A-ROW": "an id defined nowhere, for the note-and-continue case",
    "BL-UNRELATED": "an id with no claim, for the degraded-universe cases",
    "BL-MANY": "the id planted on 101 candidates for the uncapped --json case",
  },
  "tests/scripts/ledgerClaims.test.ts": {
    "BL-X": "planted marker id in the resolver fixtures",
    "BL-Y": "the second planted entry, for the boundary-overlap hunk fixture",
  },
  "tests/scripts/ledgerFields.test.ts": {
    "BL-PLANT": "planted meta line proving fields parse into separate keys",
  },
  "docs/superpowers/plans/2026-08-04-ledger-claim-visibility.md": {
    "BL-X": "planted entry id in the Task 3/4 resolver fixtures",
    "BL-Y": "the second planted entry in Task 4's boundary-overlap hunk fixture",
  },
  "docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md": {
    "BL-X": "planted duplicate-heading example id in the §2.2 plant rows",
  },
  "docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md": {
    "BL-X": "the same plant examples, restated in Task A1's plant rows",
  },
  "docs/superpowers/specs/ci/2026-08-04-review-round-economy.md": {
    "BL-SPEC-CITATION-RESOLVE": "invented id in §6's sample filing, showing where a real one goes",
  },
  "docs/review-rounds/README.md": {
    "BL-SPEC-CITATION-RESOLVE": "the same §6 sample filing, reproduced so the corpus explains itself",
  },
  "docs/superpowers/plans/2026-08-04-review-round-economy.md": {
    "BL-SPEC-CITATION-RESOLVE": "the spec's §6 sample filing, quoted into Task 6's pasted filing test",
    "BL-ONE": "planted token in Task 6's `parseFiling` prefix-recognizer fixture",
    "BL-REAL": "Task 6's injected resolvable control in the gate-test fixtures",
    "BL-NOT-A-REAL-ID": "the unresolvable citation it is the control for",
  },
  "tests/reviewRounds/filing.test.ts": {
    "BL-SPEC-CITATION-RESOLVE": "the spec's §6 sample filing, parsed as the worked example's citation",
    "BL-ONE": "planted token proving the recognizer admits BL- and DEF- and nothing else",
    "BL-REAL": "planted strikethrough-retraction fixture id (enforcement-pair spec R11)",
    "BL-IN-BLOCK": "planted block-scope fixture: the id INSIDE the Mechanizable block",
    "BL-IN-JUDGMENT": "its control: the id in a following Judgment field, never collected",
    "BL-TICKED": "planted inlineCode citation proving backticked ids are collected",
    "BL-DECODED-ROW": "planted backslash-escaped spelling proving remark decodes before CITED_ID",
  },
  "docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md": {
    "BL-FOO": "worked example of a backticked citation in §3.1's citedIds rule",
    "BL-REAL": "the meta-test's injected resolvable control, quoted by §6.2's fixture mandate",
  },
  "docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md": {
    "BL-REAL": "the same injected resolvable control, quoted by Task 1/2 fixture lists",
  },
  "tests/docs/_metaReviewRoundEconomy.test.ts": {
    "BL-REAL": "the injected resolvable id every fixture arc's filing cites",
    "BL-NOT-A-REAL-ID": "the unresolvable citation it is the control for",
    "BL-NO-SUCH-ROW":
      "planted AST-decoded unresolvable id in the R10 escape/character-reference fixtures",
    "BL-PLANTED-HEADING-ROW": "planted `## BL-… —` entry in the fixture-root BACKLOG.md",
    "BL-PLANTED-NESTED-HEADING-ROW":
      "planted `### BL-… —` entry there, pinning that a level-3 row resolves too",
    "BL-PLANTED-SUBITEM-ROW": "planted body sub-item there, pinning the heading-only documented limit",
    "BL-PLANTED-ABSENT-ROW": "an id defined in no fixture ledger, for the unresolved case",
  },
  "docs/superpowers/specs/2026-08-03-ledger-claim-visibility-design.md": {
    "BL-SOME-OTHER-ROW": "placeholder row in §3.2's sample report output",
    "BL-A": "§3.3's `--check BL-A BL-B` usage example",
    "BL-B": "§3.3's `--check BL-A BL-B` usage example",
    "BL-DEFINED": "§9.2 over-mint probe input — the one shape that SHOULD define",
    "BL-MENTIONED": "§9.2 over-mint probe input — a mention the recognizer wrongly mints",
    "BL-COLON": "§9.2 over-mint probe input — `**BL-COLON**:` prefix form",
    "BL-NESTED": "§9.2 over-mint probe input — nested bullet, correctly not minted",
    "BL-ONE": "§9.2 over-mint probe input — enumerated pair, correctly not minted",
  },
  "docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md": {
    "BL-X": "id-extraction plants — `## [URGENT] BL-X`, `## BL-X: open`, `## ~~BL-X~~ —`",
    "BL-P4": "probe row P4's synthetic heading, `## BL-P4 — RESOLVED-vs-CLOSED naming sweep`",
    "BL-P5": "probe row P5's synthetic heading, `## BL-P5 — DONE-state gallery polish`",
    "BL-CLOSED-LOOP-FIX": "probe row P7's control token for the ratified dash-separator fix",
    "BL-DRIVE-RESOLVED": "probe row P6's hyphenated-id token, showing `-RESOLVED:` is not a field claim",
  },
  "docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md": {
    "BL-REAL-ID": "worked example of heading -> id extraction (`\"### BL-REAL-ID — text\"`)",
    "BL-STRUCK": "the struck-heading example in the same table (`\"### ~~BL-STRUCK~~ — x\"`)",
  },
  "docs/superpowers/plans/admin/2026-07-17-casp2-strip-polish.md": {
    "BL-NAME": "the `## BL-NAME — title` row-format template, quoting BACKLOG.md's shape",
  },
  "docs/superpowers/plans/2026-07-26-stripcomments-shared.md": {
    "BL-904": "measured case number for the runaway-block-span repro, not a backlog id",
  },
  "docs/superpowers/specs/2026-07-26-stripcomments-shared-design.md": {
    "BL-904": "same measured case number — 'cannot fail open the BL-904 way'",
  },
  "tests/_shared/stripComments.test.ts": {
    "BL-904": "same measured case number, in the test name that pins the repro",
  },
};

/**
 * Whether `id` is a worked example in `rel` specifically. Scoped by BOTH keys
 * on purpose: an exemption is a statement about one occurrence, never a
 * blanket about a file or a token.
 */
export function isDeclaredPlaceholder(
  exempt: Readonly<Record<string, Readonly<Record<string, string>>>>,
  rel: string,
  id: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(exempt[rel] ?? {}, id);
}

/** id -> files citing it, across every tracked file but the excluded ones. */
export function citedIds(
  files: readonly string[],
  defined: Set<string>,
  exempt: Readonly<Record<string, Readonly<Record<string, string>>>>,
  read: (rel: string) => string = (rel) => readFileSync(join(ROOT, rel), "utf8"),
): Map<string, string[]> {
  const cited = new Map<string, string[]>();
  for (const rel of files) {
    let text: string;
    try {
      text = read(rel);
    } catch {
      continue; // deleted-but-tracked during a rebase; not this guard's business
    }
    for (const m of text.matchAll(CITATION)) {
      if (isFamilyReference(text, m.index + m[0].length, m[0], defined)) continue;
      if (isDeclaredPlaceholder(exempt, rel, m[0])) continue;
      const list = cited.get(m[0]);
      if (list) {
        if (!list.includes(rel)) list.push(rel);
      } else {
        cited.set(m[0], [rel]);
      }
    }
  }
  return cited;
}

/**
 * The unit under test, factored out so the fail-by-default property can be
 * exercised against a synthetic corpus rather than only against a repo that
 * currently passes.
 */
export function unresolved(
  cited: Map<string, string[]>,
  defined: Set<string>,
  known: Readonly<Record<string, string>>,
): Cited[] {
  const out: Cited[] = [];
  for (const [id, files] of cited) {
    if (defined.has(id)) continue;
    if (Object.prototype.hasOwnProperty.call(known, id)) continue;
    out.push({ id, files });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe("BL- referential integrity", () => {
  const files = trackedFiles();
  const defined = definedIds();
  const cited = citedIds(files, defined, NOT_A_CITATION);

  it("every cited BL- id resolves to a ledger entry", () => {
    const bad = unresolved(cited, defined, KNOWN_DANGLING);
    const detail = bad
      .map((b) => `  ${b.id}\n${b.files.map((f) => `      ${f}`).join("\n")}`)
      .join("\n");
    expect(
      bad,
      bad.length === 0
        ? ""
        : `${bad.length} BL- id(s) are cited but defined in no ledger.\n` +
            `Add the entry to BACKLOG.md, or add a KNOWN_DANGLING row with a reason.\n${detail}`,
    ).toEqual([]);
  });

  it("no KNOWN_DANGLING row has started resolving", () => {
    const stale = Object.keys(KNOWN_DANGLING)
      .filter((id) => defined.has(id))
      .sort();
    expect(
      stale,
      `These ids now have ledger entries — delete their KNOWN_DANGLING rows: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("no KNOWN_DANGLING row has stopped being cited", () => {
    const dead = Object.keys(KNOWN_DANGLING)
      .filter((id) => !cited.has(id))
      .sort();
    expect(
      dead,
      `These ids are no longer cited anywhere — delete their KNOWN_DANGLING rows: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("every NOT_A_CITATION row still describes a real occurrence", () => {
    // Dead-row ratchet, the twin of KNOWN_DANGLING's. An exemption that has
    // outlived its worked example is a standing hole nobody is watching.
    const dead: string[] = [];
    for (const [rel, ids] of Object.entries(NOT_A_CITATION)) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        dead.push(`${rel} (file is gone)`);
        continue;
      }
      const present = new Set([...text.matchAll(CITATION)].map((m) => m[0]));
      for (const id of Object.keys(ids)) {
        if (!present.has(id)) dead.push(`${rel} → ${id}`);
      }
    }
    expect(
      dead.sort(),
      `These worked examples are gone — delete their NOT_A_CITATION rows:\n  ${dead.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no NOT_A_CITATION row names an id a ledger actually defines", () => {
    // Stale-row ratchet. Once an id is real the citation resolves on its own,
    // and leaving the row would keep a real id exempt in that file forever.
    const stale = Object.entries(NOT_A_CITATION)
      .flatMap(([rel, ids]) => Object.keys(ids).map((id) => `${rel} → ${id}`))
      .filter((row) => defined.has(row.split(" → ")[1]!))
      .sort();
    expect(
      stale,
      `These ids are defined now — delete their NOT_A_CITATION rows: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("the ledger set actually yields ids (guards a silent parse regression)", () => {
    // A walker change that stopped extracting ids would make every assertion
    // above vacuously green. Pin a floor well below the real count.
    expect(defined.size).toBeGreaterThan(100);
  });

  describe("family-reference suppression", () => {
    const real = new Set(["BL-ADMIN-DASHBOARD-ROW-ACTIONS", "BL-ADMIN-EYEBROW"]);

    it("suppresses a glob over a stem that real ids extend", () => {
      const t = "bundles this with the other BL-ADMIN-* entries";
      expect(isFamilyReference(t, t.indexOf("-*") , "BL-ADMIN", real)).toBe(true);
      const esc = "the other BL-ADMIN-\\* entries";
      expect(isFamilyReference(esc, esc.indexOf("-\\*"), "BL-ADMIN", real)).toBe(true);
    });

    it("does NOT suppress a stem no real id extends — a typo must still fail", () => {
      const t = "see BL-ADMEN-* for details";
      expect(isFamilyReference(t, t.indexOf("-*"), "BL-ADMEN", real)).toBe(false);
    });

    it("does NOT suppress an exact id that merely prefixes a longer one", () => {
      // stem === a real id, but nothing longer extends it beyond itself
      expect(isFamilyReference("BL-ADMIN-EYEBROW-", 17, "BL-ADMIN-EYEBROW", real)).toBe(false);
    });

    // --- Widened boundary: prose names a family too ----------------------
    // Prose names a family at least as often as a glob does — `§2.6 /
    // BL-PARSER #3`, "the BL-MUTATION-LEDGER status above". The old rule read
    // the punctuation the sentence happened to use; the widened rule reads the
    // DEFINITION side instead, which is the side that carries the evidence.

    it("suppresses a stem followed by prose when a real id extends it", () => {
      for (const after of [" #3", ".", ",", ")", "'s", "`", '"', ":", "/", "\n"]) {
        const t = `see BL-ADMIN${after} for the family`;
        expect(
          isFamilyReference(t, "see BL-ADMIN".length, "BL-ADMIN", real),
          `expected suppression before ${JSON.stringify(after)}`,
        ).toBe(true);
      }
    });

    it("suppresses a stem at end-of-file, where there is no next character", () => {
      const t = "the whole BL-ADMIN";
      expect(isFamilyReference(t, t.length, "BL-ADMIN", real)).toBe(true);
    });

    it("does NOT suppress a typo followed by prose — the widening keeps its teeth", () => {
      // The ONLY thing between prose suppression and a guard that passes
      // everything is the extends-a-real-id test. This is that probe: the same
      // sentence shapes as the case above, one letter different, all still red.
      for (const after of [" #3", ".", ",", ")", "", "\n"]) {
        const t = `filed as BL-ADMEN${after}`;
        expect(
          isFamilyReference(t, "filed as BL-ADMEN".length, "BL-ADMEN", real),
          `a typo must stay dangling before ${JSON.stringify(after)}`,
        ).toBe(false);
      }
    });

    it("does NOT suppress a stem a real id extends only mid-segment", () => {
      // `BL-X` is not the family stem of `BL-X5-INTROSPECTION-GAP`: they share
      // a character run, not a segment. Accepting that relationship is how an
      // illustrative `BL-X` placeholder came to read as a family reference —
      // and, under the widened boundary, would have silently swallowed it.
      // Extension must land on a `-` boundary.
      const mid = new Set(["BL-X5-INTROSPECTION-GAP"]);
      expect(isFamilyReference("`## BL-X: open`", "`## BL-X".length, "BL-X", mid)).toBe(false);
      expect(isFamilyReference("BL-X-* items", "BL-X".length, "BL-X", mid)).toBe(false);
    });

    it("does NOT suppress a lowercase-suffixed token", () => {
      // `BL-ADMINs` is a malformed token, not a stem: the citation regex
      // stopped at a character it could not consume, so what the author wrote
      // is neither an id nor a glob. Keep it visible.
      const t = "the BL-ADMINs are noisy";
      expect(isFamilyReference(t, "the BL-ADMIN".length, "BL-ADMIN", real)).toBe(false);
    });
  });

  describe("worked-example exemptions", () => {
    const exempt = { "docs/spec.md": { "BL-X": "illustrative heading in §4" } };

    it("exempts the declared id in the declared file", () => {
      expect(isDeclaredPlaceholder(exempt, "docs/spec.md", "BL-X")).toBe(true);
    });

    it("does NOT exempt the same id in any other file", () => {
      expect(isDeclaredPlaceholder(exempt, "docs/other.md", "BL-X")).toBe(false);
    });

    it("does NOT exempt an undeclared id in a declared file", () => {
      expect(isDeclaredPlaceholder(exempt, "docs/spec.md", "BL-Y")).toBe(false);
    });

    it("scans an exempt file for OTHER dangling ids — exemption is per id, not per file", () => {
      // The failure this catches: a file earns one exemption and quietly
      // becomes a blind spot for every id it names afterwards.
      const cited = citedIds(["docs/spec.md"], new Set(), exempt, () => "BL-X and BL-REALLY-DANGLING");
      expect([...cited.keys()]).toEqual(["BL-REALLY-DANGLING"]);
    });

    it("still reports the identical citation from a file with no row", () => {
      // The probe for the property that picked this convention over a
      // reserved prefix: the exemption is scoped to one worked example, so
      // the same token elsewhere is still a dangling reference.
      const cited = citedIds(["docs/spec.md", "docs/other.md"], new Set(), exempt, () => "see BL-X");
      expect(cited.get("BL-X")).toEqual(["docs/other.md"]);
    });
  });

  it("flags an unregistered citation (fail-by-default, synthetic)", () => {
    const synthetic = new Map<string, string[]>([
      ["BL-DEFINED-ELSEWHERE", ["docs/a.md"]],
      ["BL-ON-THE-DEBT-LIST", ["docs/b.md"]],
      ["BL-BRAND-NEW-DANGLER", ["docs/c.md"]],
    ]);
    const bad = unresolved(
      synthetic,
      new Set(["BL-DEFINED-ELSEWHERE"]),
      { "BL-ON-THE-DEBT-LIST": "debt" },
    );
    expect(bad.map((b) => b.id)).toEqual(["BL-BRAND-NEW-DANGLER"]);
    expect(bad[0]?.files).toEqual(["docs/c.md"]);
  });
});

// ── File-scoping plants ─────────────────────────────────────────────────────
//
// "Only ledger files define" is a property of WHICH FILES are read, not of
// markdown, so none of it is testable through `bodyDefinedIds(text, opts)`. Each
// plant below exists because a review round produced a mutant that survived every
// earlier assertion:
//   P5       — the parameter is respected at all.
//   P5-live  — the DEFAULT list is exactly the four ledgers. A default widened
//              with any currently-harmless plan path passed P5, the per-entry
//              shape check, and the four-ledger count, because every BL-looking
//              heading in the plan corpus is a fenced example defining nothing.
//   P5-sole  — nothing ELSE calls bodyDefinedIds with its own file list.
//   P5-noio  — the helper cannot read a file behind the seam's back.
//   P5-trace — the caller cannot append a shadow list to the one it was given.
describe("bodyDefinedIds is scoped to ledger files", () => {
  const BULLET = "## BL-SCOPE-PARENT — parent\n\n- **`BL-SCOPE-CHILD`** — a sub-item\n";

  it("P5: the same markdown defines in a ledger and NOT in a non-ledger file", () => {
    const read = (): string => BULLET;
    // Control: supplied as a ledger, the id resolves.
    expect([...definedIds(["BACKLOG.md"], read)]).toContain("BL-SCOPE-CHILD");
    // Subject: a file that is not in the list is never read at all.
    expect([...definedIds([], read)]).not.toContain("BL-SCOPE-CHILD");
  });

  it("P5-live: the live call uses the default, and the default is EXACTLY the four ledgers", { timeout: 60_000 }, () => {
    expect([...LEDGERS].sort()).toEqual([
      "BACKLOG-archive.md",
      "BACKLOG.md",
      "DEFERRED-archive.md",
      "DEFERRED.md",
    ]);
    // The no-argument call — the one the live assertion makes — equals the
    // explicit call over that same list.
    expect([...definedIds()].sort()).toEqual([...definedIds(LEDGERS)].sort());
    // And the list is load-bearing: adding a file changes the answer.
    const withPlan = definedIds([...LEDGERS, "plan.md"], (rel) =>
      rel === "plan.md" ? BULLET : readFileSync(join(ROOT, rel), "utf8"),
    );
    expect([...withPlan]).toContain("BL-SCOPE-CHILD");
  });

  it("P5-trace: the reader is called with EXACTLY the supplied list, in order", () => {
    // Defeats a caller that iterates `[...ledgers, ...SHADOW]`: the shadow reads
    // would show up here even when the extra files define nothing today.
    const seen: string[] = [];
    const read = (rel: string): string => {
      seen.push(rel);
      return BULLET;
    };
    definedIds(["BACKLOG.md", "DEFERRED.md"], read);
    expect(seen).toEqual(["BACKLOG.md", "DEFERRED.md"]);
  });

  it("P5-sole: nothing but definedIds calls bodyDefinedIds", { timeout: 60_000 }, () => {
    // A second production caller with its own file list would pass every plant
    // above while scanning whatever it liked.
    const files = trackedFiles().filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const callers = files.filter((rel) => {
      if (rel === "tests/docs/_ledgerMdast.ts") return false; // the definition
      if (rel === "tests/docs/_ledgerMdast.walker.test.ts") return false; // its own tests
      if (rel === "tests/docs/_metaLedgerReferentialIntegrity.test.ts") return false; // this file
      // Condition 4's own probe. It calls bodyDefinedIds on INLINE markdown
      // strings, never on a file list, so it cannot defeat the property this
      // assertion protects — a second caller scoping its own files.
      if (rel === "tests/docs/ledgerBodyIdOvermint.test.ts") return false;
      let text: string;
      try {
        text = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        return false;
      }
      return text.includes("bodyDefinedIds");
    });
    expect(callers, "bodyDefinedIds gained a caller that scopes its own files").toEqual([]);
  });

  it("P5-noio-caller: definedIds performs no read outside its injected reader", () => {
    // P5-trace watches the SPY, so it cannot see a read that bypasses the spy —
    // either a direct shadow read inside definedIds, or a default adapter that
    // reads an extra path per call. Both were compiled and shown silent. The
    // defence is structural: definedIds' body may not touch the filesystem at
    // all, and the default reader is a single named one-liner.
    const source = readFileSync(join(ROOT, "tests/docs/_metaLedgerReferentialIntegrity.test.ts"), "utf8");
    const start = source.indexOf("export function definedIds(");
    expect(start, "definedIds not found — this plant must be re-anchored").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}", start));
    for (const banned of ["readFileSync", "readdirSync", "execFileSync", "require("]) {
      expect(body, `definedIds must read only through its injected reader (${banned})`).not.toContain(banned);
    }
    // And the default adapter reads exactly the path it was given, once.
    const adapter = source.slice(
      source.indexOf("export const readLedgerFile"),
      source.indexOf("export function definedIds("),
    );
    expect(adapter.match(/readFileSync/g) ?? []).toHaveLength(1);
    expect(adapter).toContain("join(ROOT, rel)");
  });

  it("P5-noio: the walker helper cannot read the filesystem", () => {
    // Structural, not behavioural: if `_ledgerMdast.ts` can open a file, the
    // (text, opts) signature stops being a real boundary and P5 proves nothing.
    const helper = readFileSync(join(ROOT, "tests/docs/_ledgerMdast.ts"), "utf8");
    for (const banned of ["node:fs", "node:path", 'from "fs"', 'from "path"', "require("]) {
      expect(helper, `_ledgerMdast.ts must not reach the filesystem (${banned})`).not.toContain(
        banned,
      );
    }
  });
});
