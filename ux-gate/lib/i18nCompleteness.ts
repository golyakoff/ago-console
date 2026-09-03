/**
 * `11-16`, the fourth assertion: "on a screen rendered in Russian, no user-facing text is left in
 * another language."
 *
 * ## Why the fixtures make this exact rather than fuzzy
 *
 * The hard part this item names is telling **interface text** from **data** - a customer really may
 * be called *John*, and that is not a translation failure. `ux-gate/fixtures/data.ts` seeds every
 * free-text fixture value (site name, message bodies, the widget's own notice text, the UTM campaign
 * label) in Cyrillic for exactly this reason: once no *data* on the page can legitimately contain a
 * Latin letter, any Latin-script run left standing is, by construction, something this repository's
 * own source rendered - interface chrome, not a visitor's or a tenant's own words. That turns "does
 * this look like English" - a fuzzy, pattern-shaped question the item's own brief warns against - into
 * "is there a Latin letter here at all", which is exact.
 *
 * ## The named exemptions, and why each is not a pattern
 *
 * A regex over "words that look technical" would quietly exempt the next real defect, which is
 * exactly the failure mode this design exists to avoid. So every exemption below is a specific,
 * audited thing this repository actually renders (found by running this assertion for real against
 * the Cyrillic-seeded fixtures and reading every violation it reported - not guessed in advance), not
 * a shape:
 *
 * - **The product name/wordmark** (`"AGO"`, `"AGO Chat"`) - `AppShell.tsx`'s own
 *   `.ago-shell__wordmark` renders `"AGO"` in every language, and `ru.ts` itself spells the product
 *   `"AGO Chat"` inline inside otherwise-Russian sentences (`analyticsTrafficSourceNote` - rendered on
 *   `/analytics`) - a name is not translated, the same reasoning `docs/backlog/11-16-*.md` gives for
 *   exempting it explicitly.
 * - **External channel/platform brand names** (`"SMS"`, `"MAX"`, `"Telegram"`, `"WhatsApp"`) -
 *   `Ago.Chat.Domain.ChannelKind`'s own members. Nobody translates "WhatsApp"; `ru.ts` agrees -
 *   `analyticsChannelSms`/`Max`/`Telegram`/`WhatsApp` all keep the brand's own name verbatim (only
 *   `analyticsChannelWidget` - "Виджет" - names a generic concept this product itself owns, and that
 *   one *is* translated), and `visitorPanelNote` lists three of the same four inline
 *   (`"(MAX, Telegram или SMS)"`, rendered on `/conversations/:id`). The same "a name is not
 *   translated" reasoning as the product name, one level down.
 * - **Keyboard key names** (`"Enter"`, `"Shift"`, `"Escape"`) - `strings.ts`'s own doc comment on the
 *   `shortcutsHint*` fields states the rule directly: these "never need translating". `composerHint`
 *   (rendered on `/conversations/:id`) is where it is actually exercised - `ru.ts`'s own value embeds
 *   them verbatim inside an otherwise-Russian sentence: `"Enter отправляет, Shift+Enter - новая
 *   строка · Escape очищает"`. A physical key's name is a fact about the keyboard, not a phrase to
 *   render in the reader's language.
 * - **Two short technical abbreviations already kept as loanwords by `ru.ts` itself** - `"ID"`
 *   (`visitorIdLabel: "ID посетителя"`) and `"hex"` (`widgetColorFieldLabel: "Основной цвет (hex,
 *   необязательно)"`). Both are the translator's own deliberate, reviewed choice already merged into
 *   the string table, not a gap this assertion is discovering - "ID" and "hex" are common, unremarkable
 *   loanwords in Russian technical writing, the same register `ru.ts` uses throughout the console.
 * - **A URL, or a URL scheme name, rendered as itself** - `"https"` inside `widgetNoticeUrlFieldDescription`
 *   (`"Должна начинаться с https://."`, rendered on `/settings/widget`) is a protocol name inside an
 *   instruction, the same "a translator must not touch it" reasoning the backlog item gives for a
 *   header name or a status code. A full URL shown as link text (`<a href="https://…">https://…</a>`)
 *   is handled the same way, structurally rather than by literal string - see `isUrlText` below. Not
 *   currently exercised by any `<a>` on this gate's five screens (`ConversationPage`'s and
 *   `VisitorHistoryPanel`'s attachment links both render a translated label plus a MIME type, and
 *   `VisitorHistoryPanel` itself never opens because `seededVisitorHistory()` sets
 *   `hasChannelIdentity: false`) - kept anyway because a future screen could legitimately add one, and
 *   a silent false failure there would be the wrong way to find out.
 * - **Technical identifiers already marked as such by this codebase's own convention** - `Badge.tsx`'s
 *   own doc comment: rendering in JetBrains Mono (`.ago-badge--mono`, or the bare `.ago-mono` span
 *   used for the same values without the pill) marks a value as "literally an identifier (a truncated
 *   visitor id, a sequence number, a hex colour)". This reuses that existing, audited convention
 *   rather than re-deciding "does this look like an id" per string.
 *
 * `/owner` is a **further** exemption, but a screen-level one, not an element-level one - see
 * `ux-gate/gate.spec.ts`'s own comment on why it is applied there instead of inside this function.
 *
 * ## What this deliberately does *not* exempt
 *
 * Running this for real also found genuine gaps, left as violations rather than quietly waved
 * through - each is a real finding reported alongside this item's own work, not fixed by it:
 *
 * - `src/time/format.ts`'s own `DISPLAY_LOCALE = "en-GB"` (its own file header: "Interface i18n is
 *   explicitly out of `11-06`'s scope") renders weekday names, month names, and words like "day"/"at"/
 *   "GMT" in English on every screen that shows a date or an elapsed time, regardless of the console's
 *   own selected locale. Real, and out of this item's own scope to fix (it means threading a locale
 *   through a file whose own testability rests on *not* depending on ambient state, and every one of
 *   its call sites) - so it stays a violation, not a sixth exemption.
 * - `AdminConversationsPage.tsx`'s "started" column calls `new Date(c.createdAt).toLocaleString()`
 *   directly - the one place in this screen set that does not go through `time/format.ts` at all, so
 *   it renders in whatever locale the runtime's `Intl` default happens to be (English, `"AM"`/`"PM"`,
 *   in this gate's own Chromium) rather than either a fixed convention or the app's own locale. A
 *   second, narrower instance of the same underlying gap.
 *
 * ## What this deliberately never had to decide
 *
 * `<code>` elements: this repository has exactly two (`InstallSnippetPage.tsx`'s public key and
 * origin), and that screen is not one of `UX_GATE_SCREENS` (`ux-gate/fixtures/screens.ts`'s own doc
 * comment - not chosen among the five). No exemption for `<code>` is declared here, on purpose:
 * inventing one for content this gate never actually renders would be exactly the "silently skipping
 * every `<code>` is a pattern in disguise" trap the backlog item warns against. If `InstallSnippetPage`
 * ever joins this gate, its two `<code>` elements carry a real site key and a real origin string -
 * genuinely non-translatable technical values - and would earn a named entry then, not before.
 *
 * `<option>` elements are excluded by tag, not measured and found harmless - a closed native
 * `<select>` (`Select.tsx`'s own doc comment: "the option list itself stays the platform's own popup")
 * never paints an unselected option's text, so scoring it against a bounding rect the browser does not
 * reliably lay out for a closed control would be the wrong kind of check even if it happened to pass.
 */

