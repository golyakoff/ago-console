import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchSiteConsentAcceptances,
  fetchSiteConsentDocuments,
  publishSiteConsentDocument,
  SiteConsentDocumentsError,
  type ConsentPurpose,
  type SiteConsentAcceptanceDto,
  type SiteConsentDocumentSummary,
  type SiteConsentDocumentsDto,
} from "../api/siteConsentDocumentsApi.js";
import { PageHead } from "../shell/AppShell.js";
import { AccessRefusal } from "../shell/accessRefusal.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, resolveTimeZone } from "../time/format.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-37`: `/account/documents` - the screen `24-05`'s own "What is not built" names by number. A
 * tenant reads their own two consent documents (`Contact`/`Marketing`), publishes a new version,
 * reads a published version exactly as a visitor would, and sees who accepted which version and when.
 *
 * <p>Gated the way `OfflineAutoReplyPage`/`WidgetConfigPage` already are: `usePermissions()` decides
 * whether to render the form at all (client-side, UX only), while the server's own `site:configure`
 * check on every route behind this screen (`SiteConsentDocumentEndpoints`, `ago-chat`) is the actual
 * gate.</p>
 *
 * <p><b>Two design choices this item's own report names, made here rather than left implicit:</b>
 * <see cref="ConsentDocumentPanel" /> never lets a caller believe a published document binds anyone
 * on its own - `Contact`'s badge names the widget setting that actually enforces it and states
 * whether this site has turned it on; `Marketing`'s note says plainly that it never gates anything.
 * And the "who accepted" table never shows the client IP or user agent the record also holds - see
 * `SiteConsentAcceptanceDto`'s own remarks in `ago-chat` for why.</p>
 */
export function DocumentsPage() {
  const { user } = useAuth();
  const { permissions, siteId, hasPermission } = usePermissions();
  const strings = useStrings();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; documents: SiteConsentDocumentsDto }
  >({ status: "loading" });

  const load = useCallback(() => {
    const accessToken = user?.access_token;
    if (!accessToken || !siteId) {
      return;
    }

    setState({ status: "loading" });
    fetchSiteConsentDocuments(accessToken, siteId)
      .then((documents) => setState({ status: "ready", documents }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof SiteConsentDocumentsError ? err.message : strings.documentsPageLoadError,
        }),
      );
  }, [user?.access_token, siteId, strings]);

  useEffect(() => {
    if (!hasPermission("site:configure")) {
      return;
    }
    // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
    // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
    // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
    // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
    // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
    // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
    // request happen" by accident rather than by decision.
    //
    // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
    // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
    // This marks the one site that is deliberate and leaves the rest of the file an error again.
    //
    // Loads the site's own documents.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("site:configure")) {
    return <AccessRefusal title={strings.navAccountDocuments} message={strings.documentsPageForbidden} strings={strings} />;
  }

  return (
    <>
      <PageHead title={strings.navAccountDocuments} description={strings.documentsPageIntro} />

      {state.status === "loading" && (
        <Panel>
          <Skeleton lines={3} label={strings.documentsPageLoadingLabel} />
        </Panel>
      )}

      {state.status === "error" && <Alert tone="danger">{state.message}</Alert>}

      {state.status === "ready" && siteId && (
        <>
          <ConsentDocumentPanel
            siteId={siteId}
            accessToken={user.access_token}
            purpose="Contact"
            summary={state.documents.contact}
            badge={
              state.documents.contactConsentRequired
                ? strings.documentsContactRequiredBadge
                : strings.documentsContactNotRequiredBadge
            }
            badgeTone={state.documents.contactConsentRequired ? "info" : "danger"}
            title={strings.documentsContactPanelTitle}
            onPublished={load}
            strings={strings}
          />
          <ConsentDocumentPanel
            siteId={siteId}
            accessToken={user.access_token}
            purpose="Marketing"
            summary={state.documents.marketing}
            badge={strings.documentsMarketingNeverRequiredNote}
            badgeTone="info"
            title={strings.documentsMarketingPanelTitle}
            onPublished={load}
            strings={strings}
          />
        </>
      )}
    </>
  );
}

interface ConsentDocumentPanelProps {
  siteId: string;
  accessToken: string;
  purpose: ConsentPurpose;
  summary: SiteConsentDocumentSummary;
  badge: string;
  badgeTone: "info" | "danger";
  title: string;
  onPublished: () => void;
  strings: ConsoleStrings;
}

function ConsentDocumentPanel({
  siteId,
  accessToken,
  purpose,
  summary,
  badge,
  badgeTone,
  title,
  onPublished,
  strings,
}: ConsentDocumentPanelProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptancesOpen, setAcceptancesOpen] = useState(false);

  const current = summary.versions[0] ?? null;
  const tz = resolveTimeZone();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(null);

    const trimmedTitle = draftTitle.trim();
    const trimmedBody = draftBody.trim();
    if (trimmedTitle.length === 0) {
      setValidationError(strings.documentsPublishValidationTitleRequired);
      return;
    }
    if (trimmedBody.length === 0) {
      setValidationError(strings.documentsPublishValidationBodyRequired);
      return;
    }
    setValidationError(null);

    setSubmitting(true);
    try {
      await publishSiteConsentDocument(accessToken, siteId, purpose, trimmedTitle, trimmedBody);
      setDraftTitle("");
      setDraftBody("");
      setSaved(true);
      onPublished();
    } catch (err) {
      setSubmitError(err instanceof SiteConsentDocumentsError ? err.message : strings.documentsPublishError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel title={title}>
      <div className="ago-stack">
        <Alert tone={badgeTone}>{badge}</Alert>

        <div>
          <strong>{strings.documentsCurrentVersionLabel}</strong>{" "}
          {current ? (
            <>
              {current.title} ({current.version}, {formatAbsolute(new Date(current.publishedAt), tz, strings)}){" "}
              <a href={`/policies/${encodeURIComponent(summary.documentKey)}`} target="_blank" rel="noreferrer">
                {strings.documentsReadAsVisitorLink}
              </a>
            </>
          ) : (
            strings.documentsNoVersionsYet
          )}
        </div>

        {summary.versions.length > 1 && (
          <details>
            <summary>{strings.documentsVersionsHeading}</summary>
            <ul>
              {summary.versions.map((v) => (
                <li key={v.version}>
                  {v.version} - {v.title} ({formatAbsolute(new Date(v.publishedAt), tz, strings)}){" "}
                  <a
                    href={`/policies/${encodeURIComponent(summary.documentKey)}?version=${encodeURIComponent(v.version)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {strings.documentsReadAsVisitorLink}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <form className="ago-stack" onSubmit={(e) => void handleSubmit(e)}>
          <Field label={strings.documentsPublishFormTitleLabel}>
            {(controlProps) => (
              <Input
                {...controlProps}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder={strings.documentsPublishFormTitlePlaceholder}
                disabled={submitting}
              />
            )}
          </Field>
          <Field label={strings.documentsPublishFormBodyLabel}>
            {(controlProps) => (
              <Textarea
                {...controlProps}
                rows={6}
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder={strings.documentsPublishFormBodyPlaceholder}
                disabled={submitting}
              />
            )}
          </Field>

          {validationError && <Alert tone="danger">{validationError}</Alert>}
          {submitError && <Alert tone="danger">{submitError}</Alert>}
          {saved && <Alert tone="success">{strings.documentsPublishSuccessAlert}</Alert>}

          <div className="ago-row">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? strings.documentsPublishingButton : strings.documentsPublishButton}
            </Button>
          </div>
        </form>

        <div>
          <Button type="button" variant="secondary" onClick={() => setAcceptancesOpen((open) => !open)}>
            {acceptancesOpen ? strings.documentsAcceptancesToggleHide : strings.documentsAcceptancesToggleShow}
          </Button>
          {acceptancesOpen && (
            <AcceptancesList siteId={siteId} accessToken={accessToken} purpose={purpose} strings={strings} />
          )}
        </div>
      </div>
    </Panel>
  );
}

