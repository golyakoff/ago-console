import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationOutcomePanel } from "./ConversationOutcomePanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `18-10`. The same hand-made-permissions-context shape `CloseConversationButton.test.tsx` already
 * establishes for `11-09` - what is under test is this panel's own gating and interaction, not the
 * path from `GET /api/v1/operators/me` to a rendered permission set (`permissionGating.test.tsx`'s
 * job).
 */
const conversationsApi = vi.hoisted(() => ({
  fetchConversationOutcome: vi.fn(),
  setConversationOutcome: vi.fn(),
}));

vi.mock("../api/conversationsApi.js", () => conversationsApi);

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
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

async function mount(permissions: string[]): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <ConversationOutcomePanel conversationId={CONVERSATION_ID} accessToken="token" />
    </Permitted>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Unset" });
  conversationsApi.setConversationOutcome.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the control", () => {
  it("renders nothing at all for an operator without conversation:read", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(conversationsApi.fetchConversationOutcome).not.toHaveBeenCalled();
  });

  it("shows the current outcome, read-only, to an operator who can read but not close", async () => {
    conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Converted" });

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Converted");
    expect(all(container, "button")).toHaveLength(0);
  });

  it("offers the three recordable buttons to an operator holding conversation:close", async () => {
    const container = await mount(["conversation:read", "conversation:close"]);

    expect(byText(container, "button", "Converted")).not.toBeNull();
    expect(byText(container, "button", "Not converted")).not.toBeNull();
    expect(byText(container, "button", "Follow-up needed")).not.toBeNull();
  });

  it("never offers a button for Unset - there is no 'clear it' control", async () => {
    const container = await mount(["conversation:read", "conversation:close"]);

    expect(byText(container, "button", "Not recorded")).toBeNull();
  });
});

describe("reading the current outcome", () => {
  it("renders the unset default for a conversation nobody has recorded one for", async () => {
    conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Unset" });

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Not recorded");
  });

  it("shows a load error rather than a silently empty panel", async () => {
    conversationsApi.fetchConversationOutcome.mockRejectedValue(new Error("network down"));

    const container = await mount(["conversation:read"]);

    // A bare `Error`'s own message, the same `err instanceof Error ? err.message : ...` fallback
    // shape `ConversationTagsPanel`'s own load path already uses - `outcomeLoadError` is reserved for
    // a rejection that carries no message of its own.
    expect(one(container, '[role="alert"]').textContent).toContain("network down");
  });
});

describe("recording an outcome", () => {
  it("sets the outcome, and reflects it immediately without a re-fetch", async () => {
    const container = await mount(["conversation:read", "conversation:close"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Converted").click());

    expect(conversationsApi.setConversationOutcome).toHaveBeenCalledWith("token", CONVERSATION_ID, "Converted");
    expect(conversationsApi.fetchConversationOutcome).toHaveBeenCalledTimes(1); // only the initial load
    expect(container.textContent).toContain("Converted");
  });

  it("shows an error, and keeps the prior value, when the write fails", async () => {
    conversationsApi.setConversationOutcome.mockRejectedValue(
      new ApiProblemError("Conversation.Forbidden", "server wording", 403),
    );

    const container = await mount(["conversation:read", "conversation:close"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Converted").click());

    // The `ApiProblemError`'s own message - the same `err instanceof ApiProblemError ? err.message :
    // outcomeSetError` fallback shape `ConversationTagsPanel`'s own apply path already uses.
    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    // Still "Not recorded" - the failed write never took local effect.
    expect(container.textContent).toContain("Not recorded");
  });

  it("does not re-send the outcome the conversation already has", async () => {
    conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Converted" });

    const container = await mount(["conversation:read", "conversation:close"]);

    const button = byText<HTMLButtonElement>(container, "button", "Converted");
    expect(button?.disabled).toBe(true);
  });
});

describe("the honesty framing", () => {
  it("always shows the not-a-verified-sale note, for every operator who can see the panel at all", async () => {
    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("not a sale");
  });
});
