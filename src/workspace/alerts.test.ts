import { describe, expect, it } from "vitest";
import {
  ALERTS_OFF,
  alertTextFor,
  decideAlert,
  readAlertSettings,
  writeAlertSettings,
  type AlertContext,
  type AlertSettings,
} from "./alerts.js";

/**
 * `18-05`: when the console is allowed to be loud.
 *
 * The middle block is the one that matters. The item's requirement is "nothing fires for a
 * conversation the operator is already looking at", and the two tests named *the case that
 * distinguishes* are there because both obvious implementations pass a naive test and fail a real
 * operator - one by staying silent about a conversation they cannot see, the other by shouting about
 * one they are reading.
 */
const BOTH_ON: AlertSettings = { notifications: true, sound: true };

function context(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    conversationId: "open-one",
    openConversationId: "open-one",
    documentVisible: true,
    settings: BOTH_ON,
    permission: "granted",
    ...overrides,
  };
}

describe("what 'already looking at' means", () => {
  it("is silent for the conversation open on a visible tab", () => {
    expect(decideAlert(context())).toEqual({ notify: false, sound: false });
  });

  it("still alerts when the tab is visible but a DIFFERENT conversation is open", () => {
    // **The case that fails a "the tab is focused" implementation.** An operator answering visitor A
    // is not looking at visitor B, and a message from B is precisely what they need told about.
    const decision = decideAlert(context({ conversationId: "another-one", documentVisible: true }));

    expect(decision).toEqual({ notify: true, sound: true });
  });

  it("still alerts when the right conversation is open but the tab is hidden", () => {
    // **The case that fails a "the conversation is open" implementation** - and the case desktop
    // notifications exist for at all. The thread is on screen in a sense no human would recognise.
    const decision = decideAlert(context({ documentVisible: false }));

    expect(decision).toEqual({ notify: true, sound: true });
  });

  it("alerts when nothing is open at all", () => {
    expect(decideAlert(context({ openConversationId: null }))).toEqual({ notify: true, sound: true });
  });
});

describe("the two switches", () => {
  it("are independent of each other", () => {
    const soundOnly = decideAlert(
      context({ conversationId: "another-one", settings: { notifications: false, sound: true } }),
    );
    const notifyOnly = decideAlert(
      context({ conversationId: "another-one", settings: { notifications: true, sound: false } }),
    );

    expect(soundOnly).toEqual({ notify: false, sound: true });
    expect(notifyOnly).toEqual({ notify: true, sound: false });
  });

  it("are both silent by default", () => {
    const decision = decideAlert(context({ conversationId: "another-one", settings: ALERTS_OFF }));

    expect(decision).toEqual({ notify: false, sound: false });
  });

  it("lets the sound work even where notifications are denied or unsupported", () => {
    // The permission gates one switch. Silencing a sound the operator asked for because the browser
    // blocked a different feature would be the console punishing them for the browser's answer.
    for (const permission of ["denied", "unsupported", "default"] as const) {
      const decision = decideAlert(context({ conversationId: "another-one", permission }));
      expect(decision).toEqual({ notify: false, sound: true });
    }
  });
});

describe("what a notification says", () => {
  it("never carries the message body", () => {
    // A privacy decision, not a design one: a notification is drawn over whatever is on screen, in a
    // room that may have customers in it, and on some platforms it survives in a notification centre
    // nothing in this system can erase.
    const message = alertTextFor("message", "8f14e45f-ea1c-4c3a-9b2d-000000000000");

    expect(message.title).toBe("New message");
    expect(message.body).toBe("Visitor 8f14e45f sent a message.");
    expect(message.body).not.toContain("ea1c");
  });

  it("copes with an unknown visitor", () => {
    // `ConversationAssignedDto` carries no visitor id, so this is the ordinary case for an
    // assignment rather than a defensive branch.
    expect(alertTextFor("assigned", null)).toEqual({
      title: "New conversation assigned",
      body: "A visitor is waiting for you.",
    });
  });
});

describe("remembering the operator's choice", () => {
  /** A closure rather than an object with `this`: the two methods have to share one value, and a
   * `this`-typed object literal is untyped under this repository's own lint rules. */
  function fakeStorage(initial: string | null): Pick<Storage, "getItem" | "setItem"> {
    let value = initial;

    return {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
  }

  it("round-trips both switches", () => {
    const storage = fakeStorage(null);
    writeAlertSettings(storage, BOTH_ON);

    expect(readAlertSettings(storage)).toEqual(BOTH_ON);
  });

  it("is off when nothing was ever stored", () => {
    expect(readAlertSettings(fakeStorage(null))).toEqual(ALERTS_OFF);
  });

  it("is off for a corrupt value rather than coercing it", () => {
    // `Boolean(value.notifications)` on unknown JSON is how a stray truthy string turns into a
    // notification the operator never enabled.
    expect(readAlertSettings(fakeStorage("not json at all"))).toEqual(ALERTS_OFF);
    expect(readAlertSettings(fakeStorage('{"notifications":"yes","sound":1}'))).toEqual(ALERTS_OFF);
    expect(readAlertSettings(fakeStorage("null"))).toEqual(ALERTS_OFF);
  });

  it("is off, and does not throw, when storage itself is unavailable", () => {
    // Safari's private mode, a partitioned third-party context, a browser told to block site data.
    // A preference that cannot be read is a preference that is off, not a workspace that fails.
    const hostile: Pick<Storage, "getItem" | "setItem"> = {
      getItem() {
        throw new Error("access denied");
      },
      setItem() {
        throw new Error("access denied");
      },
    };

    expect(readAlertSettings(hostile)).toEqual(ALERTS_OFF);
    expect(() => writeAlertSettings(hostile, BOTH_ON)).not.toThrow();
    expect(readAlertSettings(null)).toEqual(ALERTS_OFF);
  });
});
