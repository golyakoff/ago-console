import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelIdentitiesPanel } from "./ChannelIdentitiesPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, flush, interact, one, render, renderSync, unmount } from "../testing/dom.js";

/** `14-12`/`14-13`. The same hand-made-permissions-context shape `ConversationOutcomePanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish. */
const channelIdentitiesApi = vi.hoisted(() => ({
  fetchChannelIdentities: vi.fn(),
  requestChannelLink: vi.fn(),
  unlinkChannelIdentity: vi.fn(),
  setPreferredChannelIdentity: vi.fn(),
}));

vi.mock("../api/channelIdentitiesApi.js", () => channelIdentitiesApi);

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_CONVERSATION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
      credentialsArePublished: false,
      hasPermission: (permission: string) => permissions.includes(permission),
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

function panel(conversationId: string, permissions: string[], onInsertIntoComposer: (text: string) => void = () => undefined) {
  return (
    <Permitted permissions={permissions}>
      <ChannelIdentitiesPanel
        conversationId={conversationId}
        siteId={SITE_ID}
        accessToken="token"
        onInsertIntoComposer={onInsertIntoComposer}
      />
    </Permitted>
  );
}

async function mount(permissions: string[], onInsertIntoComposer: (text: string) => void = () => undefined) {
  return render(panel(CONVERSATION_ID, permissions, onInsertIntoComposer));
}

beforeEach(() => {
  vi.clearAllMocks();
  channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the panel", () => {
  it("renders nothing at all for an operator without conversation:read", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(channelIdentitiesApi.fetchChannelIdentities).not.toHaveBeenCalled();
  });

  it("lists identities but offers no link/unlink controls to a read-only operator", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Telegram");
    expect(container.textContent).toContain("tg-user-1");
    expect(all(container, "button")).toHaveLength(0);
  });

  it("offers the link-request control to an operator holding conversation:send", async () => {
    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Generate code")).not.toBeNull();
  });

  it("offers an unlink button per identity only to an operator holding channel_identity:unlink", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);

    const withoutIt = await mount(["conversation:read"]);
    expect(byText(withoutIt, "button", "Unlink")).toBeNull();
    await unmount();

    const withIt = await mount(["conversation:read", "channel_identity:unlink"]);
    expect(byText(withIt, "button", "Unlink")).not.toBeNull();
  });
});

describe("listing identities", () => {
  it("shows the empty state when the visitor has no linked channels", async () => {
    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("No channels linked yet.");
  });

  it("shows a load error rather than a silently empty panel", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockRejectedValue(new Error("network down"));

    const container = await mount(["conversation:read"]);

    expect(one(container, '[role="alert"]').textContent).toContain("network down");
  });
});

describe("requesting a link", () => {
  it("generates a code, shows it, and drops the relay instruction into the composer", async () => {
    channelIdentitiesApi.requestChannelLink.mockResolvedValue({
      code: "482913",
      kind: "Telegram",
      expiresAt: "2026-08-30T12:15:00Z",
    });
    let inserted: string | null = null;

    const container = await mount(["conversation:read", "conversation:send"], (text) => {
      inserted = text;
    });

    await interact(() => byText<HTMLButtonElement>(container, "button", "Generate code").click());

    expect(channelIdentitiesApi.requestChannelLink).toHaveBeenCalledWith("token", CONVERSATION_ID, "Telegram");
    expect(container.textContent).toContain("482913");
    expect(inserted).toContain("482913");
  });

  it("shows an error, and inserts nothing into the composer, when the request fails", async () => {
    channelIdentitiesApi.requestChannelLink.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "server wording", 403),
    );
    let inserted: string | null = null;

    const container = await mount(["conversation:read", "conversation:send"], (text) => {
      inserted = text;
    });

    await interact(() => byText<HTMLButtonElement>(container, "button", "Generate code").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(inserted).toBeNull();
  });
});

describe("unlinking", () => {
  it("removes the identity from the list on a successful unlink", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);
    channelIdentitiesApi.unlinkChannelIdentity.mockResolvedValue(undefined);

    const container = await mount(["conversation:read", "channel_identity:unlink"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Unlink").click());

    expect(channelIdentitiesApi.unlinkChannelIdentity).toHaveBeenCalledWith("token", SITE_ID, "id-1");
    expect(container.textContent).not.toContain("tg-user-1");
    expect(container.textContent).toContain("No channels linked yet.");
  });

  it("shows an error, and keeps the identity listed, when the unlink fails", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);
    channelIdentitiesApi.unlinkChannelIdentity.mockRejectedValue(
      new ApiProblemError("ChannelIdentity.NotFound", "server wording", 404),
    );

    const container = await mount(["conversation:read", "channel_identity:unlink"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Unlink").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).toContain("tg-user-1");
  });
});

