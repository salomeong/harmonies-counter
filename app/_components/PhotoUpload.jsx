"use client";

// The whole board-photos section — existing photos plus the add control — lives in one client
// component rather than splitting "display existing" (server) from "add new" (client). Existing
// photo URLs are plain strings, so there's nothing gained by keeping them server-rendered, and
// keeping the section together means the "you're at the cap" and "here's an error" states only
// have to be computed in one place against one combined list.
//
// Uploaded-this-tab photos are optimistic and client-only: onUploadCompleted (app/api/photo-upload/
// route.js) is what actually writes the session_photos row, arriving via Vercel's own webhook
// independent of this tab's lifetime. A reload before that lands would (very briefly) not show a
// just-added photo — an accepted gap, not silently papered over; see docs/deploying.md on why the
// webhook, not a second client call, is the source of truth.

import { useState, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { MAX_PHOTOS_PER_SESSION } from "@/app/_lib/photos.js";

// createImageBitmap can fail (unsupported browser, corrupt file) — a browser that can't
// decode/re-encode client-side still gets to upload the original; MAX_PHOTO_BYTES server-side is
// the backstop for that case, not this function.
async function downscale(file, maxEdge = 1600, quality = 0.85){
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/jpeg", quality);
    });
  } catch {
    return file;
  }
}

function CameraIcon(){
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
            fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function PhotoUpload({ sessionPublicId, existingPhotos }){
  const [uploaded, setUploaded] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const allPhotos = [...existingPhotos, ...uploaded];
  const atCap = allPhotos.length >= MAX_PHOTOS_PER_SESSION;

  async function onFile(e){
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-picked after an error
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const bytes = await downscale(file);
      const pathname = `sessions/${sessionPublicId}/${crypto.randomUUID()}.jpg`;
      const blob = await upload(pathname, bytes, {
        access: "public",
        handleUploadUrl: "/api/photo-upload",
        contentType: "image/jpeg",
        clientPayload: JSON.stringify({ sessionPublicId })
      });
      setUploaded(u => [...u, blob.url]);
    } catch {
      setError("Couldn't upload that photo — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-section">
      <div className="photo-section-title">📷 Board photos</div>
      <div className="photo-strip">
        {allPhotos.map(url => (
          <div className="photo-frame" key={url}>
            <img src={url} alt="" loading="lazy" />
          </div>
        ))}
        {!atCap ? (
          <button
            type="button"
            className={"photo-add" + (busy ? " busy" : "")}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            aria-label="Add a photo of the board"
          >
            {busy ? <span className="photo-spinner" aria-hidden="true" /> : <CameraIcon />}
          </button>
        ) : null}
      </div>
      {atCap ? <div className="photo-cap-note">Up to {MAX_PHOTOS_PER_SESSION} photos per game</div> : null}
      {error ? <div className="photo-error">{error}</div> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: "none" }}
      />
    </div>
  );
}
