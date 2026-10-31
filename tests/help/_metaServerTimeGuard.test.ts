// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { stripCommentsForFile } from "../_shared/stripComments";
import { premise } from "../_shared/premise";
import { deriveImportedLibFiles, resolveSpecifier } from "./_renderFaultScan";
import { Project, ScriptTarget } from "ts-morph";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN_PATTERNS = [/\bnew Date\(\s*\)/, /\bDate\.now\(\s*\)/];
const WAIVER_COMMENT = /\/\/\s*not-render-side:/;

function discoverScanRoots(): string[] {
  const roots = new Set<string>(["components"]);
  const manifestPath = join(process.cwd(), "scripts/help-screenshots.manifest.ts");

  if (!existsSync(manifestPath)) {
    roots.add("app/show");
    roots.add("app/admin");
    // R2 finding (M11 Phase C): app/me was missing from the fallback set;
    // `MeShowSections` held a direct render-side `new Date()` that the
    // guard never scanned. The manifest-derived path (Phase F) will
    // include any route the screenshot harness captures, so this fallback
    // becomes moot post-Phase F — but pre-Phase F we must enumerate
    // every user-facing app/<segment>/ route here.
    roots.add("app/me");
    return [...roots].sort();
  }

  const src = readFileSync(manifestPath, "utf8");
  const routes = [...src.matchAll(/route:\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((route): route is string => Boolean(route));
  for (const route of routes) {
    const segment = route.split("/").filter(Boolean)[0];
    if (segment) roots.add(join("app", segment));
  }

  return [...roots].sort();
}

function walkTsTsx(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsTsx(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

/** Synthetic sources in the pins below are TSX-shaped. */
function stripSyntheticSource(src: string): string {
  return stripCommentsForFile(src, "synthetic.tsx");
}

function isClientComponent(src: string): boolean {
  // Strip comments (shared module), then the first non-whitespace token is the first
  // real statement — no hand-rolled comment-skipping needed.
  return /^["']use client["'][ \t]*(?:;|$|\r?\n)/.test(stripSyntheticSource(src).trimStart());
}

function findViolations(files: string[]): string[] {
  const violations: string[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (file.endsWith("lib/time/now.ts")) continue;
    if (isClientComponent(src)) continue;

    const strippedLines = stripCommentsForFile(src, file).split("\n");
    const originalLines = src.split("\n");

    for (let i = 0; i < strippedLines.length; i++) {
      const strippedLine = strippedLines[i] ?? "";
      const originalLine = originalLines[i] ?? "";
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(strippedLine) && !WAIVER_COMMENT.test(originalLine)) {
          violations.push(`${relative(process.cwd(), file)}:${i + 1}: ${originalLine.trim()}`);
        }
      }
    }
  }

  return violations;
}

describe("Server-time grep guard — multi-violation regex stability (r2)", () => {
  it("reports BOTH forbidden calls on adjacent lines at different columns", () => {
    const synthetic = [
      "const a = computeSomethingLongAndDescriptive_takingHere_with_padding_paddingX = new Date();",
      "const b = new Date();",
    ].join("\n");

    const violations: string[] = [];
    synthetic.split("\n").forEach((line, i) => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) violations.push(`L${i + 1}`);
      }
    });

    expect(violations).toEqual(["L1", "L2"]);
  });
});

