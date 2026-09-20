import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthContext } from '../../domain/types.js';
import { DomainError } from '../../domain/errors.js';
export interface AuthService { verifyAccessToken(token: string): Promise<AuthContext> }
export class JwtAuthService implements AuthService {
  private readonly key;
  constructor(private options: { secret?: string; jwksUrl?: string; issuer: string; audience: string }) {
    if (Boolean(options.secret) === Boolean(options.jwksUrl)) throw new Error('Configure exactly one JWT secret or JWKS URL.');
    if (options.secret && options.secret.length < 32) throw new Error('JWT secret must contain at least 32 characters.');
    this.key = options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : new TextEncoder().encode(options.secret!);
  }
  async verifyAccessToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.options.issuer, audience: this.options.audience,
        algorithms: this.options.jwksUrl ? ['RS256', 'ES256'] : ['HS256'], requiredClaims: ['sub', 'exp'],
      });
      if (!payload.sub || payload.sub.length > 200) throw new Error('Invalid subject');
      return { userId: payload.sub, username: typeof payload.username === 'string' ? payload.username.slice(0, 100) : undefined,
        expiresAt: payload.exp! * 1000 };
    } catch { throw new DomainError('UNAUTHENTICATED', 'Invalid or expired access token.', 401); }
  }
}
/** Explicit development-only allowlist; tokens must match configured values exactly. */
export class StaticTokenAuthService implements AuthService {
  constructor(private tokens: ReadonlyMap<string, AuthContext>) {}
  async verifyAccessToken(token: string): Promise<AuthContext> {
    const auth = this.tokens.get(token);
    if (!auth) throw new DomainError('UNAUTHENTICATED', 'Invalid access token.', 401);
    return { ...auth };
  }
}
