import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { operatorDisplayName } from "../auth/operatorDisplayName.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { fetchOwnerSiteDetail, type OwnerSiteDetail, type OwnerSiteModule } from "../api/ownerApi.js";
import { en } from "../i18n/en.js";
import { AppShell, PageHead, ShellIdentity } from "../shell/AppShell.js";
import { buildTenantNavItems } from "../shell/consoleNav.js";
import { Alert } from "../components/Alert.js";
import { Badge } from "../components/Badge.js";
import { Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
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
  const { siteId: ownSiteId, hasPermission } = usePermissions();
  const accessToken = user?.access_token;

  const [access, setAccess] = useState<OwnerDetailAccess>("unknown");
  const [site, setSite] = useState<OwnerSiteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AppShell
      // The identical nav `OwnerSitesPage` builds - "Platform sites" stays present and, unlike that
      // page's own `end: true`, is highlighted while on this sub-route too (`end: false`): this
      // screen is still part of the platform-sites section, one tenant deep into it.
      nav={[
        ...(ownSiteId ? buildTenantNavItems(hasPermission, en) : []),
        { to: "/owner", label: en.navPlatformSites, end: false },
      ]}
      demoNoticeAudience={access === "granted" ? "platform-owner" : "shared-login"}
      wide
      tagline={en.consoleTaglineOwner}
      identity={
        <ShellIdentity operator={operatorDisplayName(user)} siteId={ownSiteId} onSignOut={() => void logout()} />
      }
    >
      {access === "unknown" && error === null && <Spinner label="Opening this tenant's detail…" />}

      {access === "refused" && (
        <>
          <PageHead title="Platform operations" />
          <Alert tone="danger" title="Not authorized">
            This view is restricted to the platform owner. The server refused the request, so no site
            data was loaded.
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
