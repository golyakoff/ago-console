import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import {
  fetchOwnerSiteDetail,
  updateOwnerSiteAllowedOrigins,
  type OwnerSiteDetail,
  type OwnerSiteModule,
} from "../api/ownerApi.js";
import { en } from "../i18n/en.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavSections } from "../shell/consoleNav.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Field } from "../components/Field.js";
import { Panel } from "../components/Panel.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { Textarea } from "../components/Textarea.js";
import { formatAbsolute, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";
import {
  describeRecentWindow,
  formatByteSize,
  formatCount,
  formatModuleExpiry,
  formatModuleStatus,
  formatNoRecentActivity,
  formatRecentMessagesHeader,
} from "./ownerSites.js";

/** What the server has said so far about this caller's access to `23-14`'s endpoint, and whether the
 * named site exists at all - the same `OwnerAccess` shape `OwnerSitesPage` uses, plus `"not-found"`
 * for a real 404 (the platform owner may legitimately name a site that does not exist, which is a
 * different fact from "you may not see this"). */
type OwnerDetailAccess = "unknown" | "granted" | "refused" | "not-found";

/**
 * `23-14`: the platform owner's per-tenant detail read - `GET /api/v1/owner/sites/{siteId}`. The
 * drill-down `ui-inventory.md` §8.1 recorded as absent from `/owner`: the same eight facts
 * `OwnerSitesPage`'s table already shows for a page of sites, for exactly the one a row was clicked
 * for, plus that tenant's entitlements - which module it holds, whether the platform owner granted it
 * or the tenant enabled it themselves, and when each grant ends (or that it never does).
 *
 * **Read-only, exactly like its sibling.** `decisions.md` §6: granting or revoking stays a runbook
 * for now (`23-15`), because both writes need the deployment-wide provisioning secret in the request
 * body and a console form would put that secret in a browser. This screen adds no button that acts.
 *
 * **Mounted outside the operator layout**, the identical reasoning `OwnerSitesPage`'s own doc comment
 * gives: the platform owner may hold no `operators` row at all, so nothing here may assume one.
 *
 * **Deliberately hardcoded English**, matching `OwnerSitesPage` and `ui-inventory.md` §8.1's recorded
 * decision - `/owner` is not scoped to one tenant, so it cannot follow one tenant's language. This
 * page passes the built-in `en` table for its nav, exactly like its sibling, and writes every other
 * string in this file as plain English rather than calling `useStrings()`.
 */
export function OwnerSiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { user, logout } = useAuth();
  const { siteId: ownSiteId, hasPermission, enabledModules } = usePermissions();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerDetailAccess>("unknown");
  const [site, setSite] = useState<OwnerSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `23-48`: the allowed-origins editor's own state - a plain textarea draft (one origin per line)
  // rather than a dynamic list of text inputs, matching `OfflineAutoReplyPage`'s own "simplest
  // control that can hold the value" judgement for a small, rarely-edited list.
  const [originsDraft, setOriginsDraft] = useState("");
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [originsSaved, setOriginsSaved] = useState(false);
  const [originsSaving, setOriginsSaving] = useState(false);

  const timeZone = useMemo(() => resolveTimeZone(), []);

  useEffect(() => {
    if (!accessToken || !siteId) {
      // `RequireAuth` guarantees a signed-in user, and this route only ever mounts with a `:siteId`
      // segment (`App.tsx`) - the same "reaching here without one is a wiring bug" reasoning the
      // other pages state for their own preconditions.
      return;
    }

    let cancelled = false;
    fetchOwnerSiteDetail(accessToken, siteId)
      .then((outcome) => {
        if (cancelled) {
          return;
        }

        if (outcome.status === "not-authorized") {
          setAccess("refused");
          return;
        }

        if (outcome.status === "not-found") {
          setAccess("not-found");
          return;
        }

        setAccess("granted");
        setSite(outcome.site);
        setOriginsDraft(outcome.site.allowedOrigins.join("\n"));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Same "the API is broken" vs. "you may not see this" split every owner screen makes.
          setError(err instanceof Error ? err.message : "Failed to load this site's detail.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, siteId]);

  const moduleColumns = useMemo(() => buildModuleColumns(timeZone), [timeZone]);

  const handleSaveOrigins = () => {
    if (!accessToken || !siteId) {
      return;
    }

    // Blank lines are a typing artifact (an extra Enter at the end), not a value to send - dropped
    // client-side so the common case (paste, hit save) does not first bounce off the server's own
    // "an entry cannot be empty" guard for a line the person never meant as a real entry.
    const origins = originsDraft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setOriginsSaving(true);
    setOriginsError(null);
    setOriginsSaved(false);

    updateOwnerSiteAllowedOrigins(accessToken, siteId, origins)
      .then((outcome) => {
        if (outcome.status === "ok") {
          setSite((current) => (current ? { ...current, allowedOrigins: outcome.allowedOrigins } : current));
          setOriginsDraft(outcome.allowedOrigins.join("\n"));
          setOriginsSaved(true);
          return;
        }

        if (outcome.status === "invalid") {
          setOriginsError(outcome.message);
          return;
        }

        // `not-authorized`/`not-found` mid-session: the token expired, or the tenant was removed
        // while this screen was open - both genuinely unexpected here (the page itself already
        // proved `granted` and a real site to reach this form at all), so this is reported the same
        // plain way the page's own load-time `error` state is, not folded into the field-level
        // `originsError` a caller can fix by retyping.
        setError("This site could no longer be reached. Reload the page and try again.");
      })
      .catch((err: unknown) => {
        setOriginsError(err instanceof Error ? err.message : "Failed to save the allowed origins.");
      })
      .finally(() => {
        setOriginsSaving(false);
      });
  };

  return (
    <AppShell
      // The identical sections `OwnerSitesPage` builds - "Platform sites" stays present as
      // `pinnedItem` and, unlike that page's own `end: true`, is highlighted while on this sub-route
      // too (`end: false`): this screen is still part of the platform-sites section, one tenant deep
      // into it.
      sections={ownSiteId ? buildTenantNavSections(hasPermission, en, enabledModules ?? []) : []}
      // `23-43`: only once the server has actually accepted this caller, exactly as
      // `demoNoticeAudience` below already is. The demo console's operator login is published,
      // so anyone can sign in and type `/owner`; drawing a rail link to a view they were just
      // refused tells a stranger that a platform-operations view exists and where it lives.
      // "unknown" draws nothing either - a link that appears for a moment and then vanishes on
      // the refusal has already said it.
      pinnedItem={access === "granted" ? { to: "/owner", label: en.navPlatformSites, end: false } : undefined}
      // `23-45`: as OwnerSitesPage - see that file, and `PublicDemoNotice`'s own remarks.
      credentialsArePublished={false}
      wide
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening this tenant's detail…" />}

      {access === "refused" && (
        <>
          <PageHead title="Platform operations" />
          {/* `23-43`: says that the caller was refused, and no longer says by what. "Restricted to
              the platform owner" told a reader who is not one that such a role exists on this
              deployment - which on a console whose operator login is published means telling
              anybody. Refusing without naming the thing refused is the smaller disclosure and is
              equally true; the reader who *is* the owner never sees this branch. */}
          <Alert tone="danger" title="Not authorized">
            This view is not available to you. The server refused the request, so no site data was
            loaded.
          </Alert>
        </>
      )}

      {access === "not-found" && (
        <>
          <PageHead title="Platform sites" />
          <Alert tone="danger" title="No such site">
            No site matches this id. It may have been mistyped, or the tenant no longer exists.
          </Alert>
          <p>
            <Link to="/owner">Back to the site list</Link>
          </p>
        </>
      )}

      {error !== null && access !== "refused" && access !== "not-found" && (
        <>
          {access === "unknown" && <PageHead title="Platform sites" />}
          <Alert tone="danger">{error}</Alert>
        </>
      )}

      {access === "granted" && site !== null && (
        <>
          <PageHead
            title={site.name.trim().length > 0 ? site.name : "Unnamed site"}
            description={`Read-only - this screen shows this tenant's actual state, it changes nothing. Message volume and last activity cover ${describeRecentWindow(site.recentWindowDays)} - the window the API itself reports; seats, conversations and stored bytes are all-time.`}
          />

          <dl className="ago-owner-detail-facts">
            <div>
              <dt>Site id</dt>
              <dd>
                <Badge tone="neutral" mono>
                  {site.siteId}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>
                <Badge tone="neutral">{site.tier}</Badge>
              </dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>{formatCount(site.seatCount)}</dd>
            </div>
            <div>
              <dt>Conversations</dt>
              <dd>{formatCount(site.conversationCount)}</dd>
            </div>
            <div>
              <dt>{formatRecentMessagesHeader(site.recentWindowDays)}</dt>
              <dd>{formatCount(site.recentMessageCount)}</dd>
            </div>
            <div>
              <dt>Attachments</dt>
              <dd>
                <span title={`${formatCount(site.attachmentBytes)} bytes`}>
                  {formatByteSize(site.attachmentBytes)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{renderDateFact(site.createdAt, timeZone, "Not recorded", "This site predates the platform recording creation dates, so its creation date is genuinely unknown.")}</dd>
            </div>
            <div>
              <dt>Last activity</dt>
              <dd>
                {renderDateFact(
                  site.lastMessageAt,
                  timeZone,
                  formatNoRecentActivity(site.recentWindowDays),
                  `This is the most recent message within ${describeRecentWindow(site.recentWindowDays)} only. An older message may exist; the API does not report one, deliberately.`,
                )}
              </dd>
            </div>
          </dl>

          {/* `23-48`: the platform owner's own editor - the only place any of it may be changed at
              all. Neither the tenant's own console nor this screen's read-only entitlements table
              below gets a form; this is the one field on this page that writes anything. */}
          <Panel
            title="Allowed origins"
            description="The pages this tenant's widget is allowed to run on. Only the platform owner may change this - a tenant who needs a different address still has to ask."
          >
            <Field
              label="Origins, one per line"
              description="Scheme and host only - e.g. https://shop.example. No path, no trailing slash: this is compared literally against the browser's own Origin header."
              error={originsError}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  rows={4}
                  value={originsDraft}
                  onChange={(event) => {
                    setOriginsDraft(event.target.value);
                    setOriginsSaved(false);
                  }}
                />
              )}
            </Field>
            <p>
              <Button onClick={handleSaveOrigins} disabled={originsSaving}>
                {originsSaving ? "Saving…" : "Save allowed origins"}
              </Button>
            </p>
            {originsSaved && !originsError && (
              <Alert tone="success">Saved. The widget honours this on its very next request - no restart needed.</Alert>
            )}
          </Panel>

          <h2>Entitlements</h2>

          {/* The expiry warning, in words (`flows.md` 5.2, this item's own Done-when): `expiresAt`
              binds the granting side only. Chat stops offering a lapsed module the instant it
              expires, but the module itself is never told - so a screen presenting expiry as a clean
              end date would be lying to its own author. Shown once, above the table, rather than
              repeated per row. */}
          <Alert tone="info">
            An expiry date only stops chat from offering a module to this tenant - the module itself is
            never told when a grant lapses, and does not independently refuse a call it can still
            verify. "Expired" below means chat has stopped offering it, not that the module has been
            informed.
          </Alert>

          {site.modules.length === 0 ? (
            <p className="ago-empty">This tenant has no modules enabled.</p>
          ) : (
            <Table
              caption="Every module this tenant has ever had enabled, including any that have since expired."
              columns={moduleColumns}
              rows={site.modules}
              rowKey={(module) => module.moduleKey}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

/** `createdAt`/`lastMessageAt` share the identical "null means something specific, say what" shape
 * `OwnerSitesPage`'s own table columns already establish for these two fields - reused here rather
 * than re-derived, since drilling into a row must not disagree with what the row itself said. */
function renderDateFact(
  value: string | null,
  timeZone: string | null,
  emptyLabel: string,
  emptyTitle: string,
) {
  const parsed = parseInstant(value);
  if (parsed === null) {
    return (
      <span className="ago-meta" title={emptyTitle}>
        {emptyLabel}
      </span>
    );
  }

  return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
}

function buildModuleColumns(timeZone: string | null): TableColumn<OwnerSiteModule>[] {
  return [
    {
      key: "module",
      header: "Module",
      render: (module) => <Badge tone="neutral">{module.moduleKey}</Badge>,
    },
    {
      key: "triggerWords",
      header: "Trigger words",
      render: (module) => module.triggerWords.join(", "),
    },
    {
      key: "grantedBy",
      header: "Granted by",
      render: (module) => (
        // `23-14`'s own Done-when: a module the tenant enabled is distinguishable from one the owner
        // granted - never the same badge, never left to a tooltip alone to say the difference.
        <Badge tone={module.grantedByOwner ? "accent" : "neutral"}>
          {module.grantedByOwner ? "Platform owner" : "Tenant"}
        </Badge>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      render: (module) => {
        const explicit = formatModuleExpiry(module.expiresAt);
        if (explicit !== null) {
          // A grant with no expiry renders as an explicit statement, never a blank cell.
          return <span className="ago-meta">{explicit}</span>;
        }

        const parsed = parseInstant(module.expiresAt);
        if (parsed === null) {
          // Unreachable in practice (formatModuleExpiry already handled null), but a garbled value
          // has nothing truthful to render either - the same defensive shape the site list's own
          // date columns use.
          return <span className="ago-meta">Unknown</span>;
        }

        return <span title={formatAbsolute(parsed, timeZone)}>{formatDateStamp(parsed, timeZone)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (module) => (
        // Rendered directly from the server's own `isActive` - matching what the live read-store
        // query already decided, never recomputed here by comparing `expiresAt` against this
        // browser's own clock (this item's own Done-when).
        <Badge tone={module.isActive ? "success" : "danger"}>{formatModuleStatus(module.isActive)}</Badge>
      ),
    },
  ];
}
