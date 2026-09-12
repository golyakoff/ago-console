import { useEffect, useRef, type ReactNode } from "react";
import type { MessageDto } from "../realtime/protocol/types.js";
import type { ChannelDeliveryDto } from "../api/channelDeliveriesApi.js";
import { Badge } from "../components/Badge.js";
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
  /** `23-19`: `docs/design/decisions.md` §9 - what `DeliverChannelMessageHandler` (`ago-chat`) recorded
   * for whichever of these operator messages were actually relayed out through a linked channel.
   * `null`/absent (a widget conversation, or one still loading) renders no badges at all - the
   * `threadDeliveryScopeNote` caption below is what tells the operator that absence is expected, not
   * a sign something failed. Keyed by `ChannelDeliveryDto.messageId`, which matches `MessageDto.id`. */
  channelDeliveries?: ChannelDeliveryDto[] | null;
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
 * `23-10` once added a "select text, promote it into a contact detail" affordance here. `25-58`
 * removed it along with `ContactDetailsPanel`'s own "add a new record" form - that form was its only
 * destination, and an operator now corrects or confirms an *existing* contact detail in place rather
 * than creating a fresh one from a transcript selection (`ContactDetailsPanel`'s own doc comment).
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
  channelDeliveries = null,
}: ThreadProps) {
  const strings = useStrings();
  const items = buildThread(messages, timeZone);
  // `23-19`: one lookup per render rather than a `.find()` per message - this thread's own message
  // count is what `channelDeliveries` is bounded by (one delivery per operator message, at most), so
  // this stays small the same way `channelDeliveries` itself does.
  const deliveryByMessageId = new Map<string, ChannelDeliveryDto>((channelDeliveries ?? []).map((d) => [d.messageId, d]));
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
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
    <div className="ago-thread-scroll" ref={scrollRef} onScroll={handleScroll}>
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

      {/* `23-19`: shown for every conversation, not only channel ones - `flows.md` 4.5's own "the
          screen says which conversations this covers and which it does not", so a widget
          conversation's silence never reads as a failure. */}
      <p className="ago-thread__delivery-note">{strings.threadDeliveryScopeNote}</p>

      <ol className="ago-thread" aria-label={strings.threadAriaLabel}>
        {items.map((item) => {
          if (item.kind === "day") {
            return (
              <li className="ago-thread__day" key={`day-${item.key}`}>
                <span>{formatDayLabel(item.at, now, timeZone, strings)}</span>
              </li>
            );
          }

          // `23-19`: computed once per message - never for a visitor/system one, which
          // `deliveryByMessageId` never carries a key for anyway (only an operator message is ever
          // relayed, `DeliverChannelMessageHandler`'s own loop guard, `ago-chat`).
          const delivery =
            item.message.authorKind === "Operator" ? deliveryByMessageId.get(item.message.id) : undefined;

          return (
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
                {/* `23-19`: only ever an operator's own message, and only when a delivery was
                    actually recorded for it - see `channelDeliveries`'s own doc comment. */}
                {delivery &&
                  (delivery.status === "Delivered" ? (
                    <Badge tone="success">{strings.threadDeliveryDeliveredBadge}</Badge>
                  ) : (
                    // `title`, not a Badge prop: `adr/0030` closes the component set at eleven, and
                    // the console has no tooltip - a native `title` is the same fallback the bubble
                    // itself already uses above for its own timestamp/sequence detail.
                    <span
                      title={
                        delivery.failureReason
                          ? `${strings.threadDeliveryReasonPrefix} ${delivery.failureReason}`
                          : undefined
                      }
                    >
                      <Badge tone="danger">{strings.threadDeliveryNotDeliveredBadge}</Badge>
                    </span>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div ref={bottomRef} />
    </div>
  );
}
