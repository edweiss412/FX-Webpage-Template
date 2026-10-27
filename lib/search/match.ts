import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";
import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";
import { SEARCH_ALIAS_GROUPS } from "@/lib/search/aliases";
import { normalize, type Token } from "@/lib/search/normalize";
import type { Range, SearchEntry, SearchHit, SearchIndex, SearchResult } from "@/lib/search/types";

/**
 * The crew search matcher (spec §5). Pure: the same prepared index and query
 * always give the same result, with no clock, storage, network or module state.
 *
 * `prepareIndex` does the per-entry work once (tokenize every field, attach
 * alias tokens with the display span that triggered them); `searchIndex` runs a
 * query against it on every keystroke.
 *
 * Weights are kept in integer tenths (kind 10/8/7/5, field 10/6), so every score
 * is an exact integer number of hundredths and two equal sums compare equal: a
 * float tie-break could otherwise reorder rows the spec says keep render order.
 * The reported `score` is the spec's decimal value.
 */

type FieldName = "group" | "label" | "value" | "context";
type DisplayedField = Exclude<FieldName, "context">;

const KIND_WEIGHT = { exact: 10, prefix: 8, alias: 7, fuzzy: 5 } as const;
const FIELD_WEIGHT: Record<FieldName, number> = { group: 6, label: 10, value: 10, context: 6 };
const UNITS_PER_POINT = KIND_WEIGHT.exact * FIELD_WEIGHT.value;

const STOP_WORDS = new Set(
  "a an the of is are where what when which who how my our for to at do does i me".split(" "),
);
const MIN_QUERY_CHARS = 2;
const SECTION_ORDER: readonly SectionId[] = [...BASE_SECTION_IDS, "budget"];

/** Alias members split into their tokens once (members are stored normalized). */
const ALIAS_MEMBER_TOKENS: readonly (readonly (readonly string[])[])[] = SEARCH_ALIAS_GROUPS.map(
  (group) => group.map((member) => member.split(" ")),
);

/** A token an entry gains through an alias group, and the display span behind it. */
type AliasToken = { text: string; source: Range };
type PreparedField = { name: FieldName; text: string; tokens: Token[]; aliases: AliasToken[] };
type PreparedEntry = { entry: SearchEntry; order: number; fields: PreparedField[] };
export type PreparedIndex = { readonly entries: readonly PreparedEntry[] };

/**
 * Alias tokens for one field: for every member that occurs in the field's token
 * stream (a phrase when its tokens are consecutive), the OTHER members' tokens,
 * each remembering the span of the occurrence that produced it. Occurrences are
 * taken in display order and a token keeps its earliest source, so the alias
 * list is ordered by source position.
 */
function aliasTokens(tokens: readonly Token[]): AliasToken[] {
  const occurrences: { group: number; member: number; source: Range }[] = [];
  ALIAS_MEMBER_TOKENS.forEach((members, group) => {
    members.forEach((memberTokens, member) => {
      for (let k = 0; k + memberTokens.length <= tokens.length; k++) {
        if (!memberTokens.every((text, j) => tokens[k + j]!.text === text)) continue;
        const source = { start: tokens[k]!.start, end: tokens[k + memberTokens.length - 1]!.end };
        occurrences.push({ group, member, source });
      }
    });
  });
  occurrences.sort((a, b) => a.source.start - b.source.start || a.source.end - b.source.end);

  const found = new Map<string, AliasToken>();
  for (const occurrence of occurrences) {
    ALIAS_MEMBER_TOKENS[occurrence.group]!.forEach((memberTokens, member) => {
      if (member === occurrence.member) return;
      for (const text of memberTokens) {
        if (!found.has(text)) found.set(text, { text, source: occurrence.source });
      }
    });
  }
  return [...found.values()];
}

function prepareField(name: FieldName, text: string): PreparedField {
  const tokens = normalize(text);
  return { name, text, tokens, aliases: aliasTokens(tokens) };
}

export function prepareIndex(index: SearchIndex): PreparedIndex {
  return {
    entries: index.entries.map((entry, order) => {
      const fields = [prepareField("group", entry.group)];
      if (entry.label !== null) fields.push(prepareField("label", entry.label));
      fields.push(prepareField("value", entry.value));
      for (const context of entry.context) fields.push(prepareField("context", context));
      return { entry, order, fields };
    }),
  };
}

/**
 * Whether a query is long enough to run a match (spec §5.2): at least 2
 * normalized characters. The search UI reads this to tell its Hint state (too
 * short to search) from No match (searched, nothing found), which `searchIndex`
 * alone cannot, since both return an empty result.
 */
export function isSearchableQuery(query: string): boolean {
  return queryTokens(query) !== null;
}

/**
 * Query tokens after the stop-word rule, or null when the query is under the
 * 2-character floor. The floor counts normalized characters (token text only),
 * so punctuation and spaces never lift a 1-letter query over it.
 */
function queryTokens(query: string): string[] | null {
  const tokens = normalize(query).map((t) => t.text);
  if (tokens.join("").length < MIN_QUERY_CHARS) return null;
  const kept = tokens.filter((t) => !STOP_WORDS.has(t));
  return kept.length > 0 ? kept : tokens;
}

