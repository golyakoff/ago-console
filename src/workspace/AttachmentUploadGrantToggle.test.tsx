import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AttachmentUploadGrantToggle, ATTACHMENT_UPLOAD_GRANT_PERMISSION } from "./AttachmentUploadGrantToggle.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import type { ConversationSummaryDto } from "../realtime/protocol/types.js";
import { all, byText, interact, render, unmount } from "../testing/dom.js";

/**
 * `23-78`: the operator's own side of the control - "an operator ticks «разрешаю пользователю
 * отправлять файлы»" (the backlog item's own Decision). The gating tests below follow
 * `CloseConversationButton.test.tsx`'s own template verbatim (this file's sibling): "hidden" and
 * "disabled" are one CSS class apart, and only "hidden" is what the item asked for - a test that
 * merely checks the button is absent would pass by accident against a disabled one if the query
 * happened to miss it, so the negative case also asserts nothing disabled wears the label.
 */
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

const CONVERSATION_ID = "77777777-7777-7777-7777-777777777777";
const VISITOR_ID = "88888888-8888-8888-8888-888888888888";
const OPERATOR_ID = "99999999-9999-9999-9999-999999999999";

function conversation(overrides: Partial<ConversationSummaryDto> = {}): ConversationSummaryDto {
  return {
    conversationId: CONVERSATION_ID,
    visitorId: VISITOR_ID,
    state: "Assigned",
    createdAt: "2026-09-09T09:00:00+00:00",
    operatorUnreadCount: 0,
    operatorId: OPERATOR_ID,
    ...overrides,
  };
}

interface Handlers {
  onGrant: Mock<() => Promise<void>>;
  onRevoke: Mock<() => Promise<void>>;
  onChanged: Mock<() => void>;
}

function handlers(onGrant: () => Promise<void> = () => Promise.resolve(), onRevoke: () => Promise<void> = () => Promise.resolve()): Handlers {
  return { onGrant: vi.fn(onGrant), onRevoke: vi.fn(onRevoke), onChanged: vi.fn<() => void>() };
}

async function mount(permissions: string[], summary: ConversationSummaryDto, h: Handlers): Promise<HTMLElement> {
  return render(
    <Permitted permissions={permissions}>
      <AttachmentUploadGrantToggle conversation={summary} timeZone={null} onGrant={h.onGrant} onRevoke={h.onRevoke} onChanged={h.onChanged} />
    </Permitted>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the control", () => {
  it("offers it to an operator holding conversation:attachment_upload_grant", async () => {
    const container = await mount([ATTACHMENT_UPLOAD_GRANT_PERMISSION], conversation(), handlers());

    expect(byText(container, "button", "Allow file uploads")).not.toBeNull();
  });

  it("does not render it at all for an operator without the permission — not even disabled", async () => {
    const container = await mount(["conversation:read"], conversation(), handlers());

    expect(byText(container, "button", "Allow file uploads")).toBeNull();
    expect(byText(container, "button", "Revoke file uploads")).toBeNull();
    expect(all(container, "button[disabled]")).toHaveLength(0);
    expect(container.textContent).not.toContain("file uploads");
  });

  it("renders nothing whatsoever, not an empty wrapper", async () => {
    const container = await mount([], conversation(), handlers());

    expect(all(container, "button")).toHaveLength(0);
  });
});

describe("the label and the who/when note", () => {
  it("offers to grant, with no note, when the conversation carries no grant", async () => {
    const container = await mount(
      [ATTACHMENT_UPLOAD_GRANT_PERMISSION],
      conversation({ hasAttachmentUploadGrant: false }),
      handlers(),
    );

    expect(byText(container, "button", "Allow file uploads")).not.toBeNull();
    expect(container.textContent).not.toContain("Granted by");
  });

  it("offers to revoke, and names the operator, when granted by a named operator", async () => {
    const container = await mount(
      [ATTACHMENT_UPLOAD_GRANT_PERMISSION],
      conversation({
        hasAttachmentUploadGrant: true,
        attachmentUploadGrantedAt: "2026-09-09T09:00:00+00:00",
        attachmentUploadGrantedByOperatorId: OPERATOR_ID,
      }),
      handlers(),
    );

    expect(byText(container, "button", "Revoke file uploads")).not.toBeNull();
    expect(container.textContent).toContain("Granted by an operator");
  });

  // `23-78`: a grant seeded from `WidgetConfig.AllowAttachmentUploadsByDefault` at conversation
  // creation carries no operator id (`Conversation.Start`'s own remarks: a tenant default is not an
  // operator's own act) - the note must say so rather than silently reading like an operator's own
  // decision.
  it("offers to revoke, and names the tenant default, when granted with no operator attribution", async () => {
    const container = await mount(
      [ATTACHMENT_UPLOAD_GRANT_PERMISSION],
      conversation({
        hasAttachmentUploadGrant: true,
        attachmentUploadGrantedAt: "2026-09-09T09:00:00+00:00",
        attachmentUploadGrantedByOperatorId: null,
      }),
      handlers(),
    );

    expect(byText(container, "button", "Revoke file uploads")).not.toBeNull();
    expect(container.textContent).toContain("Granted by this site’s own default");
    expect(container.textContent).not.toContain("Granted by an operator");
  });
});

describe("pressing the toggle", () => {
  it("grants once, and tells the page, from the ungranted state", async () => {
    const h = handlers();
    const container = await mount([ATTACHMENT_UPLOAD_GRANT_PERMISSION], conversation({ hasAttachmentUploadGrant: false }), h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Allow file uploads").click());

    expect(h.onGrant).toHaveBeenCalledTimes(1);
    expect(h.onRevoke).not.toHaveBeenCalled();
    expect(h.onChanged).toHaveBeenCalledTimes(1);
  });

  it("revokes once, and tells the page, from the granted state", async () => {
    const h = handlers();
    const container = await mount(
      [ATTACHMENT_UPLOAD_GRANT_PERMISSION],
      conversation({ hasAttachmentUploadGrant: true, attachmentUploadGrantedAt: "2026-09-09T09:00:00+00:00" }),
      h,
    );

    await interact(() => byText<HTMLButtonElement>(container, "button", "Revoke file uploads").click());

    expect(h.onRevoke).toHaveBeenCalledTimes(1);
    expect(h.onGrant).not.toHaveBeenCalled();
    expect(h.onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows a message and does not tell the page, on failure", async () => {
    const h = handlers(() => Promise.reject(new ApiProblemError("Conversation.Forbidden", "server wording", 403)));
    const container = await mount([ATTACHMENT_UPLOAD_GRANT_PERMISSION], conversation({ hasAttachmentUploadGrant: false }), h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Allow file uploads").click());

    expect(container.textContent).toContain("server wording");
    expect(h.onChanged).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-ApiProblemError failure", async () => {
    const h = handlers(() => Promise.reject(new Error("boom")));
    const container = await mount([ATTACHMENT_UPLOAD_GRANT_PERMISSION], conversation({ hasAttachmentUploadGrant: false }), h);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Allow file uploads").click());

    expect(container.textContent).toContain("Could not change the upload permission");
    expect(container.textContent).not.toContain("boom");
  });
});
