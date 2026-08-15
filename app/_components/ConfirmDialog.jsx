"use client";

import { useEffect, useRef } from "react";

export function ConfirmDialog({ confirmation, onClose }){
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
    if (!confirmation && dialog?.open) dialog.close();
  }, [confirmation]);

  return (
    <dialog ref={ref} className="tally-dialog" onCancel={e => { e.preventDefault(); onClose(false); }}
            onClick={e => { if (e.target === ref.current) onClose(false); }}>
      {confirmation ? (
        <div className="dialog-sheet">
          <div className="dialog-kicker">Please confirm</div>
          <h2>{confirmation.title}</h2>
          <p>{confirmation.message}</p>
          <div className="dialog-actions">
            <button onClick={() => onClose(false)}>Keep tallying</button>
            <button className="btn-danger" onClick={() => onClose(true)}>{confirmation.confirmLabel}</button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
