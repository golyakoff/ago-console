import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchWidgetConfig,
  updateWidgetConfig,
  WidgetConfigError,
  type WidgetConfigDto,
  type WidgetPosition,
} from "../api/widgetConfigApi.js";
import { isValidHexColor } from "./widgetConfigValidation.js";

const POSITION_LABELS: Record<WidgetPosition, string> = {
  BottomRight: "Bottom right",
  BottomLeft: "Bottom left",
};

const DEFAULT_SWATCH_COLOR = "#2f6fed";

/**
 * `11-02`: `/settings/widget` - the console's first tenant self-service configuration screen.
 * `adr/0023` names "tenant self-service configuration, starting with `6-03`'s webhook endpoint
 * registration and delivery history" as one of the three surfaces that justified React, but `6-03`
 * shipped only the API and explicitly deferred its own UI as future work. That UI still does not
 * exist, so this screen - not `6-03`'s eventual follow-up - is the first tenant self-service
 * configuration screen actually built in `ago-console`.
 *
 * Gated the same way `AdminConversationsPage` already established: `usePermissions()` decides whether
 * to render the form at all (client-side, UX only - the entry point in `QueuePage` is hidden the same
 * way) while `11-01`'s own server-side `site:configure` check on both `GET`/`PUT` is the actual gate.
 * An operator who reaches this route some other way without the permission still gets a real `403`
 * from the fetch, surfaced as `loadError`/`submitError` text, never hidden as if the call had
 * succeeded.
 */
export function WidgetConfigPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const [current, setCurrent] = useState<WidgetConfigDto | null>(null);
  const [colorInput, setColorInput] = useState("");
  const [position, setPosition] = useState<WidgetPosition>("BottomRight");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    fetchWidgetConfig(accessToken, siteId)
      .then((dto) => {
        setCurrent(dto);
        setColorInput(dto.primaryColorHex ?? "");
        setPosition(dto.position);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof WidgetConfigError ? err.message : "Failed to load the widget configuration."),
      );
  }, [user?.access_token, siteId]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <p>Loading…</p>;
  }

  if (!hasPermission("site:configure")) {
    return (
      <div>
        <p role="alert">You do not have permission to configure this site's widget.</p>
        <p>
          <Link to="/">Back to queue</Link>
        </p>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const trimmed = colorInput.trim();
    // UX-only - `11-01`'s `UpdateWidgetConfigHandler` is the real, authoritative gate
    // (`widgetConfigValidation.ts`'s own doc comment has the detail). An empty value means "no
    // override, use the widget's own built-in default", matching `WidgetConfig.PrimaryColorHex`'s own
    // nullable semantics (`Ago.Chat.Domain`).
    if (trimmed.length > 0 && !isValidHexColor(trimmed)) {
      setValidationError("Color must look like a hex value, e.g. #2F6FED.");
      return;
    }
    setValidationError(null);

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in session, and `siteId` arrives on the same response
      // `hasPermission` above already depends on - same "reaching here is a wiring bug" reasoning
      // `OnboardingPage`/`PermissionsProvider` already state for their own equivalent checks.
      return;
    }

    setSubmitting(true);
    try {
      const dto = await updateWidgetConfig(accessToken, siteId, {
        primaryColorHex: trimmed.length > 0 ? trimmed : null,
        position,
      });
      setCurrent(dto);
      setColorInput(dto.primaryColorHex ?? "");
      setPosition(dto.position);
      setSaved(true);
    } catch (err) {
      setSubmitError(err instanceof WidgetConfigError ? err.message : "Failed to save the widget configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const swatchColor = isValidHexColor(colorInput.trim()) ? colorInput.trim() : DEFAULT_SWATCH_COLOR;

  return (
    <div>
      <p>
        <Link to="/">Back to queue</Link>
      </p>
      <h2>Widget appearance</h2>
      {/* `adr/0029`: config is read once, at bootstrap - stated here so the operator making the
          change knows why an already-open visitor tab will not reflect it immediately. */}
      <p>
        Changes here take effect the next time a visitor's page loads the widget. A visitor who already
        has the widget open on their page will not see the new color or position until they reload it.
      </p>

      {loadError && <p role="alert">{loadError}</p>}

      {current === null && !loadError ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label>
              Primary color (hex, optional)
              <input
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
                placeholder="#2F6FED"
                disabled={submitting}
              />
            </label>
            <span
              aria-hidden="true"
              title="Preview"
              style={{
                display: "inline-block",
                width: "1.5rem",
                height: "1.5rem",
                marginLeft: "0.5rem",
                verticalAlign: "middle",
                borderRadius: "50%",
                border: "1px solid #d1d5db",
                background: swatchColor,
              }}
            />
          </div>
          <div>
            <label>
              Launcher position
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as WidgetPosition)}
                disabled={submitting}
              >
                <option value="BottomRight">{POSITION_LABELS.BottomRight}</option>
                <option value="BottomLeft">{POSITION_LABELS.BottomLeft}</option>
              </select>
            </label>
          </div>
          {validationError && <p role="alert">{validationError}</p>}
          {submitError && <p role="alert">{submitError}</p>}
          {saved && <p>Saved.</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
