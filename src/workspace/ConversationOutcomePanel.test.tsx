import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationOutcomePanel } from "./ConversationOutcomePanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { byText, flush, interact, one, render, renderSync, unmount } from "../testing/dom.js";

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
const OTHER_CONVERSATION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
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

function panel(conversationId: string, permissions: string[]) {
  return (
    <Permitted permissions={permissions}>
      <ConversationOutcomePanel conversationId={conversationId} accessToken="token" />
    </Permitted>
  );
}

async function mount(permissions: string[]): Promise<HTMLElement> {
  return render(panel(CONVERSATION_ID, permissions));
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
    // `25-54`: no longer "zero buttons anywhere in the panel" - the header's own `Tooltip` trigger is
    // a real `<button>` too, and it is not gated on `conversation:close` (explaining what "Converted"
    // means is not a permission, unlike changing it). What this test is actually about is the
    // outcome-*setting* control group, which `canSet` gates - so it asserts that group's absence
    // directly rather than counting every button in the panel.
    expect(container.querySelector('[role="group"]')).toBeNull();
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

/**
 * `25-54`: the "not a verified sale" note used to be a permanent `<p className="ago-aside__note">`
 * at the foot of this panel - `container.textContent` containing "not a sale" was enough to prove it
 * rendered, because there was no other way for that text to reach the DOM. A hidden `Tooltip` bubble
 * is real markup too, so that same assertion would now pass whether or not the relocation actually
 * happened - it says nothing about *where* the text is. These two tests check the two halves of the
 * item's own Done-when instead: no standing paragraph, and the text is reachable through the trigger.
 */
describe("the honesty framing", () => {
  it("no longer renders the not-a-verified-sale note as a permanent paragraph, only inside its own hidden tooltip", async () => {
    const container = await mount(["conversation:read"]);

    expect(container.querySelector(".ago-aside__note")).toBeNull();

    const bubble = one<HTMLElement>(container, '[role="tooltip"]');
    expect(bubble.textContent).toContain("not a sale");
    expect(bubble.hidden).toBe(true);
  });

  it("reveals the not-a-verified-sale note when its tooltip trigger receives focus, and hides it again on blur", async () => {
    const container = await mount(["conversation:read"]);

    const trigger = one<HTMLButtonElement>(container, ".ago-tooltip__trigger");
    const bubble = one<HTMLElement>(container, '[role="tooltip"]');

    await interact(() => trigger.focus());
    expect(bubble.hidden).toBe(false);

    await interact(() => trigger.blur());
    expect(bubble.hidden).toBe(true);
  });
});

/**
 * `23-100`: `VisitorPanel` renders this panel with no `key={conversationId}` - see
 * `ChannelIdentitiesPanel.test.tsx`'s identical describe block for why `renderSync` (commits without
 * running any passive effect) is what makes this a real fails-before check rather than "the same
 * behaviour, refactored": against the pre-`23-100` code the reset lived inside the effect, so this
 * commit would still carry the previous conversation's outcome; against the render-phase version the
 * reset already happened before this same commit.
 */
describe("switching conversations (23-100)", () => {
  it("clears the previous conversation's outcome before the fetch effect could have run", async () => {
    conversationsApi.fetchConversationOutcome.mockResolvedValue({ outcome: "Converted" });

    const container = await mount(["conversation:read"]);
    expect(container.textContent).toContain("Converted");

    renderSync(panel(OTHER_CONVERSATION_ID, ["conversation:read"]));

    expect(container.textContent).not.toContain("Converted");

    await flush();
    expect(conversationsApi.fetchConversationOutcome).toHaveBeenLastCalledWith("token", OTHER_CONVERSATION_ID);
  });
});
