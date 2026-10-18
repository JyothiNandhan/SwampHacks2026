import { cookies } from 'next/headers';
import { backendOrigin, failure, sameOrigin, sessionCookie } from '../../../../lib/backend';
import { uploadErrorMessage } from '../../../../lib/receipt-upload';
const reads = /^(purchases|opportunities|notifications|deadlines|subscriptions|purchases\/[a-f0-9-]{36}\/timeline|offers\/[a-f0-9-]{36}|documents\/[a-f0-9-]{36})$/;
const writes = /^(documents|receipts\/ingest)$/;
async function proxy(request: Request, { params }: {
    params: Promise<{
        path: string[];
    }>;
}) {
    const path = (await params).path.join('/');
    if (!(request.method === 'GET' ? reads : writes).test(path))
        return failure('This action is unavailable.', 404);
    if (request.method !== 'GET' && !sameOrigin(request))
        return failure('Request origin was not accepted.', 403);
    const token = (await cookies()).get(sessionCookie)?.value;
    if (!token)
        return failure('Connect your account to continue.', 401);
    try {
        let body: string | undefined;
        if (request.method === 'POST') {
            if (Number(request.headers.get('content-length') ?? 0) > 6 * 1024 * 1024)
                return failure('File is too large.', 413);
            body = await request.text();
            if (Buffer.byteLength(body) > 6 * 1024 * 1024)
                return failure('File is too large.', 413);
            JSON.parse(body);
        }
        const url = new URL('/api/v1/' + path, backendOrigin());
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor && /^[a-f0-9-]{36}$/.test(cursor))
            url.searchParams.set('cursor', cursor);
        const upstream = await fetch(url, { method: request.method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(60000) });
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok)
            return failure(uploadErrorMessage(upstream.status, typeof data?.error?.code === 'string' ? data.error.code : undefined), upstream.status);
        return Response.json(data, { headers: { 'cache-control': 'no-store' } });
    }
    catch {
        return failure('The service could not be reached. Please try again.', 502);
    }
}
export const GET = proxy;
export const POST = proxy;
