import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "../components/Button.js";
import { Textarea } from "../components/Textarea.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { CannedResponseDto } from "../api/cannedResponsesApi.js";

export interface ComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  /** `5-08`'s upload flow, owned by `ConversationPage` and reused as-is - this component only
   * decides *how a file gets picked* (button, drop, paste), never what happens to it afterwards. */
  onFileChosen: (file: File) => void;
  onRemoveAttachment: () => void;
  pendingAttachment: { fileName: string } | null;
  uploadProgress: { fileName: string; percent: number } | null;
  uploadError: string | null;
  /** `18-05`: optional, and supplied by the workspace so its `C` shortcut can focus this textarea.
   * Optional rather than required because this component's own tests mount it with props alone and
   * have no workspace to get one from - and because a composer that cannot be focused from a
   * keyboard shortcut is still a working composer. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** `18-03`: the site's canned-response library, or `[]` while it is loading or when the site has
   * none - see `workspaceContext.ts`'s own remarks on why this is never `null`. Optional, defaulted to
   * `[]`, for the identical reason `inputRef` is optional: this component's own tests mount it with
   * props alone and a picker with nothing to offer is still a working composer. */
  cannedResponses?: readonly CannedResponseDto[];
  /** `19-01`: "Suggest a reply" - optional and omitted entirely (rather than rendered disabled) when
   * absent, the same "this component's own tests mount it with props alone" reasoning `inputRef`'s own
   * remarks give. `ConversationPage` is the only real caller and always supplies it. */
  onSuggestReply?: () => void;
  suggestingReply?: boolean;
  suggestReplyError?: string | null;
}

/** How tall the textarea is allowed to grow before it starts scrolling instead. Eight lines is about
 * a paragraph - past that the composer would start eating the thread it is meant to serve. */
const MAX_COMPOSER_HEIGHT_PX = 200;

/** `18-03`: the picker's own listbox id, and its options' id prefix - both referenced from the
 * textarea's `aria-controls`/`aria-activedescendant` below, so a screen reader is told which list is
 * open and which option is current without moving focus off the textarea itself. */
const CANNED_RESPONSES_LISTBOX_ID = "ago-canned-responses-listbox";

function cannedResponseOptionId(index: number): string {
  return `ago-canned-response-option-${index}`;
}

