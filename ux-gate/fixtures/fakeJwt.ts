/**
 * Builds a **synthetic** JWT for this gate's own seeded sign-in.
 *
 * Mirrors `ago-widget/src/testing/fakeJwt.ts` deliberately, not independently: nothing here is a
 * real token and nothing here has ever been near one - the payload is assembled from the arguments,
 * the signature segment is the literal text below, and no signing key is involved in any direction.
 * A captured credential must never be written into a repository, a fixture or a commit message, and
 * this file exists so the gate is never tempted to paste one "just to have a realistic shape".
 *
 * It does not need to be verifiable: this repository's own server side never sees it (every request
 * that would reach `Ago.Chat.Api` is intercepted by `apiStubs.ts`/`hubMock.ts` before it leaves the
 * browser) and the console itself never decodes its payload either - `PermissionsProvider` reads
 * permissions from the stubbed `GET /api/v1/operators/me` response, not from this token's claims.
 * The only thing that has to be true of this string is its *shape*: three base64url segments, so
 * every consumer that merely checks "is there a bearer token" is satisfied without this file
 * pretending to be something a server would accept.
 */

const NOT_A_SIGNATURE = "this-is-not-a-signature";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface FakeJwtClaims {
  /** Epoch **milliseconds**, converted to the seconds a JWT actually carries. */
  expiresAtMs: number;
  sub: string;
  /** Anything else to put in the payload. */
  extra?: Record<string, unknown>;
}

export function fakeJwt(claims: FakeJwtClaims): string {
  const payload: Record<string, unknown> = {
    sub: claims.sub,
    exp: Math.floor(claims.expiresAtMs / 1000),
    ...claims.extra,
  };

  return [base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })), base64Url(JSON.stringify(payload)), NOT_A_SIGNATURE].join(
    ".",
  );
}
