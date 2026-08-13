// Plain data, imported by the server route (app/api/photo-upload/route.js), the server-rendered
// recap (Recap.jsx) and the client upload island (PhotoUpload.jsx) — kept in its own
// framework-neutral file for the same reason app/_lib/mascots.js is: a value that both a Server
// and a Client Component need must not live inside a component file carrying either directive, or
// it silently fails to cross the boundary. See CLAUDE.md's "RSC boundaries" section.

// A board only has so many angles worth a photo, and this is what stands between an open endpoint
// and someone filling the store — the honest threat model for an app with no login (see
// docs/next.md): a stranger with a real public_id, not an authenticated bad actor.
export const MAX_PHOTOS_PER_SESSION = 6;

// Generous relative to the ~1600px-long-edge JPEG PhotoUpload.jsx actually sends — this is a
// backstop against a browser that couldn't downscale (canvas/createImageBitmap unsupported), not
// the primary size control.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
