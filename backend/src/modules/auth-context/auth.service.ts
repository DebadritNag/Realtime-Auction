import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthContext } from '../../domain/types.js';
import { DomainError } from '../../domain/errors.js';
export interface AuthService { verifyAccessToken(token: string): Promise<AuthContext> }
export class JwtAuthService implements AuthService {
  private readonly remoteKey;
  private readonly secretKey;
  constructor(private options: { secret?: string; jwksUrl?: string; issuer: string; audience: string }) {
    if (!options.secret && !options.jwksUrl) throw new Error('Configure a JWT secret or JWKS URL.');
    if (options.secret && options.secret.length < 32) throw new Error('JWT secret must contain at least 32 characters.');
    this.remoteKey = options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined;
    // Legacy Supabase HMAC secrets are used literally, not base64-decoded.
    this.secretKey = options.secret ? new TextEncoder().encode(options.secret) : undefined;
  }
  async verifyAccessToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, async (header, flattened) => {
        if (header.alg === 'HS256' && this.secretKey) return this.secretKey;
        if ((header.alg === 'ES256' || header.alg === 'RS256') && this.remoteKey) return this.remoteKey(header, flattened);
        throw new Error('Unsupported signing algorithm');
      }, {
        issuer: this.options.issuer, audience: this.options.audience,
        algorithms: ['HS256', 'RS256', 'ES256'], requiredClaims: ['sub', 'exp'],
      });
      if (!payload.sub || payload.sub.length > 200) throw new Error('Invalid subject');
      const metadata = payload.user_metadata as { username?: unknown } | undefined;
      const username = typeof payload.username === 'string' ? payload.username : metadata?.username;
      return { userId: payload.sub, username: typeof username === 'string' ? username.slice(0, 100) : undefined,
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
