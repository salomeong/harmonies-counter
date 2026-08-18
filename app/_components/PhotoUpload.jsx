"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { MAX_PHOTOS_PER_SESSION } from "@/app/_lib/photos.js";

async function downscale(file, maxEdge = 1600, quality = 0.85){
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("encode_failed")), "image/jpeg", quality
    ));
  } catch { return file; }
}

function CameraIcon(){
  return <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="14" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>;
}

// With no session id, files stay in the browser while scores are entered. Once save returns an id,
// the same component uploads every staged photo directly to Blob and carries its caption through
// the upload token to the completion webhook.
export function PhotoUpload({ sessionPublicId, existingPhotos = [] }){
  const [photos, setPhotos] = useState(() => existingPhotos.map(p => typeof p === "string"
    ? { id: p, url: p, caption: "", status: "saved" }
    : { id: p.id || p.blobUrl, url: p.blobUrl, caption: p.caption || "", status: "saved" }));
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const uploading = useRef(new Set());

  useEffect(() => {
    if (preview && previewRef.current && !previewRef.current.open) previewRef.current.showModal();
    if (!preview && previewRef.current?.open) previewRef.current.close();
  }, [preview]);

  useEffect(() => {
    if (!sessionPublicId) return;
    photos.filter(p => p.status === "staged" && !uploading.current.has(p.id)).forEach(async photo => {
      uploading.current.add(photo.id);
      setPhotos(all => all.map(p => p.id === photo.id ? { ...p, status: "uploading" } : p));
      try {
        const bytes = await downscale(photo.file);
        const blob = await upload(`sessions/${sessionPublicId}/${crypto.randomUUID()}.jpg`, bytes, {
          access: "public", handleUploadUrl: "/api/photo-upload", contentType: "image/jpeg",
          clientPayload: JSON.stringify({ sessionPublicId, caption: photo.caption })
        });
        URL.revokeObjectURL(photo.url);
        setPhotos(all => all.map(p => p.id === photo.id
          ? { ...p, url: blob.url, file: undefined, status: "saved" } : p));
      } catch {
        setPhotos(all => all.map(p => p.id === photo.id ? { ...p, status: "failed" } : p));
        setError("One photo couldn't upload. Try it again.");
      } finally { uploading.current.delete(photo.id); }
    });
  }, [sessionPublicId, photos]);

  function onFile(e){
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS_PER_SESSION - photos.length);
    e.target.value = "";
    setPhotos(all => [...all, ...files.map(file => ({
      id: crypto.randomUUID(), file, url: URL.createObjectURL(file), caption: "", status: "staged"
    }))]);
  }

  const busy = photos.some(p => p.status === "uploading");
  const atCap = photos.length >= MAX_PHOTOS_PER_SESSION;

  return <section className="photo-section tally-photos" aria-labelledby="board-photos-title">
    <div className="photo-section-heading">
      <div><div className="photo-section-title" id="board-photos-title">Board photos</div>
        <div className="photo-section-subtitle">Capture the board now; photos attach when you save.</div></div>
      {!atCap ? <button type="button" className="photo-add photo-add-text" onClick={() => inputRef.current?.click()}>
        <CameraIcon /> Add photo
      </button> : null}
    </div>
    {photos.length ? <div className="photo-strip">
      {photos.map(photo => <figure className="photo-frame" key={photo.id}>
        <button className="photo-preview" onClick={() => setPreview(photo)} aria-label="Expand board photo">
          <img src={photo.url} alt={photo.caption || "Board photo"} />
          {photo.status === "uploading" ? <span className="photo-spinner" aria-label="Uploading" /> : null}
        </button>
        {photo.status !== "saved" ? <input className="photo-caption-input" value={photo.caption}
          maxLength={240} placeholder="Add a caption…" aria-label="Photo caption" disabled={photo.status === "uploading"}
          onChange={e => setPhotos(all => all.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p))} />
          : photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
        {photo.status === "failed" ? <button className="photo-retry" onClick={() => {
          setError(null); setPhotos(all => all.map(p => p.id === photo.id ? { ...p, status: "staged" } : p));
        }}>Retry upload</button> : null}
      </figure>)}
    </div> : null}
    {busy ? <div className="photo-cap-note">Uploading photos…</div> : null}
    {atCap ? <div className="photo-cap-note">Up to {MAX_PHOTOS_PER_SESSION} photos per game</div> : null}
    {error ? <div className="photo-error">{error}</div> : null}
    <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={onFile} hidden />
    <dialog ref={previewRef} className="photo-lightbox" onCancel={() => setPreview(null)}
      onClick={e => { if (e.target === previewRef.current) setPreview(null); }}>
      {preview ? <div><button className="lightbox-close" onClick={() => setPreview(null)} aria-label="Close photo">×</button>
        <img src={preview.url} alt={preview.caption || "Expanded board photo"} />
        {preview.caption ? <p>{preview.caption}</p> : null}</div> : null}
    </dialog>
  </section>;
}
