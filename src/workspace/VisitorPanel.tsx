import type { ConversationSummaryDto, VisitorHistoryResponse } from "../realtime/protocol/types.js";
import type { TagDto } from "../api/tagsApi.js";
import { Badge } from "../components/Badge.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatAbsolute, formatElapsed, formatElapsedWords, parseInstant } from "../time/format.js";
import { VisitorHistoryPanel } from "./VisitorHistoryPanel.js";
import { ChannelIdentitiesPanel } from "./ChannelIdentitiesPanel.js";
import { ContactDetailsPanel } from "./ContactDetailsPanel.js";
import { ConversationNotesPanel } from "./ConversationNotesPanel.js";
import { ConversationOutcomePanel } from "./ConversationOutcomePanel.js";
import { ConversationTagsPanel } from "./ConversationTagsPanel.js";

/** `ConversationSummaryDto.state`'s three values as the badge's visible text - `"Waiting"` reuses
 * `queueWaitingTitle` (the identical English word already in the table for the queue's own "Waiting"
 * heading), rather than adding a fourth field for a phrase this table already has. */
function stateLabel(state: ConversationSummaryDto["state"], strings: ConsoleStrings): string {
  switch (state) {
    case "Waiting":
      return strings.queueWaitingTitle;
    case "Assigned":
      return strings.conversationStateAssigned;
    case "Closed":
      return strings.conversationStateClosed;
  }
}

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
  /** `18-07`: this visitor's prior conversations - `null` while the fetch is in flight. See
   * `VisitorHistoryPanel`'s own doc comment for the hard gate on `hasChannelIdentity`. */
  visitorHistory: VisitorHistoryResponse | null;
  visitorHistoryError: string | null;
  accessToken: string | null;
  /** `18-04`: the site's own tag vocabulary - `WorkspaceOutletContext.tags`, threaded through rather
   * than fetched here. */
  siteTags: readonly TagDto[];
  /** `14-12`: `ChannelIdentitiesPanel`'s own composer quick-insert - see that component's doc comment. */
  onInsertIntoComposer: (text: string) => void;
}

/**
 * `11-06`: the third region - who the operator is talking to.
 *
 * **This panel is thin, and the item says so plainly instead of padding it.** Everything here is
 * something the console already has: the visitor's identifier, their live presence
 * (`OperatorHub.GetVisitorPresenceAsync`, polled - a snapshot, not a subscription, per
 * `realtime.md`), when the conversation started, and which site it belongs to. The things an
 * operator actually wants next - the page the visitor is on, their referrer, their name or email -
 * are **not** invented here as plausible-looking placeholders, because none of them exists anywhere
 * in `ago-chat` today. Each is a backend change with its own schema, its own privacy question and
 * its own backlog item.
 *
 * `18-07`: **"their previous conversations" is the one item on that list that no longer belongs to
 * it.** A channel-identified visitor's prior conversations are real data now
 * (`GetVisitorHistoryHandler`, `Ago.Chat.Application`), and `VisitorHistoryPanel` renders them below
 * - this component only threads the fetched data through, the same way it threads
 * `conversation`/`visitorOnline` through without owning either of their fetches. For an ordinary
 * widget visitor (no channel identity, `14-01`'s model), that section renders nothing at all rather
 * than an empty state - see `VisitorHistoryPanel`'s own doc comment for why.
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
  visitorHistory,
  visitorHistoryError,
  accessToken,
  siteTags,
  onInsertIntoComposer,
}: VisitorPanelProps) {
  const strings = useStrings();
  const started = parseInstant(conversation?.createdAt);

  return (
    <aside className="ago-workspace__aside" aria-labelledby="ago-visitor-panel-title">
      <h2 className="ago-aside__title" id="ago-visitor-panel-title">
        {strings.visitorPanelTitle}
      </h2>

      <div className="ago-aside__row">
        {visitorOnline === null ? (
          <Badge tone="neutral">{strings.visitorPresenceUnknown}</Badge>
        ) : visitorOnline ? (
          <Badge tone="success" dot>
            {strings.visitorOnline}
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            {strings.visitorOffline}
          </Badge>
        )}
        {conversation && (
          <Badge tone={conversation.state === "Assigned" ? "brand" : "neutral"}>
            {stateLabel(conversation.state, strings)}
          </Badge>
        )}
      </div>

      <dl className="ago-aside__facts">
        <dt>{strings.visitorIdLabel}</dt>
        <dd className="ago-mono ago-aside__id">{conversation?.visitorId ?? strings.visitorNotInQueue}</dd>

        <dt>{strings.queueConversationStartedTitle}</dt>
        <dd>
          {started ? (
            <>
              <span title={formatAbsolute(started, timeZone, strings)}>{formatAbsolute(started, timeZone, strings)}</span>
              <span className="ago-meta">
                {" "}
                ({formatElapsed(started, now, strings)} {strings.agoSuffix})
              </span>
              <span className="ago-visually-hidden">
                {formatElapsedWords(started, now, strings)} {strings.agoSuffix}
              </span>
            </>
          ) : (
            <span className="ago-meta">{strings.visitorConversationStartedUnknown}</span>
          )}
        </dd>

        <dt>{strings.visitorSiteLabel}</dt>
        <dd className="ago-mono ago-aside__id">
          {siteId ?? <span className="ago-meta">{strings.visitorSiteNotKnown}</span>}
        </dd>

        <dt>{strings.visitorConversationLabel}</dt>
        <dd className="ago-mono ago-aside__id">{conversationId}</dd>
      </dl>

      <VisitorHistoryPanel
        conversationId={conversationId}
        history={visitorHistory}
        historyError={visitorHistoryError}
        now={now}
        timeZone={timeZone}
        accessToken={accessToken}
      />

      {/* `18-04`: internal notes and tags - see each panel's own doc comment. */}
      <ConversationTagsPanel conversationId={conversationId} siteTags={siteTags} accessToken={accessToken} />
      <ConversationNotesPanel conversationId={conversationId} timeZone={timeZone} accessToken={accessToken} />
      {/* `18-10`: what this conversation led to - see the panel's own doc comment for why it lives
          here rather than in `ConversationPage`'s header next to `CloseConversationButton`. */}
      <ConversationOutcomePanel conversationId={conversationId} accessToken={accessToken} />
      {/* `14-12`: verified channel-identity linking/unlinking - see the panel's own doc comment. */}
      <ChannelIdentitiesPanel
        conversationId={conversationId}
        siteId={siteId}
        accessToken={accessToken}
        onInsertIntoComposer={onInsertIntoComposer}
      />
      {/* `14-14`/`adr/0079` section 6: unverified contact details - a materially different trust level
          than ChannelIdentitiesPanel above, deliberately styled and worded to look like it, not merged
          into that panel - see ContactDetailsPanel's own doc comment. */}
      <ContactDetailsPanel conversationId={conversationId} accessToken={accessToken} />

      <p className="ago-aside__note">{strings.visitorPanelNote}</p>
    </aside>
  );
}
