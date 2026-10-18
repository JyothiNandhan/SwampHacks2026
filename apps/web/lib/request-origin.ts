export function sameOrigin(request: Request) {
  const internal = new URL(request.url);
  const host = request.headers.get('host') ?? internal.host;
  // Railway terminates HTTPS before forwarding to the standalone HTTP server.
  // Production sessions use Secure cookies and require an HTTPS browser origin.
  const protocol = process.env.NODE_ENV === 'production' ? 'https:' : internal.protocol;
  try {
    const expected = new URL(`${protocol}//${host}`);
    if (expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash) return false;
    return request.headers.get('origin') === expected.origin;
  } catch {
    return false;
  }
}
