import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getCurrentDocument, getDocumentVersion, type DocumentVersionResponse } from "../api/documentsApi.js";
import { ApiProblemError } from "../api/problemDetails.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, resolveTimeZone } from "../time/format.js";
import { AppShell, PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Alert } from "../components/Alert.js";

/**
 * `24-03`: the reading surface `24-02`'s published documents needed and never got one built for -
 * that item's own Out of scope named the console/widget renderers as "none of which this item
 * builds." A public, pre-account route (`/policies/:documentKey`), mounted outside every provider
 * exactly like `SignupPage`/`RedeemInvitePage` - the same reasoning applies verbatim: whoever reads
 * this has not accepted anything yet (`24-02`'s own Scope: "somebody who has not yet accepted
 * anything has no account to read it from"), so there is nothing here for `RequireAuth` to gate.
 *
 * `OnboardingPage`'s new "you agree to our terms" link (this same item) is the one real caller this
 * item builds, but the route also answers `24-02`'s own Done-when directly on its own terms: a
 * person who accepted v3 months ago can still be pointed at `/policies/{key}` and read what v3 said,
 * because a specific `?version=` query still resolves to that exact, immutable text
 * (`getDocumentVersion`, `documentsApi.ts`).
 *
 * <p><b>`23-37`: the `?version=` query is now read, not only supported.</b> `DocumentsPage`'s own
 * "read as a visitor would" link is the first real caller - both the current version (no query) and
 * a specific past one (`?version=v3`) route through this identical screen, so "what a tenant sees
 * when checking their own words" and "what a visitor actually sees" can never drift into two
 * different renderers.</p>
 *
 * <b>Rendered as plain, pre-wrapped text - never HTML, and no markdown parser.</b> `24-02`'s own
 * remarks say plainly that deciding a markup language for a document's body is "a future item's job,
 * not this one's" - this screen renders exactly what `24-02` promises to store: plain text or simple
 * markdown, shown as text either way. Introducing a markdown renderer here would be this item quietly
 * making that future call by accident; `white-space: pre-wrap` keeps the author's own line breaks
 * without asking a parser to interpret anything else in the string.
 */
export function PolicyPage() {
  const { documentKey } = useParams<{ documentKey: string }>();
  const [searchParams] = useSearchParams();
  const version = searchParams.get("version");
  const strings = useStrings();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; document: DocumentVersionResponse } | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    if (!documentKey) {
      setState({ status: "error", message: strings.policyPageNotFound });
      return;
    }

    // `23-37`: a `?version=` query resolves that exact, immutable version instead of "current" -
    // `getDocumentVersion`/`getCurrentDocument` share the identical response shape, so nothing else
    // in this component needs to branch on which one answered.
    const request = version ? getDocumentVersion(documentKey, version) : getCurrentDocument(documentKey);
    request
      .then((document) => {
        if (!cancelled) {
          setState({ status: "ready", document });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const message =
          err instanceof ApiProblemError && err.code === "Document.NotFound"
            ? strings.policyPageNotFound
            : strings.policyPageErrorGeneric;
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [documentKey, version, strings]);

  return (
    <AppShell>
      {state.status === "ready" ? (
        <>
          <PageHead
            title={state.document.title}
            description={
              `${strings.policyPagePublishedPrefix}` +
              `${formatAbsolute(new Date(state.document.publishedAt), resolveTimeZone(), strings)}` +
              `${strings.policyPageVersionSeparator}${state.document.version}`
            }
          />
          <Panel>
            <p style={{ whiteSpace: "pre-wrap" }}>{state.document.body}</p>
          </Panel>
        </>
      ) : (
        <>
          <PageHead title={documentKey ?? ""} />
          {state.status === "loading" ? <p>{strings.policyPageLoading}</p> : <Alert tone="danger">{state.message}</Alert>}
        </>
      )}
    </AppShell>
  );
}
