import { messageFor, plainCatalogText, type MessageCode } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resolveIngestionCopy } from "@/lib/admin/needsAttention";
import { BATCH_EMAIL_MAX_ITEMS } from "@/lib/notify/constants";
import { escapeHtml, assertNoUnresolvedPlaceholder } from "./escapeHtml";

export type RealtimeInput =
  | {
      kind: "show";
      origin: string;
      slug: string;
      showTitle: string | null;
      code: string;
      contextSheetName: string | null;
    }
  | { kind: "global"; origin: string }
  | {
      kind: "ingestion";
      origin: string;
      driveFileName: string | null;
      lastErrorCode: string | null;
    };

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Returns the catalog `dougFacing` template for `code` with its KNOWN `<sheet-name>`
 * slot stripped, so the placeholder guard catches any OTHER unfilled catalog token
 * WITHOUT false-positiving on user-supplied values (a show title containing `<x>`
 * must render escaped, not throw — AC-B3.9b vs the HTML-escaping AC).
 */
function guardTemplate(code: string): void {
  const tmpl = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG]?.dougFacing ?? "";
  assertNoUnresolvedPlaceholder(tmpl.replaceAll("<sheet-name>", ""));
}

/**
 * Realtime sync-problem email (§5.1, §8). Copy comes from the catalog `dougFacing`
 * via `messageFor` (X.2 no-raw-codes) / `resolveIngestionCopy` (shared fallback).
 * `<sheet-name>` resolves from `context.sheet_name` then the joined show title, with
 * a non-empty fallback so the slot is always filled. Dynamic values are HTML-escaped
 * in the body; subjects are em-dash-free; ALL links are ABSOLUTE via the injected origin.
 */
type MemberLine = { label: string; bodyText: string };

/** Per-member label + catalog/resolver body copy, shared by the single and batch
 * renderers. Every path resolves through the catalog (invariant 5 — no raw codes). */
function memberLine(input: RealtimeInput): MemberLine {
  if (input.kind === "show") {
    guardTemplate(input.code);
    // Non-empty sheet name so the <sheet-name> slot is always filled (never leaks it).
    const sheetName = input.contextSheetName ?? input.showTitle ?? "this show";
    // plainCatalogText strips the catalog's Markdown emphasis markers
    // (`*<sheet-name>*`, `_<sheet-name>_`) off the template before filling the
    // name — email is plaintext/escaped-HTML with no Markdown renderer.
    const template = messageFor(input.code as MessageCode).dougFacing;
    const bodyText = template
      ? plainCatalogText(template, { sheet_name: sheetName })
      : `${input.showTitle ?? "a show"} has a sync problem.`;
    return { label: input.showTitle ?? "a show", bodyText };
  }
  if (input.kind === "ingestion") {
    // Shared resolver guarantees a placeholder-free string: unknown / null-dougFacing /
    // crew-only / unresolved-placeholder codes fall back to generic copy. Never a raw
    // code; never throws.
    return {
      label: input.driveFileName ?? "a new sheet",
      bodyText: resolveIngestionCopy({
        code: input.lastErrorCode,
        driveFileName: input.driveFileName,
      }),
    };
  }
  guardTemplate("SYNC_STALLED");
  const stalled = MESSAGE_CATALOG.SYNC_STALLED.dougFacing;
  // Defensive strip for consistency with the other paths (SYNC_STALLED is
  // marker-free today, so this is a no-op unless the copy gains emphasis).
  return { label: "Syncing", bodyText: stalled ? plainCatalogText(stalled) : "Syncing is stalled." };
}

export function renderRealtimeProblem(input: RealtimeInput): RenderedEmail {
  const { bodyText } = memberLine(input);
  const subjectShow =
    input.kind === "show"
      ? (input.showTitle ?? "a show")
      : input.kind === "ingestion"
        ? (input.driveFileName ?? "a new sheet")
        : "syncing";
  const href = input.kind === "show" ? `${input.origin}/admin/show/${input.slug}` : `${input.origin}/admin`;

  const subject = `FXAV · ${subjectShow}: sync problem`;
  const text = `${bodyText}\n\nOpen the dashboard: ${href}`;
  const html = `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(href)}">Open the dashboard</a></p>`;
  return { subject, html, text };
}

export type RealtimeBatchGroup = "sync_problems" | "stuck_files";

/** Batch variant (batching spec §2.4). N=1 delegates to the single template. Every
 * member line is catalog/resolver copy — raw codes never render (invariant 5). */
export function renderRealtimeProblemBatch(
  group: RealtimeBatchGroup,
  origin: string,
  members: RealtimeInput[],
): RenderedEmail {
  const first = members[0];
  if (members.length === 1 && first) return renderRealtimeProblem(first);

  const shown = members.slice(0, BATCH_EMAIL_MAX_ITEMS);
  const overflow = members.length - shown.length;
  const subject =
    group === "sync_problems"
      ? `FXAV: sync problems on ${members.length} shows`
      : `FXAV: ${members.length} new sheets need attention`;
  const lines = shown.map(memberLine);
  const overflowLine =
    overflow > 0 ? `…and ${overflow} more — open the dashboard: ${origin}/admin` : null;
  const href = `${origin}/admin`;

  const text = [
    ...lines.map((line) => `${line.label}: ${line.bodyText}`),
    ...(overflowLine ? [overflowLine] : []),
    `Open the dashboard: ${href}`,
  ].join("\n\n");
  const html =
    lines
      .map(
        (line) => `<p><strong>${escapeHtml(line.label)}</strong>: ${escapeHtml(line.bodyText)}</p>`,
      )
      .join("") +
    (overflowLine ? `<p>${escapeHtml(overflowLine)}</p>` : "") +
    `<p><a href="${escapeHtml(href)}">Open the dashboard</a></p>`;
  return { subject, html, text };
}
