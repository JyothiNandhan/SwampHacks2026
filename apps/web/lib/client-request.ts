const fallback = 'The service could not be reached. Please try again.';

export async function jsonRequest(path: string, init?: RequestInit) {
    let response: Response;
    try {
        response = await fetch(path, {
            ...init,
            headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
        });
    } catch {
        throw new Error(fallback);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const message = body?.error?.message;
        throw new Error(typeof message === 'string' && message.length <= 240 ? message : fallback);
    }
    if (!body || typeof body !== 'object') throw new Error(fallback);
    return body;
}
