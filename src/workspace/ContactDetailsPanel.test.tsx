import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetailsPanel } from "./ContactDetailsPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, interact, one, render, unmount } from "../testing/dom.js";

/** `14-14`. The same hand-made-permissions-context shape `ChannelIdentitiesPanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish. */
const contactDetailsApi = vi.hoisted(() => ({
  fetchContactDetails: vi.fn(),
  recordContactDetail: vi.fn(),
  deleteContactDetail: vi.fn(),
}));

vi.mock("../api/contactDetailsApi.js", () => contactDetailsApi);

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

// `WidgetConfigPage.test.tsx`'s own precedent: a direct `.value = x` assignment is swallowed by
// React's tracked setter as "no change", so no `onChange` ever fires - going through the prototype's
// own setter, then dispatching a real "input" event, is what makes it real.
function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mount(permissions: string[]) {
  return render(
    <Permitted permissions={permissions}>
      <ContactDetailsPanel conversationId={CONVERSATION_ID} accessToken="token" />
    </Permitted>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  contactDetailsApi.fetchContactDetails.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the panel", () => {
  it("renders nothing at all for an operator without conversation:read", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(contactDetailsApi.fetchContactDetails).not.toHaveBeenCalled();
  });

  it("lists details but offers no record/delete controls to a read-only operator", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", recordedAt: "x" },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Phone");
    expect(container.textContent).toContain("+1 555 0100");
    expect(all(container, "button")).toHaveLength(0);
    expect(all(container, "form")).toHaveLength(0);
  });

  it("offers the record form and a delete button per row to an operator holding conversation:send", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", recordedAt: "x" },
    ]);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Record")).not.toBeNull();
    expect(byText(container, "button", "Delete")).not.toBeNull();
  });
});

describe("listing contact details", () => {
  it("shows the empty state when nothing has been recorded", async () => {
    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("No contact details recorded yet.");
  });

  it("shows a load error rather than a silently empty panel", async () => {
    contactDetailsApi.fetchContactDetails.mockRejectedValue(new Error("network down"));

    const container = await mount(["conversation:read"]);

    expect(one(container, '[role="alert"]').textContent).toContain("network down");
  });
});

describe("recording a contact detail", () => {
  it("appends the recorded detail to the list and clears the draft", async () => {
    contactDetailsApi.recordContactDetail.mockResolvedValue({
      id: "id-2",
      kind: "Phone",
      value: "+1 555 0199",
      recordedByOperatorId: "op-1",
      recordedAt: "2026-08-30T12:00:00Z",
    });

    const container = await mount(["conversation:read", "conversation:send"]);
    const input = one<HTMLInputElement>(container, "input");

    await interact(() => setTextValue(input, "+1 555 0199"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Record").click());

    expect(contactDetailsApi.recordContactDetail).toHaveBeenCalledWith("token", CONVERSATION_ID, "Phone", "+1 555 0199");
    expect(container.textContent).toContain("+1 555 0199");
    expect(input.value).toBe("");
  });

  it("shows an error, and leaves the list unchanged, when recording fails", async () => {
    contactDetailsApi.recordContactDetail.mockRejectedValue(
      new ApiProblemError("VisitorContactDetail.Invalid", "server wording", 400),
    );

    const container = await mount(["conversation:read", "conversation:send"]);
    const input = one<HTMLInputElement>(container, "input");
    await interact(() => setTextValue(input, "not empty"));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Record").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).toContain("No contact details recorded yet.");
  });
});

describe("deleting a contact detail", () => {
  it("removes the detail from the list on a successful delete", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", recordedAt: "x" },
    ]);
    contactDetailsApi.deleteContactDetail.mockResolvedValue(undefined);

    const container = await mount(["conversation:read", "conversation:send"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete").click());

    expect(contactDetailsApi.deleteContactDetail).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1");
    expect(container.textContent).not.toContain("+1 555 0100");
    expect(container.textContent).toContain("No contact details recorded yet.");
  });

  it("shows an error, and keeps the detail listed, when the delete fails", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", recordedAt: "x" },
    ]);
    contactDetailsApi.deleteContactDetail.mockRejectedValue(
      new ApiProblemError("VisitorContactDetail.NotFound", "server wording", 404),
    );

    const container = await mount(["conversation:read", "conversation:send"]);

    await interact(() => byText<HTMLButtonElement>(container, "button", "Delete").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).toContain("+1 555 0100");
  });
});