/**
 * `11-06`: a real composer.
 *
 * What it replaces: a single-line `<input>` in a `<form>`, with the attachment flow in a separate
 * `Panel` above it - a file field, a progress line and a "ready to send" alert, all further from the
 * message they belonged to than they were from the thread.
 *
 * ## The keyboard contract
 *
 * - **Enter sends. Shift+Enter inserts a newline.** This is the behaviour change `11-05` deliberately
 *   refused to make while it was a presentation-only item ("swapping the input for a textarea would
 *   change what Enter does"), and it is `11-06`'s to make. It is also why `Textarea` - one of
 *   `adr/0030`'s eleven, shipped unused by `11-05` and named there as waiting for this screen -
 *   finally has a consumer.
 * - **Escape clears the draft**, and removes a pending attachment with it. The item's scope allows
 *   exactly three keys (Enter, Shift+Enter, Escape) and explicitly excludes a shortcut system; this
 *   is the third, and there is no fourth.
 * - **Enter during IME composition does not send.** `event.nativeEvent.isComposing` is what
 *   distinguishes "the operator pressed Enter" from "the operator's input method is committing a
 *   candidate", and getting it wrong sends a half-typed Japanese or Chinese sentence on every
 *   conversion. Cheap to be right about, invisible until it bites someone.
 *
 * ## Attachments, three ways in
 *
 * A file can be picked with the button, dropped onto the composer, or pasted into it - the last two
 * being what people actually do with a screenshot. All three funnel into the same `onFileChosen`, so
 * `5-08`'s create -> presigned PUT -> confirm sequence runs unchanged and is not reimplemented here.
 * One file at a time, matching what `ConversationPage` has always supported: a drop of several takes
 * the first and says so, rather than silently discarding the rest.
 *
 * The native `<input type="file">` is kept in the DOM and visually hidden rather than replaced by a
 * `Button` that fabricates a file dialog - it is still the element that opens the picker, still
 * focusable, and still the thing assistive technology understands. The `Button` beside it is a label
 * for it in the plain sense of the word.
 *
 * ## The canned-response picker (`18-03`)
 *
 * Typing `/` as the **first character** of the draft opens a filterable list of the site's canned
 * responses; typing more filters it by title, `↑`/`↓` move the highlight, `Enter` inserts the
 * highlighted response's text in place of the `/query` and closes the picker, and `Escape` closes it -
 * for free, because it is already what Escape does to the whole draft, and a draft that is only ever
 * `/query` at this point is exactly what "clear the draft" already means.
 *
 * **Why `/` as the first character, not anywhere in the message.** This is `11-06`'s Enter/Shift+Enter
 * contract's own kind of decision: a small, fixed trigger an operator's hands learn once, not a
 * command language. Restricting it to the first character means a visitor-facing sentence that happens
 * to *contain* a slash later on (a URL, a fraction) is never misread as a command, at the cost of not
 * being able to open the picker mid-sentence - a real, deliberate trade-off, not an oversight, and the
 * same trade every chat product with slash commands (Slack among them) makes for the same reason.
 *
 * **Why this needs no change to `useShortcuts`/`shortcuts.ts`.** Every key here is handled inside this
 * component's own `onKeyDown`, on the textarea itself - the exact element `isTypingTarget`
 * (`shortcuts.ts`) already excludes from the workspace's global `J`/`K`/`C`/`Esc`/`?` catalogue. `/`,
 * the letters that follow it, and the arrow keys were never workspace shortcuts to begin with, so there
 * is nothing to collide with and nothing to register.
 *
 * **Why the picker is silent, not gated by permission or shown as an error, when there is nothing to
 * offer.** `cannedResponses` defaults to `[]` for a site with none configured yet and while the
 * workspace's own fetch is still in flight (`workspaceContext.ts`) - typing `/` in either case simply
 * types a literal `/`, which is correct: there is nothing broken to report, only nothing to show.
 */
