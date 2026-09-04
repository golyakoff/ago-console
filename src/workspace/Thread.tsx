import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MessageDto } from "../realtime/protocol/types.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatClockTime, formatDayLabel } from "../time/format.js";
import { buildThread } from "./threadModel.js";

/** `MessageDto.authorKind`'s three values as the group's visible author label - a fixed mapping
 * rather than rendering the DTO field directly, the same reasoning `VisitorPanel`'s
 * `conversation.state` mapping below makes: the field is data from the server, but a `"Visitor"` or
 * `"Operator"` label reads to an operator as UI chrome, not as a visitor-typed value, so it belongs
 * in the string table like everything else on this screen. */
function authorLabel(kind: MessageDto["authorKind"], strings: ConsoleStrings): string {
  switch (kind) {
    case "Visitor":
      return strings.threadAuthorVisitor;
    case "Operator":
      return strings.threadAuthorOperator;
    case "System":
      return strings.threadAuthorSystem;
  }
}

export interface ThreadProps {
  messages: MessageDto[];
  now: Date;
  timeZone: string | null;
  /** Rendered under a message that carries an attachment - `5-08`'s flow, owned by
   * `ConversationPage` and passed in rather than reimplemented here. */
  renderAttachment: (attachmentId: string) => ReactNode;
  /** `null` once the whole history is loaded (`loadOlderHistory`'s keyset cursor is exhausted). */
  canLoadOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  /** `18-01`: a search hit's own `sequence`, once `ConversationPage`'s `?at=` handling has (or is
   * still trying to get) it loaded - the matching message scrolls into view and gets a brief
   * highlight (`workspace.css`'s own `ago-message--highlighted`) the first time it appears in
   * `messages`. `null`/absent for every conversation opened the ordinary way, which is most of them -
   * this prop existing costs nothing until a caller actually has a target sequence to reach. */
  highlightSequence?: number | null;
  /** `18-01`: `ConversationPage` is paging backward looking for `highlightSequence` because it was
   * not on the freshly-joined page - distinct from `loadingOlder` above, which is the *manual* "Load
   * older messages" button's own state and must not show a spinner for a fetch the operator did not
   * ask for. */
  locating?: boolean;
  /** `23-10`: called with the operator's own text selection when they confirm the "Add to contact
   * details" affordance below a message - never called on its own, never fed a guess this component
   * computed. Absent (the default) for an operator without `conversation:send`: `ContactDetailsPanel`
   * hides its record form for that operator already, so offering the act here would dangle it in
   * front of someone who could never finish it. `ConversationPage` is the only caller and decides the
   * gate; `Thread` itself does not know about permissions at all, the same separation `renderAttachment`
   * already draws between "this component renders" and "the page decides what is allowed". */
  onPromoteSelection?: (text: string) => void;
}

/** One message's own selected substring, kept only long enough for the operator to click the
 * "Add to contact details" button that appears beside it - `Thread`'s only state this item adds.
 * Keyed on `sequence` rather than the DOM node itself so the affordance survives a re-render (a new
 * message arriving does not invalidate an in-progress selection higher up the thread). */
interface MessageSelection {
  sequence: number;
  text: string;
}

