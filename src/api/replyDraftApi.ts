import { config } from "../config.js";
import { withActiveSiteHeader } from "./activeSite.js";
import { ShapeMismatchError, assertHasKeys, requiredKeysOf } from "./shapeGuard.js";

/**
 * `19-01`: the console's own call onto `Ago.Chat.Api.ReplyDraft.ReplyDraftEndpoints` - one operator-only
 * `POST`, reading the conversation the operator already has open and handing back one suggested reply,
 * never sent by anything other than the operator's own explicit action once it lands in the composer
 * (`ConversationPage.tsx`'s own `handleSuggestReply`, `adr/0078` kind 1).
 *
 * `ReplyDraftError`'s own `code`, not just `cannedResponsesApi.ts`'s `detail`-only shape
 * (`AttachmentDownloadResponse`'s sibling), because `ConversationPage` needs to tell "you asked for too
 * many suggestions" (`ReplyDraft.RateLimited`) apart from "the provider is down"
 * (`ReplyDraft.Unavailable`) apart from anything else, and render a distinct localized string for each
 * rather than surfacing the server's own English `detail` text verbatim - the same `code`-branching
 * `CannedResponsesError` already established for the settings screens.
 */
export interface ReplyDraftResponse {
  draftText: string;
}

export class ReplyDraftError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplyDraftError";
    this.code = code;
  }
}

interface ProblemDetailsBody {
  type?: string;
  detail?: string;
}

function isProblemDetailsBody(value: unknown): value is ProblemDetailsBody {
  return typeof value === "object" && value !== null;
}

async function buildError(response: Response): Promise<ReplyDraftError> {
  let code = "ReplyDraft.Unknown";
  let detail = `Failed to generate a reply draft: ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (isProblemDetailsBody(body)) {
      code = body.type ?? code;
      detail = body.detail ?? detail;
    }
  } catch {
    // Not problem+json (a network-level failure or a proxy error page) - fall back to the status
    // code alone, matching `cannedResponsesApi.ts`'s own precedent.
  }

  return new ReplyDraftError(code, detail);
}

/**
 * `23-118`/`23-99`: the shape the draft promises. `ConversationPage.handleSuggestReply` inserts
 * `draftText` into the composer, so a dropped `draftText` would insert nothing and read as "no
 * suggestion was generated" - a false empty state, not a reader that did not answer. Rejected as
 * `ReplyDraftError('shape.mismatch')`, the same `code`-carrying type every other rejection here
 * produces, which `shapeMismatchMessage` localizes.
 */
const replyDraftRequiredKeys = requiredKeysOf<ReplyDraftResponse>({ draftText: true });

export async function generateReplyDraft(accessToken: string, conversationId: string): Promise<ReplyDraftResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/conversations/${conversationId}/reply-draft`, {
    method: "POST",
    headers: withActiveSiteHeader({
      Authorization: `Bearer ${accessToken}`,
    }),
  });

  if (!response.ok) {
    throw await buildError(response);
  }

  const body: unknown = await response.json();
  try {
    assertHasKeys<ReplyDraftResponse>(body, replyDraftRequiredKeys, "POST /api/v1/conversations/{id}/reply-draft");
  } catch (reason) {
    if (reason instanceof ShapeMismatchError) {
      throw new ReplyDraftError("shape.mismatch", reason.diagnostic);
    }
    throw reason;
  }
  return body;
}
