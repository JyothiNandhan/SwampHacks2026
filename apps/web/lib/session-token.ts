export const ACCESS_TOKEN_MAX_LENGTH = 4096;

export function validatedAccessToken(value: string) {
  const token = value.trim();
  if (!token) throw new Error('Enter your account access token.');
  if (token.length > ACCESS_TOKEN_MAX_LENGTH) throw new Error('That access token is too long.');
  return token;
}
