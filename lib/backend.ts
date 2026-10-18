import 'server-only';
export { sessionCookie } from './account-session';
export function backendOrigin() { const url = new URL(process.env.API_BASE_URL ?? 'https://swamphacks2026-production.up.railway.app'); if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Invalid API origin'); return url.origin; }
export { sameOrigin } from './request-origin';
export function failure(message: string, status = 400) { return Response.json({ error: { message } }, { status, headers: { 'cache-control': 'no-store' } }); }
