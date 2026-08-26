// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { Node, Project, ScriptTarget, SyntaxKind } from "ts-morph";
import {
  ACCEPTED_FORMS,
  attributeCanRender,
  classifyExpression,
  infraPredicateNames,
  scanCandidates,
  scanRoots,
  scannedFiles,
} from "./_renderFaultScan";
import { stripCommentsForFile } from "../_shared/stripComments";

// One scan for the file: the walk is over every .ts/.tsx under the derived
// roots and is the expensive part.
const CANDIDATES = scanCandidates();
const ACCEPTED = CANDIDATES.filter((c) => c.form !== "unknown");
const RESIDUE = CANDIDATES.filter((c) => c.form === "unknown");

/**
 * Fault branches whose guard matches NONE of the six accepted forms.
 *
 * Reported by name rather than silently dropped, which is the accept-set
 * discipline's own test: a recognizer that enumerates known forms is a
 * denylist, and the honest response to an unrecognized form is to name it.
 * Layer 0 and layer 2 are what actually cover these; layer 1 does not pretend
 * to. A new unknown form fails this test rather than passing unnoticed --
 * WHEN the guard is an if-statement, a switch case or a catch. On a ternary it
 * does not: that arm has no residue fallback, so an unclassifiable guard is
 * dropped in silence. The qualifier is here rather than omitted because the
 * unqualified sentence is what made two Dashboard entries look flag-shaped when
 * they are not. See BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY.
 */
const REPORTED_RESIDUE: Record<string, string> = {
  "app/admin/layout.tsx:83":
    "instanceof on an error class, not a kind comparison. The admin shell's failure screen — layer 0 catches it, because the capture selector disappears with the shell.",
  "app/admin/wizard/preview/[stagedId]/page.tsx:126":
    "a kind comparison against decode_error, not infra_error. Renders the same marked FailureSurface, so the DOM carries the marker even though the guard is outside the accept-set.",
  "components/admin/UseRawControl.tsx:433":
    "a string-state comparison against legacy-unavailable. Not reachable from any manifest entry.",
  "components/admin/wizard/step3ReviewSections.tsx:3755":
    "a bare boolean named `failed`, one hop from no resolvable infra source.",
  "components/tiles/OpeningReelVideo.tsx:33":
    "a media-element error flag, not a data-loading fault. Different fault domain from the one this instrument measures.",
};

