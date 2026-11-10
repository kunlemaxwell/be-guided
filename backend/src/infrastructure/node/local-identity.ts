import type { Identity, IdentityProvider } from '../../application/ports';

/**
 * Local admin identity: whoever uses this computer. The API only listens on
 * 127.0.0.1 and refuses other origins, so the request itself is the proof;
 * the person is the one chosen in Settings as "who is using this computer".
 */
// PROTOTYPE: by design for the owner's Mac — no sign-in, the person at the
// computer is the owner. Any shared/hosted install must use AccessIdentityProvider.
export class LocalIdentityProvider implements IdentityProvider {
  async identify(): Promise<Identity> {
    return { kind: 'local' };
  }
}
