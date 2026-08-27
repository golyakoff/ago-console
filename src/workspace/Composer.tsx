import {
  useEffect,
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
}

/** How tall the textarea is allowed to grow before it starts scrolling instead. Eight lines is about
 * a paragraph - past that the composer would start eating the thread it is meant to serve. */
const MAX_COMPOSER_HEIGHT_PX = 200;

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
      onDraftChange("");
      onRemoveAttachment();
      return;
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
          <Button variant="primary" onClick={onSend} disabled={!canSend}>
            {strings.composerSendButton}
          </Button>
        </div>
      </div>

      <p className="ago-composer__hint" id="ago-composer-hint">
        {strings.composerHint}
      </p>
    </div>
  );
}