/** No fuzzy at 3 characters or fewer; distance 1 at 4 to 7; distance 2 at 8 or more. */
function fuzzyRadius(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

/** Kind weight of query token `q` against a REAL entry token `t`: exact, prefix, fuzzy. */
function tokenWeight(q: string, t: string): number {
  if (q === t) return KIND_WEIGHT.exact;
  if (q.length === 1) return 0; // a 1-character token matches by exact only
  if (t.startsWith(q)) return KIND_WEIGHT.prefix;
  const radius = fuzzyRadius(q.length);
  if (radius === 0 || Math.abs(q.length - t.length) > radius) return 0;
  return damerauLevenshtein(q, t) <= radius ? KIND_WEIGHT.fuzzy : 0;
}

/** Alias tokens match by exact equality only, and never for a 1-character token. */
function aliasMatches(q: string, alias: AliasToken): boolean {
  return q.length > 1 && alias.text === q;
}

function isDisplayed(name: FieldName): name is DisplayedField {
  return name !== "context";
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

type ScoredHit = { hit: SearchHit; units: number; order: number };

/**
 * Score one entry, or null when some query token matches nothing (AND). Each
 * query token adds its best kind weight times field weight.
 *
 * Highlights: a token's matched words in group/label/value. Only when the token
 * matched no displayed word does its alias source span light up instead, the
 * same fallback that decides `aliasNote`, so an alias never highlights a word
 * the query did not reach ("Loading" in "Loading dock" for "dock").
 */
function scoreEntry(prepared: PreparedEntry, query: readonly string[]): ScoredHit | null {
  const found: Record<DisplayedField, Range[]> = { group: [], label: [], value: [] };
  let units = 0;
  let matchedDisplayedWord = false;
  let firstAliasSource: string | null = null;

  for (const q of query) {
    let best = 0;
    const words: [DisplayedField, Range][] = [];
    const aliases: [FieldName, string, Range][] = [];
    for (const field of prepared.fields) {
      const fieldWeight = FIELD_WEIGHT[field.name];
      for (const token of field.tokens) {
        const kind = tokenWeight(q, token.text);
        if (kind === 0) continue;
        best = Math.max(best, kind * fieldWeight);
        if (isDisplayed(field.name)) {
          words.push([field.name, { start: token.start, end: token.end }]);
        }
      }
      for (const alias of field.aliases) {
        if (!aliasMatches(q, alias)) continue;
        best = Math.max(best, KIND_WEIGHT.alias * fieldWeight);
        aliases.push([field.name, field.text, alias.source]);
      }
    }
    if (best === 0) return null;
    units += best;

    if (words.length > 0) {
      matchedDisplayedWord = true;
      for (const [name, range] of words) found[name].push(range);
    } else {
      for (const [name, , source] of aliases) if (isDisplayed(name)) found[name].push(source);
    }
    const firstAlias = aliases[0];
    if (firstAliasSource === null && firstAlias) {
      const [, text, source] = firstAlias;
      firstAliasSource = text.slice(source.start, source.end);
    }
  }

  return {
    units,
    order: prepared.order,
    hit: {
      entry: prepared.entry,
      score: units / UNITS_PER_POINT,
      ranges: {
        group: mergeRanges(found.group),
        label: mergeRanges(found.label),
        value: mergeRanges(found.value),
      },
      aliasNote: matchedDisplayedWord ? null : firstAliasSource,
    },
  };
}

/** Trim and collapse whitespace, nothing else (spec §5.5): case and punctuation count. */
function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function twinKey(entry: SearchEntry): string {
  return `${collapseWhitespace(entry.label ?? "")}\u001F${collapseWhitespace(entry.value)}`;
}

/**
 * Today repeats lines from other sections. A Today hit is dropped when a hit
 * from ANOTHER section (for this same query) has the same label and value; a
 * Today line with no such twin stays.
 */
function dropTodayRepeats(scored: readonly ScoredHit[]): ScoredHit[] {
  const elsewhere = new Set(
    scored.filter((s) => s.hit.entry.section !== "today").map((s) => twinKey(s.hit.entry)),
  );
  return scored.filter(
    (s) => s.hit.entry.section !== "today" || !elsewhere.has(twinKey(s.hit.entry)),
  );
}

export function searchIndex(prepared: PreparedIndex, query: string): SearchResult {
  const tokens = queryTokens(query);
  if (tokens === null) return { total: 0, sections: [] };

  const scored: ScoredHit[] = [];
  for (const entry of prepared.entries) {
    const hit = scoreEntry(entry, tokens);
    if (hit) scored.push(hit);
  }
  const kept = dropTodayRepeats(scored);

  const bySection = new Map<SectionId, ScoredHit[]>();
  for (const s of kept) {
    const rows = bySection.get(s.hit.entry.section) ?? [];
    rows.push(s);
    bySection.set(s.hit.entry.section, rows);
  }
  const sections = [...bySection].map(([section, rows]) => {
    rows.sort((a, b) => b.units - a.units || a.order - b.order);
    return { section, rows, best: rows[0]!.units };
  });
  sections.sort(
    (a, b) =>
      b.best - a.best || SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section),
  );

  return {
    total: kept.length,
    sections: sections.map(({ section, rows }) => ({ section, rows: rows.map((r) => r.hit) })),
  };
}
