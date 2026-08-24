import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { Badge } from "../components/Badge.js";
import { formatAbsolute, formatElapsed, formatElapsedWords, parseInstant } from "../time/format.js";

export interface VisitorPanelProps {
  conversationId: string;
  /** The queue row for this conversation, when the queue has loaded and still contains it. */
  conversation: ConversationSummaryDto | null;
  /** Three-valued on purpose - `null` is "the presence call has not answered or failed", which is a
   * different thing from "offline" and was already distinguished before this item. */
  visitorOnline: boolean | null;
  siteId: string | null;
  now: Date;
  timeZone: string | null;
}

/**
 * `11-06`: the third region - who the operator is talking to.
 *
 * **This panel is thin, and the item says so plainly instead of padding it.** Everything here is
 * something the console already has: the visitor's identifier, their live presence
 * (`OperatorHub.GetVisitorPresenceAsync`, polled - a snapshot, not a subscription, per
 * `realtime.md`), when the conversation started, and which site it belongs to. The things an
 * operator actually wants next - the page the visitor is on, their referrer, their previous
 * conversations, their name or email - are **not** invented here as plausible-looking placeholders,
 * because none of them exists anywhere in `ago-chat` today. Each is a backend change with its own
 * schema, its own privacy question and its own backlog item.
 *
 * The identifiers are rendered in full rather than truncated to eight characters the way the list
 * rows are: this is the one place an operator goes to *copy* an id into a support ticket or a log
 * query, and a truncated id cannot be copied. `--ago-font-mono` is reserved for exactly this in
 * `tokens.css` - values that are literally identifiers.
 */
export function VisitorPanel({
  conversationId,
  conversation,
  visitorOnline,
  siteId,
  now,
  timeZone,
}: VisitorPanelProps) {
  const started = parseInstant(conversation?.createdAt);

  return (
    <aside className="ago-workspace__aside" aria-labelledby="ago-visitor-panel-title">
      <h2 className="ago-aside__title" id="ago-visitor-panel-title">
        Visitor
      </h2>

      <div className="ago-aside__row">
        {visitorOnline === null ? (
          <Badge tone="neutral">Presence unknown</Badge>
        ) : visitorOnline ? (
          <Badge tone="success" dot>
            Online
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Offline
          </Badge>
        )}
        {conversation && <Badge tone={conversation.state === "Assigned" ? "brand" : "neutral"}>{conversation.state}</Badge>}
      </div>

      <dl className="ago-aside__facts">
        <dt>Visitor id</dt>
        <dd className="ago-mono ago-aside__id">{conversation?.visitorId ?? "Not in your queue"}</dd>

        <dt>Conversation started</dt>
        <dd>
          {started ? (
            <>
              <span title={formatAbsolute(started, timeZone)}>{formatAbsolute(started, timeZone)}</span>
              <span className="ago-meta"> ({formatElapsed(started, now)} ago)</span>
              <span className="ago-visually-hidden">{formatElapsedWords(started, now)} ago</span>
            </>
          ) : (
            <span className="ago-meta">Unknown</span>
          )}
        </dd>

        <dt>Site</dt>
        <dd className="ago-mono ago-aside__id">{siteId ?? <span className="ago-meta">Not known yet</span>}</dd>

        <dt>Conversation</dt>
        <dd className="ago-mono ago-aside__id">{conversationId}</dd>
      </dl>

      <p className="ago-aside__note">
        This is everything the platform knows about a visitor today. Their current page, referrer and
        earlier conversations are not collected yet.
      </p>
    </aside>
  );
}
