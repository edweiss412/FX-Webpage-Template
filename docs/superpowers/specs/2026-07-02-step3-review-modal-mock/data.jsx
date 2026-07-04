// review/data.jsx — one maximally-detailed parsed show for the Step-3 review modal.
// This is deliberately a "worst case for cramped": full crew, multi-day run of
// show, several rooms with A/V/L scope, hotels, transport, pack list, plus a few
// real parse issues so the review states have something to show.

const OPERATOR = { name: "Dana Whitfield", initials: "DW", role: "Owner · FXAV" };

const SHOW = {
  driveFileId: "1a2B3cD4",
  sheetName: "Meridian Global Leadership Summit 2026 — MASTER.xlsx",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1a2B3cD4",
  title: "Meridian Global Leadership Summit 2026",
  client: "Meridian Financial Group",
  dates: {
    travelIn: "2026-09-08",
    set: "2026-09-09",
    showDays: ["2026-09-10", "2026-09-11", "2026-09-12"],
    travelOut: "2026-09-13",
  },
  datesSummary: "Travel in Sep 8 · Set Sep 9 · Show Sep 10–12 · Travel out Sep 13",
  venue: {
    name: "Waldorf Astoria — Grand Ballroom",
    address: "301 Park Avenue",
    city: "New York, NY 10022",
    loadingDock: "50th St. freight entrance · dock-high, 2 bays · union house",
    googleLink: "https://maps.google.com/?q=Waldorf+Astoria+New+York",
  },
  eventDetails: [
    { label: "Keynote", value: "Chairman address — 9:30 AM Thu, teleprompter + confidence monitors" },
    { label: "Opening reel", value: "2:10 run — plays off the media server, house to black on cue" },
    { label: "Dress", value: "Black-tie gala Fri; business Thu/Sat" },
    { label: "Diagrams", value: "3 files in the show folder", link: true },
  ],
  crew: [
    { name: "Marcus Vinkel", role: "A1 · Audio Lead", phone: "+1 212 555 0142", email: "marcus@fxav.com" },
    { name: "Priya Desai", role: "A2", phone: "+1 212 555 0177", email: "priya@fxav.com" },
    { name: "Theo Karras", role: "V1 · Video Lead", phone: "+1 212 555 0190", email: "theo@fxav.com" },
    { name: "Rosa Nunez", role: "LD · Lighting", phone: "+1 212 555 0118", email: "rosa@fxav.com" },
    { name: "Jordan Bell", role: "Stage Manager", phone: "+1 212 555 0163", email: "jordan@fxav.com" },
    { name: "Wei Chen", role: "V2 · Camera", phone: "+1 212 555 0121", email: "wei@fxav.com" },
    { name: "Sam Okafor", role: "Rigging Lead", phone: "+1 212 555 0155", email: "sam@fxav.com" },
    { name: "Elena Fischer", role: "Comms / RF", phone: "+1 212 555 0139", email: "elena@fxav.com" },
    { name: "Nate Brooks", role: "A3 · Playback", phone: "+1 212 555 0184", email: "nate@fxav.com" },
    { name: "Kai Andersen", role: "Utility", phone: null, email: "kai@fxav.com", note: "Fri–Sat only" },
    { name: "Lucia Romano", role: "Scenic / Carps", phone: "+1 212 555 0176", email: "lucia@fxav.com" },
    { name: "Devon Pratt", role: "Video Engineer", phone: "+1 212 555 0102", email: "devon@fxav.com" },
  ],
  schedule: [
    { iso: "2026-09-09", day: "Wed, Sep 9", label: "Set day", entries: [
      { time: "8:00 AM", title: "Load-in — dock B" },
      { time: "12:00 PM", title: "Rig + motors up" },
      { time: "3:00 PM", title: "Audio + video build" },
      { time: "6:00 PM", title: "Focus + programming" },
    ]},
    { iso: "2026-09-10", day: "Thu, Sep 10 · Show 1", entries: [
      { time: "9:00 AM", title: "Crew call" },
      { time: "9:30 AM", title: "Chairman keynote (rehearsal)" },
      { time: "12:00 PM", title: "Soundcheck — GM band" },
      { time: "1:00 PM", title: "Doors" },
      { time: "1:30 PM", title: "General session" },
      { time: "5:30 PM", title: "Reset for breakouts" },
    ]},
    { iso: "2026-09-11", day: "Fri, Sep 11 · Show 2 (Gala)", entries: [
      { time: "10:00 AM", title: "Crew call" },
      { time: "11:00 AM", title: "Gala look — refocus" },
      { time: "2:00 PM", title: "Rehearsal — awards" },
      { time: "5:00 PM", title: "Doors — cocktails" },
      { time: "5:00 PM", title: "VIP mic check (Salon C)", overlap: true },
      { time: "7:00 PM", title: "Gala dinner + awards" },
    ]},
    { iso: "2026-09-12", day: "Sat, Sep 12 · Show 3", entries: [
      { time: "9:00 AM", title: "Crew call" },
      { time: "10:00 AM", title: "Closing general session" },
      { time: "1:00 PM", title: "Show ends" },
      { time: "1:30 PM", title: "Strike begins", synthetic: true },
      { time: "8:00 PM", title: "Load-out complete", synthetic: true },
    ]},
  ],
  rooms: [
    { name: "Grand Ballroom", kind: "General session", scope: {
      Audio: "L-Acoustics K2 (L/R) · 12× KS28 · DiGiCo SD12 at FOH",
      Video: "7.6m × 4.3m center LED 2.9mm · 2× IMAG · Barco E2",
      Lighting: "48× spot, FOH truss · warm wash 3200K · 8× blinders",
      Scenic: "24ft custom header + side towers",
    }},
    { name: "Salon C", kind: "VIP reception", scope: {
      Audio: "2× powered tops · 2-ch wireless handheld",
      Video: "2× 75\" confidence monitors",
      Lighting: "Uplights ×12, amber",
    }},
    { name: "Breakout 4A", kind: "Breakout", scope: {
      Audio: "Line array micro + 2 handhelds",
      Video: "Single 98\" LED + laptop switch",
    }},
  ],
  hotels: [
    { name: "The Kimberly Hotel", guests: "Audio + video crew (8)", address: "145 E 50th St, New York", checkIn: "Sep 8", checkOut: "Sep 13" },
    { name: "Pod 51", guests: "Rigging + scenic (4)", address: "230 E 51st St, New York", checkIn: "Sep 8", checkOut: "Sep 13" },
  ],
  contacts: [
    { kind: "Production manager", name: "Doug Pemberton", org: "FXAV", phone: "+1 212 555 0100", email: "doug@fxav.com", primary: true },
    { kind: "Client contact", name: "Hannah Cole", org: "Meridian Events", phone: "+1 212 555 0211", email: "hannah@meridian.com" },
    { kind: "Client contact (secondary)", name: "Raj Malhotra", org: "Meridian Events", phone: null, email: "raj@meridian.com", gap: true },
    { kind: "In-house AV", name: "Waldorf House AV", org: "Venue", phone: "+1 212 555 0300", email: "av@waldorf.com" },
  ],
  transport: {
    fields: [
      { label: "Driver", value: "Sound Transit — Mike R." },
      { label: "Driver phone", value: "+1 917 555 0480" },
      { label: "Vehicle", value: "26ft box truck + sprinter" },
      { label: "License plate", value: "NY · 88-JR21" },
      { label: "Parking", value: "Crew lot on 49th — validate at desk" },
    ],
    legs: [
      { stage: "Truck arrives", meta: "Sep 9 · 7:30 AM · Sam O., Lucia R." },
      { stage: "Load-out truck", meta: "Sep 12 · 8:00 PM" },
    ],
  },
  billing: [
    { label: "COI", value: "On file — expires Dec 2026" },
    { label: "Proposal", value: "MFG-2026-114 (signed)" },
    { label: "Invoice", value: "Not yet issued" },
    { label: "PO #", value: null, gap: true },
  ],
  packList: [
    { label: "FOH — console + control", count: 6, items: ["1 × DiGiCo SD12", "1 × SD-Rack stagebox", "2 × Waves server", "1 × UPS 1500VA", "1 × comms base", "1 × FOH toolkit"] },
    { label: "Wireless — RF case", count: 8, items: ["8 × Shure ULXD handheld", "4 × DPA headset", "1 × antenna distro", "spares + batteries"] },
    { label: "Video — LED processing", count: 5, items: ["1 × Barco E2", "2 × media server", "1 × PTZ kit", "1 × hard cam"] },
    { label: "Lighting — dimmers + control", count: 4, items: ["1 × grandMA3 light", "2 × dimmer rack", "1 × cable trunk"] },
    { label: "Rigging — motors + truss", count: 9, items: ["12 × 1-ton motor", "1 × motor control", "assorted truss"] },
    { label: "Scenic — header + towers", count: 3, items: ["1 × custom header", "2 × side tower"] },
  ],
  warnings: [
    { severity: "warn", section: "schedule", title: "Two calls overlap on Fri, Sep 11", context: "\"Doors — cocktails\" and \"VIP mic check\" are both set to 5:00 PM. Confirm the second is a separate room.", sourceCell: "RUN!C31" },
    { severity: "info", section: "contacts", title: "Client backup contact has no phone", context: "Raj Malhotra parsed with an email but no phone number.", sourceCell: "INFO!B22" },
    { severity: "info", section: "billing", title: "PO number not found", context: "No purchase-order number was found on the billing tab.", sourceCell: "INFO!F8" },
  ],
};

