/**
 * lib/agenda/extractAgendaSchedule.ts — pure PDF→AgendaExtraction extractor (spec §4.1–§4.4).
 *
 * No Drive/network. pdfjs text-layer only (`legacy/build/pdf.mjs`, no worker, no canvas).
 * Ported from the validated prototype v5
 * (docs/superpowers/plans/2026-06-26-agenda-pdf-schedule.assets/extractor-prototype-v5.mjs),
 * with TWO spec deltas the prototype predates:
 *   (1) §4.3.1 order-aware bare-clock inference (forward-fill) replaces the prototype's
 *       fixed-bucket meridiem rule.
 *   (2) §4.4 ambiguous-first-clock guard + time-anchor-LINE parse-% metric.
 * The §4.3.2 explicit-typo monotonic repair (with the AGENDA_MAX_SESSION_MIN end cap) is the
 * ONLY source of `drift`.
 */
import {
  AGENDA_CONFIDENCE,
  AGENDA_MAX_PAGES,
  AGENDA_MAX_SESSION_MIN,
  EXTRACTOR_VERSION,
} from "@/lib/agenda/constants";
import type { AgendaExtraction, AgendaDay, AgendaSession } from "@/lib/agenda/types";

type Line = { p: number; y: number; text: string; font: string; size: number; len: number };
type Meridiem = "AM" | "PM";
type ClockPart = { h: number; m: number; ap: Meridiem | null };

const LOW = (): AgendaExtraction => ({
  confidence: "low",
  corrections: 0,
  days: [],
  extractorVersion: EXTRACTOR_VERSION,
});

const noSp = (t: string) => t.replace(/\s+/g, "");
const clockRange = (t: string) =>
  /^\d{1,2}:?\d{0,2}(AM|PM)?[–—-]\d{1,2}:?\d{0,2}(AM|PM)?$/i.test(noSp(t));
const clockSingle = (t: string) => /^\d{1,2}:\d{2}(AM|PM)?$/i.test(noSp(t));
const isClock = (t: string) => (clockRange(t) || clockSingle(t)) && t.length < 26;

const DOWc = /^(mon|tues?|wednes?|thurs?|fri|satur?|sun)day,?[a-z]*\d/i;
const isDayHeader = (l: Line) => DOWc.test(noSp(l.text)) && /20\d{2}/.test(noSp(l.text));
const LABEL =
  /^(Moderator|Panelists?|Speakers?|Presented by|Presenter|Chairperson|Forum Chairperson|Discussion Leader|Interviewer|Featuring)\s*:/i;
const ROOMKW =
  /\b(Ballroom|Salon|Salons|Room|Foyer|Hall|Suite|Lounge|Terrace|Adorn|Lakeview|LaSalle|La Salle|Delaware|Drawing|Pavilion|Atrium|Gallery)\b/i;
const trackMarker = /^(Breakout\s+[IVX\d]+|[IVX]{1,3}\.\s|Track\s+\w+)/i;

/** Absolute minute-of-day for hour:minute with meridiem (12 AM→0, 12 PM→720). */
function toMin(h: number, m: number, ap: Meridiem): number {
  const hh = (h % 12) + (ap === "PM" ? 12 : 0);
  return hh * 60 + m;
}
const flip = (ap: Meridiem): Meridiem => (ap === "AM" ? "PM" : "AM");
const fmtClock = (h: number, m: number, ap: Meridiem) => `${h}:${String(m).padStart(2, "0")} ${ap}`;

function parseClockPart(s: string): ClockPart | null {
  const m = s.match(/^(\d{1,2}):?(\d{2})?(AM|PM)?$/i);
  if (!m) return null;
  return {
    h: parseInt(m[1]!, 10),
    m: m[2] != null ? parseInt(m[2], 10) : 0,
    ap: (m[3]?.toUpperCase() as Meridiem) ?? null,
  };
}

/** §4.3.1 first-of-day seed: 7–11 → AM; 12 & 1–6 → PM. */
function seedAp(h: number): Meridiem {
  return h >= 7 && h <= 11 ? "AM" : "PM";
}
/** §4.3.1 forward-fill: smallest candidate ≥ floor; both < floor → PM best-effort. */
function fillAp(h: number, m: number, floor: number): Meridiem {
  const am = toMin(h, m, "AM");
  const pm = toMin(h, m, "PM");
  if (am >= floor) return "AM";
  if (pm >= floor) return "PM";
  return "PM";
}

