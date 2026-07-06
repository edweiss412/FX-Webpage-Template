// review/modal-b.jsx — production Variant B (index + detail) review modal.
const { useState, useRef, useEffect } = React;
const I = window.Icons;
const { SHOW, SECTIONS, GROUP_ORDER, TOTALS } = window.ReviewData;

const secMetaB = (id) => SECTIONS.find((s) => s.id === id);
const BSecIcon = ({ id, size = 16 }) => React.createElement(I[secMetaB(id).icon], { size });

function ModalB({ onClose, onPublish, publishPolicy = "nonblocking" }) {
  const flagged = SECTIONS.filter((s) => s.status === "review");
  const [active, setActive] = useState(SECTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const contentRef = useRef(null);
  const closeRef = useRef(null);
  const rootRef = useRef(null);
  const drag = useRef({ on: false, startY: 0 });

  // scroll-spy — active rail item follows the section nearest the top
  useEffect(() => {
    const sc = contentRef.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const secs = Array.from(sc.querySelectorAll("[data-secid]"));
        const y = sc.scrollTop + 90;
        let cur = secs[0] && secs[0].dataset.secid;
        for (const el of secs) { if (el.offsetTop <= y) cur = el.dataset.secid; else break; }
        if (cur) setActive(cur);
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { sc.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  // Esc closes; focus the close button on open
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => { if (closeRef.current) closeRef.current.focus(); }, 60);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [onClose]);

  const go = (id) => {
    const sc = contentRef.current;
    const el = document.getElementById(`bsec-${id}`);
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    setActive(id);
  };
  const rescan = () => { setBusy(true); setTimeout(() => setBusy(false), 1300); };
  const COUNTED = { crew: true, contacts: true, rooms: true };

  // drag-to-dismiss for the mobile bottom sheet
  const onGrabDown = (e) => { drag.current = { on: true, startY: e.clientY }; e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); if (rootRef.current) rootRef.current.style.transition = "none"; };
  const onGrabMove = (e) => { if (!drag.current.on || !rootRef.current) return; const dy = Math.max(0, e.clientY - drag.current.startY); rootRef.current.style.transform = `translateY(${dy}px)`; };
  const onGrabUp = (e) => {
    if (!drag.current.on || !rootRef.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    drag.current.on = false;
    rootRef.current.style.transition = "transform .26s var(--ease-expo)";
    if (dy > 110) { rootRef.current.style.transform = "translateY(100%)"; setTimeout(onClose, 230); }
    else { rootRef.current.style.transform = ""; }
  };
  const publish = () => {
    if (publishPolicy === "confirm" && flagged.length > 0 && !confirming) { setConfirming(true); return; }
    onPublish();
  };

  const overall = flagged.length > 0
    ? <span className="schip review lg"><span className="sdot review" />{flagged.length} need a look</span>
    : <span className="schip clean lg">{React.createElement(I.check, { size: 13 })}All clean</span>;

  return (
    <div className="modal vB" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Review ${SHOW.title}`}>
      <button className="sheet-grab" aria-label="Drag down or tap to close" onClick={onClose}
              onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
        <span className="grab-pill" />
      </button>
      <header className="m-head">
        <div className="m-head-l">
          <div className="m-eyebrow">Review before publishing</div>
          <a className="m-titlelink" href={SHOW.sheetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.preventDefault()}>
            {SHOW.title}<span className="ext">{React.createElement(I.external, { size: 15 })}</span>
          </a>
          <div className="m-sub"><span>{SHOW.client}</span><span className="sdiv" /><span>{SHOW.datesSummary}</span></div>
        </div>
        <div className="m-head-actions">
          {overall}
          <button className="m-close" ref={closeRef} onClick={onClose} aria-label="Close review">{React.createElement(I.x, { size: 18 })}</button>
        </div>
      </header>

      <div className="vB-main">
        <aside className="b-rail">
          <nav className="b-index" aria-label="Sections">
            {GROUP_ORDER.map((g) => {
              const secs = SECTIONS.filter((s) => s.group === g);
              if (secs.length === 0) return null;
              return (
                <React.Fragment key={g}>
                  <div className="b-grouplabel">{g}</div>
                  {secs.map((s) => (
                    <button className={`b-idx ${active === s.id ? "active" : ""}`} key={s.id} onClick={() => go(s.id)}>
                      <span className="b-ico"><BSecIcon id={s.id} /></span>
                      <span className="b-lab">{s.label}</span>
                      {COUNTED[s.id] ? <span className="b-ct tnum">{s.count}</span> : null}
                      <Dot tone={s.status === "review" ? "review" : "clean"} />
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
            <div className="b-grouplabel">Checks</div>
            <button className={`b-idx ${active === "warnings" ? "active" : ""}`} onClick={() => go("warnings")}>
              <span className="b-ico" style={{ color: "var(--warn-text)" }}>{React.createElement(I.alert, { size: 16 })}</span>
              <span className="b-lab">Parse warnings</span>
              <span className="b-ct tnum">{SHOW.warnings.length}</span>
              <span className="sdot warn" />
            </button>
          </nav>
        </aside>

        <div className="b-content" id="b-scroll" ref={contentRef}>
          {SECTIONS.map((s) => (
            <section className="b-sec" id={`bsec-${s.id}`} data-secid={s.id} key={s.id}>
              <div className="b-sechead">
                <span className="sec-ico"><BSecIcon id={s.id} size={15} /></span>
                <span className="h">{s.label}</span>
                {COUNTED[s.id] ? <span className="sec-count tnum">{s.count}</span> : null}
                <span className="grow" />
                {s.status === "review" ? <StatusChip status={s.status} /> : null}
              </div>
              <div className={`b-panel ${s.status === "review" ? "flagged" : ""}`}>{renderSection(s.id)}</div>
            </section>
          ))}
          <section className="b-sec" id="bsec-warnings" data-secid="warnings">
            <div className="b-sechead">
              <span className="sec-ico" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>{React.createElement(I.alert, { size: 15 })}</span>
              <span className="h">Parse warnings</span>
              <span className="sec-count tnum">{SHOW.warnings.length}</span>
            </div>
            <div className="b-panel flagged"><WarningsList /></div>
          </section>
        </div>
      </div>

      <footer className="m-foot">
        {confirming
          ? <span className="m-foot-note" style={{ color: "var(--warn-text)" }}>{React.createElement(I.alert, { size: 14 })}{flagged.length} sections still need a look — publish anyway?</span>
          : <span className="m-foot-note">{React.createElement(I.shield, { size: 14 })}{flagged.length ? `${flagged.length} to review · won't block publishing` : "All clear to publish"}</span>}
        <span className="grow" />
        <button className="rbtn outline sm" onClick={rescan} disabled={busy}>
          {React.createElement(I.sync, { size: 15, style: busy ? { animation: "spin 1s linear infinite" } : null })}
          {busy ? "Re-scanning…" : "Re-scan sheet"}
        </button>
        <button className="rbtn primary" onClick={publish}>
          {React.createElement(I.checkC, { size: 16 })}{confirming ? "Publish anyway" : "Publish this show"}
        </button>
      </footer>
    </div>
  );
}

window.ModalB = ModalB;
