export class DomainError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400,
    public readonly details: Record<string, unknown> = {}) { super(message); }
}
export function requireThat(condition: unknown, code: string, message: string, status = 400,
  details: Record<string, unknown> = {}): asserts condition {
  if (!condition) throw new DomainError(code, message, status, details);
}