/**
 * Sites layer 1's scanner does not reach, each with the cause it actually has.
 *
 * Named UNREACHED, not flag-shaped, and the rename is the repair: this registry
 * was called FLAG_RESIDUE while four of its seven rows had nothing to do with
 * the flag shape, and a registry whose reasons are wrong is worse than one with
 * gaps because it is read as settled. Live composition today, computed by the
 * suite below rather than asserted here: 4 `unreached-ternary`, 3
 * `unreached-no-ternary`, and 4 entries declaring a hand-marking.
 *
 * `unreached-no-ternary` -- the genuinely flag-shaped case. The guard site
 * returns no JSX at all, so no arm makes it a candidate, and tracing the flag to
 * the JSX that consumes it is dataflow this arc does not carry (spec section
 * 4.2). The registry is the honest substitute: each flag named, with the capture
 * output it can reach.
 *
 * `unreached-ternary` -- dropped by a DECLINED scanner asymmetry. Those guards
 * sit on a ternary whose `whenTrue` is the JSX, exactly the shape layer 1 claims
 * to reach. `scanCandidates` gives its `IfStatement` arm a vocabulary fallback
 * that reports an unclassifiable guard as `unknown` residue, and gives its
 * `ConditionalExpression` arm no fallback at all (`_renderFaultScan.ts:754`).
 * That arm's silent drop is a documented limit, not a gap left open: probed on
 * the live tree, 719 ternaries under the derived roots return JSX in `whenTrue`,
 * 79 of them carry a fault-vocabulary guard and are unclassifiable, and 70 of
 * those 79 sit in `"use client"` files -- interaction state, not a server-render
 * fault -- so the fallback would buy roughly three new server-side sites for 79
 * hand-written reasons.
 *
 * RE-FILE TRIGGER for the decline, computed rather than promised: the count of
 * server-component ternaries that are unclassifiable, fault-vocabulary AND
 * unregistered rises above 7, its resting value today. The suite asserts that
 * bound and re-derives both figures above, so neither can go stale silently --
 * which is how the previous pair (714 and 91) did in eight days.
 *
 * WHICH ARM holds the fault is deliberately not a cause. No AST predicate
 * decides it without a fault oracle this scanner does not have, so
 * `OnboardingWizard`'s false-arm blind spot lives in that entry's prose. A true
 * statement no checker can settle belongs in prose; inventing a checker for it
 * is recognizer growth this arc is directed against.
 *
 * Some entries are marked BY HAND. The scanner cannot enforce those and never
 * will under this design, but the flag was right there at authoring time and the
 * surface would otherwise encode "Unavailable" with nothing refusing. The count
 * is not written down here: the case below DERIVES it from the declarations, so
 * a newly hand-marked site is covered the moment it is declared.
 */ const UNREACHED_RESIDUE: Record<string, { cause: UnreachedCause; reason: string }> = {
  "components/admin/Dashboard.tsx:858:ignoredDegraded": {
    cause: "unreached-ternary",
    reason:
      "reaches dashboard-overview: adds a notice and removes warning badges. Dropped by the ConditionalExpression arm, whose guard classifyExpression cannot classify, not by shape.",
  },
  "components/admin/Dashboard.tsx:674:dataGapsDegraded": {
    cause: "unreached-ternary",
    reason:
      "reaches dashboard-overview: a shows_internal read failure removes data-quality badges. Same ternary shape and the same declined asymmetry.",
  },
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:101:SystemHealthCard.unavailable": {
    cause: "unreached-no-ternary",
    reason:
      "reaches no manifest capture today (/admin/dev/telemetry is unrouted), but renders Unavailable / Health check failed. MARKED BY HAND via the renderFault prop.",
  },
  "components/admin/telemetry/TelemetryOverviewStrip.tsx:230:EventsCard.isInfra": {
    cause: "unreached-no-ternary",
    reason: "same surface, renders Unavailable. MARKED BY HAND via the renderFault prop.",
  },
  "components/admin/IgnoredSheetsDisclosure.tsx:79:degraded": {
    cause: "unreached-ternary",
    reason:
      'reaches dashboard-overview and IS captured: Dashboard derives `degraded` from `ignoredResult.kind === "infra_error"` (Dashboard.tsx:489) and passes it here, where a `degraded ?` ternary renders a visible Couldn\'t-load chip on /admin. MARKED BY HAND via data-render-fault. Not scanner-reachable because the guard is a bare prop, so classifyExpression returns null and the ConditionalExpression arm drops it. Found by whole-diff review r1, which is the point worth recording: the residue registry named the ASSIGNMENT site in Dashboard and missed that the RENDER lives in another component.',
  },
  "components/admin/OnboardingWizard.tsx:803:OperatorErrorBlock": {
    cause: "unreached-ternary",
    reason:
      "reaches dashboard-overview and IS captured: the ternary at OnboardingWizard.tsx:803 renders it from the FALSE arm of `service.ok ? healthy : <OperatorErrorBlock />`, at OnboardingWizard.tsx:828, painting a Setup-is-paused section on /admin. MARKED BY HAND at the component, which renders the fault unconditionally, so the marker always reaches the DOM and the capture refuses. Unreachable for a DIFFERENT reason from the other ternaries: the arm inspects only `whenTrue`, so a fault in the false arm is invisible to it whatever its guard looks like. That distinction is prose because no AST predicate decides which arm holds the fault without a fault oracle the scanner does not have; the blind spot is declared here rather than widened into the recognizer.",
  },
  "app/admin/layout.tsx:130:inOnboarding": {
    cause: "unreached-no-ternary",
    reason: "assigns a routing flag and returns no JSX from that branch; fails open by design.",
  },
};

// ---- Ternary-arm decline, pinned (BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY) ----
//
// The ConditionalExpression arm keeps its bare `continue`. Everything below
// exists so that decision stays TRUE rather than merely written down: the
// numbers the arm's comment declares are re-derived and compared, the trigger
// that would re-open the decline is computed, and the sites the decline is
// about are pinned individually.
const FAULT_VOCABULARY = /error|fail|infra|degrad|unavailable|corrupt/i;

