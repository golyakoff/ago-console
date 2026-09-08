import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetailsPanel, type PromotedContactDraft } from "./ContactDetailsPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, flush, interact, one, render, renderSync, unmount } from "../testing/dom.js";

/** `14-14`. The same hand-made-permissions-context shape `ChannelIdentitiesPanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish. */
const contactDetailsApi = vi.hoisted(() => ({
  fetchContactDetails: vi.fn(),
  recordContactDetail: vi.fn(),
  deleteContactDetail: vi.fn(),
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

function panel(conversationId: string, permissions: string[], contactDraft?: PromotedContactDraft | null) {
  return (
    <Permitted permissions={permissions}>
      <ContactDetailsPanel conversationId={conversationId} accessToken="token" contactDraft={contactDraft} />
    </Permitted>
  );
}

async function mount(permissions: string[], contactDraft?: PromotedContactDraft | null) {
  return render(panel(CONVERSATION_ID, permissions, contactDraft));
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
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", source: "Operator", verified: false, recordedAt: "x" },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Phone");
    expect(container.textContent).toContain("+1 555 0100");
    expect(all(container, "button")).toHaveLength(0);
    expect(all(container, "form")).toHaveLength(0);
  });

  it("offers the record form and a delete button per row to an operator holding conversation:send", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", source: "Operator", verified: false, recordedAt: "x" },
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
      source: "Operator",
      verified: false,
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
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", source: "Operator", verified: false, recordedAt: "x" },
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
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", source: "Operator", verified: false, recordedAt: "x" },
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

/**
 * `23-09`: the panel's whole reason for reading `source`/`verified` at all - see this component's
 * own doc comment for why the caption alone can no longer carry the distinction. A null
 * `recordedByOperatorId` on the visitor-sourced row is deliberate (`ContactDetailDto`'s own remarks)
 * and is never rendered as an empty cell or a fabricated name - these tests prove that by never
 * asserting anything about the id at all, only about the human-readable badges.
 */
describe("distinguishing who supplied a contact detail (23-09)", () => {
  it("badges an operator-recorded row as Operator and Unverified", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      {
        id: "id-1",
        kind: "Phone",
        value: "+1 555 0100",
        recordedByOperatorId: "op-1",
        source: "Operator",
        verified: false,
        recordedAt: "x",
      },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Operator");
    expect(container.textContent).toContain("Unverified");
  });

  it("badges a visitor-submitted row as Visitor, with no operator id anywhere in the rendered text", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      {
        id: "id-2",
        kind: "Phone",
        value: "+1 555 0177",
        recordedByOperatorId: null,
        source: "Visitor",
        verified: false,
        recordedAt: "x",
      },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Visitor");
    expect(container.textContent).toContain("Unverified");
    // The strongest form of "never rendered as an empty cell or a fabricated name": nothing here
    // even attempts to render the id, so there is nothing for a null value to break.
    expect(container.textContent).not.toContain("null");
    expect(container.textContent).not.toContain("undefined");
  });

  it("distinguishes both rows at once when a visitor and an operator each recorded one", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      {
        id: "id-1",
        kind: "Phone",
        value: "+1 555 0100",
        recordedByOperatorId: "op-1",
        source: "Operator",
        verified: false,
        recordedAt: "x",
      },
      {
        id: "id-2",
        kind: "Phone",
        value: "+1 555 0177",
        recordedByOperatorId: null,
        source: "Visitor",
        verified: false,
        recordedAt: "y",
      },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("+1 555 0100");
    expect(container.textContent).toContain("+1 555 0177");
    expect(container.textContent).toContain("Operator");
    expect(container.textContent).toContain("Visitor");
  });
});

