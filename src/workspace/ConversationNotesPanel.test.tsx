import { useMemo, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationNotesPanel } from "./ConversationNotesPanel.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { PermissionsContext, type PermissionsState } from "../auth/PermissionsContext.js";
import { all, byText, flush, interact, one, render, renderSync, unmount } from "../testing/dom.js";

/**
 * `18-04`. The same hand-made-permissions-context shape `ConversationOutcomePanel.test.tsx`/
 * `ConversationTagsPanel.test.tsx` already establish - what is under test is this panel's own gating
 * and interaction, not the path from `GET /api/v1/operators/me` to a rendered permission set.
 *
 * `23-100`: this file did not exist before this item - `ConversationNotesPanel` had no dedicated test
 * at all, so the `switching conversations` case below is not only this item's own fails-before proof
 * (`ChannelIdentitiesPanel.test.tsx`'s identical describe block explains the `renderSync` technique);
 * it is the first test this panel has ever had for the reset-on-`conversationId`-change behaviour its
 * effect always had, `23-96`-vintage or not.
 */
const notesApi = vi.hoisted(() => ({
  fetchConversationNotes: vi.fn(),
  addConversationNote: vi.fn(),
}));

vi.mock("../api/notesApi.js", () => notesApi);

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
      <ConversationNotesPanel conversationId={conversationId} timeZone={null} accessToken="token" />
    </Permitted>
  );
}

async function mount(permissions: string[]): Promise<HTMLElement> {
  return render(panel(CONVERSATION_ID, permissions));
}

// `ContactDetailsPanel.test.tsx`'s own `setTextValue` precedent, for a `<textarea>` rather than an
// `<input>`: a direct `.value = x` assignment is swallowed by React's tracked setter as "no change",
// so no `onChange` ever fires - going through the prototype's own setter, then dispatching a real
// "input" event, is what makes it real.
function setTextareaValue(element: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  notesApi.fetchConversationNotes.mockResolvedValue([]);
});

afterEach(async () => {
  await unmount();
});

describe("who is offered the panel", () => {
  it("renders nothing at all for an operator without conversation:read", async () => {
    const container = await mount([]);

    expect(container.textContent).toBe("");
    expect(notesApi.fetchConversationNotes).not.toHaveBeenCalled();
  });

  it("lists notes but offers no add form to an operator without conversation:note_write", async () => {
    notesApi.fetchConversationNotes.mockResolvedValue([
      { id: "note-1", body: "Called back, no answer.", createdAt: "2026-08-30T12:00:00Z" },
    ]);

    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("Called back, no answer.");
    expect(all(container, "textarea")).toHaveLength(0);
    expect(all(container, "form")).toHaveLength(0);
  });

  it("offers the add form to an operator holding conversation:note_write", async () => {
    const container = await mount(["conversation:read", "conversation:note_write"]);

    expect(one(container, "textarea")).not.toBeNull();
    expect(byText(container, "button", "Add note")).not.toBeNull();
  });
});

describe("listing notes", () => {
  it("shows the empty state when nothing has been noted yet", async () => {
    const container = await mount(["conversation:read"]);

    expect(container.textContent).toContain("No notes yet.");
  });

  it("shows a load error rather than a silently empty panel", async () => {
    notesApi.fetchConversationNotes.mockRejectedValue(new Error("network down"));

    const container = await mount(["conversation:read"]);

    expect(one(container, '[role="alert"]').textContent).toContain("network down");
  });
});

describe("adding a note", () => {
  it("appends the new note to the list and clears the draft", async () => {
    notesApi.addConversationNote.mockResolvedValue({
      id: "note-2",
      body: "Prefers email over phone.",
      createdAt: "2026-08-30T12:05:00Z",
    });

    const container = await mount(["conversation:read", "conversation:note_write"]);
    const textarea = one<HTMLTextAreaElement>(container, "textarea");

    await interact(() => setTextareaValue(textarea, "Prefers email over phone."));
    await interact(() => byText<HTMLButtonElement>(container, "button", "Add note").click());

    expect(notesApi.addConversationNote).toHaveBeenCalledWith("token", CONVERSATION_ID, "Prefers email over phone.");
    expect(container.textContent).toContain("Prefers email over phone.");
    expect(textarea.value).toBe("");
  });

  it("shows an error, and leaves the list unchanged, when adding fails", async () => {
    notesApi.addConversationNote.mockRejectedValue(new ApiProblemError("Conversation.Forbidden", "server wording", 403));

    const container = await mount(["conversation:read", "conversation:note_write"]);
    const textarea = one<HTMLTextAreaElement>(container, "textarea");
    await interact(() => setTextareaValue(textarea, "not empty"));

    await interact(() => byText<HTMLButtonElement>(container, "button", "Add note").click());

    expect(one(container, '[role="alert"]').textContent).toContain("server wording");
    expect(container.textContent).toContain("No notes yet.");
  });
});

/**
 * `23-100`: `VisitorPanel` renders this panel with no `key={conversationId}` - see
 * `ChannelIdentitiesPanel.test.tsx`'s identical describe block for why `renderSync` (commits without
 * running any passive effect) is what makes this a real fails-before check rather than "the same
 * behaviour, refactored": against the pre-`23-100` code the reset lived inside the effect, so this
 * commit would still carry the previous conversation's notes; against the render-phase version the
 * reset already happened before this same commit.
 */
describe("switching conversations (23-100)", () => {
  it("clears the previous conversation's notes before the fetch effect could have run", async () => {
    notesApi.fetchConversationNotes.mockResolvedValue([
      { id: "note-1", body: "Called back, no answer.", createdAt: "2026-08-30T12:00:00Z" },
    ]);

    const container = await mount(["conversation:read"]);
    expect(container.textContent).toContain("Called back, no answer.");

    renderSync(panel(OTHER_CONVERSATION_ID, ["conversation:read"]));

    expect(container.textContent).not.toContain("Called back, no answer.");

    await flush();
    expect(notesApi.fetchConversationNotes).toHaveBeenLastCalledWith("token", OTHER_CONVERSATION_ID);
  });
});
