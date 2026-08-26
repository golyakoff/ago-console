import type { AlertsApi } from "./useAlerts.js";

export interface AlertSettingsProps {
  alerts: AlertsApi;
}

/**
 * `18-05`: the two switches, and the truthful thing to say when one of them cannot be offered.
 *
 * ## Why two switches and not one with a sub-option
 *
 * The item states the reason and it is a real one: the audiences barely overlap. An operator in an
 * open-plan room wants the card and not the noise; one with the console on a second monitor wants
 * the noise and not a card over their work. A single "alerts" switch with a "and make a sound"
 * child implies sound is a refinement of notification, which would make the second operator turn on
 * a thing they do not want in order to get the thing they do.
 *
 * ## The three states, and the fourth
 *
 * `Notification.permission` has three values and this renders a different thing for each, plus a
 * fourth for browsers that have no `Notification` at all:
 *
 * - **`default`** - the switch is offered, and turning it on is what triggers the one permission
 *   prompt this console ever shows. The label says so, because a switch that unexpectedly summons a
 *   browser dialog is how people learn to click Block.
 * - **`granted`** - an ordinary switch.
 * - **`denied`** - <b>no switch at all.</b> `requestPermission()` resolves instantly with `"denied"`
 *   and shows nothing, so a control here would appear to work and silently do nothing for ever -
 *   which is worse than not offering it. What is rendered instead is a sentence saying the block is
 *   the browser's, not the console's, and that it can only be undone in browser settings. That is
 *   the truth and it is also the only actionable thing left to say.
 * - **`unsupported`** - `Notification` is simply absent (iOS Safari, and any page not on a secure
 *   origin). Same shape as `denied`, different sentence, because "your browser blocked this" would
 *   be a lie about a browser that has no such feature.
 *
 * ## No twelfth component
 *
 * A checkbox is a `<label>` wrapping an `<input type="checkbox">`, and `adr/0030` closes the shared
 * component set at eleven. `Field` is the wrong shape for it (label-before-control with a
 * description slot, built for text entry), and adding a `Switch` to the set would be a design-system
 * decision taken as a side effect of a shortcuts item. Local markup with local styles, and the
 * decision left where it belongs.
 */
export function AlertSettings({ alerts }: AlertSettingsProps) {
  const { settings, permission, setSound, enableNotifications } = alerts;

  return (
    <div className="ago-alert-settings">
      <p className="ago-meta">
        Both are off until you turn them on, and neither fires for the conversation you already have
        open on a visible tab.
      </p>

      {permission === "denied" && (
        <p className="ago-alert-settings__blocked" role="note">
          Your browser is blocking notifications for this site. The console cannot ask again — turn
          them back on in the browser&rsquo;s own site settings, then reload this page. The sound
          below works regardless.
        </p>
      )}

      {permission === "unsupported" && (
        <p className="ago-alert-settings__blocked" role="note">
          This browser does not offer desktop notifications on this page. The sound below works
          regardless.
        </p>
      )}

      {(permission === "default" || permission === "granted") && (
        <label className="ago-switch">
          <input
            type="checkbox"
            checked={settings.notifications}
            onChange={(event) => enableNotifications(event.target.checked)}
          />
          <span className="ago-switch__text">
            <span className="ago-switch__label">Desktop notifications</span>
            <span className="ago-meta">
              {permission === "default"
                ? "Turning this on asks the browser for permission."
                : "A card when a conversation needs you. Never the message text."}
            </span>
          </span>
        </label>
      )}

      <label className="ago-switch">
        <input type="checkbox" checked={settings.sound} onChange={(event) => setSound(event.target.checked)} />
        <span className="ago-switch__text">
          <span className="ago-switch__label">Sound</span>
          <span className="ago-meta">A short chime. Needs no permission.</span>
        </span>
      </label>
    </div>
  );
}
