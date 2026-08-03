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

import { ledgerIds, type ExtractOpts } from "./_ledgerMdast";

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
const LEDGERS = [
  "BACKLOG.md",
  "BACKLOG-archive.md",
  "DEFERRED.md",
  "DEFERRED-archive.md",
] as const;

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
  "tests/docs/_metaDeferralLedgerGraduation.test.ts",
  "tests/docs/_ledgerMdast.ts",
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
  "BL-ADMIN-EYEBROW-FAINT-CONTRAST":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-ATTENTION-PILL-FOCUS-UNWIRED":
    "cited in docs/superpowers/plans/2026-07-24-attention-index.md — no entry as of 2026-08-02",
  "BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-B2UI":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-DISABLED-WIRING":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-ESCALATED-HELP":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-HELP-GATING":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-CASP2-POPOVER-PROXIMITY":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-CI-P3-FILE-GRANULAR-SERIAL":
    "cited in docs/superpowers/specs/ci/2026-07-20-ci-overlap-boot-with-setup.md — no entry as of 2026-08-02",
  "BL-CI-UNIT-SUITE-PHASE2":
    "cited in docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md — no entry as of 2026-08-02",
  "BL-COLLAPSEPANEL-REGION-OPTOUT":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-CRON-SYNTHETIC-SHOW-SKIP":
    "cited in lib/sync/runScheduledCronSync.ts +2 more — no entry as of 2026-08-02",
  "BL-DATAQUALITY-BADGE-SEGMENT-GLYPH":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-DATAQUALITY-BADGE-TOUCH-DETAIL":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-DESTRUCT-FORK-FOCUS-TRANSFER":
    "cited in docs/superpowers/plans/admin/2026-07-25-destruct-thumb-order-drift-guard.md +1 more — no entry as of 2026-08-02",
  "BL-E2E-REPORT-MODAL-UNRUNNABLE":
    "cited in docs/superpowers/plans/2026-07-26-ci-dark-descoped-closeout/plan.md — no entry as of 2026-08-02",
  "BL-FLOW4":
    "cited in docs/superpowers/plans/step3-onboarding/2026-07-16-mobile-autoapplied-parity.md +1 more — no entry as of 2026-08-02",
  "BL-FLOW4-BULK-UNDO-ERROR-SURFACE":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-FLOW4-CONFIRM-DANGER-STYLE":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-FLOW4-MOBILE-AUTOAPPLIED-PARITY":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-HEADER-REACT-RECONCILE-HARNESS":
    "cited in tests/e2e/section-header-layout.layout.spec.ts — no entry as of 2026-08-02",
  "BL-HERO-SEGMENT-VIBRANCY":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-HOTEL-VIEWER-NAME-MATCH":
    "cited in BACKLOG-archive.md +7 more — no entry as of 2026-08-02",
  "BL-INTERNAL-CODE-ENUM-SCAN-WIDEN":
    "cited in docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md +1 more — no entry as of 2026-08-02",
  "BL-MOBILEPARITY-STRIP-HEADING-SIZE":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-MUTATION-COLUMN-SHIFT":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-MERGED-CELL":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-REF-SUB":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-SECTION-ORDER":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-UNICODE":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-NEEDS-ATTENTION-HOLDS-ROLLUP":
    "cited in docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md — no entry as of 2026-08-02",
  "BL-ONBOARDING-SCAN-EXPORT-HANG":
    "cited in tests/drive/fetch.test.ts — no entry as of 2026-08-02",
  "BL-OVERRIDE-CONTROL-ARIA-FIELD-QUALIFIER":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-OVERRIDE-ORPHAN-SALIENCE":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-PARSER-ADDRESS-SPLIT-AMBIGUITY":
    "cited in docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md +3 more — no entry as of 2026-08-02",
  "BL-PARSER-HOTEL-INLINE-AMBIGUITY":
    "cited in docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md +3 more — no entry as of 2026-08-02",
  "BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL":
    "cited in docs/superpowers/plans/2026-07-27-inline-later-group-own-hotel/00-overview.md +5 more — no entry as of 2026-08-02",
  "BL-PG-CRON-HOST-ASSERTION":
    "cited in docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md — no entry as of 2026-08-02",
  "BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW":
    "cited in BACKLOG-archive.md +4 more — no entry as of 2026-08-02",
  "BL-RESOLVED":
    "cited in docs/audits/pr-38-217-bug-audit-2026-07-02.md — no entry as of 2026-08-02",
  "BL-RESYNC-STAGED-REVIEW-UI":
    "cited in docs/superpowers/plans/data-quality/2026-07-04-resync-quality-gate/00-plan.md +1 more — no entry as of 2026-08-02",
  "BL-SHOWSTABLE-720-TITLE-FLOOR":
    "cited in docs/superpowers/plans/admin/2026-07-01-shows-720-title-floor.md +2 more — no entry as of 2026-08-02",
  "BL-STEP3-FULL-CREW-PREVIEW":
    "cited in docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-1":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-2":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-3":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-TRANSPORT-VIEWER-NAME-MATCH":
    "cited in lib/data/getShowForViewer.ts +3 more — no entry as of 2026-08-02",
  "BL-UNPUBLISH-TO-HELD":
    "cited in docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md — no entry as of 2026-08-02",
  "BL-VENUE-DEGRADED-TILE-LABEL":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-VERSION-AMBIGUOUS-V1-OVERRIDE":
    "cited in docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md — no entry as of 2026-08-02",
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

function definedIds(): Set<string> {
  const ids = new Set<string>();
  for (const rel of LEDGERS) {
    for (const id of ledgerIds(readFileSync(join(ROOT, rel), "utf8"), BACKLOG_OPTS)) {
      ids.add(id);
    }
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
