// GET /api/session?id=<public_id> -> the full session record: everyone who played, in seat
// order, with their per-category detail. The /g/[id] recap page does NOT go through this route —
// it queries lib/session.mjs directly, since a Server Component fetching its own API is a needless
// round trip. This route exists for any future client-side caller (a client-rendered widget, a
// future public API) that isn't itself running on the server.
import { NextResponse } from 'next/server';
import { getSessionByPublicId } from '../../../lib/session.mjs';

// This route reads process.env.DATABASE_URL through the lazy getSql() below — force-dynamic keeps
// Next from trying to evaluate (and cache) it at `next build` time, when there is no database.
export const dynamic = 'force-dynamic';

// Method routing (GET vs everything else) is now handled by App Router itself — a request with any
// other method gets Next's automatic 405 response, so the manual `req.method !== 'GET'` check that
// used to open this handler is gone.

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const publicId = typeof idParam === 'string' ? idParam.trim() : '';
  if (!publicId) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  try {
    const session = await getSessionByPublicId(publicId);
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(session, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('GET /api/session failed:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