describe("Server-side time-call grep guard (test #16 — AC-11.38)", () => {
  const scanRoots = discoverScanRoots();
  const allFiles = scanRoots.flatMap((root) => walkTsTsx(join(process.cwd(), root)));
  const violations = findViolations(allFiles);

  it(`has at least one scan root (got ${scanRoots.join(", ")})`, () => {
    expect(scanRoots.length).toBeGreaterThan(0);
  });

  it("every render-side time call uses lib/time/now.ts or carries a per-line waiver", () => {
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ---- Direct-render-import widening (BL-SERVER-TIME-GUARD-EXCLUDES-LIB) ----
  //
  // The population below is the guard's ROOT WALK plus every lib/** module those
  // files import DIRECTLY at runtime. Depth 1, not the transitive closure: a
  // module a rendered file imports directly is on the render path, while one
  // four hops behind it is in the same module graph for reasons that have
  // nothing to do with rendering. Measured ONCE, 2026-08-27, to settle the depth:
  // depth 1 was 215 lib files and 13 violations, unbounded 396 and 31, the whole
  // directory 532 and 55; all three reach the survivor, and every violation
  // unbounded depth adds sits in a module whose only app/ importers are under
  // app/api/** or a cron path. Those are a dated comparison of three walks, not a
  // claim about today's tree -- the live depth-1 count is the assertion below, and
  // it has moved since (219 as of the 2026-08-29 three-way merge).
  const libFiles = deriveImportedLibFiles(allFiles);
  const libViolations = findViolations(libFiles);

  it("premise: the derived lib population is non-empty and contains the known survivor", () => {
    // Without these, a widening whose resolver returns nothing passes
    // unconditionally forever -- which is the exact shape the guard-premise rule
    // exists to stop, and it would look identical to a clean run.
    premise("the direct-import widening reaches lib/**", libFiles.length, 0);
    expect(
      libFiles.some((f) => f.endsWith("lib/admin/loadAppEvents.ts")),
      "the widening must contain the survivor it was built to reach",
    ).toBe(true);
  });

  it("resolveSpecifier resolves each live specifier shape, and refuses the rest", () => {
    // The population above is only as wide as this resolver. Whole-diff review
    // round 1 caught these cases promised and not shipped: without them the
    // resolver could silently narrow and the widening would still look clean,
    // which is the exact defect shape this arc closes.
    const project = new Project({
      compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
      skipAddingFilesFromTsConfig: true,
    });
    const anchor = project.addSourceFileAtPath(
      join(process.cwd(), "tests/help/_renderFaultScan.ts"),
    );

    // Alias, and a DIRECTORY INDEX — the form whose absence made the population 209.
    expect(resolveSpecifier(anchor, "@/lib/time/now")?.getFilePath()).toMatch(
      /lib\/time\/now\.ts$/,
    );
    expect(resolveSpecifier(anchor, "@/lib/log")?.getFilePath()).toMatch(/lib\/log\/index\.ts$/);
    // Relative, resolved against the IMPORTING file's directory.
    expect(resolveSpecifier(anchor, "./_metaServerTimeGuard.test")?.getFilePath()).toMatch(
      /tests\/help\/_metaServerTimeGuard\.test\.ts$/,
    );
    // A bare package specifier is not ours to resolve, and a dangling path resolves to nothing.
    expect(resolveSpecifier(anchor, "react")).toBeNull();
    expect(resolveSpecifier(anchor, "@/lib/this-module-does-not-exist")).toBeNull();
  });

  it("the computed population CONTAINS lib/admin/loadAppEvents.ts", () => {
    // Asserted by direct containment, never by a root count: the root-count case
    // above passes over an empty widening.
    expect(libFiles.map((f) => relative(process.cwd(), f))).toContain("lib/admin/loadAppEvents.ts");
  });

  // The population's size, pinned once: the case title and its assertion both read
  // it, so the title cannot drift from the number the guard asserts (it read 233 over
  // an assertion of 236 until whole-diff review R4-F5). Re-derive by running this
  // guard, never by adding up the members named below.
  const DERIVED_LIB_POPULATION = 248;

  it(`the derived lib population has exactly ${DERIVED_LIB_POPULATION} members, including both directory-index modules`, () => {
    // The shipped resolver tried only <base>.ts and <base>.tsx, so five live
    // imports of @/lib/log and @/lib/parser missed and the population was 209.
    // Neither missed module holds a time violation, so the count of 13 was
    // unaffected -- the guard would have reported clean over a population two
    // files smaller than the one the ladder measured.
    const rel = libFiles.map((f) => relative(process.cwd(), f));
    expect(rel).toContain("lib/log/index.ts");
    expect(rel).toContain("lib/parser/index.ts");
    // 212 -> 214 (fix/observe-error-telemetry): components/observe/GlobalErrorListener.tsx
    // is a rendered file and now imports TWO lib/observe modules directly, so both
    // join the depth-1 population. Neither makes a time call, and the violation
    // count below is unchanged at 13.
    //
    // The count moved by two rather than one, which is worth stating because the
    // first attempt at this number said 213 and named only describeClientValue.
    // That module is new; clientErrorTransport.ts already existed on main and was
    // reached only at depth 2 or deeper, so it looked like a member already and
    // was not. Both were verified absent from the population at origin/main by
    // the same derivation, not reasoned about: neither module has a single
    // depth-1 importer under components/ or app/admin/ there.
    //
    // Asserted by containment as well as by the count, per the case above: a root
    // count alone cannot say WHICH member joined, and it passes just as happily on
    // a widening that swapped one member for another.
    expect(rel).toContain("lib/observe/describeClientValue.ts");
    expect(rel).toContain("lib/observe/clientErrorTransport.ts");
    // 214 -> 215 (2026-08-27): lib/admin/warningAttention.ts, the shared
    // needs-look/judgment partition both review modals import directly. Named
    // as well as counted, per the note above: a count alone cannot say WHICH
    // member joined, and it passes just as happily on a swap.
    expect(rel).toContain("lib/admin/warningAttention.ts");
    // 215 -> 219 (2026-08-29, MERGE of three concurrent population changes).
    // The number below is RE-DERIVED against the merged tree, never added up from
    // the diffs -- which matters most where the arithmetic looks easy: the other
    // parent's two moves happen to cancel (escapeClaim.ts joined, fitWithinClip.ts
    // left), so a reader adding up its net would conclude nothing of that branch
    // survived here. Both of its moves are real and both are named below. Every
    // arrival and every departure is named as well as counted, because a bare count
    // cannot tell "one left and one joined" from "nothing changed".
    //
    // Joined, from wizard-warning-ignore-controls — four, of which only three are
    // new files, which is exactly why this block names members instead of trusting
    // the count. The fourth, lib/admin/loadIgnoredWarnings.ts, already existed and
    // joined because a RENDERED file (OnboardingWizard) now imports it directly for
    // the first time.
    expect(rel).toContain("lib/admin/wizardWarningModel.ts");
    expect(rel).toContain("lib/admin/enrichStep3WarningModels.ts");
    expect(rel).toContain("lib/admin/activeWarningEntries.ts");
    expect(rel).toContain("lib/admin/loadIgnoredWarnings.ts");
    // That arc's own fourth new module, lib/sync/carryStagedIgnoredWarnings.ts, is
    // deliberately ABSENT: it is reached only from the finalize / phase-2 path, which
    // is not on the render walk. That is the depth-1 rule working, not an omission,
    // and it is asserted so a later widening cannot pull it in unnoticed.
    expect(rel).not.toContain("lib/sync/carryStagedIgnoredWarnings.ts");
    // Joined, from published-escape-consumed-claim: lib/admin/escapeClaim.ts, the
    // published review modal's consumed-key decision. It lives in lib rather than
    // inline in the component because the branch it decides is reachable only in a
    // state jsdom cannot stage, so the decision is tested directly, not by proxy.
    expect(rel).toContain("lib/admin/escapeClaim.ts");
    // LEFT, from attention-panel-left-overflow-narrow: it deleted
    // components/admin/useFitWithinClip.ts, the only depth-1 importer of
    // lib/layout/fitWithinClip.ts under components/ or app/admin/. That module is
    // NOT retired — lib/popover/place.ts still imports MIN_FITTED_HEIGHT from it —
    // it is simply no longer reachable at depth 1.
    expect(rel).not.toContain("lib/layout/fitWithinClip.ts");
    // Joined, from wizard-report-draft-escape: lib/admin/reportDraftStore.ts, the
    // wizard report draft's sessionStorage persistence. Same shape as
    // escapeClaim.ts above and for a kindred reason — it lives in lib rather
    // than inline in the component because the source-mutation runner overlays
    // only modules a Vitest suite imports, and five module-private helpers
    // inside a 5000-line component are reachable by neither an import nor a
    // mutant. Depth-1 from components/admin/wizard/step3ReviewSections.tsx.
    expect(rel).toContain("lib/admin/reportDraftStore.ts");
    // 220 -> 221 on the ref-error-cell-anchors merge of main: ONE module joined from this
    // arc, lib/sheet-links/sheetCellReference.ts, a pure string formatter with no clock
    // read. main's own +1 (lib/admin/reportDraftStore.ts) is already counted above.
    // Joined, from fix/dress-code-hierarchy: lib/crew/dressCodeLines.ts, the dress
    // code phase/attire parser. Depth-1 from components/crew/DressCodeLines.tsx, which
    // both the crew Today card and the admin step-3 row render. Pure string parsing,
    // no clock read. 221 -> 222.
    expect(rel).toContain("lib/crew/dressCodeLines.ts");
    // Joined, from fix/post-onboarding-alert-noise: lib/dataQuality/partitionByIgnored.ts,
    // now imported by components/admin/Dashboard.tsx so the warning badge drops ignored
    // warnings the same way the show pop-up does. A pure partition over a fingerprint
    // set, no clock read. 222 -> 223.
    expect(rel).toContain("lib/dataQuality/partitionByIgnored.ts");
    // Joined, from the crew search Travel section task: lib/search/entryId.ts and
    // lib/search/normalize.ts, now imported by components/crew/sections/travelRows.ts,
    // the Travel row derivations TravelSection renders from. A content hash and a
    // tokenizer, no clock read. 223 -> 225.
    expect(rel).toContain("lib/search/entryId.ts");
    expect(rel).toContain("lib/search/normalize.ts");
    // The crew search Budget section task (Task 6) reaches lib/search/entryId.ts
    // too, depth-1 from components/crew/sections/budgetRows.ts, the Budget rows
    // module BudgetSection renders from. Already a member through travelRows.ts,
    // so nothing joins: 225 -> 225, re-derived on the merged tree.
    // The crew search Schedule section task (Task 11) reaches lib/search/entryId.ts and
    // lib/search/normalize.ts too, imported directly by
    // components/crew/sections/scheduleRows.ts, the rows module ScheduleSection and its
    // search builder share. Already members through travelRows.ts, so nothing joins:
    // 225 -> 225, re-derived on the merged tree.
    // Joined, from feat/crew-show-search (Task 15): lib/search/match.ts (the
    // matcher, imported by components/crew/search/CrewSearchProvider.tsx) and
    // lib/search/copy.ts (the search UI's strings, imported by
    // components/crew/search/CrewSearchField.tsx). Pure: no clock read in
    // either. 225 -> 227, re-derived on the merged tree by running this guard
    // (the Task 15 branch read 223 -> 225 on its own base, before the section
    // tasks' entryId.ts and normalize.ts joined).
    expect(rel).toContain("lib/search/match.ts");
    expect(rel).toContain("lib/search/copy.ts");
    // Joined, from feat/crew-show-search (Task 17): lib/search/snippet.ts, the
    // result-row snippet window, imported by
    // components/crew/search/CrewSearchResults.tsx. Pure, no clock read.
    // 227 -> 228, re-derived on the merged tree by running this guard (225 -> 226
    // on the branch's own base).
    expect(rel).toContain("lib/search/snippet.ts");
    // The crew search miss-logging task (Task 18) imports lib/search/normalize.ts
    // directly from components/crew/search/CrewSearchProvider.tsx, to key each
    // missed query once per page load. Pure, no clock read. On its own base this
    // joined the module (226 -> 227); on the tree merged with the section tasks it
    // is already a member through travelRows.ts, so nothing joins: 228 -> 228,
    // re-derived by running this guard.
    expect(rel).toContain("lib/search/normalize.ts");
    // 228 -> 233 on the merge of origin/main (crew show search, above) into
    // feat/crew-page-redesign. That arc grew this population from 223 on its own
    // base (223 -> 226 -> 228); the merged tree was re-derived by running this
    // guard, not by adding the two sides up. FIVE modules joined and none left,
    // each because a RENDERED file imports it directly; none makes a clock read,
    // and the waiver set and violation count below are unchanged.
    //   lib/crew/generalSessionRoom.ts, the general-session room rule lifted out
    //   of the Venue section; on the merged tree its importer is
    //   components/crew/sections/venueRows.ts, the rows module VenueSection and
    //   the search index share.
    //   lib/crew/transportLegs.ts, the visible transport-leg rule lifted out of
    //   the Travel section; on the merged tree its importer is
    //   components/crew/sections/travelRows.ts.
    //   lib/ui/scrollLock.ts, the shared body scroll lock, imported by
    //   components/agenda/AgendaEmbed.tsx, components/diagrams/GalleryLightbox.tsx,
    //   components/admin/FinalizeButton.tsx and
    //   components/admin/review/ReviewModalShell.tsx in place of each one's own
    //   save-and-restore of body overflow.
    // The arc's other new lib modules were ABSENT at this point: only other lib
    // modules imported them, so they sat at depth 2. sectionPeek still does (asserted
    // below); quickFacts joined in Task 11 and passModel in Task 9 (both below).
    expect(rel).toContain("lib/crew/generalSessionRoom.ts");
    expect(rel).toContain("lib/crew/transportLegs.ts");
    expect(rel).toContain("lib/ui/scrollLock.ts");
    // And two from that arc's Task 6:
    //   lib/ui/scrollSpy.ts, the scroll-spy rule moved out of
    //   components/admin/review/ShowReviewSurface.tsx, imported by it and by
    //   components/crew/CrewSections.tsx.
    //   lib/crew/crewSections.ts, now imported directly by
    //   components/crew/CrewSections.tsx, app/show/[slug]/[shareToken]/_CrewShell.tsx
    //   and both crew loading skeletons (the one section-label source), and on
    //   the merged tree by components/crew/search/CrewSearchResults.tsx too (its
    //   chip and group labels, `crewSectionLabel`).
    // Neither makes a clock read.
    expect(rel).toContain("lib/ui/scrollSpy.ts");
    expect(rel).toContain("lib/crew/crewSections.ts");
    // 233 -> 234 (crew page redesign plan Task 9): lib/crew/passModel.ts joins.
    // The pass (components/crew/CrewPass.tsx), a rendered file, calls its
    // `passStatusLine` and `spokenDate` at runtime; until now only type imports
    // and the shell reached it. Pure, no clock read: the builder takes `today` and
    // the status line takes `now` as arguments. The two modules only the retired
    // hero imported directly, lib/crew/agendaDisplay.ts and lib/format/date.ts,
    // stay members through their other rendered importers. Re-derived by running
    // this guard.
    expect(rel).toContain("lib/crew/passModel.ts");
    // 234 -> 233 (crew page redesign plan Task 10): the run-of-show card left
    // TodaySection for the home. lib/crew/runOfShowCard.ts joins: the card
    // (components/crew/CrewRunOfShowCard.tsx), todayRows.ts, CrewSections.tsx and
    // the shell import it, pure and clockless (the builder takes `today`). Two
    // leave, because their only depth-1 runtime importer was todayRows.ts and the
    // run-of-show derivation moved into that lib module: lib/crew/agendaDayForToday.ts
    // and lib/crew/showDayTimeline.ts (ShowDayTimelineList.tsx imports a type from
    // it, which the walk does not count). Neither is retired; both sit at depth 2.
    expect(rel).toContain("lib/crew/runOfShowCard.ts");
    expect(rel).not.toContain("lib/crew/agendaDayForToday.ts");
    expect(rel).not.toContain("lib/crew/showDayTimeline.ts");
    // 233 -> 233 (crew page redesign plan Task 11, the composed home retiring
    // TodaySection): one joins and one leaves, which is why both are named. JOINED:
    // lib/crew/quickFacts.ts, which components/crew/sections/HomeSection.tsx calls
    // (`buildQuickFacts`) at runtime; pure, the builder takes `today`. LEFT:
    // lib/crew/selectPrimaryContact.ts, whose only depth-1 runtime importer was
    // todayRows.ts (the retired Need something card); quickFacts.ts imports it now,
    // so it sits at depth 2 and is not retired. lib/crew/sectionPeek.ts stays ABSENT:
    // its only importer is lib/crew/crewSections.ts. Re-derived with this guard's
    // derivation on 1a5efd617 and 9462c6f78; whole-diff review R4-F5 found the move
    // unrecorded, its net zero hiding it from the count.
    expect(rel).toContain("lib/crew/quickFacts.ts");
    expect(rel).not.toContain("lib/crew/selectPrimaryContact.ts");
    expect(rel).not.toContain("lib/crew/sectionPeek.ts");
    // Joined, from feat/warning-card-fixes Task 4: lib/admin/warningReadingDisplay.ts, a new
    // module holding the reading-display caps and formats and the USE_RAW_CODES set, now
    // imported directly by components/admin/UseRawControl.tsx. Pure string formatting and
    // set membership, no clock read. 223 -> 224.
    expect(rel).toContain("lib/admin/warningReadingDisplay.ts");
    // Joined, from feat/warning-card-fixes Task 7: lib/messages/collapsedSummary.ts, now
    // imported directly by components/admin/wizard/step3ReviewSections.tsx for
    // `stripEmphasis` (the sheet icon's accessible-name subject). Before this only a
    // comment in components/messages/renderEmphasis.tsx named it. Pure string
    // formatting with no imports at all, no clock read. 224 -> 225.
    expect(rel).toContain("lib/messages/collapsedSummary.ts");
    // Joined, from feat/warning-card-fixes Task 11: lib/parser/ambiguityCodes.ts, now
    // imported directly by components/admin/BulkIgnoreControls.tsx so a judgment group's
    // bulk chip reads Accept (spec §6.2). A Set and a membership function with no imports
    // at all, no clock read. 225 -> 226.
    expect(rel).toContain("lib/parser/ambiguityCodes.ts");
    // Joined, from feat/crew-offline-saved-copy (Tasks 16 to 20): the eight
    // lib/offline modules that components/offline/SavedCopyMarker.tsx,
    // SavedCopySlot.tsx and SavedCopyBar.tsx import directly. 228 -> 236,
    // re-derived on the branch by running this guard; every joiner is a
    // lib/offline module, none from elsewhere.
    // servedCopy.ts carries the one clock read, waived below as a client effect
    // read. lib/offline/navigation.ts is NOT a member: the marker's only direct
    // import of it (STATUS_TIMEOUT_MS) became the literal REPLY_TIMEOUT_MS.
    expect(rel).toContain("lib/offline/assetList.ts");
    expect(rel).toContain("lib/offline/barState.ts");
    expect(rel).toContain("lib/offline/client/messaging.ts");
    expect(rel).toContain("lib/offline/client/online.ts");
    expect(rel).toContain("lib/offline/client/reload.ts");
    expect(rel).toContain("lib/offline/client/servedCopy.ts");
    expect(rel).toContain("lib/offline/marker.ts");
    expect(rel).toContain("lib/offline/serverMarkers.ts");
    // Joined, from the same branch (Task 25, 346d2438b): lib/offline/killSwitch.ts,
    // which SavedCopySlot.tsx now imports directly to read the kill switch for the
    // registrar it mounts. Its other importer, app/sw.js/route.ts, is no scan root.
    // No clock read. 236 -> 237, re-derived by running this guard.
    expect(rel).toContain("lib/offline/killSwitch.ts");
    // Merged with origin/main 2026-10-30 (crew offline branch): main's 231 plus this
    // branch's nine lib/offline joiners, re-derived by running this guard on the merged tree.
    // Joined, from the same branch's UI-gate fix (f181429a2): lib/offline/client/
    // scrollPadding.ts, which SavedCopyBar.tsx imports directly to keep the page's
    // scroll padding at the bar's height. It reads layout, never the clock.
    // 240 -> 241, re-derived by running this guard.
    expect(rel).toContain("lib/offline/client/scrollPadding.ts");
    // Joined, from the same branch's Codex R1 fix round (UI gate re-check E4):
    // lib/offline/client/scrolledUnder.ts, which SavedCopyBar.tsx imports directly
    // to tell when the in-flow detail has scrolled under the pinned line. It reads
    // layout, never the clock. 241 -> 242, re-derived by running this guard.
    expect(rel).toContain("lib/offline/client/scrolledUnder.ts");
    // Merged with origin/main 2026-10-29: main's crew-search joins (228) plus this branch's
    // three (warningReadingDisplay, collapsedSummary, ambiguityCodes), re-derived by running
    // this guard on the merged tree.
    // 236 on the merge of origin/main (feat/warning-card-fixes, which merged main's crew
    // search and then added warningReadingDisplay, collapsedSummary and ambiguityCodes) into
    // feat/crew-page-redesign. Both sides start from 228; this branch's members above and
    // that arc's three are all present and nothing left. Re-derived by running this guard
    // on the merged tree, not by adding the two sides up.
    // 247 on the merge of origin/main (PR #983, the crew offline saved copy) into
    // feat/crew-page-redesign: this branch's 236 plus main's eleven lib/offline joiners
    // asserted above, nothing left. Re-derived by running this guard on the merged tree.
    // 248 (Codex review of that merge, M1-1): lib/ui/historyState.ts, the history
    // state helper CrewSections and SavedCopyBar now share so the saved copy's URL
    // correction keeps the sheet's marker. It reads history state, never the clock.
    // Re-derived by running this guard.
    expect(rel).toContain("lib/ui/historyState.ts");
    expect(rel.length).toBe(DERIVED_LIB_POPULATION);
  });

  // The twelve waivers this arc added, plus the client effect read that
  // feat/crew-offline-saved-copy added in lib/offline/client/servedCopy.ts,
  // bound to their SITE and their REASON FAMILY. Not a count, and not a diff: a count of 12 passes when a
  // contributor repairs any one of the thirteen violations and waives the
  // survivor instead, and a diff-derived count has no durable base once the
  // branch merges. Reading the comment AT the coordinate is also what verifies
  // the coordinate -- a row whose line has drifted finds no waiver there.
  const WAIVER_REGISTRY: Record<
    string,
    "mutation-timestamp" | "di-default" | "observe-read-window" | "client-effect-read"
  > = {
    "lib/adminAlerts/resolveAdminAlert.ts:33": "mutation-timestamp",
    "lib/adminAlerts/resolveAdminAlert.ts:60": "mutation-timestamp",
    "lib/drive/watch.ts:956": "di-default",
    "lib/drive/watch.ts:1044": "di-default",
    "lib/drive/watch.ts:1172": "di-default",
    "lib/drive/watch.ts:1389": "di-default",
    "lib/drive/watch.ts:1562": "di-default",
    "lib/observe/query/events.ts:90": "observe-read-window",
    "lib/observe/query/failures.ts:43": "observe-read-window",
    "lib/observe/query/staged.ts:39": "observe-read-window",
    "lib/observe/query/syncLog.ts:30": "observe-read-window",
    "lib/offline/client/servedCopy.ts:40": "client-effect-read",
    "lib/sync/runManualSyncForShow.ts:297": "di-default",
  };
  const FAMILY_TEXT: Record<string, RegExp> = {
    "mutation-timestamp": /mutation timestamp/i,
    "di-default": /dependency-injection default/i,
    "observe-read-window": /observe read-path window/i,
    "client-effect-read": /client effect read/i,
  };

  it("the waived sites in the derived lib population are exactly the thirteen registered ones", () => {
    const waived: string[] = [];
    for (const file of libFiles) {
      const originalLines = readFileSync(file, "utf8").split("\n");
      const strippedLines = stripCommentsForFile(readFileSync(file, "utf8"), file).split("\n");
      for (let i = 0; i < strippedLines.length; i++) {
        const stripped = strippedLines[i] ?? "";
        const original = originalLines[i] ?? "";
        if (!FORBIDDEN_PATTERNS.some((pattern) => pattern.test(stripped))) continue;
        if (WAIVER_COMMENT.test(original)) waived.push(`${relative(process.cwd(), file)}:${i + 1}`);
      }
    }
    expect(waived.sort()).toEqual(Object.keys(WAIVER_REGISTRY).sort());
  });

  it("every registered waiver carries the reason family it is registered under, read at its own line", () => {
    for (const [site, family] of Object.entries(WAIVER_REGISTRY)) {
      const [path, lineText] = [
        site.slice(0, site.lastIndexOf(":")),
        site.slice(site.lastIndexOf(":") + 1),
      ];
      const line =
        readFileSync(join(process.cwd(), path), "utf8").split("\n")[Number(lineText) - 1] ?? "";
      expect(WAIVER_COMMENT.test(line), `${site} has no waiver comment at that line`).toBe(true);
      expect(
        FAMILY_TEXT[family]!.test(line),
        `${site} is registered ${family} but its reason does not say so`,
      ).toBe(true);
    }
  });

  it("the survivor is REPAIRED, not waived", () => {
    // Site-bound, because the population-level cases are satisfiable by
    // repairing some other violation and waiving this one instead -- which is
    // exactly the outcome BL-SERVER-TIME-GUARD-EXCLUDES-LIB exists to prevent.
    const source = readFileSync(join(process.cwd(), "lib/admin/loadAppEvents.ts"), "utf8");
    const stripped = stripCommentsForFile(source, "lib/admin/loadAppEvents.ts");
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(pattern.test(stripped), "the survivor must carry no bare time call at all").toBe(
        false,
      );
    }
    expect(source).toContain('from "@/lib/time/now"');
    expect(Object.keys(WAIVER_REGISTRY)).not.toContain("lib/admin/loadAppEvents.ts:45");
  });

  it("every render-side time call in the derived lib population is clean too", () => {
    // Green in the wrong direction on its own: a population that collapsed to
    // nothing also has no violations. The premise case above is the other half.
    expect(libViolations, libViolations.join("\n")).toEqual([]);
  });

  it("client-vs-server classification: includes Footer/StaleFooter (server), excludes CrewPass/ReportModal (use client)", () => {
    const footerSrc = readFileSync(join(process.cwd(), "components/layout/Footer.tsx"), "utf8");
    const staleSrc = readFileSync(join(process.cwd(), "components/shared/StaleFooter.tsx"), "utf8");
    // The island exemplar is the crew pass, the live card on the crew home. It
    // replaced the right-now hero (crew page redesign plan Task 9) and carries the
    // same 'use client' directive, so the classifier's contract — it separates a
    // directive-carrying island from a server component — is unchanged.
    const rightSrc = readFileSync(join(process.cwd(), "components/crew/CrewPass.tsx"), "utf8");
    const reportSrc = readFileSync(
      join(process.cwd(), "components/shared/ReportModal.tsx"),
      "utf8",
    );

    expect(isClientComponent(footerSrc)).toBe(false);
    expect(isClientComponent(staleSrc)).toBe(false);
    expect(isClientComponent(rightSrc)).toBe(true);
    expect(isClientComponent(reportSrc)).toBe(true);
  });

  it("comment-stripping: comment-only mentions of new Date() do NOT register as violations", () => {
    const synthetic = [
      " // This function returns the equivalent of new Date() but...",
      "/* Block: new Date() is bad here */",
      "export function f() { return 1; }",
    ].join("\n");

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
  });

  it("comment-stripping: real new Date() OUTSIDE a comment IS flagged", () => {
    const synthetic = [
      "// This is a comment about new Date()",
      "const x = new Date(); // a real call",
    ].join("\n");

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("string-literal containing a URL does NOT cause new Date() after it to be stripped", () => {
    const synthetic = 'const url = "https://example.test"; const t = new Date();\n';

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("real // comment after a string literal IS stripped", () => {
    const synthetic = 'const url = "https://example.test"; // a comment with new Date()\n';

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
  });

  it("template-literal interpolation: `${new Date()}` IS flagged", () => {
    const synthetic = "const label = `${new Date()}`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("template-literal interpolation: nested template inside `${...}` works recursively", () => {
    const synthetic = "const label = `outer ${`inner ${new Date()}`} done`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(true);
  });

  it("template-literal interpolation: comment inside `${...}` IS stripped", () => {
    const synthetic = "const label = `${ /* mention new Date() */ realCall() }`;\n";

    expect(/\bnew Date\(\s*\)/.test(stripSyntheticSource(synthetic))).toBe(false);
  });

  it("comment-stripping: multi-line block comment preserves newline count for waiver alignment", () => {
    const original = [
      "/**",
      " * Multi-line JSDoc.",
      " * Reference: new Date() — documentation, not code.",
      " * not-render-side: this is JUST a comment, ignored by the guard",
      " */",
      "const x = new Date(); // ACTUAL violation",
    ].join("\n");
    const strippedLines = stripSyntheticSource(original).split("\n");
    const originalLines = original.split("\n");

    expect(strippedLines.length).toBe(originalLines.length);
    expect(/\bnew Date\(\s*\)/.test(strippedLines[5] ?? "")).toBe(true);
    expect(/\/\/\s*not-render-side:/.test(originalLines[5] ?? "")).toBe(false);
  });

  it("directive-prologue boundary: standalone 'use client' string AFTER imports does NOT classify as client", () => {
    const synthetic = [
      'import { foo } from "bar";',
      '"use client";',
      "export function X() { return null; }",
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue boundary: 'use client' inside a function body does NOT classify as client", () => {
    const synthetic = [
      "export function X() {",
      '  "use client";',
      "  return new Date();",
      "}",
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(false);
  });

  it("directive-prologue: leading JSDoc + 'use client' DOES classify as client", () => {
    const synthetic = [
      "/**",
      " * Long header doc comment.",
      " */",
      '"use client";',
      'import React from "react";',
    ].join("\n");

    expect(isClientComponent(synthetic)).toBe(true);
  });

  it("directive-prologue boundary: 'use client' + foo() is an expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client' + sideEffect();\n")).toBe(false);
  });

  it("directive-prologue boundary: `'use client'.length` is a member expression, NOT a directive -> server", () => {
    expect(isClientComponent("'use client'.length;\n")).toBe(false);
  });
});
