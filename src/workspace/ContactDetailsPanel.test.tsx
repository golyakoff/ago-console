import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetailsPanel } from "./ContactDetailsPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, flush, interact, one, render, renderSync, unmount } from "../testing/dom.js";

/** `14-14`. The same hand-made-permissions-context shape `ChannelIdentitiesPanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish. */
const contactDetailsApi = vi.hoisted(() => ({
  fetchContactDetails: vi.fn(),
  editContactDetail: vi.fn(),
  setContactDetailAssessment: vi.fn(),
  revealContactDetail: vi.fn(),
}));

vi.mock("../api/contactDetailsApi.js", () => contactDetailsApi);

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

// `WidgetConfigPage.test.tsx`'s own precedent: a direct `.value = x` assignment is swallowed by
// React's tracked setter as "no change", so no `onChange` ever fires - going through the prototype's
// own setter, then dispatching a real "input" event, is what makes it real.
function setTextValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function panel(conversationId: string, permissions: string[]) {
  return (
    <Permitted permissions={permissions}>
      <ContactDetailsPanel conversationId={conversationId} accessToken="token" />
    </Permitted>
  );
}

async function mount(permissions: string[]) {
  return render(panel(CONVERSATION_ID, permissions));
}

function detail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "id-1",
    kind: "Phone",
    value: "+1 555 0100",
    recordedByOperatorId: "op-1",
    source: "Operator",
    verified: false,
    recordedAt: "x",
    masked: false,
    assessment: "Unset",
    ...overrides,
  };
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

  it("lists details but offers no edit/confirm/invalid controls to a read-only operator", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Phone");
    expect(container.textContent).toContain("+1 555 0100");
    expect(all(container, "button")).toHaveLength(0);
  });

  it("offers Edit and Confirm/Mark invalid to an operator holding conversation:send", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Edit")).not.toBeNull();
    expect(byText(container, "button", "Confirm")).not.toBeNull();
    expect(byText(container, "button", "Mark invalid")).not.toBeNull();
  });

  it("never offers a Delete action or a record form - both are gone (25-58)", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Delete")).toBeNull();
    expect(all(container, "form")).toHaveLength(0);
    expect(all(container, "select")).toHaveLength(0);
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

/** `25-58`/`25-62`: real Russian/English pill labels, not the raw wire kind - and, specifically,
 * `Name` reads as exactly that (`Domain.VisitorContactDetailKind.Name`'s own remarks: the visitor's
 * own name, typed into the widget's own contact-capture form - this kind's one real writer). */
describe("kind pill labels (25-58)", () => {
  it("renders a real label for Phone, Email and Name, never the raw wire value verbatim as an unlabelled string", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ id: "id-1", kind: "Phone", value: "+1 555 0100" }),
      detail({ id: "id-2", kind: "Email", value: "visitor@example.com", assessment: "Unset" }),
      detail({ id: "id-3", kind: "Name", value: "prefers to be called Alex" }),
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Phone");
    expect(container.textContent).toContain("Email");
    expect(container.textContent).toContain("Name");
  });

  it("never offers a confirm/mark-invalid action on a Name row, even with conversation:send", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ id: "id-3", kind: "Name", value: "prefers to be called Alex" }),
    ]);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Confirm")).toBeNull();
    expect(byText(container, "button", "Mark invalid")).toBeNull();
    // Edit is still offered - a name is taken on trust, but is still correctable.
    expect(byText(container, "button", "Edit")).not.toBeNull();
  });
});

