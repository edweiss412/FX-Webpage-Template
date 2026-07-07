// tests/parser/_metaKnownSectionsWalker.test.ts
//
// STRUCTURAL WALKER (spec 2026-07-06-known-sections-walker §6). Fails-by-default
// for any NEW file under lib/parser/blocks/. Enforced PRIMARY gates: annotation
// (export SECTION_HEADER_TOKENS or be allowlisted), non-empty, EXACT subset of
// KNOWN_SECTION_HEADERS. STRUCTURAL NUDGE: token-exporters (except
// IMPORT_LINK_EXEMPT) import the shared factory. BACKSTOP (registry-keyed): a
// source-text guard flags a hand-rolled matcher (Form A: equality/startsWith/
// includes against a quoted token; Form B: an anchored /^.../ regex containing
// the token) whose token is an EXACT KNOWN_SECTION_HEADERS member the file
// neither owns nor allowlists — high-signal (sub-labels, column headers,
// terminator arrays, .includes(var), and comments do NOT fire). DECLARED
// ACCEPTED RESIDUAL (spec §6.7): the walker proves import, NOT exclusive factory
// USE; and because the backstop is registry-keyed, a hand-rolled matcher for an
// UNREGISTERED token, or a registered token via an exotic mechanism (computed
// token, .match on a built regex, non-anchored/lowercase literal), is not caught
// — behavior on shipped fixtures is pinned by the parser test suite, and the
// COMMON drift (a new parser file) cannot pass silently (annotation gate). Do
// NOT relitigate the residual as an undiscovered hole.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";

const BLOCKS_DIR = join(process.cwd(), "lib/parser/blocks");
const INDEX_FILE = join(process.cwd(), "lib/parser/index.ts");

// Files that open NO section (per-file reason). Filesystem-walked, so a NEW
// blocks/*.ts that is neither here nor a token-exporter FAILS.
const NO_SECTION_OPENER: Record<string, string> = {
  "_helpers.ts": "pure helpers; no col0 section detection",
  "agenda.ts": "agenda schedule rows; the agenda-link opener lives in index.ts",
  "agendaWarnings.ts": "warning emission only",
  "contacts.ts":
    "scalar contact-label detection (cells[1]-only), not a multi-row section opener (spec §3 R1 f1)",
  "gear.ts": "classifies rooms it does not open; reuses room families owned by rooms.ts",
  "scheduleBookends.ts": "schedule bookend rows; no section opener",
  "scheduleTimes.ts": "schedule time rows; no section opener",
  "travelFlights.ts": "flight rows; no section opener",
  "travelFlightWarnings.ts": "warning emission only",
  "ops.ts": "metadata scalar fields (METADATA_FIELD_TOKENS); no section opener",
};

// Token-exporters exempt from the import-link nudge (capture-extract/shape
// matchers not buildable from the presence factory — spec §4/§6.4).
const IMPORT_LINK_EXEMPT = new Set(["rooms.ts"]);

// Files with a RETAINED raw matcher (regex or equality) referencing a REGISTERED
// section-opener token — either the file's own token (deliberately kept as a
// capture-extract/multi-column matcher) or another section's banner reused as a
// boundary/classification. Reason travels with each entry. (Populated from a
// complete plan-time preflight scan over the live tree — see plan Task 14 note.)
const RAW_HEADER_REGEX_ALLOWLIST: Record<string, string> = {
  "rooms.ts": "capture-extract/shape room-banner matchers (IMPORT_LINK_EXEMPT, spec §4)",
  "hotels.ts": "inline reservation/stay capture matchers (:507/:519) + /^HOTEL$/i (:356)",
  "transport.ts":
    "multi-column TRANSPORTATION headers (:173/:336), v1 Driver (:446), /^TRANSPORTATION\\//i (:285)",
  "index.ts": "agenda label+value capture matcher (:339)",
  "event.ts":
    "references GENERAL SESSION / BREAKOUT as a room-block boundary (:174) — event does not OPEN those",
  "gear.ts":
    "room-family classification (/^GENERAL/, /^BREAKOUT/, /^LUNCH/ :97-99) — reuses banners owned by rooms.ts",
  "scheduleTimes.ts":
    "consumes the DATES block boundary owned by dates.ts (:114/:122) — not an opener",
};

// Equality/method literals (registered-section-header tokens) legitimate in a file
// that does not own the token (a cross-section boundary reference, or a sentinel).
const EQUALITY_LITERAL_ALLOWLIST: Record<string, readonly string[]> = {
  "scheduleTimes.ts": ["DATES"], // consumes the dates-block boundary owned by dates.ts (:114/:122)
  "index.ts": ["CLIENT"], // CLIENT-prefix title-exclusion sentinel (client section owned by client.ts)
};

// Registry entries no parser OPENS on but that are intentionally present
// (aliases / prefix-family members / metadata fields) — warned, not failed (spec §6.10).
// COI is in KNOWN_SECTION_HEADERS but is consumed by ops as a scalar METADATA field
// (METADATA_FIELD_TOKENS), not opened as a section.
const EXPECTED_ORPHANS = new Set(["VENUES", "IN HOUSE AV", "LUNCH SESSION", "COI"]);

