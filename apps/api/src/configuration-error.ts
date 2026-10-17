/** Only validated setting names are safe to print during startup. */
export class ConfigurationError extends Error {
  constructor(kind: 'environment' | 'integration', fields: string[]) {
    const names = [...new Set(fields.map(field => field.split('.')[0]).filter(field => /^[A-Z][A-Z0-9_]*$/.test(field)))];
    super(`Invalid ${kind} configuration: ${names.join(', ') || 'unknown setting'}`);
  }
}
export function startupFailureMessage(error: unknown): string {
  return error instanceof ConfigurationError
    ? `API startup failed. ${error.message}`
    : 'API startup failed. Check environment configuration.';
}
