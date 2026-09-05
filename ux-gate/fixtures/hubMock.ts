import type { Page } from "@playwright/test";
import { SEEDED_MESSAGES } from "./data.js";

/**
 * A minimal, hand-rolled mock of `OperatorHub` (`ago-chat`) over `@microsoft/signalr`'s own wire
 * protocol - the one piece of `15-11` that plain HTTP request routing (`apiStubs.ts`) cannot reach,
 * because the console's conversation thread is populated by a hub `invoke`, not a REST call
 * (`operatorConnection.ts`'s own doc comment: "one `OperatorConnection` for the operator's whole
 * signed-in session"; `ConversationPage`'s join effect calls `connection.joinConversation`, which is
 * `HubConnection.invoke("JoinConversationAsync", ...)`).
 *
 * Two things had to be real, not guessed, and both were checked against `@microsoft/signalr`'s own
 * source rather than assumed from memory:
 *
 * 1. **Negotiation.** `HubConnectionBuilder().withUrl(hubUrl, ...)` with no transport pinned
 *    performs an HTTP `POST {hubUrl}/negotiate?negotiateVersion=1` first, and only opens the
 *    WebSocket once that resolves with a transport list that includes `"WebSockets"`. Skipped
 *    entirely is not an option here without changing `operatorConnection.ts` itself (out of scope,
 *    `15-11`'s brief: "do not redesign anything") - so this stubs the negotiate response too.
 * 2. **Framing.** The default `JsonHubProtocol` delimits every message, in both directions, with a
 *    trailing `\x1e` (ASCII Record Separator) - `JSON.stringify(msg) + "\x1e"` out, and an incoming
 *    buffer split on the same character in. The very first thing the client sends after the socket
 *    opens is a handshake request (`{"protocol":"json","version":1}\x1e`), which must be answered
 *    with an empty JSON object (`{}\x1e`) before anything else - a mis-ordered or missing handshake
 *    reply is indistinguishable, from the client's side, from a hub that never came up.
 *
 * Everything else is deliberately not implemented. `SendMessageAsync`, `GetHistoryAsync` and
 * `GetVisitorHistoryConversationAsync` have no handler here because no screen this gate opens calls
 * them - a real send is a write this gate never performs (there is nothing to observe from a
 * screenshot that a fixed seeded thread does not already show), and a caller reaching one of the
 * unhandled targets gets a `HubException`-shaped rejection rather than a silently hanging `invoke`,
 * which would otherwise be a much harder failure to diagnose from a CI log.
 */
const RECORD_SEPARATOR = "\x1e";

interface HubInvocation {
  /** Absent only on the one message this protocol does not tag: the handshake request. */
  type?: number;
  invocationId?: string;
  target?: string;
  arguments?: unknown[];
}

function parseRecords(raw: string | Buffer): HubInvocation[] {
  const text = typeof raw === "string" ? raw : raw.toString("utf-8");
  return text
    .split(RECORD_SEPARATOR)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => JSON.parse(chunk) as HubInvocation);
}

function encode(message: unknown): string {
  return JSON.stringify(message) + RECORD_SEPARATOR;
}

function joinConversationResult() {
  // `JoinConversationAsync`'s own contract (`operatorConnection.ts#joinConversation`'s doc comment):
  // newest-first, a fresh join's `nextBeforeSequence` is `null` once every seeded message fits on
  // one page - true here, four messages against `HISTORY_PAGE_SIZE` (50) in `ConversationPage.tsx`.
  return {
    messages: [...SEEDED_MESSAGES].reverse(),
    nextBeforeSequence: null,
  };
}

export async function installOperatorHubMock(page: Page): Promise<void> {
  // The negotiate POST - an ordinary HTTP request, so `page.route` (not `routeWebSocket`) is what
  // intercepts it.
  await page.route("**/hubs/operator/negotiate**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        negotiateVersion: 1,
        connectionId: "ux-gate-fake-connection-id",
        connectionToken: "ux-gate-fake-connection-token",
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text"] }],
      }),
    });
  });

  await page.routeWebSocket("**/hubs/operator**", (ws) => {
    ws.onMessage((raw) => {
      let records: HubInvocation[];
      try {
        records = parseRecords(raw);
      } catch (error) {
        console.error("ux-gate hub mock: could not parse an incoming SignalR frame", error);
        return;
      }

      for (const record of records) {
        // The handshake request has no `type` field at all - `{"protocol":"json","version":1}` - and
        // every other HubProtocol message always carries one (Invocation, Ping, Close, ...), which is
        // what makes "absent" an unambiguous test rather than a guess. Answered with an empty
        // successful handshake response, per `@microsoft/signalr`'s `HandshakeProtocol`.
        if (record.type === undefined) {
          ws.send(encode({}));
          continue;
        }

        // type 6: Ping. No reply needed for a gate run that finishes in seconds, well inside
        // `HubConnection`'s default 30s server-timeout window - see this file's own doc comment.
        if (record.type === 6) {
          continue;
        }

        // type 1: Invocation - the only kind this mock's supported targets ever send.
        if (record.type === 1) {
          const { invocationId, target, arguments: args = [] } = record;

          if (target === "JoinConversationAsync") {
            ws.send(encode({ type: 3, invocationId, result: joinConversationResult() }));
            continue;
          }

          if (target === "GetVisitorPresenceAsync") {
            ws.send(encode({ type: 3, invocationId, result: false }));
            continue;
          }

          // `23-20`: `OperatorConnectionProvider` calls this once on every "connected" - including
          // this mock's own fake handshake - so every gate screen would otherwise log the unhandled-
          // target warning below on every run. `false` (not away) is the correct default for every
          // screen this gate opens: none of them are about the away control's own active state.
          if (target === "GetMyPresenceAsync") {
            ws.send(encode({ type: 3, invocationId, result: false }));
            continue;
          }

          // An unhandled target - see this file's own doc comment on why this mock stays deliberately
          // narrow. A `HubException`-shaped completion (an `error`, not a thrown transport fault) is
          // what `HubConnection.invoke` itself turns into a rejected promise, so a caller that reaches
          // this branch fails the same way an unimplemented server method would.
          console.warn(`ux-gate hub mock: no handler for hub target ${String(target)} (args: ${JSON.stringify(args)})`);
          ws.send(encode({ type: 3, invocationId, error: `ux-gate hub mock has no handler for "${String(target)}"` }));
        }
      }
    });
  });
}
