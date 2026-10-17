import { cookies } from 'next/headers';
import { backendOrigin, failure, sameOrigin, sessionCookie } from '../../../lib/backend';
export async function GET() { return Response.json({ connected: !!(await cookies()).get(sessionCookie)?.value }, { headers: { 'cache-control': 'no-store' } }); }
export async function POST(request: Request) {
    if (!sameOrigin(request))
        return failure('Request origin was not accepted.', 403);
    if (Number(request.headers.get('content-length') ?? 0) > 4096)
        return failure('Request too large.', 413);
    try {
        const text = await request.text();
        if (Buffer.byteLength(text) > 4096)
            return failure('Request too large.', 413);
        const body = JSON.parse(text);
        if (typeof body.token !== 'string' || !/^\S{16,2048}$/.test(body.token))
            return failure('Enter a valid per-user access token.');
        const upstream = await fetch(backendOrigin() + '/api/v1/purchases', { headers: { authorization: `Bearer ${body.token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) {
            await upstream.body?.cancel();
            return failure(upstream.status === 401 || upstream.status === 403 ? 'This token could not access your account.' : 'The API is unavailable. Try again shortly.', upstream.status === 401 || upstream.status === 403 ? 401 : 502);
        }
        await upstream.body?.cancel();
        (await cookies()).set(sessionCookie, body.token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 3600 });
        return Response.json({ connected: true });
    }
    catch {
        return failure('Could not connect. Check your token and try again.', 502);
    }
}
export async function DELETE(request: Request) { if (!sameOrigin(request))
    return failure('Request origin was not accepted.', 403); (await cookies()).delete(sessionCookie); return Response.json({ connected: false }); }
