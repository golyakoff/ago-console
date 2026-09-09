import { useState } from "react";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute } from "../time/format.js";
import { ApiProblemError } from "../api/problemDetails.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";

/** `23-78`'s own dedicated permission - named once here rather than spelled out at the one place
 * that asks about it, the same `CLOSE_PERMISSION`/`SeatToggleButton` shape this file's siblings
 * already use. */
export const ATTACHMENT_UPLOAD_GRANT_PERMISSION = "conversation:attachment_upload_grant";

export interface AttachmentUploadGrantToggleProps {
  conversation: ConversationSummaryDto;
  /** The operator's own IANA zone, or `null` for the UTC-labelled fallback - threaded straight
   * through to `formatAbsolute`, the same value `ConversationPage`'s own `useWorkspace()` already
   * hands every other timestamp on this page. */
  timeZone: string | null;
  /** Runs the actual `POST .../grant-attachment-upload` call - injected, the same "the page owns
   * the request" split every other row/panel action in this console already follows. */
  onGrant: () => Promise<void>;
  /** Runs the actual `POST .../revoke-attachment-upload` call. */
  onRevoke: () => Promise<void>;
  /** Told once either call succeeds, so the page can re-read the queue - `useWorkspace().conversation`
   * is itself a queue row, and this is the same "who/when" data the toggle just changed. */
  onChanged: () => void;
}

/**
 * `23-78`: "an operator ticks «разрешаю пользователю отправлять файлы»" (the backlog item's own
 * Decision) - a small, reversible toggle on the conversation panel, the identical
 * "hidden without the permission, reversible gets no confirmation dialog" shape
 * `CloseConversationButton`/`SeatToggleButton` already establish between them (this control is
 * `SeatToggleButton`'s shape, not `CloseConversationButton`'s: revoking is not destructive - the
 * conversation, its messages and its history are untouched either way, only whether a future upload
 * attempt is refused).
 *
 * <b>Hidden, not disabled</b> without `ATTACHMENT_UPLOAD_GRANT_PERMISSION` - `CloseConversationButton`'s
 * own remarks state the reasoning in full, restated here for a different permission: a disabled
 * control still advertises that the action exists to an operator who will never use it, and this is
 * not the security boundary either way - `GrantAttachmentUploadHandler`/`RevokeAttachmentUploadHandler`
 * check the permission server-side on every call.
 *
 * <b>"Who/when", not a resolved display name.</b> `ConversationSummaryDto.attachmentUploadGrantedByOperatorId`
 * is an id, not the granting operator's own name - no read store joins an operator's display name
 * onto this field the way `operatorName` is joined for the *assigned* operator, and adding one for a
 * caption this narrow was judged not worth a second join today. This toggle says "an operator
 * granted it" or "granted by this site's own default" and the timestamp, never a name - a real gap
 * from "who", named rather than quietly worked around with a raw id.
 */
export function AttachmentUploadGrantToggle({ conversation, timeZone, onGrant, onRevoke, onChanged }: AttachmentUploadGrantToggleProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!hasPermission(ATTACHMENT_UPLOAD_GRANT_PERMISSION)) {
    return null;
  }

  const granted = conversation.hasAttachmentUploadGrant ?? false;

  const attempt = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await (granted ? onRevoke() : onGrant());
      onChanged();
    } catch (reason) {
      setFailure(reason instanceof ApiProblemError ? reason.message : strings.attachmentUploadGrantToggleError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ago-stack">
      <Button size="sm" variant="ghost" onClick={() => void attempt()} disabled={busy}>
        {granted ? strings.attachmentUploadRevokeButton : strings.attachmentUploadGrantButton}
      </Button>
      {granted && (
        <span className="ago-meta">
          {conversation.attachmentUploadGrantedByOperatorId
            ? strings.attachmentUploadGrantedByOperatorNote
            : strings.attachmentUploadGrantedByDefaultNote}
          {conversation.attachmentUploadGrantedAt
            ? ` · ${formatAbsolute(new Date(conversation.attachmentUploadGrantedAt), timeZone, strings)}`
            : ""}
        </span>
      )}
      {failure && <Alert tone="danger">{failure}</Alert>}
    </div>
  );
}
