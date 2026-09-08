/**
 * `23-99`: what `docs/backlog/23-99-*.md` chose, out of the three readings `23-41` named and
 * deliberately left unpicked. `23-41` mounted an error boundary at three points, so a render-phase
 * *throw* no longer blanks the whole console - but it can only catch a throw. This item is the other
 * half: a field simply absent from a response throws nothing, no accessor blows up, and a screen that
 * renders lists or counts (`CalendarBookingsPage`'s own `groups.length === 0` branch, for one) shows a
 * legitimately-empty-looking result that is indistinguishable from a tenant with real data hit by a
 * dropped field. The chosen reading is not "validate every response" (that is reading 3, `23-41`'s
 * own words, "its own item if it is chosen") - it is validating only where absence and emptiness
 * would otherwise look the same, at the handful of call sites this file's own callers name.
 *
 * <b>Why this is not a second definition of the DTO that can drift.</b> `23-41`'s own item file warns
 * that "a schema that mirrors the type is a second thing to forget" - hand-writing a list of field
 * names beside an interface is exactly that, because nothing stops the interface growing a new
 * required field while the hand-written list stays as it was. `requiredKeysOf` below closes that gap
 * without a schema library (no new dependency - `CLAUDE.md`'s own rule, "a package has to replace
 * something and hand-rolling has to be worse", is the same reasoning `RenderErrorBoundary.tsx`'s own
 * doc comment already gives for staying off `react-error-boundary`): `RequiredKeys<T>` is a mapped
 * type computed *from* the DTO interface itself - a key counts as required exactly when its own type
 * does not admit `undefined`, which is the same rule the interfaces already use to say "the server
 * always sends this key" (`ConfirmedBooking.serviceName: string | null` - present, value maybe null -
 * versus `OperatorPermissionsResponse.credentialsArePublished?: boolean` - may be absent entirely,
 * and is documented as such). A caller then writes `requiredKeysOf<T>({ field: true, ... })` - a
 * `Record<RequiredKeys<T>, true>` literal - and TypeScript's own excess/missing-property checking on
 * that literal is what keeps it in step: add a required field to the DTO and every existing call to
 * `requiredKeysOf` for it stops compiling until the new field is listed too; rename or remove one and
 * the stale name stops compiling. What this does not catch: a field whose *type itself* changes shape
 * while staying required (a `string` silently becoming a differently-shaped object) - `assertHasKeys`
 * checks presence, not value shape, which is what this item's own three readings called the cheaper
 * option and the incident this was carved from (`23-41`) was a wholly *absent* field, not a
 * differently-typed one.
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Turns an exhaustive `{ field: true, ... }` literal into the runtime list `assertHasKeys`/
 * `assertArrayHasKeys` check against. The literal's own type, `Record<RequiredKeys<T>, true>`, is
 * where the drift-proofing above actually happens - this function only reads `Object.keys` of
 * whatever satisfied that type.
 */
export function requiredKeysOf<T>(markers: Record<RequiredKeys<T>, true>): RequiredKeys<T>[] {
  return Object.keys(markers) as RequiredKeys<T>[];
}

/**
 * Thrown by `assertHasKeys`/`assertArrayHasKeys` - a plain `Error` subclass rather than
 * `CalendarApiError`/`TenanciesError`: this module is shared by both backends' own API clients, and
 * neither error type belongs to a file that answers for both. Every caller that wants its own
 * caught-error vocabulary re-throws this as one of its own types (`calendarApi.ts`'s `request` does,
 * for its own callers) - see this module's own callers for the concrete shape.
 */
export class ShapeMismatchError extends Error {
  readonly missingFields: string[];

  constructor(context: string, missingFields: string[]) {
    super(
      missingFields.length === 0
        ? `${context}: the response was not the shape this call expected.`
        : `${context}: the response is missing ${missingFields.join(", ")}.`,
    );
    this.name = "ShapeMismatchError";
    this.missingFields = missingFields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Presence, not value type: a required key must exist on the object (`in`), regardless of what it
 * holds - `null` is a legitimate value for a key the server always sends (`ConfirmedBooking.
 * serviceName`'s own doc comment). An *absent* key - dropped by an older deploy, a stale fixture, a
 * contract two independently-versioned products (`adr/0012`) have drifted apart on - is what this
 * exists to catch, named all at once rather than the first accessor that happens to blow up.
 */
export function assertHasKeys<T>(value: unknown, requiredKeys: readonly RequiredKeys<T>[], context: string): asserts value is T {
  if (!isRecord(value)) {
    throw new ShapeMismatchError(context, []);
  }

  const missing = requiredKeys.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new ShapeMismatchError(context, missing.map(String));
  }
}

/** The list-response shape every "renders lists or counts" screen this item covers actually has:
 * every element checked, not just the first, so one truncated element in the middle of a page does
 * not read as "the rest loaded fine". */
export function assertArrayHasKeys<T>(
  value: unknown,
  requiredKeys: readonly RequiredKeys<T>[],
  context: string,
): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw new ShapeMismatchError(context, []);
  }

  value.forEach((item, index) => {
    assertHasKeys<T>(item, requiredKeys, `${context}[${String(index)}]`);
  });
}
