import { useEffect, useRef, type ReactNode } from "react";
import type { MessageDto } from "../realtime/protocol/types.js";
import { Button } from "../components/Button.js";
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
 */
export function Thread({
  messages,
  now,
  timeZone,
  renderAttachment,
  canLoadOlder,
  loadingOlder,
  onLoadOlder,
}: ThreadProps) {
  const strings = useStrings();
  const items = buildThread(messages, timeZone);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

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
    <div className="ago-thread-scroll" ref={scrollRef} onScroll={handleScroll}>
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
              <span>{formatDayLabel(item.at, now, timeZone)}</span>
            </li>
          ) : (
            <li
              key={item.message.id}
              className={[
                "ago-message",
                `ago-message--${item.message.authorKind === "Operator" ? "operator" : "visitor"}`,
                item.startsGroup ? "ago-message--group-start" : "ago-message--grouped",
              ].join(" ")}
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
                    ? `${formatAbsolute(item.at, timeZone)} · ${strings.threadMessageNumberLabel}${item.message.sequence}`
                    : `${strings.threadMessageNumberOnlyLabel}${item.message.sequence}`
                }
              >
                <span className="ago-message__body">{item.message.body}</span>
                {item.message.attachmentId && renderAttachment(item.message.attachmentId)}
                <span className="ago-message__meta">
                  {item.at ? (
                    <time dateTime={item.message.createdAt}>{formatClockTime(item.at, timeZone)}</time>
                  ) : (
                    <span className="ago-meta">{strings.threadNoTimestamp}</span>
                  )}
                  {import.meta.env.DEV && <span className="ago-message__sequence">#{item.message.sequence}</span>}
                </span>
              </div>
            </li>
          ),
        )}
      </ol>

      <div ref={bottomRef} />
    </div>
  );
}