describe("editing a contact detail (25-58)", () => {
  it("shows an input pre-filled with the current value, and Save/Cancel, once Edit is clicked", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit").click());

    const input = one<HTMLInputElement>(container, "input");
    expect(input.value).toBe("+1 555 0100");
    expect(byText(container, "button", "Save")).not.toBeNull();
    expect(byText(container, "button", "Cancel")).not.toBeNull();
  });

  it("saves the corrected value in place and leaves edit mode", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);
    contactDetailsApi.editContactDetail.mockResolvedValue(detail({ value: "+1 555 0199" }));

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit").click());
    const input = one<HTMLInputElement>(container, "input");
    await interact(() => setTextValue(input, "+1 555 0199"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save").click());

    expect(contactDetailsApi.editContactDetail).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1", "+1 555 0199");
    expect(container.textContent).toContain("+1 555 0199");
    expect(all(container, "input")).toHaveLength(0);
  });

  it("cancels without calling the API, restoring the original value", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit").click());
    const input = one<HTMLInputElement>(container, "input");
    await interact(() => setTextValue(input, "garbage"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Cancel").click());

    expect(contactDetailsApi.editContactDetail).not.toHaveBeenCalled();
    expect(container.textContent).toContain("+1 555 0100");
    expect(all(container, "input")).toHaveLength(0);
  });

  it("shows an error and stays in edit mode when saving fails", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);
    contactDetailsApi.editContactDetail.mockRejectedValue(
      new ApiProblemError("VisitorContactDetail.Invalid", "server wording", 400),
    );

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit").click());
    const input = one<HTMLInputElement>(container, "input");
    await interact(() => setTextValue(input, "not empty"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(one<HTMLInputElement>(container, "input").value).toBe("not empty");
  });

  /** The backlog item's own explicit warning: editing changes the existing row, not the source - a
   * visitor-submitted entry corrected by an operator must stay attributed to the visitor. */
  it("never changes the Source badge when an operator edits a visitor-submitted row", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ recordedByOperatorId: null, source: "Visitor" }),
    ]);
    contactDetailsApi.editContactDetail.mockResolvedValue(
      detail({ recordedByOperatorId: null, source: "Visitor", value: "+1 555 0188" }),
    );

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Edit").click());
    const input = one<HTMLInputElement>(container, "input");
    await interact(() => setTextValue(input, "+1 555 0188"));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Save").click());

    expect(container.textContent).toContain("Visitor");
    expect(container.textContent).not.toContain("Operator");
  });
});

describe("confirming or marking a contact detail invalid (25-58)", () => {
  it("confirms a Phone row, replacing the action with a Confirmed badge and only Mark invalid remains", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);
    contactDetailsApi.setContactDetailAssessment.mockResolvedValue(detail({ assessment: "Confirmed" }));

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm").click());

    expect(contactDetailsApi.setContactDetailAssessment).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1", "Confirmed");
    expect(container.textContent).toContain("Confirmed");
    expect(byText(container, "button", "Confirm")).toBeNull();
    expect(byText(container, "button", "Mark invalid")).not.toBeNull();
  });

  it("marks an Email row invalid, replacing the action with an Invalid badge and only Confirm remains", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail({ kind: "Email", value: "visitor@example.com" })]);
    contactDetailsApi.setContactDetailAssessment.mockResolvedValue(
      detail({ kind: "Email", value: "visitor@example.com", assessment: "Invalid" }),
    );

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Mark invalid").click());

    expect(contactDetailsApi.setContactDetailAssessment).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1", "Invalid");
    expect(container.textContent).toContain("Invalid");
    expect(byText(container, "button", "Mark invalid")).toBeNull();
    expect(byText(container, "button", "Confirm")).not.toBeNull();
  });

  it("shows an error, and leaves the assessment unset, when the write fails", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);
    contactDetailsApi.setContactDetailAssessment.mockRejectedValue(
      new ApiProblemError("VisitorContactDetail.NotFound", "server wording", 404),
    );

    const container = await mount(["conversation:read", "conversation:send"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Confirm").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).not.toContain("Confirmed");
  });
});

/**
 * `23-09`: the panel's whole reason for reading `source` at all - see this component's own doc
 * comment for why the caption alone can no longer carry the distinction. A null `recordedByOperatorId`
 * on the visitor-sourced row is deliberate (`ContactDetailDto`'s own remarks) and is never rendered as
 * an empty cell or a fabricated name - these tests prove that by never asserting anything about the id
 * at all, only about the human-readable badges.
 */
