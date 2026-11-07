/**
 * lib/reports/offlineMeta.ts
 *
 * What a report written with no signal adds to the server's side of the report
 * (crew offline spec 2026-10-26 §5.2): the validated `offline` fields and the
 * section they put in the GitHub issue. Pure, so the route and the issue
 * builders share one reading of the fields.
 *
 * `writtenAt` is the phone's clock, so it is labelled as phone time and only
 * bounded above: a phone may hold a report for days, and a fast clock is allowed
 * a day of slack. Anything past that is dropped, and the report files as an
 * ordinary one rather than being refused for what its clock said.
 */
import { isIsoUtc } from "@/lib/offline/marker";

export type OfflineFields = {
  writtenAt: string;
  pageRenderedAt: string | null;
  /** Server receipt, stamped by the route. */
  sentAt: string;
};

/** How far ahead of server receipt a phone's clock may run (spec 5.2). */
export const OFFLINE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the request's `offline` object. `dropped` says something the phone sent
 * was thrown away, for the route to log: all of it when `writtenAt` fails, just
 * the render time when only that is malformed.
 */
export function parseOfflineFields(
  raw: unknown,
  receivedAt: Date,
): { fields: OfflineFields | null; dropped: boolean } {
  if (raw === undefined || raw === null) return { fields: null, dropped: false };
  if (typeof raw !== "object") return { fields: null, dropped: true };

  const { writtenAt, pageRenderedAt } = raw as { writtenAt?: unknown; pageRenderedAt?: unknown };
  if (typeof writtenAt !== "string" || !isIsoUtc(writtenAt)) {
    return { fields: null, dropped: true };
  }
  if (Date.parse(writtenAt) > receivedAt.getTime() + OFFLINE_CLOCK_SKEW_MS) {
    return { fields: null, dropped: true };
  }

  const rendered =
    typeof pageRenderedAt === "string" && isIsoUtc(pageRenderedAt) ? pageRenderedAt : null;
  return {
    fields: { writtenAt, pageRenderedAt: rendered, sentAt: receivedAt.toISOString() },
    dropped: rendered === null && pageRenderedAt !== null && pageRenderedAt !== undefined,
  };
}

/** The issue body's section, blank line included; nothing for an ordinary report. */
export function offlineIssueLines(fields: OfflineFields | null | undefined): string[] {
  if (!fields) return [];
  return [
    "**Written with no signal**",
    "",
    `Written at ${fields.writtenAt} (phone time), sent at ${fields.sentAt}.`,
    ...(fields.pageRenderedAt === null
      ? []
      : [`They were looking at the copy saved at ${fields.pageRenderedAt}.`]),
    "",
  ];
}