export function Composer({
  draft,
  onDraftChange,
  onSend,
  onFileChosen,
  onRemoveAttachment,
  pendingAttachment,
  uploadProgress,
  uploadError,
  inputRef,
  cannedResponses = [],
  onSuggestReply,
  suggestingReply = false,
  suggestReplyError = null,
}: ComposerProps) {
  const strings = useStrings();
  // One ref object, either the caller's or this component's own. Not two refs kept in sync: the
  // auto-grow effect below and the workspace's focus shortcut have to be looking at the same
  // element, and "assign to both on every render" is one forgotten branch away from focusing a
  // textarea that is no longer mounted.
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tooManyFiles, setTooManyFiles] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // `18-03`: the picker is a pure function of `draft` and `cannedResponses` - there is deliberately no
  // "is the picker open" state of its own to fall out of sync with the draft it is reading.
  const pickerOpen = cannedResponses.length > 0 && draft.startsWith("/");
  const pickerQuery = pickerOpen ? draft.slice(1).trim().toLowerCase() : "";
  const filteredResponses = useMemo(
    () =>
      pickerOpen
        ? cannedResponses.filter((response) => response.title.toLowerCase().includes(pickerQuery))
        : [],
    [pickerOpen, pickerQuery, cannedResponses],
  );
  // Clamped rather than reset-on-every-render via a second `useEffect`: the highlight only needs to
  // stay in range as the filtered list shrinks or grows, and clamping the read is one calculation
  // instead of one more effect with its own dependency array to get wrong.
  const activeIndex = Math.min(highlightIndex, Math.max(filteredResponses.length - 1, 0));

  useEffect(() => {
    // A fresh filter starts highlighting the top match - the same "cold start always does something
    // sensible" reasoning `conversationAfter` (`shortcuts.ts`) states for `J`/`K` with nothing selected.
    setHighlightIndex(0);
  }, [pickerQuery]);

  const insertCannedResponse = (response: CannedResponseDto) => {
    onDraftChange(response.body);
    textareaRef.current?.focus();
  };

  // Grow with the content up to a cap. Reset to `auto` first, or the height only ever ratchets
  // upward: `scrollHeight` of an element already sized to its content is that same size, so a
  // deleted line would never shrink it back.
  useEffect(() => {
    const element = textareaRef.current;
    if (element === null) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`;
    // `textareaRef` is in the list because `18-05` made it a prop: it is now a value that can change
    // identity between renders, which the previous `[draft]` alone would have missed. In practice
    // the caller passes a stable ref, so this re-runs exactly as often as it did before.
  }, [draft, textareaRef]);

  const canSend = draft.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      // Also what closes the picker: `draft` becomes `""`, `pickerOpen` is a pure function of it, and
      // there is nothing further to do - see this component's own doc comment.
      onDraftChange("");
      onRemoveAttachment();
      return;
    }

    if (pickerOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, Math.max(filteredResponses.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        const chosen = filteredResponses[activeIndex];
        // No match yet (still typing a query nothing fits) - Enter does nothing rather than sending
        // the literal `/query` text, which is never what an operator meant by pressing it here.
        if (chosen) {
          insertCannedResponse(chosen);
        }
        return;
      }

      // Any other key - typing more of the filter, Backspace, Tab - is left to fall through below and
      // behaves exactly as it would with the picker closed (Backspace can shrink `draft` below one
      // character and close the picker on its own; that is `pickerOpen`'s own derivation doing its
      // job, not a case this handler has to name).
    }

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (canSend) {
      onSend();
    }
  };

  const takeFirstFile = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setTooManyFiles((files?.length ?? 0) > 1);
    onFileChosen(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    takeFirstFile(event.dataTransfer.files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // Only intercept a paste that actually carries a file. A pasted screenshot has one; pasted text
    // does not, and must keep its ordinary behaviour.
    if (event.clipboardData.files.length === 0) {
      return;
    }

    event.preventDefault();
    takeFirstFile(event.clipboardData.files);
  };

  return (
    <div
      className={`ago-composer${dragging ? " ago-composer--dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Only when the pointer leaves the composer itself, not when it crosses between children -
        // `dragleave` fires for every child boundary and would otherwise flicker the highlight.
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      {uploadError && <Alert tone="danger">{uploadError}</Alert>}

      {/* `19-01`: rendered the same way `uploadError` already is - one Alert, danger tone, nothing
          the operator has to dismiss. A failed suggestion never blocks typing or sending: the draft
          field is untouched either way. */}
      {suggestReplyError && <Alert tone="danger">{suggestReplyError}</Alert>}

      {uploadProgress && (
        // `role="status"` (via `Alert`'s info tone) so the upload finishing is announced, not just
        // drawn - the same semantics `5-08`'s own progress line had.
        <Alert tone="info">
          {strings.composerUploadingLabel} {uploadProgress.fileName} — {uploadProgress.percent}%
        </Alert>
      )}

      {pendingAttachment && (
        <div className="ago-composer__attachment">
          <Badge tone="brand">{strings.composerAttachedBadge}</Badge>
          <span className="ago-composer__attachment-name">{pendingAttachment.fileName}</span>
          <Button size="sm" variant="ghost" onClick={onRemoveAttachment}>
            {strings.composerRemoveButton}
          </Button>
        </div>
      )}

      {tooManyFiles && (
        <p className="ago-meta" role="status">
          {strings.composerTooManyFiles}
        </p>
      )}

      <div className="ago-composer__row">
        <Textarea
          ref={textareaRef}
          className="ago-composer__input"
          value={draft}
          rows={1}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={strings.composerPlaceholder}
          aria-label={strings.composerAriaLabel}
          aria-describedby="ago-composer-hint"
          // `18-03`: the standard editable-combobox-with-a-popup-listbox ARIA shape, applied to the
          // textarea that already exists rather than a separate input - `role="combobox"` plus
          // `aria-controls`/`aria-expanded` name the popup, and `aria-activedescendant` names the
          // current option *without moving DOM focus off the textarea*, which is what lets typing to
          // filter keep working while a screen reader tracks the highlight. All three are `undefined`
          // (rendering no attribute at all) while the picker is closed, so an ordinary draft is an
          // ordinary textarea.
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? CANNED_RESPONSES_LISTBOX_ID : undefined}
          aria-activedescendant={
            pickerOpen && filteredResponses[activeIndex] ? cannedResponseOptionId(activeIndex) : undefined
          }
        />

        <div className="ago-composer__actions">
          <input
            ref={fileInputRef}
            className="ago-visually-hidden"
            type="file"
            aria-label={strings.composerAttachAriaLabel}
            onChange={(event) => {
              takeFirstFile(event.target.files);
              // Cleared so choosing the same file twice in a row still fires `change` - `5-08`'s
              // own handler did this for the same reason.
              event.target.value = "";
            }}
            disabled={uploadProgress !== null}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadProgress !== null}
          >
            {strings.composerAttachButton}
          </Button>
          {/* `19-01`: absent, not disabled, when the caller supplies no `onSuggestReply` - the same
              "omit rather than render a control that can never do anything" choice `inputRef`'s own
              remarks describe. Disabled while a suggestion is already in flight (no second request
              stacking on the first, the same one-at-a-time shape `uploadProgress` already gives the
              Attach button) and while an upload is in progress, so the two async composer actions
              never race each other. */}
          {onSuggestReply && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSuggestReply}
              disabled={suggestingReply || uploadProgress !== null}
            >
              {suggestingReply ? strings.composerSuggestReplyGenerating : strings.composerSuggestReplyButton}
            </Button>
          )}
          <Button variant="primary" onClick={onSend} disabled={!canSend}>
            {strings.composerSendButton}
          </Button>
        </div>
      </div>

      {pickerOpen && (
        <div className="ago-composer__picker">
          {filteredResponses.length === 0 ? (
            <p className="ago-meta">{strings.composerCannedResponsesNoMatch}</p>
          ) : (
            <ul
              className="ago-composer__picker-list"
              role="listbox"
              id={CANNED_RESPONSES_LISTBOX_ID}
              aria-label={strings.composerCannedResponsesListAriaLabel}
            >
              {filteredResponses.map((response, index) => (
                <li
                  // The response's title is not a stable id (nothing stops two rows sharing one on
                  // the settings screen), so the position in this render's own filtered list is what
                  // this option is keyed and identified by - consistent with `activeIndex` itself
                  // being an index into the same array.
                  key={index}
                  id={cannedResponseOptionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`ago-composer__picker-option${index === activeIndex ? " ago-composer__picker-option--active" : ""}`}
                  // `onMouseDown`, not `onClick`: a click blurs the textarea before its own `onClick`
                  // fires, which would close the picker (its derivation reads `draft`, which is still
                  // unchanged at that point) before this handler runs. `mousedown` fires first, so
                  // `preventDefault` here stops the blur from ever happening and the textarea keeps
                  // focus and its `aria-activedescendant` straight through the insert - the pointer
                  // route to the same insert the keyboard path uses, not a second implementation of it.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertCannedResponse(response);
                  }}
                >
                  {response.title}
                </li>
              ))}
            </ul>
          )}
          <p className="ago-composer__picker-hint">{strings.composerCannedResponsesInsertHint}</p>
        </div>
      )}

      <p className="ago-composer__hint" id="ago-composer-hint">
        {strings.composerHint}
        {!pickerOpen && cannedResponses.length > 0 && ` · ${strings.composerCannedResponsesAvailableHint}`}
      </p>
    </div>
  );
}