describe("distinguishing who supplied a contact detail (23-09)", () => {
  it("badges an operator-recorded row as Operator", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Operator");
  });

  it("badges a visitor-submitted row as Visitor, with no operator id anywhere in the rendered text", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ id: "id-2", value: "+1 555 0177", recordedByOperatorId: null, source: "Visitor" }),
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Visitor");
    // The strongest form of "never rendered as an empty cell or a fabricated name": nothing here
    // even attempts to render the id, so there is nothing for a null value to break.
    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toContain("undefined");
  });

  it("distinguishes both rows at once when a visitor and an operator each recorded one", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ id: "id-1", value: "+1 555 0100" }),
      detail({ id: "id-2", value: "+1 555 0177", recordedByOperatorId: null, source: "Visitor" }),
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("+1 555 0100");
    expect(container.textContent).toContain("+1 555 0177");
    expect(container.textContent).toContain("Operator");
    expect(container.textContent).toContain("Visitor");
  });
});

describe("revealing a masked contact detail (23-11)", () => {
  it("offers a Reveal button, not the real value, when the site's rung masks the list read", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ value: "+1••••••00", masked: true }),
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("+1••••••00");
    expect(container.textContent).not.toContain("+1 555 0100");
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("does not offer a Reveal button when the row already carries the real value", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail({ masked: false })]);

    const container = await mount(["conversation:read"]);

    expect(all(container, "button")).toHaveLength(0);
  });

  it("does not offer Edit while a row is masked - an operator cannot correct a value they cannot read", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail({ value: "+1••••••00", masked: true })]);

    const container = await mount(["conversation:read", "conversation:send"]);

    expect(byText(container, "button", "Edit")).toBeNull();
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("replaces the masked row with the server's own unmasked response on Reveal", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ value: "+1••••••00", masked: true }),
    ]);
    contactDetailsApi.revealContactDetail.mockResolvedValue(detail({ value: "+1 555 0100", masked: false }));

    const container = await mount(["conversation:read"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal").click());

    expect(contactDetailsApi.revealContactDetail).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1");
    expect(container.textContent).toContain("+1 555 0100");
    expect(container.textContent).not.toContain("+1••••••00");
    expect(all(container, "button")).toHaveLength(0);
  });

  it("shows an error, and keeps the row masked, when the reveal fails", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      detail({ value: "+1••••••00", masked: true }),
    ]);
    contactDetailsApi.revealContactDetail.mockRejectedValue(
      new ApiProblemError("VisitorContactDetail.NotFound", "server wording", 404),
    );

    const container = await mount(["conversation:read"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).toContain("+1••••••00");
  });

  it("an operator without conversation:read never sees a Reveal button, matching the whole panel's own absence", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(contactDetailsApi.fetchContactDetails).not.toHaveBeenCalled();
  });
});

/**
 * `23-100`: `VisitorPanel` renders this panel with no `key={conversationId}` - see
 * `ChannelIdentitiesPanel.test.tsx`'s identical describe block for why `renderSync` (commits without
 * running any passive effect) is what makes this a real fails-before check rather than "the same
 * behaviour, refactored": against the pre-`23-100` code the reset lived inside the effect, so this
 * commit would still carry the previous conversation's details; against the render-phase version the
 * reset already happened before this same commit.
 */
describe("switching conversations (23-100)", () => {
  it("clears the previous conversation's contact details before the fetch effect could have run", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([detail()]);

    const container = await mount(["conversation:read"]);
    expect(container.textContent).toContain("+1 555 0100");

    renderSync(panel(OTHER_CONVERSATION_ID, ["conversation:read"]));

    expect(container.textContent).not.toContain("+1 555 0100");

    await flush();
    expect(contactDetailsApi.fetchContactDetails).toHaveBeenLastCalledWith("token", OTHER_CONVERSATION_ID);
  });
});
