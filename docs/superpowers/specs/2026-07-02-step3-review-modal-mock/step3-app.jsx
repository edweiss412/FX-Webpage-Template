// review/step3-app.jsx — production Step-3 page: wizard backdrop + the B review modal.
// NOTE (repo snapshot): the PAGE redesign is DEFERRED — this file is reference-only
// for how the mock mounts the modal (overlay/scrim/modal-pos) and its publish flow.
const { useState, useCallback } = React;
const I = window.Icons;
const { SHOW, SECTIONS, OPERATOR } = window.ReviewData;
const ModalB = window.ModalB;

const flaggedCount = SECTIONS.filter((s) => s.status === "review").length;

const OTHER_SHEETS = [
  { id: "cedar", title: "Cedar Point Sales Kickoff", client: "Cedar Systems", dates: "Aug 4–6, 2026", venue: "Hyatt Regency — Denver", fields: 41 },
  { id: "harbor", title: "Harbor Lights Winter Gala", client: "Harbor Trust", dates: "Dec 12, 2026", venue: "The Plaza — New York", fields: 33 },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "device": "desktop",
  "dark": false
}/*EDITMODE-END*/;

function Stepper() {
  const steps = ["Share folder", "Verify", "Review & publish"];
  return (
    <div className="stepper">
      {steps.map((l, i) => {
        const n = i + 1, done = n < 3, active = n === 3;
        return (
          <React.Fragment key={n}>
            <div className="st">
              <span className={`stn ${done ? "done" : active ? "active" : ""}`}>{done ? React.createElement(I.check, { size: 13 }) : n}</span>
              <span className={`stl ${active ? "active" : ""}`}>{l}</span>
            </div>
            {n < 3 ? <span className={`stline ${done ? "done" : ""}`} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StarCard({ selected, onToggle, onReview }) {
  return (
    <div className="sheetcard flagged">
      <button className="sc-check" data-on={selected ? "1" : "0"} onClick={onToggle} aria-label="Select to publish">
        {selected ? React.createElement(I.check, { size: 14 }) : null}
      </button>
      <div className="sc-body">
        <div className="sc-title">{SHOW.title}</div>
        <div className="sc-meta">
          <span>{SHOW.client}</span><span className="d" /><span>{SHOW.datesSummary}</span><span className="d" /><span>{SHOW.venue.name}</span>
        </div>
      </div>
      <div className="sc-right">
        <span className="schip review"><span className="sdot review" />{flaggedCount} need a look</span>
        <button className="rbtn primary sm" onClick={onReview}>{React.createElement(I.eye, { size: 15 })}Review</button>
      </div>
    </div>
  );
}

function OtherCard({ sheet, selected, onToggle, onView }) {
  return (
    <div className="sheetcard">
      <button className="sc-check" data-on={selected ? "1" : "0"} onClick={onToggle} aria-label="Select to publish">
        {selected ? React.createElement(I.check, { size: 14 }) : null}
      </button>
      <div className="sc-body">
        <div className="sc-title">{sheet.title}</div>
        <div className="sc-meta">
          <span>{sheet.client}</span><span className="d" /><span>{sheet.dates}</span><span className="d" /><span>{sheet.venue}</span>
        </div>
      </div>
      <div className="sc-right">
        <button className="rbtn ghost sm" onClick={onView}>View</button>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState(false);
  const [sel, setSel] = useState({ meridian: false, cedar: true, harbor: true });
  const selectedCount = Object.values(sel).filter(Boolean).length;

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const onPublish = useCallback(() => {
    setSel((s) => ({ ...s, meridian: true }));
    setOpen(false);
    setToast(true);
    setTimeout(() => setToast(false), 2600);
  }, []);

  return (
    <div className="stage" data-device={t.device}>
      <div className="device" data-theme={t.dark ? "dark" : "light"} data-density="compact">
        <div className="app">
          <div className="appscroll">
            <header className="topbar">
              <div className="brand"><span className="mark">F</span><span className="wm">FXAV</span></div>
              <span className="sep">/</span>
              <span className="ctx">New show setup</span>
              <span className="grow" />
              <span className="op"><span className="oav">{OPERATOR.initials}</span><span className="onm">{OPERATOR.name}</span></span>
            </header>

            <div className="wiz">
              <Stepper />
              <div className="wizhead">
                <h1>Review what we found</h1>
                <p><b>3 sheets</b> parsed from your Drive folder. <b>2 are ready</b> to publish — <span className="rev">1 needs a quick look</span> before it goes live. Nothing publishes until you say so.</p>
              </div>
              <div className="sheetlist">
                <StarCard selected={sel.meridian} onToggle={() => setSel((s) => ({ ...s, meridian: !s.meridian }))} onReview={openModal} />
                {OTHER_SHEETS.map((sh) => (
                  <OtherCard key={sh.id} sheet={sh} selected={sel[sh.id]} onToggle={() => setSel((s) => ({ ...s, [sh.id]: !s[sh.id] }))} onView={openModal} />
                ))}
              </div>
            </div>
          </div>

          <div className="wizbar">
            <span className="wb-note"><b>{selectedCount}</b> of 3 selected to publish</span>
            <span className="grow" />
            <button className="rbtn ghost">Back</button>
            <button className="rbtn primary" disabled={selectedCount === 0}>{React.createElement(I.checkC, { size: 16 })}{`Publish ${selectedCount} show${selectedCount === 1 ? "" : "s"}`}</button>
          </div>

          {open ? (
            <div className="overlay">
              <button className="scrim" aria-label="Close review" onClick={closeModal} />
              <div className="modal-pos">
                <ModalB onClose={closeModal} onPublish={onPublish} publishPolicy="nonblocking" />
              </div>
            </div>
          ) : null}

          {toast ? (
            <div className="toast"><span className="tk">{React.createElement(I.checkC, { size: 16 })}</span>Published “{SHOW.title}”</div>
          ) : null}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Preview" />
        <TweakRadio label="Device" value={t.device}
                    options={[{ value: "desktop", label: "Desktop" }, { value: "phone", label: "Phone" }]}
                    onChange={(v) => setTweak("device", v)} />
        <TweakSection label="Appearance" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak("dark", v)} />
        {!open ? (
          <React.Fragment>
            <TweakSection label="Modal" />
            <button className="rbtn outline sm" style={{ width: "100%" }} onClick={() => setOpen(true)}>Reopen review modal</button>
          </React.Fragment>
        ) : null}
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
