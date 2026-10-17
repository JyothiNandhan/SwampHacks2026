/** Map only known driver codes; raw messages can contain credentials or row values. */
export function databaseFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = error.code;
  if (typeof code !== 'string') return null;
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) return 'DATABASE_TLS_ERROR';
  if (['28P01', '28000'].includes(code)) return 'DATABASE_AUTHENTICATION_FAILED';
  if (['42P01', '42703', '3F000'].includes(code)) return 'DATABASE_SCHEMA_UNAVAILABLE';
  if (code === '42501') return 'DATABASE_PERMISSION_DENIED';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03', '53300'].includes(code)) return 'DATABASE_UNAVAILABLE';
  return null;
}
