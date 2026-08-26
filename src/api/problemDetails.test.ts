import { describe, expect, it } from "vitest";
import { ApiProblemError, problemDetailsFrom } from "./problemDetails.js";

/**
 * `11-09`: the wire-to-code step everything downstream branches on.
 *
 * **This file exists because its absence was caught by the fails-before pass.** Deleting the `type`
 * read here - so every failure arrives as `http.409` - left `closeOutcome.test.ts` and
 * `CloseConversationButton.test.tsx` entirely green, because both construct their own
 * `ApiProblemError`. The branching was tested; the thing that decides which branch is taken was not,
 * and a single silent change here would have collapsed every specific message the item asked for
 * into the generic default.
 */
function problemResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

describe("reading a problem-details response", () => {
  it("keeps the server's stable type, which is the thing callers branch on", async () => {
    const error = await problemDetailsFrom(
      problemResponse({ type: "Conversation.InvalidState", detail: "Already closed.", status: 409 }, 409),
    );

    expect(error).toBeInstanceOf(ApiProblemError);
    expect(error.code).toBe("Conversation.InvalidState");
    expect(error.message).toBe("Already closed.");
    expect(error.status).toBe(409);
  });

  it("distinguishes the two 409s ago-chat can return for one action", async () => {
    // The pair `closeOutcome.ts` turns into different sentences with different affordances. If this
    // step lost the distinction, that whole decision would be reading one value.
    const invalid = await problemDetailsFrom(problemResponse({ type: "Conversation.InvalidState" }, 409));
    const raced = await problemDetailsFrom(problemResponse({ type: "Conversation.ConcurrencyConflict" }, 409));

    expect(invalid.code).not.toBe(raced.code);
    expect(invalid.status).toBe(raced.status);
  });

  it("falls back to the status when the body carries no type", async () => {
    const error = await problemDetailsFrom(problemResponse({ detail: "Something went wrong." }, 500));

    // Never `undefined`: a caller's `switch` always has something to match on.
    expect(error.code).toBe("http.500");
    expect(error.message).toBe("Something went wrong.");
  });

  it("survives a response with no JSON at all", async () => {
    // A 502 from an ingress with an HTML body is the ordinary case, not a defensive one.
    const error = await problemDetailsFrom(new Response("<html>Bad Gateway</html>", { status: 502 }));

    expect(error.code).toBe("http.502");
    expect(error.message).toContain("502");
  });

  it("survives a 401 with an empty body", async () => {
    // The authentication middleware refuses before any of this product's code runs, so there are no
    // problem details to read.
    const error = await problemDetailsFrom(new Response(null, { status: 401 }));

    expect(error.code).toBe("http.401");
    expect(error.status).toBe(401);
  });

  it("ignores a type or detail that is not a string", async () => {
    // A body that parses but is not the shape RFC 7807 promises. Coercing it would put `[object
    // Object]` in front of an operator.
    const error = await problemDetailsFrom(problemResponse({ type: 42, detail: { nested: true } }, 400));

    expect(error.code).toBe("http.400");
    expect(error.message).toContain("400");
  });
});