/** `14-13`: setting/clearing the preferred reply channel - the radio-shaped control this panel already
 * hosts every other per-row action in, not a separate page. */
describe("preferring a channel", () => {
  const twoIdentities = [
    {
      channelIdentityId: "id-1",
      kind: "Telegram",
      address: "tg-user-1",
      firstSeenAt: "x",
      lastSeenAt: "x",
      isPreferred: false,
    },
    {
      channelIdentityId: "id-2",
      kind: "Sms",
      address: "+15550001111",
      firstSeenAt: "x",
      lastSeenAt: "x",
      isPreferred: true,
    },
  ];

  it("offers a Prefer button per non-preferred identity, and a Preferred badge with a Clear button on the preferred one, to an operator holding conversation:send", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue(twoIdentities);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Prefer")).not.toBeNull();
    expect(byText(container, "button", "Clear")).not.toBeNull();
    expect(container.textContent).toContain("Preferred");
  });

  it("shows the Preferred badge but no Prefer/Clear buttons to a read-only operator", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue(twoIdentities);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Preferred");
    expect(byText(container, "button", "Prefer")).toBeNull();
    expect(byText(container, "button", "Clear")).toBeNull();
  });

  it("sets the preference and moves the badge when Prefer is clicked", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);
    channelIdentitiesApi.setPreferredChannelIdentity.mockResolvedValue(undefined);

    const container = await mount(["conversation:read", "conversation:send"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Prefer").click());

    expect(channelIdentitiesApi.setPreferredChannelIdentity).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1");
    expect(container.textContent).toContain("Preferred");
    expect(byText(container, "button", "Prefer")).toBeNull();
  });

  it("clears the preference when Clear is clicked", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: true,
      },
    ]);
    channelIdentitiesApi.setPreferredChannelIdentity.mockResolvedValue(undefined);

    const container = await mount(["conversation:read", "conversation:send"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Clear").click());

    expect(channelIdentitiesApi.setPreferredChannelIdentity).toHaveBeenCalledWith("token", CONVERSATION_ID, null);
    expect(container.textContent).not.toContain("Preferred");
    expect(byText(container, "button", "Prefer")).not.toBeNull();
  });

  it("shows an error, and leaves the badge unchanged, when setting the preference fails", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);
    channelIdentitiesApi.setPreferredChannelIdentity.mockRejectedValue(
      new ApiProblemError("ChannelIdentity.NotEligibleForPreference", "server wording", 404),
    );

    const container = await mount(["conversation:read", "conversation:send"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Prefer").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).not.toContain("Preferred");
  });
});

/**
 * `23-100`: `VisitorPanel` renders this panel with no `key={conversationId}`, so switching the
 * operator's selected conversation updates this component's props in place rather than remounting it
 * - the reset has to be real, not merely "a fresh mount would have shown nothing anyway."
 *
 * `renderSync` (unlike `render`/`interact`, which drain the microtask queue effects run on) returns
 * the instant React has committed, before any `useEffect` has fired. That is what makes this a real
 * fails-before check: against the pre-`23-100` code, the reset lived inside the effect, so the DOM
 * checked here would still show the previous conversation's identity for at least this one commit.
 * Against the render-phase version, the reset already happened before this same commit - React
 * discards and re-renders synchronously when state is adjusted during render
 * (react.dev/learn/you-might-not-need-an-effect).
 */
describe("switching conversations (23-100)", () => {
  it("clears the previous conversation's identities before the fetch effect could have run", async () => {
    channelIdentitiesApi.fetchChannelIdentities.mockResolvedValue([
      {
        channelIdentityId: "id-1",
        kind: "Telegram",
        address: "tg-user-1",
        firstSeenAt: "x",
        lastSeenAt: "x",
        isPreferred: false,
      },
    ]);

    const container = await mount(["conversation:read"]);
    expect(container.textContent).toContain("tg-user-1");

    renderSync(panel(OTHER_CONVERSATION_ID, ["conversation:read"]));

    expect(container.textContent).not.toContain("tg-user-1");

    // Lets the pending fetch for the new conversation settle, so the test does not leave a dangling
    // promise resolution for the next one.
    await flush();
    expect(channelIdentitiesApi.fetchChannelIdentities).toHaveBeenLastCalledWith("token", OTHER_CONVERSATION_ID);
  });
});
