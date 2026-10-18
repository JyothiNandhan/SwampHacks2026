export const ACCESS_TOKEN_MAX_LENGTH = 2048;

export function validatedAccessToken(value: string) {
  const token = value.trim();
  if (!token) throw new Error('Enter your account access token.');
  if (token.length > ACCESS_TOKEN_MAX_LENGTH) throw new Error('That access token is too long.');
  return token;
}

export function parseAccessTokenRequest(text: string) {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
  const token = typeof body === 'object' && body !== null && 'token' in body
    ? (body as {token?: unknown}).token
    : undefined;
  if (typeof token !== 'string' || !new RegExp(`^\\S{16,${ACCESS_TOKEN_MAX_LENGTH}}$`).test(token)) {
    throw new Error('Enter a valid per-user access token.');
  }
  return token;
}
