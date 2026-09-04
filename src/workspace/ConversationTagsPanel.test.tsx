import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationTagsPanel } from "./ConversationTagsPanel.js";
import type { TagDto } from "../api/tagsApi.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/**
 * `19-02`: the console-rendered half of this item's own Done-when - "an AI-applied tag is visibly
 * distinguishable from an operator-applied one in the console, proven by a rendered-component test."
 * The same hand-made-permissions-context shape `ConversationOutcomePanel.test.tsx` establishes for
 * `18-10` - what is under test is this panel's own rendering of `source`, not the path from
 * `GET /api/v1/operators/me` to a rendered permission set.
 */
const tagsApi = vi.hoisted(() => ({
  fetchConversationTags: vi.fn(),
  applyTagToConversation: vi.fn(),
  removeTagFromConversation: vi.fn(),
}));

vi.mock("../api/tagsApi.js", () => tagsApi);

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const SITE_TAGS: TagDto[] = [
  { id: "tag-billing", name: "Billing", createdAt: "2026-01-01T00:00:00Z" },
  { id: "tag-shipping", name: "Shipping", createdAt: "2026-01-01T00:00:00Z" },
];

function Permitted({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  const SITE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const value = useMemo<PermissionsState>(
    () => ({
      permissions,
      siteId: SITE_ID,
      locale: null,
      enabledModules: [],
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
      <ConversationTagsPanel conversationId={CONVERSATION_ID} siteTags={SITE_TAGS} accessToken="token" />
    </Permitted>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  tagsApi.applyTagToConversation.mockResolvedValue(undefined);
  tagsApi.removeTagFromConversation.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("distinguishing an AI-applied tag from an operator-applied one", () => {
  it("renders the AI marker and the accent tone only on the Ai-sourced tag", async () => {
    tagsApi.fetchConversationTags.mockResolvedValue([
      { id: "tag-billing", name: "Billing", createdAt: "2026-01-01T00:00:00Z", source: "Operator" },
      { id: "tag-shipping", name: "Shipping", createdAt: "2026-01-01T00:00:00Z", source: "Ai" },
    ]);

    const container = await mount(["conversation:read"]);

    const badges = all(container, ".ago-badge");
    expect(badges).toHaveLength(2);

    const billingBadge = badges.find((b) => b.textContent?.includes("Billing"));
    const shippingBadge = badges.find((b) => b.textContent?.includes("Shipping"));

    // The operator-applied tag: neutral tone, no AI marker anywhere in it.
    expect(billingBadge.className).toContain("ago-badge--neutral");
    expect(billingBadge.className).not.toContain("ago-badge--accent");
    expect(billingBadge.querySelector(".ago-badge__ai-marker")).toBeNull();

    // The AI-applied tag: a visibly different tone AND a real word, not colour alone.
    expect(shippingBadge.className).toContain("ago-badge--accent");
    expect(shippingBadge.className).not.toContain("ago-badge--neutral");
    const marker = shippingBadge.querySelector(".ago-badge__ai-marker");
    expect(marker).not.toBeNull();
    expect(marker.textContent).toBe("AI");

    // The trust signal survives for assistive tech too - a screen reader gets an explicit
    // "AI-applied tag" announcement, not just a hidden colour (the visible "AI" marker is
    // aria-hidden, so this sr-only text is what actually reaches assistive tech).
    expect(shippingBadge.textContent).toContain("AI-applied tag");
  });

  it("an operator's own newly-applied tag renders with the neutral tone, never the AI one", async () => {
    tagsApi.fetchConversationTags.mockResolvedValue([]);

    const container = await mount(["conversation:read", "conversation:tag"]);

    await interact(() => {
      const select = one<HTMLSelectElement>(container, "select");
      select.value = "tag-billing";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await interact(() => byText<HTMLButtonElement>(container, "button", "Apply").click());

    expect(tagsApi.applyTagToConversation).toHaveBeenCalledWith("token", CONVERSATION_ID, "tag-billing");
    const badge = one(container, ".ago-badge");
    expect(badge.className).toContain("ago-badge--neutral");
    expect(badge.querySelector(".ago-badge__ai-marker")).toBeNull();
  });
});

describe("basic rendering", () => {
  it("renders nothing for an operator without conversation:read", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(tagsApi.fetchConversationTags).not.toHaveBeenCalled();
  });

  it("shows the no-tags message when none are applied", async () => {
    tagsApi.fetchConversationTags.mockResolvedValue([]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("No tags applied.");
  });
});