function setSelectValue(element: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * `23-10`: `Thread`'s "Add to contact details" act, arriving here as `contactDraft` - `Thread.test.tsx`
 * covers the selection itself; this file covers what this panel does once a promoted value reaches it.
 * The one fact these tests exist to pin down is the backlog item's own: **the operator confirms,
 * nothing is written by the act of selecting** - so every test that only mounts or updates
 * `contactDraft` asserts `recordContactDetail` was never called, and the one test that does expect a
 * write is the one that also clicks **Record**.
 */
describe("revealing a masked contact detail (23-11)", () => {
  it("offers a Reveal button, not the real value, when the site's rung masks the list read", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1••••••00", recordedByOperatorId: "op-1", recordedAt: "x", masked: true },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("+1••••••00");
    expect(container.textContent).not.toContain("+1 555 0100");
    expect(byText(container, "button", "Reveal")).not.toBeNull();
  });

  it("does not offer a Reveal button when the row already carries the real value", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", recordedAt: "x", masked: false },
    ]);

    const container = await mount(["conversation:read"]);

    expect(all(container, "button")).toHaveLength(0);
  });

  it("replaces the masked row with the server's own unmasked response on Reveal", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1••••••00", recordedByOperatorId: "op-1", recordedAt: "x", masked: true },
    ]);
    contactDetailsApi.revealContactDetail.mockResolvedValue({
      id: "id-1",
      kind: "Phone",
      value: "+1 555 0100",
      recordedByOperatorId: "op-1",
      recordedAt: "x",
      masked: false,
    });

    const container = await mount(["conversation:read"]);
    await interact(() => byText<HTMLButtonElement>(container, "button", "Reveal").click());

    expect(contactDetailsApi.revealContactDetail).toHaveBeenCalledWith("token", CONVERSATION_ID, "id-1");
    expect(container.textContent).toContain("+1 555 0100");
    expect(container.textContent).not.toContain("+1••••••00");
    expect(all(container, "button")).toHaveLength(0);
  });

  it("shows an error, and keeps the row masked, when the reveal fails", async () => {
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1••••••00", recordedByOperatorId: "op-1", recordedAt: "x", masked: true },
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


describe("a promoted selection (23-10)", () => {
  it("pre-fills the kind as Phone and the value verbatim, and focuses the value field", async () => {
    const container = await mount(["conversation:read", "conversation:send"]);
    const select = one<HTMLSelectElement>(container, "select");

    // Proves the effect actually *sets* the kind rather than merely leaving the default alone -
    // without this the test would pass even if `contactDraft` were never read at all, since "Phone"
    // is also `CONTACT_DETAIL_KINDS[0]`.
    await interact(() => setSelectValue(select, "Other"));
    expect(select.value).toBe("Other");

    await mount(["conversation:read", "conversation:send"], { value: "+7 000 000-00-01", token: 1 });

    const input = one<HTMLInputElement>(container, "input");
    expect(select.value).toBe("Phone");
    expect(input.value).toBe("+7 000 000-00-01");
    expect(document.activeElement).toBe(input);
    expect(contactDetailsApi.recordContactDetail).not.toHaveBeenCalled();
  });

  it("re-applies on a second promotion even if the operator had cleared the field in between", async () => {
    const container = await mount(["conversation:read", "conversation:send"], {
      value: "+7 000 000-00-01",
      token: 1,
    });
    const input = one<HTMLInputElement>(container, "input");
    expect(input.value).toBe("+7 000 000-00-01");

    await interact(() => setTextValue(input, ""));
    expect(input.value).toBe("");

    // Same text, a new token - `PromotedContactDraft`'s own doc comment explains why the token, not
    // the text, is what the effect keys on.
    await mount(["conversation:read", "conversation:send"], { value: "+7 000 000-00-01", token: 2 });

    expect(input.value).toBe("+7 000 000-00-01");
  });

  it("confirming records exactly one row, with the promoted kind and value", async () => {
    contactDetailsApi.recordContactDetail.mockResolvedValue({
      id: "id-3",
      kind: "Phone",
      value: "+7 000 000-00-01",
      recordedByOperatorId: "op-1",
      source: "Operator",
      verified: false,
      recordedAt: "2026-09-04T12:00:00Z",
    });

    const container = await mount(["conversation:read", "conversation:send"], {
      value: "+7 000 000-00-01",
      token: 1,
    });

    await interact(() => byText<HTMLButtonElement>(container, "button", "Record").click());

    expect(contactDetailsApi.recordContactDetail).toHaveBeenCalledTimes(1);
    expect(contactDetailsApi.recordContactDetail).toHaveBeenCalledWith(
      "token",
      CONVERSATION_ID,
      "Phone",
      "+7 000 000-00-01",
    );
    expect(container.textContent).toContain("+7 000 000-00-01");
  });

  it("does not pre-fill anything, and does not record, for an operator without conversation:send", async () => {
    const container = await mount(["conversation:read"], { value: "+7 000 000-00-01", token: 1 });

    expect(all(container, "input")).toHaveLength(0);
    expect(all(container, "form")).toHaveLength(0);
    expect(contactDetailsApi.recordContactDetail).not.toHaveBeenCalled();
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
    contactDetailsApi.fetchContactDetails.mockResolvedValue([
      { id: "id-1", kind: "Phone", value: "+1 555 0100", recordedByOperatorId: "op-1", source: "Operator", verified: false, recordedAt: "x" },
    ]);

    const container = await mount(["conversation:read"]);
    expect(container.textContent).toContain("+1 555 0100");

    renderSync(panel(OTHER_CONVERSATION_ID, ["conversation:read"]));

    expect(container.textContent).not.toContain("+1 555 0100");

    await flush();
    expect(contactDetailsApi.fetchContactDetails).toHaveBeenLastCalledWith("token", OTHER_CONVERSATION_ID);
  });
});
