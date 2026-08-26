/**
 * `18-05`: when the console is allowed to be loud, and about what.
 *
 * `11-06` decided how a new assignment announces itself *inside* the screen - a `New` badge, the
 * unread count, a polite live region, and deliberately nothing that moves the operator. This is the
 * half that reaches the operator when they are **not** looking at the screen, and the item is
 * explicit that it extends that attention model rather than inventing a second one.
 *
 * Everything decision-shaped lives here as pure functions. The effectful half - constructing a
 * `Notification`, making a sound - is `useAlerts.ts`, and the split is what makes the two rules this
 * item actually turns on ("off until asked for", "silent for what you are already reading") testable
 * without a browser that can do either.
 */

/**
 * The browser's own answer, plus the state the `Notification` API does not have a value for.
 *
 * <b>Four states, not the API's three.</b> `Notification` is simply absent on iOS Safari and on any
 * page served over plain HTTP that is not `localhost`, and `typeof Notification === "undefined"` is
 * not something `Notification.permission` can tell you - reading it would throw. A console that
 * assumed three states would crash on the fourth.
 *
 * <b>`denied` is not recoverable from this page and the UI must say so.</b> `requestPermission()`
 * resolves immediately with `"denied"` and shows nothing - no prompt, no error. A switch that
 * silently does nothing is worse than no switch, which is why `denied` renders a sentence instead of
 * a control.
 */
export type NotificationPermissionState = "unsupported" | "default" | "granted" | "denied";

export interface AlertSettings {
  /** A desktop notification. Needs the browser's permission as well as this switch. */
  readonly notifications: boolean;
  /** A short sound. Needs no permission, and is **a separate switch on purpose**: the item's own
   * reasoning is that the people who want one frequently do not want the other. An operator in an
   * open-plan office wants the notification and not the sound; one with the tab on a second monitor
   * wants the sound and not a card over their work. */
  readonly sound: boolean;
}

/** Both off. The item is explicit about notifications ("off until the operator turns them on"), and
 * sound follows for the same reason: a product that makes a noise nobody asked for on first load is
 * a product people mute at the operating system. */
export const ALERTS_OFF: AlertSettings = { notifications: false, sound: false };

const STORAGE_KEY = "ago.console.alerts";

/**
 * Reads the operator's own choice back.
 *
 * <b>Failure-tolerant, never throwing.</b> `localStorage` throws on access in a few real situations -
 * Safari's private mode historically, a page in a partitioned third-party context, a browser
 * configured to block site data - and a preference that cannot be read is a preference that is off,
 * not a workspace that fails to render. The same call `ago-widget`'s own storage layer makes.
 *
 * <b>Off is also what a corrupt value means.</b> Anything that is not exactly the two booleans this
 * module wrote is discarded rather than coerced: `Boolean(value.notifications)` on unknown JSON is
 * how a stray truthy string turns into a notification the operator never enabled.
 */
export function readAlertSettings(storage: Pick<Storage, "getItem" | "setItem"> | null): AlertSettings {
  if (storage === null) {
    return ALERTS_OFF;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return ALERTS_OFF;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return ALERTS_OFF;
    }

    const record = parsed as Record<string, unknown>;
    return {
      notifications: record["notifications"] === true,
      sound: record["sound"] === true,
    };
  } catch {
    return ALERTS_OFF;
  }
}

export function writeAlertSettings(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  settings: AlertSettings,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A preference that could not be saved still applies for this tab. Losing it on reload is a
    // smaller failure than refusing to change it.
  }
}

/** Everything the decision below depends on, gathered so the rule is one readable expression. */
export interface AlertContext {
  /** Which conversation the event is about. */
  readonly conversationId: string;
  /** Which conversation this tab currently has open, if any. */
  readonly openConversationId: string | null;
  /** `document.visibilityState === "visible"`. Passed in rather than read, so the rule is a pure
   * function and the two cases below can both be written as tests. */
  readonly documentVisible: boolean;
  readonly settings: AlertSettings;
  readonly permission: NotificationPermissionState;
}

export interface AlertDecision {
  readonly notify: boolean;
  readonly sound: boolean;
}

const SILENT: AlertDecision = { notify: false, sound: false };

/**
 * <b>"Nothing fires for a conversation the operator is already looking at."</b>
 *
 * The item's sentence, and the whole of this item's ambiguity is in the words *already looking at*.
 * It is tempting to implement as "the tab is focused", and that is wrong in both directions:
 *
 * - **The tab can be focused while a different conversation is open.** An operator answering visitor
 *   A is not looking at visitor B, and a message from B is exactly the thing they need told about.
 *   "The tab is focused" would silently swallow it - the failure this item exists to prevent.
 * - **The right conversation can be open while the tab is hidden.** An operator who alt-tabbed to a
 *   knowledge base has that thread on screen in a sense no human would recognise. "The conversation
 *   is open" alone would swallow this one, which is the case notifications are *for*.
 *
 * So *already looking at* is **both**: this tab has that conversation open **and** the document is
 * visible. Anything else is an operator who does not currently know, and gets told.
 *
 * Note what this does not try to be. `document.visibilityState` is not "the window has focus" - a
 * visible but unfocused window counts as looking, and that is deliberate: a second monitor with the
 * console on it is a screen the operator can see, and firing a card over it would be telling someone
 * something they are already reading.
 */
export function decideAlert(context: AlertContext): AlertDecision {
  const alreadyLookingAt = context.conversationId === context.openConversationId && context.documentVisible;
  if (alreadyLookingAt) {
    return SILENT;
  }

  return {
    // Two independent switches, and the permission gates only one of them. A denied or unsupported
    // browser must not silence the sound the operator did ask for.
    notify: context.settings.notifications && context.permission === "granted",
    sound: context.settings.sound,
  };
}

export type AlertReason = "assigned" | "message";

/**
 * What the notification says.
 *
 * <b>Never the message body</b>, and this is a privacy decision rather than a design one. A desktop
 * notification is drawn over whatever is on screen, on a machine that may be in a shop's back office
 * with customers in the room, and it survives on some platforms in a notification centre the
 * operator does not clear. `personal-data.md` treats a message body as the free-text field most
 * likely to hold something about a person; putting it there would move it somewhere nothing in this
 * system can erase it from. The visitor's short identifier is enough to know which conversation
 * needs answering, which is all a notification has to achieve - the words are one click away.
 */
export function alertTextFor(reason: AlertReason, visitorId: string | null): { title: string; body: string } {
  const who = visitorId === null ? "A visitor" : `Visitor ${visitorId.slice(0, 8)}`;

  return reason === "assigned"
    ? { title: "New conversation assigned", body: `${who} is waiting for you.` }
    : { title: "New message", body: `${who} sent a message.` };
}
