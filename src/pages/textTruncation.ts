/**
 * `25-24`: the widget's consent-notice card shows the tenant's *current* notice text read-only,
 * capped to a bounded number of lines rather than however long the tenant's own paragraph happens to
 * run - an operator scanning "what does my widget currently say" should not have to scroll past an
 * arbitrarily long paragraph to reach the next card. Extracted from `WidgetConfigPage` into its own
 * pure function rather than inlined in the component, the same reasoning `widgetConfigValidation.ts`
 * already gives for `isValidHexColor`/`isValidNoticeUrl`: a boundary condition (exactly `maxLines`
 * lines vs. one more) is unit-testable on its own here, where inlining it would leave the boundary
 * only observable indirectly, through rendered DOM text after mounting the whole page.
 */
export interface TruncatedText {
  /** The text to render - the original string unchanged when it already fits, otherwise its first
   * `maxLines` lines rejoined. */
  visible: string;
  /** Whether `visible` is shorter than the original - the caller's cue to offer a "show fully"
   * control at all. */
  truncated: boolean;
}

export function truncateToLines(text: string, maxLines: number): TruncatedText {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return { visible: text, truncated: false };
  }

  return { visible: lines.slice(0, maxLines).join("\n"), truncated: true };
}
