import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALERTS_OFF,
  alertTextFor,
  decideAlert,
  readAlertSettings,
  writeAlertSettings,
  type AlertReason,
  type AlertSettings,
  type NotificationPermissionState,
} from "./alerts.js";

/**
 * `18-05`: the effectful half of the alert model - the part that actually makes a card appear and a
 * sound happen. Every *decision* it takes is `alerts.ts`'s, called from here.
 *
 * ## The permission prompt, and the one rule this file exists to keep
 *
 * <b>`Notification.requestPermission()` is called from exactly one place: `enableNotifications`,
 * which is only ever reached from a click.</b> It is never called on mount, never from an effect,
 * and never as a side effect of reading the current state. The item says why in one line - a
 * permission prompt on first load is the single most reliable way to teach people to click Block
 * for ever - and the cost of getting it wrong is permanent per browser profile: once denied, this
 * page cannot ask again, and the operator has to go into browser settings they will never find.
 *
 * Reading `Notification.permission` *is* done on mount, and is a different thing entirely: a
 * synchronous property read that shows nothing to anybody. The distinction is worth stating because
 * the two look alike in a diff.
 *
 * ## Sound without an asset
 *
 * A short two-tone chime, synthesised with `AudioContext`. No `.mp3` in the repository, nothing
 * fetched at runtime, and nothing added to the bundle but the twenty lines below - which is a better
 * trade than a binary asset for a sound that has to be under half a second and unobtrusive by
 * definition. It also means the sound cannot fail to load on a page whose network is the thing that
 * just broke.
 *
 * The honest limit: a browser's autoplay policy can refuse to start an `AudioContext` that has never
 * had a user gesture behind it. In practice the operator turned this on by clicking a switch, which
 * is that gesture - but after a reload with the preference already on, the first alert may be silent
 * until the operator clicks anything at all. `play()` failing is swallowed rather than surfaced:
 * there is nothing an operator can do about it and an error banner about a missed chime would be
 * louder than the chime.
 */

function currentPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  // A synchronous property read. Shows nothing, prompts nobody - see this module's own remarks for
  // why that distinction matters here more than anywhere else in the console.
  return Notification.permission;
}

function safeStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface AlertsApi {
  readonly settings: AlertSettings;
  readonly permission: NotificationPermissionState;
  /** Turns the sound on or off. No permission involved - see `alerts.ts` for why the two switches
   * are independent. */
  setSound: (on: boolean) => void;
  /**
   * The only path to a permission prompt in this console.
   *
   * Turning notifications **off** never prompts. Turning them **on** prompts only when the browser
   * has not already answered; if it has answered `denied`, the switch does not appear at all
   * (`AlertSettings.tsx`), because asking again is a call that resolves instantly with no UI.
   */
  enableNotifications: (on: boolean) => void;
  /** Fires whatever the decision allows, for one event. Safe to call for every push - it is the
   * decision that filters, not the caller. */
  fire: (reason: AlertReason, conversationId: string, visitorId: string | null) => void;
}

export interface UseAlertsOptions {
  /** Which conversation this tab has open. Read through a ref by the caller's own render, so a
   * handler installed once still sees the current value. */
  openConversationId: string | null;
  /** What clicking a notification should do. Given the conversation id it was fired for. */
  onOpenConversation: (conversationId: string) => void;
}

export function useAlerts({ openConversationId, onOpenConversation }: UseAlertsOptions): AlertsApi {
  // Read once, synchronously, from storage - not in an effect. A first render that showed both
  // switches off and then flipped them on would read as the console forgetting the operator's
  // choice every time they reload.
  const [settings, setSettings] = useState<AlertSettings>(() => readAlertSettings(safeStorage()));
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission);

  // `fire` is called from hub handlers that are installed once. Everything it reads therefore goes
  // through a ref, or it would close over the first render's values for the life of the connection -
  // the same trap `WorkspaceLayout` already documents for `openConversationIdRef`.
  const latest = useRef({ settings, permission, openConversationId, onOpenConversation });
  latest.current = { settings, permission, openConversationId, onOpenConversation };

  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const context = audioRef.current;
    return () => {
      void context?.close();
    };
  }, []);

  const persist = useCallback((next: AlertSettings) => {
    setSettings(next);
    writeAlertSettings(safeStorage(), next);
  }, []);

  const setSound = useCallback((on: boolean) => persist({ ...latest.current.settings, sound: on }), [persist]);

  const enableNotifications = useCallback(
    (on: boolean) => {
      if (!on) {
        persist({ ...latest.current.settings, notifications: false });
        return;
      }

      if (typeof Notification === "undefined") {
        return;
      }

      if (Notification.permission === "granted") {
        persist({ ...latest.current.settings, notifications: true });
        return;
      }

      // THE prompt. Reached only from a click on the switch - see this module's own remarks.
      void Notification.requestPermission().then((result) => {
        setPermission(result);
        // Only switched on if the operator actually said yes. Turning the switch on and being denied
        // must not leave a control that says "on" while nothing can ever fire.
        persist({ ...latest.current.settings, notifications: result === "granted" });
      });
    },
    [persist],
  );

  const playSound = useCallback(() => {
    try {
      audioRef.current ??= new AudioContext();
      const context = audioRef.current;
      // Resuming a context suspended by the autoplay policy. Fire-and-forget: if it stays suspended
      // the two nodes below simply produce nothing.
      void context.resume();

      const now = context.currentTime;
      const gain = context.createGain();
      // A short envelope rather than a square start and stop - an abrupt gain change is audible as a
      // click, which is a worse noise than the note.
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      gain.connect(context.destination);

      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.setValueAtTime(880, now + 0.12);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.36);
    } catch {
      // No AudioContext, or a policy that refuses to start one. Nothing an operator can act on.
    }
  }, []);

  const fire = useCallback(
    (reason: AlertReason, conversationId: string, visitorId: string | null) => {
      const state = latest.current;
      const decision = decideAlert({
        conversationId,
        openConversationId: state.openConversationId,
        // Read at the moment of the event rather than tracked in state: a `visibilitychange`
        // subscription would re-render the whole workspace every time the operator switches tabs,
        // for a value only ever needed right here.
        documentVisible: typeof document === "undefined" || document.visibilityState === "visible",
        settings: state.settings,
        permission: state.permission,
      });

      if (decision.sound) {
        playSound();
      }

      if (!decision.notify || typeof Notification === "undefined") {
        return;
      }

      try {
        const { title, body } = alertTextFor(reason, visitorId);
        const notification = new Notification(title, {
          body,
          // One notification per conversation: a visitor sending four messages replaces its own card
          // rather than stacking four. `tag` is what the platform uses to collapse them, and without
          // it a lunch break produces a wall of cards nobody reads.
          tag: `ago-conversation-${conversationId}`,
        });

        notification.onclick = () => {
          window.focus();
          state.onOpenConversation(conversationId);
          notification.close();
        };
      } catch {
        // Constructing a Notification throws on Android Chrome, where it must come from a service
        // worker. Nothing to tell the operator: the in-screen signals `11-06` shipped are unaffected.
      }
    },
    [playSound],
  );

  return { settings, permission, setSound, enableNotifications, fire };
}

export { ALERTS_OFF };
