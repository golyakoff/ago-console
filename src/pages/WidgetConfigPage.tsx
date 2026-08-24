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
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";

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
 *
 * `11-05` landed after this screen and adopts it, per that item's own "whichever lands second adopts
 * the other's result" note: restyled onto the shell and the component set, with the entry point that
 * `11-02` added to `QueuePage` folded into the shell's permission-gated navigation - the same
 * `usePermissions()` gate, in one place instead of two. The screen's own internal gate above is
 * untouched and remains what stops a direct URL from rendering the form.
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
    return <Spinner label="Checking your permissions…" />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title="Widget appearance" />
        {/* `role="alert"` preserved through `Alert tone="danger"` - see `AdminConversationsPage`'s
            identical branch. */}
        <Alert tone="danger">You do not have permission to configure this site&apos;s widget.</Alert>
        <p>
          <Link to="/">Back to queue</Link>
        </p>
      </>
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
    <>
      <PageHead
        title="Widget appearance"
        /* `adr/0029`: config is read once, at bootstrap - stated here so the operator making the
           change knows why an already-open visitor tab will not reflect it immediately. */
        description="Changes here take effect the next time a visitor's page loads the widget. A visitor who already has the widget open on their page will not see the new color or position until they reload it."
      />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {current === null && !loadError ? (
        <Panel>
          <Skeleton lines={3} label="Loading the widget configuration…" />
        </Panel>
      ) : (
        <Panel title="Launcher">
          <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
            <Field
              label="Primary color (hex, optional)"
              description="Leave empty to use the widget's own built-in default."
              error={validationError}
              adornment={
                <span
                  className="ago-widget-swatch"
                  aria-hidden="true"
                  title="Preview"
                  // The one inline style left in the console, and it has to be: the value is the
                  // operator's own live input, so it cannot come from a token or a class. Its
                  // dimensions and border moved into `.ago-widget-swatch` in `index.css`; only the
                  // colour itself stays here.
                  style={{ background: swatchColor }}
                />
              }
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  placeholder="#2F6FED"
                  disabled={submitting}
                />
              )}
            </Field>

            <Field label="Launcher position">
              {(controlProps) => (
                <Select
                  {...controlProps}
                  value={position}
                  onChange={(e) => setPosition(e.target.value as WidgetPosition)}
                  disabled={submitting}
                >
                  <option value="BottomRight">{POSITION_LABELS.BottomRight}</option>
                  <option value="BottomLeft">{POSITION_LABELS.BottomLeft}</option>
                </Select>
              )}
            </Field>

            {submitError && <Alert tone="danger">{submitError}</Alert>}
            {/* Was a bare `<p>Saved.</p>` with no live-region role at all before `11-05` - `Alert
                tone="success"` gives it `role="status"`, polite rather than assertive, so it is
                announced without interrupting. */}
            {saved && <Alert tone="success">Saved.</Alert>}

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
