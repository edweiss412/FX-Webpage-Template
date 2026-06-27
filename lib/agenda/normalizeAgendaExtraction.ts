/**
 * lib/agenda/normalizeAgendaExtraction.ts — render-boundary jsonb validator (spec §5).
 *
 * The stored `agenda_links[i].extracted` is opaque jsonb (an old/forward payload, a
 * partially-written value, or a hand-edited row). The render path NEVER trusts it: any
 * structural deviation → `null` → the Schedule UI falls back to embed-only. A
 * `confidence:'high'` payload with empty/missing `days` is also rejected (a high render
 * with nothing to show is malformed).
 */
import type { AgendaExtraction, AgendaDay, AgendaSession } from "@/lib/agenda/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normSession(v: unknown): AgendaSession | null {
  if (!isRecord(v)) return null;
  if (typeof v.time !== "string") return null;
  if (!(v.title === null || typeof v.title === "string")) return null;
  if (!(v.room === null || typeof v.room === "string")) return null;
  if (!(v.drift === null || typeof v.drift === "string")) return null;
  if (!Array.isArray(v.tracks)) return null;
  const tracks: AgendaSession["tracks"] = [];
  for (const t of v.tracks) {
    if (!isRecord(t)) return null;
    if (typeof t.label !== "string") return null;
    if (!(t.title === null || typeof t.title === "string")) return null;
    if (!(t.room === null || typeof t.room === "string")) return null;
    tracks.push({ label: t.label, title: t.title, room: t.room });
  }
  return { time: v.time, title: v.title, room: v.room, tracks, drift: v.drift };
}

function normDay(v: unknown): AgendaDay | null {
  if (!isRecord(v)) return null;
  if (typeof v.dayLabel !== "string") return null;
  if (!(v.date === null || typeof v.date === "string")) return null;
  if (!Array.isArray(v.sessions)) return null;
  const sessions: AgendaSession[] = [];
  for (const s of v.sessions) {
    const ns = normSession(s);
    if (!ns) return null;
    sessions.push(ns);
  }
  return { dayLabel: v.dayLabel, date: v.date, sessions };
}

export function normalizeAgendaExtraction(raw: unknown): AgendaExtraction | null {
  if (!isRecord(raw)) return null;
  if (raw.confidence !== "high" && raw.confidence !== "low") return null;
  if (typeof raw.corrections !== "number") return null;
  if (typeof raw.extractorVersion !== "number") return null;
  if (!Array.isArray(raw.days)) return null;
  if (!(raw.sourceRevision === undefined || typeof raw.sourceRevision === "string")) return null;
  const days: AgendaDay[] = [];
  for (const d of raw.days) {
    const nd = normDay(d);
    if (!nd) return null;
    days.push(nd);
  }
  // A high-confidence render with nothing to show is malformed → embed-only.
  if (raw.confidence === "high" && days.length === 0) return null;
  const out: AgendaExtraction = {
    confidence: raw.confidence,
    corrections: raw.corrections,
    days,
    extractorVersion: raw.extractorVersion,
  };
  if (typeof raw.sourceRevision === "string") out.sourceRevision = raw.sourceRevision;
  return out;
}