/**
 * The ternary sites the residue registry declares, DERIVED from the registry
 * itself plus the AST -- never a second hand-written list.
 *
 * Whole-diff review round 2 caught the parallel literal: a control that iterates
 * its own copy of the sites proves nothing about the registry, and the two can
 * drift apart silently. Reading the registry's keys and keeping the ones where a
 * ternary actually begins removes the duplicate, so a site added to the registry
 * is covered by these controls the day it lands.
 */
function registeredTernaries(): (readonly [string, number])[] {
  return Object.keys(UNREACHED_RESIDUE)
    .map((key) => parseSite(key))
    .filter((site) => ternaryStartsAt(site.file, site.line))
    .map((site) => [site.file, site.line] as const);
}

function containsJsx(node: Node | undefined): boolean {
  if (node === undefined) return false;
  if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node) || Node.isJsxFragment(node)) {
    return true;
  }
  return Boolean(
    node.getFirstDescendant(
      (d) => Node.isJsxElement(d) || Node.isJsxSelfClosingElement(d) || Node.isJsxFragment(d),
    ),
  );
}

const TERNARY_PROJECT = new Project({
  compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
  skipAddingFilesFromTsConfig: true,
});
TERNARY_PROJECT.addSourceFilesAtPaths(scannedFiles());

const CANDIDATE_KEYS = new Set(CANDIDATES.map((c) => `${c.file}:${c.line}`));

type TernaryRow = { file: string; line: number; client: boolean };

const TERNARY_SURVEY: { jsxTernaries: number; unclassifiedVocab: TernaryRow[] } = (() => {
  let jsxTernaries = 0;
  const unclassifiedVocab: TernaryRow[] = [];
  for (const path of scannedFiles()) {
    const source = TERNARY_PROJECT.getSourceFileOrThrow(path);
    const file = relative(process.cwd(), path);
    const raw = readFileSync(path, "utf8");
    const client = /^["']use client["'][ \t]*(?:;|$|\r?\n)/.test(
      stripCommentsForFile(raw, path).trimStart(),
    );
    for (const conditional of source.getDescendantsOfKind(SyntaxKind.ConditionalExpression)) {
      if (!containsJsx(conditional.getWhenTrue())) continue;
      jsxTernaries++;
      const line = conditional.getStartLineNumber();
      if (CANDIDATE_KEYS.has(`${file}:${line}`)) continue;
      if (!FAULT_VOCABULARY.test(conditional.getCondition().getText())) continue;
      unclassifiedVocab.push({ file, line, client });
    }
  }
  return { jsxTernaries, unclassifiedVocab };
})();

/** Lazy: the registry it filters against is declared further down this file. */
function unregisteredServer(): TernaryRow[] {
  const registered = registeredTernaries();
  return TERNARY_SURVEY.unclassifiedVocab.filter(
    (row) => !row.client && !registered.some(([f, l]) => f === row.file && l === row.line),
  );
}

