/**
 * `11-09`: an RFC 7807 problem-details response, as something a caller can branch on.
 *
 * `api-design.md`'s rule is that clients branch on `type` and never on the message, and until now no
 * call in the console needed to: the reads throw a bare `Error` with a status because nothing asks
 * *why* a queue fetch failed. Closing a conversation is the first that does — an already-closed
 * conversation, one reassigned underneath and a lost optimistic-concurrency race are three different
 * things to tell an operator, and two of them are the same status.
 *
 * <b>Its own module, deliberately, and the reason is testability rather than tidiness.</b> Every
 * other file under `api/` imports `config.ts`, which throws unless three `VITE_*` variables are set —
 * so anything importing one of them drags a whole environment into a test that only wanted an error
 * type. Keeping the error here means `workspace/closeOutcome.ts` and its tests need no environment
 * and no module mock at all, which is what lets the decision logic be tested as the pure function it
 * is.
 *
 * `sitesApi.ts` (`10-03`) has its own near-identical `RegisterSiteError` and body reader. Left where
 * it is rather than migrated: that file is in another item's lane this wave, and a mechanical
 * refactor across a lane boundary is not worth the merge conflict. Worth folding in later.
 */
export class ApiProblemError extends Error {
  /** The server's stable `type` — e.g. `Conversation.InvalidState` (`ago-chat`'s
   * `ConversationErrors`) — or `http.<status>` when the response carried no problem-details body at
   * all. Never `undefined`, so a caller's `switch` always has something to match. */
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiProblemError";
    this.code = code;
    this.status = status;
  }
}

interface ProblemDetailsBody {
  type?: unknown;
  detail?: unknown;
}

/**
 * Reads a failed response into an {@link ApiProblemError}.
 *
 * Never throws, which matters because the shapes it has to survive are real: a `502` from an ingress
 * with an HTML body, a connection that died mid-body, and a `401` the authentication middleware
 * produced before any of this product's code ran — none of which carries problem details. The status
 * is the only fact available in those cases, and `http.<status>` is what the caller sees.
 */
export async function problemDetailsFrom(response: Response): Promise<ApiProblemError> {
  try {
    const problem = (await response.json()) as ProblemDetailsBody;
    return new ApiProblemError(
      typeof problem.type === "string" ? problem.type : `http.${response.status}`,
      typeof problem.detail === "string" ? problem.detail : `The request failed (${response.status}).`,
      response.status,
    );
  } catch {
    return new ApiProblemError(
      `http.${response.status}`,
      `The request failed (${response.status}).`,
      response.status,
    );
  }
}
