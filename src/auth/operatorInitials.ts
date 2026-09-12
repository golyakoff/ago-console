/**
 * `25-47`: turns an operator's display name (`operatorDisplayName`'s own return value - a plain
 * string, never a `User`, so this file has no dependency on `oidc-client-ts` at all) into the one or
 * two letters shown on the header's avatar. Nothing in this codebase did this before this item -
 * `docs/design/gaps.md` pile 3 item 8 named the gap directly: "Badge is the product's only
 * representation of a person - no avatar, no initial, no name." This is that answer.
 *
 * **Two words or more: the first letter of the first two, in the name's own order.** "Андрей
 * Голяков" -> "АГ", "Andrey Golyakov" -> "AG" - the ordinary reading of "initials" for a
 * first-plus-last name, and the shape every one of this console's seeded operators actually has
 * (Keycloak's registration form requires both, `operatorDisplayName`'s own doc comment). A third or
 * later word (a patronymic, a suffix) is not consulted - two glyphs is the circle's whole budget,
 * and the first two words are the ones a colleague reads first.
 *
 * **Exactly one word gets its own first two characters, not one.** This is the fallback shape for an
 * identity `operatorDisplayName` could not resolve a real name for - a bare Keycloak login
 * (`preferred_username`) or, failing that, the raw `sub` claim - and a single letter in an otherwise
 * two-letter circle would read as a typo rather than a deliberate, narrower answer. "golyakoff" ->
 * "GO".
 *
 * `toLocaleUpperCase()`, not `toUpperCase()` - the two behave identically for Cyrillic and Latin
 * text, but `toLocaleUpperCase()` is the correct call for user-facing casing regardless of which
 * script a future name happens to use, and costs nothing to prefer.
 */
export function operatorInitials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toLocaleUpperCase();
  }

  return (words[0].charAt(0) + words[1].charAt(0)).toLocaleUpperCase();
}