interface Scanned {
  file: string;
  path: string;
  source: string;
  mod: Record<string, unknown>;
}

async function scanFiles(): Promise<Scanned[]> {
  const blockFiles = readdirSync(BLOCKS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: f, path: join(BLOCKS_DIR, f) }));
  const all = [...blockFiles, { file: "index.ts", path: INDEX_FILE }];
  const out: Scanned[] = [];
  for (const { file, path } of all) {
    const source = readFileSync(path, "utf8");
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    out.push({ file, path, source, mod });
  }
  return out;
}

describe("known-sections source walker", () => {
  it("every scanned file exports SECTION_HEADER_TOKENS or is allowlisted; tokens ⊆ registry; import-link nudge; disjointness", async () => {
    const scanned = await scanFiles();
    for (const s of scanned) {
      const tokens = s.mod.SECTION_HEADER_TOKENS as readonly string[] | undefined;
      const isFactoryFile = s.file === "_sectionHeaderMatch.ts";
      if (isFactoryFile) continue;

      if (!tokens) {
        // Step 1: no tokens → MUST be allowlisted as a no-opener file.
        expect(
          NO_SECTION_OPENER[s.file],
          `${s.file} exports no SECTION_HEADER_TOKENS and is not in NO_SECTION_OPENER — add tokens or an allowlist reason`,
        ).toBeTruthy();
        continue;
      }

      // Step 2: non-empty for a token-exporter.
      expect(tokens.length, `${s.file} exports an empty SECTION_HEADER_TOKENS`).toBeGreaterThan(0);

      // Step 3: EXACT subset ⊆ registry (NOT prefix-match).
      for (const t of tokens) {
        expect(
          KNOWN_SECTION_HEADERS.has(normalizeHeader(t)),
          `${s.file} token "${t}" is not an exact member of KNOWN_SECTION_HEADERS`,
        ).toBe(true);
      }

      // Step 4: import-link nudge (unless IMPORT_LINK_EXEMPT).
      if (!IMPORT_LINK_EXEMPT.has(s.file)) {
        expect(
          /from\s+["'](?:\.\/|@\/lib\/parser\/blocks\/)_sectionHeaderMatch["']/.test(s.source),
          `${s.file} exports SECTION_HEADER_TOKENS but does not import _sectionHeaderMatch (import-link nudge)`,
        ).toBe(true);
      }

      // Step 8: disjointness with METADATA_FIELD_TOKENS if both present.
      const meta = s.mod.METADATA_FIELD_TOKENS as readonly string[] | undefined;
      if (meta) {
        const overlap = tokens.filter((t) =>
          meta.some((m) => normalizeHeader(m) === normalizeHeader(t)),
        );
        expect(
          overlap,
          `${s.file} SECTION_HEADER_TOKENS ∩ METADATA_FIELD_TOKENS not empty`,
        ).toEqual([]);
      }
    }
  });

  it("BACKSTOP (REGISTERED-TOKEN-KEYED, 2 syntactic forms, CASE-SENSITIVE): no un-allowlisted matcher for a registered opener the file does not own", async () => {
    const scanned = await scanFiles();
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const s of scanned) {
      if (s.file === "_sectionHeaderMatch.ts") continue;
      // A file legitimately "owns" a registered token as a SECTION opener OR as a
      // scalar METADATA field (e.g. ops owns COI, which is ALSO in the registry).
      const ownTokens = new Set(
        [
          ...((s.mod.SECTION_HEADER_TOKENS as string[] | undefined) ?? []),
          ...((s.mod.METADATA_FIELD_TOKENS as string[] | undefined) ?? []),
        ].map(normalizeHeader),
      );
      const rawAllowed = s.file in RAW_HEADER_REGEX_ALLOWLIST;
      const eqAllowed = new Set((EQUALITY_LITERAL_ALLOWLIST[s.file] ?? []).map(normalizeHeader));

      // Pre-extract anchored regex literals and NORMALIZE their whitespace
      // (\s, \s+, \s*, literal spaces → single space) so Form B catches both
      // `/^GENERAL SESSION/` and `/^GENERAL\s+SESSION\b/`. CASE-SENSITIVE: real
      // section openers are UPPERCASE; scalar/contacts labels are lowercase and
      // must NOT fire.
      const anchoredRegexNorm = (s.source.match(/\/\\?\^[^/\n]+\//g) ?? []).map((lit) =>
        lit.replace(/\\s[*+]?/g, " ").replace(/\s+/g, " "),
      );

      for (const token of KNOWN_SECTION_HEADERS) {
        if (ownTokens.has(token) || eqAllowed.has(token)) continue; // owned/allowlisted → expected
        const T = esc(token);

        // FORM A — quoted token adjacent to an equality/method operator (CASE-SENSITIVE).
        // Excludes Set-membership arrays (`["T", ...]`) and `.includes(var)`.
        const FORM_A = new RegExp(
          `(?:===|!==|\\.startsWith\\(|\\.includes\\()\\s*["']${T}["']|["']${T}["']\\s*(?:===|!==)`,
        );
        // FORM B — the UPPERCASE token appears (whitespace-normalized) inside an anchored regex literal.
        const formB = anchoredRegexNorm.some((lit) => lit.includes(token));

        if (!FORM_A.test(s.source) && !formB) continue;

        expect(
          rawAllowed,
          `${s.file}: hard-coded matcher for registered section opener "${token}" (which this file does not own) — is this a hidden opener? Export it as a token + build via the factory, or add a RAW_HEADER_REGEX_ALLOWLIST / EQUALITY_LITERAL_ALLOWLIST reason.`,
        ).toBe(true);
      }
    }
  });

  it("no-orphan (warn, non-blocking): registry entries claimed by no parser/prefix/sub-label", async () => {
    const scanned = await scanFiles();
    const claimed = new Set<string>();
    for (const s of scanned) {
      for (const t of (s.mod.SECTION_HEADER_TOKENS as string[] | undefined) ?? [])
        claimed.add(normalizeHeader(t));
    }
    for (const p of PREFIX_SECTION_FAMILIES) claimed.add(normalizeHeader(p));
    const orphans = [...KNOWN_SECTION_HEADERS].filter(
      (h) => !claimed.has(h) && !EXPECTED_ORPHANS.has(h),
    );
    if (orphans.length > 0) {
      // warn, do not fail
      console.warn(
        `[known-sections walker] unclaimed registry entries (not EXPECTED_ORPHANS): ${orphans.join(", ")}`,
      );
    }
    expect(true).toBe(true);
  });
});

// Step 9 — non-vacuity proof. Mirrors the two backstop forms so the proof is
// self-contained; `token` defaults to a REGISTERED opener (GENERAL SESSION).
describe("known-sections walker non-vacuity proof", () => {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Mirrors the guard: CASE-SENSITIVE Form A + whitespace-normalized anchored-regex Form B.
  const hits = (source: string, token = "GENERAL SESSION"): boolean => {
    const T = esc(token);
    const FORM_A = new RegExp(
      `(?:===|!==|\\.startsWith\\(|\\.includes\\()\\s*["']${T}["']|["']${T}["']\\s*(?:===|!==)`,
    );
    const anchored = (source.match(/\/\\?\^[^/\n]+\//g) ?? []).map((lit) =>
      lit.replace(/\\s[*+]?/g, " ").replace(/\s+/g, " "),
    );
    return FORM_A.test(source) || anchored.some((lit) => lit.includes(token));
  };

  it("(a) an unregistered token fails the exact-subset check", () => {
    expect(KNOWN_SECTION_HEADERS.has(normalizeHeader("ZZZ_UNREGISTERED"))).toBe(false);
  });
  it("(c) a source exporting tokens but not importing the factory fails the import-link regex", () => {
    const bad = `export const SECTION_HEADER_TOKENS = ["GENERAL SESSION"];`;
    expect(/from\s+["'](?:\.\/|@\/lib\/parser\/blocks\/)_sectionHeaderMatch["']/.test(bad)).toBe(
      false,
    );
  });
  it("(d) Form B: anchored regex literals referencing a registered token are flagged (incl. \\s+ variant)", () => {
    expect(hits(String.raw`const RE = /^\|\s*GENERAL SESSION\s*\|/;`)).toBe(true);
    expect(hits(`if (/^GENERAL SESSION/.test(col0)) {}`)).toBe(true);
    expect(hits(String.raw`if (/^GENERAL\s+SESSION\b/.test(col0)) {}`)).toBe(true); // R4-2: \s+ normalized
  });
  it("(e)/(f) Form A: equality (both orders) + startsWith/includes for a registered token are flagged", () => {
    expect(hits(`label === "GENERAL SESSION"`)).toBe(true);
    expect(hits(`"GENERAL SESSION" === label`)).toBe(true); // reversed
    expect(hits(`if (col0.startsWith("GENERAL SESSION")) {}`)).toBe(true);
    expect(hits(`if (col0.includes("GENERAL SESSION")) {}`)).toBe(true);
  });
  it("(g) NEGATIVE CONTROLS: benign patterns are NOT flagged", () => {
    // lowercase scalar-label regex (contacts style) — case-sensitive, must NOT fire:
    expect(hits(String.raw`const RE = /^\s*(?:venue|hotel)\s+contact/i;`, "VENUE")).toBe(false);
    // terminator/membership array literal (no ===/method adjacency):
    expect(hits(`const T = new Set(["HOTEL", "DATES", "VENUE"]);`, "HOTEL")).toBe(false);
    expect(hits(`if (["TRAVEL","SET","SHOW","DATES"].includes(labelU)) {}`, "DATES")).toBe(false);
    // prose/comment mentioning a token (no anchored regex, no equality adjacency):
    expect(hits(`// the GENERAL SESSION block is owned by rooms.ts`)).toBe(false);
  });
});