describe("the ConditionalExpression arm's decline is pinned, not just written down", () => {
  it("the numbers the arm declares equal the numbers the tree computes", () => {
    // NOT "the comment exists". Both figures are re-derived and compared, so a
    // comment edited without a re-probe fails. The previous figures (714 and 91)
    // went stale in eight days, which is the concrete failure this catches.
    const armSource = readFileSync(join(process.cwd(), "tests/help/_renderFaultScan.ts"), "utf8");
    const declared = armSource.match(
      /Probed:\s*(\d+)\s+such ternaries under the derived roots,\s*(\d+)\s+on a/,
    );
    expect(declared, "the arm must declare both figures in a parseable form").not.toBeNull();
    expect(Number(declared![1])).toBe(TERNARY_SURVEY.jsxTernaries);
    expect(Number(declared![2])).toBe(TERNARY_SURVEY.unclassifiedVocab.length);
  });

  it("the re-file trigger has not tripped: at most 7 unregistered server-side sites", () => {
    // The computable set with NO unstated exclusion. An earlier draft set this at
    // 3, which discounted four emptiness checks by a rule the assertion never
    // applied and was tripped the moment it was written.
    //
    // DOCUMENTED LIMIT: a bound on a COUNT does not pin site identity. Swapping a
    // registered site for a new one leaves the count at 7 and passes. That is
    // deliberate -- this asks one question, has the unreached server-side
    // population GROWN, and a count is the right instrument. Site identity is
    // pinned in the residue registry, for the entries that carry a declared cause.
    const unregistered = unregisteredServer();
    expect(
      unregistered.length,
      unregistered.map((r) => `${r.file}:${r.line}`).join("\n"),
    ).toBeLessThanOrEqual(7);
  });

  it("the arm still does not reach the sites the decline is about", () => {
    // Asserted POSITIVELY per site. "No unknown candidate originates from a
    // ternary" is green in BOTH directions of the growth it claims to forbid: if
    // classifyExpression learns to recognise one of these guards, the site
    // becomes an ACCEPTED candidate rather than an unknown one, and the weaker
    // assertion never notices.
    for (const [file, line] of registeredTernaries()) {
      const source = TERNARY_PROJECT.getSourceFileOrThrow(join(process.cwd(), file));
      const conditional = source
        .getDescendantsOfKind(SyntaxKind.ConditionalExpression)
        .find((c) => c.getStartLineNumber() === line);
      expect(conditional, `${file}:${line} must still be a ternary`).toBeDefined();
      expect(
        classifyExpression(conditional!.getCondition(), infraPredicateNames(source)),
        `${file}:${line} became classifiable — classifyExpression grew, which the decline forbids`,
      ).toBeNull();
      expect(
        CANDIDATE_KEYS.has(`${file}:${line}`),
        `${file}:${line} became a candidate — the arm reached it`,
      ).toBe(false);
    }
  });
});

describe("the scanner's population is pinned against resolver drift", () => {
  it("scanCandidates reports exactly 35 candidates", () => {
    // Pinned HERE rather than in the server-time guard's suite, which needs the
    // same fact but would pay a second full project scan for it (measured: the
    // duplicate scan blew a 30s test timeout). CANDIDATES is already computed
    // once at module scope in this file.
    //
    // What this catches: `resolveSpecifier` gained two directory-index forms so
    // the server-time guard could derive its population correctly, and that
    // resolver is also how this scanner makes its two cross-file hops. Index
    // resolution can only ADD resolutions, so a moved count means the scanner
    // had been silently missing a predicate -- worth failing over either way.
    expect(CANDIDATES.length).toBe(35);
  });

  it("scanCandidates reports exactly the same file:line:form:marked SET", () => {
    // A count alone is not set stability: a resolver change that ADDS one
    // candidate and DROPS another leaves 35 and passes. Whole-diff review round
    // 1 caught the archive claiming the count prevented unnoticed movement,
    // which only this case makes true.
    //
    // Pinned as a digest over the sorted set rather than a 35-line literal: an
    // enumeration goes stale on any legitimate move and invites being
    // regenerated without being read, while a digest fails loudly and is
    // regenerated only deliberately.
    const digest = createHash("sha256")
      .update(
        CANDIDATES.map((c) => `${c.file}:${c.line}:${c.form}:${c.marked}`)
          .sort()
          .join("\n"),
      )
      .digest("hex");
    expect(digest).toBe("225ed22b3e0cfc6ea673c3a1fce3c30ae10a8159a64f81a73a0ec87a51e55558");
  });
});

// ---- Residue causes, DERIVED from the node at each entry's line ----
//
// Two causes, not three. An earlier design declared `flag-shaped`,
// `ternary-unclassified` and `ternary-when-false` behind three independent
// predicates, and review refuted it on the live nodes: three entries carry JSX
// in BOTH arms so "JSX in whenFalse" is true of them whatever arm holds the
// fault, all four unclassified ternaries satisfy "whenTrue contains JSX", and
// all four are absent from scanCandidates() so a candidate-absence reading of
// `flag-shaped` accepts every one. Three overlapping predicates cannot report
// zero false causes, because a wrong relabel passes all of them.
//
// Which arm holds the FAULT is what the dropped third cause wanted to record,
// and no AST predicate decides it without a fault oracle this scanner does not
// have. It stays in the entries' prose, which is where a true statement no
// checker can settle belongs.
type UnreachedCause = "unreached-no-ternary" | "unreached-ternary";
type Site = { file: string; line: number; flag: string };

