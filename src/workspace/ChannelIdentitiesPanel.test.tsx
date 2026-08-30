import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelIdentitiesPanel } from "./ChannelIdentitiesPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/** `14-12`. The same hand-made-permissions-context shape `ConversationOutcomePanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish. */
const channelIdentitiesApi = vi.hoisted(() => ({
  fetchChannelIdentities: vi.fn(),
  requestChannelLink: vi.fn(),
  unlinkChannelIdentity: vi.fn(),
}));

vi.mock("../api/channelIdentitiesApi.js", () => channelIdentitiesApi);

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      hasPermission: (permission: string) => permissions.includes(permission),
      tenancies: [{ siteId: SITE_ID, siteName: "Test Site" }],
      activeSiteId: SITE_ID,
      switchTenancy: () => undefined,
    }),
    [permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

async function mount(permissions: string[], onInsertIntoComposer: (text: string) => void = () => undefined) {
  return render(
    <Permitted permissions={permissions}>
      <ChannelIdentitiesPanel
        conversationId={CONVERSATION_ID}
        siteId={SITE_ID}
        accessToken="token"
        onInsertIntoComposer={onInsertIntoComposer}
      />
    </Permitted>,
  );
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
      { channelIdentityId: "id-1", kind: "Telegram", address: "tg-user-1", firstSeenAt: "x", lastSeenAt: "x" },
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
      { channelIdentityId: "id-1", kind: "Telegram", address: "tg-user-1", firstSeenAt: "x", lastSeenAt: "x" },
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
      { channelIdentityId: "id-1", kind: "Telegram", address: "tg-user-1", firstSeenAt: "x", lastSeenAt: "x" },
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
      { channelIdentityId: "id-1", kind: "Telegram", address: "tg-user-1", firstSeenAt: "x", lastSeenAt: "x" },
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
