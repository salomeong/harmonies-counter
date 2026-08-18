"use client";

// The alternate save path for 7 Wonders Duel: military or scientific supremacy ends a real game
// immediately with no score counted at all (see CLAUDE.md's "7 Wonders Duel" section) — a
// fundamentally different save than every other game's, which is why this isn't just another
// ConfirmDialog message. Reuses the same `.tally-dialog`/`.dialog-sheet` chrome as ConfirmDialog so
// it still reads as part of the scorepad, not a browser-native prompt.

import { useEffect, useRef, useState } from "react";

const ENDINGS = [
  { key: "military_supremacy", label: "⚔️ Military" },
  { key: "scientific_supremacy", label: "🔬 Scientific" }
];

export function SupremacyDialog({ open, players, pending, onCancel, onConfirm }){
  const ref = useRef(null);
  const [endedBy, setEndedBy] = useState(null);
  const [winnerSeat, setWinnerSeat] = useState(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    // A fresh choice every time the dialog opens — carrying yesterday's pick forward would let a
    // stray unclicked "Record win" tap confirm the WRONG winner from a previous open.
    if (open) { setEndedBy(null); setWinnerSeat(null); }
  }, [open]);

  return (
    <dialog ref={ref} className="tally-dialog" onCancel={e => { e.preventDefault(); onCancel(); }}
            onClick={e => { if (e.target === ref.current) onCancel(); }}>
      {open ? (
        <div className="dialog-sheet">
          <div className="dialog-kicker">Game ended early</div>
          <h2>Record a supremacy win</h2>
          <p>
            Reaching military or scientific supremacy ends the game immediately — there is no
            score to tally, just who won and how.
          </p>
          <div className="supremacy-form">
            <div className="supremacy-field">
              <span className="supremacy-label">How did it end?</span>
              <div className="toggle-group">
                {ENDINGS.map(e => (
                  <button key={e.key} type="button" className={endedBy === e.key ? "active" : ""}
                          onClick={() => setEndedBy(e.key)}>{e.label}</button>
                ))}
              </div>
            </div>
            <div className="supremacy-field">
              <span className="supremacy-label">Who won?</span>
              <div className="toggle-group">
                {players.map((p, i) => (
                  <button key={p.id} type="button" className={winnerSeat === i ? "active" : ""}
                          onClick={() => setWinnerSeat(i)}>{p.name}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={onCancel} disabled={pending}>Cancel</button>
            {/* pending guards the same double-submit this app's ordinary Save button already
                guards against (app/page.jsx) — a fast double-click/double-tap here would otherwise
                fire two POSTs with no publicId yet on either, each minting its own session row for
                one real win. Found by adversarial review, not hypothetical. */}
            <button type="button" className="btn-primary" disabled={!endedBy || winnerSeat == null || pending}
                    onClick={() => onConfirm(endedBy, winnerSeat)}>
              {pending ? "Recording…" : "Record win"}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
