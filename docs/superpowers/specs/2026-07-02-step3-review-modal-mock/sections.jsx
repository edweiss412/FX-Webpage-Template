// review/sections.jsx — shared atoms + per-section content renderers.
// Every variant renders the SAME section bodies via renderSection(id); the
// variants differ only in how they arrange/chrome these sections.

// ── Icon set: reuse admin/icons.jsx (window.Icons) + a few review-specific glyphs ──
(function () {
  const Ic = ({ d, size = 18, ...p }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>
  );
  Object.assign(window.Icons, {
    pin:     (p) => <Ic {...p} d={<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.6"/></>} />,
    sparkle: (p) => <Ic {...p} d={<path d="M12 3l1.7 4.9L18.5 9.5l-4.8 1.6L12 16l-1.7-4.9L5.5 9.5l4.8-1.6z"/>} />,
    calendar:(p) => <Ic {...p} d={<><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></>} />,
    bed:     (p) => <Ic {...p} d={<><path d="M3 7v12M3 12h18v7M21 19v-5a3 3 0 0 0-3-3H9v4"/><circle cx="7" cy="10.5" r="1.5"/></>} />,
    truck:   (p) => <Ic {...p} d={<><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></>} />,
    receipt: (p) => <Ic {...p} d={<><path d="M5 3h14v18l-3-1.6L13 21l-3-1.6L7 21l-2-1V3z"/><path d="M9 8h6M9 12h6"/></>} />,
    phone:   (p) => <Ic {...p} d={<path d="M5 3h3.5l1.5 5-2 1.5a13 13 0 0 0 6 6l1.5-2 5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>} />,
    mail:    (p) => <Ic {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 5 8-5"/></>} />,
    audio:   (p) => <Ic {...p} d={<><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8a5 5 0 0 1 0 8"/></>} />,
    video:   (p) => <Ic {...p} d={<><rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></>} />,
    bulb:    (p) => <Ic {...p} d={<><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2h5c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></>} />,
    scenic:  (p) => <Ic {...p} d={<><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></>} />,
    dock:    (p) => <Ic {...p} d={<><path d="M3 21h18M5 21V9l7-4 7 4v12"/><path d="M9 13h6v8H9z"/></>} />,
    box:     (p) => <Ic {...p} d={<><path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></>} />,
  });
})();

const I = window.Icons;
const { useState } = React;
const { SHOW } = window.ReviewData;

// palette for crew avatars (deterministic by index)
const AV_COLORS = ["#3E7BD6", "#C0598B", "#4A9E7F", "#9B6BD1", "#C98A3A", "#D9742E", "#5566B8", "#5A7A6E", "#B0524C", "#2F8FA6", "#8A6D3B", "#7A5EC4"];
const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ── Atoms ────────────────────────────────────────────────────────────────
function Dot({ tone }) { return <span className={`sdot ${tone}`} />; }

function StatusChip({ status, size }) {
  return status === "review"
    ? <span className={`schip review ${size || ""}`}><span className="sdot review" />Needs a look</span>
    : <span className={`schip clean ${size || ""}`}>{React.createElement(I.check, { size: 12 })}Clean</span>;
}

function OpenCell({ cell }) {
  return (
    <a className="opencell" href={SHOW.sheetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.preventDefault()}>
      {React.createElement(I.external, { size: 12 })}{cell}
    </a>
  );
}

// vertical label:value list
function FieldList({ rows }) {
  return (
    <ul className="fieldlist">
      {rows.map((r, i) => (
        <li key={i} className={r.gap ? "gap" : ""}>
          <span className="fl-k">{r.label}</span>
          <span className="fl-v">
            {r.value != null ? r.value : <span className="fl-missing">Not found</span>}
            {r.link ? <a className="fl-link" href="#" onClick={(e) => e.preventDefault()}>{React.createElement(I.folder, { size: 13 })}Open folder</a> : null}
            {r.gap ? <OpenCell cell={r.cell || "INFO"} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Section bodies ─────────────────────────────────────────────────────────
function VenueBody() {
  const v = SHOW.venue;
  return <FieldList rows={[
    { label: "Venue", value: v.name },
    { label: "Address", value: v.address },
    { label: "City", value: v.city },
    { label: "Loading dock", value: v.loadingDock },
    { label: "Maps link", value: "maps.google.com ↗", link: false },
  ]} />;
}

function EventBody() {
  return <FieldList rows={SHOW.eventDetails} />;
}

function CrewBody({ compact }) {
  const shown = compact ? SHOW.crew.slice(0, 6) : SHOW.crew;
  return (
    <div>
      <ul className="peoplegrid">
        {shown.map((m, i) => (
          <li className="person" key={i}>
            <span className="av" style={{ background: AV_COLORS[i % AV_COLORS.length] }}>{initials(m.name)}</span>
            <span className="who">
              <span className="nm">{m.name}</span>
              <span className="rl">{m.role}{m.note ? ` · ${m.note}` : ""}</span>
            </span>
            <span className="pcontacts">
              {m.phone && <a className="cbtn" href="#" onClick={(e) => e.preventDefault()} aria-label={`Call ${m.name}`}>{React.createElement(I.phone, { size: 15 })}</a>}
              {m.email && <a className="cbtn" href="#" onClick={(e) => e.preventDefault()} aria-label={`Email ${m.name}`}>{React.createElement(I.mail, { size: 15 })}</a>}
            </span>
          </li>
        ))}
      </ul>
      {compact && SHOW.crew.length > 6 ? <p className="morenote">+{SHOW.crew.length - 6} more crew</p> : null}
    </div>
  );
}

function ContactsBody() {
  return (
    <ul className="contactlist">
      {SHOW.contacts.map((c, i) => (
        <li key={i} className={`contactrow ${c.gap ? "gap" : ""}`}>
          <div className="cr-top">
            <span className="cr-kind">{c.kind}</span>
            {c.primary ? <span className="tag primary">Primary</span> : null}
            {c.gap ? <span className="tag warn">No phone</span> : null}
          </div>
          <div className="cr-name">{c.name} <span className="cr-org">· {c.org}</span></div>
          <div className="cr-meta">
            {c.phone ? <span>{React.createElement(I.phone, { size: 12 })}{c.phone}</span> : <span className="cr-missing">{React.createElement(I.phone, { size: 12 })}No phone <OpenCell cell="INFO!B22" /></span>}
            {c.email ? <span>{React.createElement(I.mail, { size: 12 })}{c.email}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ScheduleBody({ compact }) {
  const days = compact ? SHOW.schedule.slice(0, 2) : SHOW.schedule;
  return (
    <div className="scheddays">
      {days.map((d, i) => (
        <div className="schedday" key={i}>
          <div className="sd-head">{d.day}</div>
          <div className="sd-grid">
            {d.entries.map((e, j) => (
              <React.Fragment key={j}>
                <span className={`sd-time ${e.overlap ? "warn" : ""}`}>{e.time}</span>
                <span className={`sd-title ${e.synthetic ? "synthetic" : ""} ${e.overlap ? "warn" : ""}`}>
                  {e.title}
                  {e.overlap ? <OpenCell cell="RUN!C31" /> : null}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
      {compact && SHOW.schedule.length > 2 ? <p className="morenote">+{SHOW.schedule.length - 2} more days</p> : null}
    </div>
  );
}

function AgendaBody() {
  return (
    <div className="agenda">
      <p className="agenda-note">{React.createElement(I.checkC, { size: 14 })} Parsed from 1 agenda PDF · 3 sessions detected</p>
      <div className="sd-grid">
        <span className="sd-time">9:30 AM</span><span className="sd-title">Chairman keynote — Main stage</span>
        <span className="sd-time">11:00 AM</span><span className="sd-title">Breakout tracks A–D</span>
        <span className="sd-time">2:00 PM</span><span className="sd-title">Awards rehearsal — Grand Ballroom</span>
      </div>
      <a className="fl-link" href="#" onClick={(e) => e.preventDefault()}>{React.createElement(I.external, { size: 13 })}Open PDF</a>
    </div>
  );
}

const SCOPE_ICONS = { Audio: "audio", Video: "video", Lighting: "bulb", Scenic: "scenic" };
function RoomsBody() {
  return (
    <ul className="roomlist">
      {SHOW.rooms.map((r, i) => (
        <li className="room" key={i}>
          <div className="room-head"><span className="room-name">{r.name}</span><span className="room-kind">{r.kind}</span></div>
          <ul className="scopelist">
            {Object.entries(r.scope).map(([k, v]) => (
              <li key={k}><span className="scope-ico">{React.createElement(I[SCOPE_ICONS[k]] || I.grid, { size: 13 })}</span><span className="scope-k">{k}</span><span className="scope-v">{v}</span></li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function HotelsBody() {
  return (
    <ul className="hotellist">
      {SHOW.hotels.map((h, i) => (
        <li className="hotel" key={i}>
          <span className="hotel-ico">{React.createElement(I.bed, { size: 16 })}</span>
          <div className="hotel-info">
            <div className="hotel-name">{h.name}</div>
            <div className="hotel-sub">{h.guests}</div>
            <div className="hotel-sub faint">{h.address}</div>
          </div>
          <div className="hotel-dates"><span>{h.checkIn}</span><span className="arw">→</span><span>{h.checkOut}</span></div>
        </li>
      ))}
    </ul>
  );
}

function TransportBody() {
  const t = SHOW.transport;
  return (
    <div className="transport">
      <FieldList rows={t.fields} />
      <div className="legs">
        {t.legs.map((l, i) => (
          <div className="leg" key={i}><span className="leg-stage">{l.stage}</span><span className="leg-meta">{l.meta}</span></div>
        ))}
      </div>
    </div>
  );
}

function BillingBody() {
  return <FieldList rows={SHOW.billing.map((b) => ({ ...b, cell: "INFO!F8" }))} />;
}

function PackListBody() {
  const [open, setOpen] = useState(null);
  return (
    <ul className="packlist">
      {SHOW.packList.map((c, i) => (
        <li className="packcase" key={i}>
          <button className="pc-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="pc-chev" data-open={open === i}>{React.createElement(I.chevR, { size: 14 })}</span>
            <span className="pc-label">{c.label}</span>
            <span className="pc-count">{c.count} items</span>
          </button>
          {open === i ? (
            <ul className="pc-items">{c.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const BODIES = {
  venue: VenueBody, event: EventBody, crew: CrewBody, contacts: ContactsBody,
  schedule: ScheduleBody, agenda: AgendaBody, rooms: RoomsBody, hotels: HotelsBody,
  transport: TransportBody, billing: BillingBody, packlist: PackListBody,
};

function renderSection(id, props = {}) {
  const B = BODIES[id];
  return B ? <B {...props} /> : null;
}

// ── Warnings list (shared) ─────────────────────────────────────────────────
function WarningItem({ w }) {
  return (
    <li className={`warnrow ${w.severity}`}>
      <span className="warn-ico">{React.createElement(w.severity === "warn" ? I.alert : I.eye, { size: 14 })}</span>
      <div className="warn-body">
        <div className="warn-title">{w.title}<span className="warn-sev">{w.severity}</span></div>
        <div className="warn-context">{w.context}</div>
        <OpenCell cell={w.sourceCell} />
      </div>
    </li>
  );
}
function WarningsList() {
  return <ul className="warnlist">{SHOW.warnings.map((w, i) => <WarningItem key={i} w={w} />)}</ul>;
}

Object.assign(window, {
  Dot, StatusChip, OpenCell, FieldList, renderSection, WarningsList, WarningItem,
  initials, AV_COLORS,
});
