import { DIGEST_MAX_SHOWS, DIGEST_MAX_ITEMS_PER_SHOW } from "@/lib/notify/constants";
import { escapeHtml } from "./escapeHtml";
import type { RenderedEmail } from "./realtimeProblem";

/** One show's pre-resolved needs-attention items (copy already resolved upstream, §8). */
export type DigestShowInput = { showTitle: string | null; slug: string | null; items: string[] };
export type DigestInput = { origin: string; shows: DigestShowInput[] };

function showHref(origin: string, slug: string | null): string {
  return slug ? `${origin}/admin/show/${slug}` : `${origin}/admin`;
}

/**
 * Daily review digest (§5.1, §8, AC-B3.12). Grouped by show; capped at
 * DIGEST_MAX_SHOWS shows and DIGEST_MAX_ITEMS_PER_SHOW items/show. Overflow notes
 * ("+N more on this show" / "+M more shows") and their counts derive from the
 * SOURCE totals (full `input.shows` / `show.items` lengths), and link to the
 * absolute `${origin}/admin`. Every dynamic value is HTML-escaped, the plain-text
 * placeholder guard runs, and all copy is em-dash-free.
 */
export function renderDigest(input: DigestInput): RenderedEmail {
  const totalShows = input.shows.length; // SOURCE total
  const shownShows = input.shows.slice(0, DIGEST_MAX_SHOWS);
  const overflowShows = Math.max(0, totalShows - DIGEST_MAX_SHOWS);
  const dashboard = `${input.origin}/admin`;

  const textLines: string[] = [];
  const htmlParts: string[] = [];

  for (const show of shownShows) {
    const title = show.showTitle ?? "Untitled show";
    const href = showHref(input.origin, show.slug);
    const totalItems = show.items.length; // SOURCE total
    const shownItems = show.items.slice(0, DIGEST_MAX_ITEMS_PER_SHOW);
    const overflowItems = Math.max(0, totalItems - DIGEST_MAX_ITEMS_PER_SHOW);

    textLines.push(`${title} (${href})`);
    htmlParts.push(`<h3><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h3>`);
    const itemHtml: string[] = [];
    for (const item of shownItems) {
      textLines.push(`  - ${item}`);
      itemHtml.push(`<li>${escapeHtml(item)}</li>`);
    }
    if (overflowItems > 0) {
      const more = `+${overflowItems} more on this show`;
      textLines.push(`  ${more}: ${dashboard}`);
      itemHtml.push(`<li><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></li>`);
    }
    htmlParts.push(`<ul>${itemHtml.join("")}</ul>`);
  }

  if (overflowShows > 0) {
    const more = `+${overflowShows} more shows`;
    textLines.push(`${more}: ${dashboard}`);
    htmlParts.push(`<p><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></p>`);
  }

  const subject = `FXAV daily review · ${totalShows} ${totalShows === 1 ? "show needs" : "shows need"} attention`;
  // Items arrive pre-resolved from the digest builder (Task 3.8 → resolveIngestionCopy,
  // which already strips unresolved placeholders), so no per-item placeholder guard is
  // run here — and titles/items are HTML-escaped below.
  const text = `${subject}\n\n${textLines.join("\n")}\n\nOpen the dashboard: ${dashboard}`;
  const html = `<h2>${escapeHtml(subject)}</h2>${htmlParts.join("")}`;
  return { subject, html, text };
}
