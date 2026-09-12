import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { OperatorConnectionContext, type OperatorConnectionState } from "../realtime/OperatorConnectionContext.js";
import type { OperatorConnection } from "../realtime/operatorConnection.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { VisitorPanel, type VisitorPanelProps } from "./VisitorPanel.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

// `ConversationPage.test.tsx`'s own precedent: every child panel here imports an `api/*.js` module
// that in turn reads `config.ts`, which throws outside a real Vite env. Permissions are `[]` below so
// none of those modules is actually called - this mock exists only so importing them does not throw.
vi.mock("../config.js", () => ({
  config: {
    apiBaseUrl: "https://api.test.invalid",
    keycloakAuthority: "https://keycloak.test.invalid/realms/ago",
    keycloakClientId: "ago-console",
    isPublicDemo: false,
  },
}));

/**
 * `25-57`: the visitor id, "conversation started", the site id and the conversation id stop
 * painting in the visible `<dl>` and move to a single `console.log` instead - this file proves both
 * halves. Permissions are deliberately `[]` throughout: every child panel `VisitorPanel` mounts
 * (`ChannelIdentitiesPanel`, `ContactDetailsPanel`, `ConversationTagsPanel`, `ConversationNotesPanel`,
 * `ConversationOutcomePanel`) gates its own fetch and its own render on `conversation:read`
 * (each panel's own `usePermissions()` call), so an empty permission set means none of them calls an
 * API this file has not mocked - the same "gate skips the fetch" property `ConversationPage.test.tsx`
 * leans on for `fetchVisitorHistory`, generalised to every sibling panel at once rather than mocking
 * five unrelated API modules for a test that is not about any of them.
 */

const CONVERSATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SITE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const VISITOR_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function conversation(overrides: Partial<ConversationSummaryDto> = {}): ConversationSummaryDto {
  return {
    conversationId: CONVERSATION_ID,
    visitorId: VISITOR_ID,
    state: "Waiting",
    createdAt: "2026-09-10T09:00:00+00:00",
    operatorUnreadCount: 0,
    ...overrides,
  };
}

function NoPermissions({ children }: { children: ReactNode }) {
  const value = useMemo<PermissionsState>(
    () => ({
      permissions: [],
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
      hasPermission: () => false,
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

function fakeConnection(): OperatorConnection {
  return {} as unknown as OperatorConnection;
}

function panel(props: Partial<VisitorPanelProps> = {}) {
  const realtime: OperatorConnectionState = {
    connection: fakeConnection(),
    connectionState: "connected",
    serverDraining: false,
    isAway: false,
    setAway: () => Promise.resolve(),
  };

  const merged: VisitorPanelProps = {
    conversationId: CONVERSATION_ID,
    conversation: conversation(),
    visitorOnline: true,
    siteId: SITE_ID,
    now: new Date("2026-09-10T09:05:00Z"),
    timeZone: "UTC",
    visitorHistory: { hasChannelIdentity: false, conversations: [], nextBeforeId: null },
    visitorHistoryError: null,
    accessToken: "token",
    siteTags: [],
    onInsertIntoComposer: () => undefined,
    ...props,
  };

  return (
    <NoPermissions>
      <OperatorConnectionContext.Provider value={realtime}>
        <VisitorPanel {...merged} />
      </OperatorConnectionContext.Provider>
    </NoPermissions>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("the four debug fields no longer paint", () => {
  it("renders no <dl> of visitor/conversation facts at all", async () => {
    const container = await render(panel());

    expect(all(container, "dl")).toHaveLength(0);
  });

  it("shows neither the visitor id, the site id nor the conversation id anywhere in the panel", async () => {
    const container = await render(panel());

    expect(container.textContent).not.toContain(VISITOR_ID);
    expect(container.textContent).not.toContain(SITE_ID);
    expect(container.textContent).not.toContain(CONVERSATION_ID);
  });

  it("does not render the 'Conversation started' heading the removed field used to show", async () => {
    const container = await render(panel());

    expect(byText<HTMLElement>(container, "dt", "Conversation started")).toBeNull();
    expect(all(container, "dt")).toHaveLength(0);
  });
});

describe("the same four values go to the console instead", () => {
  it("logs visitor id, conversation start, site id and conversation id once on mount", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await render(panel());

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        visitorId: VISITOR_ID,
        conversationStartedAt: "2026-09-10T09:00:00+00:00",
        siteId: SITE_ID,
        conversationId: CONVERSATION_ID,
      }),
    );

    logSpy.mockRestore();
  });

  it("logs null for the visitor id and the start time when the queue row is gone, not the string the UI used to fall back to", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await render(panel({ conversation: null }));

    expect(logSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ visitorId: null, conversationStartedAt: null }),
    );

    logSpy.mockRestore();
  });

  it("logs again when the conversation identity actually changes, not on every unrelated re-render", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await render(panel());
    expect(logSpy).toHaveBeenCalledTimes(1);

    // Same conversation, only `visitorOnline` flips - nothing the log cares about changed.
    await render(panel({ visitorOnline: false }));
    expect(logSpy).toHaveBeenCalledTimes(1);

    // The conversation itself moves to a different visitor - this is exactly what a support session
    // needs the console to reflect.
    await render(panel({ conversation: conversation({ visitorId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }) }));
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ visitorId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }),
    );

    logSpy.mockRestore();
  });
});

/**
 * `25-54`: the panel's own explanatory paragraph used to render at the very foot of it, after every
 * child panel - here, with every permission withheld, none of those children render anything at all
 * (`describe` block above's own doc comment on why), so the header's own `Tooltip` is the only one
 * this test needs to find.
 */
describe("25-54: the panel's own note becomes a header tooltip", () => {
  it("does not render the note as permanent inline text, only inside its own hidden tooltip on the header", async () => {
    const container = await render(panel());

    expect(container.querySelector(".ago-aside__note")).toBeNull();

    const bubble = one<HTMLElement>(container, '[role="tooltip"]');
    expect(bubble.textContent).toContain("This is everything the platform knows");
    expect(bubble.hidden).toBe(true);
  });

  it("reveals the note when the header's tooltip trigger receives focus", async () => {
    const container = await render(panel());

    const trigger = one<HTMLButtonElement>(container, ".ago-tooltip__trigger");
    const bubble = one<HTMLElement>(container, '[role="tooltip"]');

    await interact(() => trigger.focus());
    expect(bubble.hidden).toBe(false);
  });
});
