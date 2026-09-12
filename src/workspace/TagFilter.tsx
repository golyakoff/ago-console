import type { TagDto } from "../api/tagsApi.js";
import { Button } from "../components/Button.js";
import { useStrings } from "../i18n/StringsContext.js";

export interface TagFilterProps {
  /** The tenant's own tag vocabulary - `WorkspaceLayout`'s own `tags` (`18-04`, `ConversationTagsPanel`'s
   * `siteTags`), never a second, filter-specific fetch. */
  tags: readonly TagDto[];
  /** Selected tag ids. Empty means unfiltered - there is no separate "all tags" state to track. */
  selected: readonly string[];
  onChange: (next: readonly string[]) => void;
}

/**
 * `25-59`: the rail's own tag filter, widened from `18-04`'s single-choice `<select>` to a checkbox
 * group - selecting more than one tag narrows the queue to conversations carrying *every* one of them
 * (AND), not any one of them (OR), matching the backlog item's own stated contract and the absence of
 * an OR-by-default convention anywhere else in this console (searched for one, found none).
 *
 * **No twelfth component.** The same call `AlertSettings`'s own doc comment already makes for its two
 * switches: a checkbox is a `<label>` wrapping an `<input type="checkbox">`, `adr/0030` closes the
 * shared set at eleven, and this is local markup for one screen's own control, not a second `Select`
 * variant. Each row reuses `.ago-row` - the same compact checkbox-plus-label shape `WidgetConfigPage`'s
 * own toggles and `CalendarServicesPage`'s own "от" checkbox already use, `ux-gate`-verified for the
 * 24px WCAG 2.5.8 floor a bare label-wrapping-input row needs (`index.css`'s own `.ago-row` remarks).
 *
 * A native multi-`<select>` (`<select multiple>`) was the other real option and was rejected: it hides
 * every option behind a ctrl/cmd-click nobody discovers without being told, where a checkbox list shows
 * its own state at a glance - the same "a real checkbox is what Space toggles and a screen reader
 * announces as one" reasoning `AlertSettings`'s own doc comment gives for not restyling the native
 * control into something else.
 */
export function TagFilter({ tags, selected, onChange }: TagFilterProps) {
  const strings = useStrings();

  const toggle = (tagId: string, checked: boolean) => {
    onChange(checked ? [...selected, tagId] : selected.filter((id) => id !== tagId));
  };

  return (
    <fieldset className="ago-tag-filter">
      <legend className="ago-tag-filter__legend">{strings.workspaceTagFilterLabel}</legend>

      <div className="ago-tag-filter__options">
        {tags.map((tag) => (
          <label key={tag.id} className="ago-row">
            <input type="checkbox" checked={selected.includes(tag.id)} onChange={(e) => toggle(tag.id, e.target.checked)} />
            <span>{tag.name}</span>
          </label>
        ))}
      </div>

      {/* Only worth offering once there is something to clear - a button that is always present but
          disabled half the time is worse than one that only exists when it does something. The same
          `Button` variant/size `ChannelIdentitiesPanel`'s own "Clear" uses for an identical
          reset-this-control action. */}
      {selected.length > 0 && (
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([])}>
          {strings.workspaceTagFilterClearButton}
        </Button>
      )}
    </fieldset>
  );
}
