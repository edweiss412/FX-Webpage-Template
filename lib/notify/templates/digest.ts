import { DIGEST_MAX_SHOWS, DIGEST_MAX_ITEMS_PER_SHOW } from "@/lib/notify/constants";
import { AUTO_FIX_CLASSES } from "@/lib/parser/dataGaps";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";
import { escapeHtml } from "./escapeHtml";
import type { RenderedEmail } from "./realtimeProblem";

/** One show's pre-resolved needs-attention items (copy already resolved upstream, §8). */
export type DigestShowInput = { showTitle: string | null; slug: string | null; items: string[] };
export type DigestInput = {
  origin: string;
  shows: DigestShowInput[];
  /** Flow 6.2 §8 — the "Applied automatically since your last digest" section. */
  monitor?: MonitorDigestModel;
};

function showHref(origin: string, slug: string | null): string {
  return slug ? `${origin}/admin/show/${slug}` : `${origin}/admin`;
}

/**
 * Flow 6.2 §8 — render the monitor section (auto-applied changes, autocorrect roll-up,
 * quiet drift). Each sub-block is omitted when empty. Labels only (never raw codes,
 * invariant 5); every dynamic value HTML-escaped; caps mirror the needs-attention list.
 * Returns { text, html } fragments appended to the digest, or null when nothing to show.
 */
function renderMonitorSection(
  origin: string,
  monitor: MonitorDigestModel,
): { text: string[]; html: string[] } | null {
  const dashboard = `${origin}/admin`;
  const text: string[] = [];
  const html: string[] = [];

  // Sub-block 1: auto-applied changes, grouped by show (same caps as needs-attention).
  if (monitor.autoApplied.length > 0) {
    text.push("Auto-applied changes:");
    html.push("<h3>Auto-applied changes</h3>");
    const shownShows = monitor.autoApplied.slice(0, DIGEST_MAX_SHOWS);
    for (const show of shownShows) {
      const title = show.showTitle ?? "Untitled show";
      const href = showHref(origin, show.slug);
      const shownItems = show.items.slice(0, DIGEST_MAX_ITEMS_PER_SHOW);
      const overflowItems = Math.max(0, show.items.length - DIGEST_MAX_ITEMS_PER_SHOW);
      text.push(`${title} (${href})`);
      html.push(`<h4><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h4>`);
      const itemHtml: string[] = [];
      for (const item of shownItems) {
        text.push(`  - ${item}`);
        itemHtml.push(`<li>${escapeHtml(item)}</li>`);
      }
      if (overflowItems > 0) {
        const more = `+${overflowItems} more on this show`;
        text.push(`  ${more}: ${dashboard}`);
        itemHtml.push(`<li><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></li>`);
      }
      html.push(`<ul>${itemHtml.join("")}</ul>`);
    }
    const overflowShows = Math.max(0, monitor.autoApplied.length - DIGEST_MAX_SHOWS);
    if (overflowShows > 0) {
      const more = `+${overflowShows} more shows`;
      text.push(`${more}: ${dashboard}`);
      html.push(`<p><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></p>`);
    }
  }

  // Sub-block 2: autocorrect roll-up (one line, labels for nonzero classes).
  if (monitor.autofix.total > 0) {
    const parts = AUTO_FIX_CLASSES.filter((c) => monitor.autofix.classes[c.code] > 0).map(
      (c) => `${c.label}: ${monitor.autofix.classes[c.code]}`,
    );
    const line = `We automatically corrected ${monitor.autofix.total} ${monitor.autofix.total === 1 ? "value" : "values"} (${parts.join(", ")}).`;
    text.push(line);
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  // Sub-block 3: quiet drift (per show, non-alarming framing; caps at DIGEST_MAX_SHOWS).
  if (monitor.drift.length > 0) {
    text.push("Quiet drift (worth a glance):");
    html.push("<h3>Quiet drift (worth a glance)</h3>");
    const shown = monitor.drift.slice(0, DIGEST_MAX_SHOWS);
    const driftHtml: string[] = [];
    for (const d of shown) {
      const title = d.showTitle ?? "Untitled show";
      const shownClasses = d.classes.slice(0, DIGEST_MAX_ITEMS_PER_SHOW);
      const overflowClasses = Math.max(0, d.classes.length - DIGEST_MAX_ITEMS_PER_SHOW);
      const clsText = shownClasses.map((c) => `${c.label} ${c.prior} to ${c.curr}`).join(", ");
      const suffix = overflowClasses > 0 ? `, +${overflowClasses} more` : "";
      text.push(`  ${title}: ${clsText}${suffix}`);
      driftHtml.push(`<li>${escapeHtml(`${title}: ${clsText}${suffix}`)}</li>`);
    }
    html.push(`<ul>${driftHtml.join("")}</ul>`);
    const overflowShows = Math.max(0, monitor.drift.length - DIGEST_MAX_SHOWS);
    if (overflowShows > 0) {
      const more = `+${overflowShows} more shows`;
      text.push(`${more}: ${dashboard}`);
      html.push(`<p><a href="${escapeHtml(dashboard)}">${escapeHtml(more)}</a></p>`);
    }
  }

  if (text.length === 0) return null;
  return { text, html };
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

  const monitorSection = input.monitor ? renderMonitorSection(input.origin, input.monitor) : null;

  // Subject: needs-attention count when present. Only when needs-attention is empty AND a
  // monitor section renders do we switch to the monitor subject (§8); a plain zero-shows
  // digest keeps its historical "0 shows need attention" subject unchanged.
  const subject =
    totalShows === 0 && monitorSection
      ? "FXAV daily review · automatic changes to review"
      : `FXAV daily review · ${totalShows} ${totalShows === 1 ? "show needs" : "shows need"} attention`;

  if (monitorSection) {
    textLines.push("", "Applied automatically since your last digest", ...monitorSection.text);
    htmlParts.push(
      `<h2>Applied automatically since your last digest</h2>`,
      ...monitorSection.html,
    );
  }

  // Items arrive pre-resolved from the digest builder (Task 3.8 → resolveIngestionCopy,
  // which already strips unresolved placeholders), so no per-item placeholder guard is
  // run here — and titles/items are HTML-escaped below.
  const text = `${subject}\n\n${textLines.join("\n")}\n\nOpen the dashboard: ${dashboard}`;
  const html = `<h2>${escapeHtml(subject)}</h2>${htmlParts.join("")}`;
  return { subject, html, text };
}
