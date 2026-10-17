import 'server-only';
export const sessionCookie = 'moneyback_session';
export function backendOrigin() { const url = new URL(process.env.API_BASE_URL ?? 'https://swamphacks2026-production.up.railway.app'); if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Invalid API origin'); return url.origin; }
export function sameOrigin(request: Request) { const expected = new URL(request.url); expected.host = request.headers.get('host') ?? expected.host; return request.headers.get('origin') === expected.origin; }
export function failure(message: string, status = 400) { return Response.json({ error: { message } }, { status, headers: { 'cache-control': 'no-store' } }); }