// ── Section model — the single source of truth every variant consumes. ──
// status: "clean" (parsed with no issue) | "review" (has a warning/data gap).
// group: the meta-cluster the section belongs to.
const SECTIONS = [
  { id: "venue",    label: "Venue & location", icon: "pin",     group: "The show",  count: 5,  status: "clean" },
  { id: "event",    label: "Event details",    icon: "sparkle", group: "The show",  count: 4,  status: "clean" },
  { id: "crew",     label: "Crew",             icon: "users",   group: "People",    count: 12, status: "clean" },
  { id: "contacts", label: "Contacts",         icon: "phone",   group: "People",    count: 4,  status: "review" },
  { id: "schedule", label: "Crew schedule",    icon: "calendar",group: "Schedule",  count: 4,  status: "review" },
  { id: "agenda",   label: "Agenda",           icon: "file",    group: "Schedule",  count: 3,  status: "clean" },
  { id: "hotels",   label: "Hotels",           icon: "bed",     group: "Logistics", count: 2,  status: "clean" },
  { id: "transport",label: "Transport",        icon: "truck",   group: "Logistics", count: 7,  status: "clean" },
  { id: "rooms",    label: "Rooms & scope",    icon: "grid",    group: "Gear",      count: 3,  status: "clean" },
  { id: "packlist", label: "Pack list",        icon: "box",     group: "Gear",      count: 6,  status: "clean" },
  { id: "billing",  label: "Billing & docs",   icon: "receipt", group: "Money",     count: 4,  status: "review" },
];

const GROUP_ORDER = ["The show", "People", "Schedule", "Logistics", "Gear", "Money"];

// Totals used by the summary reads across variants.
const TOTALS = (() => {
  const fields = SECTIONS.reduce((n, s) => n + s.count, 0);
  const review = SECTIONS.filter((s) => s.status === "review").length;
  return { fields, review, clean: SECTIONS.length - review, sections: SECTIONS.length, warnings: SHOW.warnings.length };
})();

window.ReviewData = { OPERATOR, SHOW, SECTIONS, GROUP_ORDER, TOTALS };
