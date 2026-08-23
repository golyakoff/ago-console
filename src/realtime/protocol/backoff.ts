/**
 * Exponential backoff with full jitter (adr/0010, embeddable-widget skill: "without jitter a
 * rolling deploy turns every widget on the internet into a synchronised retry storm"). Identical
 * shape to `ago-widget/src/protocol/backoff.ts`, ported rather than re-derived - both clients (and
 * `Ago.Chat.Api/wwwroot/dev-harness.html`'s own reference implementation) need to agree on what
 * "jittered" means for this project, and three independent re-derivations of the same formula would
 * be three chances to drift.
 */
export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
}

export const defaultBackoffOptions: BackoffOptions = {
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

/** Full-jitter delay for the given 1-based attempt number. */
export function jitteredDelayMs(attempt: number, options: BackoffOptions = defaultBackoffOptions): number {
  const cap = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
  return Math.round(Math.random() * cap);
}
