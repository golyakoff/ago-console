/**
 * `23-94`: produces a value for the grant form's own **Credential** field - the module's per-site
 * secret, 16-256 characters (`Ago.Chat.Domain.ModuleCredential`), whose only server-side rule is a
 * length floor. That floor's own remarks call it "a floor against an operator typing something
 * trivial" - it cannot tell a random 32-byte key from 32 repeated characters, and was never meant to.
 * Before this item the honest instruction for what to type was "open a terminal and run
 * `openssl rand -base64 32`", which is not a small friction: a platform owner without a terminal open
 * (a phone, this item's own finding) types something instead, and whatever they type passes.
 *
 * **Client-side, not a server route - established, not assumed.** `crypto.getRandomValues` is a real
 * CSPRNG (unlike `Math.random()`, which this file never calls and never will - a generator that
 * produces a *predictable* secret is worse than no generator, because it removes the prompt to think).
 * It needs no proof of browser support beyond what this codebase already assumes without comment:
 * `src/realtime/protocol/dedup.ts` already calls the newer, narrower-supported `crypto.randomUUID()`
 * unconditionally, with no feature check and no fallback. `crypto.getRandomValues` is the older,
 * more broadly supported half of the identical `Crypto` interface, so if this console already trusts
 * the browser for the harder case, it can trust it for the easier one. A server route would buy
 * exactly nothing a browser CSPRNG cannot already do itself, at the cost of a value that transits the
 * network and this console's own backend before the platform owner ever sees it.
 *
 * **Byte-for-byte what `openssl rand -base64 32` produces** - 32 random bytes, base64-encoded (44
 * characters including padding) - so the value this button mints is not a *different kind* of secret
 * from the one the runbook already told people to generate by hand, only the same one without a
 * terminal.
 */
export function generateModuleCredential(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
