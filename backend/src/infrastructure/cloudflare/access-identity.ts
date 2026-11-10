import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Identity, IdentityProvider } from '../../application/ports';
import { AppError } from '../../domain/errors';

export interface AccessConfig {
  /** e.g. https://your-team.cloudflareaccess.com (the token issuer). */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
  /** For tests: a local key set instead of the team's published certs. */
  keys?: JWTVerifyGetKey;
}

/**
 * Cloudflare Access: Access signs in the person (SSO/one-time PIN) and adds
 * a signed JWT in `Cf-Access-Jwt-Assertion` to every request. We verify its
 * signature against the team's published keys, plus issuer, audience and
 * expiry, before trusting the email inside.
 */
export class AccessIdentityProvider implements IdentityProvider {
  private readonly keys: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(private readonly cfg: AccessConfig) {
    this.issuer = cfg.teamDomain.replace(/\/$/, '');
    this.keys = cfg.keys ?? createRemoteJWKSet(new URL(`${this.issuer}/cdn-cgi/access/certs`));
  }

  async identify(headers: Headers): Promise<Identity | null> {
    const token = headers.get('cf-access-jwt-assertion');
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.keys, { issuer: this.issuer, audience: this.cfg.audience, algorithms: ['RS256'], clockTolerance: 30 });
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!email) throw new AppError('UNAUTHENTICATED', 'Your sign-in has no email address. Sign in again.');
      return { kind: 'verified-email', email };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('UNAUTHENTICATED', 'Your sign-in has expired or is not valid. Sign in again.');
    }
  }
}