function AcceptancesList({
  siteId,
  accessToken,
  purpose,
  strings,
}: {
  siteId: string;
  accessToken: string;
  purpose: ConsentPurpose;
  strings: ConsoleStrings;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; acceptances: SiteConsentAcceptanceDto[] }
  >({ status: "loading" });
  const tz = resolveTimeZone();

  useEffect(() => {
    let cancelled = false;
    // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
    // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
    // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
    // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
    // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
    // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
    // request happen" by accident rather than by decision.
    //
    // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
    // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
    // This marks the one site that is deliberate and leaves the rest of the file an error again.
    //
    // Loads one document's acceptances, in the nested list. The same shape one level down: splitting it from its parent would give a single screen two loading behaviours.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    fetchSiteConsentAcceptances(accessToken, siteId, purpose)
      .then((acceptances) => {
        if (!cancelled) {
          setState({ status: "ready", acceptances });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof SiteConsentDocumentsError ? err.message : strings.documentsAcceptancesLoadError,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, siteId, purpose, strings]);

  if (state.status === "loading") {
    return <Skeleton lines={2} label={strings.documentsAcceptancesLoadingLabel} />;
  }

  if (state.status === "error") {
    return <Alert tone="danger">{state.message}</Alert>;
  }

  return (
    <div className="ago-stack">
      <p>{strings.documentsAcceptancesPrivacyNote}</p>
      {state.acceptances.length === 0 ? (
        <p>{strings.documentsAcceptancesEmpty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{strings.documentsAcceptancesColumnSubject}</th>
              <th>{strings.documentsAcceptancesColumnVersion}</th>
              <th>{strings.documentsAcceptancesColumnAcceptedAt}</th>
            </tr>
          </thead>
          <tbody>
            {state.acceptances.map((a, i) => (
              <tr key={`${a.subjectId}-${a.documentVersion}-${i}`}>
                <td>
                  <code>{a.subjectId}</code>
                </td>
                <td>{a.documentVersion}</td>
                <td>{formatAbsolute(new Date(a.acceptedAt), tz, strings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
