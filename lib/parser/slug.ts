/**
 * lib/parser/slug.ts — slug derivation for shows (§6.9).
 *
 * Algorithm:
 * 1. Extract YYYY-MM prefix from dates.set ?? dates.travelIn ?? dates.showDays[0].
 *    Throws if all are null/empty.
 * 2. Slugify title: lowercase, ASCII-fold (strip NFD combining chars), replace
 *    non-alphanumeric runs with '-', collapse duplicate '-', trim, cap at 60 chars.
 * 3. Compose: `<YYYY-MM>-<title-slug>`.
 * 4. Collision suffix: if base slug is in existingSlugs, try base-2 .. base-100.
 * 5. Throw SlugCollisionExhausted after 100 attempts.
 *
 * existingSlugs is informational only — the authoritative collision check is the
 * DB UNIQUE constraint (23505). See §6.9 amendment.
 */

import type { ParsedSheet, ParseResult } from "./types";

export class SlugCollisionExhausted extends Error {
  constructor(
    public readonly baseSlug: string,
    public readonly attemptCount: number,
  ) {
    super(`SLUG_COLLISION_EXHAUSTED: ${baseSlug} (after ${attemptCount} attempts)`);
    this.name = "SlugCollisionExhausted";
  }
}

/** Extract YYYY-MM from an ISO date string 'YYYY-MM-DD'. */
function extractYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7); // 'YYYY-MM'
}

/** ASCII-fold: decompose to NFD then strip combining diacritics (U+0300..U+036F). */
function asciiFold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Slugify a title per §6.9: lowercase, ASCII-fold, non-alnum → '-', collapse, trim, cap 60. */
function slugifyTitle(title: string): string {
  const folded = asciiFold(title).toLowerCase();
  const replaced = folded.replace(/[^a-z0-9]+/g, "-");
  const trimmed = replaced.replace(/^-+|-+$/g, "");
  return trimmed.slice(0, 60);
}

/**
 * Derive a URL slug from a ParsedSheet or ParseResult.
 *
 * @param parsed  The parse output. `parsed.show.dates` and `parsed.show.title` are read.
 * @param existingSlugs  Informational snapshot of taken slugs (authoritative check is DB UNIQUE).
 * @returns The derived slug string.
 * @throws {SlugCollisionExhausted} if all 100 candidate slugs are in existingSlugs.
 * @throws {Error} if no date is available to derive YYYY-MM prefix.
 */
export function deriveSlug(parsed: ParsedSheet | ParseResult, existingSlugs: string[]): string {
  const { dates, title } = parsed.show;

  // Step 1: resolve date for YYYY-MM prefix (§6.9 fallback chain)
  const rawDate =
    dates.set ?? dates.travelIn ?? (dates.showDays.length > 0 ? (dates.showDays[0] ?? null) : null);

  if (!rawDate) {
    throw new Error(
      `deriveSlug: no date available (set/travelIn/showDays all null) for title "${title}"`,
    );
  }

  const yearMonth = extractYearMonth(rawDate);
  const titleSlug = slugifyTitle(title);
  const baseSlug = `${yearMonth}-${titleSlug}`;

  // Step 2: collision loop — attempt 1 is bare base, attempts 2..100 append suffix
  const existingSet = new Set(existingSlugs);
  for (let attempt = 1; attempt <= 100; attempt++) {
    const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
  }

  throw new SlugCollisionExhausted(baseSlug, 100);
}
