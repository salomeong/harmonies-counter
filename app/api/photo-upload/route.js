// The token-issuing side of a client-side Vercel Blob upload. The client (app/_components/
// PhotoUpload.jsx) never talks to Blob directly with a secret — it calls upload(), which POSTs
// here first to get a short-lived, narrowly-scoped client token, then uploads straight to Blob's
// storage with that token. This route sees two request shapes on the same endpoint, both handled
// by handleUpload(): "please generate me a token" (before the upload) and "an upload just
// completed" (Vercel's own webhook, after).
//
// There is no login in this app (see docs/next.md) — the honest threat model is a stranger with a
// real public_id, not an authenticated bad actor, so the checks below are: does the session
// genuinely exist, and has it already hit the photo cap. Nothing stops a stranger who knows a real
// public_id from adding a photo to THAT session; that's the accepted trade for a three-friend app
// with no accounts.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { getSessionForUpload, recordSessionPhoto } from "@/lib/session.mjs";
import { MAX_PHOTOS_PER_SESSION, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES } from "@/app/_lib/photos.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json();

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        let sessionPublicId;
        try {
          ({ sessionPublicId } = JSON.parse(clientPayloadRaw || "{}"));
        } catch {
          throw new Error("invalid_client_payload");
        }
        if (!sessionPublicId) throw new Error("missing_session");

        // @vercel/blob's client-upload flow has no server-side pathname override — the CLIENT
        // chooses it when calling upload(). Since that pathname is our own code (PhotoUpload.jsx),
        // not third-party input, this isn't validating an adversarial value so much as catching a
        // bug that would let one session's upload land in another's folder.
        if (!pathname.startsWith(`sessions/${sessionPublicId}/`)) {
          throw new Error("pathname_mismatch");
        }

        const session = await getSessionForUpload(sessionPublicId);
        if (!session) throw new Error("session_not_found");
        if (session.photoCount >= MAX_PHOTOS_PER_SESSION) throw new Error("too_many_photos");

        return {
          allowedContentTypes: ALLOWED_PHOTO_TYPES,
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
          // Carried through to onUploadCompleted below, so it doesn't need to re-derive the
          // session's numeric id from the public one a second time.
          tokenPayload: JSON.stringify({ sessionId: session.id })
        };
      },

      // Vercel's own infrastructure calls this once the bytes have actually landed in Blob
      // storage — independent of whether the browser tab that started the upload is still open.
      // That's what makes it the right place to write the DB row rather than a second endpoint the
      // client calls itself: a client-driven "now record this URL" call has a real gap (tab closes
      // right after the PUT succeeds, before the second call fires) that this doesn't.
      //
      // Cannot fire against localhost — Blob has no route back to a dev machine. Verified on
      // preview instead; see docs/deploying.md.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { sessionId } = JSON.parse(tokenPayload || "{}");
        if (!sessionId) return;
        await recordSessionPhoto({ sessionId, blobUrl: blob.url });
      }
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/photo-upload failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "server_error" }, { status: 400 });
  }
}