function parseSite(key: string): Site {
  // `file:line:flag`. Split from the RIGHT: a path never ends in `:<digits>:<id>`
  // by accident, and the flag may itself be dotted (`SystemHealthCard.unavailable`).
  const lastColon = key.lastIndexOf(":");
  const flag = key.slice(lastColon + 1);
  const head = key.slice(0, lastColon);
  const secondColon = head.lastIndexOf(":");
  return { file: head.slice(0, secondColon), line: Number(head.slice(secondColon + 1)), flag };
}

/** The flag's own identifier: `SystemHealthCard.unavailable` looks for `unavailable`. */
const identifierOf = (flag: string): string => flag.slice(flag.lastIndexOf(".") + 1);

const sourceAt = (file: string) => TERNARY_PROJECT.getSourceFileOrThrow(join(process.cwd(), file));

function ternaryAt(file: string, line: number) {
  return sourceAt(file)
    .getDescendantsOfKind(SyntaxKind.ConditionalExpression)
    .find((c) => c.getStartLineNumber() === line);
}

const ternaryStartsAt = (file: string, line: number): boolean =>
  ternaryAt(file, line) !== undefined;
const candidateAt = (file: string, line: number): boolean => CANDIDATE_KEYS.has(`${file}:${line}`);

/**
 * BOTH conjuncts are load-bearing.
 *
 * The structural half alone would label a reached IfStatement candidate
 * unreached -- `components/admin/settings/AdministratorsSection.tsx:54` is one,
 * marked and returning JSX, with no conditional at that line. The
 * candidate-absence half alone accepted all four ternary entries. Only the
 * conjunction establishes what this registry claims of every row: unreached.
 */
function isUnreachedNoTernary(site: Site): boolean {
  return !ternaryStartsAt(site.file, site.line) && !candidateAt(site.file, site.line);
}

function isUnreachedTernary(site: Site): boolean {
  const conditional = ternaryAt(site.file, site.line);
  if (conditional === undefined) return false;
  return (
    classifyExpression(conditional.getCondition(), infraPredicateNames(sourceAt(site.file))) ===
    null
  );
}

/** Exactly one cause per site, so a wrong relabel fails rather than agreeing. */
function deriveCause(site: Site): UnreachedCause | null {
  if (isUnreachedTernary(site)) return "unreached-ternary";
  if (isUnreachedNoTernary(site)) return "unreached-no-ternary";
  return null;
}

/**
 * The coordinate is VERIFIED, per cause, and each half asserts uniqueness.
 *
 * A ternary entry's line is where the flag is USED; a flag entry's line is where
 * it is DECLARED. One uniform rule cannot fit both -- requiring a declaration at
 * a ternary's line is unsatisfiable. Text-mention alone is also too weak:
 * `dataGapsDegraded` appears in three of Dashboard's ternaries, and only the
 * conjunction with the cause predicates picks out the registered one.
 */
function uniqueCoordinate(site: Site): boolean {
  const identifier = identifierOf(site.flag);
  const source = sourceAt(site.file);
  const mentions = new RegExp(`\\b${identifier}\\b`);

  if (ternaryStartsAt(site.file, site.line)) {
    const qualifying = source.getDescendantsOfKind(SyntaxKind.ConditionalExpression).filter((c) => {
      const line = c.getStartLineNumber();
      if (candidateAt(site.file, line)) return false;
      if (!containsJsx(c.getWhenTrue()) && !containsJsx(c.getWhenFalse())) return false;
      return mentions.test(c.getText());
    });
    return qualifying.length === 1 && qualifying[0]!.getStartLineNumber() === site.line;
  }

  const declarations = source.getDescendants().filter((d) => {
    if (
      !Node.isVariableDeclaration(d) &&
      !Node.isParameterDeclaration(d) &&
      !Node.isBindingElement(d) &&
      !Node.isPropertyAssignment(d) &&
      !Node.isShorthandPropertyAssignment(d)
    ) {
      return false;
    }
    return d.getName() === identifier;
  });
  return declarations.length === 1 && declarations[0]!.getStartLineNumber() === site.line;
}