// pdfjs's `legacy/build/pdf.mjs` references DOMMatrix/ImageData/Path2D when it is
// evaluated. In a browser (or jsdom) those globals exist; in the Node serverless
// runtime (Vercel) they do not. pdfjs's own fallback is to load `@napi-rs/canvas`,
// but that native package is an OPTIONAL transitive dependency whose linux binary
// is not installed on Vercel — so pdf.mjs threw `ReferenceError: DOMMatrix is not
// defined` AT MODULE-EVALUATION TIME, which 500'd EVERY route whose server bundle
// statically imported this file (e.g. `/admin`, via lib/sync/enrichAgenda).
//
// We only do text-layer extraction (no canvas rendering), so minimal class stubs
// are sufficient — verified byte-identical extraction vs the native canvas across
// all agenda fixtures. ensurePdfGlobals() installs the stubs (only when absent, so
// a real DOMMatrix is never clobbered) and loadPdfjs() imports pdfjs DYNAMICALLY so
// the heavy module is evaluated only when extraction actually runs — never at this
// module's load time, keeping it out of unrelated route bundles entirely.
function ensurePdfGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(_init?: unknown) {}
    };
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {
      readonly width: number;
      readonly height: number;
      readonly data: Uint8ClampedArray;
      constructor(width = 0, height = 0) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(Math.max(0, width) * Math.max(0, height) * 4);
      }
    };
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {
      constructor(_init?: unknown) {}
    };
  }
}

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsModulePromise: Promise<Pdfjs> | null = null;
function loadPdfjs(): Promise<Pdfjs> {
  ensurePdfGlobals();
  pdfjsModulePromise ??= (async () => {
    // Register pdfjs's worker on the MAIN THREAD before loading the API. pdfjs runs
    // getDocument through a worker; with no real Web Worker (Node) it falls back to a
    // "fake worker" that does `await import(GlobalWorkerOptions.workerSrc)` where
    // workerSrc defaults to the RELATIVE "./pdf.worker.mjs". On the Vercel serverless
    // bundle that relative specifier resolves to a chunk path that does not exist
    // (`/var/task/.next/server/chunks/pdf.worker.mjs`) → pdfjs throws "Setting up fake
    // worker failed", which extractAgendaSchedule's catch swallowed to a 0-session
    // low-confidence result → the admin card rendered "No schedule detected" for PDFs
    // that parse perfectly locally (where the relative path happens to resolve).
    //
    // Fix: pre-populate `globalThis.pdfjsWorker.WorkerMessageHandler` (read by pdfjs's
    // `#mainThreadWorkerMessageHandler`), so the fake-worker path uses it DIRECTLY and
    // never performs the failing dynamic import. The import below uses a STATIC package
    // specifier, which Next bundles into a resolvable chunk — unlike pdfjs's internal
    // `import(workerSrc)` over a runtime variable, which the bundler cannot trace. Lazy
    // and AFTER ensurePdfGlobals() because the worker module also references DOMMatrix
    // at evaluation time. (CI/local were green because the worker resolved from
    // node_modules on disk — the failure is bundling-specific; see the serverless test.)
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as Record<string, unknown>).pdfjsWorker = workerModule;
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return pdfjsModulePromise;
}

export async function extractAgendaSchedule(pdfBytes: Uint8Array): Promise<AgendaExtraction> {
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({
      data: pdfBytes,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    if (doc.numPages > AGENDA_MAX_PAGES) {
      console.warn("[agenda-extract] too-many-pages", {
        bytes: pdfBytes.byteLength,
        numPages: doc.numPages,
        max: AGENDA_MAX_PAGES,
      });
      return LOW();
    }

    // ── 1. Lines: group text items by rounded Y, dominant (font,size). ──
    const L: Line[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const rows = new Map<
        number,
        { items: { x: number; s: string }[]; sig: Map<string, number> }
      >();
      for (const it of tc.items as Array<{ str: string; transform: number[]; fontName: string }>) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]!);
        const size = Math.round(Math.hypot(it.transform[0]!, it.transform[1]!) * 10) / 10;
        if (!rows.has(y)) rows.set(y, { items: [], sig: new Map() });
        const r = rows.get(y)!;
        r.items.push({ x: it.transform[4]!, s: it.str });
        const k = `${it.fontName}|${size}`;
        r.sig.set(k, (r.sig.get(k) ?? 0) + it.str.length);
      }
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        const r = rows.get(y)!;
        const text = r.items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) continue;
        const [font, size] = [...r.sig.entries()].sort((a, b) => b[1] - a[1])[0]![0].split("|");
        L.push({ p, y, text, font: font!, size: parseFloat(size!), len: text.length });
      }
    }
    const lines = L.filter(
      (l) =>
        !/^Page \d+/i.test(l.text) && !/^Institutional Investor/i.test(l.text) && l.text !== "th",
    );

    // ── 2. Self-calibration. ──
    const timeSizes = new Map<number, number>();
    for (const l of lines)
      if (isClock(l.text)) timeSizes.set(l.size, (timeSizes.get(l.size) ?? 0) + 1);
    const timeSize = [...timeSizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 14;
    const isTime = (l: Line) => Math.abs(l.size - timeSize) < 1.5 && isClock(l.text);
    // Modal FONT among clock lines — the §4.4 parse-% denominator pairs font+size, not size
    // alone: in the real templates body/sponsor/intro paragraphs share the 14pt size but a
    // different font, so a size-only denominator tanks valid agendas (PCF 54%, FIT 72%) below
    // the 95% gate. Pairing font and excluding day headers (separately classified) keeps the
    // metric's mis-calibration intent while matching the committed fixtures (all → 100%).
    const clockFonts = new Map<string, number>();
    for (const l of lines) if (isTime(l)) clockFonts.set(l.font, (clockFonts.get(l.font) ?? 0) + 1);
    const timeFont = [...clockFonts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const bodyTally = new Map<string, number>();
    for (const l of lines)
      if (l.len > 55)
        bodyTally.set(`${l.font}|${l.size}`, (bodyTally.get(`${l.font}|${l.size}`) ?? 0) + 1);
    const bodyKey = [...bodyTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const idxTimes = lines.map((l, i) => (isTime(l) ? i : -1)).filter((i) => i >= 0);
    const aboveTally = new Map<string, number>();
    for (const i of idxTimes) {
      const a = lines[i - 1];
      if (a && !isTime(a))
        aboveTally.set(`${a.font}|${a.size}`, (aboveTally.get(`${a.font}|${a.size}`) ?? 0) + 1);
    }
    const titleKeys = new Set([...aboveTally.entries()].filter(([, n]) => n >= 2).map(([k]) => k));
    const K = (l: Line) => `${l.font}|${l.size}`;
    const isBody = (l: Line) => K(l) === bodyKey;
    const isTitle = (l: Line) => titleKeys.has(K(l)) && !isTime(l);

    const shapeRoomish = (l: Line) =>
      l.len <= 46 &&
      !/[.?!]$/.test(l.text) &&
      /^[A-Z0-9]/.test(l.text) &&
      l.text.split(" ").length <= 9 &&
      !LABEL.test(l.text) &&
      !isDayHeader(l) &&
      !isTime(l);

    const fwd: { idx: number; text: string }[][] = [];
    for (const i of idxTimes) {
      const cands: { idx: number; text: string }[] = [];
      for (let m = i + 1; m < lines.length && m <= i + 6; m++) {
        const l = lines[m]!;
        if (isTime(l) || isDayHeader(l)) break;
        if (shapeRoomish(l)) cands.push({ idx: m, text: l.text });
        if (isBody(l) && cands.length) break;
      }
      fwd.push(cands);
    }
    const roomFreq = new Map<string, number>();
    fwd.flat().forEach((c) => roomFreq.set(c.text, (roomFreq.get(c.text) ?? 0) + 1));
    const isRealRoom = (t: string) => ROOMKW.test(t) || (roomFreq.get(t) ?? 0) >= 2;

    // ── 3. Day partition. ──
    function dayFor(i: number): string | null {
      for (let j = i; j >= 0; j--)
        if (isDayHeader(lines[j]!)) return lines[j]!.text.replace(/\s+/g, " ").trim();
      return null;
    }

    // ── 4. Session assembly (title wrap + room + breakout tracks). ──
    type Raw = {
      day: string | null;
      rawTime: string;
      title: string | null;
      room: string | null;
      tracks: { label: string; title: string | null; room: string | null }[];
    };
    const raw: Raw[] = [];
    idxTimes.forEach((i, ai) => {
      const cands = fwd[ai]!;
      let room: string | null = null;
      const subtitle: string[] = [];
      for (const c of cands) {
        if (isRealRoom(c.text)) {
          room = c.text;
          break;
        } else subtitle.push(c.text);
      }
      const up: string[] = [];
      for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
        const l = lines[j]!;
        if (isTime(l) || LABEL.test(l.text) || isRealRoom(l.text)) break;
        if (
          isTitle(l) ||
          (up.length === 0 && !isBody(l) && !isRealRoom(l.text) && !shapeRoomish(l)) ||
          (up.length === 0 && !isBody(l) && !isRealRoom(l.text))
        ) {
          up.unshift(l.text);
        } else break;
      }
      const down: string[] = [];
      for (let m = i + 1; m < lines.length && m <= i + 3; m++) {
        const l = lines[m]!;
        if (isTime(l) || isDayHeader(l) || isRealRoom(l.text) || LABEL.test(l.text)) break;
        if (isTitle(l)) down.push(l.text);
        else break;
      }
      const titleParts = [...up, ...down, ...subtitle.filter((s) => !down.includes(s))];
      const title =
        titleParts
          .join(" ")
          .replace(/\s+/g, " ")
          .replace(/\s+([:?,])/g, "$1")
          .trim() || null;
      const spanEnd = ai + 1 < idxTimes.length ? idxTimes[ai + 1]! : lines.length;
      const tracks: { label: string; title: string | null; room: string | null }[] = [];
      if (title && /breakout|discussion group/i.test(title)) {
        for (let m = i + 1; m < spanEnd; m++) {
          const l = lines[m]!;
          if (trackMarker.test(l.text)) {
            const rest = l.text.replace(trackMarker, "").trim();
            let tTitle: string | null = rest || null;
            let tRoom: string | null = null;
            for (let nn = m + 1; nn < spanEnd && nn <= m + 4; nn++) {
              const xl = lines[nn]!;
              if (trackMarker.test(xl.text) || isTime(xl)) break;
              if (!tRoom && isRealRoom(xl.text)) {
                tRoom = xl.text;
                continue;
              }
              if (!tTitle && (isTitle(xl) || (!isBody(xl) && !shapeRoomish(xl)))) tTitle = xl.text;
            }
            tracks.push({
              label: l.text.match(trackMarker)![0].trim(),
              title: tTitle,
              room: tRoom,
            });
          }
        }
      }
      raw.push({ day: dayFor(i), rawTime: lines[i]!.text, title, room, tracks });
    });

    // ── 5. Order-aware time resolution (§4.3.1) + explicit-typo repair (§4.3.2). ──
    type Resolved = Raw & { time: string; drift: string | null; startMin: number | null };
    const resolved: Resolved[] = raw.map((r) => ({
      ...r,
      time: r.rawTime,
      drift: null,
      startMin: null,
    }));

    let corrections = 0;
    {
      // group indices by day, preserving document order
      const byDay = new Map<string, number[]>();
      resolved.forEach((r, i) => {
        const d = r.day ?? "?";
        (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(i);
      });
      for (const [, idxs] of byDay) {
        let prevStart: number | null = null;
        idxs.forEach((idx, k) => {
          const r = resolved[idx]!;
          const parts = noSp(r.rawTime).split(/[–—-]/);
          const sp = parseClockPart(parts[0] ?? "");
          if (!sp) {
            r.time = r.rawTime;
            return;
          }
          const ep = parts[1] ? parseClockPart(parts[1]) : null;

          // start meridiem
          const startExplicit = sp.ap !== null;
          let startAp: Meridiem =
            sp.ap ?? (prevStart == null ? seedAp(sp.h) : fillAp(sp.h, sp.m, prevStart));
          let startMin = toMin(sp.h, sp.m, startAp);

          // end meridiem (resolved against the session's own start as floor)
          let endAp: Meridiem | null = null;
          let endMin: number | null = null;
          const endExplicit = ep?.ap != null;
          if (ep) {
            endAp = ep.ap ?? fillAp(ep.h, ep.m, startMin);
            endMin = toMin(ep.h, ep.m, endAp);
          }

          let drift: string | null = null;

          // §4.3.2 start repair — ONLY explicit-meridiem starts that jumped backwards.
          if (startExplicit && prevStart != null && startMin < prevStart) {
            const fAp = flip(startAp);
            const fMin = toMin(sp.h, sp.m, fAp);
            const nextSp =
              k + 1 < idxs.length
                ? parseClockPart(noSp(resolved[idxs[k + 1]!]!.rawTime).split(/[–—-]/)[0] ?? "")
                : null;
            const upper =
              endMin != null
                ? endMin
                : nextSp
                  ? toMin(nextSp.h, nextSp.m, nextSp.ap ?? seedAp(nextSp.h))
                  : Infinity;
            if (fMin >= prevStart && fMin <= upper) {
              drift = `start→${fmtClock(sp.h, sp.m, fAp)} (source: ${fmtClock(sp.h, sp.m, startAp)})`;
              startAp = fAp;
              startMin = fMin;
              corrections++;
            }
          }

          // §4.3.2 end repair — explicit end before its own start; flip if it fits AND stays ≤ cap.
          if (ep && endExplicit && endMin != null && endAp != null && endMin < startMin) {
            const fAp = flip(endAp);
            const fMin = toMin(ep.h, ep.m, fAp);
            const nextSp =
              k + 1 < idxs.length
                ? parseClockPart(noSp(resolved[idxs[k + 1]!]!.rawTime).split(/[–—-]/)[0] ?? "")
                : null;
            const nextStart = nextSp
              ? toMin(nextSp.h, nextSp.m, nextSp.ap ?? seedAp(nextSp.h))
              : Infinity;
            if (
              fMin >= startMin &&
              fMin <= nextStart &&
              fMin - startMin <= AGENDA_MAX_SESSION_MIN
            ) {
              drift =
                (drift ? drift + "; " : "") +
                `end→${fmtClock(ep.h, ep.m, fAp)} (source: ${fmtClock(ep.h, ep.m, endAp)})`;
              endAp = fAp;
              endMin = fMin;
              corrections++;
            }
          }

          const startStr = fmtClock(sp.h, sp.m, startAp);
          const endStr = ep && endAp != null ? fmtClock(ep.h, ep.m, endAp) : null;
          r.time = endStr ? `${startStr} – ${endStr}` : startStr;
          r.drift = drift;
          r.startMin = startMin;
          prevStart = startMin;
        });
      }
    }

    // ── 6. Confidence gate (§4.4). ──
    const n = resolved.length;
    const pTitle = n ? resolved.filter((s) => s.title).length / n : 0;
    const pRoom = n ? resolved.filter((s) => s.room).length / n : 0;
    // §4.4 time-anchor-LINE parse %: detected anchor lines = (timeFont,timeSize) lines that are
    // NOT day headers; numerator = those that are valid clocks.
    const anchorLines = lines.filter(
      (l) =>
        Math.abs(l.size - timeSize) < 1.5 &&
        (timeFont == null || l.font === timeFont) &&
        !isDayHeader(l),
    );
    const pTimeAnchor = anchorLines.length
      ? anchorLines.filter((l) => isClock(l.text)).length / anchorLines.length
      : 0;

    // start-monotonic within each day (non-decreasing starts ONLY; equal allowed; ends excluded).
    let monoOK = true;
    {
      const byDay = new Map<string, number[]>();
      resolved.forEach((s) => {
        const d = s.day ?? "?";
        (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(s.startMin ?? NaN);
      });
      for (const [, starts] of byDay) {
        let last = -Infinity;
        for (const v of starts) {
          if (Number.isNaN(v)) continue;
          if (v < last) monoOK = false;
          last = v;
        }
      }
    }

    // §4.4 ambiguous-first-clock guard — scoped to the SHOW's first session.
    //
    // Spec §4.4 phrases this as "any day's first session," and claims RFI/PCF/FIT all carry an
    // explicit AM on their first session. That claim is INCORRECT against the committed FIT
    // fixture: FIT's clocks are entirely bare and its day-2 first session is "7:45" (hour 7).
    // Applying the guard per-day would gate FIT to 'low', contradicting the non-negotiable
    // spec-mandated requirement that FIT extracts high-confidence (day-1 → PM). Per the
    // trust-the-fixture directive, the guard is scoped to the genuinely context-free case — the
    // show's very first session — which still catches a show that OPENS with an ambiguous evening
    // clock silently passing as morning (its stated intent), while a later day's bare 7–11 start
    // is correctly seeded AM by §4.3.1.
    let ambiguousFirst = false;
    const first = resolved[0];
    if (first) {
      const tok = noSp(first.rawTime);
      const startTok = tok.split(/[–—-]/)[0] ?? "";
      const sp = parseClockPart(startTok);
      const hasExplicit = /AM|PM/i.test(tok);
      if (sp && !hasExplicit && sp.h >= 7 && sp.h <= 11) ambiguousFirst = true;
    }

    const high =
      n >= AGENDA_CONFIDENCE.minSessions &&
      pTimeAnchor >= AGENDA_CONFIDENCE.minTimeAnchorParsePct &&
      pTitle >= AGENDA_CONFIDENCE.minTitlePct &&
      pRoom >= AGENDA_CONFIDENCE.minRoomPct &&
      monoOK &&
      !ambiguousFirst;

    if (!high) {
      // Observability (agenda serverless-extraction gap): a low-confidence result renders
      // note-only ("No schedule detected in this PDF"), indistinguishable from a genuinely
      // scheduleless PDF without this breadcrumb. `bytes` correlates with the
      // "[agenda-enrich] download" line that carries the fileId.
      console.warn("[agenda-extract] low-confidence", {
        bytes: pdfBytes.byteLength,
        numPages: doc.numPages,
        lineCount: lines.length,
        sessions: n,
        pTimeAnchor: Number(pTimeAnchor.toFixed(3)),
        pTitle: Number(pTitle.toFixed(3)),
        pRoom: Number(pRoom.toFixed(3)),
        monoOK,
        ambiguousFirst,
        thresholds: {
          minSessions: AGENDA_CONFIDENCE.minSessions,
          minTimeAnchorParsePct: AGENDA_CONFIDENCE.minTimeAnchorParsePct,
          minTitlePct: AGENDA_CONFIDENCE.minTitlePct,
          minRoomPct: AGENDA_CONFIDENCE.minRoomPct,
        },
      });
      return { confidence: "low", corrections, days: [], extractorVersion: EXTRACTOR_VERSION };
    }

    // ── 7. Group into AgendaDay[] in document order. ──
    const days: AgendaDay[] = [];
    let curLabel: string | null | undefined = undefined;
    for (const r of resolved) {
      const label = r.day;
      const session: AgendaSession = {
        time: r.time,
        title: r.title,
        room: r.room,
        tracks: r.tracks,
        drift: r.drift,
      };
      if (days.length === 0 || curLabel !== label) {
        curLabel = label;
        days.push({ dayLabel: label ?? "", date: null, sessions: [session] });
      } else {
        days[days.length - 1]!.sessions.push(session);
      }
    }

    console.log("[agenda-extract] high", {
      bytes: pdfBytes.byteLength,
      numPages: doc.numPages,
      days: days.length,
      sessions: n,
    });
    return { confidence: "high", corrections, days, extractorVersion: EXTRACTOR_VERSION };
  } catch (err) {
    // Previously swallowed silently — the #1 reason a serverless extraction failure
    // was indistinguishable from "no schedule" in production.
    console.error("[agenda-extract] pdfjs threw", {
      bytes: pdfBytes.byteLength,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    return LOW();
  }
}
