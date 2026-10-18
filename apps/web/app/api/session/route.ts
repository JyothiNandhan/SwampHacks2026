import { cookies } from 'next/headers';
import { backendOrigin, failure, sameOrigin, sessionCookie } from '../../../lib/backend';
import { accountSession } from '../../../lib/account-session';
import { auth0Configured, getAuth0 } from '../../../lib/auth0';
import { parseAccessTokenRequest } from '../../../lib/session-token';
export async function GET() {
    try { const session=await accountSession(); return Response.json({connected:!!session.token,method:session.method,auth0Configured:auth0Configured()},{headers:{'cache-control':'no-store'}}); }
    catch { return failure('Your sign-in session could not be renewed. Sign in again.',401); }
}
export async function POST(request: Request) {
    if (!sameOrigin(request))
        return failure('Request origin was not accepted.', 403);
    if (Number(request.headers.get('content-length') ?? 0) > 4096)
        return failure('Request too large.', 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 4096)
        return failure('Request too large.', 413);
    let token: string;
    try { token = parseAccessTokenRequest(text); }
    catch (error) { return failure((error as Error).message); }
    try {
        const upstream = await fetch(backendOrigin() + '/api/v1/purchases', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!upstream.ok) {
            await upstream.body?.cancel();
            return failure(upstream.status === 401 || upstream.status === 403 ? 'This token could not access your account.' : 'The API is unavailable. Try again shortly.', upstream.status === 401 || upstream.status === 403 ? 401 : 502);
        }
        await upstream.body?.cancel();
        (await cookies()).set(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 3600 });
        return Response.json({ connected: true });
    }
    catch {
        return failure('Could not connect. Check your token and try again.', 502);
    }
}
export async function DELETE(request: Request) {
    if (!sameOrigin(request))return failure('Request origin was not accepted.',403);
    (await cookies()).delete(sessionCookie);
    const session=await getAuth0()?.getSession();
    return Response.json({connected:false,...(session?{logoutUrl:'/auth/logout'}:{})});
}
