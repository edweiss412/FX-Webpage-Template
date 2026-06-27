export type AgendaSession = {
  time: string; // normalized, e.g. "9:00 AM – 9:40 AM"
  title: string | null;
  room: string | null;
  tracks: { label: string; title: string | null; room: string | null }[];
  drift: string | null; // "start→12:25 PM (source: 12:25 AM)" | null
};
export type AgendaDay = { dayLabel: string; date: string | null; sessions: AgendaSession[] };
export type AgendaExtraction = {
  confidence: "high" | "low";
  corrections: number;
  days: AgendaDay[]; // [] when confidence === "low"
  sourceRevision?: string; // Drive headRevisionId
  extractorVersion: number; // EXTRACTOR_VERSION at extraction time
};