/**
 * `11-06`: the thread, as a conversation rather than as a debug dump.
 *
 * What it replaces: `[{sequence}] {authorKind}: {body}` in a `<ul>`, with no timestamps at all.
 *
 * - **Sides are distinguished visually and in text.** The operator's own messages sit right on a
 *   tinted surface, the visitor's left on white - the same two-tone shape `ago-landing`'s widget mock
 *   uses, so the operator sees what the visitor sees. The author is *also* named in words on the
 *   first message of every group, because side and colour alone would carry the meaning (WCAG 1.4.1)
 *   and a screen reader would get nothing.
 * - **Consecutive messages from one author are grouped** - one author label per run, the rest
 *   attached under it. `threadModel.ts` decides what a run is and is tested on it.
 * - **A timestamp on every message, a day separator between days**, per `date-and-time.md`: the
 *   visible time is the short clock reading in the operator's own zone, and every one of them carries
 *   the complete zone-labelled instant in its `title`.
 * - **The `[sequence]` prefix leaves the visible text but not the DOM.** It moves into each message's
 *   `title`, and, only in a development build, onto a small mono chip beside the timestamp. The item
 *   asks for exactly that: genuinely useful when debugging the protocol, genuinely not for operators.
 *
 * The `<ol>` is deliberate where the old markup used `<ul>`: a thread is ordered, and the order is
 * load-bearing (it is the server's `sequence`). `aria-label="Message thread"` predates `11-05`,
 * survived it, and survives this - it is still the list's only accessible name.
 *
 * `23-10` adds one more thing: an operator who **selects** text inside a single message's body (drag,
 * double-click, triple-click) sees a small "Add to contact details" button appear beside that message,
 * and clicking it hands the selected text to `onPromoteSelection` unchanged. **This is the entire
 * mechanism, and it is deliberately this dumb.** `decisions.md` §4 forbids the product itself deciding
 * a string looks like a phone number - no regex over `MessageDto.body`, no highlighting of "numbers we
 * found", nothing computed from message content at all. The operator's own act of dragging across
 * characters *is* the decision; this component only notices that a selection exists, which side it
 * belongs to (`handleSelectionEnd`'s `.closest(".ago-message__body")` check - a selection spanning two
 * messages offers nothing, since "half of one and half of another" is not a fact about either), and
 * relays its `toString()` verbatim. Nothing here is written anywhere - `onPromoteSelection` merely
 * hands the text to `ConversationPage`, which pre-fills `ContactDetailsPanel`'s own draft for the
 * operator to confirm or correct.
 */