describe("every residue entry's declared cause is COMPUTED, not asserted in prose", () => {
  it("each entry's declared cause equals the cause derived from the node at its line", () => {
    // The defect BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY is actually about:
    // four of seven entries sat under a cause they do not have, in a registry
    // read as settled. Prose cannot fail; a derivation compared to a declaration
    // can. ONE function returns exactly one cause per site, so the two causes are
    // mutually exclusive by construction rather than by separate predicates
    // happening to agree.
    const wrong: string[] = [];
    for (const [site, entry] of Object.entries(UNREACHED_RESIDUE)) {
      const derived = deriveCause(parseSite(site));
      if (derived !== entry.cause)
        wrong.push(`${site}: declared ${entry.cause}, derived ${derived}`);
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("each entry's coordinate is verified and UNIQUE in its file, per cause", () => {
    // Round 3 of the plan review blocked an earlier single rule here: requiring a
    // declaration at the line is right for a flag site and impossible for a
    // ternary site, whose line is where the flag is USED. The two causes put
    // their coordinate at different kinds of node, so the contract is per cause.
    // Each half asserts UNIQUENESS rather than existence -- a text match alone
    // was measured insufficient, since `dataGapsDegraded` appears in three of
    // Dashboard's ternaries.
    for (const site of Object.keys(UNREACHED_RESIDUE)) {
      const parsed = parseSite(site);
      expect(uniqueCoordinate(parsed), `${site} does not resolve to exactly one node`).toBe(true);
    }
  });

  it("control: a REACHED candidate at a line with no ternary is not unreached-no-ternary", () => {
    // Pins the candidate-absence conjunct. Derived from scanCandidates(), never
    // named: a literal site list goes stale as the corpus moves. Deleting that
    // conjunct labels every reached IfStatement candidate unreached.
    const control = CANDIDATES.find((c) => !ternaryStartsAt(c.file, c.line));
    premise("some candidate sits at a line where no ternary begins", control ? 1 : 0, 0);
    expect(isUnreachedNoTernary({ file: control!.file, line: control!.line, flag: "" })).toBe(
      false,
    );
  });

  it("control: a registered ternary site is not unreached-no-ternary", () => {
    // Pins the no-ternary conjunct, which was entirely unpinned until plan review
    // round 2 wrote the branch-ordered derivation that omits it and still routes
    // all seven entries correctly.
    for (const [file, line] of registeredTernaries()) {
      expect(
        isUnreachedNoTernary({ file, line, flag: "" }),
        `${file}:${line} is a ternary and must fail the no-ternary conjunct`,
      ).toBe(false);
    }
  });

  it("control: a CLASSIFIED ternary candidate is not unreached-ternary", () => {
    // Pins the classifyExpression === null conjunct. Derived, not named.
    const control = CANDIDATES.find((c) => c.form !== "unknown" && ternaryStartsAt(c.file, c.line));
    premise("some accepted candidate originates at a ternary", control ? 1 : 0, 0);
    expect(isUnreachedTernary({ file: control!.file, line: control!.line, flag: "" })).toBe(false);
  });
});

describe("the unreached residue is named, since no scan can reach it", () => {
  it("gives every registered flag a reason naming what it reaches", () => {
    expect(Object.keys(UNREACHED_RESIDUE).length).toBeGreaterThan(0);
    for (const [site, { reason }] of Object.entries(UNREACHED_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
      expect(site, `${site} must name a file and a flag`).toContain(":");
    }
  });

  it("every entry CLAIMING a hand-marking really carries one", () => {
    // DERIVED from the declarations, not a written-down list. The previous
    // version of THIS CASE named "the two hand-marked flags" as a literal and read
    // one file, so when a
    // THIRD hand-marked site was added by a review repair the registry kept
    // claiming a marker nothing checked -- deleting that marker would have left
    // the scan at 35 candidates, 30 accepted, five residues, all green.
    //
    // The declaration is now the trigger: say "MARKED BY HAND" in an entry's
    // reason and this case reads that entry's file and demands the attribute.
    // A new hand-marked site is covered the moment it is declared, and a
    // declaration whose marker was removed fails here rather than lying.
    const claimed = Object.entries(UNREACHED_RESIDUE).filter(([, { reason }]) =>
      reason.includes("MARKED BY HAND"),
    );
    premise("some unreached-residue entry claims a hand-marking", claimed.length, 0);

    for (const [site] of claimed) {
      const { file, flag } = parseSite(site);
      // The flag's own identifier, so `SystemHealthCard.unavailable` looks for
      // `unavailable`. Two entries can name the SAME file, which is why a
      // file-scoped check is not enough: TelemetryOverviewStrip declares two
      // and carries four marker occurrences, so deleting one of the two left a
      // surviving mutant under the previous version of this case.
      const identifier = identifierOf(flag);
      // Comment lines are dropped BEFORE matching. A commented-out marker is
      // exactly the state this case exists to catch -- someone disabling the
      // attribute while the declaration still claims it -- and a line regex
      // counted it as proof the marker was there.
      const isComment = (line: string): boolean => /^\s*(?:\/\/|\*|\/\*|\{\s*\/\*)/.test(line);
      const lines = readFileSync(join(process.cwd(), file), "utf8")
        .split("\n")
        .map((line) => (isComment(line) ? "" : line));
      // Marker presence is decided STRUCTURALLY, by the scanner's own predicate,
      // reduced to the line numbers these text shapes work in.
      //
      // All three shapes below used to ask a regex, `/(?:data-render-fault|
      // renderFault)\s*=/`. That matches the SPELLING, not the guarantee, so
      // `data-render-fault={undefined}` satisfied every one of them -- React
      // omits an attribute whose value is `undefined`, so the DOM receives no
      // marker at all. Round 6 replaced each of the four hand markers with that
      // form and this assertion still passed, on all four. A guard that accepts
      // the degraded form of the very thing it certifies is not a guard.
      //
      // Round 5's sabotage only ever DELETED markers, which the regex did catch.
      // Degradation is the case it never tried.
      //
      // The predicate is `attributeCanRender`, NOT `attributeAlwaysPresent`. A
      // hand-marked fault site is conditional by design -- `{isInfra ?
      // "telemetry-events" : undefined}` must not mark a healthy render -- so
      // demanding "always" fails correct code, as it did on
      // TelemetryOverviewStrip.tsx:252 when this repair first used it. The
      // probe's actual content is that a marker which can NEVER render passed.
      const markerLines = ((): Set<number> => {
        const project = new Project({
          compilerOptions: { target: ScriptTarget.Latest, jsx: 4 },
          skipAddingFilesFromTsConfig: true,
        });
        const source = project.addSourceFileAtPath(join(process.cwd(), file));
        const found = new Set<number>();
        const elements = [
          ...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
          ...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
        ];
        for (const element of elements) {
          if (!attributeCanRender(element)) continue;
          for (const attribute of element.getAttributes()) {
            if (!Node.isJsxAttribute(attribute)) continue;
            const attributeName = attribute.getNameNode().getText();
            if (attributeName !== "data-render-fault" && attributeName !== "renderFault") continue;
            found.add(attribute.getStartLineNumber() - 1);
          }
        }
        return found;
      })();
      const named = new RegExp(`\\b${identifier}\\b`);

      // TWO shapes, both real, and the check names them rather than accepting
      // any marker anywhere near the flag. A generous proximity window let a
      // NEIGHBOURING site's marker satisfy this one: TelemetryOverviewStrip
      // declares two residues and carries four other marker occurrences, so
      // deleting one of the two still passed.
      //
      //   A. the marker expression names the flag, on its own line:
      //        renderFault={unavailable ? "telemetry-system-health" : undefined}
      //   B. the flag opens a ternary and the marker sits inside that branch:
      //        {degraded ? (  ...  data-render-fault="dashboard-ignored-sheets"
      const sameLine = lines.some((line, i) => markerLines.has(i) && named.test(line));

      // C. the entry names a COMPONENT and the marker lives in its body:
      //      export function OperatorErrorBlock() { ... data-render-fault=... }
      //    Scanned from the declaration to the next top-level one, so a marker
      //    belonging to a LATER component cannot satisfy this entry.
      const declared = lines.findIndex((line) =>
        new RegExp(`(?:function|const)\\s+${identifier}\\b`).test(line),
      );
      const declaresMarker =
        declared !== -1 &&
        (() => {
          const rest = lines.slice(declared + 1);
          const nextTop = rest.findIndex((line) =>
            /^(?:export\s+)?(?:function|const)\s+\w/.test(line),
          );
          const bodyEnd = nextTop === -1 ? lines.length : declared + 1 + nextTop;
          for (let i = declared + 1; i < bodyEnd; i += 1) if (markerLines.has(i)) return true;
          return false;
        })();
      const GUARD_WINDOW = 15;
      const guardsBranch = lines.some((line, i) => {
        if (!new RegExp(`\\b${identifier}\\s*\\?`).test(line)) return false;
        for (let k = i; k < Math.min(i + GUARD_WINDOW, lines.length); k += 1)
          if (markerLines.has(k)) return true;
        return false;
      });

      expect(
        sameLine || guardsBranch || declaresMarker,
        `${site} declares MARKED BY HAND but no marker in ${file} is tied to \`${identifier}\`: ` +
          `no marker line names it, no \`${identifier} ?\` branch opens one within ${GUARD_WINDOW} lines, ` +
          `and no \`${identifier}\` declaration carries one in its body`,
      ).toBe(true);
    }
  });
});

describe("the population is DERIVED from the manifest, not written down", () => {
  it("scans components plus the manifest's own app segments", () => {
    expect(scanRoots()).toEqual(["app/admin", "components"]);
  });

  it("finds a non-trivial population, so a silently empty scan cannot pass", () => {
    // Every assertion in this file is vacuously true over an empty set. This is
    // the premise they discriminate under, stated executably. It goes through
    // the shared helper so a premise failure reads as one -- "the scan found
    // nothing" is a different fact from "a branch is unmarked", and an
    // ordinary expect() reports them in the same voice.
    premise("the derived scan reaches accepted fault branches", ACCEPTED.length, 20);
    premise(
      "those branches span more than one file",
      new Set(ACCEPTED.map((c) => c.file)).size,
      10,
    );
  });

  /**
   * A form in the accept-set that no live branch exercises is a rule nothing
   * tests. Each such form is DECLARED with why it is unreachable today, so the
   * gap is visible rather than inferred from a passing suite.
   */
  const UNEXERCISED: Record<string, string> = {
    "switch-case":
      "the live switch on a result kind is app/show/[slug]/[shareToken]/page.tsx:220, under app/show. No manifest entry routes there today, so app/show is not a derived root and the branch is outside the scan. It becomes exercised the day a crew-show entry is added — which is the point of deriving roots rather than listing them. Consequence worth naming, since it is an asymmetry a reader will otherwise read as an oversight: components/auth/TerminalFailure.tsx carries no marker, while components/crew/SectionTileError.tsx does. Both live under a derived root, but the marker belongs to a GUARD, and SectionTileError has ten guarded call sites inside the scan while TerminalFailure's only guard is that unreachable switch. Marking the component anyway would assert a fault the scan cannot corroborate. The same crew-show manifest entry re-arms both.",
  };

  it("exercises every accepted guard form, or declares why it cannot", () => {
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of ACCEPTED_FORMS) {
      if (seen.has(form)) continue;
      expect(
        UNEXERCISED[form],
        `the ${form} form is accepted but no live branch exercises it, and it is not declared unexercised`,
      ).toBeTruthy();
    }
  });

  it("does not declare a form unexercised while a live branch exercises it", () => {
    // The stale-declaration direction: a form that BECOMES reachable must lose
    // its excuse, or the excuse outlives the gap it described.
    const seen = new Set(ACCEPTED.map((c) => c.form));
    for (const form of Object.keys(UNEXERCISED)) {
      expect(seen, `${form} is exercised now; drop its UNEXERCISED entry`).not.toContain(form);
    }
  });
});

describe("every JSX-returning fault branch the three reporting arms reach carries the marker", () => {
  it("leaves none unmarked", () => {
    const unmarked = ACCEPTED.filter((c) => !c.marked).map(
      (c) => `${c.file}:${c.line} (${c.form})`,
    );
    expect(unmarked).toEqual([]);
  });
});

describe("the residue is reported by name on the three arms that report one", () => {
  it("pins every unrecognized form with a reason", () => {
    const found = RESIDUE.map((c) => `${c.file}:${c.line}`).sort();
    expect(found).toEqual(Object.keys(REPORTED_RESIDUE).sort());
  });

  it("gives each residue member a non-empty reason", () => {
    for (const [site, reason] of Object.entries(REPORTED_RESIDUE)) {
      expect(reason.length, `${site} needs a reason`).toBeGreaterThan(20);
    }
  });
});