export interface UntranslatedTextViolation {
  selector: string;
  text: string;
  latinRuns: string[];
}

export interface UntranslatedTextResult {
  scanned: number;
  violations: UntranslatedTextViolation[];
}

/**
 * Passed straight to Playwright's `page.evaluate`, which serialises only *this function's own source
 * text* into the browser - not this module, not any top-level `const`/`function` declared beside it.
 * Every helper and constant it needs is therefore declared **inside** its body, the same discipline
 * `ux-gate/lib/minSize.ts` and `ux-gate/lib/contrast.ts` both already state in their own doc comments,
 * found the same way each of those two names: a module-level helper here compiles and typechecks fine
 * and then throws `ReferenceError` the first time it actually runs in a page.
 */
export function measureUntranslatedLatinText(): UntranslatedTextResult {
  // See this function's own file-level doc comment above for why each of these is here. Longer
  // phrases first, so "AGO Chat" is removed whole rather than leaving a stray "Chat" behind once
  // "AGO" has already matched inside it.
  const EXEMPT_PHRASES = ["AGO Chat", "AGO", "WhatsApp", "Telegram", "Escape", "Shift", "Enter", "SMS", "MAX", "ID", "hex", "https"];
  const EXEMPT_ANCESTOR_SELECTOR = ".ago-mono, .ago-badge--mono";
  const LATIN_RUN = /[A-Za-z]{2,}/g;

  // Word-boundary, not substring: `"ID".split(text)` would also strip the "id" inside a genuinely
  // untranslated word like "Provided", which is exactly the false-negative a short exempt token risks.
  // `(?<![A-Za-z])phrase(?![A-Za-z])` only matches the phrase as a standalone run, never as part of a
  // longer Latin word either side of it - Cyrillic characters are outside `[A-Za-z]` entirely, so a
  // phrase sitting next to Russian text (the normal case here, e.g. `"ID посетителя"`) is never
  // blocked by this check.
  function stripExemptPhrases(text: string): string {
    let residual = text;
    for (const phrase of EXEMPT_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      residual = residual.replace(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "g"), " ");
    }
    return residual;
  }

  function describeSelector(el: Element): string {
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }

  // The identical visibility test `ux-gate/lib/contrast.ts`'s own `isRenderedVisible` uses - a text
  // node whose containing element is not actually painted (display/visibility/opacity, or a genuinely
  // zero-size box) is not "on the page" in the sense this assertion cares about, the same reasoning
  // that check already established for a colour nobody sees.
  function isRenderedVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isExemptByAncestor(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
      if (node.matches(EXEMPT_ANCESTOR_SELECTOR)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function isUrlText(el: Element, text: string): boolean {
    const anchor = el.closest("a[href]");
    if (!anchor) {
      return false;
    }
    const href = anchor.getAttribute("href") ?? "";
    return href.length > 0 && href.includes(text.trim());
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || node.textContent.trim().length === 0) {
        return NodeFilter.FILTER_REJECT;
      }
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "option") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let scanned = 0;
  const violations: UntranslatedTextViolation[] = [];

  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    node = walker.nextNode();

    if (!parent || !isRenderedVisible(parent)) {
      continue;
    }
    scanned++;

    if (isExemptByAncestor(parent) || isUrlText(parent, text)) {
      continue;
    }

    const matches = stripExemptPhrases(text).match(LATIN_RUN);
    if (!matches || matches.length === 0) {
      continue;
    }

    violations.push({
      selector: describeSelector(parent),
      text: text.trim().slice(0, 80),
      latinRuns: matches,
    });
  }

  return { scanned, violations };
}
