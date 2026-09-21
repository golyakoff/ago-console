/**
 * `25-207`: a nameless visitor's fallback label used to be the bare emoji pair as text
 * (`🦉🍓 a1b2c3d4`) - nothing a person reads as words. This table gives each member of
 * `VisitorEmojiDictionary.Creatures`/`Foods` a real name in each console locale, so the fallback can
 * read as `Сова · Клубника` instead.
 *
 * **Byte-for-byte, not retyped.** Every glyph key below was copy-pasted directly out of
 * `ago-chat/src/Ago.Chat.Domain/VisitorEmojiDictionary.cs`'s own `Creatures`/`Foods` arrays - never
 * typed fresh from an OS emoji picker or a search result. This matters concretely: several common
 * emoji carry an invisible Unicode variation selector (`U+FE0F`) that makes two glyphs that render
 * identically on screen byte-different strings. `Visitor.EmojiCreature`/`EmojiFood` cross the wire as
 * whatever `VisitorEmojiDictionary.cs` literally contains, so a key here that is even one invisible
 * codepoint off from that source silently fails the lookup - no error, `localizedEmojiName` below just
 * falls through to its documented fallback. Keying by copy-pasted glyph, plus
 * `visitorEmojiNames.test.ts`'s own completeness check (a second, independent copy-paste of the same
 * 40 glyphs, asserting every one resolves in both tables), is the two-source cross-check this item's
 * own backlog asks for in place of "we were careful once".
 *
 * **Lives here, not as 40 fields on `ConsoleStrings`.** `strings.ts`'s own header calls that interface
 * "a flat interface, not a framework" - one named field per fixed UI string. A glyph-keyed table is a
 * different kind of thing (data indexed by a runtime value, not a fixed identifier), so it gets its
 * own file rather than diluting that flatness; `ConsoleStrings.visitorEmojiNames` (`strings.ts`) just
 * points at whichever of the two maps below matches the active locale, the same one-hop indirection
 * every other field on that interface already gives every call site (`useStrings()`, never `en.js`/
 * `ru.js` imported directly - `StringsContext.tsx`'s own doc comment).
 *
 * Names are this project's own judgement, not a literal CLDR annotation - "Fish"/"Рыбка" for 🐠 rather
 * than "Tropical Fish", for what an operator reads naturally at a glance.
 */

// Copied byte-for-byte from `VisitorEmojiDictionary.Creatures` (`ago-chat`) - do not retype.
const CREATURE_NAMES_EN: Readonly<Record<string, string>> = {
  "🐔": "Chicken",
  "🐠": "Fish",
  "🐳": "Whale",
  "🐶": "Dog",
  "🐱": "Cat",
  "🐭": "Mouse",
  "🐹": "Hamster",
  "🐰": "Rabbit",
  "🦊": "Fox",
  "🐻": "Bear",
  "🐼": "Panda",
  "🐨": "Koala",
  "🐯": "Tiger",
  "🦁": "Lion",
  "🐮": "Cow",
  "🐷": "Pig",
  "🐸": "Frog",
  "🐵": "Monkey",
  "🐦": "Bird",
  "🦉": "Owl",
};

const CREATURE_NAMES_RU: Readonly<Record<string, string>> = {
  "🐔": "Курица",
  "🐠": "Рыбка",
  "🐳": "Кит",
  "🐶": "Собака",
  "🐱": "Кошка",
  "🐭": "Мышь",
  "🐹": "Хомяк",
  "🐰": "Кролик",
  "🦊": "Лиса",
  "🐻": "Медведь",
  "🐼": "Панда",
  "🐨": "Коала",
  "🐯": "Тигр",
  "🦁": "Лев",
  "🐮": "Корова",
  "🐷": "Свинья",
  "🐸": "Лягушка",
  "🐵": "Обезьяна",
  "🐦": "Птица",
  "🦉": "Сова",
};

// Copied byte-for-byte from `VisitorEmojiDictionary.Foods` (`ago-chat`) - do not retype.
const FOOD_NAMES_EN: Readonly<Record<string, string>> = {
  "🍊": "Orange",
  "🥝": "Kiwi",
  "🌭": "Hot Dog",
  "🍕": "Pizza",
  "🍔": "Burger",
  "🍟": "Fries",
  "🌮": "Taco",
  "🍣": "Sushi",
  "🍩": "Donut",
  "🍪": "Cookie",
  "🍦": "Ice Cream",
  "🍎": "Apple",
  "🍌": "Banana",
  "🍇": "Grapes",
  "🍉": "Watermelon",
  "🍓": "Strawberry",
  "🍒": "Cherry",
  "🍑": "Peach",
  "🥑": "Avocado",
  "🍍": "Pineapple",
};

const FOOD_NAMES_RU: Readonly<Record<string, string>> = {
  "🍊": "Апельсин",
  "🥝": "Киви",
  "🌭": "Хот-дог",
  "🍕": "Пицца",
  "🍔": "Бургер",
  "🍟": "Картофель фри",
  "🌮": "Тако",
  "🍣": "Суши",
  "🍩": "Пончик",
  "🍪": "Печенье",
  "🍦": "Мороженое",
  "🍎": "Яблоко",
  "🍌": "Банан",
  "🍇": "Виноград",
  "🍉": "Арбуз",
  "🍓": "Клубника",
  "🍒": "Вишня",
  "🍑": "Персик",
  "🥑": "Авокадо",
  "🍍": "Ананас",
};

/** English lookup - `Creatures` and `Foods` merged into one glyph-keyed table, since a call site
 * (`localizedEmojiName`) never knows or cares which list a given glyph came from. */
export const visitorEmojiNamesEn: Readonly<Record<string, string>> = { ...CREATURE_NAMES_EN, ...FOOD_NAMES_EN };

/** Russian lookup - same shape as `visitorEmojiNamesEn` above. */
export const visitorEmojiNamesRu: Readonly<Record<string, string>> = { ...CREATURE_NAMES_RU, ...FOOD_NAMES_RU };

/**
 * The one place that reads `ConsoleStrings.visitorEmojiNames` - every call site goes through this
 * rather than indexing the map directly, so the "what if the glyph is missing" decision lives once.
 *
 * **Fallback: the raw glyph itself, never an empty string.** A lookup can miss for a glyph this
 * table's own completeness test (`visitorEmojiNames.test.ts`) does not yet know to check - a future
 * `VisitorEmojiDictionary.cs` member added there before this table catches up, for instance. An empty
 * string in that case would render `" · Клубника"` (or worse, `" · "` for a double miss) - a blank a
 * reader cannot make sense of. The bare glyph (`"🦉 · Клубника"`) is not a translated name, but it is
 * still the same visual identifier the avatar itself shows, so it degrades to "as readable as this
 * table did not exist yet" rather than to nothing. This function therefore never throws for a glyph it
 * was not built to expect, the same "must never be the reason something fails to render" rule
 * `parseConsoleLocale`/`parseWidgetLocale` already hold for a bad locale value.
 */
export function localizedEmojiName(glyph: string, names: Readonly<Record<string, string>>): string {
  return names[glyph] ?? glyph;
}
