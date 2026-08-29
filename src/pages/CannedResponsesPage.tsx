import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchCannedResponses, updateCannedResponses, CannedResponsesError } from "../api/cannedResponsesApi.js";
import {
  MAX_RESPONSES,
  toRequestResponses,
  validateDraft,
  type DraftResponse,
} from "./cannedResponsesValidation.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";

const EMPTY_RESPONSE: DraftResponse = { title: "", body: "" };

/**
 * `18-03`: `/settings/canned-responses` - the tenant's own library of prepared answers, editable by
 * whoever already holds `site:configure`, and the source the composer's picker (`Composer.tsx`) reads
 * once per workspace mount.
 *
 * <p>Gated exactly the way `OfflineAutoReplyPage`/`WidgetConfigPage` established: `usePermissions()`
 * decides whether to render the form at all (client-side, UX only), while `ago-chat`'s server-side
 * `site:configure` check on both `GET` and `PUT` is the actual gate. An operator who reaches this
 * route some other way still gets a real `403`, surfaced as text rather than hidden.</p>
 *
 * <p>Same editor shape as `OfflineAutoReplyPage`'s rule list, deliberately: one blank row kept at the
 * bottom to type into, dropped on save. Order is preserved because the operator arranged it, not
 * because it is behaviour - unlike the auto-reply screen's keyword rules, nothing here is matched
 * against anything; see `CannedResponse`'s own doc comment (`ago-chat`) for the full reasoning behind
 * why this is a separate screen and a separate store rather than that one reused.</p>
 */
export function CannedResponsesPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [loaded, setLoaded] = useState(false);
  const [responses, setResponses] = useState<DraftResponse[]>([EMPTY_RESPONSE]);
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

    fetchCannedResponses(accessToken, siteId)
      .then((dtos) => {
        setResponses([...dtos, EMPTY_RESPONSE]);
        setLoaded(true);
        setLoadError(null);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof CannedResponsesError ? err.message : strings.cannedResponsesLoadError),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return (
      <>
        <PageHead title={strings.navCannedResponses} />
        <Alert tone="danger">{strings.cannedResponsesForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  const editResponse = (index: number, patch: Partial<DraftResponse>) => {
    setResponses((current) => {
      const next = current.map((r, i) => (i === index ? { ...r, ...patch } : r));
      // Always one blank row to type into, and never two.
      const last = next[next.length - 1];
      if (
        last &&
        (last.title.trim().length > 0 || last.body.trim().length > 0) &&
        next.length < MAX_RESPONSES + 1
      ) {
        next.push(EMPTY_RESPONSE);
      }

      return next;
    });
  };

  const removeResponse = (index: number) => {
    setResponses((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length === 0 ? [EMPTY_RESPONSE] : next;
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const problem = validateDraft(responses, strings);
    setValidationError(problem);
    if (problem !== null) {
      return;
    }

    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in session and `siteId` arrives on the same response
      // `hasPermission` above depends on - same "reaching here is a wiring bug" reasoning
      // `OfflineAutoReplyPage`/`WidgetConfigPage` state for their own equivalent check.
      return;
    }

    setSubmitting(true);
    try {
      const dtos = await updateCannedResponses(accessToken, siteId, toRequestResponses(responses));
      setResponses([...dtos, EMPTY_RESPONSE]);
      setSaved(true);
    } catch (err) {
      setSubmitError(err instanceof CannedResponsesError ? err.message : strings.cannedResponsesSubmitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead
        title={strings.navCannedResponses}
        /* Stated on the screen because the composer's own trigger ("/") is otherwise invisible until
           an operator stumbles onto it - the same "state the surprising property" discipline
           `autoReplyDescription` uses for its own screen. */
        description={strings.cannedResponsesDescription}
      />

      {loadError && <Alert tone="danger">{loadError}</Alert>}

      {!loaded && !loadError ? (
        <Panel>
          <Skeleton lines={3} label={strings.cannedResponsesLoadingLabel} />
        </Panel>
      ) : (
        <Panel title={strings.cannedResponsesPanelTitle}>
          <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
            <fieldset className="ago-stack">
              <legend>{strings.cannedResponsesListLegend}</legend>
              <p>{strings.cannedResponsesListIntro}</p>
              {responses.map((response, index) => (
                // Index as the key: these rows have no id of their own, and the list is only ever
                // edited in place or truncated - never reordered by the UI - the same reasoning
                // `OfflineAutoReplyPage` gives for its identical row shape.
                <div className="ago-row ago-row--align-end" key={index}>
                  <Field label={`${strings.cannedResponsesTitleLabelPrefix} ${index + 1}`}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        value={response.title}
                        onChange={(e) => editResponse(index, { title: e.target.value })}
                        placeholder={strings.cannedResponsesTitlePlaceholder}
                        disabled={submitting}
                      />
                    )}
                  </Field>
                  <Field label={`${strings.cannedResponsesBodyLabelPrefix} ${index + 1}`}>
                    {(controlProps) => (
                      <Textarea
                        {...controlProps}
                        rows={2}
                        value={response.body}
                        onChange={(e) => editResponse(index, { body: e.target.value })}
                        placeholder={strings.cannedResponsesBodyPlaceholder}
                        disabled={submitting}
                      />
                    )}
                  </Field>
                  <Button
                    type="button"
                    onClick={() => removeResponse(index)}
                    disabled={submitting}
                    aria-label={`${strings.cannedResponsesRemoveButtonAriaPrefix} ${index + 1}`}
                  >
                    {strings.cannedResponsesRemoveButton}
                  </Button>
                </div>
              ))}
            </fieldset>

            {validationError && <Alert tone="danger">{validationError}</Alert>}
            {submitError && <Alert tone="danger">{submitError}</Alert>}
            {saved && <Alert tone="success">{strings.siteConfigSavedAlert}</Alert>}

            <div className="ago-row">
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? strings.siteConfigSavingButton : strings.siteConfigSaveButton}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