export function Thread({
  messages,
  now,
  timeZone,
  renderAttachment,
  canLoadOlder,
  loadingOlder,
  onLoadOlder,
  highlightSequence = null,
  locating = false,
  onPromoteSelection,
}: ThreadProps) {
  const strings = useStrings();
  const items = buildThread(messages, timeZone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  // `23-10`: which message currently has a live, in-bounds text selection - `null` for the ordinary
  // case (nothing selected, or a selection this component cannot attribute to one message). State,
  // not a ref: the "Add to contact details" button's presence is exactly what this drives, so React
  // has to know about a change.
  const [selection, setSelection] = useState<MessageSelection | null>(null);

  // Reads `window.getSelection()` after the browser has finished updating it (mouseup fires after
  // the drag/double-click/triple-click that made the selection) - never on a timer, never inferred
  // from keystrokes, so there is no path here that inspects text the operator did not deliberately
  // select. A selection that is empty, collapsed, or whose two ends land in different messages'
  // bodies clears the affordance rather than guessing which message was meant.
  const handleSelectionEnd = () => {
    if (!onPromoteSelection) {
      return;
    }

    const domSelection = window.getSelection();
    const text = domSelection?.toString().trim() ?? "";
    if (!domSelection || domSelection.isCollapsed || !text) {
      setSelection(null);
      return;
    }

    const anchorNode = domSelection.anchorNode;
    const focusNode = domSelection.focusNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement;
    const anchorBody = anchorElement?.closest(".ago-message__body") ?? null;
    const focusBody = focusElement?.closest(".ago-message__body") ?? null;

    if (!anchorBody || anchorBody !== focusBody) {
      setSelection(null);
      return;
    }

    const sequenceAttribute = anchorBody.closest("[data-sequence]")?.getAttribute("data-sequence");
    const sequence = sequenceAttribute ? Number(sequenceAttribute) : NaN;
    if (!Number.isFinite(sequence)) {
      setSelection(null);
      return;
    }

    setSelection({ sequence, text });
  };

  const handlePromote = () => {
    if (!selection || !onPromoteSelection) {
      return;
    }

    onPromoteSelection(selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  // `18-01`: which `highlightSequence` this thread has already scrolled to - a ref, not state, purely
  // to guard the effect below against re-scrolling on every unrelated re-render (an attachment detail
  // resolving, a presence poll tick). Reset implicitly whenever `highlightSequence` itself changes,
  // since the guard compares against the *current* value.
  const scrolledToHighlight = useRef<number | null>(null);

  // Scrolls the matched message into view the first time it actually appears in `messages` - which,
  // for an older message `ConversationPage` is still paging backward to find, may be several renders
  // after this component first receives `highlightSequence`. Keyed on `messages` as well as
  // `highlightSequence` for exactly that reason: a new page arriving is what makes the target findable.
  useEffect(() => {
    if (highlightSequence === null || scrolledToHighlight.current === highlightSequence) {
      return;
    }

    const element = scrollRef.current?.querySelector(`[data-sequence="${highlightSequence}"]`);
    if (element) {
      element.scrollIntoView({ block: "center" });
      scrolledToHighlight.current = highlightSequence;
    }
  }, [highlightSequence, messages]);

  // Whether the operator is reading the newest messages or has scrolled up into history. Only the
  // former gets auto-scrolled on a new arrival - yanking someone back down while they are reading
  // older context is the classic chat-client bug, and "losing their place" is the exact thing this
  // item exists to stop.
  const handleScroll = () => {
    const element = scrollRef.current;
    if (element === null) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottom.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    if (pinnedToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  return (
    <div
      className="ago-thread-scroll"
      ref={scrollRef}
      onScroll={handleScroll}
      // `23-10`: a plain DOM event, the same choice `testing.md`'s "hand-rolling over a dependency"
      // reasoning already applies elsewhere in this file - no `selectionchange` listener at the
      // `document` level to install and tear down, since mouseup already fires at the end of every
      // drag, double-click and triple-click selection a pointer can make.
      onMouseUp={onPromoteSelection ? handleSelectionEnd : undefined}
    >
      {locating && (
        <div className="ago-thread__older">
          <Spinner label={strings.conversationLocatingMessageLabel} />
        </div>
      )}

      {canLoadOlder && (
        <div className="ago-thread__older">
          <Button size="sm" variant="secondary" onClick={onLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? strings.threadLoadingOlder : strings.threadLoadOlderButton}
          </Button>
        </div>
      )}

      <ol className="ago-thread" aria-label={strings.threadAriaLabel}>
        {items.map((item) =>
          item.kind === "day" ? (
            <li className="ago-thread__day" key={`day-${item.key}`}>
              <span>{formatDayLabel(item.at, now, timeZone, strings)}</span>
            </li>
          ) : (
            <li
              key={item.message.id}
              data-sequence={item.message.sequence}
              className={[
                "ago-message",
                `ago-message--${item.message.authorKind === "Operator" ? "operator" : "visitor"}`,
                item.startsGroup ? "ago-message--group-start" : "ago-message--grouped",
                item.message.sequence === highlightSequence ? "ago-message--highlighted" : null,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {item.startsGroup && (
                <span className="ago-message__author">{authorLabel(item.message.authorKind, strings)}</span>
              )}
              <div
                className="ago-message__bubble"
                // The sequence keeps a home in the DOM rather than disappearing: this is the
                // affordance that stays in a production build.
                title={
                  item.at
                    ? `${formatAbsolute(item.at, timeZone, strings)} · ${strings.threadMessageNumberLabel}${item.message.sequence}`
                    : `${strings.threadMessageNumberOnlyLabel}${item.message.sequence}`
                }
              >
                <span className="ago-message__body">{item.message.body}</span>
                {item.message.attachmentId && renderAttachment(item.message.attachmentId)}
                <span className="ago-message__meta">
                  {item.at ? (
                    <time dateTime={item.message.createdAt}>{formatClockTime(item.at, timeZone, strings)}</time>
                  ) : (
                    <span className="ago-meta">{strings.threadNoTimestamp}</span>
                  )}
                  {import.meta.env.DEV && <span className="ago-message__sequence">#{item.message.sequence}</span>}
                </span>
                {/* `23-10`: only ever rendered for the one message whose body currently holds the
                    selection - never a per-message button sitting there unconditionally. `onMouseDown`
                    stops the browser's own default (collapsing the text selection when a mousedown
                    lands outside it) from erasing what `handleSelectionEnd` just read, between the
                    operator releasing the mouse over the highlighted text and clicking this button. */}
                {onPromoteSelection && selection?.sequence === item.message.sequence && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="ago-message__promote"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={handlePromote}
                  >
                    {strings.threadPromoteToContactButton}
                  </Button>
                )}
              </div>
            </li>
          ),
        )}
      </ol>

      <div ref={bottomRef} />
    </div>
  );
}
